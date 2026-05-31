import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonChart } from "../ui/Skeleton";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type TrendRow = {
  day: string;
  submitted: number;
  sent_to_legal: number;
  approved: number;
  rejected: number;
  avg_turnaround_hours: number | null;
};

function formatDayLabel(d: string) {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

function formatNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

const PERIOD_OPTIONS = [
  { id: "7", label: "7 Days", value: 7 },
  { id: "30", label: "30 Days", value: 30 },
  { id: "90", label: "90 Days", value: 90 },
];

export default function ExecutiveTrendsWidget({
  companyId,
  jurisdiction,
}: {
  companyId: string;
  jurisdiction?: string | null;
}) {
  const [currentView, setCurrentView] = useState("30");
  const period = parseInt(currentView, 10);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!companyId) return;

      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await (supabase as any).rpc(
        "get_company_dashboard_trends",
        {
          p_company_id: companyId,
          p_days: period,
          p_jurisdiction: jurisdiction ?? null,
        }
      );

      if (!mounted) return;

      if (error) {
        logger.error("get_company_dashboard_trends failed:", error);
        setRows([]);
        setErrorMsg(error.message || "Failed to load trends.");
        setLoading(false);
        return;
      }

      const safe: TrendRow[] = ((data ?? []) as any[]).map((r) => ({
        day: String(r.day ?? ""),
        submitted: Number(r.submitted ?? 0),
        sent_to_legal: Number(r.sent_to_legal ?? 0),
        approved: Number(r.approved ?? 0),
        rejected: Number(r.rejected ?? 0),
        avg_turnaround_hours:
          r.avg_turnaround_hours === null ||
            r.avg_turnaround_hours === undefined
            ? null
            : Number(r.avg_turnaround_hours),
      }));

      safe.sort(
        (a, b) => new Date(a.day).getTime() - new Date(b.day).getTime()
      );

      setRows(safe);
      setLoading(false);
    };

    load();
    return () => {
      mounted = false;
    };
  }, [companyId, jurisdiction, period]);

  const hasData = useMemo(() => {
    return rows.some(
      (r) => r.submitted || r.sent_to_legal || r.approved || r.rejected
    );
  }, [rows]);

  return (
    <DashboardCard
      className="h-full min-h-[400px] max-h-[400px] flex flex-col"
      views={PERIOD_OPTIONS.map(o => ({ id: o.id, label: o.label }))}
      currentView={currentView}
      onViewChange={setCurrentView}
    >
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="p-1.5 rounded-lg"
            style={{ background: "var(--color-accent-soft)" }}
          >
            <TrendingUp className="w-4 h-4 dash-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold dash-text">Company Trends</h3>
            <p className="text-xs dash-text-secondary mt-0.5">
              Last {period} days • Submitted → Legal → Approved/Rejected
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex-1 flex flex-col min-h-0">
        {loading ? (
          <SkeletonChart className="flex-1" />
        ) : errorMsg ? (
          <ErrorState message={errorMsg} />
        ) : rows.length === 0 || !hasData ? (
          <EmptyState message="No trend data yet." />
        ) : (
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={rows}
                margin={{ top: 10, right: 18, left: 0, bottom: 30 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--chart-grid)"
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDayLabel}
                  minTickGap={18}
                  tick={{ fill: "var(--chart-text)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--chart-grid)" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatNumber}
                  tick={{ fill: "var(--chart-text)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={(v) => formatDayLabel(String(v))}
                  formatter={(value: any, name: any) => [
                    formatNumber(value),
                    name,
                  ]}
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    color: "var(--color-text-primary)",
                    fontSize: "12px",
                    boxShadow: "var(--color-card-shadow-hover)",
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                  wrapperStyle={{
                    fontSize: "11px",
                    paddingTop: "20px",
                    width: '100%'
                  }}
                />

                <defs>
                  <linearGradient id="colorSubmitted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2943D6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2943D6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLegal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8145CD" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8145CD" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#13CD3C" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#13CD3C" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorRejected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#CD45A2" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#CD45A2" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <Area
                  type="monotone"
                  dataKey="submitted"
                  name="Submitted"
                  stroke="#2943D6"
                  fill="url(#colorSubmitted)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, fill: "#2943D6", stroke: "#0F172A", strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="sent_to_legal"
                  name="To legal"
                  stroke="#8145CD"
                  fill="url(#colorLegal)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, fill: "#8145CD", stroke: "#0F172A", strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="approved"
                  name="Approved"
                  stroke="#13CD3C"
                  fill="url(#colorApproved)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, fill: "#13CD3C", stroke: "#0F172A", strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="rejected"
                  name="Rejected"
                  stroke="#CD45A2"
                  fill="url(#colorRejected)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, fill: "#CD45A2", stroke: "#0F172A", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </DashboardCard>
  );
}
