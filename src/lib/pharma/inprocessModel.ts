import { logger } from '../logger';

/**
 * In-process control and OOS handling — Week 4 item 11.
 *
 * The shapes, the zone classifier and the judgements a screen makes.
 * Nothing here imports the Supabase client, so all of it tests without a
 * project, a network or a .env.
 *
 * TWO RULES ABOVE ALL OTHERS IN THIS FILE
 * ---------------------------------------
 * 1. AN OUT-OF-SPECIFICATION READING MUST STILL BE ENTERABLE. "An OOS
 *    reading blocks entry" is item 11's first NOT DONE IF, and Damilola
 *    was explicit and repeated on it. So nothing in this file refuses a
 *    reading, hides the save button, or disables an input on the grounds
 *    that the number is bad. What a bad number gets is an
 *    acknowledgement and an offer to escalate.
 *
 * 2. THERE IS NO INTERLOCK. Item 11's third NOT DONE IF is "the
 *    interlock path was built anyway". No function here stops a line,
 *    pauses a stage or changes any machine state, and none should be
 *    added without the interlock work being commissioned on its own
 *    terms.
 *
 * The zone boundaries below are the same comparisons, in the same order,
 * as weight_variation_zone() in
 * supabase/migrations/20261015000000_inprocess_control_and_oos.sql. If
 * you change one, change both in the same commit: a screen that paints a
 * reading green while the database filed it as zone 2 is worse than
 * either answer alone.
 */

// ── the shapes ───────────────────────────────────────────────────────

/** Zone 1 is inside the warning limits; 2U/2L are between warning and
 *  action; 3U/3L are beyond the action limits. */
export type WeightZone = '1' | '2U' | '2L' | '3U' | '3L';

/** What the product says to do in a zone. Configuration, not a constant —
 *  a product that resamples at the action limit instead of rejecting says
 *  so in its own row. */
export type ZoneAction = 'accept' | 'adjust' | 'resample' | 'reject';

/** A supervisor's verdict on an escalated reading. Wider than ZoneAction
 *  by one: 'investigate' is a decision a person can reach and an action a
 *  product cannot be configured to take automatically. */
export type OosDecision = ZoneAction | 'investigate';

export const ZONE_ACTIONS: readonly ZoneAction[] = [
  'accept', 'adjust', 'resample', 'reject',
];
export const OOS_DECISIONS: readonly OosDecision[] = [
  'accept', 'adjust', 'resample', 'reject', 'investigate',
];

export interface ProductWeightLimits {
  id: string;
  company_id: string;
  product_id: string;
  target_value: number;
  /** Lower action, lower warning, upper warning, upper action. The
   *  database enforces lal < lwl <= target <= uwl < ual. */
  lal: number;
  lwl: number;
  uwl: number;
  ual: number;
  unit: string;
  zone_1_action: ZoneAction;
  zone_2u_action: ZoneAction;
  zone_2l_action: ZoneAction;
  zone_3u_action: ZoneAction;
  zone_3l_action: ZoneAction;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageParameterSpec {
  id: string;
  stage_id: string;
  parameter: string;
  parameter_type: 'machine_setting' | 'product_attribute';
  unit: string | null;
  target_value: number | null;
  min_value: number | null;
  max_value: number | null;
  is_critical: boolean;
  sort_order: number;
  /** null means this test is never prompted for on a timer. */
  sampling_interval_minutes: number | null;
  /** Only a product_attribute may be the weight-variation test. */
  is_weight_variation: boolean;
}

export interface StageReading {
  id: string;
  company_id: string;
  batch_stage_id: string;
  formula_parameter_id: string | null;
  parameter_name: string;
  parameter_type: string;
  reading_value: number | null;
  reading_text: string | null;
  unit: string | null;
  /** Derived by trigger from the parameter's own min/max. Independent of
   *  the zone: a reading can be in specification and in zone 2U. */
  in_specification: boolean | null;
  /** Assigned by the database, per test, starting at one. */
  sequence_no: number | null;
  /** Derived and snapshotted; null when the product has no limits or the
   *  test is not the weight-variation test. */
  weight_zone: WeightZone | null;
  zone_action: ZoneAction | null;
  zone_lal: number | null;
  zone_lwl: number | null;
  zone_uwl: number | null;
  zone_ual: number | null;
  oos_acknowledged_by: string | null;
  oos_acknowledged_at: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

export interface OosEscalation {
  id: string;
  company_id: string;
  reading_id: string;
  raised_by: string;
  raised_at: string;
  raised_note: string | null;
  /** null while the escalation is open. */
  decision: OosDecision | null;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  signature_id: string | null;
  /** WEEK 6. Set only by a human decision. Nothing in this codebase
   *  writes it, because "an OOS reading creates a deviation
   *  automatically" is item 11's second NOT DONE IF. */
  deviation_id: string | null;
  created_at: string;
}

export interface SamplingDue {
  formula_parameter_id: string;
  parameter: string;
  parameter_type: string;
  interval_minutes: number;
  last_recorded_at: string | null;
  next_due_at: string;
  minutes_overdue: number;
  readings_taken: number;
}

// ── the zone classifier ──────────────────────────────────────────────

export interface ZoneVerdict {
  /** null when the product has no limits configured. Reported, never
   *  defaulted: an unconfigured product reading as zone 1 would be a
   *  green light nobody set. */
  zone: WeightZone | null;
  action: ZoneAction | null;
  limitsConfigured: boolean;
}

/**
 * Classifies a weight against a product's own limits.
 *
 *     zone 1   LWL <= v <= UWL
 *     zone 2U  UWL <  v <= UAL
 *     zone 3U  v > UAL
 *     zone 2L  LAL <= v <  LWL
 *     zone 3L  v < LAL
 *
 * A reading exactly ON a limit is in the calmer zone, because a limit is
 * the edge of what is acceptable and not the first value that is not.
 *
 * NO EPSILON, DELIBERATELY. The dispensing tolerance check needs one
 * because its limit is COMPUTED (quantity x percent / 100) and binary
 * floating point does not reproduce the exact numeric arithmetic
 * Postgres does. Here nothing is computed: the reading is a number a
 * person typed and the four limits are stored values, so an exact
 * comparison is what agrees with SQL. Adding a tolerance would
 * manufacture the disagreement it looks like it prevents — a value an
 * epsilon above UWL would read as "on the limit" here and "above it" in
 * the database.
 */
export function weightZone(
  limits: Pick<ProductWeightLimits,
    'lal' | 'lwl' | 'uwl' | 'ual' |
    'zone_1_action' | 'zone_2u_action' | 'zone_2l_action' |
    'zone_3u_action' | 'zone_3l_action'> | null | undefined,
  value: number | null | undefined,
): ZoneVerdict {
  if (!limits || value === null || value === undefined || !Number.isFinite(value)) {
    return { zone: null, action: null, limitsConfigured: !!limits };
  }

  let zone: WeightZone;
  let action: ZoneAction;
  if (value > limits.ual) {
    zone = '3U'; action = limits.zone_3u_action;
  } else if (value > limits.uwl) {
    zone = '2U'; action = limits.zone_2u_action;
  } else if (value >= limits.lwl) {
    zone = '1'; action = limits.zone_1_action;
  } else if (value >= limits.lal) {
    zone = '2L'; action = limits.zone_2l_action;
  } else {
    zone = '3L'; action = limits.zone_3l_action;
  }
  return { zone, action, limitsConfigured: true };
}

/** Whether a set of limits is internally coherent, so a form can say so
 *  before the database refuses the row. Same predicate as pwl_order_chk. */
export function limitsAreOrdered(
  l: Pick<ProductWeightLimits, 'lal' | 'lwl' | 'uwl' | 'ual' | 'target_value'>,
): boolean {
  return l.lal < l.lwl && l.lwl <= l.target_value
      && l.target_value <= l.uwl && l.uwl < l.ual;
}

/** Specification, which is the parameter's own min/max and has nothing to
 *  do with zones. Both are reported; neither is derived from the other. */
export function isInSpecification(
  spec: Pick<StageParameterSpec, 'min_value' | 'max_value'>,
  value: number | null | undefined,
): boolean | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (spec.min_value === null && spec.max_value === null) return null;
  if (spec.min_value !== null && value < spec.min_value) return false;
  if (spec.max_value !== null && value > spec.max_value) return false;
  return true;
}

// ── what a screen does about a reading ───────────────────────────────

export interface ReadingAdvice {
  /** Always true. A reading is always enterable — see rule 1 at the top
   *  of this file. Present as a field rather than left implicit so that
   *  anybody tempted to make it conditional has to read why not. */
  canSave: true;
  /** True when the person has to tick "I have seen this" before the save
   *  goes through. Required by the database for an out-of-specification
   *  reading, which is an acknowledgement, not a refusal. */
  needsAcknowledgement: boolean;
  /** True when a screen should OFFER escalation. Offered, never forced. */
  offerEscalation: boolean;
  zone: WeightZone | null;
  action: ZoneAction | null;
  inSpecification: boolean | null;
  /** 'none' | 'notice' | 'warning' | 'alarm' — for presentation only.
   *  Nothing branches on it. */
  severity: 'none' | 'notice' | 'warning' | 'alarm';
  messages: string[];
}

/**
 * What a screen should show and ask for, given a typed value.
 *
 * ADVICE ONLY. The database decides what is stored, and asks for the
 * acknowledgement itself; this exists so an operator is told why before
 * the save rather than after it.
 */
export function adviseOnReading(
  spec: Pick<StageParameterSpec, 'parameter' | 'unit' | 'min_value' | 'max_value' | 'is_weight_variation'>,
  limits: Parameters<typeof weightZone>[0],
  value: number | null | undefined,
): ReadingAdvice {
  const inSpec = isInSpecification(spec, value);
  const z = spec.is_weight_variation
    ? weightZone(limits, value)
    : { zone: null, action: null, limitsConfigured: false } as ZoneVerdict;

  const messages: string[] = [];
  const unit = spec.unit ? ` ${spec.unit}` : '';

  if (inSpec === false) {
    const range = [
      spec.min_value !== null ? `min ${spec.min_value}${unit}` : null,
      spec.max_value !== null ? `max ${spec.max_value}${unit}` : null,
    ].filter(Boolean).join(', ');
    messages.push(
      `${spec.parameter} is outside specification${range ? ` (${range})` : ''}. ` +
      'Record it anyway, acknowledge it, and escalate if the process needs a decision.',
    );
  }

  if (spec.is_weight_variation && !z.limitsConfigured) {
    messages.push(
      'No weight variation limits are configured for this product, so this reading ' +
      'cannot be zoned. It is still recorded and still judged against specification.',
    );
  } else if (z.zone && z.zone !== '1') {
    const edge = z.zone.endsWith('U') ? 'above' : 'below';
    const band = z.zone.startsWith('3') ? 'action' : 'warning';
    messages.push(
      `Zone ${z.zone}: ${edge} the ${band} limit. ` +
      `This product's configured response is to ${z.action}.`,
    );
  }

  let severity: ReadingAdvice['severity'] = 'none';
  if (z.zone === '3U' || z.zone === '3L' || inSpec === false) severity = 'alarm';
  else if (z.zone === '2U' || z.zone === '2L') severity = 'warning';
  else if (spec.is_weight_variation && !z.limitsConfigured) severity = 'notice';

  return {
    canSave: true,
    needsAcknowledgement: inSpec === false,
    //  Escalation is offered wherever somebody might reasonably want a
    //  supervisor's decision, which is wider than "out of specification":
    //  a zone 3 reading inside a loose specification is exactly the case
    //  a supervisor should see.
    offerEscalation: inSpec === false || z.zone === '3U' || z.zone === '3L',
    zone: z.zone,
    action: z.action,
    inSpecification: inSpec,
    severity,
    messages,
  };
}

/**
 * Sampling prompts, ordered most overdue first.
 *
 * The server already orders them; this re-sorts defensively because a
 * prompt list whose order depends on the transport is a prompt list that
 * will one day show the least urgent sample at the top.
 */
export function sortByUrgency(due: readonly SamplingDue[]): SamplingDue[] {
  return [...due].sort((a, b) => b.minutes_overdue - a.minutes_overdue);
}

/** Human wording for a prompt. Says HOW overdue, because "a sample is
 *  due" is a notification an operator learns to dismiss. */
export function describeDue(d: SamplingDue): string {
  const mins = Math.round(d.minutes_overdue);
  const when = mins < 1
    ? 'due now'
    : mins < 60
      ? `${mins} min overdue`
      : `${Math.floor(mins / 60)} h ${mins % 60} min overdue`;
  const taken = d.readings_taken === 0
    ? 'no readings yet'
    : `${d.readings_taken} reading${d.readings_taken === 1 ? '' : 's'} so far`;
  return `${d.parameter} — every ${d.interval_minutes} min, ${when} (${taken})`;
}

/** An escalation nobody has answered yet. */
export function isOpen(e: Pick<OosEscalation, 'decision'>): boolean {
  return e.decision === null;
}

/**
 * Whether this person may decide this escalation.
 *
 * The person who raised it may not, and the database refuses it too. A
 * screen that offers the button anyway produces an error the operator
 * cannot act on, so the rule is stated in both places.
 */
export function canDecide(
  e: Pick<OosEscalation, 'decision' | 'raised_by'>,
  userId: string | null | undefined,
): boolean {
  if (e.decision !== null) return false;
  if (!userId) return false;
  return e.raised_by !== userId;
}

// ── the sampling-due read ────────────────────────────────────────────

export interface InprocessClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Asks the database what is due on a stage.
 *
 * Unlike the quarantine, clearance and calibration gates, a FAILURE here
 * must not block anything: this is a prompt, not a permission. supabase-js
 * resolves with `{ data: null, error }`, and the honest reading of that is
 * "we do not know what is due", which is an empty prompt list and a logged
 * error — not a refusal to let anybody record a reading.
 */
export async function fetchSamplingDue(
  client: InprocessClient,
  batchStageId: string | null | undefined,
): Promise<{ due: SamplingDue[]; checkFailed: boolean }> {
  if (!batchStageId) return { due: [], checkFailed: true };

  let data: unknown;
  let error: { message: string } | null;
  try {
    ({ data, error } = await client.rpc('inprocess_sampling_due', {
      p_batch_stage_id: batchStageId,
    }));
  } catch (e: any) {
    logger.error('[inprocess] sampling_due threw', e);
    return { due: [], checkFailed: true };
  }

  if (error) {
    logger.error('[inprocess] sampling_due failed', { batchStageId, error });
    return { due: [], checkFailed: true };
  }
  if (!Array.isArray(data)) {
    //  Null or an unexpected shape. Not an empty list: "nothing is due"
    //  and "we could not ask" are different things, and a screen that
    //  conflates them tells an operator sampling is up to date when it
    //  has no idea.
    if (data !== null && data !== undefined) {
      logger.error('[inprocess] sampling_due returned an unexpected shape', { data });
    }
    return { due: [], checkFailed: true };
  }
  return { due: sortByUrgency(data as SamplingDue[]), checkFailed: false };
}
