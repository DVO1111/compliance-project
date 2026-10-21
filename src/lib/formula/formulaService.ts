/**
 * Master formula: reordering stages, and comparing two versions —
 * W4·16 (MF-04, MF-05).
 *
 * The judgements live in parameterTypes.ts, which imports no client.
 * This is the join, and it is thin on purpose: both of the things it
 * calls are the kind that must not be reimplemented here.
 *
 * REORDERING IS THE DATABASE'S JOB, NOT A DRAG HANDLER'S. Moving a
 * stage means swapping two `sequence_no` values under a UNIQUE
 * constraint, and Postgres checks UNIQUE per row rather than at the
 * end of a statement — so a single `UPDATE … CASE` does not avoid it,
 * however it is written. master_formula_stage_move() parks a row above
 * the sequence in three statements, and a deploy assertion fails if
 * anybody simplifies that away. A client that computed new numbers and
 * sent them would hit the same constraint from further away, with a
 * worse error.
 *
 * COMPARING IS ALSO THE DATABASE'S JOB. master_formula_compare()
 * matches stages on stage_code and parameters on (stage_code,
 * parameter), so a renamed stage reads as a rename rather than as one
 * thing removed and another added. A client-side diff would match on
 * whatever it had to hand — usually the id, which changes when a
 * version is cloned — and every comparison would be a wall of
 * additions.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';
import type {
  FormulaDifference,
} from '../../components/Formula/VersionComparison';

export type FormulaResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

function fail(error: unknown, fallback: string): { ok: false; code: string; message: string } {
  const message = (error as { message?: string } | null)?.message ?? '';
  const m = /^([A-Z][A-Z0-9_]+):\s*(.*)$/.exec(message);
  if (m) return { ok: false, code: m[1], message: m[2] };
  return { ok: false, code: 'FORMULA_FAILED', message: message || fallback };
}

/**
 * Moves a stage one place up or down.
 *
 * Refuses on an approved formula, which the database enforces — a
 * formula's stages are the manufacturing instruction a batch was made
 * against, and reordering them after approval would rewrite what
 * somebody already did.
 */
export async function moveStage(
  stageId: string,
  direction: 'up' | 'down',
): Promise<FormulaResult<{ moved: number }>> {
  const { data, error } = await supabase.rpc('master_formula_stage_move', {
    p_stage_id: stageId,
    p_direction: direction,
  });
  if (error) {
    logger.error('[formula] moveStage failed', { stageId, direction, error });
    return fail(error, 'The stage could not be moved.');
  }
  return { ok: true, moved: Array.isArray(data) ? data.length : 0 };
}

/**
 * The differences between two versions of a formula.
 *
 * FAILS OPEN TO AN EMPTY LIST, which VersionComparison draws as "no
 * differences" — and that is the one place in this file worth
 * pausing on. An empty comparison after a failed read says the two
 * versions are identical, which is a claim. The component is handed
 * `differences` and a count, and the caller shows the error beside it;
 * this function logs rather than inventing a difference to carry the
 * failure, because a fabricated row would then appear in a change
 * control record.
 */
export async function compareVersions(
  fromFormulaId: string,
  toFormulaId: string,
): Promise<FormulaDifference[]> {
  const { data, error } = await supabase.rpc('master_formula_compare', {
    p_from_id: fromFormulaId,
    p_to_id: toFormulaId,
  });
  if (error) {
    logger.error('[formula] compareVersions failed', { fromFormulaId, toFormulaId, error });
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      stageCode: (row.stage_code as string | null) ?? null,
      stageName: (row.stage_name as string | null) ?? null,
      sequenceNo: row.sequence_no === null || row.sequence_no === undefined
        ? null : Number(row.sequence_no),
      scope: row.scope as FormulaDifference['scope'],
      change: row.change as FormulaDifference['change'],
      item: String(row.item ?? ''),
      field: (row.field as string | null) ?? null,
      oldValue: (row.old_value as string | null) ?? null,
      newValue: (row.new_value as string | null) ?? null,
      sortOrder: Number(row.sort_order ?? 0),
    };
  });
}

export interface FormulaVersion {
  id: string;
  version: string;
  status: string;
  batchSize: number | null;
  batchSizeUnit: string | null;
  createdAt: string;
}

/** Every version of a product's master formula, newest first — the
 *  two ends of a comparison are chosen from this. */
export async function listVersions(
  companyId: string,
  productId: string,
): Promise<FormulaVersion[]> {
  const { data, error } = await supabase
    .from('master_formulas')
    .select('id, version, status, batch_size, batch_size_unit, created_at')
    .eq('company_id', companyId)
    .eq('product_id', productId)
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('[formula] listVersions failed', { productId, error });
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      version: String(row.version),
      status: String(row.status ?? 'draft'),
      batchSize: row.batch_size === null || row.batch_size === undefined
        ? null : Number(row.batch_size),
      batchSizeUnit: (row.batch_size_unit as string | null) ?? null,
      createdAt: String(row.created_at),
    };
  });
}

export interface FormulaStage {
  id: string;
  sequenceNo: number;
  stageCode: string;
  name: string;
}

export async function listStages(formulaId: string): Promise<FormulaStage[]> {
  const { data, error } = await supabase
    .from('master_formula_stages')
    .select('id, sequence_no, stage_code, name')
    .eq('formula_id', formulaId)
    .order('sequence_no');
  if (error) {
    logger.error('[formula] listStages failed', { formulaId, error });
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      sequenceNo: Number(row.sequence_no),
      stageCode: String(row.stage_code),
      name: String(row.name),
    };
  });
}
