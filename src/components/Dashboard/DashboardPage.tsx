import { useEffect, useMemo, useState, type ComponentType } from "react";
import { motion } from "framer-motion";
import { useDashboardLayout, type WidgetConfig } from "../../hooks/useDashboardLayout";
import SortableWidgetGrid from "./ui/SortableWidgetGrid";
import { supabase } from "../../lib/supabase";
import { useJurisdictionStore } from "../../stores/jurisdictionStore";
import ExecutiveTrendsWidget from "./widgets/ExecutiveTrendsWidget";
import RiskDistributionWidget from "./widgets/RiskDistributionWidget";
import RegulatorBadge from "../Common/RegulatorBadge";
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
  ClipboardCheck,
  Key,
  Activity,
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
  grc_failing_controls: number;
  capa_open: number;
  capa_overdue: number;
  licences_expiring: number;
  licences_expired: number;
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

type ModuleActivity = {
  content: boolean;
  risks: boolean;
  obligations: boolean;
  grc: boolean;
  policies: boolean;
  vendors: boolean;
  capas: boolean;
  licences: boolean;
  contraband: boolean;
  customerFlags: boolean;
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
  const industryType = (profile as any)?.industry_type as string | null | undefined;
  const isLogisticsProfile = industryType?.trim().toLowerCase() === 'logistics & courier';

  const perms = getPermissions({
    profileRole: profile?.role,
    customPermissions: (profile as any)?.customPermissions,
    moduleAccess: (profile as any)?.module_access,
    industryType,
  });

  // Derived access flags for gating fetches and KPI cards
  // Content submission metrics are irrelevant for logistics companies
  const canContent = perms.canUpload || perms.canViewLegalReview;
  const canGrc = perms.canViewGrcFrameworks;
  const canPolicies = perms.canViewPolicies;
  const canVendors = perms.canViewVendors;

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
  const [logisticsMetrics, setLogisticsMetrics] = useState<{ rejections_this_month: number; active_flags: number } | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [moduleActivity, setModuleActivity] = useState<ModuleActivity | null>(null);
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

  /* ── Module activity detection — which modules have any data ─────── */
  useEffect(() => {
    if (!companyId) { setActivityLoading(false); return; }
    let cancelled = false;

    type ActivityCheck = { key: keyof ModuleActivity; permission: boolean; table: string };
    const checks: ActivityCheck[] = [
      { key: 'content',       permission: canContent,                  table: 'content_submissions' },
      { key: 'risks',         permission: canGrc,                      table: 'risks' },
      { key: 'obligations',   permission: canGrc,                      table: 'regulatory_obligations' },
      { key: 'grc',           permission: canGrc,                      table: 'framework_test_log' },
      { key: 'policies',      permission: canPolicies,                 table: 'policies' },
      { key: 'vendors',       permission: canVendors,                  table: 'vendors' },
      { key: 'capas',         permission: canGrc,                      table: 'capa_records' },
      { key: 'licences',      permission: perms.canViewLicenseVault,   table: 'regulatory_licences' },
      { key: 'contraband',    permission: true,                        table: 'contraband_rejection_log' },
      { key: 'customerFlags', permission: true,                        table: 'customer_flags' },
    ];
    const permitted = checks.filter(c => c.permission);

    Promise.allSettled(
      permitted.map(c =>
        (supabase as any)
          .from(c.table)
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .limit(1)
      )
    ).then(results => {
      if (cancelled) return;
      const activity: ModuleActivity = {
        content: false, risks: false, obligations: false, grc: false,
        policies: false, vendors: false, capas: false, licences: false,
        contraband: false, customerFlags: false,
      };
      permitted.forEach((c, i) => {
        const res = results[i];
        activity[c.key] = res.status === 'fulfilled' && ((res.value as any).count ?? 0) > 0;
      });
      setModuleActivity(activity);
      setActivityLoading(false);
    });

    return () => { cancelled = true; };
  }, [companyId, canContent, canGrc, canPolicies, canVendors, perms.canViewLicenseVault]);

  /* ── Submission metrics (existing RPC) — gated behind content access ── */
  useEffect(() => {
    let cancelled = false;
    if (!companyId || !canContent || !moduleActivity?.content) { setExec(null); setLoading(false); return; }
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
  }, [companyId, canContent, moduleActivity]);

  /* ── Cross-module metrics — only fetch modules the user can access ── */
  useEffect(() => {
    let cancelled = false;
    if (!companyId) return;
    // If user has no access to any cross-module data, skip entirely
    if (!canGrc && !canPolicies && !canVendors) {
      setModuleMetrics({ open_risks: 0, critical_risks: 0, overdue_obligations: 0, draft_policies: 0, active_vendors: 0, grc_failing_controls: 0, capa_open: 0, capa_overdue: 0, licences_expiring: 0, licences_expired: 0 });
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

      if (canGrc) {
        // GRC: latest test result per control — fetch recent test log, pick first per control_id
        fetches.push({
          key: 'grc_tests',
          promise: (supabase as any)
            .from('framework_test_log')
            .select('control_id, status')
            .eq('company_id', companyId)
            .order('tested_at', { ascending: false })
            .limit(2000),
        });
        // CAPA: open (non-closed) records with due_date for overdue calc
        fetches.push({
          key: 'capas',
          promise: (supabase as any)
            .from('capa_records')
            .select('status, due_date')
            .eq('company_id', companyId)
            .neq('status', 'closed'),
        });
        // Regulatory licences: expiry_date for alert calc
        fetches.push({
          key: 'reg_licences',
          promise: (supabase as any)
            .from('regulatory_licences')
            .select('expiry_date')
            .eq('company_id', companyId),
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

      // GRC: latest test per control_id — first occurrence = most recent (ordered desc)
      const testRows: { control_id: string; status: string }[] = resultMap.grc_tests?.status === 'fulfilled' ? (resultMap.grc_tests.value.data ?? []) : [];
      const latestByControl = new Map<string, string>();
      for (const t of testRows) {
        if (!latestByControl.has(t.control_id)) latestByControl.set(t.control_id, t.status);
      }
      const grc_failing_controls = [...latestByControl.values()].filter(s => s === 'fail').length;

      // CAPA
      const capaRows: { status: string; due_date: string | null }[] = resultMap.capas?.status === 'fulfilled' ? (resultMap.capas.value.data ?? []) : [];
      const today = new Date();
      const capa_open = capaRows.length;
      const capa_overdue = capaRows.filter(c => c.due_date && new Date(c.due_date) < today).length;

      // Licences
      const licRows: { expiry_date: string | null }[] = resultMap.reg_licences?.status === 'fulfilled' ? (resultMap.reg_licences.value.data ?? []) : [];
      const ninetyDaysOut = new Date(today.getTime() + 90 * 86_400_000);
      const licences_expired = licRows.filter(l => l.expiry_date && new Date(l.expiry_date) < today).length;
      const licences_expiring = licRows.filter(l => l.expiry_date && new Date(l.expiry_date) >= today && new Date(l.expiry_date) <= ninetyDaysOut).length;

      setModuleMetrics({
        open_risks: riskRows.length,
        critical_risks: riskRows.filter((r: any) => r.level === 'critical' || r.level === 'high').length,
        overdue_obligations: obligationRows.length,
        draft_policies: policyRows.length,
        active_vendors: vendorRows.length,
        grc_failing_controls,
        capa_open,
        capa_overdue,
        licences_expiring,
        licences_expired,
      });
    })();

    return () => { cancelled = true; };
  }, [companyId, canGrc, canPolicies, canVendors]);

  /* ── Logistics-specific metrics ─────────────────────────────── */
  useEffect(() => {
    if (!companyId || (!moduleActivity?.contraband && !moduleActivity?.customerFlags)) return;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    Promise.allSettled([
      (supabase as any).from('contraband_rejection_log')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('created_at', startOfMonth.toISOString()),
      (supabase as any).from('customer_flags')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'active'),
    ]).then(([rejRes, flagRes]) => {
      setLogisticsMetrics({
        rejections_this_month: rejRes.status === 'fulfilled' ? ((rejRes.value as any).count ?? 0) : 0,
        active_flags: flagRes.status === 'fulfilled' ? ((flagRes.value as any).count ?? 0) : 0,
      });
    });
  }, [companyId, moduleActivity]);

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

  /* ── KPI cards — always 4, always compliance-infrastructure first ── */
  // Content workflow metrics (submissions, legal queue, approval rate) are
  // intentionally excluded — they belong in the content pipeline section,
  // not the top-level compliance health strip.
  const kpiCards: KpiCard[] = useMemo(() => {
    if (!moduleActivity) return [];

    // Build a ranked pool of compliance infrastructure candidates.
    // The first 4 non-null entries win — content data never enters this pool.
    const pool: (KpiCard | null)[] = [
      // Slot 1 — Risk posture
      canGrc ? {
        title: "Open Risks",
        value: moduleMetrics ? String(moduleMetrics.open_risks) : "…",
        icon: ShieldAlert,
        subtext: moduleMetrics?.critical_risks
          ? `${moduleMetrics.critical_risks} critical / high`
          : "No critical risks",
        variant: moduleMetrics && moduleMetrics.critical_risks > 0 ? "red" : "purple",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'risk-register' } })),
      } : null,

      // Slot 2 — Regulatory obligations
      canGrc ? {
        title: "Overdue Obligations",
        value: moduleMetrics ? String(moduleMetrics.overdue_obligations) : "…",
        icon: ClipboardList,
        subtext: moduleMetrics?.overdue_obligations === 0 ? "All on track" : "Action required",
        variant: moduleMetrics && moduleMetrics.overdue_obligations > 0 ? "red" : "green",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'obligations' } })),
      } : null,

      // Slot 3 — Control health (GRC failing controls, or CAPA, or logistics security)
      canGrc && moduleActivity.grc ? {
        title: "Failing Controls",
        value: moduleMetrics ? String(moduleMetrics.grc_failing_controls) : "…",
        icon: Activity,
        subtext: moduleMetrics?.grc_failing_controls === 0 ? "All controls passing" : "Corrective action needed",
        variant: moduleMetrics && moduleMetrics.grc_failing_controls > 0 ? "red" : "green",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'control-monitoring' } })),
      } : moduleActivity.contraband ? {
        title: "Contraband Rejections",
        value: logisticsMetrics ? String(logisticsMetrics.rejections_this_month) : "…",
        icon: ShieldAlert,
        subtext: "this month",
        variant: logisticsMetrics && logisticsMetrics.rejections_this_month > 0 ? "red" : "green",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'contraband-rejection' } })),
      } : canPolicies ? {
        title: "Draft Policies",
        value: moduleMetrics ? String(moduleMetrics.draft_policies) : "…",
        icon: FileText,
        subtext: "awaiting publication",
        variant: (moduleMetrics && moduleMetrics.draft_policies > 0 ? "yellow" : "green") as "yellow" | "green",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'policies' } })),
      } : null,

      // Slot 4 — CAPAs, licences, flagged senders, vendors, or policies (first match wins)
      canGrc && moduleActivity.capas ? {
        title: "Open CAPAs",
        value: moduleMetrics ? String(moduleMetrics.capa_open) : "…",
        icon: ClipboardCheck,
        subtext: moduleMetrics
          ? moduleMetrics.capa_overdue > 0
            ? `${moduleMetrics.capa_overdue} overdue`
            : "None overdue"
          : undefined,
        variant: moduleMetrics && moduleMetrics.capa_overdue > 0 ? "red" : moduleMetrics && moduleMetrics.capa_open > 0 ? "yellow" : "green",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'capa-management' } })),
      } : canGrc && moduleActivity.licences ? {
        title: "Licence Alerts",
        value: moduleMetrics ? String(moduleMetrics.licences_expired + moduleMetrics.licences_expiring) : "…",
        icon: Key,
        subtext: moduleMetrics
          ? `${moduleMetrics.licences_expired} expired · ${moduleMetrics.licences_expiring} expiring`
          : undefined,
        variant: moduleMetrics && moduleMetrics.licences_expired > 0 ? "red" : moduleMetrics && moduleMetrics.licences_expiring > 0 ? "yellow" : "green",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: isLogisticsProfile ? 'license-vault' : 'regulatory-affairs' } })),
      } : moduleActivity.customerFlags ? {
        title: "Flagged Senders",
        value: logisticsMetrics ? String(logisticsMetrics.active_flags) : "…",
        icon: Activity,
        subtext: logisticsMetrics?.active_flags === 0 ? "No active flags" : "Active blacklist entries",
        variant: logisticsMetrics && logisticsMetrics.active_flags > 0 ? "yellow" : "green",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'contraband-rejection' } })),
      } : canVendors && moduleActivity.vendors ? {
        title: "Active Vendors",
        value: moduleMetrics ? String(moduleMetrics.active_vendors) : "…",
        icon: Building2,
        subtext: "under monitoring",
        variant: "purple",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'vendors' } })),
      } : canPolicies && moduleActivity.policies ? {
        title: "Draft Policies",
        value: moduleMetrics ? String(moduleMetrics.draft_policies) : "…",
        icon: FileText,
        subtext: "awaiting publication",
        variant: (moduleMetrics && moduleMetrics.draft_policies > 0 ? "yellow" : "green") as "yellow" | "green",
        onClick: () => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'policies' } })),
      } : null,
    ];

    return pool.filter((c): c is KpiCard => c !== null).slice(0, 4);
  }, [moduleActivity, moduleMetrics, logisticsMetrics, isLogisticsProfile, canGrc, canPolicies, canVendors]);

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
              {activityLoading
                ? "Loading your workspace…"
                : loading || pipeline.loading
                ? "Refreshing your compliance dashboard…"
                : !moduleActivity || !Object.values(moduleActivity).some(Boolean)
                ? "Your workspace is ready — start using modules to see your dashboard."
                : exec
                ? isExecutive
                  ? `Compliance at ${approvalPct}, ${formatHours(exec.avg_turnaround_hours)} avg turnaround.`
                  : isMarketing
                  ? `${pipeline.payload?.awaiting_legal?.length || 0} in review, ${pipeline.payload?.ready_to_publish?.length || 0} ready to publish.`
                  : `${exec.in_legal_queue} in review, ${approvalPct} compliance rate.`
                : moduleMetrics
                ? `${moduleMetrics.overdue_obligations} overdue obligations · ${moduleMetrics.open_risks} open risks.`
                : "Your compliance workspace is up to date."}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <RegulatorBadge compact />
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

      {/* ── KPI Row ────────────────────────────────────────────── */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-[1600px] mx-auto items-stretch auto-rows-fr"
      >
        {activityLoading
          ? Array.from({ length: 4 }).map((_, i) => (
            <motion.div key={`sk-${i}`} variants={fadeUp} className="h-full">
              <SkeletonMetric className="h-full" />
            </motion.div>
          ))
          : kpiCards.length === 0
          ? (
            <motion.div variants={fadeUp} className="col-span-full">
              <div className="dash-card border dash-border rounded-2xl p-8 text-center">
                <p className="text-sm font-semibold dash-text mb-1">Your workspace is ready</p>
                <p className="text-xs dash-text-secondary">Start using any module — compliance data will appear here automatically.</p>
              </div>
            </motion.div>
          )
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

      {/* ── Hero Row: Needs Attention + Activity Feed ──────────── */}
      {/* Health score / compliance rates live in Compliance Report.  */}
      {/* Dashboard shows operational: what to act on, what just happened. */}
      {companyId && moduleActivity && Object.values(moduleActivity).some(Boolean) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-[1600px] mx-auto">
          <NeedsAttentionWidget companyId={companyId} access={perms} />
          <ActivityFeedWidget companyId={companyId} limit={8} />
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
        moduleActivity={moduleActivity}
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
  moduleActivity,
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
  moduleActivity: ModuleActivity | null;
  onNavigateToArchive?: () => void;
}) {
  const defaultWidgets = useMemo((): WidgetConfig[] => {
    const widgets: WidgetConfig[] = [];
    if (!companyId) return widgets;

    const hasContent = !!(moduleActivity?.content && (perms.canUpload || perms.canViewLegalReview));
    const hasRisks   = !!(moduleActivity?.risks && perms.canViewGrcFrameworks);
    const hasObligations = !!(moduleActivity?.obligations && perms.canViewGrcFrameworks);
    const hasCapas   = !!(moduleActivity?.capas && perms.canViewGrcFrameworks);
    const hasAnyActivity = !!(moduleActivity && Object.values(moduleActivity).some(Boolean));

    // Content widgets — role determines which; moduleActivity determines whether they mount
    if (hasContent) {
      if (isExecutive) {
        widgets.push(
          { id: "exec-trends",       colSpan: 2, render: () => <ExecutiveTrendsWidget companyId={companyId} jurisdiction={jurisdictionFilter} /> },
          { id: "exec-breakdown",    colSpan: 1, render: () => <ExecBreakdownWidget companyId={companyId} jurisdiction={jurisdictionFilter} /> },
          { id: "exec-longest-wait", colSpan: 1, render: () => <LongestWaitingItemsWidget companyId={companyId} jurisdiction={jurisdictionFilter} /> },
          { id: "exec-sla",          colSpan: 2, render: () => <ExecutiveSlaWidget companyId={companyId} /> },
        );
      }
      if (isLegal) {
        widgets.push(
          { id: "legal-queue", colSpan: 3, render: () => <LegalQueueWidget companyId={companyId} jurisdiction={jurisdictionFilter} limit={5} /> },
          { id: "legal-sla",   colSpan: 3, render: () => <LegalSlaWidget companyId={companyId} /> },
        );
      }
      if (isMarketing && userId) {
        widgets.push(
          { id: "mkt-pipeline",  colSpan: 3, render: () => <MarketingPipelineWidget companyId={companyId} loading={pipeline.loading} errorMsg={pipeline.errorMsg} payload={pipeline.payload} onRefresh={pipeline.refresh} /> },
          { id: "mkt-schedule",  colSpan: 1, render: () => <ScheduleWidget companyId={companyId} userId={userId} jurisdiction={jurisdictionFilter} /> },
          { id: "mkt-stats",     colSpan: 1, render: () => <MyStatsWidget companyId={companyId} userId={userId} /> },
          { id: "mkt-quiz",      colSpan: 3, render: () => <DailyQuizWidget /> },
        );
      }
      // Module-access users (not a named role) with content review permission
      if (!isExecutive && !isLegal && !isMarketing && perms.canViewLegalReview) {
        widgets.push({ id: 'mod-legal-queue', colSpan: 3, render: () => <LegalQueueWidget companyId={companyId} jurisdiction={jurisdictionFilter} limit={5} /> });
      }
    }

    // Risk widgets — only when this workspace has risk data
    if (hasRisks) {
      widgets.push(
        { id: "risk-dist",   colSpan: 1, render: () => <RiskDistributionWidget companyId={companyId} jurisdiction={jurisdictionFilter} /> },
        { id: "risk-causes", colSpan: isExecutive ? 3 : 2, render: () => <TopRiskCausesWidget companyId={companyId} jurisdiction={jurisdictionFilter} userId={!isExecutive && !isLegal ? userId : undefined} /> },
      );
    }

    // Upcoming deadlines — when obligations or CAPAs exist
    if (hasObligations || hasCapas) {
      widgets.push({ id: "deadlines", colSpan: 1, render: () => <UpcomingDeadlinesWidget companyId={companyId} /> });
    }

    // Marketing: extra deadlines slot after pipeline
    if (isMarketing && hasContent) {
      widgets.push({ id: "mkt-deadlines", colSpan: 1, render: () => <UpcomingDeadlinesWidget companyId={companyId} /> });
    }

    // Activity feed — when any module has been used
    if (hasAnyActivity) {
      widgets.push({ id: "activity", colSpan: 2, render: () => <ActivityFeedWidget companyId={companyId} limit={5} /> });
    }

    // Always present
    widgets.push(
      { id: "shared-jurisdiction-health", colSpan: 1, render: () => <JurisdictionHealthWidget companyId={companyId} /> },
      { id: "shared-compliance-matrix",   colSpan: 2, render: () => <ComplianceMatrixWidget onNavigateToArchive={onNavigateToArchive} /> },
    );

    return widgets;
  }, [
    companyId, userId, jurisdictionFilter, pipeline,
    moduleActivity, isExecutive, isLegal, isMarketing, onNavigateToArchive,
    perms.canUpload, perms.canViewLegalReview, perms.canViewGrcFrameworks,
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
