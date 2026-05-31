import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Globe, CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";
import DashboardCard from "../ui/DashboardCard";
import { SkeletonChart } from "../ui/Skeleton";
import { EmptyState } from "../ui/EmptyState";
import { logger } from "../../../lib/logger";

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

type HealthStatus = "healthy" | "warning" | "critical";

const JURISDICTION_META: Record<
  string,
  { label: string; flag: string; regulator: string }
> = {
  nigeria:    { label: "Nigeria",     flag: "🇳🇬", regulator: "NAFDAC" },
  usa:        { label: "USA",         flag: "🇺🇸", regulator: "FDA"    },
  europe:     { label: "Europe",      flag: "🇪🇺", regulator: "EMA"    },
  pan_african:{ label: "Pan-African", flag: "🌍", regulator: "AFRO"   },
};

const HEALTH_CONFIG: Record<
  HealthStatus,
  { label: string; Icon: typeof CheckCircle; color: string; bg: string; border: string }
> = {
  healthy: {
    label: "Healthy",
    Icon: CheckCircle,
    color: "#10b981",
    bg: "rgba(16,185,129,0.07)",
    border: "rgba(16,185,129,0.2)",
  },
  warning: {
    label: "Warning",
    Icon: AlertTriangle,
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.07)",
    border: "rgba(245,158,11,0.2)",
  },
  critical: {
    label: "Critical",
    Icon: AlertCircle,
    color: "#ef4444",
    bg: "rgba(239,68,68,0.07)",
    border: "rgba(239,68,68,0.2)",
  },
};

function computeHealth(row: JurisdictionRow): HealthStatus {
  if (row.critical >= 2 || row.approval_rate < 0.6) return "critical";
  if (row.critical >= 1 || row.approval_rate < 0.8 || row.flagged > 3)
    return "warning";
  return "healthy";
}

export default function JurisdictionHealthWidget({
  companyId,
}: {
  companyId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<JurisdictionRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc(
        "get_jurisdiction_comparison",
        { p_company_id: companyId, p_user_id: null }
      );

      if (cancelled) return;

      if (error) {
        logger.error("JurisdictionHealthWidget: RPC failed:", error);
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
  }, [companyId]);

  const summary = rows.reduce(
    (acc, r) => {
      const h = computeHealth(r);
      acc[h]++;
      return acc;
    },
    { healthy: 0, warning: 0, critical: 0 } as Record<HealthStatus, number>
  );

  return (
    <DashboardCard className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="p-1.5 rounded-lg"
            style={{ background: "var(--color-accent-soft)" }}
          >
            <Globe className="w-4 h-4 dash-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold dash-text">
              Jurisdiction Health
            </h3>
            <p className="text-xs dash-text-secondary">
              Live compliance status by market
            </p>
          </div>
        </div>

        {/* Summary badge */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {summary.critical > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  color: "#ef4444",
                }}
              >
                <AlertCircle className="w-3 h-3" />
                {summary.critical} critical
              </span>
            )}
            {summary.warning > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{
                  background: "rgba(245,158,11,0.1)",
                  color: "#f59e0b",
                }}
              >
                <AlertTriangle className="w-3 h-3" />
                {summary.warning} warning
              </span>
            )}
            {summary.critical === 0 && summary.warning === 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{
                  background: "rgba(16,185,129,0.1)",
                  color: "#10b981",
                }}
              >
                <CheckCircle className="w-3 h-3" />
                All clear
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <SkeletonChart className="h-48" />
      ) : rows.length === 0 ? (
        <EmptyState message="No jurisdiction data yet." />
      ) : (
        <div className="grid grid-cols-2 gap-3 flex-1">
          {rows.map((row) => {
            const meta = JURISDICTION_META[row.jurisdiction] ?? {
              label: row.jurisdiction,
              flag: "🌐",
              regulator: row.jurisdiction.toUpperCase(),
            };
            const health = computeHealth(row);
            const cfg = HEALTH_CONFIG[health];
            const StatusIcon = cfg.Icon;
            const approvalPct = Math.round(row.approval_rate * 100);

            return (
              <div
                key={row.jurisdiction}
                className="rounded-xl p-3 border transition-all"
                style={{ background: cfg.bg, borderColor: cfg.border }}
              >
                {/* Top: name + badge */}
                <div className="flex items-start justify-between gap-1 mb-2.5">
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-base leading-none">
                        {meta.flag}
                      </span>
                      <span className="text-xs font-bold dash-text">
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-[10px] dash-text-tertiary font-medium mt-0.5">
                      {meta.regulator}
                    </p>
                  </div>
                  <div
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold shrink-0"
                    style={{
                      background: cfg.bg,
                      color: cfg.color,
                      border: `1px solid ${cfg.border}`,
                    }}
                  >
                    <StatusIcon className="w-2.5 h-2.5" />
                    {cfg.label}
                  </div>
                </div>

                {/* Approval rate bar */}
                <div className="mb-2.5">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] dash-text-tertiary">
                      Approval
                    </span>
                    <span
                      className="text-[10px] font-bold tabular-nums"
                      style={{ color: cfg.color }}
                    >
                      {approvalPct}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-[var(--color-border)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${approvalPct}%`, background: cfg.color }}
                    />
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-0.5">
                  <div className="text-center">
                    <p className="text-[11px] font-bold dash-text tabular-nums">
                      {row.total_submissions}
                    </p>
                    <p className="text-[9px] dash-text-tertiary leading-tight">
                      Total
                    </p>
                  </div>
                  <div className="text-center">
                    <p
                      className="text-[11px] font-bold tabular-nums"
                      style={{ color: "#f59e0b" }}
                    >
                      {row.flagged}
                    </p>
                    <p className="text-[9px] dash-text-tertiary leading-tight">
                      Flagged
                    </p>
                  </div>
                  <div className="text-center">
                    <p
                      className="text-[11px] font-bold tabular-nums"
                      style={{ color: "#ef4444" }}
                    >
                      {row.critical}
                    </p>
                    <p className="text-[9px] dash-text-tertiary leading-tight">
                      Critical
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}
