import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Globe } from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonChart } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type JurisdictionRow = {
    jurisdiction: string;
    total_submissions: number;
    approved: number;
    rejected: number;
    approval_rate: number;
    avg_risk_score: number | null;
    flagged: number;
    critical: number;
};

const JURISDICTION_LABELS: Record<string, string> = {
    nigeria: "Nigeria",
    usa: "USA",
    europe: "Europe",
    pan_african: "Pan-African",
};

export default function JurisdictionComparisonWidget({
    companyId,
    userId,
}: {
    companyId: string;
    userId?: string | null;
}) {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<JurisdictionRow[]>([]);
    const [currentView, setCurrentView] = useState("overview");

    const views = [
        { id: "overview", label: "Overview" },
        { id: "risk", label: "Risk Issues" },
        { id: "volume", label: "Volume" },
    ];

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            const { data, error } = await (supabase as any).rpc(
                "get_jurisdiction_comparison",
                {
                    p_company_id: companyId,
                    p_user_id: userId ?? null,
                }
            );

            if (cancelled) return;
            if (error) {
                logger.error("get_jurisdiction_comparison failed:", error);
                setRows([]);
            } else {
                setRows((data ?? []) as JurisdictionRow[]);
            }
            setLoading(false);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [companyId, userId]);

    const chartData = rows.map((r) => ({
        name: JURISDICTION_LABELS[r.jurisdiction] ?? r.jurisdiction,
        Approved: r.approved,
        Rejected: r.rejected,
        Flagged: r.flagged,
        Critical: r.critical,
        approval_rate: r.approval_rate,
        total: r.total_submissions,
        Volume: r.total_submissions,
    }));

    return (
        <DashboardCard
            className="h-full min-h-[400px] max-h-[400px] flex flex-col"
            views={views}
            currentView={currentView}
            onViewChange={setCurrentView}
        >
            <div className="flex items-center gap-2 mb-4 shrink-0">
                <div
                    className="p-1.5 rounded-lg"
                    style={{ background: "var(--color-accent-soft)" }}
                >
                    <Globe className="w-4 h-4 dash-accent" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold dash-text">
                        Jurisdiction Comparison
                    </h3>
                    <p className="text-xs dash-text-secondary">
                        Side-by-side metrics across markets
                    </p>
                </div>
            </div>

            {loading ? (
                <SkeletonChart className="h-48" />
            ) : chartData.length === 0 ? (
                <EmptyState message="No multi-jurisdiction data yet." />
            ) : (
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={chartData} margin={{ left: 0, right: 10 }}>
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 11, fill: "var(--chart-text)" }}
                                    axisLine={{ stroke: "var(--chart-grid)" }}
                                    tickLine={false}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    tick={{ fontSize: 11, fill: "var(--chart-text)" }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: "var(--color-surface)",
                                        border: "1px solid var(--color-border)",
                                        borderRadius: "8px",
                                        color: "var(--color-text-primary)",
                                        fontSize: "12px",
                                        boxShadow: "var(--color-card-shadow-hover)",
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />

                                {currentView === "overview" && (
                                    <>
                                        <Bar dataKey="Approved" fill="#13CD3C" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                        <Bar dataKey="Rejected" fill="#CD45A2" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                    </>
                                )}

                                {currentView === "risk" && (
                                    <>
                                        <Bar dataKey="Flagged" fill="#EAB308" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                        <Bar dataKey="Critical" fill="#FB2B76" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                    </>
                                )}

                                {currentView === "volume" && (
                                    <Bar dataKey="Volume" fill="var(--color-accent)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                )}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Summary row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 shrink-0">
                        {rows.map((r) => (
                            <div
                                key={r.jurisdiction}
                                className="rounded-lg dash-surface-alt border dash-border p-3 text-center"
                            >
                                <p className="text-xs font-semibold dash-text-secondary uppercase">
                                    {JURISDICTION_LABELS[r.jurisdiction] ?? r.jurisdiction}
                                </p>
                                <p className="text-lg font-bold dash-text mt-1 tabular-nums">
                                    {Math.round(r.approval_rate * 100)}%
                                </p>
                                <p className="text-[11px] dash-text-tertiary">
                                    approval ({r.total_submissions} total)
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </DashboardCard>
    );
}
