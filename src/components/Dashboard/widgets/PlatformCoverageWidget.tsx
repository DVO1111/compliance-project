import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { PieChart as PieIcon } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonChart } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type PlatformRow = { platform: string; count: number };

const PLATFORM_COLORS: Record<string, string> = {
    instagram: "#E1306C",
    x: "#1DA1F2",
    website: "var(--color-accent)",
    linkedin: "#0A66C2",
    print: "#6b7280",
    radio: "#8b5cf6",
};

const PLATFORM_LABELS: Record<string, string> = {
    instagram: "Instagram",
    x: "X (Twitter)",
    website: "Website",
    linkedin: "LinkedIn",
    print: "Print",
    radio: "Radio",
};

export default function PlatformCoverageWidget({
    companyId,
    userId,
}: {
    companyId: string;
    userId?: string | null;
}) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<PlatformRow[]>([]);
    const [currentView, setCurrentView] = useState("all");

    const views = [
        { id: "all", label: "All Time" },
        { id: "30", label: "30 Days" },
        { id: "7", label: "7 Days" },
    ];

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);

            let q = supabase
                .from("content_submissions")
                .select("platform, created_at")
                .eq("company_id", companyId);

            if (userId) {
                q = q.eq("user_id", userId);
            }

            if (currentView === "7") {
                q = q.gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
            } else if (currentView === "30") {
                q = q.gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
            }

            const { data: rows, error } = await q;

            if (cancelled) return;
            if (error) {
                logger.error("PlatformCoverageWidget failed:", error);
                setData([]);
                setLoading(false);
                return;
            }

            const map = new Map<string, number>();
            (rows ?? []).forEach((r: any) => {
                map.set(r.platform, (map.get(r.platform) ?? 0) + 1);
            });

            setData(
                Array.from(map.entries())
                    .map(([platform, count]) => ({ platform, count }))
                    .sort((a, b) => b.count - a.count)
            );
            setLoading(false);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [companyId, userId, currentView]);

    const chartData = data.map((d) => ({
        name: PLATFORM_LABELS[d.platform] ?? d.platform,
        value: d.count,
        color: PLATFORM_COLORS[d.platform] ?? "#9ca3af",
    }));

    const total = data.reduce((sum, d) => sum + d.count, 0);

    return (
        <DashboardCard
            className="h-[450px] flex flex-col"
            views={views}
            currentView={currentView}
            onViewChange={setCurrentView}
        >
            <div className="flex items-center gap-2 mb-4 shrink-0">
                <div
                    className="p-1.5 rounded-lg"
                    style={{ background: "var(--color-accent-soft)" }}
                >
                    <PieIcon className="w-4 h-4 dash-accent" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold dash-text">
                        Platform Coverage
                    </h3>
                    <p className="text-xs dash-text-secondary">
                        Content distribution across channels
                    </p>
                </div>
            </div>

            {loading ? (
                <SkeletonChart className="h-48" />
            ) : chartData.length === 0 ? (
                <EmptyState message={`No content submitted in this period.`} />
            ) : (
                <div className="flex items-center gap-4 flex-1 min-h-0">
                    <ResponsiveContainer width="50%" height={160}>
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={70}
                                paddingAngle={2}
                                dataKey="value"
                                stroke="none"
                            >
                                {chartData.map((entry, idx) => (
                                    <Cell key={idx} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                formatter={(v: any) => [v, "items"]}
                                contentStyle={{
                                    background: "var(--color-surface)",
                                    border: "1px solid var(--color-border)",
                                    borderRadius: "8px",
                                    color: "var(--color-text-primary)",
                                    fontSize: "12px",
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>

                    <div className="flex-1 space-y-1.5 overflow-y-auto h-full pr-1 content-start py-2">
                        {chartData.map((d) => (
                            <div
                                key={d.name}
                                className="flex items-center justify-between text-xs"
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: d.color }}
                                    />
                                    <span className="dash-text">{d.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold dash-text tabular-nums">
                                        {d.value}
                                    </span>
                                    <span className="dash-text-tertiary w-10 text-right tabular-nums">
                                        {total > 0
                                            ? `${Math.round((d.value / total) * 100)}%`
                                            : "—"}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </DashboardCard>
    );
}
