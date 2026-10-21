/**
 * Yield reconciliation — Week 4 item 12.
 *
 * A typed surface over the RPCs and tables in
 * supabase/migrations/20261016000000_yield_reconciliation.sql.
 *
 * The judgements live in yieldModel.ts, which imports no client and so
 * tests without a project. This file binds the real one.
 *
 * WHAT THIS FILE DOES AND DOES NOT REFUSE
 * ---------------------------------------
 * `reconcileStage` and `reconcileBatch` never refuse a bad yield. The
 * numbers are facts, and a variance beyond threshold is the fact an
 * investigation starts from.
 *
 * What is refused is PROCEEDING, and it is refused by the database:
 * batch_stage_complete and batch_record_close call yield_block_reason
 * and yield_batch_block_reason themselves. `checkStageYield` here exists
 * so a screen can show the same answer before the button is pressed, and
 * it reads the same function so the two cannot disagree. It is not the
 * control — the browser holds the anon key, and nothing in this file is
 * a security boundary.
 *
 * NO DEVIATION IS CREATED anywhere, including on an authorised variance.
 * That is Week 6; `deviationCreated` is returned as the database reports
 * it so that if it ever becomes true somebody sees it here.
 */

import { supabase } from '../supabase';
import { recordAuditEvent, type AuditEventParams } from '../auditService';

/**
 * Who is performing the act, for the audit row. Taken from the audit
 * type rather than re-declared, so it cannot drift from what
 * recordAuditEvent requires.
 */
export type Actor = Pick<AuditEventParams, 'userId' | 'companyId'>;
import { logger } from '../logger';
import {
  checkYieldClear,
  checkBatchYieldClear,
  type YieldGateClient,
  type YieldCheck,
} from './yieldModel';
import type {
  YieldConfig, YieldReconciliation, YieldStatusRow, TheoreticalBasis,
} from './yieldModel';
//  W4·19. The account's shape and its formatting live in
//  lib/yield/yieldAccount.ts, which imports no client — the same split
//  as yieldModel.
import type { AccountLine } from '../yield/yieldAccount';

export type {
  YieldConfig, YieldReconciliation, YieldStatusRow, TheoreticalBasis,
  YieldFigures, ReconciliationAdvice, YieldGateClient, YieldCheck,
} from './yieldModel';
export {
  yieldFigures, theoreticalFrom, configIsValid, adviseOnReconciliation,
  canAuthorise, isOutstanding, THEORETICAL_BASES, BASIS_LABELS,
} from './yieldModel';

export type YieldResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

function toFailure(error: { message?: string } | null, fallback: string): YieldResult<never> {
  const raw = error?.message ?? fallback;
  const match = raw.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/s);
  if (match) return { ok: false, code: match[1], message: match[2].trim() };
  return { ok: false, code: 'YIELD_ERROR', message: raw };
}

// ── the block read ───────────────────────────────────────────────────

/** Whether a stage's yield blocks its completion. Fails CLOSED. */
export function checkStageYield(batchStageId: string | null | undefined): Promise<YieldCheck> {
  return checkYieldClear(supabase as unknown as YieldGateClient, batchStageId);
}

/** Whether a batch's yield blocks closing execution. Fails CLOSED. */
export function checkBatchYield(batchId: string | null | undefined): Promise<YieldCheck> {
  return checkBatchYieldClear(supabase as unknown as YieldGateClient, batchId);
}

// ── the configuration ────────────────────────────────────────────────

export async function listYieldConfigs(companyId: string): Promise<YieldConfig[]> {
  const { data, error } = await (supabase as any)
    .from('yield_reconciliation_configs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  if (error) {
    logger.error('[yield] listYieldConfigs failed', { companyId, error });
    return [];
  }
  return (data as YieldConfig[]) ?? [];
}

export interface YieldConfigInput {
  companyId: string;
  /** Who is setting the threshold — it goes on the audit row. */
  userId: string;
  productId: string;
  /** null for the batch-completion config. */
  formulaStageId: string | null;
  theoreticalBasis: TheoreticalBasis;
  inputUnit: string;
  outputUnit: string;
  /** Explicit. Defaults to 1 when the units are the same thing. */
  outputPerInput?: number;
  /**
   * REQUIRED, with no default here and none in the database. "Threshold
   * hardcoded" is one of item 12's NOT DONE IF clauses, and supplying a
   * conventional default in this function would reintroduce it on the
   * one path most callers take.
   */
  varianceThresholdPct: number;
  notes?: string | null;
}

export async function saveYieldConfig(
  input: YieldConfigInput,
): Promise<YieldResult<{ config: YieldConfig }>> {
  const row = {
    company_id: input.companyId,
    product_id: input.productId,
    formula_stage_id: input.formulaStageId,
    theoretical_basis: input.theoreticalBasis,
    input_unit: input.inputUnit,
    output_unit: input.outputUnit,
    output_per_input: input.outputPerInput ?? 1,
    variance_threshold_pct: input.varianceThresholdPct,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabase as any)
    .from('yield_reconciliation_configs')
    .upsert(row, { onConflict: 'product_id,formula_stage_id' })
    .select('*')
    .single();

  if (error) {
    logger.error('[yield] saveYieldConfig failed', { productId: input.productId, error });
    return toFailure(error, 'The yield configuration could not be saved.');
  }

  //  Worth auditing on its own: the threshold decides what blocks a
  //  stage, so changing it changes what every later batch may do.
  await recordAuditEvent({
    userId: input.userId,
    companyId: input.companyId,
    action: 'yield_reconciliation_config.save',
    entityType: 'product',
    entityId: input.productId,
    metadata: {
      formula_stage_id: input.formulaStageId,
      basis: input.theoreticalBasis,
      threshold_pct: input.varianceThresholdPct,
      output_per_input: row.output_per_input,
    },
  }).catch(() => undefined);

  return { ok: true, config: data as YieldConfig };
}

// ── recording a reconciliation ───────────────────────────────────────

export interface RecordedYield {
  reconciliationId: string;
  theoreticalQuantity: number;
  actualQuantity: number;
  unit: string;
  yieldPct: number;
  variancePct: number;
  thresholdPct: number;
  withinThreshold: boolean;
  basis: TheoreticalBasis;
  basisQuantity: number;
  /** How the theoretical figure was arrived at, in words, so a reviewer
   *  can check it rather than take it on trust. */
  basisDetail: string | null;
  /** True when this variance will refuse stage completion or batch
   *  closure until it is investigated and authorised. */
  blocks: boolean;
}

function toRecorded(r: Record<string, unknown>, blockKey: string): RecordedYield {
  return {
    reconciliationId: String(r.reconciliation_id ?? ''),
    theoreticalQuantity: Number(r.theoretical_quantity),
    actualQuantity: Number(r.actual_quantity),
    unit: String(r.unit ?? ''),
    yieldPct: Number(r.yield_pct),
    variancePct: Number(r.variance_pct),
    thresholdPct: Number(r.threshold_pct),
    withinThreshold: r.within_threshold === true,
    basis: r.basis as TheoreticalBasis,
    basisQuantity: Number(r.basis_quantity),
    basisDetail: typeof r.basis_detail === 'string' ? r.basis_detail : null,
    blocks: r[blockKey] === true,
  };
}

/**
 * Records a stage's yield.
 *
 * Never refuses a bad yield. It DOES refuse a unit mismatch, before any
 * arithmetic — so a quantity entered in the wrong unit is reported as a
 * unit error rather than as a 99,900% variance that calls for an
 * investigation into a typing slip.
 */
export async function reconcileStage(
  batchStageId: string,
  actualQuantity: number,
  opts: { unit?: string; notes?: string } = {},
): Promise<YieldResult<{ yield: RecordedYield }>> {
  const { data, error } = await (supabase as any).rpc('yield_reconcile_stage', {
    p_batch_stage_id: batchStageId,
    p_actual_quantity: actualQuantity,
    p_unit: opts.unit ?? null,
    p_notes: opts.notes ?? null,
  });
  if (error) {
    logger.error('[yield] reconcileStage failed', { batchStageId, error });
    return toFailure(error, 'The yield could not be reconciled.');
  }
  return { ok: true, yield: toRecorded((data ?? {}) as Record<string, unknown>, 'blocks_completion') };
}

/** The same at batch completion. */
export async function reconcileBatch(
  batchId: string,
  actualQuantity: number,
  opts: { unit?: string; notes?: string } = {},
): Promise<YieldResult<{ yield: RecordedYield }>> {
  const { data, error } = await (supabase as any).rpc('yield_reconcile_batch', {
    p_batch_id: batchId,
    p_actual_quantity: actualQuantity,
    p_unit: opts.unit ?? null,
    p_notes: opts.notes ?? null,
  });
  if (error) {
    logger.error('[yield] reconcileBatch failed', { batchId, error });
    return toFailure(error, 'The batch yield could not be reconciled.');
  }
  return { ok: true, yield: toRecorded((data ?? {}) as Record<string, unknown>, 'blocks_closure') };
}

// ── investigation and authorisation ──────────────────────────────────

/**
 * Raises the investigation flag, with a note saying what was looked
 * into. Separate from authorising, because they are different acts by
 * different people: the flag is "this was investigated", the
 * authorisation is "and I accept it".
 */
export async function flagInvestigation(
  reconciliationId: string,
  note: string,
): Promise<YieldResult<{ reconciliationId: string }>> {
  const { data, error } = await (supabase as any).rpc('yield_flag_investigation', {
    p_reconciliation_id: reconciliationId,
    p_note: note,
  });
  if (error) {
    logger.error('[yield] flagInvestigation failed', { reconciliationId, error });
    return toFailure(error, 'The investigation could not be recorded.');
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return { ok: true, reconciliationId: String(r.reconciliation_id ?? reconciliationId) };
}

/**
 * Records a supervisor's authorisation to proceed past a variance.
 *
 * The investigation has to come first, the person who recorded the
 * numbers cannot authorise them, and the reason is required — all
 * enforced in the database. `canAuthorise` in the model lets a screen
 * avoid offering a button that will be refused.
 *
 * The signature is optional: sign_electronic_record only signs
 * lifecycle-governed records and a reconciliation is not one, so
 * requiring it would make the gate unclearable. See the migration's
 * byr_auth_complete_chk for the full reasoning and what making it
 * mandatory would take.
 */
export async function authoriseVariance(
  reconciliationId: string,
  reason: string,
  actor: Actor,
  signatureId?: string | null,
): Promise<YieldResult<{ authorisedBy: string | null; deviationCreated: boolean }>> {
  const { data, error } = await (supabase as any).rpc('yield_authorise_variance', {
    p_reconciliation_id: reconciliationId,
    p_reason: reason,
    p_signature_id: signatureId ?? null,
  });
  if (error) {
    logger.error('[yield] authoriseVariance failed', { reconciliationId, error });
    return toFailure(error, 'The authorisation could not be recorded.');
  }
  const r = (data ?? {}) as Record<string, unknown>;

  await recordAuditEvent({
    userId: actor.userId,
    companyId: actor.companyId,
    action: 'yield_reconciliation.authorise',
    entityType: 'batch_yield_reconciliation',
    entityId: reconciliationId,
    metadata: { reason },
  }).catch(() => undefined);

  return {
    ok: true,
    authorisedBy: typeof r.authorised_by === 'string' ? r.authorised_by : null,
    deviationCreated: r.deviation_created === true,
  };
}

// ── reads ────────────────────────────────────────────────────────────

/**
 * Every stage of a batch plus the batch itself: whether reconciliation
 * is configured, the figures if recorded, and the block reason if it
 * blocks — all in one answer, so a screen shows variance, threshold and
 * the block together rather than re-deriving the verdict.
 */
export async function yieldStatus(batchId: string): Promise<YieldStatusRow[]> {
  const { data, error } = await (supabase as any).rpc('yield_reconciliation_status', {
    p_batch_id: batchId,
  });
  if (error) {
    logger.error('[yield] yieldStatus failed', { batchId, error });
    return [];
  }
  return Array.isArray(data) ? (data as YieldStatusRow[]) : [];
}

export async function listReconciliations(batchId: string): Promise<YieldReconciliation[]> {
  const { data, error } = await (supabase as any)
    .from('batch_yield_reconciliations')
    .select('*')
    .eq('batch_id', batchId)
    .order('recorded_at', { ascending: true });
  if (error) {
    logger.error('[yield] listReconciliations failed', { batchId, error });
    return [];
  }
  return (data as YieldReconciliation[]) ?? [];
}

/** Everything in the company still waiting on an investigation or an
 *  authorisation — the supervisor's queue. */
export async function listOutstanding(companyId: string): Promise<YieldReconciliation[]> {
  const { data, error } = await (supabase as any)
    .from('batch_yield_reconciliations')
    .select('*')
    .eq('company_id', companyId)
    .eq('within_threshold', false)
    .is('authorised_by', null)
    .order('recorded_at', { ascending: true });
  if (error) {
    logger.error('[yield] listOutstanding failed', { companyId, error });
    return [];
  }
  return (data as YieldReconciliation[]) ?? [];
}

// ── W4·19 · the account at Packing ───────────────────────────────────
//
//  "Theoretical, packed, samples, rejects, unaccounted, yield and
//   variance against the threshold" (YR-01).
//
//  THE PACKED FIGURE IS THE ACTUAL YIELD. YR-01's own numbers settle
//  it: 289,440 packed out of 300,000 theoretical is the 96.5 % the
//  screen calls the actual yield and the 98 % threshold blocks on,
//  while the accounted total (292,800) is 97.6 % and measures
//  something else — whether all the material can be located.
//
//  So `reconcileStageAccounted` passes packed straight through to
//  item 12's own RPC as `p_actual_quantity`, and samples and rejects
//  are stored beside it. There is no second yield arithmetic anywhere,
//  and no packed column: a deploy assertion fails if one appears.

/**
 * Records a stage reconciliation together with its samples and
 * rejects lines.
 *
 * Both lines are required. A half-written account looks like a
 * breakdown and the remainder it implies is wrong by exactly the line
 * nobody entered — so a stage with nothing sampled passes zero rather
 * than leaving it out.
 */
export async function reconcileStageAccounted(
  batchStageId: string,
  packedQuantity: number,
  samplesQuantity: number,
  rejectsQuantity: number,
  opts: { unit?: string; notes?: string } = {},
): Promise<YieldResult<{ yield: RecordedYield }>> {
  const { data, error } = await (supabase as any)
    .rpc('yield_reconcile_stage_accounted', {
      p_batch_stage_id: batchStageId,
      p_packed_quantity: packedQuantity,
      p_samples_quantity: samplesQuantity,
      p_rejects_quantity: rejectsQuantity,
      p_unit: opts.unit ?? null,
      p_notes: opts.notes ?? null,
    });
  if (error) {
    logger.error('[yield] reconcileStageAccounted failed', { batchStageId, error });
    return toFailure(error, 'The yield could not be reconciled.');
  }
  return {
    ok: true,
    yield: toRecorded((data ?? {}) as Record<string, unknown>, 'blocks_completion'),
  };
}

/**
 * The reconciliation as the six lines YR-01 shows.
 *
 * FAILS TO AN EMPTY ACCOUNT, not to zeroes. A card with six lines of
 * "0 tablets" would claim a batch produced nothing; an empty list
 * lets the card say it could not read the account. Nothing blocks on
 * this either way — the block comes from `within_threshold` on the
 * record, which item 12 derived.
 */
export async function accountLines(reconciliationId: string): Promise<AccountLine[]> {
  const { data, error } = await (supabase as any)
    .rpc('yield_account_lines', { p_reconciliation_id: reconciliationId });
  if (error) {
    logger.error('[yield] accountLines failed', { reconciliationId, error });
    return [];
  }
  return ((data as any[]) ?? []).map((r) => ({
    key: r.line_key,
    label: r.label,
    quantity: r.quantity === null ? null : Number(r.quantity),
    unit: r.unit,
    pctOfTheoretical: r.pct_of_theoretical === null ? null : Number(r.pct_of_theoretical),
    kind: r.kind,
    mustExplain: r.must_explain === true,
    sortOrder: Number(r.sort_order),
  }));
}
