// src/lib/consentService.ts
// Patient Consent Management — CRUD, content linking, PHI scanning

import { supabase } from './supabase';
import { logger } from './logger';
import { recordAuditEvent } from './auditService';

/* ── Types ───────────────────────────────────────────── */

export type ConsentType = 'testimonial' | 'case_study' | 'ugc' | 'imagery' | 'video' | 'general';
export type ConsentStatus = 'active' | 'expired' | 'revoked';

export interface PatientConsent {
  id: string;
  company_id: string;
  patient_name: string;
  patient_identifier_hash: string | null;
  consent_type: ConsentType;
  consent_status: ConsentStatus;
  signed_at: string | null;
  expires_at: string | null;
  consent_document_url: string | null;
  digital_signature_hash: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ConsentContentLink {
  id: string;
  consent_id: string;
  content_id: string;
  linked_at: string;
  linked_by: string | null;
}

export interface PHIFinding {
  type: string;
  value: string;
  position: number;
  context: string;
}

export interface PHIScanResult {
  id: string;
  content_id: string | null;
  scan_type: string;
  findings: PHIFinding[];
  risk_level: string;
  scanned_at: string;
}

/* ── Consent CRUD ────────────────────────────────────── */

export async function createConsent(
  companyId: string,
  data: {
    patientName: string;
    consentType: ConsentType;
    signedAt?: string;
    expiresAt?: string;
    documentUrl?: string;
    notes?: string;
  },
  userId: string
): Promise<PatientConsent | null> {
  const { data: consent, error } = await (supabase as any)
    .from('patient_consents')
    .insert({
      company_id: companyId,
      patient_name: data.patientName,
      consent_type: data.consentType,
      consent_status: 'active',
      signed_at: data.signedAt || new Date().toISOString(),
      expires_at: data.expiresAt || null,
      consent_document_url: data.documentUrl || null,
      notes: data.notes || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) { logger.error('createConsent error:', error); return null; }

  try {
    await recordAuditEvent({
      companyId,
      userId,
      action: `consent.created: ${data.consentType} for ${data.patientName}`,
      entityType: 'patient_consent',
      entityId: consent.id,
      metadata: { consentType: data.consentType },
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }

  return consent;
}

export async function revokeConsent(
  consentId: string,
  companyId: string,
  userId: string,
): Promise<void> {
  await (supabase as any)
    .from('patient_consents')
    .update({ consent_status: 'revoked' })
    .eq('id', consentId);

  try {
    await recordAuditEvent({
      companyId,
      userId,
      action: 'consent.revoked',
      entityType: 'patient_consent',
      entityId: consentId,
      metadata: {},
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }
}

export async function getConsents(
  companyId: string,
  statusFilter?: ConsentStatus | 'all'
): Promise<PatientConsent[]> {
  let query = (supabase as any)
    .from('patient_consents')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('consent_status', statusFilter);
  }

  const { data, error } = await query;
  if (error) { logger.error('getConsents error:', error); return []; }
  return data ?? [];
}

/* ── Consent ↔ Content Linking ───────────────────────── */

export async function linkConsentToContent(
  consentId: string,
  contentId: string,
  companyId: string,
  userId: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('consent_content_links')
    .insert({
      company_id: companyId,
      consent_id: consentId,
      content_id: contentId,
      linked_by: userId,
    });

  if (error) {
    if (error.code === '23505') return false; // already linked
    logger.error('linkConsentToContent error:', error);
    return false;
  }

  try {
    await recordAuditEvent({
      companyId,
      userId,
      action: 'consent.linked_to_content',
      entityType: 'patient_consent',
      entityId: consentId,
      metadata: { contentId },
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }

  return true;
}

export async function getConsentsForContent(contentId: string): Promise<PatientConsent[]> {
  const { data, error } = await (supabase as any)
    .from('consent_content_links')
    .select('consent:patient_consents(*)')
    .eq('content_id', contentId);

  if (error) { logger.error('getConsentsForContent error:', error); return []; }
  return (data ?? []).map((row: any) => row.consent).filter(Boolean);
}

/* ── PHI Scanner ─────────────────────────────────────── */

const PHI_PATTERNS: { type: string; regex: RegExp; label: string }[] = [
  { type: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g, label: 'Social Security Number' },
  { type: 'phone', regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, label: 'Phone Number' },
  { type: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, label: 'Email Address' },
  { type: 'dob', regex: /\b(?:DOB|date of birth|born on)[:\s]*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/gi, label: 'Date of Birth' },
  { type: 'mrn', regex: /\b(?:MRN|medical record|patient id|chart)[:\s#]*[A-Z0-9]{5,12}\b/gi, label: 'Medical Record Number' },
  { type: 'address', regex: /\b\d{1,5}\s+\w+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct)\b/gi, label: 'Street Address' },
  { type: 'full_name_with_mr', regex: /\b(?:Mr|Mrs|Ms|Dr|Patient)\.\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, label: 'Patient Name (with title)' },
];

export function scanTextForPHI(text: string): PHIFinding[] {
  const findings: PHIFinding[] = [];

  for (const pattern of PHI_PATTERNS) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

    while ((match = regex.exec(text)) !== null) {
      const start = Math.max(0, match.index - 40);
      const end = Math.min(text.length, match.index + match[0].length + 40);

      findings.push({
        type: pattern.label,
        value: match[0],
        position: match.index,
        context: '...' + text.slice(start, end) + '...',
      });
    }
  }

  return findings;
}

export function getPHIRiskLevel(findings: PHIFinding[]): string {
  if (findings.length === 0) return 'none';
  const hasSSN = findings.some(f => f.type === 'Social Security Number');
  const hasMRN = findings.some(f => f.type === 'Medical Record Number');
  if (hasSSN || hasMRN) return 'critical';
  if (findings.length >= 3) return 'high';
  if (findings.length >= 1) return 'medium';
  return 'low';
}

export async function savePHIScan(
  companyId: string,
  contentId: string | null,
  findings: PHIFinding[],
  userId: string
): Promise<void> {
  const riskLevel = getPHIRiskLevel(findings);

  await (supabase as any)
    .from('phi_scan_results')
    .insert({
      company_id: companyId,
      content_id: contentId,
      scan_type: 'text',
      findings,
      risk_level: riskLevel,
      scanned_by: userId,
    });

  if (findings.length > 0) {
    try {
      await recordAuditEvent({
        companyId,
        userId,
        action: `phi.scan_detected: ${findings.length} finding(s) — risk: ${riskLevel}`,
        entityType: 'phi_scan',
        entityId: contentId ?? companyId,
        metadata: { findingCount: findings.length, riskLevel, types: [...new Set(findings.map(f => f.type))] },
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }
}
