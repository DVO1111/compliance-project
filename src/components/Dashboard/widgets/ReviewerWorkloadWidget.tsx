import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Users } from "lucide-react";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonTable } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type Reviewer = {
    reviewer_id: string;
    reviewer_name: string;
    reviews_completed: number;
    approved: number;
    rejected: number;
    avg_turnaround_hours: number | null;
    current_queue: number;
};

function fmtHrs(h: number | null) {
    if (h === null || Number.isNaN(h)) return "—";
    if (h < 1) return `${Math.round(h * 60)}m`;
    return `${h.toFixed(1)}h`;
}

export default function ReviewerWorkloadWidget({
    companyId,
}: {
    companyId: string;
}) {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<Reviewer[]>([]);
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
            setLoading(true);
            const { data, error } = await (supabase as any).rpc("get_reviewer_workload", {
                p_company_id: companyId,
                p_days: days,
            } as any);

            if (cancelled) return;
            if (error) {
                logger.error("get_reviewer_workload failed:", error);
                setRows([]);
            } else {
                setRows((data ?? []) as Reviewer[]);
            }
            setLoading(false);
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [companyId, days]);

    const thClass =
        "py-2 px-2 text-[11px] font-semibold uppercase tracking-wider dash-text-secondary";

    return (
        <DashboardCard
            className="h-full min-h-[400px] max-h-[400px] flex flex-col"
            views={views}
            currentView={currentView}
            onViewChange={setCurrentView}
        >
            <div className="flex items-center gap-2 mb-4 shrink-0">
                <div className="p-1.5 rounded-lg bg-[var(--color-purple)]/10">
                    <Users className="w-4 h-4 text-[var(--color-purple)]" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold dash-text">
                        Reviewer Workload
                    </h3>
                    <p className="text-xs dash-text-secondary">
                        Last {days} days • per-reviewer performance
                    </p>
                </div>
            </div>

            {loading ? (
                <SkeletonTable rows={4} cols={6} />
            ) : rows.length === 0 ? (
                <EmptyState message="No reviewer activity found yet." />
            ) : (
                <div className="flex-1 overflow-y-auto overflow-x-auto -mx-2 min-h-0 pr-2">
                    <table className="w-full text-sm">
                        <thead>
                            <tr
                                style={{ borderBottom: "1px solid var(--color-border)" }}
                            >
                                <th className={`text-left ${thClass}`}>Reviewer</th>
                                <th className={`text-center ${thClass}`}>Queue</th>
                                <th className={`text-center ${thClass}`}>Done</th>
                                <th className={`text-center ${thClass}`}>
                                    <span className="text-[var(--color-success)]">✓</span>
                                </th>
                                <th className={`text-center ${thClass}`}>
                                    <span className="text-[var(--color-danger)]">✗</span>
                                </th>
                                <th className={`text-center ${thClass}`}>Avg Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr
                                    key={r.reviewer_id}
                                    className="border-b dash-border transition-colors"
                                    style={{ borderColor: "var(--color-border)" }}
                                >
                                    <td className="py-2 px-2 font-medium dash-text truncate max-w-[160px]">
                                        {r.reviewer_name}
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                        {r.current_queue > 0 ? (
                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--color-warning-soft)] text-[var(--color-warning)] text-xs font-bold">
                                                {r.current_queue}
                                            </span>
                                        ) : (
                                            <span className="dash-text-tertiary">0</span>
                                        )}
                                    </td>
                                    <td className="py-2 px-2 text-center dash-text-secondary tabular-nums">
                                        {r.reviews_completed}
                                    </td>
                                    <td className="py-2 px-2 text-center text-[var(--color-success)] font-medium tabular-nums">
                                        {r.approved}
                                    </td>
                                    <td className="py-2 px-2 text-center text-[var(--color-danger)] font-medium tabular-nums">
                                        {r.rejected}
                                    </td>
                                    <td className="py-2 px-2 text-center dash-text-secondary tabular-nums">
                                        {fmtHrs(r.avg_turnaround_hours)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </DashboardCard>
    );
}
