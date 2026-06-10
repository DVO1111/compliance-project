import { supabase } from './supabase';
import { validateMutation } from './validationService';
import { logger } from './logger';
import { recordAuditEvent } from './auditService';

// ─── Types ──────────────────────────────────────────────────────────────────

export type VendorCategory = 'cloud' | 'payment' | 'marketing' | 'legal' | 'logistics_carrier' | 'customs_broker' | 'last_mile';
export type VendorRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type VendorStatus = 'active' | 'archived';
export type SecurityReviewStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';
export type QuestionnaireStatus = 'draft' | 'sent' | 'in_progress' | 'completed' | 'overdue';
export type QuestionnaireType = 'security' | 'privacy' | 'compliance' | 'general';
export type DataAccessLevel = 'none' | 'limited' | 'moderate' | 'full';
export type VendorDocumentType = 'soc2' | 'iso27001' | 'pentest' | 'dpa' | 'nda' | 'insurance' | 'other';

export interface Vendor {
  id: string;
  company_id: string;
  name: string;
  category: VendorCategory;
  risk_level: VendorRiskLevel;
  status: VendorStatus;
  website: string | null;
  primary_contact: string | null;
  created_at: string;
  // joined
  risk_profile?: VendorRiskProfile | null;
}

export interface VendorCarrierProfile {
  id: string;
  vendor_id: string;
  shipping_modes: string[];
  route_coverage: Record<string, boolean>;
  last_mile_areas: string[];
  on_time_delivery_rate: number | null;
  damage_rate: number | null;
  carrier_licence_type: string | null;
  insurance_coverage_gbp: number | null;
  insurance_expiry: string | null;
  anti_bribery_ack: boolean;
  due_diligence_completed: boolean;
  last_due_diligence_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorRiskProfile {
  id: string;
  vendor_id: string;
  risk_score: number;
  risk_tier: VendorRiskLevel;
  data_access_level: DataAccessLevel;
  security_review_status: SecurityReviewStatus;
  last_review_date: string | null;
  next_review_date: string | null;
}

export interface VendorDocument {
  id: string;
  vendor_id: string;
  submission_id?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  file_size?: number | null;
  document_type: VendorDocumentType;
  uploaded_by: string;
  created_at: string;
  // joined submission (present only when linked via submission_id)
  submission?: { id: string; title: string; platform: string; status: string; created_at: string } | null;
}

export interface VendorQuestionnaire {
  id: string;
  vendor_id: string;
  questionnaire_type: QuestionnaireType;
  status: QuestionnaireStatus;
  sent_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const VENDOR_CATEGORIES: { id: VendorCategory; label: string }[] = [
  { id: 'cloud', label: 'Cloud' },
  { id: 'payment', label: 'Payment' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'legal', label: 'Legal' },
];

export const LOGISTICS_VENDOR_CATEGORIES: { id: VendorCategory; label: string }[] = [
  { id: 'cloud', label: 'Cloud' },
  { id: 'payment', label: 'Payment' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'legal', label: 'Legal' },
  { id: 'logistics_carrier', label: 'Carrier / Freight' },
  { id: 'customs_broker', label: 'Customs Broker' },
  { id: 'last_mile', label: 'Last-Mile Partner' },
];

export const CARRIER_SHIPPING_MODES = ['Air', 'Road', 'Sea', 'Last Mile', 'Rail'];
export const CARRIER_LAST_MILE_AREAS = ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan', 'London', 'Manchester', 'Birmingham'];
export const CARRIER_ROUTE_KEYS: { key: string; label: string }[] = [
  { key: 'uk_to_ng', label: 'UK → Nigeria' },
  { key: 'ng_to_uk', label: 'Nigeria → UK' },
  { key: 'domestic_ng', label: 'Domestic Nigeria' },
  { key: 'domestic_uk', label: 'Domestic UK' },
  { key: 'eu_to_ng', label: 'EU → Nigeria' },
  { key: 'ng_to_eu', label: 'Nigeria → EU' },
];

export const RISK_LEVELS: { id: VendorRiskLevel; label: string; color: string }[] = [
  { id: 'low', label: 'Low', color: '#22c55e' },
  { id: 'medium', label: 'Medium', color: '#f59e0b' },
  { id: 'high', label: 'High', color: '#f97316' },
  { id: 'critical', label: 'Critical', color: '#ef4444' },
];

export const SECURITY_REVIEW_STATUSES: { id: SecurityReviewStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'overdue', label: 'Overdue' },
];

export const DOC_TYPES: { id: VendorDocumentType; label: string }[] = [
  { id: 'soc2', label: 'SOC 2' },
  { id: 'iso27001', label: 'ISO 27001' },
  { id: 'pentest', label: 'Pentest Report' },
  { id: 'dpa', label: 'Data Processing Agreement' },
  { id: 'nda', label: 'NDA' },
  { id: 'insurance', label: 'Insurance Certificate' },
  { id: 'other', label: 'Other' },
];

export const QUESTIONNAIRE_TYPES: { id: QuestionnaireType; label: string }[] = [
  { id: 'security', label: 'Security Assessment' },
  { id: 'privacy', label: 'Privacy Review' },
  { id: 'compliance', label: 'Compliance Check' },
  { id: 'general', label: 'General' },
];

// ─── Vendor CRUD ────────────────────────────────────────────────────────────

export async function getVendors(companyId: string): Promise<Vendor[]> {
  const { data, error } = await (supabase as any)
    .from('vendors')
    .select('*, risk_profile:vendor_risk_profiles(*)')
    .eq('company_id', companyId)
    .neq('status', 'archived')
    .order('name');
  if (error) { logger.error('getVendors:', error); return []; }
  // Flatten single risk_profile from array
  return (data ?? []).map((v: any) => ({
    ...v,
    risk_profile: Array.isArray(v.risk_profile) ? v.risk_profile[0] ?? null : v.risk_profile,
  }));
}

export async function addVendor(
  companyId: string,
  userId: string,
  v: { name: string; category: VendorCategory; risk_level?: VendorRiskLevel; website?: string; primary_contact?: string }
): Promise<Vendor | null> {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies');
  if (!validation.valid) throw new Error(validation.message);

  const { data, error } = await (supabase as any)
    .from('vendors')
    .insert({
      company_id: companyId,
      name: v.name,
      category: v.category,
      risk_level: v.risk_level || 'medium',
      status: 'active',
      website: v.website || null,
      primary_contact: v.primary_contact || null,
    })
    .select()
    .single();
  if (error) { logger.error('addVendor:', error); return null; }
  try { await recordAuditEvent({ userId, companyId, action: 'vendor.created', entityType: 'vendor', entityId: data.id, metadata: { name: v.name, category: v.category, risk_level: v.risk_level || 'medium' }, captureEvidence: false }); } catch { /* non-blocking */ }
  return data;
}

export async function updateVendor(
  companyId: string,
  userId: string,
  vendorId: string,
  updates: Partial<Pick<Vendor, 'name' | 'category' | 'risk_level' | 'status' | 'website' | 'primary_contact'>>
): Promise<boolean> {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies');
  if (!validation.valid) throw new Error(validation.message);

  const { error } = await (supabase as any)
    .from('vendors')
    .update(updates)
    .eq('id', vendorId);
  if (error) { logger.error('updateVendor:', error); return false; }
  try { await recordAuditEvent({ userId, companyId, action: 'vendor.updated', entityType: 'vendor', entityId: vendorId, metadata: { updates }, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

export async function archiveVendor(companyId: string, userId: string, vendorId: string): Promise<boolean> {
  const { error } = await (supabase as any).from('vendors').update({ status: 'archived' }).eq('id', vendorId);
  if (error) { logger.error('archiveVendor:', error); return false; }
  try { await recordAuditEvent({ userId, companyId, action: 'vendor.archived', entityType: 'vendor', entityId: vendorId, metadata: {}, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

// ─── Risk Profiles ──────────────────────────────────────────────────────────

export async function getVendorRiskProfile(vendorId: string): Promise<VendorRiskProfile | null> {
  const { data, error } = await (supabase as any)
    .from('vendor_risk_profiles')
    .select('*')
    .eq('vendor_id', vendorId)
    .maybeSingle();
  if (error) { logger.error('getVendorRiskProfile:', error); return null; }
  return data;
}

export async function upsertVendorRiskProfile(
  vendorId: string,
  profile: Partial<Omit<VendorRiskProfile, 'id' | 'vendor_id'>>
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('vendor_risk_profiles')
    .upsert({ vendor_id: vendorId, ...profile }, { onConflict: 'vendor_id' });
  if (error) { logger.error('upsertVendorRiskProfile:', error); return false; }
  return true;
}

// ─── Vendor Documents (Archive link) ────────────────────────────────────────

export async function getVendorDocuments(vendorId: string): Promise<VendorDocument[]> {
  const { data, error } = await (supabase as any)
    .from('vendor_documents')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('getVendorDocuments:', error); return []; }
  return data ?? [];
}

export async function linkVendorDocument(
  companyId: string,
  vendorId: string,
  submissionId: string,
  documentType: VendorDocumentType,
  uploadedBy: string
): Promise<boolean> {
  // Look up file_name from content_submissions to store directly
  const { data: sub } = await (supabase as any)
    .from('content_submissions')
    .select('file_name, title')
    .eq('id', submissionId)
    .maybeSingle();

  const { error } = await (supabase as any)
    .from('vendor_documents')
    .insert({
      vendor_id: vendorId,
      submission_id: submissionId,
      file_name: sub?.file_name || sub?.title || null,
      document_type: documentType,
      uploaded_by: uploadedBy,
    });
  if (error) { logger.error('linkVendorDocument:', error); return false; }
  return true;
}

export async function uploadVendorDocument(
  companyId: string,
  vendorId: string,
  file: { fileName: string; fileUrl: string; fileSize?: number },
  documentType: VendorDocumentType,
  uploadedBy: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('vendor_documents')
    .insert({
      vendor_id: vendorId,
      file_name: file.fileName,
      file_url: file.fileUrl,
      file_size: file.fileSize ?? null,
      document_type: documentType,
      uploaded_by: uploadedBy,
    });
  if (error) { logger.error('uploadVendorDocument:', error); return false; }
  try { await recordAuditEvent({ userId: uploadedBy, companyId, action: 'vendor.document_uploaded', entityType: 'vendor', entityId: vendorId, metadata: { file_name: file.fileName, document_type: documentType }, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

export async function unlinkVendorDocument(docId: string, companyId: string, userId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('vendor_documents')
    .delete()
    .eq('id', docId);
  if (error) { logger.error('unlinkVendorDocument:', error); return false; }
  try { await recordAuditEvent({ userId, companyId, action: 'vendor.document_removed', entityType: 'vendor', entityId: docId, metadata: { doc_id: docId }, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

// ─── Questionnaires ─────────────────────────────────────────────────────────

export async function getVendorQuestionnaires(vendorId: string): Promise<VendorQuestionnaire[]> {
  const { data, error } = await (supabase as any)
    .from('vendor_questionnaires')
    .select('*')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('getVendorQuestionnaires:', error); return []; }
  return data ?? [];
}

export async function createQuestionnaire(
  vendorId: string,
  type: QuestionnaireType,
  companyId: string,
  userId: string
): Promise<VendorQuestionnaire | null> {
  const { data, error } = await (supabase as any)
    .from('vendor_questionnaires')
    .insert({
      vendor_id: vendorId,
      questionnaire_type: type,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) { logger.error('createQuestionnaire:', error); return null; }
  try { await recordAuditEvent({ userId, companyId, action: 'vendor.questionnaire_sent', entityType: 'vendor', entityId: vendorId, metadata: { questionnaire_type: type }, captureEvidence: false }); } catch { /* non-blocking */ }
  return data;
}

export async function updateQuestionnaireStatus(
  id: string,
  status: QuestionnaireStatus,
  companyId: string,
  userId: string
): Promise<boolean> {
  const updates: any = { status };
  if (status === 'completed') updates.completed_at = new Date().toISOString();
  const { error } = await (supabase as any)
    .from('vendor_questionnaires')
    .update(updates)
    .eq('id', id);
  if (error) { logger.error('updateQuestionnaireStatus:', error); return false; }
  try { await recordAuditEvent({ userId, companyId, action: 'vendor.questionnaire_updated', entityType: 'vendor', entityId: id, metadata: { status }, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

// ─── Carrier Profiles ────────────────────────────────────────────────────────

export async function getCarrierProfile(vendorId: string): Promise<VendorCarrierProfile | null> {
  const { data, error } = await (supabase as any)
    .from('vendor_carrier_profiles')
    .select('*')
    .eq('vendor_id', vendorId)
    .maybeSingle();
  if (error) { logger.error('getCarrierProfile:', error); return null; }
  return data;
}

export async function upsertCarrierProfile(
  vendorId: string,
  profile: Partial<Omit<VendorCarrierProfile, 'id' | 'vendor_id' | 'created_at' | 'updated_at'>>
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('vendor_carrier_profiles')
    .upsert({ vendor_id: vendorId, ...profile, updated_at: new Date().toISOString() }, { onConflict: 'vendor_id' });
  if (error) { logger.error('upsertCarrierProfile:', error); return false; }
  return true;
}
