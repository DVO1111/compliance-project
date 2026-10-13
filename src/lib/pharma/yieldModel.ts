import { logger } from '../logger';

/**
 * Yield reconciliation — Week 4 item 12.
 *
 * The shapes, the arithmetic, and the block read. Nothing here imports
 * the Supabase client, so all of it tests without a project, a network
 * or a .env.
 *
 * THIS ITEM BLOCKS. ITEM 11 DELIBERATELY DID NOT.
 * -----------------------------------------------
 * inprocessModel.ts carries a `canSave: true` that is deliberately
 * unconditional, because item 11's first NOT DONE IF is "an OOS reading
 * blocks entry". Item 12's first NOT DONE IF is the opposite: "the
 * calculation is right but the threshold blocks nothing". They are not
 * in tension — they block different acts:
 *
 *   recording an observation  must never be refused; refusing destroys
 *                             the number and the operator writes it on
 *                             paper instead
 *   moving on                 must be refused; a stage whose material
 *                             balance does not add up is a stage where
 *                             something is unaccounted for
 *
 * So `recordReconciliation` never refuses, and completion does.
 *
 * NOTHING HERE IS A SECURITY BOUNDARY. The browser holds the anon key.
 * `yieldBlockReason` below asks the database for the verdict rather than
 * computing one, for the same reason the quarantine, clearance and
 * calibration gates do: a screen and the database that disagree about
 * whether a stage may be completed is worse than either answer alone.
 * `isWithinThreshold` exists only so a form can show the verdict as the
 * number is typed, and it mirrors fn_byr_calculate() in
 * supabase/migrations/20261016000000_yield_reconciliation.sql exactly.
 * If you change one, change both in the same commit.
 */

// ── the shapes ───────────────────────────────────────────────────────

/** Where the theoretical figure comes from. Named rather than inferred,
 *  because a yield whose denominator is unclear is a number two people
 *  will read differently. */
export type TheoreticalBasis =
  | 'dispensed_to_stage'
  | 'dispensed_to_batch'
  | 'previous_stage_output'
  | 'planned_batch_size';

export const THEORETICAL_BASES: readonly TheoreticalBasis[] = [
  'dispensed_to_stage',
  'dispensed_to_batch',
  'previous_stage_output',
  'planned_batch_size',
];

export const BASIS_LABELS: Record<TheoreticalBasis, string> = {
  dispensed_to_stage: 'what was dispensed to this stage',
  dispensed_to_batch: 'everything dispensed to the batch',
  previous_stage_output: "the previous stage's output",
  planned_batch_size: 'the planned batch size',
};

export interface YieldConfig {
  id: string;
  company_id: string;
  product_id: string;
  /** null is the batch-completion config. */
  formula_stage_id: string | null;
  theoretical_basis: TheoreticalBasis;
  input_unit: string;
  output_unit: string;
  /** Explicit, set by the product. Nothing derives it. */
  output_per_input: number;
  /** No default anywhere. A config cannot exist without a chosen
   *  threshold — "threshold hardcoded" is a NOT DONE IF, and a
   *  conventional default would be exactly that. */
  variance_threshold_pct: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface YieldReconciliation {
  id: string;
  company_id: string;
  batch_id: string;
  /** null is the batch-completion reconciliation. */
  batch_stage_id: string | null;
  config_id: string | null;
  /** Snapshotted from the config: a config can be revised, and what this
   *  reconciliation was judged against is a fact about this batch. */
  theoretical_basis: TheoreticalBasis;
  basis_quantity: number;
  output_per_input: number;
  threshold_pct: number;
  theoretical_quantity: number;
  actual_quantity: number;
  unit: string;
  /** Derived by trigger and frozen. */
  yield_pct: number | null;
  /** SIGNED: an overage and a shortfall are different problems. */
  variance_pct: number | null;
  within_threshold: boolean | null;
  investigation_required: boolean;
  investigation_note: string | null;
  authorised_by: string | null;
  authorised_at: string | null;
  authorisation_reason: string | null;
  authorisation_signature_id: string | null;
  /** WEEK 6. Nothing in this codebase writes it. */
  deviation_id: string | null;
  notes: string | null;
  recorded_by: string;
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

export interface YieldStatusRow {
  scope: 'stage' | 'batch';
  batch_stage_id: string | null;
  sequence_no: number | null;
  stage_name: string | null;
  /** Whether reconciliation is configured here at all. Distinct from
   *  "configured but nothing recorded", which a screen must be able to
   *  tell apart. */
  configured: boolean;
  reconciliation_id: string | null;
  theoretical_quantity: number | null;
  actual_quantity: number | null;
  unit: string | null;
  yield_pct: number | null;
  variance_pct: number | null;
  threshold_pct: number | null;
  within_threshold: boolean | null;
  investigation_required: boolean;
  authorised_by: string | null;
  /** The block, alongside the variance and the threshold, so a screen
   *  shows all three together rather than re-deriving the verdict. */
  block_reason: string | null;
}

// ── the arithmetic ───────────────────────────────────────────────────

export interface YieldFigures {
  theoreticalQuantity: number;
  actualQuantity: number;
  yieldPct: number;
  /** Signed. Positive is an overage, negative a shortfall. */
  variancePct: number;
  withinThreshold: boolean;
}

/**
 * The same arithmetic as fn_byr_calculate(), to four decimal places.
 *
 * The threshold is applied to the MAGNITUDE of the variance, because a
 * threshold is a tolerance in both directions: a yield of more than
 * theory means material is unaccounted for just as surely as a shortfall
 * does. The boundary is INCLUSIVE — a variance exactly on the threshold
 * is within it, matching item 11's zone limits so the two do not teach
 * an operator two meanings of "limit".
 */
export function yieldFigures(
  theoreticalQuantity: number,
  actualQuantity: number,
  thresholdPct: number,
): YieldFigures | null {
  if (!Number.isFinite(theoreticalQuantity) || theoreticalQuantity <= 0) return null;
  if (!Number.isFinite(actualQuantity) || actualQuantity < 0) return null;
  if (!Number.isFinite(thresholdPct) || thresholdPct < 0) return null;

  const yieldPct = round4(actualQuantity * 100 / theoreticalQuantity);
  const variancePct = round4(yieldPct - 100);
  return {
    theoreticalQuantity,
    actualQuantity,
    yieldPct,
    variancePct,
    withinThreshold: Math.abs(variancePct) <= thresholdPct,
  };
}

/** Rounded the way numeric(10,4) rounds, so the browser and the database
 *  agree on a figure sitting exactly on a threshold. */
function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000;
}

/** The theoretical figure from a basis quantity and the product's stated
 *  conversion. No conversion is inferred anywhere — see the migration
 *  header. */
export function theoreticalFrom(basisQuantity: number, outputPerInput: number): number | null {
  if (!Number.isFinite(basisQuantity) || !Number.isFinite(outputPerInput)) return null;
  if (outputPerInput <= 0) return null;
  return basisQuantity * outputPerInput;
}

/** Whether a set of limits is coherent, so a form can say so before the
 *  database refuses the row. Mirrors yrc_threshold_chk and yrc_factor_chk. */
export function configIsValid(
  c: Pick<YieldConfig, 'variance_threshold_pct' | 'output_per_input' | 'input_unit' | 'output_unit'>,
): boolean {
  if (!Number.isFinite(c.variance_threshold_pct)) return false;
  if (c.variance_threshold_pct < 0 || c.variance_threshold_pct >= 100) return false;
  if (!Number.isFinite(c.output_per_input) || c.output_per_input <= 0) return false;
  if (!c.input_unit?.trim() || !c.output_unit?.trim()) return false;
  return true;
}

// ── what a screen says about a reconciliation ────────────────────────

export interface ReconciliationAdvice {
  /** Always true. The numbers are facts and a bad number is still a
   *  fact; it is COMPLETION that gets refused, not recording. Present as
   *  a field rather than left implicit so anybody tempted to make it
   *  conditional has to read why not. */
  canRecord: true;
  /** True when this variance will block stage completion until it is
   *  investigated and authorised. */
  willBlock: boolean;
  /** 'none' | 'shortfall' | 'overage' — for presentation only. */
  direction: 'none' | 'shortfall' | 'overage';
  figures: YieldFigures | null;
  messages: string[];
}

export function adviseOnReconciliation(
  theoreticalQuantity: number,
  actualQuantity: number,
  thresholdPct: number,
  unit = '',
): ReconciliationAdvice {
  const f = yieldFigures(theoreticalQuantity, actualQuantity, thresholdPct);
  const u = unit ? ` ${unit}` : '';
  const messages: string[] = [];

  if (!f) {
    return {
      canRecord: true,
      willBlock: false,
      direction: 'none',
      figures: null,
      messages: [
        'A yield percentage needs a theoretical quantity greater than zero and an actual quantity of zero or more.',
      ],
    };
  }

  const direction = f.variancePct === 0 ? 'none' : f.variancePct > 0 ? 'overage' : 'shortfall';

  if (!f.withinThreshold) {
    messages.push(
      `${f.actualQuantity}${u} of a theoretical ${f.theoreticalQuantity}${u} is ` +
      `${f.yieldPct}%, a variance of ${f.variancePct > 0 ? '+' : ''}${f.variancePct}% ` +
      `against a threshold of ${thresholdPct}%.`,
    );
    messages.push(
      'Record it. The stage cannot be completed until the variance is investigated ' +
      'and a supervisor authorises proceeding.',
    );
    if (direction === 'overage') {
      //  Worth saying, because an operator's instinct is that more is
      //  better. It is not: a yield above theory means the material
      //  balance does not close.
      messages.push(
        'A yield above theory means the material balance does not close — ' +
        'check the weighing, the count and whether anything was added that was not dispensed.',
      );
    }
  }

  return { canRecord: true, willBlock: !f.withinThreshold, direction, figures: f, messages };
}

/** Whether this person may authorise this variance. The database refuses
 *  the recorder too; the rule is in both places so a screen does not
 *  offer a button that produces an error the operator cannot act on. */
export function canAuthorise(
  r: Pick<YieldReconciliation,
    'within_threshold' | 'authorised_by' | 'investigation_required' | 'recorded_by'>,
  userId: string | null | undefined,
): boolean {
  if (r.within_threshold !== false) return false;
  if (r.authorised_by !== null) return false;
  if (!r.investigation_required) return false;
  if (!userId) return false;
  return r.recorded_by !== userId;
}

/** Whether a reconciliation is waiting on something a person must do. */
export function isOutstanding(r: Pick<YieldReconciliation, 'within_threshold' | 'authorised_by'>): boolean {
  return r.within_threshold === false && r.authorised_by === null;
}

// ── the block read ───────────────────────────────────────────────────

export interface YieldGateClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface YieldCheck {
  /** True ONLY when the server positively confirmed there is nothing
   *  blocking. Never true by default, and never true on an error. */
  clear: boolean;
  reason: string | null;
  checkFailed: boolean;
}

const BLOCKED_BY_FAILURE =
  'The yield reconciliation could not be checked, so the stage cannot be completed.';

/**
 * Asks the database whether a stage's yield blocks its completion.
 *
 * Fails CLOSED, unlike `fetchSamplingDue` in inprocessModel.ts which
 * fails open. The difference is the difference between a prompt and a
 * permission: not knowing what sample is due must not stop anybody
 * recording a reading, but not knowing whether a yield is reconciled
 * must not let a stage be signed off.
 *
 * supabase-js RESOLVES a failed query with `{ data: null, error }`, so
 * reading `data === null` as "fine" is how a network failure becomes
 * permission to close a batch that never balanced. The null case is
 * therefore only trusted when `error` is null.
 */
export async function checkYieldClear(
  client: YieldGateClient,
  batchStageId: string | null | undefined,
): Promise<YieldCheck> {
  if (!batchStageId) {
    return {
      clear: false,
      reason: 'No stage was given, so no yield could be checked.',
      checkFailed: true,
    };
  }

  let data: unknown;
  let error: { message: string } | null;
  try {
    ({ data, error } = await client.rpc('yield_block_reason', {
      p_batch_stage_id: batchStageId,
    }));
  } catch (e: any) {
    logger.error('[yield] gate threw', e);
    return { clear: false, reason: BLOCKED_BY_FAILURE, checkFailed: true };
  }

  if (error) {
    logger.error('[yield] gate failed', { batchStageId, error });
    return { clear: false, reason: BLOCKED_BY_FAILURE, checkFailed: true };
  }

  if (data === null || data === undefined) {
    return { clear: true, reason: null, checkFailed: false };
  }
  if (typeof data !== 'string') {
    logger.error('[yield] gate returned an unexpected shape', { batchStageId, data });
    return {
      clear: false,
      reason: 'The yield check returned something unexpected, so the stage cannot be completed.',
      checkFailed: true,
    };
  }
  return { clear: false, reason: data, checkFailed: false };
}

/** The same read for a batch's execution closure. */
export async function checkBatchYieldClear(
  client: YieldGateClient,
  batchId: string | null | undefined,
): Promise<YieldCheck> {
  if (!batchId) {
    return {
      clear: false,
      reason: 'No batch was given, so no yield could be checked.',
      checkFailed: true,
    };
  }

  let data: unknown;
  let error: { message: string } | null;
  try {
    ({ data, error } = await client.rpc('yield_batch_block_reason', { p_batch_id: batchId }));
  } catch (e: any) {
    logger.error('[yield] batch gate threw', e);
    return { clear: false, reason: BLOCKED_BY_FAILURE, checkFailed: true };
  }

  if (error) {
    logger.error('[yield] batch gate failed', { batchId, error });
    return { clear: false, reason: BLOCKED_BY_FAILURE, checkFailed: true };
  }
  if (data === null || data === undefined) {
    return { clear: true, reason: null, checkFailed: false };
  }
  if (typeof data !== 'string') {
    logger.error('[yield] batch gate returned an unexpected shape', { batchId, data });
    return {
      clear: false,
      reason: 'The yield check returned something unexpected, so the batch cannot be closed.',
      checkFailed: true,
    };
  }
  return { clear: false, reason: data, checkFailed: false };
}
