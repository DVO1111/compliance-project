import { logger } from '../logger';

/**
 * Line clearance: the shapes, and the judgements a screen makes locally.
 *
 * Everything line clearance needs that does NOT bind the Supabase
 * client lives here, so it can be tested without a project, a network or
 * a .env — including the gate, which takes its client as an argument for
 * exactly that reason. lineClearanceService wires it to the real client
 * and holds the rest. See src/tests/lineClearance.test.ts.
 *
 * NOTHING HERE IS A CONTROL. Every rule below is a RESTATEMENT of one the
 * database enforces in 20261012000000_line_clearance.sql, so a screen can
 * grey out a button instead of offering one that will be refused. If you
 * are tempted to add a rule here that has no counterpart in SQL, that is
 * the signal to go and write the SQL — the browser holds the anon key and
 * talks straight to PostgREST, so this file is advice, not a boundary.
 */

/** The slice of a Supabase client the gate needs, so it can be tested
 *  without a project, a network or a .env. */
export interface ClearanceGateClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface ClearanceCheckResult {
  /** True ONLY when the server positively confirmed the line is clear.
   *  Never true by default, and never true on an error. */
  cleared: boolean;
  /** Why not, in a sentence fit to show a person. Null when cleared. */
  reason: string | null;
  /** Set when the CHECK failed, as opposed to the line being legitimately
   *  blocked. A caller that wants to distinguish "you may not" from "we
   *  could not tell" reads this; one that only cares whether to proceed
   *  reads `cleared` and is correct either way. */
  checkFailed: boolean;
}

/**
 * Asks the database whether the batch's line carries a verified clearance.
 *
 * Exported with an injectable client so the "an error is not permission"
 * behaviour can be tested directly. `isLineCleared` below is the ordinary
 * entry point.
 */
export async function checkLineCleared(
  client: ClearanceGateClient,
  batchId: string | null | undefined,
): Promise<ClearanceCheckResult> {
  if (!batchId) {
    return {
      cleared: false,
      reason: 'No batch was given, so no line clearance could be checked.',
      checkFailed: true,
    };
  }

  let data: unknown;
  let error: { message: string } | null;
  try {
    ({ data, error } = await client.rpc('line_clearance_block_reason', { p_batch_id: batchId }));
  } catch (e: any) {
    //  A thrown error — the client itself failing rather than the query.
    logger.error('[line-clearance] gate threw', e);
    return {
      cleared: false,
      reason: 'The line clearance could not be checked, so dispensing is blocked.',
      checkFailed: true,
    };
  }

  if (error) {
    logger.error('[line-clearance] gate failed', { batchId, error });
    return {
      cleared: false,
      reason: 'The line clearance could not be checked, so dispensing is blocked.',
      checkFailed: true,
    };
  }

  //  NULL from the function means cleared. Anything else is the reason.
  //  A non-string, non-null value is not an answer this code understands,
  //  and an answer it does not understand is not permission.
  if (data === null || data === undefined) {
    return { cleared: true, reason: null, checkFailed: false };
  }
  if (typeof data !== 'string') {
    logger.error('[line-clearance] gate returned an unexpected shape', { batchId, data });
    return {
      cleared: false,
      reason: 'The line clearance check returned something unexpected, so dispensing is blocked.',
      checkFailed: true,
    };
  }
  return { cleared: false, reason: data, checkFailed: false };
}


export type ClearanceStatus = 'in_progress' | 'performed' | 'verified' | 'failed' | 'cancelled';
export type CheckResult = 'pass' | 'fail' | 'not_applicable';
export type ChangeoverResult = 'pass' | 'fail';

export interface ProductionLine {
  id: string;
  company_id: string;
  code: string;
  name: string;
  description: string | null;
  area: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistTemplateItem {
  id: string;
  company_id: string;
  line_id: string;
  item_code: string;
  label: string;
  requires_record_reference: boolean;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  note: string | null;
  created_at: string;
}

export interface LineClearance {
  id: string;
  company_id: string;
  line_id: string;
  batch_id: string;
  previous_batch_id: string | null;
  previous_product_name: string | null;
  /** Mirror of the engine. A direct write is refused by the database. */
  status: ClearanceStatus;
  performed_by: string | null;
  performed_at: string | null;
  performed_signature_id: string | null;
  verified_by: string | null;
  verified_at: string | null;
  verified_signature_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClearanceCheck {
  id: string;
  company_id: string;
  clearance_id: string;
  item_code: string;
  /** Snapshotted at open time. Editing the template does not change it. */
  label: string;
  requires_record_reference: boolean;
  is_required: boolean;
  sort_order: number;
  /** null is UNANSWERED, which is not a pass and not a value. */
  result: CheckResult | null;
  record_reference: string | null;
  note: string | null;
  answered_by: string | null;
  answered_at: string | null;
  created_at: string;
}

export interface ChangeoverVerification {
  id: string;
  company_id: string;
  clearance_id: string;
  method: string;
  result: ChangeoverResult;
  detail: string | null;
  measured_value: number | null;
  limit_value: number | null;
  unit: string | null;
  performed_by: string;
  performed_at: string;
  created_at: string;
}

export interface ClearanceOverride {
  id: string;
  company_id: string;
  clearance_id: string;
  verification_id: string;
  authorised_by: string;
  reason: string;
  signature_id: string;
  decided_at: string;
}

/** The states in which the line is NOT clear, for rendering. */
export const BLOCKING_STATUSES: ClearanceStatus[] = ['in_progress', 'performed', 'failed', 'cancelled'];

export const STATUS_LABELS: Record<ClearanceStatus, string> = {
  in_progress: 'In Progress',
  performed: 'Awaiting Verification',
  verified: 'Verified — Line Clear',
  failed: 'Failed — Line Blocked',
  cancelled: 'Cancelled',
};

/**
 * The required items still standing between the clearance and a
 * signature: unanswered, or answered fail.
 *
 * An unanswered item is deliberately counted. It is the absence of an
 * answer, not a neutral state, and treating it as "not a problem yet" is
 * how a checklist gets signed with half of it blank.
 */
export function outstandingItems(items: ClearanceCheck[]): ClearanceCheck[] {
  return [...items]
    .filter(i => i.is_required && (i.result === null || i.result === 'fail'))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * True when every required item has been answered pass or reasoned
 * not-applicable.
 *
 * FALSE for an empty list. A clearance whose items failed to load looks
 * identical to one with none, and "all zero items pass" would offer a
 * signature on a checklist nobody saw. The database refuses an empty
 * checklist outright (LINE_CLEARANCE_EMPTY_CHECKLIST); this is the
 * interface's half of the same caution.
 */
export function isChecklistComplete(items: ClearanceCheck[]): boolean {
  return items.length > 0 && outstandingItems(items).length === 0;
}

/**
 * Whether the clearance can be signed by the person who did the work.
 *
 * Mirrors line_clearance_perform(): the checklist must be complete AND a
 * PASSING changeover verification must be on file. A failing one does not
 * satisfy the requirement — it blocks the line.
 */
export function canPerform(
  clearance: Pick<LineClearance, 'status'>,
  items: ClearanceCheck[],
  verifications: ChangeoverVerification[],
): boolean {
  if (clearance.status !== 'in_progress') return false;
  if (!isChecklistComplete(items)) return false;
  return verifications.some(v => v.result === 'pass');
}

/**
 * Whether this viewer may verify.
 *
 * The clause in the brief is "One user can both perform and verify", so
 * the viewer being the performer is the case this exists to answer. A
 * missing viewer id returns false rather than true: not knowing who is
 * looking is not permission.
 */
export function canVerify(
  clearance: Pick<LineClearance, 'status' | 'performed_by'>,
  viewerId: string | null | undefined,
): boolean {
  if (clearance.status !== 'performed') return false;
  if (!viewerId) return false;
  return clearance.performed_by !== viewerId;
}

/**
 * The failing verification an override would answer — the most recent one.
 *
 * Mirrors the guard on entity_current_state, which looks at the LATEST
 * failure: a decision authorises one failure, and a later, different
 * failure needs its own. Returns null when the clearance failed on a
 * checklist item instead, where the way forward is a restart.
 */
export function latestFailure(verifications: ChangeoverVerification[]): ChangeoverVerification | null {
  return [...verifications]
    .filter(v => v.result === 'fail')
    .sort((a, b) => b.performed_at.localeCompare(a.performed_at))[0] ?? null;
}

/**
 * Whether an override is even the right route out of a failure.
 *
 * Only a failed CHANGEOVER VERIFICATION can be overridden. A clearance
 * that failed on its checklist has nothing for a decision to authorise,
 * and the database says so (LINE_CLEARANCE_OVERRIDE_NOT_APPLICABLE).
 */
export function canOverride(
  clearance: Pick<LineClearance, 'status'>,
  verifications: ChangeoverVerification[],
  overrides: ClearanceOverride[],
): boolean {
  if (clearance.status !== 'failed') return false;
  const failure = latestFailure(verifications);
  if (!failure) return false;
  //  One decision per failure. If this failure is already answered, the
  //  move should have happened; offering it again is offering a refusal.
  return !overrides.some(o => o.verification_id === failure.id);
}
