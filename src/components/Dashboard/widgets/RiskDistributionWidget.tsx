import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { ShieldAlert } from "lucide-react";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonChart } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { logger } from '../../../lib/logger';

type Row = { status: string; count: number };

const LABELS: Record<string, string> = {
  approved: "Approved",
  flagged: "Flagged",
  critical: "Critical",
  pending: "Pending",
};

const COLORS: Record<string, string> = {
  approved: "#00A86B",
  flagged: "#F59E0B",
  critical: "#DC2626",
  pending: "#9CA3AF",
};

const BG_CLASSES: Record<string, string> = {
  approved: "bg-[var(--color-success)]",
  flagged: "bg-[var(--color-warning)]",
  critical: "bg-[var(--color-danger)]",
  pending: "bg-[var(--color-text-tertiary)]",
};

export default function RiskDistributionWidget({
  companyId,
  jurisdiction,
}: {
  companyId: string;
  jurisdiction?: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [currentView, setCurrentView] = useState("all");

  const views = [
    { id: "all", label: "All Status" },
    { id: "risks", label: "Risks" },
    { id: "safe", label: "Safe" },
  ];

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!companyId) return;

      setLoading(true);
      const { data, error } = await (supabase as any).rpc(
        "get_company_risk_distribution",
        {
          p_company_id: companyId,
          p_jurisdiction: jurisdiction ?? null,
        }
      );

      if (!mounted) return;

      if (error) {
        logger.error("get_company_risk_distribution failed:", error);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as Row[]);
      setLoading(false);
    };

    load();
    return () => {
      mounted = false;
    };
  }, [companyId, jurisdiction]);

  const filteredRows = useMemo(() => {
    if (currentView === "all") return rows;
    if (currentView === "risks") return rows.filter((r) => ["critical", "flagged"].includes(r.status));
    if (currentView === "safe") return rows.filter((r) => ["approved", "pending"].includes(r.status));
    return rows;
  }, [rows, currentView]);

  const total = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.count || 0), 0),
    [filteredRows]
  );

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
          <ShieldAlert className="w-4 h-4 dash-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold dash-text">Risk Distribution</h3>
          <p className="text-xs dash-text-secondary mt-0.5">
            Content status breakdown
          </p>
        </div>
      </div>

      <div className="mt-4 flex-1 overflow-y-auto pr-1 min-h-0">
        {loading ? (
          <SkeletonChart className="h-40" />
        ) : total === 0 ? (
          <EmptyState message="No content yet for this view." />
        ) : (
          <>
            {/* Donut-like ring using SVG */}
            <div className="flex items-center justify-center py-2">
              <svg
                width="140"
                height="140"
                viewBox="0 0 140 140"
                className="transform -rotate-90"
              >
                {(() => {
                  let cumulative = 0;
                  const radius = 55;
                  const circumference = 2 * Math.PI * radius;
                  return filteredRows.map((r) => {
                    const pct = r.count / total;
                    const offset = cumulative * circumference;
                    cumulative += pct;
                    return (
                      <circle
                        key={r.status}
                        cx="70"
                        cy="70"
                        r={radius}
                        fill="none"
                        stroke={COLORS[r.status] ?? "#9CA3AF"}
                        strokeWidth="18"
                        strokeDasharray={`${pct * circumference
                          } ${circumference}`}
                        strokeDashoffset={-offset}
                        className="transition-all duration-700 cursor-pointer hover:opacity-80"
                      />
                    );
                  });
                })()}
              </svg>
              <div className="absolute text-center">
                <p className="text-2xl font-bold dash-text">{total}</p>
                <p className="text-[10px] dash-text-secondary">Total</p>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {filteredRows.map((r) => (
                <div
                  key={r.status}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${BG_CLASSES[r.status] ?? "bg-[var(--color-text-tertiary)]"
                        }`}
                    />
                    <span className="text-xs dash-text font-medium truncate">
                      {LABELS[r.status] ?? r.status}
                    </span>
                  </div>
                  <span className="text-xs dash-text-secondary tabular-nums">
                    {r.count}{" "}
                    <span className="dash-text-tertiary">
                      ({Math.round((r.count / total) * 100)}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardCard>
  );
}
