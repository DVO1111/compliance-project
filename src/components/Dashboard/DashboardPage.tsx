import { useEffect, useMemo, useState, type ComponentType } from "react";
import { motion } from "framer-motion";
import { useDashboardLayout, type WidgetConfig } from "../../hooks/useDashboardLayout";
import SortableWidgetGrid from "./ui/SortableWidgetGrid";
import { supabase } from "../../lib/supabase";
import { useJurisdictionStore } from "../../stores/jurisdictionStore";
import ExecutiveTrendsWidget from "./widgets/ExecutiveTrendsWidget";
import RiskDistributionWidget from "./widgets/RiskDistributionWidget";
import JurisdictionSelector from "../Common/JurisdictionSelector";
import ComplianceMatrixWidget from "./widgets/ComplianceMatrixWidget";
import ExecBreakdownWidget from "./widgets/ExecBreakdownWidget";
import ActivityFeedWidget from "./widgets/ActivityFeedWidget";
import LegalQueueWidget from "./widgets/LegalQueueWidget";
import LegalSlaWidget from "./widgets/LegalSlaWidget";
import MarketingPipelineWidget from "./widgets/MarketingPipelineWidget";
import ScheduleWidget from "./widgets/ScheduleWidget";
import { useMarketingPipeline } from "../../hooks/useMarketingPipeline";
import ExecutiveSlaWidget from "./widgets/ExecutiveSlaWidget";
import LongestWaitingItemsWidget from "./widgets/LongestWaitingItemsWidget";
import TopRiskCausesWidget from "./widgets/TopRiskCausesWidget";
import MyStatsWidget from "./widgets/MyStatsWidget";
import JurisdictionHealthWidget from "./widgets/JurisdictionHealthWidget";
import ComplianceHealthScoreWidget from "./widgets/ComplianceHealthScoreWidget";
import NeedsAttentionWidget from "./widgets/NeedsAttentionWidget";
import DailyQuizWidget from "./widgets/DailyQuizWidget";
import UpcomingDeadlinesWidget from "./widgets/UpcomingDeadlinesWidget";
import ActiveWorkflowsWidget from "./widgets/ActiveWorkflowsWidget";
import { useAuth } from "../../contexts/AuthContext";
import { getPermissions } from "../../lib/permissions";
import MetricCard from "./ui/MetricCard";
import ThemeSwitcher from "./ui/ThemeSwitcher";
import QuickActionsBar from "./ui/QuickActionsBar";
import { SkeletonMetric } from "./ui/Skeleton";
import ExportModal from "./ui/ExportModal";
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Timer,
  Scale,
  Upload,
  FileText,
  RotateCcw,
  Share2,
  ShieldAlert,
  ClipboardList,
  Building2,
} from "lucide-react";
import { logger } from '../../lib/logger';

/* ─────────────────────────── Types ─────────────────────────── */

type ExecMetrics = {
  total_submitted: number;
  in_legal_queue: number;
  approved: number;
  rejected: number;
  approval_rate: number;
  rejection_rate: number;
  avg_turnaround_hours: number | null;
  total_submitted_trend?: number[];
  total_submitted_change?: number;
  in_legal_queue_trend?: number[];
  in_legal_queue_change?: number;
  approved_trend?: number[];
  approved_change?: number;
  rejected_trend?: number[];
  rejected_change?: number;
  avg_turnaround_trend?: number[];
  avg_turnaround_change?: number;
};

type ModuleMetrics = {
  open_risks: number;
  critical_risks: number;
  overdue_obligations: number;
  draft_policies: number;
  active_vendors: number;
};

type IconType = ComponentType<{ className?: string }>;

type KpiCard = {
  title: string;
  value: string;
  icon: IconType;
  subtext?: string;
  trendData?: number[];
  trendValue?: number;
  onClick?: () => void;
  variant?: "blue" | "green" | "red" | "yellow" | "purple";
};

/* ─────────────────────────── Helpers ─────────────────────────── */

function formatHours(h: number | null) {
  if (h === null || Number.isNaN(h)) return "—";
  if (h < 1) return `${Math.round(h * 60)} mins`;
  return `${h.toFixed(1)} hrs`;
}

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

/* ─────────────────────────── Component ─────────────────────────── */

export default function DashboardPage({
  onNavigateToArchive,
}: {
  onNavigateToArchive?: () => void;
}) {
  const { profile, user } = useAuth();
  const role = String(profile?.role || "marketing").toLowerCase();
  const companyId = ((profile as any)?.company_id as string | undefined) || undefined;
  const userId = user?.id || undefined;

  const perms = getPermissions({
    profileRole: profile?.role,
    customPermissions: (profile as any)?.customPermissions,
    moduleAccess: (profile as any)?.module_access,
  });

  // Derived access flags for gating fetches and KPI cards
  const canContent = perms.canUpload || perms.canViewLegalReview;
  const canGrc = perms.canViewGrcFrameworks;
  const canPolicies = perms.canViewPolicies;
  const canVendors = perms.canViewVendors;
  // At least one "hero row" module is accessible
  const hasHeroAccess = canContent || canGrc || canPolicies || canVendors;

  const { selectedJurisdiction } = useJurisdictionStore();
  const jurisdictionFilter = selectedJurisdiction === "all" ? null : (selectedJurisdiction ?? null);

  const pipeline = useMarketingPipeline({
    companyId: companyId ?? "",
    userId: userId ?? "",
    jurisdiction: jurisdictionFilter,
  });

  const [loading, setLoading] = useState(true);
  const [exec, setExec] = useState<ExecMetrics | null>(null);
  const [moduleMetrics, setModuleMetrics] = useState<ModuleMetrics | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  /* ── Scroll detection ────────────────────────────────────────── */
  useEffect(() => {
    const mainScroll = document.getElementById('main-scroll-container');
    if (!mainScroll) return;
    const handleScroll = () => setIsScrolled(mainScroll.scrollTop > 10);
    mainScroll.addEventListener('scroll', handleScroll);
    return () => mainScroll.removeEventListener('scroll', handleScroll);
  }, []);

  /* ── Submission metrics (existing RPC) — gated behind content access ── */
  useEffect(() => {
    let cancelled = false;
    if (!companyId || !canContent) { setExec(null); setLoading(false); return; }
    setLoading(true);

    (async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_company_dashboard_metrics",
        { p_company_id: companyId }
      );
      if (cancelled) return;
      if (error) logger.error("get_company_dashboard_metrics failed:", error);
      setExec((data as any) ?? null);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [companyId, canContent]);

  /* ── Cross-module metrics — only fetch modules the user can access ── */
  useEffect(() => {
    let cancelled = false;
    if (!companyId) return;
    // If user has no access to any cross-module data, skip entirely
    if (!canGrc && !canPolicies && !canVendors) {
      setModuleMetrics({ open_risks: 0, critical_risks: 0, overdue_obligations: 0, draft_policies: 0, active_vendors: 0 });
      return;
    }

    (async () => {
      const now = new Date().toISOString();

      // Build fetch list based on permissions — only query tables the user can see
      type MetricFetch = { key: string; promise: Promise<any> };
      const fetches: MetricFetch[] = [];

      if (canGrc) {
        fetches.push({
          key: 'risks',
          promise: (supabase as any)
            .from('risks')
            .select('level, status')
            .eq('company_id', companyId)
            .neq('status', 'closed')
            .neq('status', 'resolved'),
        });
        fetches.push({
          key: 'obligations',
          promise: (supabase as any)
            .from('obligations')
            .select('status, due_date')
            .eq('company_id', companyId)
            .neq('status', 'completed')
            .lt('due_date', now),
        });
      }

      if (canPolicies) {
        fetches.push({
          key: 'policies',
          promise: (supabase as any)
            .from('policies')
            .select('status')
            .eq('company_id', companyId)
            .eq('status', 'draft'),
        });
      }

      if (canVendors) {
        fetches.push({
          key: 'vendors',
          promise: (supabase as any)
            .from('vendors')
            .select('id')
            .eq('company_id', companyId)
            .eq('status', 'active'),
        });
      }

      const settled = await Promise.allSettled(fetches.map(f => f.promise));
      if (cancelled) return;

      const resultMap = Object.fromEntries(
        fetches.map((f, i) => [f.key, settled[i]])
      ) as Record<string, PromiseSettledResult<any>>;

      const riskRows = resultMap.risks?.status === 'fulfilled' ? (resultMap.risks.value.data ?? []) : [];
      const obligationRows = resultMap.obligations?.status === 'fulfilled' ? (resultMap.obligations.value.data ?? []) : [];
      const policyRows = resultMap.policies?.status === 'fulfilled' ? (resultMap.policies.value.data ?? []) : [];
      const vendorRows = resultMap.vendors?.status === 'fulfilled' ? (resultMap.vendors.value.data ?? []) : [];

      setModuleMetrics({
        open_risks: riskRows.length,
        critical_risks: riskRows.filter((r: any) => r.level === 'critical' || r.level === 'high').length,
        overdue_obligations: obligationRows.length,
        draft_policies: policyRows.length,
        active_vendors: vendorRows.length,
      });
    })();

    return () => { cancelled = true; };
  }, [companyId, canGrc, canPolicies, canVendors]);

  const isExecutive = role === "executive";
  const isLegal = role === "compliance" || role === "legal";
  const isMarketing = role === "marketing";

  const approvalPct = useMemo(() => {
    if (!exec) return "—";
    return `${Math.round((exec.approval_rate || 0) * 100)}%`;
  }, [exec]);

  const rejectionPct = useMemo(() => {
    if (!exec) return "—";
    return `${Math.round((exec.rejection_rate || 0) * 100)}%`;
  }, [exec]);

  /* ── KPI cards — fully permission-gated ──────────────────────── */
  const kpiCards: KpiCard[] = useMemo(() => {
    // Cross-module cards — only shown when the user has the relevant module access
    const crossModule: KpiCard[] = [];

    if (canGrc) {
      crossModule.push({
        title: "Open Risks",
        value: moduleMetrics ? String(moduleMetrics.open_risks) : "…",
        icon: ShieldAlert,
        subtext: moduleMetrics?.critical_risks
          ? `${moduleMetrics.critical_risks} critical/high`
          : "No critical risks",
        variant: moduleMetrics && moduleMetrics.critical_risks > 0 ? "red" : "purple",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'risk-register' } })),
      });
      crossModule.push({
        title: "Overdue Obligations",
        value: moduleMetrics ? String(moduleMetrics.overdue_obligations) : "…",
        icon: ClipboardList,
        subtext: moduleMetrics?.overdue_obligations === 0 ? "All on track" : "Action required",
        variant: moduleMetrics && moduleMetrics.overdue_obligations > 0 ? "red" : "green",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'obligations' } })),
      });
    }

    // Content submission cards — only shown when user can upload or view legal review
    const base: KpiCard[] = [];
    if (canContent) {
      base.push(
        {
          title: "Total Submissions",
          value: exec ? String(exec.total_submitted) : loading ? "…" : "0",
          icon: FileText,
          trendData: exec?.total_submitted_trend,
          trendValue: exec?.total_submitted_change,
          variant: "blue",
        },
        {
          title: "Legal Queue",
          value: exec ? String(exec.in_legal_queue) : loading ? "…" : "0",
          icon: Scale,
          subtext: "awaiting review",
          trendData: exec?.in_legal_queue_trend,
          trendValue: exec?.in_legal_queue_change,
          variant: "yellow",
        },
      );
    }

    if (isExecutive) {
      return [
        ...crossModule,
        ...base,
        ...(canContent ? [
          {
            title: "Approval Rate",
            value: approvalPct,
            icon: CheckCircle2,
            subtext: exec ? `${exec.approved} approved` : undefined,
            variant: "green" as const,
          },
          {
            title: "Avg Turnaround",
            value: exec ? formatHours(exec.avg_turnaround_hours) : loading ? "…" : "—",
            icon: Timer,
            subtext: "submitted → decided",
            trendData: exec?.avg_turnaround_trend,
            trendValue: exec?.avg_turnaround_change,
            variant: "purple" as const,
          },
        ] : []),
      ];
    }

    if (isLegal) {
      return [
        ...crossModule,
        ...base,
        ...(canContent ? [
          {
            title: "Approved",
            value: exec ? String(exec.approved) : loading ? "…" : "0",
            icon: CheckCircle2,
            trendData: exec?.approved_trend,
            trendValue: exec?.approved_change,
            variant: "green" as const,
          },
          {
            title: "Turnaround",
            value: exec ? formatHours(exec.avg_turnaround_hours) : loading ? "…" : "—",
            icon: Timer,
            variant: "blue" as const,
          },
        ] : []),
        ...(canPolicies ? [{
          title: "Draft Policies",
          value: moduleMetrics ? String(moduleMetrics.draft_policies) : "…",
          icon: FileText,
          subtext: "awaiting publication",
          variant: (moduleMetrics && moduleMetrics.draft_policies > 0 ? "yellow" : "green") as "yellow" | "green",
          onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'policies' } })),
        }] : []),
      ];
    }

    // Marketing / fallback — gate each card individually
    return [
      ...crossModule,
      ...base,
      ...(canContent ? [
        {
          title: "Ready to Publish",
          value: exec ? String(exec.approved) : loading ? "…" : "0",
          icon: CheckCircle2,
          subtext: "Signed off / approved",
          variant: "green" as const,
        },
        {
          title: "Needs Rework",
          value: exec ? String(exec.rejected) : loading ? "…" : "0",
          icon: XCircle,
          subtext: "Rejected / changes",
          variant: "red" as const,
        },
      ] : []),
      ...(canVendors ? [{
        title: "Active Vendors",
        value: moduleMetrics ? String(moduleMetrics.active_vendors) : "…",
        icon: Building2,
        variant: "purple" as const,
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'vendors' } })),
      }] : []),
      ...(perms.canViewArchive ? [{
        title: "Go to Archive",
        value: "→ View",
        icon: Upload,
        subtext: "Edit / submit / publish",
        onClick: onNavigateToArchive,
        variant: "blue" as const,
      }] : []),
    ];
  }, [exec, loading, moduleMetrics, isExecutive, isLegal, approvalPct, rejectionPct, onNavigateToArchive, canContent, canGrc, canPolicies, canVendors, perms.canViewArchive]);

  /* ─────────────────────────── Render ─────────────────────────── */
  return (
    <div className="space-y-4 pb-10">

      {/* ── Print Only Header ─────────────────────────────────── */}
      <div className="hidden print-only mb-8 border-b-2 border-[var(--color-accent)] pb-4">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-accent)]">Dashboard Report</h1>
            <p className="text-sm text-gray-600">Company: {profile?.full_name || 'Organization'}</p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>Generated: {new Date().toLocaleString()}</p>
            <p>Jurisdiction: {selectedJurisdiction || 'All'}</p>
          </div>
        </div>
      </div>

      {/* ── Sticky Header ─────────────────────────────────────── */}
      <div className="sticky top-0 z-30 pt-2 pb-0">
        <div className={`border rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap max-w-[1600px] mx-auto transition-all duration-300 ${
          isScrolled
            ? 'bg-[var(--color-surface)]/70 backdrop-blur-xl border-transparent shadow-[0_8px_30px_rgb(0,0,0,0.12)]'
            : 'dash-card dash-border shadow-sm'
        }`}>
          <div>
            <h2 className="text-lg font-bold dash-text tracking-tight">
              Welcome back, {profile?.full_name?.split(' ')[0] || 'User'}
            </h2>
            <p className="text-[11px] dash-text-secondary mt-0.5 font-medium">
              {loading || pipeline.loading
                ? "Refreshing your latest dashboard metrics…"
                : !exec
                ? "Submit content to begin tracking progress."
                : isExecutive
                ? `Compliance at ${approvalPct}, ${formatHours(exec.avg_turnaround_hours)} avg turnaround.`
                : isMarketing
                ? `${pipeline.payload?.awaiting_legal?.length || 0} in review, ${pipeline.payload?.ready_to_publish?.length || 0} ready to publish.`
                : `${exec.in_legal_queue} in review, ${approvalPct} compliance rate.`}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <JurisdictionSelector compact />
            <ThemeSwitcher />
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-lg hover:-translate-y-0.5 transition-all"
              style={{ background: "var(--color-accent)" }}
            >
              <Share2 className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ──────────────────────────────────────── */}
      <QuickActionsBar role={role} perms={perms} />

      {/* ── Full Jurisdiction Selector ─────────────────────────── */}
      <div className="max-w-[1600px] mx-auto">
        <JurisdictionSelector />
      </div>

      {/* ── KPI Row ────────────────────────────────────────────── */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4 max-w-[1600px] mx-auto items-stretch auto-rows-fr"
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
            <motion.div key={`sk-${i}`} variants={fadeUp} className="h-full">
              <SkeletonMetric className="h-full" />
            </motion.div>
          ))
          : kpiCards.map((c, idx) => (
            <motion.div key={`${c.title}-${idx}`} variants={fadeUp} className="h-full">
              <MetricCard
                title={c.title}
                value={c.value}
                icon={c.icon}
                subtext={c.subtext}
                trendData={c.trendData}
                trendValue={c.trendValue}
                onClick={c.onClick}
                variant={c.variant}
                className="h-full"
              />
            </motion.div>
          ))}
      </motion.div>

      {/* ── Active Workflows (cross-module summary) ───────────────── */}
      {companyId && (
        <div className="max-w-[1600px] mx-auto">
          <ActiveWorkflowsWidget companyId={companyId} />
        </div>
      )}

      {/* ── Hero Row: Health Score + Needs Attention ───────────── */}
      {/* Only render when user has access to at least one relevant module */}
      {companyId && hasHeroAccess && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-[1600px] mx-auto">
          <ComplianceHealthScoreWidget companyId={companyId} access={perms} />
          <NeedsAttentionWidget companyId={companyId} access={perms} />
        </div>
      )}

      {/* ── Widget Sections (Drag & Drop) ──────────────────────── */}
      <WidgetArea
        role={role}
        companyId={companyId}
        userId={userId}
        perms={perms}
        jurisdictionFilter={jurisdictionFilter}
        pipeline={pipeline}
        isExecutive={isExecutive}
        isLegal={isLegal}
        isMarketing={isMarketing}
        onNavigateToArchive={onNavigateToArchive}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        role={role}
        selectedJurisdiction={selectedJurisdiction}
      />
    </div>
  );
}

/* ─────────────────── Widget Area (sorted) ──────────────────── */

function WidgetArea({
  role,
  companyId,
  userId,
  perms,
  jurisdictionFilter,
  pipeline,
  isExecutive,
  isLegal,
  isMarketing,
  onNavigateToArchive,
}: {
  role: string;
  companyId?: string;
  userId?: string;
  perms: ReturnType<typeof getPermissions>;
  jurisdictionFilter: string | null;
  pipeline: any;
  isExecutive: boolean;
  isLegal: boolean;
  isMarketing: boolean;
  onNavigateToArchive?: () => void;
}) {
  const defaultWidgets = useMemo((): WidgetConfig[] => {
    const widgets: WidgetConfig[] = [];
    const isModuleUser = !isExecutive && !isLegal && !isMarketing;

    if (isExecutive && companyId) {
      widgets.push(
        {
          id: "exec-trends",
          colSpan: 2,
          render: () => (
            <ExecutiveTrendsWidget companyId={companyId} jurisdiction={jurisdictionFilter} />
          ),
        },
        {
          id: "exec-risk-dist",
          colSpan: 1,
          render: () => (
            <RiskDistributionWidget companyId={companyId} jurisdiction={jurisdictionFilter} />
          ),
        },
        {
          id: "exec-breakdown",
          colSpan: 1,
          render: () => (
            <ExecBreakdownWidget companyId={companyId} jurisdiction={jurisdictionFilter} />
          ),
        },
        {
          id: "exec-longest-wait",
          colSpan: 1,
          render: () => (
            <LongestWaitingItemsWidget companyId={companyId} jurisdiction={jurisdictionFilter} />
          ),
        },
        {
          id: "exec-deadlines",
          colSpan: 1,
          render: () => <UpcomingDeadlinesWidget companyId={companyId} />,
        },
        {
          id: "exec-activity",
          colSpan: 1,
          render: () => <ActivityFeedWidget companyId={companyId} limit={5} />,
        },
        {
          id: "exec-sla",
          colSpan: 2,
          render: () => <ExecutiveSlaWidget companyId={companyId} />,
        },
        {
          id: "exec-risk-causes",
          colSpan: 3,
          render: () => (
            <TopRiskCausesWidget companyId={companyId} jurisdiction={jurisdictionFilter} />
          ),
        },
      );
    }

    if (isLegal && companyId) {
      widgets.push(
        {
          id: "legal-queue",
          colSpan: 3,
          render: () => (
            <LegalQueueWidget companyId={companyId} jurisdiction={jurisdictionFilter} limit={5} />
          ),
        },
        {
          id: "legal-sla",
          colSpan: 3,
          render: () => <LegalSlaWidget companyId={companyId} />,
        },
        {
          id: "legal-risk-causes",
          colSpan: 3,
          render: () => (
            <TopRiskCausesWidget companyId={companyId} jurisdiction={jurisdictionFilter} />
          ),
        },
      );
    }

    if (isMarketing && companyId && userId) {
      widgets.push(
        {
          id: "mkt-pipeline",
          colSpan: 3,
          render: () => (
            <MarketingPipelineWidget
              companyId={companyId}
              loading={pipeline.loading}
              errorMsg={pipeline.errorMsg}
              payload={pipeline.payload}
              onRefresh={pipeline.refresh}
            />
          ),
        },
        {
          id: "mkt-schedule",
          colSpan: 1,
          render: () => (
            <ScheduleWidget companyId={companyId} userId={userId} jurisdiction={jurisdictionFilter} />
          ),
        },
        {
          id: "mkt-deadlines",
          colSpan: 1,
          render: () => <UpcomingDeadlinesWidget companyId={companyId} />,
        },
        {
          id: "mkt-stats",
          colSpan: 1,
          render: () => <MyStatsWidget companyId={companyId} userId={userId} />,
        },
        {
          id: "mkt-risk-causes",
          colSpan: 3,
          render: () => (
            <TopRiskCausesWidget companyId={companyId} userId={userId} jurisdiction={jurisdictionFilter} />
          ),
        },
        {
          id: "mkt-quiz",
          colSpan: 3,
          render: () => <DailyQuizWidget />,
        },
      );
    }

    // Auto-assembled widgets for module-access users (not executive/legal/marketing)
    if (isModuleUser && companyId) {
      if (perms.canViewLegalReview) {
        widgets.push({
          id: 'mod-legal-queue',
          colSpan: 3,
          render: () => (
            <LegalQueueWidget companyId={companyId} jurisdiction={jurisdictionFilter} limit={5} />
          ),
        });
      }
      if (perms.canViewGrcFrameworks) {
        widgets.push({
          id: 'mod-risk-dist',
          colSpan: 1,
          render: () => (
            <RiskDistributionWidget companyId={companyId} jurisdiction={jurisdictionFilter} />
          ),
        });
        widgets.push({
          id: 'mod-risk-causes',
          colSpan: 2,
          render: () => (
            <TopRiskCausesWidget companyId={companyId} jurisdiction={jurisdictionFilter} />
          ),
        });
      }
      widgets.push({
        id: 'mod-deadlines',
        colSpan: 1,
        render: () => <UpcomingDeadlinesWidget companyId={companyId} />,
      });
      widgets.push({
        id: 'mod-activity',
        colSpan: 2,
        render: () => <ActivityFeedWidget companyId={companyId} limit={5} />,
      });
    }

    // Shared section — always present
    if (companyId) {
      widgets.push({
        id: "shared-jurisdiction-health",
        colSpan: 1,
        render: () => <JurisdictionHealthWidget companyId={companyId} />,
      });
    }

    widgets.push({
      id: "shared-compliance-matrix",
      colSpan: companyId ? 2 : 3,
      render: () => (
        <ComplianceMatrixWidget onNavigateToArchive={onNavigateToArchive} />
      ),
    });

    return widgets;
  }, [
    companyId, userId, jurisdictionFilter, pipeline,
    isExecutive, isLegal, isMarketing, onNavigateToArchive,
    perms.canViewLegalReview, perms.canViewGrcFrameworks,
  ]);

  const { orderedWidgets, moveWidget, resetLayout } = useDashboardLayout(role, defaultWidgets);

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      <div className="flex justify-end">
        <button
          onClick={resetLayout}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium dash-text-tertiary hover:dash-text-secondary transition-colors"
          style={{ background: "var(--color-surface-alt)", border: "1px solid var(--color-border)" }}
        >
          <RotateCcw className="w-3 h-3" />
          Reset Layout
        </button>
      </div>
      <SortableWidgetGrid widgets={orderedWidgets} onMove={moveWidget} />
    </div>
  );
}
