import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Building2, Share2 } from "lucide-react";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonTable } from "../ui/Skeleton";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type DepartmentRow = {
  department: string | null;
  total: number;
  approved: number;
  rejected: number;
  approval_rate: number;
};

type PlatformRow = {
  platform: string | null;
  total: number;
  approved: number;
  rejected: number;
  in_legal_queue: number;
};

type BreakdownPayload = {
  by_department: DepartmentRow[];
  by_platform: PlatformRow[];
};

function formatPct(v: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 100)}%`;
}

export default function ExecBreakdownWidget({
  companyId,
  jurisdiction,
}: {
  companyId: string;
  jurisdiction?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [payload, setPayload] = useState<BreakdownPayload>({
    by_department: [],
    by_platform: [],
  });

  const [currentView, setCurrentView] = useState("overview");

  const views = [
    { id: "overview", label: "Overview" },
    { id: "department", label: "Department" },
    { id: "platform", label: "Platform" },
  ];

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!companyId) {
        setPayload({ by_department: [], by_platform: [] });
        setErrorMsg(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await (supabase as any).rpc(
        "get_company_dashboard_breakdown",
        {
          p_company_id: companyId,
          p_jurisdiction: jurisdiction ?? null,
        }
      );

      if (cancelled) return;

      if (error) {
        logger.error("get_company_dashboard_breakdown failed:", error);
        setPayload({ by_department: [], by_platform: [] });
        setErrorMsg(error.message || "Failed to load breakdown data.");
        setLoading(false);
        return;
      }

      const raw = (data ?? {}) as any;

      setPayload({
        by_department: (raw.by_department ?? []) as DepartmentRow[],
        by_platform: (raw.by_platform ?? []) as PlatformRow[],
      });
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, jurisdiction]);

  const hasData = useMemo(() => {
    return payload.by_department.length > 0 || payload.by_platform.length > 0;
  }, [payload.by_department.length, payload.by_platform.length]);

  const thClass =
    "text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider dash-text-secondary";
  const tdClass = "px-3 py-2 dash-text-secondary";

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
          <Building2 className="w-4 h-4 dash-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold dash-text">
            Operations Breakdown
          </h3>
          <p className="text-xs dash-text-secondary mt-0.5">
            Department approvals + platform throughput
          </p>
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto pr-1 min-h-0">
        {loading ? (
          <SkeletonTable rows={4} cols={3} />
        ) : errorMsg ? (
          <ErrorState message={errorMsg} />
        ) : !hasData ? (
          <EmptyState message="No breakdown data yet." />
        ) : (
          <div className={`grid gap-4 ${currentView === 'overview' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
            {/* By Department */}
            {(currentView === 'overview' || currentView === 'department') && (
              <div className="border dash-border rounded-lg overflow-hidden flex flex-col h-full">
                <div className="px-3 py-2 dash-surface-alt border-b dash-border">
                  <p className="text-xs font-semibold uppercase tracking-wider dash-text-secondary">
                    By department
                  </p>
                </div>
                <div className="flex-1 overflow-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className={thClass}>Department</th>
                        <th className={`${thClass} text-right`}>Total</th>
                        <th className={`${thClass} text-right`}>Approval</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.by_department.map((row, idx) => (
                        <tr
                          key={`${row.department ?? "unassigned"}-${idx}`}
                          className="border-t dash-border"
                        >
                          <td className="px-3 py-2 dash-text font-medium">
                            {row.department || "unassigned"}
                          </td>
                          <td className={`${tdClass} text-right tabular-nums`}>
                            {row.total ?? 0}
                          </td>
                          <td className={`${tdClass} text-right tabular-nums`}>
                            {formatPct(row.approval_rate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* By Platform */}
            {(currentView === 'overview' || currentView === 'platform') && (
              <div className="border dash-border rounded-lg overflow-hidden flex flex-col h-full">
                <div className="px-3 py-2 dash-surface-alt border-b dash-border flex items-center gap-2">
                  <Share2 className="w-3.5 h-3.5 dash-text-tertiary" />
                  <p className="text-xs font-semibold uppercase tracking-wider dash-text-secondary">
                    By platform
                  </p>
                </div>
                <div className="flex-1 overflow-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className={thClass}>Platform</th>
                        <th className={`${thClass} text-right`}>Total</th>
                        <th className={`${thClass} text-right`}>In legal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.by_platform.map((row, idx) => (
                        <tr
                          key={`${row.platform ?? "unknown"}-${idx}`}
                          className="border-t dash-border"
                        >
                          <td className="px-3 py-2 dash-text font-medium">
                            {row.platform || "unknown"}
                          </td>
                          <td className={`${tdClass} text-right tabular-nums`}>
                            {row.total ?? 0}
                          </td>
                          <td className={`${tdClass} text-right tabular-nums`}>
                            {row.in_legal_queue ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardCard>
  );
}
