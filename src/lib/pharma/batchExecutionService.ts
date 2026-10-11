/**
 * Batch record execution — stages, readings and corrections.
 *
 * The Wednesday line of the Week 4 schedule is "07 Batch record service.
 * 16, 17 screens." — the service is engineering's, the screens are design's.
 * This is that service: a typed surface over the RPCs added by
 * supabase/migrations/20261011000000_batch_record_and_stages.sql.
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 * It is not a security boundary. The browser holds the anon key and talks
 * straight to PostgREST, so every rule that matters — the stage sequence,
 * the second signature, the immutability of a reading, the permanence of
 * closure — is enforced in the database and merely SURFACED here. Nothing
 * below is the last line of defence, and nothing below should be the only
 * place a rule appears. If you find yourself adding a check here that has
 * no counterpart in SQL, that is the signal to go and add it in SQL.
 *
 * WHY EVERY FUNCTION RETURNS A RESULT RATHER THAN THROWING
 * -------------------------------------------------------
 * These calls fail for ORDINARY reasons: the stage before this one is not
 * finished, somebody else already signed, the batch closed while the
 * screen was open. Those are things to show a person, not exceptions to
 * bubble up — and the database's refusals are written as sentences for
 * exactly that purpose. A `{ ok: false, code, message }` keeps the
 * sentence and the code, so a screen can show one and branch on the other.
 */

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';
import type { BatchStage, BatchStageReading, BatchStageCorrection } from './batchExecutionModel';

//  Re-exported so a caller needs one import, not two. The shapes and the
//  local judgements live in batchExecutionModel so they can be tested
//  without a Supabase client; see the note at the top of that file.
export type {
  BatchStageStatus, ParameterType,
  BatchStage, BatchStageReading, BatchStageCorrection,
} from './batchExecutionModel';
export { nextActionableStage, isReadyToClose, outOfSpecificationReadings } from './batchExecutionModel';

export type ExecutionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

/**
 * Turns a PostgREST error into something a screen can use.
 *
 * The database's refusals are all `CODE: sentence`, so the code is lifted
 * out and the sentence kept as written. An unrecognised shape keeps the
 * whole message rather than being replaced by a generic one — a message
 * nobody wrote is worse than a message that reads oddly.
 */
function toFailure(error: { message?: string } | null, fallback: string): ExecutionResult<never> {
  const raw = error?.message ?? fallback;
  const match = raw.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/s);
  if (match) return { ok: false, code: match[1], message: match[2].trim() };
  return { ok: false, code: 'BATCH_ERROR', message: raw };
}

// ── reads ────────────────────────────────────────────────────────────

/** The stages of one batch, in the formula's own order. */
export async function listBatchStages(batchId: string, companyId: string): Promise<BatchStage[]> {
  const { data, error } = await (supabase as any)
    .from('batch_stages')
    .select('*')
    .eq('batch_id', batchId)
    .eq('company_id', companyId)
    .order('sequence_no', { ascending: true });
  if (error) { logger.error('listBatchStages:', error); return []; }
  return data ?? [];
}

/**
 * Every reading taken against a stage, newest first, INCLUDING the ones
 * that have been corrected.
 *
 * Superseded readings are returned deliberately. "A correction overwrites
 * the original value" is one of item 07's NOT DONE IF clauses, and a list
 * that quietly hides what was replaced recreates that failure in the
 * interface after the database went to some trouble to prevent it. Use
 * `corrected_from_id` to render the pair.
 */
export async function listStageReadings(stageId: string, companyId: string): Promise<BatchStageReading[]> {
  const { data, error } = await (supabase as any)
    .from('batch_stage_parameter_readings')
    .select('*')
    .eq('batch_stage_id', stageId)
    .eq('company_id', companyId)
    .order('recorded_at', { ascending: false });
  if (error) { logger.error('listStageReadings:', error); return []; }
  return data ?? [];
}

/** The append-only log of reopenings and corrections for a stage. */
export async function listStageCorrections(stageId: string, companyId: string): Promise<BatchStageCorrection[]> {
  const { data, error } = await (supabase as any)
    .from('batch_stage_corrections')
    .select('*')
    .eq('batch_stage_id', stageId)
    .eq('company_id', companyId)
    .order('corrected_at', { ascending: false });
  if (error) { logger.error('listStageCorrections:', error); return []; }
  return data ?? [];
}

// ── initiation ───────────────────────────────────────────────────────

export interface InitiateBatchInput {
  companyId: string;
  batchNumber: string;
  productId: string;
  manufacturingDate: string;
  expiryDate: string;
  batchSize: number;
  unit?: string;
  /** For contract manufacturing. Null for own-product batches. */
  customerName?: string | null;
  /** Omit to use the product's approved formula, which is the normal case
   *  and the only one that cannot pick the wrong version by accident. */
  formulaId?: string | null;
}

/**
 * Initiates a batch and instantiates its stages from the approved formula.
 *
 * The database refuses this unless the product is registered, its licence
 * is unexpired and an approved formula exists — item 07's three
 * preconditions. Each refusal arrives as a sentence naming which one.
 */
export async function initiateBatchRecord(
  input: InitiateBatchInput,
  userId: string,
): Promise<ExecutionResult<{ batchId: string; formulaId: string | null; formulaVersion: string | null; stages: number }>> {
  const { data, error } = await (supabase as any).rpc('batch_record_initiate', {
    p_company_id: input.companyId,
    p_batch_number: input.batchNumber,
    p_product_id: input.productId,
    p_manufacturing_date: input.manufacturingDate,
    p_expiry_date: input.expiryDate,
    p_batch_size: input.batchSize,
    p_unit: input.unit ?? 'kg',
    p_customer_name: input.customerName ?? null,
    p_formula_id: input.formulaId ?? null,
  });

  if (error) {
    logger.warn('[batch] initiation refused', { batchNumber: input.batchNumber, error });
    return toFailure(error, 'Unable to initiate the batch.');
  }

  const r = data as any;
  await recordAuditEvent({
    userId,
    companyId: input.companyId,
    action: 'batch_record_initiate',
    entityType: 'batch_record',
    entityId: r.batch_id,
    metadata: { batch_number: input.batchNumber, formula_version: r.formula_version, stages: r.stages },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for batch_record_initiate:', e));

  return {
    ok: true,
    batchId: r.batch_id,
    formulaId: r.formula_id ?? null,
    formulaVersion: r.formula_version ?? null,
    stages: r.stages ?? 0,
  };
}

// ── stage execution ──────────────────────────────────────────────────

/**
 * Starts a stage.
 *
 * Refused while any earlier stage of the batch is unfinished. That rule is
 * in the database, not here — "sequence enforced in the interface only" is
 * a NOT DONE IF — so a screen may grey the button, but this call is what
 * actually holds the line.
 */
export async function startBatchStage(stageId: string): Promise<ExecutionResult<{ toState: string }>> {
  const { data, error } = await (supabase as any).rpc('batch_stage_start', { p_stage_id: stageId });
  if (error) {
    logger.warn('[batch] stage start refused', { stageId, error });
    return toFailure(error, 'Unable to start the stage.');
  }
  return { ok: true, toState: (data as any)?.to_state ?? 'in_progress' };
}

export interface CompleteStageInput {
  stageId: string;
  /** From signElectronicRecord() against entity_type 'batch_stage',
   *  action 'complete', meaning 'authored'. */
  operatorSignatureId: string;
  /** Required where the stage was instantiated as needing verification,
   *  and must be a different person from the operator. */
  verifierId?: string | null;
  /** The verifier's own signature, meaning 'verified'. */
  verifierSignatureId?: string | null;
}

/**
 * Completes a stage with the operator's signature, and a second person's
 * where the stage requires one.
 *
 * Two refusals are worth handling distinctly in a screen:
 *   BATCH_STAGE_VERIFIER_REQUIRED      — ask for a second person
 *   BATCH_STAGE_SELF_VERIFIED          — the operator named themselves
 */
export async function completeBatchStage(input: CompleteStageInput): Promise<ExecutionResult<{ toState: string }>> {
  const { data, error } = await (supabase as any).rpc('batch_stage_complete', {
    p_stage_id: input.stageId,
    p_operator_signature_id: input.operatorSignatureId,
    p_verifier_id: input.verifierId ?? null,
    p_verifier_signature_id: input.verifierSignatureId ?? null,
  });
  if (error) {
    logger.warn('[batch] stage completion refused', { stageId: input.stageId, error });
    return toFailure(error, 'Unable to complete the stage.');
  }
  return { ok: true, toState: (data as any)?.to_state ?? 'complete' };
}

/**
 * Reopens a completed stage, logging the reopening with its reason.
 *
 * Refused once execution is closed, because closure is permanent. The
 * reason is not optional — the log entry is the point.
 */
export async function reopenBatchStage(stageId: string, reason: string): Promise<ExecutionResult<{ toState: string }>> {
  const { data, error } = await (supabase as any).rpc('batch_stage_reopen', {
    p_stage_id: stageId,
    p_reason: reason,
  });
  if (error) {
    logger.warn('[batch] stage reopen refused', { stageId, error });
    return toFailure(error, 'Unable to reopen the stage.');
  }
  return { ok: true, toState: (data as any)?.to_state ?? 'in_progress' };
}

// ── readings ─────────────────────────────────────────────────────────

/**
 * Records a reading against one of the stage's formula parameters.
 *
 * Note what is NOT passed: the unit, the target, and the limits. Those are
 * copied from the formula by the database. A client that could supply its
 * own acceptance criteria could declare anything in specification, which
 * would make `in_specification` worth nothing — so the parameter is named
 * and the criteria are fetched, never sent.
 */
export async function recordStageReading(args: {
  stageId: string;
  formulaParameterId: string;
  value?: number | null;
  text?: string | null;
}): Promise<ExecutionResult<{ readingId: string; inSpecification: boolean | null }>> {
  const { data, error } = await (supabase as any).rpc('batch_stage_record_reading', {
    p_stage_id: args.stageId,
    p_formula_parameter_id: args.formulaParameterId,
    p_reading_value: args.value ?? null,
    p_reading_text: args.text ?? null,
  });
  if (error) {
    logger.warn('[batch] reading refused', { stageId: args.stageId, error });
    return toFailure(error, 'Unable to record the reading.');
  }
  const r = data as any;
  return { ok: true, readingId: r.reading_id, inSpecification: r.in_specification ?? null };
}

/**
 * Corrects a reading by recording a NEW one that points back at it.
 *
 * There is deliberately no "update a reading" function, and the database
 * refuses one: "a correction overwrites the original value" is a NOT DONE
 * IF. Both numbers survive, and the log carries who, when, from what, to
 * what and why.
 */
export async function correctStageReading(args: {
  readingId: string;
  value?: number | null;
  text?: string | null;
  reason: string;
}): Promise<ExecutionResult<{ readingId: string; correctedFrom: string }>> {
  const { data, error } = await (supabase as any).rpc('batch_stage_correct_reading', {
    p_reading_id: args.readingId,
    p_reading_value: args.value ?? null,
    p_reading_text: args.text ?? null,
    p_reason: args.reason,
  });
  if (error) {
    logger.warn('[batch] correction refused', { readingId: args.readingId, error });
    return toFailure(error, 'Unable to record the correction.');
  }
  const r = data as any;
  return { ok: true, readingId: r.reading_id, correctedFrom: r.corrected_from };
}

// ── closure ──────────────────────────────────────────────────────────

/**
 * Closes manufacturing execution and hands the record to QC.
 *
 * This is IRREVERSIBLE and the screen calling it should say so: it freezes
 * every stage and reading, forbids reopening, and cannot be undone by
 * anyone — the database refuses to clear or backdate the closure, and
 * refuses to let a closed record return to manufacturing. Refused while
 * any stage is still incomplete.
 */
export async function closeBatchExecution(
  batchId: string,
  companyId: string,
  userId: string,
  comment?: string,
): Promise<ExecutionResult<{ toState: string }>> {
  const { data, error } = await (supabase as any).rpc('batch_record_close', {
    p_batch_id: batchId,
    p_comment: comment ?? null,
  });
  if (error) {
    logger.warn('[batch] closure refused', { batchId, error });
    return toFailure(error, 'Unable to close the batch.');
  }

  await recordAuditEvent({
    userId,
    companyId,
    action: 'batch_record_close',
    entityType: 'batch_record',
    entityId: batchId,
    metadata: { comment: comment ?? null },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for batch_record_close:', e));

  return { ok: true, toState: (data as any)?.to_state ?? 'qc_pending' };
}
