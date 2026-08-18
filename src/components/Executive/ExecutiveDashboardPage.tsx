import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { BarChart3, Scale, CheckCircle2, XCircle, Clock } from "lucide-react";
import { logger } from '../../lib/logger';

type Metrics = {
  total_content: number;
  legal_queue_count: number;
  approved_count: number;
  rejected_count: number;
  approval_rate: number;        // 0-100
  avg_turnaround_hours: number; // hours
};

function Card({
  title,
  value,
  icon: Icon,
  sub,
}: {
  title: string;
  value: string;
  icon: any;
  sub?: string;
}) {
  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold text-[var(--color-text-primary)] mt-2">{value}</p>
          {sub && <p className="text-xs text-[var(--color-text-secondary)] mt-2">{sub}</p>}
        </div>
        <div className="p-2 rounded-lg bg-[var(--color-surface-alt)]">
          <Icon className="w-5 h-5 text-[var(--color-text-secondary)]" />
        </div>
      </div>
    </div>
  );
}

export default function ExecutiveDashboardPage() {
  const { profile } = useAuth();
  const companyId = (profile as any)?.company_id as string | undefined;

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!companyId) {
        setLoading(false);
        setErr("Company not set on your profile.");
        return;
      }

      setLoading(true);
      setErr("");

      const { data, error } = await (supabase as any).rpc("get_exec_dashboard_metrics", {
        p_company_id: companyId,
      });

      if (!mounted) return;

      if (error) {
        logger.error("Executive metrics RPC failed:", error);
        setErr(error.message);
        setMetrics(null);
        setLoading(false);
        return;
      }

      // Supabase RPC returns array for table-returning functions
      const row = Array.isArray(data) ? data[0] : data;
      setMetrics(row || null);
      setLoading(false);
    };

    load();
    return () => {
      mounted = false;
    };
  }, [companyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[var(--color-accent)] border-t-transparent" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm text-center py-16">
        <BarChart3 className="w-10 h-10 text-[var(--color-text-tertiary)] mx-auto mb-3" />
        <p className="text-sm text-[var(--color-text-secondary)] font-medium">Company not set</p>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">Please re-login or complete onboarding.</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-danger)]/20 shadow-sm p-6">
        <p className="text-sm font-semibold text-[var(--color-danger)]">Failed to load dashboard</p>
        <p className="text-xs text-[var(--color-text-secondary)] mt-2">{err}</p>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm text-center py-16">
        <BarChart3 className="w-10 h-10 text-[var(--color-text-tertiary)] mx-auto mb-3" />
        <p className="text-sm text-[var(--color-text-secondary)]">No data yet</p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Upload content to start tracking metrics</p>
      </div>
    );
  }

  const avg = metrics.avg_turnaround_hours || 0;
  const avgLabel =
    avg >= 24 ? `${(avg / 24).toFixed(2)} days` : `${avg.toFixed(2)} hours`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Executive Dashboard</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Oversight metrics across Marketing & Legal workflow</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Card
          title="Total Content Submitted"
          value={String(metrics.total_content ?? 0)}
          icon={BarChart3}
          sub="All content created in this company"
        />
        <Card
          title="Items in Legal Queue"
          value={String(metrics.legal_queue_count ?? 0)}
          icon={Scale}
          sub="Awaiting Legal + In Review"
        />
        <Card
          title="Approval Rate"
          value={`${(metrics.approval_rate ?? 0).toFixed(2)}%`}
          icon={CheckCircle2}
          sub="Approved / (Approved + Rejected)"
        />
        <Card
          title="Approved"
          value={String(metrics.approved_count ?? 0)}
          icon={CheckCircle2}
          sub="Legal review decisions"
        />
        <Card
          title="Rejected"
          value={String(metrics.rejected_count ?? 0)}
          icon={XCircle}
          sub="Legal review decisions"
        />
        <Card
          title="Avg Legal Turnaround"
          value={avgLabel}
          icon={Clock}
          sub="From Submitted → Decision"
        />
      </div>
    </div>
  );
}
