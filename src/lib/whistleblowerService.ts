/**
 * Whistleblower & Internal Reporting Service — Supabase-backed
 */
import { supabase } from './supabase';
import { generateJSON } from './geminiClient';
import { logger } from './logger';

export type ReportStatus = 'submitted' | 'under_investigation' | 'escalated' | 'resolved' | 'dismissed';
export type ReportCategory = 'off_label_promotion' | 'misleading_claims' | 'data_integrity' | 'kickback_concern' | 'safety_reporting_failure' | 'other';

export type WhistleblowerReport = {
  id: string;
  company_id: string;
  case_number: string;
  category: ReportCategory;
  subject: string;
  description: string;
  status: ReportStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  anonymous: boolean;
  submitted_by: string | null;
  submitted_at: string;
  last_updated_at: string;
  updates?: CaseUpdate[];
};

export type CaseUpdate = {
  id: string;
  report_id: string;
  action: string;
  note: string | null;
  performed_by: string;
  created_at: string;
};

export type ReportingStats = {
  totalReports: number;
  openCases: number;
  resolvedCases: number;
  avgResolutionDays: number;
  byCategory: { category: string; count: number }[];
};

export const REPORT_CATEGORIES: { id: ReportCategory; label: string }[] = [
  { id: 'off_label_promotion', label: 'Off-Label Promotion' },
  { id: 'misleading_claims', label: 'Misleading Claims' },
  { id: 'data_integrity', label: 'Data Integrity Concern' },
  { id: 'kickback_concern', label: 'Kickback / Inducement Concern' },
  { id: 'safety_reporting_failure', label: 'Safety Reporting Failure' },
  { id: 'other', label: 'Other Compliance Concern' },
];

/* ── CRUD ─────────────────────────────────────────────── */

export async function getReports(companyId: string): Promise<WhistleblowerReport[]> {
  const { data, error } = await (supabase as any)
    .from('whistleblower_reports')
    .select('*, updates:whistleblower_case_updates(*)')
    .eq('company_id', companyId)
    .order('submitted_at', { ascending: false });

  if (error) { logger.error('getReports error:', error); return []; }
  return data ?? [];
}

export async function submitReport(companyId: string, userId: string | null, report: {
  category: ReportCategory;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  anonymous: boolean;
}): Promise<WhistleblowerReport | null> {
  // Generate case number
  const year = new Date().getFullYear();
  const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  const caseNumber = `WB-${year}-${rand}`;

  const { data, error } = await (supabase as any)
    .from('whistleblower_reports')
    .insert({
      company_id: companyId,
      case_number: caseNumber,
      category: report.category,
      subject: report.subject,
      description: report.description,
      status: 'submitted',
      priority: report.priority,
      anonymous: report.anonymous,
      submitted_by: report.anonymous ? null : userId,
    })
    .select()
    .single();

  if (error) { logger.error('submitReport error:', error); return null; }

  // Add initial case update
  await addCaseUpdate(data.id, 'Report received', report.anonymous ? 'Anonymous report received via secure channel' : 'Report submitted', 'System');

  return data;
}

export async function updateReportStatus(reportId: string, status: ReportStatus): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('whistleblower_reports')
    .update({ status, last_updated_at: new Date().toISOString() })
    .eq('id', reportId);

  if (error) { logger.error('updateReportStatus error:', error); return false; }
  return true;
}

export async function addCaseUpdate(reportId: string, action: string, note: string, performedBy: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('whistleblower_case_updates')
    .insert({ report_id: reportId, action, note, performed_by: performedBy });

  if (error) { logger.error('addCaseUpdate error:', error); return false; }

  // Update last_updated_at on report
  await (supabase as any)
    .from('whistleblower_reports')
    .update({ last_updated_at: new Date().toISOString() })
    .eq('id', reportId);

  return true;
}

/* ── Stats (computed from live data) ─────────────────── */

export async function getReportingStats(companyId: string): Promise<ReportingStats> {
  const { data } = await (supabase as any)
    .from('whistleblower_reports')
    .select('status, category, submitted_at, last_updated_at')
    .eq('company_id', companyId);

  const reports = data ?? [];
  const open = reports.filter((r: any) => ['submitted', 'under_investigation', 'escalated'].includes(r.status));
  const resolved = reports.filter((r: any) => r.status === 'resolved');

  const catCounts: Record<string, number> = {};
  for (const r of reports) {
    const label = REPORT_CATEGORIES.find(c => c.id === r.category)?.label || r.category;
    catCounts[label] = (catCounts[label] || 0) + 1;
  }

  let avgDays = 0;
  if (resolved.length > 0) {
    const totalDays = resolved.reduce((sum: number, r: any) => {
      const diff = new Date(r.last_updated_at).getTime() - new Date(r.submitted_at).getTime();
      return sum + diff / 86400000;
    }, 0);
    avgDays = Math.round((totalDays / resolved.length) * 10) / 10;
  }

  return {
    totalReports: reports.length,
    openCases: open.length,
    resolvedCases: resolved.length,
    avgResolutionDays: avgDays,
    byCategory: Object.entries(catCounts).map(([category, count]) => ({ category, count })),
  };
}

/* ── AI Triage Engine ─────────────────────────────────── */

export async function runWhistleblowerTriage(reportId: string): Promise<{ success: boolean; p_update?: string }> {
  // 1. Get report data
  const { data: report, error } = await (supabase as any)
    .from('whistleblower_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error || !report) return { success: false };

  // 2. Construct AI Prompt
  const prompt = `
    Analyze this internal compliance report for triage and prioritization.
    
    CATEGORY: ${REPORT_CATEGORIES.find(c => c.id === report.category)?.label || report.category}
    SUBJECT: ${report.subject}
    DESCRIPTION: ${report.description}
    INITIAL PRIORITY: ${report.priority}

    TASK:
    1. Re-assess Priority: (low, medium, high, critical)
    2. Identify Immediate Risks: (e.g., patient safety, imminent data breach, legal jeopardy)
    3. Generate a concise Intake Summary for investigators.

    RESPONSE FORMAT (JSON):
    {
      "priority": "low" | "medium" | "high" | "critical",
      "immediate_risks": "string | null",
      "intake_summary": "string",
      "risk_factors": ["string"]
    }
  `;

  try {
    const assessment = await generateJSON<{
      priority: 'low' | 'medium' | 'high' | 'critical';
      immediate_risks: string | null;
      intake_summary: string;
      risk_factors: string[];
    }>(prompt);

    // 3. Update report priority if changed
    if (assessment.priority !== report.priority) {
      await (supabase as any)
        .from('whistleblower_reports')
        .update({ priority: assessment.priority, last_updated_at: new Date().toISOString() })
        .eq('id', reportId);
    }

    // 4. Log AI Triage update
    const note = `AI TRIAGE ASSESSMENT:
- Priority: ${assessment.priority.toUpperCase()}
- Summary: ${assessment.intake_summary}
${assessment.immediate_risks ? `- IMMEDIATE RISK: ${assessment.immediate_risks}` : ''}
- Factors: ${assessment.risk_factors.join(', ')}`;

    await addCaseUpdate(reportId, 'AI Triage Complete', note, 'System (AI)');

    return { success: true, p_update: assessment.priority !== report.priority ? assessment.priority : undefined };
  } catch (err) {
    logger.error('runWhistleblowerTriage AI Error:', err);
    return { success: false };
  }
}
