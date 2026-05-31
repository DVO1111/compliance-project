import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { ListOrdered, Clock } from "lucide-react";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonTable } from "../ui/Skeleton";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type QueueRow = {
  content_id: string;
  title: string;
  department: string | null;
  platform: string;
  time_in_queue_hours: number | null;
  signoff_status: string;
  risk: string | null;
};

function fmtHours(hours: number | null) {
  const h = Number(hours);
  if (!Number.isFinite(h)) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

function ageBadgeColor(hours: number | null): string {
  const h = Number(hours);
  if (!Number.isFinite(h)) return "dash-text-tertiary";
  if (h >= 48) return "text-[var(--color-danger)]";
  if (h >= 24) return "text-[var(--color-warning)]";
  if (h >= 8) return "text-[var(--color-warning)]";
  return "text-[var(--color-success)]";
}

export default function LongestWaitingItemsWidget({
  companyId,
  jurisdiction,
}: {
  companyId: string;
  jurisdiction?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState("5");

  const views = [
    { id: "5", label: "Top 5" },
    { id: "10", label: "Top 10" },
    { id: "all", label: "Top 20" },
  ];

  const currentLimit = currentView === "all" ? 20 : parseInt(currentView, 10);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!companyId) {
        setRows([]);
        setErrorMsg(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      const safeLimit = Math.max(currentLimit, 1);

      const { data, error } = await (supabase as any).rpc("get_legal_queue", {
        p_company_id: companyId,
        p_statuses: ["awaiting_legal", "in_review"],
        p_priority: null,
        p_department: null,
        p_platform: null,
        p_jurisdiction: jurisdiction ?? null,
      } as any);

      if (cancelled) return;

      if (error) {
        logger.error("get_legal_queue failed:", error);
        setRows([]);
        setErrorMsg(error.message || "Failed to load longest waiting items.");
        setLoading(false);
        return;
      }

      const ordered = ((data ?? []) as QueueRow[])
        .slice()
        .sort(
          (a, b) =>
            Number(b.time_in_queue_hours || 0) -
            Number(a.time_in_queue_hours || 0)
        )
        .slice(0, safeLimit);

      setRows(ordered);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, jurisdiction, currentLimit]);

  return (
    <DashboardCard
      className="h-full min-h-[400px] max-h-[400px] flex flex-col"
      views={views}
      currentView={currentView}
      onViewChange={setCurrentView}
    >
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="p-1.5 rounded-lg"
          style={{ background: "var(--color-accent-soft)" }}
        >
          <ListOrdered className="w-4 h-4 dash-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold dash-text">
            Longest Waiting Items
          </h3>
          <p className="text-xs dash-text-secondary mt-0.5">
            Top {currentLimit} currently stuck in legal queue
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2 flex-1 overflow-y-auto pr-1 min-h-0">
        {loading ? (
          <SkeletonTable rows={currentLimit > 5 ? 5 : currentLimit} cols={3} />
        ) : errorMsg ? (
          <ErrorState message={errorMsg} />
        ) : rows.length === 0 ? (
          <EmptyState message="No waiting queue items." />
        ) : (
          rows.map((row, idx) => (
            <div
              key={`${row.content_id}-${idx}`}
              className="dash-surface-alt rounded-lg p-3 border dash-border transition-colors hover:border-[var(--color-border-hover)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider dash-text-tertiary">
                    #{idx + 1}
                  </p>
                  <p className="text-sm font-medium dash-text truncate">
                    {row.title}
                  </p>
                  <p className="text-xs dash-text-secondary mt-1">
                    {(row.department || "unassigned") +
                      " • " +
                      row.platform +
                      " • " +
                      row.signoff_status}
                  </p>
                </div>
                <div className={`flex items-center gap-1 shrink-0 ${ageBadgeColor(row.time_in_queue_hours)}`}>
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-sm font-semibold tabular-nums">
                    {fmtHours(row.time_in_queue_hours ?? 0)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardCard>
  );
}
