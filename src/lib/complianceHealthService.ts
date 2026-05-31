/**
 * Compliance Health Service
 * Calculates composite health score and analytics for executive reporting.
 */
import { supabase } from './supabase';

/* ── Types ──────────────────────────────────────────────────── */

export type HealthScore = {
  overall: number;           // 0–100
  approvalRate: number;      // 0–1
  avgTurnaroundHrs: number;
  pendingQueueDepth: number;
  rejectionTrend: 'improving' | 'stable' | 'worsening';
  adverseEventsCount: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
};

export type TherapeuticBreakdown = {
  topic: string;
  submissions: number;
  approved: number;
  rejected: number;
  avgCycles: number;
  riskLevel: 'low' | 'medium' | 'high';
};

export type ClaimRejection = {
  phrase: string;
  count: number;
  category: string;
};

export type BottleneckEntry = {
  stage: string;
  avgDaysStuck: number;
  itemCount: number;
};

/* ── Calculate health score ──────────────────────────────── */

export async function calculateHealthScore(companyId: string): Promise<HealthScore> {
  const { data: metrics } = await (supabase as any).rpc(
    'get_company_dashboard_metrics',
    { p_company_id: companyId }
  );

  const m = (metrics as any) || {};
  const approvalRate = m.approval_rate || 0;
  const avgHrs = m.avg_turnaround_hours || 0;
  const queueDepth = m.in_legal_queue || 0;
  const rejected = m.rejected || 0;
  const total = m.total_submitted || 1;

  // Composite score formula (higher = healthier)
  let score = 100;
  score -= (1 - approvalRate) * 40;           // approval weight: 40
  score -= Math.min(avgHrs / 72, 1) * 20;     // turnaround weight: 20
  score -= Math.min(queueDepth / 20, 1) * 15; // queue weight: 15
  score -= Math.min(rejected / total, 1) * 25; // rejection weight: 25
  score = Math.max(0, Math.min(100, Math.round(score)));

  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';

  // Check AE count
  const { count: aeCount } = await (supabase as any)
    .from('adverse_events')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'detected');

  return {
    overall: score,
    approvalRate,
    avgTurnaroundHrs: avgHrs,
    pendingQueueDepth: queueDepth,
    rejectionTrend: approvalRate > 0.8 ? 'improving' : approvalRate > 0.5 ? 'stable' : 'worsening',
    adverseEventsCount: aeCount || 0,
    grade,
  };
}

/* ── Therapeutic area breakdown ──────────────────────────── */

export async function getTherapeuticBreakdown(companyId: string): Promise<TherapeuticBreakdown[]> {
  const { data } = await (supabase as any)
    .from('content_submissions')
    .select('content_topic, status')
    .eq('company_id', companyId);

  if (!data || !data.length) return [];

  const map: Record<string, { total: number; approved: number; rejected: number }> = {};
  for (const row of data) {
    const topic = row.content_topic || 'Other';
    if (!map[topic]) map[topic] = { total: 0, approved: 0, rejected: 0 };
    map[topic].total++;
    if (row.status === 'approved') map[topic].approved++;
    if (row.status === 'rejected') map[topic].rejected++;
  }

  return Object.entries(map).map(([topic, v]) => ({
    topic,
    submissions: v.total,
    approved: v.approved,
    rejected: v.rejected,
    avgCycles: v.total > 0 ? +(v.total / Math.max(v.approved, 1)).toFixed(1) : 0,
    riskLevel: (v.rejected / v.total > 0.3 ? 'high' : v.rejected / v.total > 0.15 ? 'medium' : 'low') as "low" | "medium" | "high",
  })).sort((a, b) => b.submissions - a.submissions);
}

/* ── Top rejection causes ────────────────────────────────── */

export async function getTopRejectionCauses(companyId: string): Promise<ClaimRejection[]> {
  const { data } = await (supabase as any)
    .from('compliance_reports')
    .select('flagged_phrases, content_id')
    .limit(200);

  if (!data || !data.length) return [];

  const counts: Record<string, number> = {};
  for (const report of data) {
    const phrases = report.flagged_phrases || [];
    for (const p of phrases) {
      const text = typeof p === 'string' ? p : p.phrase || p.text || JSON.stringify(p);
      counts[text] = (counts[text] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([phrase, count]) => ({ phrase, count, category: 'claim' }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

/* ── Bottleneck analysis ─────────────────────────────────── */

export async function getBottleneckAnalysis(companyId: string): Promise<BottleneckEntry[]> {
  const { data } = await (supabase as any)
    .from('content_submissions')
    .select('status, created_at, updated_at')
    .eq('company_id', companyId)
    .in('status', ['pending', 'awaiting_legal', 'in_review']);

  if (!data || !data.length) return [];

  const stages: Record<string, { totalDays: number; count: number }> = {};
  const now = Date.now();

  for (const row of data) {
    const stage = row.status;
    if (!stages[stage]) stages[stage] = { totalDays: 0, count: 0 };
    const daysStuck = (now - new Date(row.updated_at || row.created_at).getTime()) / 86400000;
    stages[stage].totalDays += daysStuck;
    stages[stage].count++;
  }

  return Object.entries(stages).map(([stage, v]) => ({
    stage: stage.replace(/_/g, ' '),
    avgDaysStuck: +(v.totalDays / v.count).toFixed(1),
    itemCount: v.count,
  })).sort((a, b) => b.avgDaysStuck - a.avgDaysStuck);
}
