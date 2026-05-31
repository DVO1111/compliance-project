/**
 * ComplianceHealthScoreWidget
 *
 * Hero metric: a 0–100 composite score built from four pillars:
 *   1. Submission Approval Rate (content_submissions)
 *   2. Obligation On-Time Rate  (obligations)
 *   3. Risk Mitigation Coverage (risks)
 *   4. Policy Compliance Rate   (policies + policy_acknowledgements)
 *
 * Each pillar is worth 25 pts. Missing data = 50 pts for that pillar
 * (neutral — we don't penalise companies for empty modules).
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Clock, FileText } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import type { Permissions } from '../../../lib/permissions';

interface Pillar {
  label: string;
  score: number;       // 0–100
  detail: string;
  icon: typeof ShieldCheck;
}

interface HealthData {
  overall: number;
  pillars: Pillar[];
  previousScore: number | null;
}

function Ring({ score, size = 140 }: { score: number; size?: number }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  const color =
    score >= 80 ? 'var(--color-success)' :
    score >= 60 ? '#f59e0b' :
    'var(--color-danger)';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border)" strokeWidth={8} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${circ}`}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </svg>
  );
}

function PillarBar({ pillar }: { pillar: Pillar }) {
  const Icon = pillar.icon;
  const color =
    pillar.score >= 80 ? 'var(--color-success)' :
    pillar.score >= 60 ? '#f59e0b' :
    'var(--color-danger)';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3 h-3 dash-text-tertiary flex-shrink-0" />
          <span className="text-xs font-medium dash-text-secondary truncate">{pillar.label}</span>
        </div>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{pillar.score}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pillar.score}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
        />
      </div>
      <p className="text-[10px] dash-text-tertiary">{pillar.detail}</p>
    </div>
  );
}

async function fetchHealthData(
  companyId: string,
  access: Partial<Permissions> = {}
): Promise<HealthData> {
  const canContent = (access.canUpload ?? true) || (access.canViewLegalReview ?? true);
  const canGrc = access.canViewGrcFrameworks ?? true;
  const canPolicies = access.canViewPolicies ?? true;

  type PillarKey = 'submissions' | 'obligations' | 'risks' | 'policies';
  const fetchPairs: [PillarKey, Promise<any>][] = [];

  if (canContent) {
    fetchPairs.push(['submissions', (supabase as any)
      .from('content_submissions').select('status').eq('company_id', companyId)]);
  }
  if (canGrc) {
    fetchPairs.push(['obligations', (supabase as any)
      .from('obligations').select('status, due_date').eq('company_id', companyId)]);
    fetchPairs.push(['risks', (supabase as any)
      .from('risks').select('level, mitigation, status').eq('company_id', companyId)]);
  }
  if (canPolicies) {
    fetchPairs.push(['policies', (supabase as any)
      .from('policies').select('id, status').eq('company_id', companyId)]);
  }

  const settled = await Promise.allSettled(fetchPairs.map(p => p[1]));
  const resultMap = Object.fromEntries(
    fetchPairs.map((p, i) => [p[0], settled[i]])
  ) as Partial<Record<PillarKey, PromiseSettledResult<any>>>;

  const pillars: Pillar[] = [];

  // ── Pillar 1: Submissions ──────────────────────────────────────
  const subResult = resultMap.submissions;
  if (subResult) {
    let submissionScore = 50;
    let submissionDetail = 'No submissions yet';
    if (subResult.status === 'fulfilled' && subResult.value.data?.length) {
      const rows = subResult.value.data as any[];
      const approved = rows.filter(r => r.status === 'approved').length;
      const rejected = rows.filter(r => r.status === 'rejected' || r.status === 'changes_requested').length;
      const decided = approved + rejected;
      submissionScore = decided > 0 ? Math.round((approved / decided) * 100) : 50;
      submissionDetail = decided > 0
        ? `${approved} approved of ${decided} decided`
        : `${rows.length} pending — no decisions yet`;
    }
    pillars.push({ label: 'Submissions', score: submissionScore, detail: submissionDetail, icon: FileText });
  }

  // ── Pillar 2: Obligations ──────────────────────────────────────
  const oblResult = resultMap.obligations;
  if (oblResult) {
    let obligationScore = 50;
    let obligationDetail = 'No obligations tracked';
    if (oblResult.status === 'fulfilled' && oblResult.value.data?.length) {
      const rows = oblResult.value.data as any[];
      const total = rows.length;
      const now = new Date();
      const overdue = rows.filter(r => {
        return r.due_date && new Date(r.due_date) < now &&
          r.status !== 'completed' && r.status !== 'closed';
      }).length;
      const onTime = total - overdue;
      obligationScore = total > 0 ? Math.round((onTime / total) * 100) : 50;
      obligationDetail = overdue > 0
        ? `${overdue} overdue of ${total} obligations`
        : `All ${total} obligations on track`;
    }
    pillars.push({ label: 'Obligations', score: obligationScore, detail: obligationDetail, icon: Clock });
  }

  // ── Pillar 3: Risks ────────────────────────────────────────────
  const riskResult = resultMap.risks;
  if (riskResult) {
    let riskScore = 50;
    let riskDetail = 'No risks registered';
    if (riskResult.status === 'fulfilled' && riskResult.value.data?.length) {
      const rows = riskResult.value.data as any[];
      const openRisks = rows.filter(r => r.status !== 'closed' && r.status !== 'resolved');
      const total = openRisks.length;
      const mitigated = openRisks.filter(r => r.mitigation && r.mitigation.trim().length > 0).length;
      const criticalUnmitigated = openRisks.filter(
        r => (r.level === 'critical' || r.level === 'high') && (!r.mitigation || r.mitigation.trim() === '')
      ).length;
      riskScore = total > 0 ? Math.round((mitigated / total) * 100) : 50;
      riskDetail = criticalUnmitigated > 0
        ? `${criticalUnmitigated} critical/high risks unmitigated`
        : total > 0 ? `${mitigated} of ${total} risks have mitigations` : 'No open risks';
    }
    pillars.push({ label: 'Risk Coverage', score: riskScore, detail: riskDetail, icon: AlertTriangle });
  }

  // ── Pillar 4: Policies ─────────────────────────────────────────
  const polResult = resultMap.policies;
  if (polResult) {
    let policyScore = 50;
    let policyDetail = 'No policies created';
    if (polResult.status === 'fulfilled' && polResult.value.data?.length) {
      const rows = polResult.value.data as any[];
      const total = rows.length;
      const active = rows.filter(r => r.status === 'active').length;
      const draft = rows.filter(r => r.status === 'draft').length;
      policyScore = total > 0 ? Math.round((active / total) * 100) : 50;
      policyDetail = draft > 0
        ? `${draft} policies still in draft`
        : `${active} of ${total} policies active`;
    }
    pillars.push({ label: 'Policies', score: policyScore, detail: policyDetail, icon: CheckCircle });
  }

  // Average only the pillars the user has access to
  const overall = pillars.length > 0
    ? Math.round(pillars.reduce((sum, p) => sum + p.score, 0) / pillars.length)
    : 0;

  return { overall, previousScore: null, pillars };
}

export default function ComplianceHealthScoreWidget({
  companyId,
  access,
}: {
  companyId: string;
  access?: Partial<Permissions>;
}) {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchHealthData(companyId, access ?? {})
      .then(result => { if (!cancelled) { setData(result); setLoading(false); } })
      .catch(err => { logger.error('ComplianceHealthScoreWidget:', err); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const score = data?.overall ?? 0;
  const scoreColor =
    score >= 80 ? 'var(--color-success)' :
    score >= 60 ? '#f59e0b' :
    'var(--color-danger)';

  const scoreLabel =
    score >= 80 ? 'Strong' :
    score >= 60 ? 'Moderate' :
    'Needs Attention';

  const TrendIcon = data?.previousScore == null ? Minus :
    score > data.previousScore ? TrendingUp :
    score < data.previousScore ? TrendingDown : Minus;

  return (
    <div className="dash-card border dash-border rounded-2xl shadow-sm overflow-hidden h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b dash-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-accent-soft)' }}>
            <ShieldCheck className="w-4 h-4 text-[var(--color-accent)]" />
          </div>
          <div>
            <p className="text-sm font-bold dash-text">Compliance Health</p>
            <p className="text-[10px] dash-text-tertiary">Composite score across all modules</p>
          </div>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            {/* Score ring */}
            <div className="flex flex-col items-center gap-2 shrink-0 mx-auto sm:mx-0">
              <div className="relative">
                <Ring score={score} size={130} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <motion.span
                    className="text-3xl font-black tabular-nums leading-none"
                    style={{ color: scoreColor }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    {score}
                  </motion.span>
                  <span className="text-[10px] font-bold dash-text-tertiary uppercase tracking-wide mt-0.5">/100</span>
                </div>
              </div>
              <div className="text-center">
                <span
                  className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                  style={{ background: `${scoreColor}20`, color: scoreColor }}
                >
                  {scoreLabel}
                </span>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <TrendIcon className="w-3 h-3 dash-text-tertiary" />
                  <span className="text-[10px] dash-text-tertiary">
                    {data?.previousScore != null
                      ? `${score > data.previousScore ? '+' : ''}${score - data.previousScore} vs last period`
                      : 'First measurement'}
                  </span>
                </div>
              </div>
            </div>

            {/* Pillar bars */}
            <div className="flex-1 space-y-4 w-full">
              {data?.pillars.map(p => (
                <PillarBar key={p.label} pillar={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
