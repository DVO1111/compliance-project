/**
 * AI Insights Service
 *
 * Derives intelligence from existing compliance data — without an AI call on
 * every page load. Where AI text is generated it uses wrapAICall so failures
 * degrade gracefully to a pre-built template.
 *
 * Purpose: power the AI Insights page with patterns, anomalies, and
 * forward-looking signals that would not be visible in raw count dashboards.
 */

import { supabase } from './supabase';
import { generateText } from './geminiClient';
import { wrapAICall } from './aiResponseValidator';
import { getOSComplianceReport, type OSComplianceReport } from './complianceOSReportService';
import { logger } from './logger';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface SmartAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  domain: string;
  headline: string;
  detail: string;
}

export interface PatternItem {
  label: string;
  count: number;
  pct: number;
}

export interface CapaRootCause {
  cause: string;
  count: number;
}

export interface RecentAIAssessment {
  id: string;
  title: string;
  risk_score: number;
  risk_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
  created_at: string;
}

export interface AIInsightsData {
  report: OSComplianceReport;
  smartAlerts: SmartAlert[];
  topRejectionPatterns: PatternItem[];
  capaRootCauses: CapaRootCause[];
  recentAssessments: RecentAIAssessment[];
  narrativeSummary: string;
  generatedAt: string;
}

/* ── Smart alert derivation ─────────────────────────────────────────────── */

function deriveSmartAlerts(report: OSComplianceReport): SmartAlert[] {
  const alerts: SmartAlert[] = [];

  // Batch — holds
  if (report.batch.onHold > 0) {
    alerts.push({
      id: 'batch-hold',
      severity: 'critical',
      domain: 'Batch Release',
      headline: `${report.batch.onHold} batch${report.batch.onHold > 1 ? 'es' : ''} currently on hold`,
      detail: 'Held batches require immediate QC investigation. Each day on hold increases the risk of expiry and production delay.',
    });
  }

  // Batch — high hold rate
  if (report.batch.holdRate > 10 && report.batch.total > 3) {
    alerts.push({
      id: 'batch-hold-rate',
      severity: 'warning',
      domain: 'Batch Release',
      headline: `Batch hold rate elevated at ${report.batch.holdRate}%`,
      detail: 'A hold rate above 10% signals recurring QC failures. Review raw material suppliers and in-process controls.',
    });
  }

  // CAPAs — overdue
  if (report.capa.overdue > 0) {
    alerts.push({
      id: 'capa-overdue',
      severity: 'critical',
      domain: 'CAPA & Deviations',
      headline: `${report.capa.overdue} overdue CAPA${report.capa.overdue > 1 ? 's' : ''}`,
      detail: 'Overdue CAPAs are a primary finding in NAFDAC/ISO 22000 inspections. Escalate to the responsible owner immediately.',
    });
  }

  // CAPAs — high open count
  if (report.capa.open + report.capa.investigating > 5) {
    alerts.push({
      id: 'capa-volume',
      severity: 'warning',
      domain: 'CAPA & Deviations',
      headline: `${report.capa.open + report.capa.investigating} CAPAs open or under investigation`,
      detail: 'A high open CAPA count may indicate systemic quality issues. Consider a root cause clustering analysis.',
    });
  }

  // SOPs — overdue review
  if (report.sop.overdueReview > 0) {
    alerts.push({
      id: 'sop-overdue',
      severity: 'critical',
      domain: 'Document Control',
      headline: `${report.sop.overdueReview} SOP${report.sop.overdueReview > 1 ? 's' : ''} overdue for periodic review`,
      detail: 'Operating with SOPs past their review date is a GMP non-conformity. Schedule reviews and update the review due dates.',
    });
  }

  // SOPs — expiring soon
  if (report.sop.expiringIn30 > 0) {
    alerts.push({
      id: 'sop-expiring',
      severity: 'warning',
      domain: 'Document Control',
      headline: `${report.sop.expiringIn30} SOP${report.sop.expiringIn30 > 1 ? 's' : ''} due for review within 30 days`,
      detail: 'Initiate the review cycle now to avoid operating on expired SOPs. Assign reviewers and set approval deadlines.',
    });
  }

  // Change controls — stalled in pending approval
  if (report.changeControl.pendingApproval > 0) {
    alerts.push({
      id: 'cc-pending',
      severity: 'warning',
      domain: 'Change Control',
      headline: `${report.changeControl.pendingApproval} change control${report.changeControl.pendingApproval > 1 ? 's' : ''} awaiting approval`,
      detail: 'Pending change controls block downstream implementation. Check for missing impact assessments or approver availability.',
    });
  }

  // Change controls — slow cycle time
  if (report.changeControl.avgDaysOpen > 30) {
    alerts.push({
      id: 'cc-slow',
      severity: 'warning',
      domain: 'Change Control',
      headline: `Average change control cycle time is ${report.changeControl.avgDaysOpen} days`,
      detail: 'Target cycle time for minor changes is ≤14 days, major changes ≤30 days. Review approval bottlenecks.',
    });
  }

  // GRC — low compliance rate
  if (report.grc.total > 0 && report.grc.complianceRate < 60) {
    alerts.push({
      id: 'grc-low',
      severity: report.grc.complianceRate < 40 ? 'critical' : 'warning',
      domain: 'GRC Controls',
      headline: `GRC control implementation at ${report.grc.complianceRate}%`,
      detail: `${report.grc.notImplemented} controls not yet implemented. Low control implementation increases audit risk.`,
    });
  }

  // Content — low approval rate
  if (report.content.total > 10 && report.content.approvalRate < 60) {
    alerts.push({
      id: 'content-low-approval',
      severity: 'warning',
      domain: 'Content Review',
      headline: `Content approval rate is ${report.content.approvalRate}%`,
      detail: 'A rate below 70% may indicate systemic issues with content creation standards or brief quality. Review top rejection causes.',
    });
  }

  // No issues — positive signal
  if (alerts.length === 0) {
    alerts.push({
      id: 'all-good',
      severity: 'info',
      domain: 'All Domains',
      headline: 'No critical compliance alerts detected',
      detail: 'All monitored compliance metrics are within acceptable thresholds. Continue scheduled reviews and monitoring.',
    });
  }

  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}

/* ── Data fetchers ──────────────────────────────────────────────────────── */

async function fetchRejectionPatterns(companyId: string): Promise<PatternItem[]> {
  const { data } = await (supabase as any)
    .from('content_submissions')
    .select('rejection_reasons')
    .eq('company_id', companyId)
    .eq('status', 'rejected')
    .not('rejection_reasons', 'is', null);

  if (!data || data.length === 0) return [];

  const counts: Record<string, number> = {};
  for (const row of data) {
    const reasons: string[] = Array.isArray(row.rejection_reasons)
      ? row.rejection_reasons
      : typeof row.rejection_reasons === 'string'
        ? [row.rejection_reasons]
        : [];
    for (const r of reasons) {
      const key = String(r).trim();
      if (key) counts[key] = (counts[key] || 0) + 1;
    }
  }

  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({
      label,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
}

async function fetchCapaRootCauses(companyId: string): Promise<CapaRootCause[]> {
  const { data } = await (supabase as any)
    .from('capa_records')
    .select('root_cause')
    .eq('company_id', companyId)
    .not('root_cause', 'is', null);

  if (!data || data.length === 0) return [];

  const counts: Record<string, number> = {};
  for (const row of data) {
    const key = String(row.root_cause || '').trim().slice(0, 80);
    if (key) counts[key] = (counts[key] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cause, count]) => ({ cause, count }));
}

async function fetchRecentAIAssessments(companyId: string): Promise<RecentAIAssessment[]> {
  const { data } = await (supabase as any)
    .from('ai_risk_assessments')
    .select('id, submission_id, ai_risk_score, risk_grade, summary, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data) return [];

  return data.map((d: any) => ({
    id: d.id,
    title: `Submission ${d.submission_id?.slice(0, 8) ?? '—'}`,
    risk_score: d.ai_risk_score ?? 0,
    risk_grade: d.risk_grade ?? 'C',
    summary: d.summary ?? 'No summary available.',
    created_at: d.created_at,
  }));
}

/* ── Narrative summary ──────────────────────────────────────────────────── */

function buildFallbackNarrative(report: OSComplianceReport, alerts: SmartAlert[]): string {
  const criticals = alerts.filter(a => a.severity === 'critical').length;
  const warnings  = alerts.filter(a => a.severity === 'warning').length;
  const score     = report.overallScore;
  const scoreWord = score >= 75 ? 'healthy' : score >= 50 ? 'moderate' : 'needs improvement';

  let text = `Your organisation's compliance posture is ${scoreWord} with an overall score of ${score}/100. `;

  if (criticals > 0) {
    text += `There are ${criticals} critical issue${criticals > 1 ? 's' : ''} requiring immediate attention — `;
    text += alerts.filter(a => a.severity === 'critical').map(a => a.headline).join('; ') + '. ';
  }

  if (warnings > 0) {
    text += `${warnings} area${warnings > 1 ? 's' : ''} require monitoring: `;
    text += alerts.filter(a => a.severity === 'warning').map(a => a.domain).join(', ') + '. ';
  }

  if (report.sop.overdueReview === 0 && report.capa.overdue === 0 && report.batch.onHold === 0) {
    text += 'Manufacturing quality and document control are current — maintain scheduled reviews to stay ahead of audit readiness.';
  } else {
    text += 'Prioritise resolving critical items before your next scheduled NAFDAC/ISO inspection.';
  }

  return text;
}

async function generateNarrative(
  report: OSComplianceReport,
  alerts: SmartAlert[]
): Promise<string> {
  const prompt = `You are a compliance analyst summarising an organisation's compliance status in 3–4 sentences for a senior manager.

Current data:
- Overall score: ${report.overallScore}/100
- Critical alerts: ${alerts.filter(a => a.severity === 'critical').map(a => a.headline).join('; ') || 'None'}
- Warnings: ${alerts.filter(a => a.severity === 'warning').map(a => a.headline).join('; ') || 'None'}
- Batches on hold: ${report.batch.onHold}, Overdue CAPAs: ${report.capa.overdue}, Overdue SOPs: ${report.sop.overdueReview}
- GRC compliance rate: ${report.grc.complianceRate}%

Write a concise, professional narrative (3–4 sentences max). No headers, no bullet points. Plain prose only.`;

  const result = await wrapAICall<string | null>(
    () => generateText(prompt),
    {},
    null,
    { action: 'ai_insights_narrative' }
  );

  return result && result.length > 20
    ? result
    : buildFallbackNarrative(report, alerts);
}

/* ── Main function ──────────────────────────────────────────────────────── */

export async function getAIInsights(
  companyId: string,
  generateNarrativeText = false
): Promise<AIInsightsData> {
  const [report, rejectionPatterns, capaRootCauses, recentAssessments] =
    await Promise.allSettled([
      getOSComplianceReport(companyId),
      fetchRejectionPatterns(companyId),
      fetchCapaRootCauses(companyId),
      fetchRecentAIAssessments(companyId),
    ]).then(results => results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      logger.warn(`AIInsights: fetch ${i} failed`, (r as PromiseRejectedResult).reason);
      return null;
    }));

  const safeReport = (report as OSComplianceReport) ?? {
    generatedAt: new Date().toISOString(),
    overallScore: 0, criticalIssues: 0, openActions: 0,
    batch: { total:0, released:0, qcPending:0, qcInProgress:0, onHold:0, rejected:0, releaseRate:0, holdRate:0 },
    changeControl: { total:0, draft:0, pendingApproval:0, approved:0, implementing:0, closed:0, rejected:0, avgDaysOpen:0 },
    sop: { total:0, effective:0, inReview:0, draft:0, overdueReview:0, expiringIn30:0 },
    capa: { total:0, open:0, investigating:0, inProgress:0, overdue:0, closed:0, overdueRate:0, avgDaysToClose:0 },
    grc: { total:0, active:0, implemented:0, partial:0, notImplemented:0, complianceRate:0 },
    content: { total:0, approved:0, rejected:0, pending:0, approvalRate:0, avgTurnaroundHrs:0 },
    domainScores: [],
  };

  const smartAlerts = deriveSmartAlerts(safeReport);

  const narrativeSummary = generateNarrativeText
    ? await generateNarrative(safeReport, smartAlerts)
    : buildFallbackNarrative(safeReport, smartAlerts);

  return {
    report: safeReport,
    smartAlerts,
    topRejectionPatterns: (rejectionPatterns as PatternItem[]) ?? [],
    capaRootCauses: (capaRootCauses as CapaRootCause[]) ?? [],
    recentAssessments: (recentAssessments as RecentAIAssessment[]) ?? [],
    narrativeSummary,
    generatedAt: new Date().toISOString(),
  };
}
