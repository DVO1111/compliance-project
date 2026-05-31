import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts";
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

export default function ExecutiveSlaWidget({
  companyId,
}: {
  companyId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [perf, setPerf] = useState<PerfPayload | null>(null);

  const [currentView, setCurrentView] = useState("30d");

  const views = [
    { id: "7d", label: "7 Days" },
    { id: "30d", label: "30 Days" },
    { id: "90d", label: "90 Days" },
  ];

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

      const resolvedDays = currentView === "7d" ? 7 : currentView === "90d" ? 90 : 30;

      const { data, error } = await (supabase as any).rpc("get_legal_performance", {
        p_company_id: companyId,
        p_days: resolvedDays,
      } as any);

      if (cancelled) return;

      if (error) {
        logger.error("get_legal_performance failed:", error);
        setPerf(null);
        setErrorMsg(error.message || "Failed to load executive SLA data.");
        setLoading(false);
        return;
      }

      setPerf((data ?? null) as PerfPayload | null);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, currentView]);

  const chartData = perf
    ? [
      { name: "Approved", value: perf.approved_count || 0, color: "#10B981" },
      { name: "Rejected", value: perf.rejected_count || 0, color: "#EF4444" },
      { name: "Breaches", value: perf.sla_breaches_24h || 0, color: "#F59E0B" },
    ]
    : [];

  const resolvedDays = currentView === "7d" ? 7 : currentView === "90d" ? 90 : 30;

  return (
    <DashboardCard
      className="h-[500px] flex flex-col min-h-0"
      views={views}
      currentView={currentView}
      onViewChange={setCurrentView}
    >
      {loading ? (
        <SkeletonChart className="h-full min-h-[160px]" />
      ) : errorMsg ? (
        <ErrorState message={errorMsg} />
      ) : !perf ? (
        <EmptyState message="No SLA data yet." />
      ) : (
        <div className="flex flex-col h-full gap-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold dash-text">Bottlenecks & SLA</h3>
              <p className="text-xs dash-text-secondary mt-0.5">
                Executive operations health (last {resolvedDays} days)
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase font-semibold tracking-wider text-[var(--color-info)]">
                Avg Turnaround
              </p>
              <p className="text-lg font-bold dash-text">
                {Number(perf.avg_turnaround_hours || 0).toFixed(1)}h
              </p>
            </div>
          </div>

          <div className="flex-1 min-h-[120px]">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--chart-grid)"
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="name"
                  tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 8) + "…" : v}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--chart-text)", fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--chart-text)", fontSize: 11 }}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-surface-hover)" }}
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    color: "var(--color-text-primary)",
                    fontSize: "12px",
                    boxShadow: "var(--color-card-shadow-hover)",
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
