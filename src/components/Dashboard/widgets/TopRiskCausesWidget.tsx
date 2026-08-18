import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import { AlertTriangle, TrendingUp } from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    LineChart,
    Line,
    CartesianGrid,
    Legend,
} from "recharts";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonChart } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type RiskCause = {
    cause: string;
    severity: string;
    occurrences: number;
    category: string;
};

type TrendData = {
    day: string;
    [cause: string]: any;
};

const SEVERITY_COLORS: Record<string, string> = {
    Red: "#CD45A2",
    Yellow: "#EAB308",
};

const LINE_COLORS = [
    "var(--color-accent)", // Blue
    "#13CD3C", // Green
    "#CD45A2", // Pink
    "#EAB308", // Yellow
    "#8145CD", // Violet
    "#6366f1", // Indigo
];

function formatDayLabel(d: string) {
    try {
        const dt = new Date(d);
        return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
        return d;
    }
}

export default function TopRiskCausesWidget({
    companyId,
    userId,
    jurisdiction,
}: {
    companyId: string;
    userId?: string | null;
    jurisdiction?: string | null;
}) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<RiskCause[]>([]);
    const [trends, setTrends] = useState<TrendData[]>([]);
    const [currentLimit, setCurrentLimit] = useState(5);
    const [currentPeriod, setCurrentPeriod] = useState("30"); // 7, 30, 90

    const periodViews = [
        { id: "7", label: "7 Days" },
        { id: "30", label: "30 Days" },
        { id: "90", label: "90 Days" },
    ];

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            const periodInt = parseInt(currentPeriod, 10);

            // Fetch Top Causes (Bar Chart)
            const { data: rows, error: barError } = await (supabase as any).rpc("get_top_risk_causes", {
                p_company_id: companyId,
                p_user_id: userId ?? null,
                p_jurisdiction: jurisdiction ?? null,
                p_limit: currentLimit,
            } as any);

            if (cancelled) return;

            if (barError) {
                logger.error("get_top_risk_causes failed:", barError);
                setData([]);
            } else {
                setData((rows ?? []) as RiskCause[]);
            }

            // Fetch Trends (Line Chart)
            const { data: trendRows, error: trendError } = await (supabase as any).rpc("get_top_risk_trends", {
                p_company_id: companyId,
                p_user_id: userId ?? null,
                p_jurisdiction: jurisdiction ?? null,
                p_days: periodInt,
                p_limit: currentLimit,
            } as any);

            if (cancelled) return;

            if (trendError) {
                logger.error("get_top_risk_trends failed:", trendError);
                setTrends([]);
            } else {
                setTrends((trendRows ?? []) as TrendData[]);
            }

            setLoading(false);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [companyId, userId, jurisdiction, currentLimit, currentPeriod]);

    const chartData = useMemo(() => data.map((d) => {
        const cause = d.cause ?? '';
        return {
            ...d,
            label: cause.length > 30 ? cause.slice(0, 27) + "…" : cause,
        };
    }), [data]);

    const topCauses = useMemo(() => data.map(d => d.cause ?? '').filter(Boolean), [data]);

    return (
        <DashboardCard
            className="h-[500px] flex flex-col min-h-0"
            views={periodViews}
            currentView={currentPeriod}
            onViewChange={setCurrentPeriod}
        >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[var(--color-warning)]/20">
                        <AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold dash-text">Top Risk Causes</h3>
                        <p className="text-xs dash-text-secondary">
                            Most frequently flagged compliance issues
                        </p>
                    </div>
                </div>

                {/* Sub-toggle for Top X Limit */}
                <div className="flex items-center gap-2 bg-[var(--color-surface-alt)] p-1 rounded-lg border dash-border self-start sm:self-auto">
                    {[5, 10, 15].map(val => (
                        <button
                            key={val}
                            onClick={() => setCurrentLimit(val)}
                            className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${currentLimit === val
                                ? "bg-[var(--color-surface)] shadow-sm dash-text-primary border dash-border"
                                : "dash-text-tertiary hover:dash-text-secondary"
                                }`}
                        >
                            TOP {val}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col lg:flex-row gap-10">
                    <SkeletonChart className="flex-1 h-64" />
                    <SkeletonChart className="flex-1 h-64" />
                </div>
            ) : chartData.length === 0 ? (
                <EmptyState message="No compliance issues found yet." />
            ) : (
                <div className="flex-1 flex flex-col lg:flex-row gap-8 lg:gap-12 pb-2">
                    {/* Left Section: Bar Chart */}
                    <div className="flex-1 min-h-0 shrink-0">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-3 flex items-center gap-2">
                            <AlertTriangle className="w-3 h-3" /> Distribution
                        </h4>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart
                                data={chartData}
                                layout="vertical"
                                margin={{ left: 10, right: 30 }}
                            >
                                <XAxis
                                    type="number"
                                    allowDecimals={false}
                                    tick={{ fontSize: 10, fill: "var(--chart-text)" }}
                                    axisLine={{ stroke: "var(--chart-grid)" }}
                                    tickLine={false}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="label"
                                    width={140}
                                    tick={{ fontSize: 10, fill: "var(--chart-text)" }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    formatter={(v: any) => [v, "Occurrences"]}
                                    labelFormatter={(label: any) => {
                                        const item = chartData.find((d) => d.label === label);
                                        return item?.cause ?? label;
                                    }}
                                    contentStyle={{
                                        background: "var(--color-surface)",
                                        border: "1px solid var(--color-border)",
                                        borderRadius: "8px",
                                        color: "var(--color-text-primary)",
                                        fontSize: "12px",
                                        boxShadow: "var(--color-card-shadow-hover)",
                                    }}
                                />
                                <Bar dataKey="occurrences" radius={[0, 4, 4, 0]} maxBarSize={16}>
                                    {chartData.map((entry, idx) => (
                                        <Cell
                                            key={idx}
                                            fill={SEVERITY_COLORS[entry.severity] ?? "var(--color-accent)"}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Right Section: Line Chart Trend */}
                    <div className="flex-1 min-h-0 shrink-0 mt-6 lg:mt-0">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-3 flex items-center gap-2">
                            <TrendingUp className="w-3 h-3" /> Trend Over Time
                        </h4>
                        <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={trends} margin={{ top: 10, right: 30, left: -20, bottom: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" strokeOpacity={0.3} vertical={false} />
                                <XAxis
                                    dataKey="day"
                                    tickFormatter={formatDayLabel}
                                    tick={{ fontSize: 10, fill: "var(--chart-text)" }}
                                    axisLine={{ stroke: "var(--chart-grid)" }}
                                    tickLine={false}
                                    minTickGap={20}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 10, fill: "var(--chart-text)" }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    labelFormatter={(v) => formatDayLabel(String(v))}
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
                                    height={40}
                                    wrapperStyle={{ fontSize: '11px', paddingTop: '20px' }}
                                    iconSize={10}
                                />
                                {topCauses.map((cause, idx) => (
                                    <Line
                                        key={cause}
                                        type="monotone"
                                        dataKey={cause}
                                        name={cause}
                                        stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4, strokeWidth: 0 }}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </DashboardCard>
    );
}
