import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';
import { assertBatchAllowed } from '../licenceService';

export type BatchStatus = 'qc_pending' | 'qc_in_progress' | 'hold' | 'released' | 'rejected' | 'archived';

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
  record: Omit<BatchRecord, 'id' | 'company_id' | 'status' | 'hold_reason' | 'release_notes' | 'qc_started_at' | 'qc_completed_at' | 'released_at' | 'released_by' | 'created_by' | 'created_at' | 'updated_at'>
): Promise<BatchRecord> {
  //  Asked before the write purely so the operator sees which licence
  //  expired and when. The authority is trg_batch_records_licence_gate,
  //  which refuses the insert whatever this call returns.
  await assertBatchAllowed(record.product_id, 'initiation');

  const { data, error } = await (supabase as any)
    .from('batch_records')
    .insert({ ...record, company_id: companyId, created_by: userId, status: 'qc_pending' })
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

export async function updateBatchStatus(
  id: string,
  companyId: string,
  userId: string,
  newStatus: BatchStatus,
  extra?: { holdReason?: string; releaseNotes?: string }
): Promise<void> {
  const now = new Date().toISOString();
  const updates: any = { status: newStatus };

  //  Release is the point the registration has to be in force. A batch
  //  legitimately started under a valid licence still cannot be released
  //  once that licence has lapsed.
  if (newStatus === 'released') {
    const existing = await getBatchRecord(id, companyId);
    await assertBatchAllowed(existing?.product_id, 'release');
  }

  if (newStatus === 'qc_in_progress') updates.qc_started_at = now;
  if (newStatus === 'released') { updates.released_at = now; updates.released_by = userId; updates.release_notes = extra?.releaseNotes ?? null; }
  if (newStatus === 'hold') updates.hold_reason = extra?.holdReason ?? null;

  const { error } = await (supabase as any)
    .from('batch_records')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId);

  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: `batch_status_${newStatus}`,
    entityType: 'batch_record',
    entityId: id,
    metadata: { new_status: newStatus, ...extra },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for batch status update:', e));
}

export async function addQcResult(
  batchId: string,
  userId: string,
  result: Omit<BatchQcResult, 'id' | 'batch_id' | 'tested_by' | 'tested_at'>
): Promise<BatchQcResult> {
  const { data, error } = await (supabase as any)
    .from('batch_qc_results')
    .insert({ ...result, batch_id: batchId, tested_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
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
  qc_pending: 'QC Pending',
  qc_in_progress: 'QC In Progress',
  hold: 'On Hold',
  released: 'Released',
  rejected: 'Rejected',
  archived: 'Archived',
};

export const STATUS_COLORS: Record<BatchStatus, string> = {
  qc_pending: 'text-amber-600 bg-amber-50 border-amber-200',
  qc_in_progress: 'text-blue-600 bg-blue-50 border-blue-200',
  hold: 'text-orange-600 bg-orange-50 border-orange-200',
  released: 'text-green-600 bg-green-50 border-green-200',
  rejected: 'text-red-600 bg-red-50 border-red-200',
  archived: 'text-gray-500 bg-gray-50 border-gray-200',
};
