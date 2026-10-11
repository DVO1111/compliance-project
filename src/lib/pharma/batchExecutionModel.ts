/**
 * Batch execution: the shapes, and the judgements a screen makes locally.
 *
 * Separate from batchExecutionService for one practical reason: that file
 * imports the Supabase client at module load, and these helpers are worth
 * testing without standing up a client to do it. See
 * src/tests/batchExecution.test.ts. The service re-exports everything
 * here, so callers still have a single import site.
 *
 * Nothing in this file is a control. Every rule it reflects is enforced in
 * the database by 20261011000000_batch_record_and_stages.sql; these
 * functions only decide what to PUT IN FRONT of somebody.
 */

/** The engine's states for a batch stage. */
export type BatchStageStatus = 'pending' | 'in_progress' | 'complete';

/** machine setting = an instruction; product attribute = an acceptance
 *  criterion. The distinction decides how out-of-specification is handled,
 *  which is why it travels with each reading instead of being looked up. */
export type ParameterType = 'machine_setting' | 'product_attribute';

export interface BatchStage {
  id: string;
  company_id: string;
  batch_id: string;
  formula_stage_id: string | null;
  sequence_no: number;
  name: string;
  /** Copied from the formula stage at instantiation. A later formula
   *  revision cannot change what THIS batch was told to do. */
  requires_verifier: boolean;
  /** Mirror of the engine. A direct write to it is refused by the
   *  database; move a stage with the functions below. */
  status: BatchStageStatus;
  started_at: string | null;
  started_by: string | null;
  completed_at: string | null;
  operator_id: string | null;
  operator_signature_id: string | null;
  verifier_id: string | null;
  verifier_signature_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchStageReading {
  id: string;
  company_id: string;
  batch_stage_id: string;
  formula_parameter_id: string | null;
  parameter_name: string;
  parameter_type: ParameterType;
  unit: string | null;
  target_value: number | null;
  min_value: number | null;
  max_value: number | null;
  reading_value: number | null;
  reading_text: string | null;
  /** Computed by the database from the limits. null means UNKNOWN — the
   *  formula recorded no limits — and must not be rendered as a pass. */
  in_specification: boolean | null;
  recorded_by: string | null;
  recorded_at: string;
  /** Set when this reading corrects an earlier one, which is kept. */
  corrected_from_id: string | null;
  created_at: string;
}

export interface BatchStageCorrection {
  id: string;
  company_id: string;
  batch_stage_id: string;
  field_name: string;
  original_value: string | null;
  new_value: string | null;
  reason: string;
  corrected_by: string;
  corrected_at: string;
}

// ── small helpers a screen will want ─────────────────────────────────

/**
 * The stage a screen should put in front of the operator, or null when
 * there is none.
 *
 * The first stage that is not complete, by sequence — the same choice
 * batch_stage_start() makes when it decides what is blocking. This is a
 * restatement of that rule for the interface's benefit, not a second
 * source of it: nothing checks the two against each other, so if the
 * database's rule changes, change this by hand. The database remains the
 * one that refuses.
 */
export function nextActionableStage(stages: BatchStage[]): BatchStage | null {
  return [...stages]
    .sort((a, b) => a.sequence_no - b.sequence_no)
    .find(s => s.status !== 'complete') ?? null;
}

/** True when every stage is complete, which is when closure is possible. */
export function isReadyToClose(stages: BatchStage[]): boolean {
  //  An empty list is NOT ready. A batch whose stages have not loaded
  //  looks identical to one with none, and offering an irreversible
  //  closure on a failed read is the worst way to be wrong here.
  return stages.length > 0 && stages.every(s => s.status === 'complete');
}

/**
 * Readings that are out of specification and have not been corrected.
 *
 * `in_specification === null` is UNKNOWN — the formula set no limits — and
 * is deliberately not counted as a failure. Counting it would cry wolf on
 * every textual observation; rendering it as a pass would be worse. A
 * screen should show it as "no limits recorded".
 */
export function outOfSpecificationReadings(readings: BatchStageReading[]): BatchStageReading[] {
  const superseded = new Set(readings.map(r => r.corrected_from_id).filter(Boolean) as string[]);
  return readings.filter(r => r.in_specification === false && !superseded.has(r.id));
}
