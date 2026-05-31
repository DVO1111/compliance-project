import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { CalendarClock, AlertTriangle } from "lucide-react";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonChart } from "../ui/Skeleton";
import { ErrorState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type ScheduledItem = {
  id: string;
  title: string;
  scheduled_date: string | null;
  published_at?: string | null;
  signoff_status: string;
};

type PipelinePayload = {
  scheduled: ScheduledItem[];
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

export default function ScheduleWidget({
  companyId,
  userId,
  jurisdiction,
}: {
  companyId: string;
  userId: string;
  jurisdiction?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([]);
  const [currentView, setCurrentView] = useState("overview");

  const views = [
    { id: "overview", label: "Overview" },
    { id: "upcoming", label: "Upcoming" },
    { id: "overdue", label: "Overdue" },
  ];

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!companyId || !userId) {
        setScheduled([]);
        setErrorMsg(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await (supabase as any).rpc("get_marketing_pipeline", {
        p_company_id: companyId,
        p_user_id: userId,
        p_jurisdiction: jurisdiction ?? null,
      } as any);

      if (cancelled) return;

      if (error) {
        logger.error("get_marketing_pipeline failed:", error);
        setScheduled([]);
        setErrorMsg(error.message || "Failed to load schedule.");
        setLoading(false);
        return;
      }

      const payload = (data ?? {}) as PipelinePayload;
      setScheduled((payload.scheduled ?? []) as ScheduledItem[]);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, userId, jurisdiction]);

  const next14 = useMemo(() => {
    const now = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 14);

    return scheduled.filter((s) => {
      if (!s.scheduled_date) return false;
      const d = new Date(s.scheduled_date);
      if (Number.isNaN(d.getTime())) return false;
      return d >= now && d <= to;
    });
  }, [scheduled]);

  const overdue = useMemo(() => {
    const now = new Date();
    return scheduled.filter((s) => {
      if (!s.scheduled_date) return false;
      const d = new Date(s.scheduled_date);
      if (Number.isNaN(d.getTime())) return false;
      return d < now && !s.published_at;
    });
  }, [scheduled]);

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
          <CalendarClock className="w-4 h-4 dash-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold dash-text">Schedule</h3>
          <p className="text-xs dash-text-secondary mt-0.5">
            Upcoming and overdue scheduled posts
          </p>
        </div>
      </div>

      <div className="mt-4 flex-1 flex flex-col min-h-0">
        {loading ? (
          <SkeletonChart className="h-40" />
        ) : errorMsg ? (
          <ErrorState message={errorMsg} />
        ) : (
          <div className={`grid gap-4 flex-1 min-h-0 ${currentView === 'overview' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
            {(currentView === 'overview' || currentView === 'upcoming') && (
              <div className="border dash-border rounded-lg p-3 flex flex-col min-h-0">
                <p className="text-xs font-semibold uppercase tracking-wider dash-text-secondary shrink-0">
                  Upcoming (next 14 days) • {next14.length}
                </p>
                <div className="mt-2 space-y-2 flex-1 overflow-auto pr-1 min-h-0">
                  {next14.length === 0 ? (
                    <p className="text-xs dash-text-tertiary">
                      No upcoming scheduled posts.
                    </p>
                  ) : (
                    next14.map((item) => (
                      <div
                        key={item.id}
                        className="border dash-border rounded-md p-2 transition-colors hover:border-[var(--color-border-hover)]"
                      >
                        <p className="text-xs font-medium dash-text truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] dash-text-secondary mt-1">
                          {formatDate(item.scheduled_date)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {(currentView === 'overview' || currentView === 'overdue') && (
              <div className="border dash-border rounded-lg p-3 flex flex-col min-h-0">
                <p className="text-xs font-semibold uppercase tracking-wider dash-text-secondary flex items-center gap-1.5 shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                  Overdue scheduled • {overdue.length}
                </p>
                <div className="mt-2 space-y-2 flex-1 overflow-auto pr-1 min-h-0">
                  {overdue.length === 0 ? (
                    <p className="text-xs dash-text-tertiary">
                      No overdue items.
                    </p>
                  ) : (
                    overdue.map((item) => (
                      <div
                        key={item.id}
                        className="border border-[var(--color-warning)]/20 bg-[var(--color-warning-soft)] rounded-md p-2"
                      >
                        <p className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[var(--color-warning)] mt-1">
                          Scheduled: {formatDate(item.scheduled_date)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardCard>
  );
}
