import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

export type ChangeControlStatus =
  | 'draft'
  | 'impact_assessment'
  | 'pending_approval'
  | 'approved'
  | 'implementing'
  | 'verification'
  | 'closed'
  | 'rejected';

export type ChangeType = 'sop' | 'formulation' | 'equipment' | 'process' | 'supplier' | 'packaging' | 'other';
export type ChangeCategory = 'major' | 'minor' | 'emergency';

export interface ChangeControl {
  id: string;
  company_id: string;
  change_number: string;
  title: string;
  description: string | null;
  change_type: ChangeType;
  change_category: ChangeCategory;
  impact_assessment: string | null;
  regulatory_impact: boolean;
  validation_required: boolean;
  status: ChangeControlStatus;
  effective_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listChangeControls(companyId: string, status?: ChangeControlStatus): Promise<ChangeControl[]> {
  let query = (supabase as any)
    .from('change_controls')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) { logger.error('listChangeControls:', error); return []; }
  return data ?? [];
}

export async function getChangeControl(id: string, companyId: string): Promise<ChangeControl | null> {
  const { data, error } = await (supabase as any)
    .from('change_controls')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) { logger.error('getChangeControl:', error); return null; }
  return data;
}

export async function createChangeControl(
  companyId: string,
  userId: string,
  cc: Pick<ChangeControl, 'title' | 'description' | 'change_type' | 'change_category' | 'regulatory_impact' | 'validation_required'>
): Promise<ChangeControl> {
  // Auto-generate change_number: CC-YYYY-XXXX
  const year = new Date().getFullYear();
  const { count } = await (supabase as any)
    .from('change_controls')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);
  const seq = String((count ?? 0) + 1).padStart(4, '0');
  const changeNumber = `CC-${year}-${seq}`;

  const { data, error } = await (supabase as any)
    .from('change_controls')
    .insert({ ...cc, company_id: companyId, change_number: changeNumber, created_by: userId, status: 'draft' })
    .select()
    .single();

  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: 'create_change_control',
    entityType: 'change_control',
    entityId: data.id,
    metadata: { change_number: changeNumber, title: cc.title },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for create_change_control:', e));

  return data;
}

export async function updateChangeControlStatus(
  id: string,
  companyId: string,
  userId: string,
  newStatus: ChangeControlStatus,
  extra?: { rejectedReason?: string; impactAssessment?: string; effectiveDate?: string }
): Promise<void> {
  const updates: any = { status: newStatus };

  if (newStatus === 'approved') { updates.approved_by = userId; updates.approved_at = new Date().toISOString(); }
  if (newStatus === 'rejected') updates.rejected_reason = extra?.rejectedReason ?? null;
  if (extra?.impactAssessment) updates.impact_assessment = extra.impactAssessment;
  if (extra?.effectiveDate) updates.effective_date = extra.effectiveDate;

  const { error } = await (supabase as any)
    .from('change_controls')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId);

  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: `change_control_${newStatus}`,
    entityType: 'change_control',
    entityId: id,
    metadata: { new_status: newStatus, ...extra },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for change_control status update:', e));
}

export const CC_STATUS_LABELS: Record<ChangeControlStatus, string> = {
  draft: 'Draft',
  impact_assessment: 'Impact Assessment',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  implementing: 'Implementing',
  verification: 'Verification',
  closed: 'Closed',
  rejected: 'Rejected',
};

export const CC_STATUS_COLORS: Record<ChangeControlStatus, string> = {
  draft: 'text-gray-600 bg-gray-50 border-gray-200',
  impact_assessment: 'text-purple-600 bg-purple-50 border-purple-200',
  pending_approval: 'text-amber-600 bg-amber-50 border-amber-200',
  approved: 'text-green-600 bg-green-50 border-green-200',
  implementing: 'text-blue-600 bg-blue-50 border-blue-200',
  verification: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  closed: 'text-teal-600 bg-teal-50 border-teal-200',
  rejected: 'text-red-600 bg-red-50 border-red-200',
};

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  sop: 'SOP / Procedure',
  formulation: 'Formulation',
  equipment: 'Equipment',
  process: 'Process',
  supplier: 'Supplier',
  packaging: 'Packaging',
  other: 'Other',
};
