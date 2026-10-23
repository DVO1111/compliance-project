import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';
import { toFloorConditions, type FloorCondition } from '../floor/floorConditions';
import { assertBatchAllowed } from '../licenceService';
import { transition as lifecycleTransition } from '../lifecycleService';
import { BATCH_TRANSITIONS } from './batchTransitions';

/**
 * The states a batch record can be in.
 *
 * `in_progress` and `execution_complete` were added by Week 4 item 07,
 * which put manufacturing execution in front of QC. A batch now BEGINS at
 * `in_progress` rather than `qc_pending`, so this list is wider than the
 * screens that predate item 07 expect — hence the labels, colours and
 * actions below all cover every member rather than defaulting.
 */
export type BatchStatus =
  | 'in_progress'
  | 'execution_complete'
  | 'qc_pending'
  | 'qc_in_progress'
  | 'hold'
  | 'released'
  | 'rejected'
  | 'archived';

export interface BatchRecord {
  id: string;
  company_id: string;
  batch_number: string;
  product_name: string;
  product_code: string | null;
  /** Link to the product registry (D05). Null for batches predating it. */
  product_id: string | null;
  manufacturing_date: string;
  expiry_date: string;
  batch_size: number;
  unit: string;
  status: BatchStatus;
  /** The customer this batch is manufactured for, when it is contract work. */
  customer_name: string | null;
  /** The master formula version the batch was initiated on, if any. */
  formula_id: string | null;
  /**
   * When manufacturing execution was closed. Once set, the stages and
   * readings are frozen and the record cannot return to manufacturing, so
   * the screens read it to decide which actions to offer.
   */
  execution_closed_at: string | null;
  execution_closed_by: string | null;
  hold_reason: string | null;
  release_notes: string | null;
  qc_started_at: string | null;
  qc_completed_at: string | null;
  released_at: string | null;
  released_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchQcResult {
  id: string;
  batch_id: string;
  test_name: string;
  test_method: string | null;
  specification: string | null;
  result: string;
  pass: boolean;
  tested_by: string | null;
  tested_at: string;
  /** The result this one replaces, when it is a correction. */
  corrected_from_id?: string | null;
  correction_reason?: string | null;
}

export async function listBatchRecords(companyId: string, status?: BatchStatus): Promise<BatchRecord[]> {
  let query = (supabase as any)
    .from('batch_records')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) { logger.error('listBatchRecords:', error); return []; }
  return data ?? [];
}

export async function getBatchRecord(id: string, companyId: string): Promise<BatchRecord | null> {
  const { data, error } = await (supabase as any)
    .from('batch_records')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) { logger.error('getBatchRecord:', error); return null; }
  return data;
}

export async function createBatchRecord(
  companyId: string,
  userId: string,
  //  formula_id and the two closure columns are left out because they are
  //  not the caller's to set: a batch built from a master formula is
  //  created by the batch_record_initiate() RPC, which resolves the
  //  approved version and instantiates the stages. This path remains for
  //  the batches that have no formula behind them, which is what the
  //  existing screen creates.
  record: Omit<BatchRecord, 'id' | 'company_id' | 'status' | 'hold_reason' | 'release_notes' | 'qc_started_at' | 'qc_completed_at' | 'released_at' | 'released_by' | 'created_by' | 'created_at' | 'updated_at' | 'formula_id' | 'execution_closed_at' | 'execution_closed_by' | 'customer_name'> & { customer_name?: string | null }
): Promise<BatchRecord> {
  //  Asked before the write purely so the operator sees which licence
  //  expired and when. The authority is trg_batch_records_licence_gate,
  //  which refuses the insert whatever this call returns.
  await assertBatchAllowed(record.product_id, 'initiation');

  //  No status is sent. Since item 07 the column is a mirror of the
  //  lifecycle engine maintained by trigger, and the database refuses a
  //  direct write to it — a batch starts in the engine's initial state,
  //  `in_progress`, whatever this call might ask for.
  const { data, error } = await (supabase as any)
    .from('batch_records')
    .insert({ ...record, company_id: companyId, created_by: userId })
    .select()
    .single();

  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: 'create_batch_record',
    entityType: 'batch_record',
    entityId: data.id,
    metadata: { batch_number: record.batch_number, product_name: record.product_name },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for create_batch_record:', e));

  return data;
}


/**
 * Moves a batch to a new state.
 *
 * Since Week 4 item 07 the state is held by the lifecycle engine and
 * `batch_records.status` is a read-only mirror: a direct UPDATE of it is
 * refused by a trigger, so this goes through `lifecycle_transition`. The
 * side columns the screens read — when QC started, who released, the hold
 * reason — are not state and are still written here, after the engine has
 * accepted the move.
 */
export async function updateBatchStatus(
  id: string,
  companyId: string,
  userId: string,
  newStatus: BatchStatus,
  //  signatureId: PM-03 requires an electronic signature to release a
  //  batch, and since 20261107000000 the lifecycle transition enforces
  //  it. Without one the engine returns LIFECYCLE_SIGNATURE_REQUIRED,
  //  so a caller releasing a batch has to collect it first.
  extra?: { holdReason?: string; releaseNotes?: string; comment?: string; signatureId?: string }
): Promise<void> {
  const now = new Date().toISOString();

  const existing = await getBatchRecord(id, companyId);
  if (!existing) throw new Error('That batch record is no longer available.');
  if (existing.status === newStatus) return;

  //  Release is the point the registration has to be in force. A batch
  //  legitimately started under a valid licence still cannot be released
  //  once that licence has lapsed. Asked here so the operator sees which
  //  licence and when; the authority is the database trigger, which
  //  refuses the transition whatever this returns.
  if (newStatus === 'released') {
    await assertBatchAllowed(existing.product_id, 'release');
  }

  const actionKey = BATCH_TRANSITIONS[`${existing.status}->${newStatus}`];
  if (!actionKey) {
    throw new Error(
      `A batch that is "${STATUS_LABELS[existing.status] ?? existing.status}" cannot move straight to ` +
      `"${STATUS_LABELS[newStatus] ?? newStatus}".`
    );
  }

  //  `hold` and `reject` are declared as requiring a comment, so the
  //  reason the caller collected is passed as that comment rather than
  //  only into a column — the engine's history is where an auditor looks.
  const comment = extra?.comment
    ?? extra?.holdReason
    ?? (newStatus === 'released' ? (extra?.releaseNotes || undefined) : undefined);

  const result = await lifecycleTransition({
    entityType: 'batch_record',
    entityId: id,
    actionKey,
    companyId,
    comment,
    metadata: { requested_status: newStatus },
    signatureId: extra?.signatureId,
  });

  if (!result.ok) throw new Error(result.message);

  //  Not state, so not the engine's: these are the facts the screens
  //  display alongside it.
  const updates: Record<string, unknown> = {};
  if (newStatus === 'qc_in_progress' && !existing.qc_started_at) updates.qc_started_at = now;
  if (newStatus === 'released') {
    updates.released_at = now;
    updates.released_by = userId;
    updates.release_notes = extra?.releaseNotes ?? null;
  }
  if (newStatus === 'hold') updates.hold_reason = extra?.holdReason ?? null;

  if (Object.keys(updates).length > 0) {
    const { error } = await (supabase as any)
      .from('batch_records')
      .update(updates)
      .eq('id', id)
      .eq('company_id', companyId);
    //  The transition has already committed, so a failure here leaves the
    //  state correct and a detail missing. Logged rather than thrown: the
    //  caller reloading would otherwise see the move succeed and an error
    //  reported for it.
    if (error) logger.error('updateBatchStatus: transition committed but detail write failed', error);
  }

  await recordAuditEvent({
    userId,
    companyId,
    action: `batch_status_${newStatus}`,
    entityType: 'batch_record',
    entityId: id,
    metadata: { new_status: newStatus, action_key: actionKey, ...extra },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for batch status update:', e));
}

/**
 * A signing refusal, in words somebody can act on.
 *
 * Falls through to the database's own message rather than a generic
 * one: a refusal the screen cannot name is still more useful than
 * "something went wrong".
 */
export function explainVerdictSignatureError(code?: string, message?: string): string {
  switch (code) {
    case 'E_SIGNATURE_BAD_PASSWORD':
      return 'That password is not correct.';
    case 'E_SIGNATURE_LOCKED':
      return 'Too many failed signature attempts. Wait fifteen minutes before trying again.';
    case 'E_SIGNATURE_NO_USER':
      return 'You are signed out. Sign in again — nothing you have typed is lost.';
    case 'E_SIGNATURE_BAD_ACTION':
      return 'That is not an action this system signs.';
    default:
      return message || 'The signature could not be taken.';
  }
}

export async function addQcResult(
  batchId: string,
  userId: string,
  result: Omit<BatchQcResult, 'id' | 'batch_id' | 'tested_by' | 'tested_at'>,
  /**
   * The result this one replaces, when it is a correction.
   *
   * THERE IS NO EDIT, and 20261112000000 refuses one: a finished QC
   * verdict feeds the release gate, and a verdict that can be edited
   * makes that gate worth nothing. A correction is a new row pointing
   * at the old one; both survive, the gate reads the one that stands,
   * and the superseded row keeps the failure on the record.
   *
   * The reason is not optional — the database refuses a correction
   * without one, because the log entry is the point.
   */
  correction?: { correctedFromId: string; reason: string },
  /**
   * The password this verdict is signed with.
   *
   * REQUIRED SINCE 20261127000000, decision 5. The release gate reads
   * `pass` and the recorded value and refuses the batch on them, so
   * the analyst attests to them as they are recorded. The signature is
   * taken over the VERDICT — the test, the value and the pass/fail —
   * not over a row id, so it cannot be minted for one result and
   * attached to another.
   *
   * There is no path that writes a verdict without one, and no
   * test-only signing route. Omitting it reaches the database and is
   * refused there, which is the right place for the refusal to live.
   */
  signing?: { companyId: string; password: string },
): Promise<BatchQcResult> {
  let signatureId: string | null = null;
  if (signing) {
    //  Typed, not `as any`: quality_verdict_sign is in database.types.ts,
    //  so the argument names and the Json return are checked here rather
    //  than discovered at runtime.
    const { data: sig, error: sigErr } = await supabase.rpc('quality_verdict_sign', {
      p_action: 'batch_qc_result',
      p_company_id: signing.companyId,
      p_record_id: batchId,
      p_subject: result.test_name,
      p_result: result.result,
      p_pass: result.pass,
      p_password: signing.password,
      p_reason: correction?.reason ?? null,
    });
    if (sigErr) throw new Error(sigErr.message);
    const r = sig as { ok?: boolean; code?: string; message?: string; signature_id?: string };
    if (!r?.ok) throw new Error(explainVerdictSignatureError(r?.code, r?.message));
    signatureId = r.signature_id ?? null;
  }

  const { data, error } = await (supabase as any)
    .from('batch_qc_results')
    .insert({
      ...result,
      batch_id: batchId,
      tested_by: userId,
      corrected_from_id: correction?.correctedFromId ?? null,
      correction_reason: correction?.reason ?? null,
      signature_id: signatureId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Which of a batch's results still stand — the ones the release gate
 * reads.
 *
 * A superseded result is history. It stays in listQcResults, because a
 * screen showing only the current verdicts would hide the correction
 * that is the whole point of recording one.
 */
export function standingResults(all: BatchQcResult[]): BatchQcResult[] {
  const superseded = new Set(
    all.map((r) => r.corrected_from_id).filter((id): id is string => !!id),
  );
  return all.filter((r) => !superseded.has(r.id));
}

export async function listQcResults(batchId: string): Promise<BatchQcResult[]> {
  const { data, error } = await (supabase as any)
    .from('batch_qc_results')
    .select('*')
    .eq('batch_id', batchId)
    .order('tested_at', { ascending: false });
  if (error) { logger.error('listQcResults:', error); return []; }
  return data ?? [];
}

/* ── In-Process QC ─────────────────────────────────────────────────────────
   Intermediate quality-control stages logged while a batch is in production,
   distinct from the final release QC in batch_qc_results. */

export interface BatchInProcessQc {
  id: string;
  company_id: string;
  batch_id: string;
  stage_name: string;
  parameter: string;
  specification: string | null;
  result: string;
  pass: boolean;
  tested_by: string | null;
  tested_at: string;
  /** The result this one replaces, when it is a correction. */
  corrected_from_id?: string | null;
  correction_reason?: string | null;
}

export async function listInProcessQc(batchId: string): Promise<BatchInProcessQc[]> {
  const { data, error } = await (supabase as any)
    .from('batch_inprocess_qc')
    .select('*')
    .eq('batch_id', batchId)
    .order('tested_at', { ascending: false });
  if (error) { logger.error('listInProcessQc:', error); return []; }
  return data ?? [];
}

export async function addInProcessQc(
  companyId: string,
  batchId: string,
  userId: string,
  entry: Omit<BatchInProcessQc, 'id' | 'company_id' | 'batch_id' | 'tested_by' | 'tested_at'>
): Promise<BatchInProcessQc> {
  const { data, error } = await (supabase as any)
    .from('batch_inprocess_qc')
    .insert({ ...entry, company_id: companyId, batch_id: batchId, tested_by: userId })
    .select()
    .single();
  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: 'add_inprocess_qc',
    entityType: 'batch_record',
    entityId: batchId,
    metadata: { stage_name: entry.stage_name, parameter: entry.parameter, pass: entry.pass },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for add_inprocess_qc:', e));

  return data;
}

/* ── Raw Material Receipts ─────────────────────────────────────────────────
   Incoming raw material lots and their receiving / QC outcome. */

export type RawMaterialStatus = 'pending' | 'passed' | 'failed' | 'quarantined';

export interface RawMaterialReceipt {
  id: string;
  company_id: string;
  material_name: string;
  material_code: string | null;
  lot_number: string;
  supplier_name: string | null;
  quantity: number | null;
  unit: string;
  received_date: string;
  test_status: RawMaterialStatus;
  test_result: string | null;
  received_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listRawMaterialReceipts(companyId: string): Promise<RawMaterialReceipt[]> {
  const { data, error } = await (supabase as any)
    .from('raw_material_receipts')
    .select('*')
    .eq('company_id', companyId)
    .order('received_date', { ascending: false });
  if (error) { logger.error('listRawMaterialReceipts:', error); return []; }
  return data ?? [];
}

export async function addRawMaterialReceipt(
  companyId: string,
  userId: string,
  receipt: Pick<RawMaterialReceipt, 'material_name' | 'lot_number'> &
    Partial<Pick<RawMaterialReceipt, 'material_code' | 'supplier_name' | 'quantity' | 'unit' | 'received_date' | 'test_status' | 'test_result'>>
): Promise<RawMaterialReceipt> {
  const { data, error } = await (supabase as any)
    .from('raw_material_receipts')
    .insert({ ...receipt, company_id: companyId, created_by: userId, received_by: userId })
    .select()
    .single();
  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: 'add_raw_material_receipt',
    entityType: 'raw_material_receipt',
    entityId: data.id,
    metadata: { material_name: receipt.material_name, lot_number: receipt.lot_number, test_status: receipt.test_status ?? 'pending' },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for add_raw_material_receipt:', e));

  return data;
}

export async function updateRawMaterialStatus(
  id: string,
  companyId: string,
  userId: string,
  testStatus: RawMaterialStatus,
  testResult?: string
): Promise<void> {
  const { error } = await (supabase as any)
    .from('raw_material_receipts')
    .update({ test_status: testStatus, test_result: testResult ?? null })
    .eq('id', id)
    .eq('company_id', companyId);
  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: 'update_raw_material_status',
    entityType: 'raw_material_receipt',
    entityId: id,
    metadata: { test_status: testStatus },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for update_raw_material_status:', e));
}

export const STATUS_LABELS: Record<BatchStatus, string> = {
  in_progress: 'In Manufacturing',
  execution_complete: 'Execution Complete',
  qc_pending: 'QC Pending',
  qc_in_progress: 'QC In Progress',
  hold: 'On Hold',
  released: 'Released',
  rejected: 'Rejected',
  archived: 'Archived',
};

export const STATUS_COLORS: Record<BatchStatus, string> = {
  in_progress: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  execution_complete: 'text-sky-600 bg-sky-50 border-sky-200',
  qc_pending: 'text-amber-600 bg-amber-50 border-amber-200',
  qc_in_progress: 'text-blue-600 bg-blue-50 border-blue-200',
  hold: 'text-orange-600 bg-orange-50 border-orange-200',
  released: 'text-green-600 bg-green-50 border-green-200',
  rejected: 'text-red-600 bg-red-50 border-red-200',
  archived: 'text-gray-500 bg-gray-50 border-gray-200',
};

/**
 * Why this batch may not be released — the same facts the gate refuses
 * on, as rows a screen can draw.
 *
 * ONE SOURCE, TWO CALLERS. batch_release_conditions and
 * batch_release_block_reason read the same query in the database, so
 * the notice somebody reads on the screen and the refusal they would
 * hit cannot drift apart. The same arrangement as
 * material_lot_release_block_reason and dispensing_conditions.
 *
 * An empty list means nothing objects. A FAILED READ IS ALSO AN EMPTY
 * LIST, which is the one place the two are indistinguishable — so the
 * screen must not read "no conditions" as "safe to release" on its
 * own. It does not: the button still calls the transition, and the
 * database is what decides.
 */
export async function batchReleaseConditions(batchId: string): Promise<FloorCondition[]> {
  const { data, error } = await supabase.rpc('batch_release_conditions', {
    p_batch_id: batchId,
  });
  if (error) {
    logger.error('[batchRelease] conditions failed', { batchId, error });
    return [];
  }
  return toFloorConditions(data);
}
