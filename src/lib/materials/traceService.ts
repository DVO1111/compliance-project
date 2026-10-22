/**
 * Traceability — forward from a lot, backward from a batch.
 *
 * ── THERE IS NO GENEALOGY FUNCTION, AND THE RELATIONSHIPS EXIST ──
 *
 * W5·13 (Genealogy trace) was never built, so nothing in the schema
 * answers "which batches used this lot". The links are all there
 * though: dispensing_records carries material_lot_id and
 * batch_stage_id, and batch_stages carries batch_id. Walking those two
 * joins IS the genealogy.
 *
 * So this is derived from real relationships rather than from a
 * purpose-built function — which the design's own brief asks for:
 * traceability must reflect the relationships between records rather
 * than display unrelated examples.
 *
 * WHAT IT CANNOT DO, said here rather than discovered later. It traces
 * through DISPENSING only. A lot consumed some other way — reworked,
 * sampled to destruction, transferred between sites — leaves no
 * dispensing record and so does not appear. A genuine genealogy
 * function would walk every consumption path; this walks the one the
 * schema records, and the screen says so.
 *
 * Both directions fail to an EMPTY list rather than throwing, and the
 * caller is told whether the read succeeded, because "nothing used
 * this lot" and "we could not find out" are different answers and only
 * one of them is safe to act on.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';

export interface TraceLink {
  /** The batch a lot went into, or that consumed a lot. */
  batchId: string;
  batchNumber: string | null;
  batchStatus: string | null;
  /** What the batch makes. The name on the carton, for a recall notice. */
  productName: string | null;
  /** The lot, for a backward trace. */
  lotId: string;
  lotNumber: string | null;
  /**
   * Who supplied the lot, and THEIR reference for it.
   *
   * supplierLotNumber is not a duplicate of lotNumber. The internal
   * number is ours; the supplier's is what a recall notice from the
   * other direction names, and what somebody ringing the supplier has
   * to quote. Tracing upstream without it means tracing to a company
   * and not to a consignment.
   */
  supplierName: string | null;
  supplierLotNumber: string | null;
  /** How much of this lot went into that batch. */
  quantity: number | null;
  unit: string | null;
  /** When it was dispensed, where recorded. */
  dispensedAt: string | null;
}

export interface TraceResult {
  links: TraceLink[];
  /** False when the read failed — not the same as "no links". */
  ok: boolean;
}

const EMPTY: TraceResult = { links: [], ok: false };

/**
 * Forward: which batches this lot went into.
 *
 * The question asked during a recall — "where did this material go".
 */
export async function batchesFromLot(lotId: string): Promise<TraceResult> {
  try {
    const { data, error } = await supabase
      .from('dispensing_records')
      .select('id, dispensed_at, actual_quantity, unit, material_lot_id, batch_stages!inner(batch_id)')
      .eq('material_lot_id', lotId);
    if (error) { logger.error('traceService.batchesFromLot', error); return EMPTY; }

    const rows = (data ?? []) as unknown as {
      dispensed_at: string | null;
      actual_quantity: number | null;
      unit: string | null;
      material_lot_id: string;
      batch_stages?: { batch_id?: string } | null;
    }[];

    const batchIds = [...new Set(
      rows.map((r) => r.batch_stages?.batch_id).filter((b): b is string => !!b),
    )];
    //  Both sides, because a forward trace is read during a recall and
    //  the two questions arrive together: which batches, and which
    //  consignment of ours was it.
    const [batches, lots] = await Promise.all([
      batchDetails(batchIds),
      lotDetails([lotId]),
    ]);
    const lot = lots.get(lotId);

    return {
      ok: true,
      links: rows
        .filter((r) => r.batch_stages?.batch_id)
        .map((r) => {
          const b = batches.get(r.batch_stages!.batch_id!);
          return {
            batchId: r.batch_stages!.batch_id!,
            batchNumber: b?.batch_number ?? null,
            batchStatus: b?.status ?? null,
            productName: b?.product_name ?? null,
            lotId: r.material_lot_id,
            lotNumber: lot?.lot_number ?? null,
            supplierName: lot?.supplier_name ?? null,
            supplierLotNumber: lot?.supplier_batch_number ?? null,
            quantity: r.actual_quantity,
            unit: r.unit,
            dispensedAt: r.dispensed_at,
          };
        }),
    };
  } catch (e) {
    logger.error('traceService.batchesFromLot threw', { error: String(e) });
    return EMPTY;
  }
}

/**
 * Backward: which lots went into this batch.
 *
 * The question asked during an investigation — "what did we put in".
 */
export async function lotsInBatch(batchId: string): Promise<TraceResult> {
  try {
    const { data, error } = await supabase
      .from('dispensing_records')
      .select('id, dispensed_at, actual_quantity, unit, material_lot_id, batch_stages!inner(batch_id)')
      .eq('batch_stages.batch_id', batchId);
    if (error) { logger.error('traceService.lotsInBatch', error); return EMPTY; }

    const rows = (data ?? []) as unknown as {
      dispensed_at: string | null; actual_quantity: number | null;
      unit: string | null; material_lot_id: string;
    }[];

    const lotIds = [...new Set(rows.map((r) => r.material_lot_id))];
    const [lots, batches] = await Promise.all([
      lotDetails(lotIds),
      batchDetails([batchId]),
    ]);
    const b = batches.get(batchId);

    return {
      ok: true,
      links: rows.map((r) => {
        const lot = lots.get(r.material_lot_id);
        return {
          batchId,
          batchNumber: b?.batch_number ?? null,
          batchStatus: b?.status ?? null,
          productName: b?.product_name ?? null,
          lotId: r.material_lot_id,
          lotNumber: lot?.lot_number ?? null,
          supplierName: lot?.supplier_name ?? null,
          supplierLotNumber: lot?.supplier_batch_number ?? null,
          quantity: r.actual_quantity,
          unit: r.unit,
          dispensedAt: r.dispensed_at,
        };
      }),
    };
  } catch (e) {
    logger.error('traceService.lotsInBatch threw', { error: String(e) });
    return EMPTY;
  }
}

interface BatchDetail {
  batch_number: string | null; status: string | null; product_name: string | null;
}

async function batchDetails(ids: string[]) {
  const out = new Map<string, BatchDetail>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from('batch_records').select('id, batch_number, status, product_name').in('id', ids);
  if (error) return out;
  for (const b of (data ?? []) as (BatchDetail & { id: string })[]) {
    out.set(b.id, { batch_number: b.batch_number, status: b.status, product_name: b.product_name });
  }
  return out;
}

interface LotDetail {
  lot_number: string | null;
  supplier_batch_number: string | null;
  supplier_name: string | null;
}

/**
 * The lot, and the supplier it came from.
 *
 * THE SUPPLIER IS THE UPSTREAM HALF OF THE TRACE and it was missing.
 * material_lots.supplier_id has always been there; nothing read it, so
 * a backward trace stopped at our own lot number and could not say
 * which company or which of their consignments it came from. That is
 * the step a recall actually needs: a batch is traced back to a lot,
 * and the lot has to be traced back to somebody who can be telephoned.
 */
async function lotDetails(ids: string[]) {
  const out = new Map<string, LotDetail>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from('material_lots')
    .select('id, lot_number, supplier_batch_number, suppliers(name)')
    .in('id', ids);
  if (error) { logger.error('traceService.lotDetails', error); return out; }
  for (const l of (data ?? []) as unknown as {
    id: string; lot_number: string | null; supplier_batch_number: string | null;
    suppliers?: { name?: string } | null;
  }[]) {
    out.set(l.id, {
      lot_number: l.lot_number,
      supplier_batch_number: l.supplier_batch_number,
      supplier_name: l.suppliers?.name ?? null,
    });
  }
  return out;
}

// ── What a trace means, as opposed to what it contains ───────────────

export interface TraceSummary {
  /** Distinct batches touched. Rows are per dispensing, not per batch. */
  batches: number;
  /** Distinct lots touched. */
  lots: number;
  /**
   * The batches that have been RELEASED, by number.
   *
   * THE ONLY PART OF A TRACE THAT IS URGENT. A released batch may have
   * left the site; everything else is still here and can be held where
   * it stands. Separating them is the difference between a recall and
   * a stock hold, and a list of twenty batch numbers does not make
   * that distinction on its own.
   */
  released: string[];
  /** Batches still inside the quality system, by number. */
  held: string[];
  /** Suppliers named by the trace, for the upstream call. */
  suppliers: string[];
}

export function traceSummary(links: TraceLink[]): TraceSummary {
  const batches = new Map<string, TraceLink>();
  const lots = new Set<string>();
  const suppliers = new Set<string>();

  for (const l of links) {
    if (!batches.has(l.batchId)) batches.set(l.batchId, l);
    lots.add(l.lotId);
    if (l.supplierName) suppliers.add(l.supplierName);
  }

  const released: string[] = [];
  const held: string[] = [];
  for (const [id, l] of batches) {
    const label = l.batchNumber ?? id;
    //  'released' and nothing else. A batch on hold, rejected or still
    //  in QC has not been distributed, and guessing from any other
    //  status would put a batch in the wrong list in the direction
    //  that matters.
    if (l.batchStatus === 'released') released.push(label);
    else held.push(label);
  }

  return {
    batches: batches.size,
    lots: lots.size,
    released: released.sort(),
    held: held.sort(),
    suppliers: [...suppliers].sort(),
  };
}

/**
 * How much of a lot a trace accounts for.
 *
 * Returns null when ANY link has no recorded quantity, rather than
 * summing what is there. A partial total reads as a complete one and
 * there is nothing on the number to say otherwise — on a reconciliation
 * that is the difference between "all of it is accounted for" and "the
 * part we can see is accounted for".
 */
export function tracedQuantity(links: TraceLink[]): { amount: number; unit: string } | null {
  if (links.length === 0) return null;
  const units = new Set(links.map((l) => l.unit ?? ''));
  //  Mixed or missing units cannot be added up.
  if (units.size !== 1 || units.has('')) return null;
  if (links.some((l) => l.quantity == null || !Number.isFinite(l.quantity))) return null;
  return {
    amount: links.reduce((t, l) => t + (l.quantity ?? 0), 0),
    unit: [...units][0]!,
  };
}
