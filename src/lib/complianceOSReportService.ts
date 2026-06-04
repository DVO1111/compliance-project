/**
 * Compliance OS Report Service
 *
 * Aggregates compliance metrics across ALL modules:
 *   - Batch Release (manufacturing quality)
 *   - Change Control
 *   - SOP / Document Control
 *   - CAPA & Deviations
 *   - GRC Controls
 *   - Content & Marketing Review (legacy)
 *
 * Used by ComplianceReportingPage to produce the OS-level compliance view.
 */

import { supabase } from './supabase';
import { logger } from './logger';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface BatchMetrics {
  total: number;
  released: number;
  qcPending: number;
  qcInProgress: number;
  onHold: number;
  rejected: number;
  releaseRate: number;       // released / (released + rejected) %
  holdRate: number;          // on hold / total %
}

export interface ChangeControlMetrics {
  total: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  implementing: number;
  closed: number;
  rejected: number;
  avgDaysOpen: number;
}

export interface SopMetrics {
  total: number;
  effective: number;
  inReview: number;
  draft: number;
  overdueReview: number;    // review_due_date < today AND status = effective
  expiringIn30: number;     // review_due_date within 30 days
}

export interface CapaMetrics {
  total: number;
  open: number;
  investigating: number;
  inProgress: number;
  overdue: number;
  closed: number;
  overdueRate: number;      // overdue / (open + investigating + inProgress + overdue) %
  avgDaysToClose: number;
}

export interface GrcMetrics {
  total: number;
  active: number;
  implemented: number;
  partial: number;
  notImplemented: number;
  complianceRate: number;   // implemented / (active) %
}

export interface ContentMetrics {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  approvalRate: number;
  avgTurnaroundHrs: number;
}

export interface OSComplianceReport {
  generatedAt: string;
  overallScore: number;      // 0–100 composite
  criticalIssues: number;    // held batches + overdue CAPAs + SOPs overdue
  openActions: number;       // pending approvals + open CAPAs + batches in QC
  batch: BatchMetrics;
  changeControl: ChangeControlMetrics;
  sop: SopMetrics;
  capa: CapaMetrics;
  grc: GrcMetrics;
  content: ContentMetrics;
  domainScores: DomainScore[];
}

export interface DomainScore {
  domain: string;
  score: number;       // 0–100
  status: 'good' | 'warning' | 'critical';
  issues: string[];
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return Math.round((num / den) * 100);
}

function domainStatus(score: number): DomainScore['status'] {
  if (score >= 75) return 'good';
  if (score >= 50) return 'warning';
  return 'critical';
}

/* ── Batch metrics ──────────────────────────────────────────────────────── */

async function fetchBatchMetrics(companyId: string): Promise<BatchMetrics> {
  const { data } = await (supabase as any)
    .from('batch_records')
    .select('status')
    .eq('company_id', companyId);

  const rows: { status: string }[] = data ?? [];
  const count = (s: string) => rows.filter(r => r.status === s).length;

  const released = count('released');
  const rejected = count('rejected');
  const onHold   = count('hold');
  const total    = rows.length;

  return {
    total,
    released,
    qcPending:    count('qc_pending'),
    qcInProgress: count('qc_in_progress'),
    onHold,
    rejected,
    releaseRate:  pct(released, released + rejected),
    holdRate:     pct(onHold, total),
  };
}

/* ── Change control metrics ─────────────────────────────────────────────── */

async function fetchChangeControlMetrics(companyId: string): Promise<ChangeControlMetrics> {
  const { data } = await (supabase as any)
    .from('change_controls')
    .select('status, created_at, approved_at')
    .eq('company_id', companyId);

  const rows: { status: string; created_at: string; approved_at: string | null }[] = data ?? [];
  const count = (s: string) => rows.filter(r => r.status === s).length;

  const closedWithDates = rows.filter(r => r.status === 'closed' && r.approved_at);
  const avgDaysOpen = closedWithDates.length > 0
    ? Math.round(
        closedWithDates.reduce((sum, r) => {
          const ms = new Date(r.approved_at!).getTime() - new Date(r.created_at).getTime();
          return sum + ms / 86_400_000;
        }, 0) / closedWithDates.length
      )
    : 0;

  return {
    total:           rows.length,
    draft:           count('draft'),
    pendingApproval: count('pending_approval'),
    approved:        count('approved'),
    implementing:    count('implementing'),
    closed:          count('closed'),
    rejected:        count('rejected'),
    avgDaysOpen,
  };
}

/* ── SOP metrics ────────────────────────────────────────────────────────── */

async function fetchSopMetrics(companyId: string): Promise<SopMetrics> {
  const { data } = await (supabase as any)
    .from('sop_documents')
    .select('status, review_due_date')
    .eq('company_id', companyId);

  const rows: { status: string; review_due_date: string | null }[] = data ?? [];
  const today = new Date();
  const in30   = new Date(today.getTime() + 30 * 86_400_000);

  const count = (s: string) => rows.filter(r => r.status === s).length;
  const overdueReview = rows.filter(r =>
    r.status === 'effective' &&
    r.review_due_date &&
    new Date(r.review_due_date) < today
  ).length;
  const expiringIn30 = rows.filter(r =>
    r.status === 'effective' &&
    r.review_due_date &&
    new Date(r.review_due_date) >= today &&
    new Date(r.review_due_date) <= in30
  ).length;

  return {
    total:        rows.length,
    effective:    count('effective'),
    inReview:     count('in_review'),
    draft:        count('draft'),
    overdueReview,
    expiringIn30,
  };
}

/* ── CAPA metrics ───────────────────────────────────────────────────────── */

async function fetchCapaMetrics(companyId: string): Promise<CapaMetrics> {
  const { data } = await (supabase as any)
    .from('capa_records')
    .select('status, created_at, closed_at')
    .eq('company_id', companyId);

  const rows: { status: string; created_at: string; closed_at: string | null }[] = data ?? [];
  const count = (s: string) => rows.filter(r => r.status === s).length;

  const open         = count('open');
  const investigating = count('investigating');
  const inProgress   = count('in_progress') + count('action_planned') + count('verification');
  const overdue      = count('overdue');
  const closed       = count('closed');

  const closedRows = rows.filter(r => r.status === 'closed' && r.closed_at);
  const avgDaysToClose = closedRows.length > 0
    ? Math.round(
        closedRows.reduce((sum, r) => {
          const ms = new Date(r.closed_at!).getTime() - new Date(r.created_at).getTime();
          return sum + ms / 86_400_000;
        }, 0) / closedRows.length
      )
    : 0;

  const active = open + investigating + inProgress + overdue;

  return {
    total: rows.length,
    open,
    investigating,
    inProgress,
    overdue,
    closed,
    overdueRate:   pct(overdue, active),
    avgDaysToClose,
  };
}

/* ── GRC metrics ────────────────────────────────────────────────────────── */

async function fetchGrcMetrics(companyId: string): Promise<GrcMetrics> {
  const { data } = await (supabase as any)
    .from('grc_controls')
    .select('status')
    .eq('company_id', companyId);

  const rows: { status: string }[] = data ?? [];
  const count = (s: string) => rows.filter(r => r.status === s).length;

  const active        = count('active');
  const implemented   = count('implemented');
  const partial       = count('partial');
  const notImplemented = count('not_implemented') + count('pending');

  return {
    total: rows.length,
    active,
    implemented,
    partial,
    notImplemented,
    complianceRate: pct(implemented, active + implemented + partial + notImplemented),
  };
}

/* ── Content metrics ────────────────────────────────────────────────────── */

async function fetchContentMetrics(companyId: string): Promise<ContentMetrics> {
  const { data } = await (supabase as any)
    .from('content_submissions')
    .select('status, created_at, updated_at')
    .eq('company_id', companyId);

  const rows: { status: string; created_at: string; updated_at: string }[] = data ?? [];
  const count = (s: string) => rows.filter(r => r.status === s).length;

  const approved = count('approved');
  const rejected = count('rejected');
  const pending  = count('pending') + count('legal_review') + count('flagged');

  const decidedRows = rows.filter(r => ['approved', 'rejected'].includes(r.status));
  const avgTurnaroundHrs = decidedRows.length > 0
    ? Math.round(
        decidedRows.reduce((sum, r) => {
          const ms = new Date(r.updated_at).getTime() - new Date(r.created_at).getTime();
          return sum + ms / 3_600_000;
        }, 0) / decidedRows.length
      )
    : 0;

  return {
    total: rows.length,
    approved,
    rejected,
    pending,
    approvalRate: pct(approved, approved + rejected),
    avgTurnaroundHrs,
  };
}

/* ── Domain scoring ─────────────────────────────────────────────────────── */

function scoreBatch(m: BatchMetrics): DomainScore {
  const issues: string[] = [];
  if (m.onHold > 0) issues.push(`${m.onHold} batch${m.onHold > 1 ? 'es' : ''} on hold`);
  if (m.qcPending > 2) issues.push(`${m.qcPending} batches awaiting QC`);

  let score = 100;
  score -= m.onHold * 15;
  score -= Math.max(0, m.qcPending - 2) * 5;
  if (m.releaseRate < 90 && m.total > 0) score -= (90 - m.releaseRate);
  score = Math.max(0, Math.min(100, score));

  return { domain: 'Batch Release', score, status: domainStatus(score), issues };
}

function scoreChangeControl(m: ChangeControlMetrics): DomainScore {
  const issues: string[] = [];
  if (m.pendingApproval > 0) issues.push(`${m.pendingApproval} awaiting approval`);
  if (m.avgDaysOpen > 30) issues.push(`Avg ${m.avgDaysOpen}d to close (target ≤30d)`);

  let score = 100;
  score -= m.pendingApproval * 10;
  if (m.avgDaysOpen > 30) score -= Math.min(30, m.avgDaysOpen - 30);
  score = Math.max(0, Math.min(100, score));

  return { domain: 'Change Control', score, status: domainStatus(score), issues };
}

function scoreSop(m: SopMetrics): DomainScore {
  const issues: string[] = [];
  if (m.overdueReview > 0) issues.push(`${m.overdueReview} SOP${m.overdueReview > 1 ? 's' : ''} overdue for review`);
  if (m.expiringIn30 > 0) issues.push(`${m.expiringIn30} SOP${m.expiringIn30 > 1 ? 's' : ''} due for review in 30 days`);
  if (m.draft > 0) issues.push(`${m.draft} SOP${m.draft > 1 ? 's' : ''} still in draft`);

  let score = 100;
  score -= m.overdueReview * 15;
  score -= m.expiringIn30 * 5;
  score -= Math.max(0, m.draft - 1) * 3;
  score = Math.max(0, Math.min(100, score));

  return { domain: 'Document Control', score, status: domainStatus(score), issues };
}

function scoreCapa(m: CapaMetrics): DomainScore {
  const issues: string[] = [];
  if (m.overdue > 0) issues.push(`${m.overdue} overdue CAPA${m.overdue > 1 ? 's' : ''}`);
  if (m.open + m.investigating > 3) issues.push(`${m.open + m.investigating} CAPAs open/under investigation`);

  let score = 100;
  score -= m.overdue * 20;
  score -= Math.max(0, m.open + m.investigating - 3) * 5;
  score = Math.max(0, Math.min(100, score));

  return { domain: 'CAPA & Deviations', score, status: domainStatus(score), issues };
}

function scoreGrc(m: GrcMetrics): DomainScore {
  const issues: string[] = [];
  if (m.notImplemented > 0) issues.push(`${m.notImplemented} control${m.notImplemented > 1 ? 's' : ''} not implemented`);
  if (m.partial > 0) issues.push(`${m.partial} control${m.partial > 1 ? 's' : ''} partially implemented`);

  const score = m.total === 0 ? 80 : m.complianceRate;
  return { domain: 'GRC Controls', score, status: domainStatus(score), issues };
}

function scoreContent(m: ContentMetrics): DomainScore {
  const issues: string[] = [];
  if (m.pending > 5) issues.push(`${m.pending} submissions awaiting review`);
  if (m.approvalRate < 70 && m.total > 5) issues.push(`Approval rate ${m.approvalRate}% (target ≥70%)`);

  const score = m.total === 0 ? 85 : Math.min(100, m.approvalRate + (m.pending > 5 ? -10 : 0));
  return { domain: 'Content Review', score, status: domainStatus(score), issues };
}

/* ── Composite score ────────────────────────────────────────────────────── */

function compositeScore(domains: DomainScore[]): number {
  const weights: Record<string, number> = {
    'Batch Release':    0.25,
    'Change Control':   0.15,
    'Document Control': 0.15,
    'CAPA & Deviations': 0.20,
    'GRC Controls':     0.15,
    'Content Review':   0.10,
  };
  let total = 0;
  let totalWeight = 0;
  for (const d of domains) {
    const w = weights[d.domain] ?? 0.10;
    total += d.score * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? Math.round(total / totalWeight) : 0;
}

/* ── Main report function ───────────────────────────────────────────────── */

export async function getOSComplianceReport(companyId: string): Promise<OSComplianceReport> {
  const [batch, changeControl, sop, capa, grc, content] = await Promise.allSettled([
    fetchBatchMetrics(companyId),
    fetchChangeControlMetrics(companyId),
    fetchSopMetrics(companyId),
    fetchCapaMetrics(companyId),
    fetchGrcMetrics(companyId),
    fetchContentMetrics(companyId),
  ]).then(results => results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    logger.warn(`OSReport: domain ${i} failed:`, (r as PromiseRejectedResult).reason);
    return null;
  }));

  const batchM = (batch as BatchMetrics)           ?? { total:0, released:0, qcPending:0, qcInProgress:0, onHold:0, rejected:0, releaseRate:0, holdRate:0 };
  const ccM    = (changeControl as ChangeControlMetrics) ?? { total:0, draft:0, pendingApproval:0, approved:0, implementing:0, closed:0, rejected:0, avgDaysOpen:0 };
  const sopM   = (sop as SopMetrics)               ?? { total:0, effective:0, inReview:0, draft:0, overdueReview:0, expiringIn30:0 };
  const capaM  = (capa as CapaMetrics)             ?? { total:0, open:0, investigating:0, inProgress:0, overdue:0, closed:0, overdueRate:0, avgDaysToClose:0 };
  const grcM   = (grc as GrcMetrics)               ?? { total:0, active:0, implemented:0, partial:0, notImplemented:0, complianceRate:0 };
  const contentM = (content as ContentMetrics)     ?? { total:0, approved:0, rejected:0, pending:0, approvalRate:0, avgTurnaroundHrs:0 };

  const domainScores = [
    scoreBatch(batchM),
    scoreChangeControl(ccM),
    scoreSop(sopM),
    scoreCapa(capaM),
    scoreGrc(grcM),
    scoreContent(contentM),
  ];

  const criticalIssues = batchM.onHold + capaM.overdue + sopM.overdueReview;
  const openActions    = ccM.pendingApproval + capaM.open + batchM.qcPending + batchM.qcInProgress;

  return {
    generatedAt:    new Date().toISOString(),
    overallScore:   compositeScore(domainScores),
    criticalIssues,
    openActions,
    batch:          batchM,
    changeControl:  ccM,
    sop:            sopM,
    capa:           capaM,
    grc:            grcM,
    content:        contentM,
    domainScores,
  };
}
