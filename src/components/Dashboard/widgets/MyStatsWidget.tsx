import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { User, TrendingUp, CheckCircle, XCircle, Clock, Send } from "lucide-react";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonChart } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type Stats = {
    total_all_time: number;
    total_this_month: number;
    approved: number;
    rejected: number;
    published: number;
    approval_rate: number;
    rework_rate: number;
    avg_time_to_approval_hours: number | null;
    platforms: { platform: string; count: number }[];
};

function fmtHrs(h: number | null) {
    if (h === null || Number.isNaN(h)) return "—";
    if (h < 1) return `${Math.round(h * 60)} min`;
    return `${h.toFixed(1)} hrs`;
}

function Stat({
    label,
    value,
    icon: Icon,
    color,
}: {
    label: string;
    value: string;
    icon: any;
    color: string;
}) {
    return (
        <div className="flex items-center gap-3 p-3 rounded-lg dash-surface-alt border dash-border">
            <div className={`p-2 rounded-lg ${color}`}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
                <p className="text-xs dash-text-secondary font-medium">{label}</p>
                <p className="text-lg font-bold dash-text leading-tight truncate tabular-nums">
                    {value}
                </p>
            </div>
        </div>
    );
}

export default function MyStatsWidget({
    companyId,
    userId,
}: {
    companyId: string;
    userId: string;
}) {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<Stats | null>(null);
    const [currentView, setCurrentView] = useState("overview");

    const views = [
        { id: "overview", label: "Overview" },
        { id: "volume", label: "Volume" },
        { id: "quality", label: "Quality" },
    ];

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            const { data, error } = await (supabase as any).rpc("get_my_content_stats", {
                p_company_id: companyId,
                p_user_id: userId,
            } as any);

            if (cancelled) return;
            if (error) {
                logger.error("get_my_content_stats failed:", error);
                setStats(null);
            } else {
                setStats(data as any as Stats);
            }
            setLoading(false);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [companyId, userId]);

    const pct = (n: number) => `${Math.round(n * 100)}%`;

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
                    <User className="w-4 h-4 dash-accent" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold dash-text">My Stats</h3>
                    <p className="text-xs dash-text-secondary">
                        Your personal content metrics
                    </p>
                </div>
            </div>

            {loading ? (
                <SkeletonChart className="h-32" />
            ) : !stats ? (
                <EmptyState message="No data yet." />
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 overflow-y-auto pr-1 min-h-0 content-start">
                    {(currentView === "overview" || currentView === "volume") && (
                        <>
                            <Stat
                                label="All Time"
                                value={String(stats.total_all_time)}
                                icon={TrendingUp}
                                color="bg-[var(--color-info-soft)] text-[var(--color-info)]"
                            />
                            <Stat
                                label="This Month"
                                value={String(stats.total_this_month)}
                                icon={Send}
                                color="bg-[var(--color-purple)]/10 text-[var(--color-purple)]"
                            />
                            <Stat
                                label="Published"
                                value={String(stats.published)}
                                icon={CheckCircle}
                                color="bg-[var(--color-success-soft)] text-[var(--color-success)]"
                            />
                        </>
                    )}

                    {(currentView === "overview" || currentView === "quality") && (
                        <>
                            <Stat
                                label="Approval Rate"
                                value={pct(stats.approval_rate)}
                                icon={CheckCircle}
                                color="bg-[var(--color-success-soft)] text-[var(--color-success)]"
                            />
                            <Stat
                                label="Rework Rate"
                                value={pct(stats.rework_rate)}
                                icon={XCircle}
                                color="bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                            />
                            <Stat
                                label="Avg to Approval"
                                value={fmtHrs(stats.avg_time_to_approval_hours)}
                                icon={Clock}
                                color="bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                            />
                        </>
                    )}
                </div>
            )}
        </DashboardCard>
    );
}
