/**
 * NeedsAttentionWidget
 *
 * Surfaces the most urgent action items across ALL modules:
 *   - Overdue obligations
 *   - Critical/high risks with no mitigation
 *   - Policies stuck in draft
 *   - Vendors with contracts expiring within 30 days
 *   - Content submissions in review > 48 hours
 *
 * Empty state = "All clear" — actively reassures the user.
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle, Clock, FileText, Building2,
  Scale, CheckCircle, ArrowRight, Loader2, Sparkles
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';
import type { Permissions } from '../../../lib/permissions';

type Severity = 'critical' | 'high' | 'medium';

interface ActionItem {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  detail: string;
  icon: typeof AlertTriangle;
  navigateTo: string;
  navigatePayload?: Record<string, string>;
}

const SEVERITY_STYLES: Record<Severity, { dot: string; badge: string; badgeText: string }> = {
  critical: {
    dot: 'bg-[var(--color-danger)]',
    badge: 'bg-[var(--color-danger-soft)] border-[var(--color-danger)]/30',
    badgeText: 'text-[var(--color-danger)]',
  },
  high: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 border-amber-200',
    badgeText: 'text-amber-700',
  },
  medium: {
    dot: 'bg-blue-400',
    badge: 'bg-blue-50 border-blue-200',
    badgeText: 'text-blue-700',
  },
};

async function fetchActionItems(
  companyId: string,
  access: Partial<Permissions> = {}
): Promise<ActionItem[]> {
  const items: ActionItem[] = [];
  const now = new Date();
  const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ago48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Build fetch list based on what the user can access.
  // Omitting a key from `access` (e.g. for owners) defaults to true.
  const canGrc = access.canViewGrcFrameworks ?? true;
  const canPolicies = access.canViewPolicies ?? true;
  const canVendors = access.canViewVendors ?? true;
  const canContent = (access.canUpload ?? true) || (access.canViewLegalReview ?? true);

  type FetchKey = 'obligations' | 'risks' | 'policies' | 'vendors' | 'submissions';
  const fetchPairs: [FetchKey, Promise<any>][] = [];

  if (canGrc) {
    fetchPairs.push(['obligations', (supabase as any)
      .from('obligations')
      .select('id, title, due_date, status')
      .eq('company_id', companyId)
      .neq('status', 'completed')
      .neq('status', 'closed')
      .lt('due_date', now.toISOString())
      .order('due_date', { ascending: true })
      .limit(5)]);

    fetchPairs.push(['risks', (supabase as any)
      .from('risks')
      .select('id, title, level, mitigation, status')
      .eq('company_id', companyId)
      .in('level', ['critical', 'high'])
      .neq('status', 'closed')
      .neq('status', 'resolved')
      .limit(5)]);
  }

  if (canPolicies) {
    fetchPairs.push(['policies', (supabase as any)
      .from('policies')
      .select('id, title, status, created_at')
      .eq('company_id', companyId)
      .eq('status', 'draft')
      .order('created_at', { ascending: true })
      .limit(5)]);
  }

  if (canVendors) {
    fetchPairs.push(['vendors', (supabase as any)
      .from('vendors')
      .select('id, name, contract_end, risk_level')
      .eq('company_id', companyId)
      .lt('contract_end', in30days.toISOString())
      .gt('contract_end', now.toISOString())
      .order('contract_end', { ascending: true })
      .limit(3)]);
  }

  if (canContent) {
    fetchPairs.push(['submissions', (supabase as any)
      .from('content_submissions')
      .select('id, title, status, submitted_at, created_at')
      .eq('company_id', companyId)
      .in('status', ['awaiting_legal', 'under_review', 'submitted'])
      .lt('submitted_at', ago48h.toISOString())
      .order('submitted_at', { ascending: true })
      .limit(3)]);
  }

  const settled = await Promise.allSettled(fetchPairs.map(p => p[1]));
  const resultMap = Object.fromEntries(
    fetchPairs.map((p, i) => [p[0], settled[i]])
  ) as Partial<Record<FetchKey, PromiseSettledResult<any>>>;

  // ── Overdue obligations ───────────────────────────────────────
  const obls = resultMap.obligations;
  if (obls?.status === 'fulfilled' && obls.value.data?.length) {
    for (const row of obls.value.data as any[]) {
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(row.due_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      items.push({
        id: `obl-${row.id}`,
        severity: daysOverdue > 7 ? 'critical' : 'high',
        category: 'Obligation',
        title: row.title ?? 'Unnamed Obligation',
        detail: `Overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}`,
        icon: Clock,
        navigateTo: 'obligations',
      });
    }
  }

  // ── Unmitigated critical/high risks ─────────────────────────
  const rsk = resultMap.risks;
  if (rsk?.status === 'fulfilled' && rsk.value.data?.length) {
    for (const row of rsk.value.data as any[]) {
      const noMitigation = !row.mitigation || row.mitigation.trim() === '';
      if (noMitigation) {
        items.push({
          id: `risk-${row.id}`,
          severity: row.level === 'critical' ? 'critical' : 'high',
          category: 'Risk',
          title: row.title ?? 'Unnamed Risk',
          detail: `${row.level} risk — no mitigation plan`,
          icon: AlertTriangle,
          navigateTo: 'risk-register',
        });
      }
    }
  }

  // ── Draft policies ────────────────────────────────────────────
  const pol = resultMap.policies;
  if (pol?.status === 'fulfilled' && pol.value.data?.length) {
    for (const row of pol.value.data as any[]) {
      const daysOld = Math.floor(
        (now.getTime() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      items.push({
        id: `pol-${row.id}`,
        severity: daysOld > 14 ? 'high' : 'medium',
        category: 'Policy',
        title: row.title ?? 'Unnamed Policy',
        detail: `Draft for ${daysOld} day${daysOld === 1 ? '' : 's'} — not yet published`,
        icon: FileText,
        navigateTo: 'policies',
      });
    }
  }

  // ── Expiring vendor contracts ─────────────────────────────────
  const ven = resultMap.vendors;
  if (ven?.status === 'fulfilled' && ven.value.data?.length) {
    for (const row of ven.value.data as any[]) {
      const daysLeft = Math.ceil(
        (new Date(row.contract_end).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      items.push({
        id: `ven-${row.id}`,
        severity: daysLeft <= 7 ? 'critical' : 'high',
        category: 'Vendor',
        title: row.name ?? 'Unnamed Vendor',
        detail: `Contract expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        icon: Building2,
        navigateTo: 'vendors',
      });
    }
  }

  // ── Stuck submissions (>48h in review) ───────────────────────
  const sub = resultMap.submissions;
  if (sub?.status === 'fulfilled' && sub.value.data?.length) {
    for (const row of sub.value.data as any[]) {
      const waitDate = row.submitted_at ?? row.created_at;
      const hoursWaiting = Math.floor(
        (now.getTime() - new Date(waitDate).getTime()) / (1000 * 60 * 60)
      );
      items.push({
        id: `sub-${row.id}`,
        severity: hoursWaiting > 96 ? 'high' : 'medium',
        category: 'Review Queue',
        title: row.title ?? 'Untitled Submission',
        detail: `Waiting ${hoursWaiting}h in review`,
        icon: Scale,
        navigateTo: 'legal-review',
      });
    }
  }

  // Sort: critical first, then by severity
  const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };
  items.sort((a, b) => order[a.severity] - order[b.severity]);

  return items.slice(0, 8);
}

export default function NeedsAttentionWidget({
  companyId,
  access,
}: {
  companyId: string;
  access?: Partial<Permissions>;
}) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchActionItems(companyId, access ?? {})
      .then(result => { if (!cancelled) { setItems(result); setLoading(false); } })
      .catch(err => { logger.error('NeedsAttentionWidget:', err); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const criticalCount = items.filter(i => i.severity === 'critical').length;

  return (
    <div className="dash-card border dash-border rounded-2xl shadow-sm overflow-hidden h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b dash-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            criticalCount > 0
              ? 'bg-[var(--color-danger-soft)]'
              : items.length > 0
              ? 'bg-amber-50'
              : 'bg-[var(--color-success-soft)]'
          }`}>
            <AlertTriangle className={`w-4 h-4 ${
              criticalCount > 0
                ? 'text-[var(--color-danger)]'
                : items.length > 0
                ? 'text-amber-600'
                : 'text-[var(--color-success)]'
            }`} />
          </div>
          <div>
            <p className="text-sm font-bold dash-text">Needs Attention</p>
            <p className="text-[10px] dash-text-tertiary">
              {loading ? 'Scanning all modules…' :
               items.length === 0 ? 'All clear across modules' :
               `${items.length} item${items.length === 1 ? '' : 's'} require action`}
            </p>
          </div>
        </div>
        {criticalCount > 0 && (
          <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger)]/30">
            {criticalCount} critical
          </span>
        )}
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" />
          </div>
        ) : items.length === 0 ? (
          /* All clear state */
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-success-soft)] flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-[var(--color-success)]" />
            </div>
            <div>
              <p className="text-sm font-semibold dash-text">You're all caught up</p>
              <p className="text-xs dash-text-tertiary mt-0.5">
                No overdue obligations, unmitigated risks, or expiring contracts.
              </p>
            </div>
            <div className="flex items-center gap-1 text-[10px] dash-text-tertiary">
              <Sparkles className="w-3 h-3" />
              Great compliance posture
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => {
              const Icon = item.icon;
              const styles = SEVERITY_STYLES[item.severity];
              return (
                <button
                  key={item.id}
                  onClick={() => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: item.navigateTo } }))}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--color-surface-alt)] transition-colors text-left group"
                >
                  {/* Severity dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />

                  {/* Icon */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${styles.badge}`}>
                    <Icon className={`w-3.5 h-3.5 ${styles.badgeText}`} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold dash-text truncate">{item.title}</p>
                    <p className="text-[10px] dash-text-tertiary truncate">{item.detail}</p>
                  </div>

                  {/* Category + arrow */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${styles.badge} ${styles.badgeText}`}>
                      {item.category}
                    </span>
                    <ArrowRight className="w-3 h-3 dash-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
