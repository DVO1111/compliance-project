/**
 * Line clearance and changeover verification — Week 4 item 08.
 *
 * A typed surface over the RPCs in
 * supabase/migrations/20261012000000_line_clearance.sql.
 *
 * THE ONE THING TO GET RIGHT IN THIS FILE
 * ---------------------------------------
 * supabase-js does not reject on a failed query — it RESOLVES with
 * `{ data: null, error }`. So the obvious implementation of the gate
 *
 *     const { data } = await client.rpc('line_clearance_block_reason', …);
 *     return { cleared: data === null };            // WRONG
 *
 * reads a network failure, a permission error and a dropped connection as
 * "the line is clear". The failure mode of that mistake is dispensing
 * into an uncleaned line, which is cross-contamination. Every path that
 * cannot PROVE the line is clear reports it as blocked, and
 * src/tests/lineClearance.test.ts exists mostly to hold that line — the
 * same rule, and the same reasoning, as materialDispensingService.
 *
 * Nothing here is a security boundary; the controls are in the database.
 */

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';
import { toFloorConditions, type FloorCondition } from '../floor/floorConditions';
import type {
  ProductionLine, ChecklistTemplateItem, LineClearance, ClearanceCheck,
  ChangeoverVerification, ClearanceOverride, CheckResult, ChangeoverResult,
} from './lineClearanceModel';

//  Re-exported so a caller needs one import. The shapes and the local
//  judgements live in lineClearanceModel so they can be tested without a
//  Supabase client; see the note at the top of that file.
export type {
  ClearanceStatus, CheckResult, ChangeoverResult,
  ProductionLine, ChecklistTemplateItem, LineClearance, ClearanceCheck,
  ChangeoverVerification, ClearanceOverride,
} from './lineClearanceModel';
export {
  BLOCKING_STATUSES, STATUS_LABELS,
  outstandingItems, isChecklistComplete, canPerform, canVerify,
  latestFailure, canOverride,
  checkLineCleared,
} from './lineClearanceModel';
export type { ClearanceGateClient, ClearanceCheckResult } from './lineClearanceModel';

import { checkLineCleared, type ClearanceGateClient, type ClearanceCheckResult } from './lineClearanceModel';

export type ClearanceResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

function toFailure(error: { message?: string } | null, fallback: string): ClearanceResult<never> {
  const raw = error?.message ?? fallback;
  const match = raw.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/s);
  if (match) return { ok: false, code: match[1], message: match[2].trim() };
  return { ok: false, code: 'LINE_CLEARANCE_ERROR', message: raw };
}

/** The ordinary entry point for the gate. */
export function isLineCleared(batchId: string | null | undefined): Promise<ClearanceCheckResult> {
  return checkLineCleared(supabase as unknown as ClearanceGateClient, batchId);
}

/**
 * The hard form, for callers that want to stop rather than branch.
 *
 * Item 09's dispensing must ALSO call the database's own
 * line_clearance_assert_cleared() inside its transaction. This is for the
 * screen, so the operator is told before they start typing — it is not
 * the control.
 */
export async function assertLineCleared(batchId: string | null | undefined): Promise<void> {
  const check = await isLineCleared(batchId);
  if (!check.cleared) throw new Error(check.reason ?? 'The line is not cleared.');
}

// ── lines and their checklists ───────────────────────────────────────

export async function listProductionLines(companyId: string, includeRetired = false): Promise<ProductionLine[]> {
  let q = (supabase as any)
    .from('production_lines')
    .select('*')
    .eq('company_id', companyId)
    .order('code', { ascending: true });
  if (!includeRetired) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) { logger.error('listProductionLines:', error); return []; }
  return data ?? [];
}

export async function createProductionLine(
  companyId: string,
  userId: string,
  line: { code: string; name: string; area?: string | null; description?: string | null },
): Promise<ProductionLine | null> {
  //  No checklist is sent. The database seeds the default items by
  //  trigger, so a line cannot exist with an empty checklist.
  const { data, error } = await (supabase as any)
    .from('production_lines')
    .insert({ ...line, company_id: companyId, created_by: userId })
    .select()
    .single();
  if (error) { logger.error('createProductionLine:', error); return null; }
  return data;
}

export async function listChecklistItems(
  lineId: string, companyId: string, includeRetired = false,
): Promise<ChecklistTemplateItem[]> {
  let q = (supabase as any)
    .from('line_clearance_checklist_items')
    .select('*')
    .eq('line_id', lineId)
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true });
  if (!includeRetired) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) { logger.error('listChecklistItems:', error); return []; }
  return data ?? [];
}

/** Assigns a batch to a line. Refused once that line has been cleared for
 *  the batch, because the clearance names a specific line. */
export async function assignBatchLine(batchId: string, lineId: string): Promise<ClearanceResult<{ lineCode: string }>> {
  const { data, error } = await (supabase as any).rpc('batch_record_assign_line', {
    p_batch_id: batchId, p_line_id: lineId,
  });
  if (error) {
    logger.warn('[line-clearance] line assignment refused', { batchId, lineId, error });
    return toFailure(error, 'Unable to assign the batch to that line.');
  }
  return { ok: true, lineCode: (data as any)?.line_code ?? '' };
}

// ── the clearance itself ─────────────────────────────────────────────

export async function listClearances(batchId: string, companyId: string): Promise<LineClearance[]> {
  const { data, error } = await (supabase as any)
    .from('line_clearance_records')
    .select('*')
    .eq('batch_id', batchId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('listClearances:', error); return []; }
  return data ?? [];
}

/** The clearance that counts: the most recent one for the batch. An older
 *  verified clearance superseded by a newer one does not open the line,
 *  which is the rule the gate applies too. */
export async function currentClearance(batchId: string, companyId: string): Promise<LineClearance | null> {
  const all = await listClearances(batchId, companyId);
  return all[0] ?? null;
}

export async function listClearanceChecks(clearanceId: string, companyId: string): Promise<ClearanceCheck[]> {
  const { data, error } = await (supabase as any)
    .from('line_clearance_check_results')
    .select('*')
    .eq('clearance_id', clearanceId)
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true });
  if (error) { logger.error('listClearanceChecks:', error); return []; }
  return data ?? [];
}

export async function listChangeoverVerifications(
  clearanceId: string, companyId: string,
): Promise<ChangeoverVerification[]> {
  const { data, error } = await (supabase as any)
    .from('line_changeover_verifications')
    .select('*')
    .eq('clearance_id', clearanceId)
    .eq('company_id', companyId)
    .order('performed_at', { ascending: false });
  if (error) { logger.error('listChangeoverVerifications:', error); return []; }
  return data ?? [];
}

export async function listOverrides(clearanceId: string, companyId: string): Promise<ClearanceOverride[]> {
  const { data, error } = await (supabase as any)
    .from('line_clearance_overrides')
    .select('*')
    .eq('clearance_id', clearanceId)
    .eq('company_id', companyId)
    .order('decided_at', { ascending: false });
  if (error) { logger.error('listOverrides:', error); return []; }
  return data ?? [];
}

export async function openClearance(args: {
  batchId: string;
  companyId: string;
  userId: string;
  previousBatchId?: string | null;
  notes?: string | null;
}): Promise<ClearanceResult<{ clearanceId: string; items: number }>> {
  const { data, error } = await (supabase as any).rpc('line_clearance_open', {
    p_batch_id: args.batchId,
    p_previous_batch_id: args.previousBatchId ?? null,
    p_notes: args.notes ?? null,
  });
  if (error) {
    logger.warn('[line-clearance] open refused', { batchId: args.batchId, error });
    return toFailure(error, 'Unable to open a line clearance.');
  }
  const r = data as any;

  await recordAuditEvent({
    userId: args.userId,
    companyId: args.companyId,
    action: 'line_clearance_open',
    entityType: 'line_clearance',
    entityId: r.clearance_id,
    metadata: { batch_id: args.batchId, items: r.items },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for line_clearance_open:', e));

  return { ok: true, clearanceId: r.clearance_id, items: r.items ?? 0 };
}

/**
 * Records one checklist answer.
 *
 * A pass on an item that demands evidence needs the record reference, and
 * not-applicable needs a reason — both refused by the database with a
 * sentence. A fail moves the clearance to failed immediately, so a screen
 * should expect the state to change under it.
 */
export async function answerChecklistItem(args: {
  clearanceId: string;
  itemCode: string;
  result: CheckResult;
  recordReference?: string | null;
  note?: string | null;
}): Promise<ClearanceResult<{ result: CheckResult }>> {
  const { data, error } = await (supabase as any).rpc('line_clearance_answer', {
    p_clearance_id: args.clearanceId,
    p_item_code: args.itemCode,
    p_result: args.result,
    p_record_reference: args.recordReference ?? null,
    p_note: args.note ?? null,
  });
  if (error) {
    logger.warn('[line-clearance] answer refused', { clearanceId: args.clearanceId, item: args.itemCode, error });
    return toFailure(error, 'Unable to record that answer.');
  }
  return { ok: true, result: (data as any)?.result ?? args.result };
}

/** Records a changeover verification. A failing result blocks the line. */
export async function recordChangeover(args: {
  clearanceId: string;
  method: string;
  result: ChangeoverResult;
  detail?: string | null;
  measuredValue?: number | null;
  limitValue?: number | null;
  unit?: string | null;
}): Promise<ClearanceResult<{ verificationId: string; result: ChangeoverResult }>> {
  const { data, error } = await (supabase as any).rpc('line_changeover_record', {
    p_clearance_id: args.clearanceId,
    p_method: args.method,
    p_result: args.result,
    p_detail: args.detail ?? null,
    p_measured_value: args.measuredValue ?? null,
    p_limit_value: args.limitValue ?? null,
    p_unit: args.unit ?? null,
  });
  if (error) {
    logger.warn('[line-clearance] changeover refused', { clearanceId: args.clearanceId, error });
    return toFailure(error, 'Unable to record the changeover verification.');
  }
  const r = data as any;
  return { ok: true, verificationId: r.verification_id, result: r.result };
}

/** The performer's signature. Needs every required item answered and a
 *  passing changeover verification on file. */
export async function performClearance(
  clearanceId: string, signatureId: string,
): Promise<ClearanceResult<{ toState: string }>> {
  const { data, error } = await (supabase as any).rpc('line_clearance_perform', {
    p_clearance_id: clearanceId, p_signature_id: signatureId,
  });
  if (error) {
    logger.warn('[line-clearance] perform refused', { clearanceId, error });
    return toFailure(error, 'Unable to sign the clearance.');
  }
  return { ok: true, toState: (data as any)?.to_state ?? 'performed' };
}

/** The second signature, which opens the line. Refused for the performer. */
export async function verifyClearance(
  clearanceId: string, signatureId: string,
): Promise<ClearanceResult<{ toState: string }>> {
  const { data, error } = await (supabase as any).rpc('line_clearance_verify', {
    p_clearance_id: clearanceId, p_signature_id: signatureId,
  });
  if (error) {
    logger.warn('[line-clearance] verify refused', { clearanceId, error });
    return toFailure(error, 'Unable to verify the clearance.');
  }
  return { ok: true, toState: (data as any)?.to_state ?? 'verified' };
}

/**
 * Records a decision to proceed past a failed changeover verification.
 *
 * This does NOT open the line: it returns the clearance to awaiting
 * verification, where a second person still has to sign. A screen that
 * implies otherwise is lying about what was authorised.
 */
export async function overrideClearance(args: {
  clearanceId: string;
  companyId: string;
  userId: string;
  reason: string;
  signatureId: string;
}): Promise<ClearanceResult<{ toState: string; overrodeVerification: string }>> {
  const { data, error } = await (supabase as any).rpc('line_clearance_override', {
    p_clearance_id: args.clearanceId,
    p_reason: args.reason,
    p_signature_id: args.signatureId,
  });
  if (error) {
    logger.warn('[line-clearance] override refused', { clearanceId: args.clearanceId, error });
    return toFailure(error, 'Unable to record the override.');
  }
  const r = data as any;

  await recordAuditEvent({
    userId: args.userId,
    companyId: args.companyId,
    action: 'line_clearance_override',
    entityType: 'line_clearance',
    entityId: args.clearanceId,
    metadata: { reason: args.reason, verification_id: r.overrode_verification },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for line_clearance_override:', e));

  return { ok: true, toState: r.to_state ?? 'performed', overrodeVerification: r.overrode_verification };
}

/** The other way out of a failure: clean again and answer afresh. Clears
 *  the answers and the performer's signature; keeps the verifications,
 *  which are evidence. */
export async function restartClearance(
  clearanceId: string, reason: string,
): Promise<ClearanceResult<{ toState: string }>> {
  const { data, error } = await (supabase as any).rpc('line_clearance_restart', {
    p_clearance_id: clearanceId, p_reason: reason,
  });
  if (error) {
    logger.warn('[line-clearance] restart refused', { clearanceId, error });
    return toFailure(error, 'Unable to restart the clearance.');
  }
  return { ok: true, toState: (data as any)?.to_state ?? 'in_progress' };
}

// ── W4·18 · what the floor is told ───────────────────────────────────
//
//  line_clearance_conditions() reports in the flagged/blocked shape
//  the whole floor shares, derived from line_clearance_block_reason —
//  the same sentence the gate itself produces. So a screen cannot show
//  green on something line_clearance_verify() will refuse.
//
//  FAILS OPEN, and that is deliberate. This is a REPORT, not the gate.
//  A failed read must not invent a block: it leaves the screen unable
//  to say, which FloorNoticeList draws as nothing rather than as a
//  clearance. The gate is still there and still refuses.

/** The clearance conditions on a batch, blocked first. */
export async function clearanceConditions(batchId: string): Promise<FloorCondition[]> {
  const { data, error } = await supabase.rpc('line_clearance_conditions', {
    p_batch_id: batchId,
  });
  if (error) {
    logger.error('[lineClearance] conditions failed', { batchId, error });
    return [];
  }
  return toFloorConditions(data);
}
