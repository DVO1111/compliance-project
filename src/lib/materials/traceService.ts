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
  /** The lot, for a backward trace. */
  lotId: string;
  lotNumber: string | null;
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
      .select('id, dispensed_at, material_lot_id, batch_stages!inner(batch_id)')
      .eq('material_lot_id', lotId);
    if (error) { logger.error('traceService.batchesFromLot', error); return EMPTY; }

    const rows = (data ?? []) as unknown as {
      dispensed_at: string | null;
      material_lot_id: string;
      batch_stages?: { batch_id?: string } | null;
    }[];

    const batchIds = [...new Set(
      rows.map((r) => r.batch_stages?.batch_id).filter((b): b is string => !!b),
    )];
    const batches = await batchDetails(batchIds);

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
            lotId: r.material_lot_id,
            lotNumber: null,
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
      .select('id, dispensed_at, material_lot_id, batch_stages!inner(batch_id)')
      .eq('batch_stages.batch_id', batchId);
    if (error) { logger.error('traceService.lotsInBatch', error); return EMPTY; }

    const rows = (data ?? []) as unknown as {
      dispensed_at: string | null; material_lot_id: string;
    }[];

    const lotIds = [...new Set(rows.map((r) => r.material_lot_id))];
    const lots = await lotNumbers(lotIds);

    return {
      ok: true,
      links: rows.map((r) => ({
        batchId,
        batchNumber: null,
        batchStatus: null,
        lotId: r.material_lot_id,
        lotNumber: lots.get(r.material_lot_id) ?? null,
        dispensedAt: r.dispensed_at,
      })),
    };
  } catch (e) {
    logger.error('traceService.lotsInBatch threw', { error: String(e) });
    return EMPTY;
  }
}

async function batchDetails(ids: string[]) {
  const out = new Map<string, { batch_number: string | null; status: string | null }>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from('batch_records').select('id, batch_number, status').in('id', ids);
  if (error) return out;
  for (const b of (data ?? []) as { id: string; batch_number: string | null; status: string | null }[]) {
    out.set(b.id, { batch_number: b.batch_number, status: b.status });
  }
  return out;
}

async function lotNumbers(ids: string[]) {
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from('material_lots').select('id, lot_number').in('id', ids);
  if (error) return out;
  for (const l of (data ?? []) as { id: string; lot_number: string | null }[]) {
    out.set(l.id, l.lot_number);
  }
  return out;
}
