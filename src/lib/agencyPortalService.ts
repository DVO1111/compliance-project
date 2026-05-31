/**
 * Agency Portal Service
 * Manages agency profiles, approved claims library access,
 * and annotated feedback on agency submissions.
 */
import { supabase } from './supabase';

/* ── Types ──────────────────────────────────────────────────── */

export type AgencySubmission = {
  id: string;
  title: string;
  file_name: string;
  status: string;
  created_at: string;
  overall_risk?: string;
  feedback?: string;
};

export type ApprovedClaim = {
  id: string;
  block_name: string;
  block_type: string;
  content_text: string;
  jurisdiction: string;
  version: number;
  approved_at: string | null;
};

/* ── Fetch agency's own submissions + compliance reports ──── */

export async function fetchAgencySubmissions(userId: string): Promise<AgencySubmission[]> {
  const { data, error } = await (supabase as any)
    .from('content_submissions')
    .select(`
      id, title, file_name, status, created_at,
      compliance_reports ( overall_risk, flagged_phrases, suggested_rewrites )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((s: any) => {
    const report = s.compliance_reports?.[0];
    let feedback = '';
    if (report) {
      const flagged = report.flagged_phrases || [];
      const rewrites = report.suggested_rewrites || [];
      if (flagged.length) feedback += `${flagged.length} flagged phrases. `;
      if (rewrites.length) feedback += `${rewrites.length} suggested rewrites.`;
    }
    return {
      id: s.id,
      title: s.title,
      file_name: s.file_name,
      status: s.status,
      created_at: s.created_at,
      overall_risk: report?.overall_risk,
      feedback: feedback || undefined,
    };
  });
}

/* ── Fetch approved claims library (locked content blocks) ── */

export async function fetchApprovedClaims(companyId: string): Promise<ApprovedClaim[]> {
  const { data, error } = await (supabase as any)
    .from('content_blocks')
    .select('id, block_name, block_type, content_text, jurisdiction, version, approved_at')
    .eq('company_id', companyId)
    .eq('is_locked', true)
    .order('block_type')
    .limit(100);

  if (error || !data) return [];
  return data as ApprovedClaim[];
}

/* ── Copy claim text to clipboard helper ─────────────────── */

export function copyClaim(text: string) {
  navigator.clipboard.writeText(text);
}
