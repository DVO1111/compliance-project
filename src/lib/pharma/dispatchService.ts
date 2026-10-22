/**
 * Dispatch — where a released batch went.
 *
 * PM-03 has a `Distribution` column, Act for the Storekeeper and the
 * QA Officer, and nothing in this codebase answered to it: a
 * storekeeper held Act on a section they could not open. DB-02's drawn
 * rail carries a Dispatch item and the derived rail had nowhere to
 * send it.
 *
 * It is also the far end of a trace. Before this, a recall could be
 * scoped backwards from a batch to its lots to their suppliers, and
 * stopped dead at release — `shipments` has no batch_id and nothing
 * else connected a batch to a customer.
 *
 * NOTHING HERE DECIDES ANYTHING. Only a released batch may be
 * dispatched, and that is a trigger reading the batch's own state —
 * which is a mirror of the lifecycle engine and read-only to direct
 * writes, so it cannot be set by whoever is dispatching. The refusal
 * arrives as a sentence.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';

export interface DispatchRow {
  id: string;
  batchId: string;
  destination: string;
  reference: string | null;
  quantity: number;
  unit: string;
  dispatchedAt: string;
  notes: string | null;
}

export type DispatchResult =
  | { ok: true; id: string }
  | { ok: false; code: string; message: string };

function toFailure(error: { message?: string } | null, fallback: string): DispatchResult {
  const raw = error?.message ?? fallback;
  const match = raw.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/s);
  if (match) return { ok: false, code: match[1], message: match[2].trim() };
  return { ok: false, code: 'DISPATCH_ERROR', message: raw };
}

/** Everything dispatched by this company, newest first. */
export async function listDispatches(
  companyId: string, limit = 100,
): Promise<DispatchRow[]> {
  const { data, error } = await supabase
    .from('batch_dispatches')
    .select('id, batch_id, destination, reference, quantity, unit, dispatched_at, notes')
    .eq('company_id', companyId)
    .order('dispatched_at', { ascending: false })
    .limit(limit);
  if (error) { logger.error('dispatchService.listDispatches', error); return []; }
  return ((data as unknown[]) ?? []).map(toRow);
}

/** Where one batch went. The question a recall arrives with. */
export async function dispatchesForBatch(batchId: string): Promise<DispatchRow[]> {
  const { data, error } = await supabase
    .from('batch_dispatches')
    .select('id, batch_id, destination, reference, quantity, unit, dispatched_at, notes')
    .eq('batch_id', batchId)
    .order('dispatched_at', { ascending: false });
  if (error) { logger.error('dispatchService.dispatchesForBatch', error); return []; }
  return ((data as unknown[]) ?? []).map(toRow);
}

function toRow(r: unknown): DispatchRow {
  const row = r as Record<string, unknown>;
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    destination: String(row.destination ?? ''),
    reference: (row.reference as string | null) ?? null,
    quantity: Number(row.quantity ?? 0),
    unit: String(row.unit ?? ''),
    dispatchedAt: String(row.dispatched_at),
    notes: (row.notes as string | null) ?? null,
  };
}

export async function recordDispatch(args: {
  companyId: string;
  batchId: string;
  destination: string;
  reference?: string | null;
  quantity: number;
  unit: string;
  notes?: string | null;
  userId?: string | null;
}): Promise<DispatchResult> {
  const { data, error } = await supabase
    .from('batch_dispatches')
    .insert({
      company_id: args.companyId,
      batch_id: args.batchId,
      destination: args.destination.trim(),
      reference: args.reference?.trim() || null,
      quantity: args.quantity,
      unit: args.unit.trim(),
      notes: args.notes?.trim() || null,
      dispatched_by: args.userId ?? null,
    })
    .select('id')
    .single();

  if (error) {
    logger.warn('[dispatch] refused', { batchId: args.batchId, error });
    return toFailure(error, 'The dispatch could not be recorded.');
  }
  return { ok: true, id: String((data as { id: string }).id) };
}
