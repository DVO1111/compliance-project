/**
 * In-process control and OOS handling — Week 4 item 11.
 *
 * A typed surface over the RPCs and tables in
 * supabase/migrations/20261015000000_inprocess_control_and_oos.sql.
 *
 * The judgements live in inprocessModel.ts, which imports no client and
 * so tests without a project. This file binds the real one.
 *
 * WHAT THIS FILE WILL NOT DO
 * --------------------------
 * - It will not refuse to record a reading because the number is bad.
 *   Item 11's first NOT DONE IF is "an OOS reading blocks entry", and
 *   every path here saves first and asks afterwards.
 * - It will not create a deviation. Not on an out-of-specification
 *   reading, not on a zone 3 reading, not on an 'investigate' decision.
 *   That is item 11's second NOT DONE IF, and Week 6 owns the link.
 * - It will not stop a line, pause a stage, or change any machine state.
 *   That is the third.
 *
 * This file is NOT a security boundary. The browser holds the anon key;
 * every rule above is enforced in the database, and what is here exists
 * so an operator is told what is happening before the save rather than
 * after it.
 */

import { supabase } from '../supabase';
import { recordAuditEvent, type AuditEventParams } from '../auditService';

/**
 * Who is performing the act, for the audit row.
 *
 * Taken from the audit type rather than re-declared, so it cannot drift
 * from what recordAuditEvent requires. Every sibling service in this
 * folder — dispensing, line clearance, instruments — takes these two the
 * same way: from the caller, which holds the session.
 */
export type Actor = Pick<AuditEventParams, 'userId' | 'companyId'>;
import { logger } from '../logger';
import {
  fetchSamplingDue,
  type InprocessClient,
  type SamplingDue,
} from './inprocessModel';
import type {
  ProductWeightLimits, StageReading, OosEscalation,
  StageParameterSpec, WeightZone, ZoneAction, OosDecision,
} from './inprocessModel';

export type {
  ProductWeightLimits, StageReading, OosEscalation, SamplingDue,
  StageParameterSpec, WeightZone, ZoneAction, OosDecision,
  ZoneVerdict, ReadingAdvice, InprocessClient,
} from './inprocessModel';
export {
  weightZone, limitsAreOrdered, isInSpecification, adviseOnReading,
  sortByUrgency, describeDue, isOpen, canDecide,
  ZONE_ACTIONS, OOS_DECISIONS,
} from './inprocessModel';

export interface InprocessFailure {
  ok: false;
  code: string;
  message: string;
  /**
   * True only for the one refusal that is not a failure: the reading is
   * out of specification and the database is asking the person to
   * acknowledge it. Nothing was stored, and the remedy is to tick the box
   * and call again — which is a different thing to tell an operator than
   * "something went wrong", and conflating the two is how an operator
   * concludes the system will not take their number.
   */
  needsAcknowledgement?: boolean;
}

export type InprocessResult<T> = ({ ok: true } & T) | InprocessFailure;

/** The code the reading RPC raises when it wants an acknowledgement. */
export const OOS_ACKNOWLEDGEMENT_CODE = 'BSPR_OOS_NEEDS_ACKNOWLEDGEMENT';

function toFailure(
  error: { message?: string } | null,
  fallback: string,
): InprocessFailure {
  const raw = error?.message ?? fallback;
  const match = raw.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/s);
  const code = match ? match[1] : 'INPROCESS_ERROR';
  const message = match ? match[2].trim() : raw;
  return {
    ok: false,
    code,
    message,
    needsAcknowledgement: code === OOS_ACKNOWLEDGEMENT_CODE,
  };
}

// ── sampling prompts ─────────────────────────────────────────────────

/**
 * What is due on a stage now, most overdue first.
 *
 * A failure here returns an empty list and `checkFailed: true` rather
 * than throwing, because this is a PROMPT and not a permission: an
 * unreachable server must not stop anyone recording a reading. That is
 * the opposite of the quarantine, clearance and calibration gates, where
 * an unanswered question has to read as "no".
 */
export function samplingDue(
  batchStageId: string | null | undefined,
): Promise<{ due: SamplingDue[]; checkFailed: boolean }> {
  return fetchSamplingDue(supabase as unknown as InprocessClient, batchStageId);
}

// ── the weight limits ────────────────────────────────────────────────

export async function getWeightLimits(productId: string): Promise<ProductWeightLimits | null> {
  const { data, error } = await (supabase as any)
    .from('product_weight_limits')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();
  if (error) {
    logger.error('[inprocess] getWeightLimits failed', { productId, error });
    return null;
  }
  return (data as ProductWeightLimits) ?? null;
}

export async function listWeightLimits(companyId: string): Promise<ProductWeightLimits[]> {
  const { data, error } = await (supabase as any)
    .from('product_weight_limits')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  if (error) {
    logger.error('[inprocess] listWeightLimits failed', { companyId, error });
    return [];
  }
  return (data as ProductWeightLimits[]) ?? [];
}

export interface WeightLimitsInput {
  companyId: string;
  /** Who is setting the limits — it goes on the audit row. */
  userId: string;
  productId: string;
  targetValue: number;
  lal: number;
  lwl: number;
  uwl: number;
  ual: number;
  unit: string;
  zone1Action?: ZoneAction;
  zone2uAction?: ZoneAction;
  zone2lAction?: ZoneAction;
  zone3uAction?: ZoneAction;
  zone3lAction?: ZoneAction;
  notes?: string | null;
}

/**
 * Sets a product's weight variation limits.
 *
 * One row per product, so this upserts on product_id. The database checks
 * the ordering; `limitsAreOrdered` in the model lets a form say so first.
 */
export async function saveWeightLimits(
  input: WeightLimitsInput,
): Promise<InprocessResult<{ limits: ProductWeightLimits }>> {
  const row = {
    company_id: input.companyId,
    product_id: input.productId,
    target_value: input.targetValue,
    lal: input.lal,
    lwl: input.lwl,
    uwl: input.uwl,
    ual: input.ual,
    unit: input.unit,
    zone_1_action: input.zone1Action ?? 'accept',
    zone_2u_action: input.zone2uAction ?? 'adjust',
    zone_2l_action: input.zone2lAction ?? 'adjust',
    zone_3u_action: input.zone3uAction ?? 'reject',
    zone_3l_action: input.zone3lAction ?? 'reject',
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabase as any)
    .from('product_weight_limits')
    .upsert(row, { onConflict: 'product_id' })
    .select('*')
    .single();

  if (error) {
    logger.error('[inprocess] saveWeightLimits failed', { productId: input.productId, error });
    return toFailure(error, 'The weight limits could not be saved.');
  }

  //  Worth auditing on its own: changing an action limit changes what
  //  every later reading on that product is judged against.
  await recordAuditEvent({
    userId: input.userId,
    companyId: input.companyId,
    action: 'product_weight_limits.save',
    entityType: 'product',
    entityId: input.productId,
    metadata: {
      lal: input.lal, lwl: input.lwl, uwl: input.uwl, ual: input.ual,
      unit: input.unit,
    },
  }).catch(() => undefined);

  return { ok: true, limits: data as ProductWeightLimits };
}

// ── recording a reading ──────────────────────────────────────────────

export interface RecordReadingInput {
  stageId: string;
  formulaParameterId: string;
  value?: number | null;
  text?: string | null;
  /** The person has seen the out-of-specification flag. Required by the
   *  database for a reading that is out of specification — an
   *  acknowledgement, not a gate. */
  acknowledged?: boolean;
}

export interface RecordedReading {
  readingId: string;
  sequenceNo: number | null;
  recordedAt: string | null;
  inSpecification: boolean | null;
  weightZone: WeightZone | null;
  zoneAction: ZoneAction | null;
  /** The product has no weight limits, so this reading could not be
   *  zoned. It was still stored and still judged against specification —
   *  a screen says "no limits configured" rather than showing a blank. */
  zoneUnclassified: boolean;
  /** The database's own view of whether escalation is worth offering. */
  escalationOffered: boolean;
}

/**
 * Records one in-process reading.
 *
 * The value is stored whether or not it is in specification. The one
 * thing the database asks for is an acknowledgement on an
 * out-of-specification reading, and `needsAcknowledgement` on the failure
 * says so distinctly from every other error, because "tick the box" and
 * "something went wrong" are different things to tell an operator.
 */
export async function recordReading(
  input: RecordReadingInput,
): Promise<InprocessResult<{ reading: RecordedReading }>> {
  const { data, error } = await (supabase as any).rpc('batch_stage_record_reading', {
    p_stage_id: input.stageId,
    p_formula_parameter_id: input.formulaParameterId,
    p_reading_value: input.value ?? null,
    p_reading_text: input.text ?? null,
    p_oos_acknowledged: input.acknowledged ?? false,
  });

  if (error) {
    const failure = toFailure(error, 'The reading could not be recorded.');
    if (failure.needsAcknowledgement) {
      //  Not an error: the expected, designed answer to an
      //  out-of-specification value. Logged at info so a flood of them
      //  does not read as a system fault in the logs either.
      logger.info('[inprocess] reading awaits acknowledgement', { stageId: input.stageId });
    } else {
      logger.error('[inprocess] recordReading failed', { stageId: input.stageId, error });
    }
    return failure;
  }

  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    reading: {
      readingId: String(r.reading_id ?? ''),
      sequenceNo: r.sequence_no === null || r.sequence_no === undefined
        ? null : Number(r.sequence_no),
      recordedAt: typeof r.recorded_at === 'string' ? r.recorded_at : null,
      inSpecification: typeof r.in_specification === 'boolean' ? r.in_specification : null,
      weightZone: (r.weight_zone as WeightZone | null) ?? null,
      zoneAction: (r.zone_action as ZoneAction | null) ?? null,
      zoneUnclassified: r.zone_unclassified === true,
      escalationOffered: r.escalation_offered === true,
    },
  };
}

export async function listReadings(
  batchStageId: string,
  formulaParameterId?: string,
): Promise<StageReading[]> {
  let q = (supabase as any)
    .from('batch_stage_parameter_readings')
    .select('*')
    .eq('batch_stage_id', batchStageId);
  if (formulaParameterId) q = q.eq('formula_parameter_id', formulaParameterId);

  const { data, error } = await q
    .order('formula_parameter_id', { ascending: true })
    .order('sequence_no', { ascending: true });
  if (error) {
    logger.error('[inprocess] listReadings failed', { batchStageId, error });
    return [];
  }
  return (data as StageReading[]) ?? [];
}

// ── escalation and the supervisor's decision ─────────────────────────

/**
 * Raises a reading to a supervisor.
 *
 * OFFERED, never required. The reading is already stored by the time this
 * is callable; refusing to escalate leaves the reading exactly as it is.
 */
export async function escalateReading(
  readingId: string,
  note?: string | null,
): Promise<InprocessResult<{ escalationId: string }>> {
  const { data, error } = await (supabase as any).rpc('inprocess_escalate_reading', {
    p_reading_id: readingId,
    p_note: note ?? null,
  });
  if (error) {
    logger.error('[inprocess] escalateReading failed', { readingId, error });
    return toFailure(error, 'The reading could not be escalated.');
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return { ok: true, escalationId: String(r.escalation_id ?? '') };
}

/**
 * Records the supervisor's decision.
 *
 * The person who raised the escalation cannot decide it; the database
 * refuses that, and `canDecide` in the model lets a screen avoid offering
 * a button that will be rejected.
 *
 * NO DEVIATION IS CREATED, including for 'investigate'. The result's
 * `deviationCreated` is returned as the database reports it, so if that
 * ever becomes true somebody will see it here rather than discovering it
 * in a deviation log.
 */
export async function decideEscalation(
  escalationId: string,
  decision: OosDecision,
  reason: string,
  actor: Actor,
  signatureId?: string | null,
): Promise<InprocessResult<{ decision: OosDecision; deviationCreated: boolean }>> {
  const { data, error } = await (supabase as any).rpc('inprocess_decide_escalation', {
    p_escalation_id: escalationId,
    p_decision: decision,
    p_reason: reason,
    p_signature_id: signatureId ?? null,
  });
  if (error) {
    logger.error('[inprocess] decideEscalation failed', { escalationId, error });
    return toFailure(error, 'The decision could not be recorded.');
  }
  const r = (data ?? {}) as Record<string, unknown>;

  await recordAuditEvent({
    userId: actor.userId,
    companyId: actor.companyId,
    action: 'inprocess_oos.decide',
    entityType: 'inprocess_oos_escalation',
    entityId: escalationId,
    metadata: { decision },
  }).catch(() => undefined);

  return {
    ok: true,
    decision: (r.decision as OosDecision) ?? decision,
    deviationCreated: r.deviation_created === true,
  };
}

export async function listEscalations(
  companyId: string,
  opts: { openOnly?: boolean; readingId?: string } = {},
): Promise<OosEscalation[]> {
  let q = (supabase as any)
    .from('inprocess_oos_escalations')
    .select('*')
    .eq('company_id', companyId);
  if (opts.openOnly) q = q.is('decision', null);
  if (opts.readingId) q = q.eq('reading_id', opts.readingId);

  const { data, error } = await q.order('raised_at', { ascending: false });
  if (error) {
    logger.error('[inprocess] listEscalations failed', { companyId, error });
    return [];
  }
  return (data as OosEscalation[]) ?? [];
}
