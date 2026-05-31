import { useEffect, useState, type ComponentType } from "react";
import { supabase } from "../../../lib/supabase";
import { Timer, AlertTriangle, CheckCircle2, XCircle, Activity } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonChart } from "../ui/Skeleton";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type PerfPayload = {
  window_days: number;
  approved_count: number;
  rejected_count: number;
  sla_breaches_24h: number;
  avg_turnaround_hours: number | null;
};

type DecisionsSummary = {
  today_total: number;
  today_approved: number;
  today_rejected: number;
  this_week_total: number;
  this_month_total: number;
};

type IconType = ComponentType<{ className?: string }>;

function Card({
  title,
  value,
  icon: Icon,
  color = "dash-accent",
}: {
  title: string;
  value: string;
  icon: IconType;
  color?: string;
}) {
  return (
    <div className="dash-surface-alt border dash-border rounded-lg p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider font-semibold dash-text-secondary">
          {title}
        </p>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
      </div>
      <p className="text-lg font-bold dash-text mt-1 tabular-nums">{value}</p>
    </div>
  );
}

export default function LegalSlaWidget({
  companyId,
}: {
  companyId: string;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [perf, setPerf] = useState<PerfPayload | null>(null);
  const [decisions, setDecisions] = useState<DecisionsSummary | null>(null);
  const [currentView, setCurrentView] = useState("30");

  const views = [
    { id: "7", label: "7 Days" },
    { id: "30", label: "30 Days" },
    { id: "90", label: "90 Days" },
  ];

  const days = parseInt(currentView, 10);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!companyId) {
        setPerf(null);
        setErrorMsg(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      const safeDays = Math.max(days, 1);

      const { data, error } = await (supabase as any).rpc("get_legal_performance", {
        p_company_id: companyId,
        p_days: safeDays,
      } as any);

      if (cancelled) return;

      if (error) {
        logger.error("get_legal_performance failed:", error);
        setPerf(null);
        setErrorMsg(error.message || "Failed to load legal performance.");
        setLoading(false);
        return;
      }

      setPerf((data ?? null) as PerfPayload | null);
      setLoading(false);
    };

    const loadDecisions = async () => {
      if (!companyId || !user?.id) {
        setDecisions(null);
        return;
      }

      const { data, error } = await (supabase as any).rpc("get_decisions_summary", {
        p_company_id: companyId,
        p_reviewer_id: user.id,
      } as any);

      if (cancelled) return;
      if (error) {
        logger.error("get_decisions_summary failed:", error);
        setDecisions(null);
        return;
      }
      setDecisions(data as any as DecisionsSummary);
    };

    load();
    loadDecisions();
    return () => {
      cancelled = true;
    };
  }, [companyId, days, user?.id]);

  return (
    <DashboardCard
      className="h-[400px] flex flex-col"
      views={views}
      currentView={currentView}
      onViewChange={setCurrentView}
    >
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="p-1.5 rounded-lg"
          style={{ background: "var(--color-accent-soft)" }}
        >
          <Timer className="w-4 h-4 dash-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold dash-text">
            Legal SLA & Performance
          </h3>
          <p className="text-xs dash-text-secondary mt-0.5">Last {days} days</p>
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto pr-1 min-h-0 flex flex-col">
        {loading ? (
          <SkeletonChart className="h-32" />
        ) : errorMsg ? (
          <ErrorState message={errorMsg} />
        ) : !perf ? (
          <EmptyState message="No performance data yet." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Card
              title="SLA breaches >24h"
              value={String(perf.sla_breaches_24h || 0)}
              icon={AlertTriangle}
              color="text-[var(--color-warning)]"
            />
            <Card
              title="Approved"
              value={String(perf.approved_count || 0)}
              icon={CheckCircle2}
              color="text-[var(--color-success)]"
            />
            <Card
              title="Rejected"
              value={String(perf.rejected_count || 0)}
              icon={XCircle}
              color="text-[var(--color-danger)]"
            />
            <Card
              title="Avg turnaround"
              value={`${Number(perf.avg_turnaround_hours || 0).toFixed(1)}h`}
              icon={Timer}
            />
          </div>
        )}

        {/* Decisions Today / This Week */}
        <div
          className="mt-4 pt-4"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-3.5 h-3.5 text-[var(--color-purple)]" />
            <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wider">
              Your Activity
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[var(--color-purple)]/10 border border-[var(--color-purple)]/20 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-[var(--color-purple)] tabular-nums">
                {decisions?.today_total || 0}
              </p>
              <p className="text-[11px] text-[var(--color-purple)] font-medium mt-0.5">
                Decisions Today
              </p>
              {(decisions?.today_total || 0) === 0 && (
                <p className="text-[9px] text-[var(--color-purple)] opacity-50 font-medium">No activity yet today</p>
              )}
            </div>
            <div className="bg-[var(--color-success-soft)] border border-[var(--color-success)]/20 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-[var(--color-success)] tabular-nums">
                {decisions?.today_approved || 0}
              </p>
              <p className="text-[11px] text-[var(--color-success)] font-medium mt-0.5">
                Approved Today
              </p>
              {(decisions?.today_approved || 0) === 0 && (
                <p className="text-[9px] text-[var(--color-success)] opacity-50 font-medium whitespace-nowrap">No approvals today</p>
              )}
            </div>
            <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-[var(--color-danger)] tabular-nums">
                {decisions?.today_rejected || 0}
              </p>
              <p className="text-[11px] text-[var(--color-danger)] font-medium mt-0.5">
                Rejected Today
              </p>
              {(decisions?.today_rejected || 0) === 0 && (
                <p className="text-[9px] text-[var(--color-danger)] opacity-50 font-medium whitespace-nowrap">No rejects today</p>
              )}
            </div>
            <div className="dash-surface-alt border dash-border rounded-lg p-3 text-center">
              <p className="text-2xl font-bold dash-text tabular-nums">
                {decisions?.this_week_total || 0}
              </p>
              <p className="text-[11px] dash-text-secondary font-medium mt-0.5">
                This Week
              </p>
              {(decisions?.this_week_total || 0) === 0 && (
                <p className="text-[9px] dash-text-tertiary opacity-50 font-medium">No activity this week</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}
