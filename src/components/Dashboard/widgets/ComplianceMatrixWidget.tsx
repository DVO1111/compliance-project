import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { useJurisdictionStore } from "../../../stores/jurisdictionStore";
import { ShieldCheck, FileText, CheckCircle, AlertTriangle, AlertCircle, BarChart3, PieChartIcon, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { SkeletonChart } from "../ui/Skeleton";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import DashboardCard from "../ui/DashboardCard";
import { logger } from '../../../lib/logger';

type Risk = "low" | "medium" | "high" | "critical";
type ChartType = "bar" | "pie" | "area";

const COLORS = {
  Passed: "#10b981",
  Flagged: "#f59e0b",
  Critical: "#ef4444",
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

function MetricMiniCard({
  title,
  value,
  Icon,
  colorStr,
}: {
  title: string;
  value: string | number;
  Icon: any;
  colorStr: string;
}) {
  return (
    <div className="flex flex-col p-3 rounded-xl border dash-border dash-surface-alt">
      <div className="flex items-center gap-1.5 mb-1 opacity-80">
        <Icon className="w-3.5 h-3.5" style={{ color: colorStr }} />
        <span className="text-[10px] uppercase tracking-wider font-semibold dash-text-secondary">
          {title}
        </span>
      </div>
      <span className="text-xl font-bold dash-text tabular-nums tracking-tight">
        {value}
      </span>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--color-surface)",
    borderColor: "var(--color-border)",
    borderRadius: "8px",
    color: "var(--color-text-primary)",
    boxShadow: "var(--color-card-shadow-hover)",
    padding: "10px",
  },
  itemStyle: {
    color: "var(--color-text-primary)",
    fontWeight: 500,
    fontSize: "12px",
  },
};

export default function ComplianceMatrixWidget({
  onNavigateToArchive,
}: {
  onNavigateToArchive?: () => void;
}) {
  const { profile } = useAuth();
  const companyId = (profile as any)?.company_id as string | undefined;
  const { selectedJurisdiction } = useJurisdictionStore();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState({ passed: 0, flagged: 0, critical: 0, sum: 0 });

  const [currentView, setCurrentView] = useState("30d");
  const [chartType, setChartType] = useState<ChartType>("bar");

  const views = [
    { id: "7d", label: "7 Days" },
    { id: "30d", label: "30 Days" },
    { id: "90d", label: "90 Days" },
  ];

  const chartTypes: { id: ChartType; label: string; Icon: any }[] = [
    { id: "bar", label: "Bar", Icon: BarChart3 },
    { id: "pie", label: "Pie", Icon: PieChartIcon },
    { id: "area", label: "Area", Icon: TrendingUp },
  ];

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!companyId) {
        if (mounted) setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      const days = currentView === "7d" ? 7 : currentView === "90d" ? 90 : 30;
      const history: Record<string, { day: string; Passed: number; Flagged: number; Critical: number }> = {};
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        history[dateStr] = { day: dateStr, Passed: 0, Flagged: 0, Critical: 0 };
      }

      let q = supabase
        .from("compliance_reports")
        .select("overall_risk, created_at, content_submissions!inner(company_id,jurisdiction)")
        .eq("content_submissions.company_id", companyId);

      if (selectedJurisdiction !== "all") {
        q = q.eq("content_submissions.jurisdiction", selectedJurisdiction);
      }

      const { data, error } = await q;

      if (!mounted) return;

      if (error) {
        logger.error("ComplianceMatrixWidget load failed:", error);
        setErrorMsg("Failed to load compliance data.");
        setLoading(false);
        return;
      }

      let p = 0; let f = 0; let c = 0; let sum = 0;

      (data ?? []).forEach((row: any) => {
        const r = row?.overall_risk as Risk;
        const dateStr = (row?.created_at || "").split("T")[0];

        sum++;
        if (r === "low") p++;
        else if (r === "medium" || r === "high") f++;
        else if (r === "critical") c++;

        if (history[dateStr]) {
          if (r === "low") history[dateStr].Passed += 1;
          else if (r === "medium" || r === "high") history[dateStr].Flagged += 1;
          else if (r === "critical") history[dateStr].Critical += 1;
        }
      });

      const dataArr = Object.values(history).sort(
        (a, b) => new Date(a.day).getTime() - new Date(b.day).getTime()
      );

      setTotals({ passed: p, flagged: f, critical: c, sum });
      setRows(dataArr);
      setLoading(false);
    };

    load();
    return () => { mounted = false; };
  }, [companyId, selectedJurisdiction, currentView]);

  const hasData = useMemo(() => {
    return rows.some((r) => r.Passed > 0 || r.Flagged > 0 || r.Critical > 0);
  }, [rows]);

  const pieData = useMemo(() => [
    { name: "Passed", value: totals.passed, color: COLORS.Passed },
    { name: "Flagged", value: totals.flagged, color: COLORS.Flagged },
    { name: "Critical", value: totals.critical, color: COLORS.Critical },
  ], [totals]);

  return (
    <DashboardCard
      className="dash-card p-5 flex flex-col h-full min-h-0"
      views={views}
      currentView={currentView}
      onViewChange={setCurrentView}
    >
      <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="p-1.5 rounded-lg"
            style={{ background: "var(--color-accent-soft)" }}
          >
            <ShieldCheck className="w-5 h-5 dash-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold dash-text">Compliance Matrix</h3>
            <p className="text-xs dash-text-secondary mt-0.5">
              Cumulative metrics & trends
            </p>
          </div>
        </div>

        {/* Chart Type Switcher */}
        <div className="flex bg-[var(--color-surface-alt)] rounded-lg p-0.5 border dash-border shrink-0">
          {chartTypes.map((ct) => {
            const IconComp = ct.Icon;
            return (
              <button
                key={ct.id}
                onClick={() => setChartType(ct.id)}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md transition-all ${chartType === ct.id
                  ? "bg-[var(--color-surface)] shadow-sm dash-text border border-[var(--color-border)]"
                  : "dash-text-tertiary hover:dash-text-secondary border border-transparent"
                  }`}
                title={ct.label}
              >
                <IconComp className="w-3 h-3" />
                <span className="hidden sm:inline">{ct.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 shrink-0">
        <MetricMiniCard title="Total" value={loading ? "…" : totals.sum} Icon={FileText} colorStr="var(--color-text-secondary)" />
        <MetricMiniCard title="Passed" value={loading ? "…" : totals.passed} Icon={CheckCircle} colorStr="#10b981" />
        <MetricMiniCard title="Flagged" value={loading ? "…" : totals.flagged} Icon={AlertTriangle} colorStr="#f59e0b" />
        <MetricMiniCard title="Critical" value={loading ? "…" : totals.critical} Icon={AlertCircle} colorStr="#ef4444" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-2">
        {loading ? (
          <SkeletonChart className="h-full" />
        ) : errorMsg ? (
          <ErrorState message={errorMsg} />
        ) : !hasData ? (
          <EmptyState
            icon={BarChart3}
            title="No compliance data yet"
            message="Data will appear once your content submissions have been reviewed and scored for risk."
            action={
              onNavigateToArchive
                ? { label: "Submit Content", onClick: onNavigateToArchive }
                : undefined
            }
          />
        ) : chartType === "bar" ? (
          /* ── Horizontal Bar Chart ─────────────────────── */
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 20 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--chart-grid)"
                strokeOpacity={0.5}
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={formatNumber}
                tick={{ fill: "var(--chart-text)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="day"
                tickFormatter={formatDayLabel}
                tick={{ fill: "var(--chart-text)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip
                labelFormatter={(v) => formatDayLabel(String(v))}
                formatter={(value: any, name: any) => [formatNumber(value), name]}
                {...tooltipStyle}
              />
              <Bar dataKey="Passed" name="Passed" fill={COLORS.Passed} radius={[0, 4, 4, 0]} barSize={6} />
              <Bar dataKey="Flagged" name="Flagged" fill={COLORS.Flagged} radius={[0, 4, 4, 0]} barSize={6} />
              <Bar dataKey="Critical" name="Critical" fill={COLORS.Critical} radius={[0, 4, 4, 0]} barSize={6} />
            </BarChart>
          </ResponsiveContainer>
        ) : chartType === "pie" ? (
          /* ── Pie Chart ────────────────────────────────── */
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius="40%"
                outerRadius="70%"
                paddingAngle={4}
                dataKey="value"
                nameKey="name"
                stroke="none"
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any) => [formatNumber(value), name]}
                {...tooltipStyle}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: "11px", color: "var(--chart-text)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          /* ── Area Line Graph ──────────────────────────── */
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={rows} margin={{ top: 5, right: 5, left: -20, bottom: 25 }}>
              <defs>
                <linearGradient id="colorPassed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorFlagged" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCritical" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--chart-grid)"
                strokeOpacity={0.5}
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tickFormatter={formatDayLabel}
                minTickGap={20}
                tick={{ fill: "var(--chart-text)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                dy={10}
              />
              <YAxis
                tickFormatter={formatNumber}
                tick={{ fill: "var(--chart-text)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                dx={-10}
              />
              <Tooltip
                labelFormatter={(v) => formatDayLabel(String(v))}
                formatter={(value: any, name: any) => [formatNumber(value), name]}
                {...tooltipStyle}
              />

              <Area
                type="monotone"
                dataKey="Passed"
                name="Passed"
                stroke="#10b981"
                fill="url(#colorPassed)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, fill: "#10b981", stroke: "var(--color-surface)", strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="Flagged"
                name="Flagged"
                stroke="#f59e0b"
                fill="url(#colorFlagged)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, fill: "#f59e0b", stroke: "var(--color-surface)", strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="Critical"
                name="Critical"
                stroke="#ef4444"
                fill="url(#colorCritical)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, fill: "#ef4444", stroke: "var(--color-surface)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </DashboardCard>
  );
}
