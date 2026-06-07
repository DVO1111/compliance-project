import { supabase } from './supabase';
import { logger } from './logger';
import { recordAuditEvent } from './auditService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ManCapStatus =
  | 'draft' | 'submitted' | 'under_review' | 'inspection_scheduled'
  | 'approved' | 'rejected' | 'expired';

export type SonAuditType = 'quarterly' | 'annual' | 'special';

export type SonAuditStatus =
  | 'scheduled' | 'completed' | 'passed' | 'failed' | 'pending_corrective_action';

export type SonCertType = 'man_cap' | 'nis_conformity' | 'son_approval';

export interface ManCapApplication {
  id: string;
  company_id: string;
  product_name: string;
  nis_standard: string;
  application_date: string;
  status: ManCapStatus;
  reference_number: string | null;
  certificate_number: string | null;
  certificate_expiry: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SonAudit {
  id: string;
  company_id: string;
  audit_type: SonAuditType;
  scheduled_date: string;
  status: SonAuditStatus;
  auditor_name: string | null;
  findings: string | null;
  corrective_actions: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SonCertificate {
  id: string;
  company_id: string;
  certificate_type: SonCertType;
  certificate_number: string;
  product_name: string;
  nis_standard: string;
  issue_date: string;
  expiry_date: string;
  certificate_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Reference data ─────────────────────────────────────────────────────────────

export const MANCAP_STATUS_LABELS: Record<ManCapStatus, string> = {
  draft:                'Draft',
  submitted:            'Submitted to SON',
  under_review:         'Under Review',
  inspection_scheduled: 'Inspection Scheduled',
  approved:             'Approved — Certificate Issued',
  rejected:             'Rejected',
  expired:              'Expired',
};

export const MANCAP_STATUS_COLORS: Record<ManCapStatus, string> = {
  draft:                'bg-gray-100 text-gray-600',
  submitted:            'bg-blue-100 text-blue-700',
  under_review:         'bg-yellow-100 text-yellow-700',
  inspection_scheduled: 'bg-purple-100 text-purple-700',
  approved:             'bg-green-100 text-green-700',
  rejected:             'bg-red-100 text-red-700',
  expired:              'bg-orange-100 text-orange-700',
};

export const AUDIT_STATUS_LABELS: Record<SonAuditStatus, string> = {
  scheduled:                  'Scheduled',
  completed:                  'Completed',
  passed:                     'Passed',
  failed:                     'Failed',
  pending_corrective_action:  'Corrective Action Required',
};

export const AUDIT_STATUS_COLORS: Record<SonAuditStatus, string> = {
  scheduled:                  'bg-blue-100 text-blue-700',
  completed:                  'bg-gray-100 text-gray-700',
  passed:                     'bg-green-100 text-green-700',
  failed:                     'bg-red-100 text-red-700',
  pending_corrective_action:  'bg-orange-100 text-orange-700',
};

export const NIS_STANDARDS: { value: string; label: string; category: string }[] = [
  // Food & Beverages
  { value: 'NIS 566', label: 'NIS 566 — Sachet (Pure) Water',         category: 'Food & Beverage' },
  { value: 'NIS 444', label: 'NIS 444 — Bottled Drinking Water',       category: 'Food & Beverage' },
  { value: 'NIS 40',  label: 'NIS 40 — Edible Vegetable Oils',         category: 'Food & Beverage' },
  { value: 'NIS 271', label: 'NIS 271 — Fruit Juices',                 category: 'Food & Beverage' },
  { value: 'NIS 455', label: 'NIS 455 — Instant Noodles',              category: 'Food & Beverage' },
  { value: 'NIS 494', label: 'NIS 494 — Table Salt',                   category: 'Food & Beverage' },
  { value: 'NIS 302', label: 'NIS 302 — Milk Products',                category: 'Food & Beverage' },
  { value: 'NIS 105', label: 'NIS 105 — Evaporated Milk',              category: 'Food & Beverage' },
  { value: 'NIS 587', label: 'NIS 587 — Biscuits',                     category: 'Food & Beverage' },
  { value: 'NIS 10',  label: 'NIS 10 — Bitters & Spirits',             category: 'Food & Beverage' },
  // Household & Personal Care
  { value: 'NIS 116', label: 'NIS 116 — Detergents',                   category: 'Household & Personal Care' },
  { value: 'NIS 182', label: 'NIS 182 — Toilet Soaps',                 category: 'Household & Personal Care' },
  { value: 'NIS 623', label: 'NIS 623 — Disinfectants',                category: 'Household & Personal Care' },
  // Pharmaceutical
  { value: 'NIS ISO 9001', label: 'NIS ISO 9001 — Quality Management', category: 'Pharmaceutical' },
  { value: 'NIS ISO 22000', label: 'NIS ISO 22000 — Food Safety',      category: 'Pharmaceutical' },
  // Construction
  { value: 'NIS 444-2', label: 'NIS 444-2 — Cement',                   category: 'Construction' },
  { value: 'Other',   label: 'Other (specify in notes)',                category: 'Other' },
];

export const CERT_TYPE_LABELS: Record<SonCertType, string> = {
  man_cap:       'MAN CAP Certificate',
  nis_conformity: 'NIS Conformity Certificate',
  son_approval:  'SON Approval Certificate',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

export function getCertExpiryStatus(expiryDate: string): 'active' | 'expiring' | 'expired' {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 90) return 'expiring';
  return 'active';
}

export function getDaysUntilExpiry(expiryDate: string): number {
  return Math.ceil((new Date(expiryDate).getTime() - new Date().getTime()) / 86400000);
}

// ── MAN CAP Applications ───────────────────────────────────────────────────────

export async function getManCapApplications(companyId: string): Promise<ManCapApplication[]> {
  const { data, error } = await (supabase as any)
    .from('son_mancap_applications')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('getManCapApplications:', error); return []; }
  return data ?? [];
}

export async function createManCapApplication(
  companyId: string,
  userId: string,
  app: { product_name: string; nis_standard: string; application_date: string; notes?: string }
): Promise<ManCapApplication | null> {
  const { data, error } = await (supabase as any)
    .from('son_mancap_applications')
    .insert({ company_id: companyId, created_by: userId, status: 'draft', ...app })
    .select()
    .single();
  if (error) { logger.error('createManCapApplication:', error); return null; }
  try { await recordAuditEvent({ userId, companyId, action: 'son.mancap_created', entityType: 'son_mancap', entityId: data.id, metadata: { product_name: app.product_name, nis_standard: app.nis_standard }, captureEvidence: false }); } catch { /* non-blocking */ }
  return data;
}

export async function updateManCapStatus(
  id: string,
  status: ManCapStatus,
  companyId: string,
  userId: string,
  extras?: { reference_number?: string; certificate_number?: string; certificate_expiry?: string }
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('son_mancap_applications')
    .update({ status, updated_at: new Date().toISOString(), ...extras })
    .eq('id', id);
  if (error) { logger.error('updateManCapStatus:', error); return false; }
  try { await recordAuditEvent({ userId, companyId, action: 'son.mancap_status_changed', entityType: 'son_mancap', entityId: id, metadata: { status }, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

export async function deleteManCapApplication(id: string, companyId: string, userId: string): Promise<boolean> {
  const { error } = await (supabase as any).from('son_mancap_applications').delete().eq('id', id);
  if (error) { logger.error('deleteManCapApplication:', error); return false; }
  try { await recordAuditEvent({ userId, companyId, action: 'son.mancap_deleted', entityType: 'son_mancap', entityId: id, metadata: {}, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

// ── SON Audits ─────────────────────────────────────────────────────────────────

export async function getSonAudits(companyId: string): Promise<SonAudit[]> {
  const { data, error } = await (supabase as any)
    .from('son_audits')
    .select('*')
    .eq('company_id', companyId)
    .order('scheduled_date', { ascending: false });
  if (error) { logger.error('getSonAudits:', error); return []; }
  return data ?? [];
}

export async function createSonAudit(
  companyId: string,
  userId: string,
  audit: { audit_type: SonAuditType; scheduled_date: string; auditor_name?: string; notes?: string }
): Promise<SonAudit | null> {
  const { data, error } = await (supabase as any)
    .from('son_audits')
    .insert({ company_id: companyId, created_by: userId, status: 'scheduled', ...audit })
    .select()
    .single();
  if (error) { logger.error('createSonAudit:', error); return null; }
  try { await recordAuditEvent({ userId, companyId, action: 'son.audit_scheduled', entityType: 'son_audit', entityId: data.id, metadata: { audit_type: audit.audit_type, scheduled_date: audit.scheduled_date }, captureEvidence: false }); } catch { /* non-blocking */ }
  return data;
}

export async function updateSonAuditStatus(
  id: string,
  status: SonAuditStatus,
  companyId: string,
  userId: string,
  extras?: { findings?: string; corrective_actions?: string }
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('son_audits')
    .update({ status, updated_at: new Date().toISOString(), ...extras })
    .eq('id', id);
  if (error) { logger.error('updateSonAuditStatus:', error); return false; }
  try { await recordAuditEvent({ userId, companyId, action: 'son.audit_updated', entityType: 'son_audit', entityId: id, metadata: { status }, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

// ── SON Certificates ───────────────────────────────────────────────────────────

export async function getSonCertificates(companyId: string): Promise<SonCertificate[]> {
  const { data, error } = await (supabase as any)
    .from('son_certificates')
    .select('*')
    .eq('company_id', companyId)
    .order('expiry_date', { ascending: true });
  if (error) { logger.error('getSonCertificates:', error); return []; }
  return data ?? [];
}

export async function createSonCertificate(
  companyId: string,
  userId: string,
  cert: {
    certificate_type: SonCertType;
    certificate_number: string;
    product_name: string;
    nis_standard: string;
    issue_date: string;
    expiry_date: string;
    certificate_url?: string;
    notes?: string;
  }
): Promise<SonCertificate | null> {
  const { data, error } = await (supabase as any)
    .from('son_certificates')
    .insert({ company_id: companyId, created_by: userId, ...cert })
    .select()
    .single();
  if (error) { logger.error('createSonCertificate:', error); return null; }
  try { await recordAuditEvent({ userId, companyId, action: 'son.certificate_added', entityType: 'son_certificate', entityId: data.id, metadata: { certificate_type: cert.certificate_type, product_name: cert.product_name, expiry_date: cert.expiry_date }, captureEvidence: false }); } catch { /* non-blocking */ }
  return data;
}

export async function deleteSonCertificate(id: string, companyId: string, userId: string): Promise<boolean> {
  const { error } = await (supabase as any).from('son_certificates').delete().eq('id', id);
  if (error) { logger.error('deleteSonCertificate:', error); return false; }
  try { await recordAuditEvent({ userId, companyId, action: 'son.certificate_deleted', entityType: 'son_certificate', entityId: id, metadata: {}, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}
