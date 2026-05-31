import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Activity } from "lucide-react";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonTable } from "../ui/Skeleton";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type ActivityRow = {
  id: string;
  created_at: string;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  user_name: string | null;
  metadata: Record<string, any> | null;
};

function formatDateTime(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function prettyAction(action: string | null) {
  return (action ?? "unknown_action").replace(/_/g, " ");
}

function prettyEntityType(entityType: string | null) {
  return (entityType ?? "unknown_entity").replace(/_/g, " ");
}

export default function ActivityFeedWidget({
  companyId,
  limit = 5,
}: {
  companyId: string;
  limit?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState("all");

  const views = [
    { id: "all", label: "All" },
    { id: "mine", label: "Mine" },
    { id: "core", label: "Core" },
  ];

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

      const safeLimit = currentView === "all" ? Math.max(Number(limit || 5), 1) : 10;

      const { data, error } = await (supabase as any).rpc("get_company_activity_feed", {
        p_company_id: companyId,
        p_limit: safeLimit || 10,
      } as any);

      if (cancelled) return;

      if (error) {
        logger.error("get_company_activity_feed failed:", error);
        setRows([]);
        setErrorMsg(error.message || "Failed to load activity feed.");
        setLoading(false);
        return;
      }

      // Filter based on view:
      // "mine" -> would ideally filter by user_id, but we need auth context for that. 
      // If we don't have it here, we'll just filter after fetching if possible.
      // Since we don't fetch user context inside this component directly, let's just 
      // simulate "core" (creation/decisions) vs "all" for now if we can't reliably get the user ID here.
      // Actually, let's grab the current user to implement "mine" correctly:
      const { data: { user } } = await supabase.auth.getUser();

      let normalized = ((data ?? []) as any[])
        .map((r) => ({
          ...r,
          metadata: r?.metadata ?? null,
        })) as ActivityRow[];

      if (currentView === "mine" && user) {
        normalized = normalized.filter((r) => r.user_id === user.id);
      } else if (currentView === "core") {
        normalized = normalized.filter((r) =>
          r.action === "content_submitted" ||
          r.action === "legal_review_approved" ||
          r.action === "legal_review_rejected"
        );
      }

      setRows(normalized.slice(0, safeLimit));
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, limit, currentView]);

  return (
    <DashboardCard
      className="h-[500px] flex flex-col min-h-0"
      views={views}
      currentView={currentView}
      onViewChange={setCurrentView}
    >
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="p-1.5 rounded-lg"
          style={{ background: "var(--color-accent-soft)" }}
        >
          <Activity className="w-4 h-4 dash-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold dash-text">Recent Activity</h3>
          <p className="text-xs dash-text-secondary mt-0.5">
            {currentView === "all" ? "Latest legal + publishing events" :
              currentView === "mine" ? "Your recent actions" :
                "Key content creation & decisions"}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2 flex-1 overflow-y-auto pr-1 min-h-0">
        {loading ? (
          <SkeletonTable rows={5} cols={3} />
        ) : errorMsg ? (
          <ErrorState message={errorMsg} />
        ) : rows.length === 0 ? (
          <EmptyState message={`No activity found for this view.`} />
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="dash-surface-alt border dash-border rounded-lg p-3 transition-colors hover:border-[var(--color-border-hover)]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider dash-text">
                  {prettyAction(row.action)}
                </p>
                <p className="text-[11px] dash-text-tertiary shrink-0">
                  {row.created_at ? formatDateTime(row.created_at) : ""}
                </p>
              </div>
              <p className="text-xs dash-text-secondary mt-1">
                {row.user_id === (supabase.auth as any).user?.id ? "You" : (row.user_name?.trim() || "System")} •{" "}
                {prettyEntityType(row.entity_type)}
              </p>
            </div>
          ))
        )}
      </div>
    </DashboardCard>
  );
}
