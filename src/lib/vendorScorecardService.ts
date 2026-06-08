import { supabase } from './supabase';
import { logger } from './logger';
import { recordAuditEvent } from './auditService';

export type VendorType = 'agency' | 'cro' | 'consultancy' | 'technology' | 'other';
export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

export type VendorProfile = {
  id: string; company_id: string; vendor_name: string; vendor_type: VendorType;
  contact_email: string | null; compliance_certified: boolean; certification_expiry: string | null;
  risk_tier: RiskTier; overall_score: number; status: string; created_at: string;
  audits?: VendorAudit[];
};

export type VendorAudit = {
  id: string; vendor_id: string; audit_type: string; findings: string | null;
  score: number; auditor: string; audit_date: string; next_audit_due: string | null;
};

export async function getVendors(companyId: string): Promise<VendorProfile[]> {
  const { data, error } = await (supabase as any).from('vendor_profiles').select('*, audits:vendor_audits(*)').eq('company_id', companyId).neq('status', 'archived').order('vendor_name');
  if (error) { logger.error('getVendors:', error); return []; }
  return data ?? [];
}

export async function addVendor(
  companyId: string,
  v: { vendor_name: string; vendor_type: VendorType; contact_email?: string; compliance_certified?: boolean; certification_expiry?: string; risk_tier?: RiskTier },
  userId?: string,
): Promise<VendorProfile | null> {
  const { data, error } = await (supabase as any).from('vendor_profiles').insert({ company_id: companyId, vendor_name: v.vendor_name, vendor_type: v.vendor_type, contact_email: v.contact_email || null, compliance_certified: v.compliance_certified || false, certification_expiry: v.certification_expiry || null, risk_tier: v.risk_tier || 'medium', overall_score: 0, status: 'active' }).select().single();
  if (error) { logger.error('addVendor:', error); return null; }

  if (userId) {
    try {
      await recordAuditEvent({
        companyId, userId,
        action: `vendor_scorecard.vendor_added: ${v.vendor_name} (${v.vendor_type})`,
        entityType: 'vendor_profile', entityId: data.id,
        metadata: { vendorName: v.vendor_name, vendorType: v.vendor_type, riskTier: v.risk_tier ?? 'medium' },
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }

  return data;
}

export async function addAudit(
  vendorId: string,
  a: { audit_type: string; findings?: string; score: number; auditor: string; next_audit_due?: string },
  companyId?: string,
  userId?: string,
): Promise<boolean> {
  const { error } = await (supabase as any).from('vendor_audits').insert({ vendor_id: vendorId, audit_type: a.audit_type, findings: a.findings || null, score: a.score, auditor: a.auditor, next_audit_due: a.next_audit_due || null });
  if (error) { logger.error('addAudit:', error); return false; }

  const { data: audits } = await (supabase as any).from('vendor_audits').select('score').eq('vendor_id', vendorId);
  if (audits && audits.length > 0) {
    const avg = Math.round(audits.reduce((s: number, a: any) => s + a.score, 0) / audits.length);
    await (supabase as any).from('vendor_profiles').update({ overall_score: avg }).eq('id', vendorId);
  }

  if (companyId && userId) {
    try {
      await recordAuditEvent({
        companyId, userId,
        action: `vendor_scorecard.audit_added: score ${a.score} by ${a.auditor}`,
        entityType: 'vendor_audit', entityId: vendorId,
        metadata: { auditType: a.audit_type, score: a.score, auditor: a.auditor },
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }

  return true;
}

export async function updateVendorStatus(
  vendorId: string,
  status: string,
  companyId?: string,
  userId?: string,
): Promise<boolean> {
  const { error } = await (supabase as any).from('vendor_profiles').update({ status }).eq('id', vendorId);
  if (error) { logger.error('updateVendorStatus:', error); return false; }

  if (companyId && userId) {
    try {
      await recordAuditEvent({
        companyId, userId,
        action: `vendor_scorecard.status_changed: ${status}`,
        entityType: 'vendor_profile', entityId: vendorId,
        metadata: { status },
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }

  return true;
}

export const VENDOR_TYPES: { id: VendorType; label: string }[] = [
  { id: 'agency', label: 'Agency' }, { id: 'cro', label: 'CRO' },
  { id: 'consultancy', label: 'Consultancy' }, { id: 'technology', label: 'Technology' }, { id: 'other', label: 'Other' },
];
