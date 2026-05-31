import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import { History, CheckCircle, XCircle } from "lucide-react";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonTable } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type Decision = {
    review_id: string;
    content_id: string;
    content_title: string;
    platform: string;
    decision: string;
    comments: string | null;
    decided_at: string;
};

function formatDate(d: string) {
    try {
        const date = new Date(d);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
    } catch {
        return d;
    }
}

export default function HistoricalDecisionsWidget({
    companyId,
    reviewerId,
    limit = 15,
}: {
    companyId: string;
    reviewerId: string;
    limit?: number;
}) {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<Decision[]>([]);
    const [currentView, setCurrentView] = useState("all");

    const views = [
        { id: "all", label: "All Decisions" },
        { id: "approved", label: "Approved" },
        { id: "rejected", label: "Rejected" },
    ];

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            const { data, error } = await (supabase as any).rpc("get_my_past_decisions", {
                p_company_id: companyId,
                p_reviewer_id: reviewerId,
                p_limit: limit,
            } as any);

            if (cancelled) return;
            if (error) {
                logger.error("get_my_past_decisions failed:", error);
                setRows([]);
            } else {
                setRows((data ?? []) as Decision[]);
            }
            setLoading(false);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [companyId, reviewerId, limit]);

    const filteredRows = useMemo(() => {
        if (currentView === "all") return rows;
        return rows.filter((r) => r.decision === currentView);
    }, [rows, currentView]);

    return (
        <DashboardCard
            className="h-[500px] flex flex-col"
            views={views}
            currentView={currentView}
            onViewChange={setCurrentView}
        >
            <div className="flex items-center gap-2 mb-4 shrink-0">
                <div className="p-1.5 rounded-lg dash-surface-alt">
                    <History className="w-4 h-4 dash-text-secondary" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold dash-text">
                        My Past Decisions
                    </h3>
                    <p className="text-xs dash-text-secondary">
                        Recent items you reviewed
                    </p>
                </div>
            </div>

            {loading ? (
                <SkeletonTable rows={5} cols={3} />
            ) : filteredRows.length === 0 ? (
                <EmptyState message={`No ${currentView === 'all' ? '' : currentView} decisions found.`} />
            ) : (
                <div className="space-y-1.5 flex-1 overflow-y-auto pr-1 min-h-0">
                    {filteredRows.map((d) => (
                        <div
                            key={d.review_id}
                            className="flex items-start gap-3 p-2.5 rounded-lg transition-colors border border-transparent hover:dash-surface-alt hover:border-[var(--color-border)]"
                        >
                            <div className="mt-0.5 shrink-0">
                                {d.decision === "approved" ? (
                                    <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />
                                ) : (
                                    <XCircle className="w-4 h-4 text-[var(--color-danger)]" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium dash-text truncate">
                                        {d.content_title}
                                    </p>
                                    <span className="text-[11px] dash-text-tertiary whitespace-nowrap shrink-0">
                                        {formatDate(d.decided_at)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[11px] dash-text-tertiary">
                                        {d.platform}
                                    </span>
                                    <span
                                        className={`text-[11px] font-semibold ${d.decision === "approved"
                                            ? "text-[var(--color-success)]"
                                            : "text-[var(--color-danger)]"
                                            }`}
                                    >
                                        {d.decision}
                                    </span>
                                </div>
                                {d.comments && (
                                    <p className="text-xs dash-text-secondary mt-1 line-clamp-2 italic">
                                        "{d.comments}"
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </DashboardCard>
    );
}
