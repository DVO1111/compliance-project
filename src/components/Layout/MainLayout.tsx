import { getPermissions } from '../../lib/permissions';
import { getIndustryCategory } from '../../lib/regulatoryProfile';
import { resolveWorkRoles, pageOpenableBy, PAGE_SECTION } from '../../lib/access/roleAccess';
import {
  RAIL_GROUPS, BEYOND_DESIGN, DESTINATIONS, railEntryFor,
} from '../../lib/navigation/hs02';
import { mayOpenSettingsHome } from '../../lib/navigation/settingsSections';
import { Fragment, ReactNode, useEffect, useState, type CSSProperties } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBell from "../Common/NotificationBell";
import OfflineBadge from "../Common/OfflineBadge";
import Toast from "../Common/Toast";
import {
  LayoutDashboard,
  BarChart3,
  Upload,
  Archive,
  BookOpen,
  LogOut,
  ShieldCheck,
  User,
  Scale,
  GraduationCap,
  KeyRound,
  Bell,
  LifeBuoy,
  FileKey,
  Plug,
  Building2,
  Sparkles,
  CalendarDays,
  MessageSquare,
  Radar,
  UserCheck,
  Blocks,
  Briefcase,
  Activity,
  Layers,
  Library,
  Languages,
  Siren,
  MonitorDot,
  ShieldAlert,
  BrainCircuit,
  Radio,
  Globe,
  ClipboardList,
  FileSearch,
  ChevronDown,
  Zap,
  FileEdit,
  ListChecks,
  ClipboardCheck,
  Fingerprint,
  Menu,
  X,
  CreditCard,
  FlaskConical,
  GitMerge,
  BookMarked,
  PackageCheck,
  PackageX,
  Factory,
  Award,
  FileStack,
  Truck,
  ScrollText,
  FileCheck2,
  Gauge,
  Network,
  History,
  Trash2,
  Lock,
  ChevronRight,
  Boxes,
  Settings as SettingsIcon,
} from 'lucide-react';
import { usePlan } from '../../hooks/usePlan';
import { appUrl } from '../../lib/routing';

export type PageId =
  | 'dashboard'
  | 'upload'
  | 'archive'
  | 'regulations'
  | 'legal-review'
  | 'training-log'
  | 'company-members'
  | 'company-invites'
  | 'company-departments'
  | 'company-settings'
  //  CF-02's Settings home. Added by Phase 2: the rail entry called
  //  "Settings" used to be the company-profile page, which is guarded by
  //  canManageRoles, so every configuration area sat behind a
  //  role-administration permission.
  | 'settings-home'
  | 'correction-editor'
  | 'profile'
  | 'license-vault'
  | 'integrations'
  | 'audit-trail'
  | 'role-management'
  | 'enterprise-dashboard'
  | 'org-management'
  | 'ai-insights'
  | 'content-calendar'
  | 'team-chat'
  | 'drift-monitor'
  | 'consent-management'
  | 'content-blocks'
  | 'agency-portal'
  | 'compliance-reporting'
  | 'horizon-scanning'
  | 'channel-rules'
  | 'regulatory-library'
  | 'translation-compliance'
  | 'crisis-response'
  | 'programmatic-ad'
  | 'whistleblower'
  | 'predictive-risk'
  | 'social-listening'
  | 'website-monitoring'
  | 'vendor-scorecard'
  | 'capa-management'
  | 'deviations'
  | 'access-control'
  | 'materials'
  | 'in-process'
  | 'instruments'
  //  DB-01 draws these five and no page answers to any of them yet.
  //  They are real routes rather than dead labels: each opens a panel
  //  that says the screen is not built, so the rail matches the design
  //  without a tab that silently does nothing or opens something that
  //  merely looks related.
  | 'my-tasks'
  | 'goods-receipt'
  | 'qc-testing'
  | 'qa-disposition'
  | 'traceability'
  | 'dispatch'
  | 'batch-execution'
  | 'master-formulas'
  | 'product-specifications'
  | 'training-simulation'
  | 'claim-extraction'
  | 'pharma-integrations'
  | 'secret-vault'
  | 'legal-marketplace'
  | 'legal-partner-dashboard'
  | 'partner-verification'
  | 'policy-assistant'
  | 'grc-frameworks'
  | 'grc-controls'
  | 'grc-automation'
  | 'grc-dashboard'
  | 'policies'
  | 'policy-detail'
  | 'my-policies'
  | 'vendors'
  | 'vendor-detail'
  | 'audit-sessions'
  | 'audit-session-detail'
  | 'risk-register'
  | 'risk-detail'
  | 'command-center'
  | 'obligations'
  | 'obligation-detail'
  | 'identity-providers'
  | 'platform-jobs'
  | 'retention-policies'
  | 'legal-holds'
  | 'governance-timeline'
  | 'ai-assets'
  | 'ai-asset-detail'
  | 'ai-usage'
  | 'ai-incidents'
  | 'ai-reviews'
  | 'ai-prompts'
  | 'ai-dashboard'
  | 'platform-webhooks'
  | 'platform-evidence-ingestions'
  | 'platform-ecosystem'
  | 'notifications'
  | 'billing'
  // Manufacturing & Quality modules
  | 'batch-release'
  | 'change-control'
  | 'sop-library'
  | 'supplier-qualification'
  | 'gmp-inspection'
  // Tier 1 — Framework Library
  | 'framework-library'
  // Tier 1 — Continuous Control Monitoring
  | 'control-monitoring'
  // Regulatory Affairs (NAPAMS + Licences + Labelling)
  | 'products'
  | 'regulatory-affairs'
  // SON Compliance Tracker
  | 'son-compliance'
  // CTD Dossier Tracker
  | 'ctd-dossier'
  // Logistics modules
  | 'contraband-rejection'
  | 'shipment-event-log'
  | 'cn-declarations'
  // Compliance Alerting Engine
  | 'compliance-alerting'
  // AI Audit Preparation
  | 'audit-prep'
  // Certificate of Analysis register
  | 'coa';

/**
 * Every PageId, as a value the runtime can check against.
 *
 * ── WHY THIS IS NOT A HAND-WRITTEN LIST ──
 *
 * App.tsx had one: isValidPageId, an `a || b || c` chain used by
 * useRoutePersistence to decide whether a stored page is real. Its own
 * comment records the last time it fell behind — "Previously missing,
 * so a reload or deep link while on any of these silently dropped the
 * user back to the dashboard" — and it had fallen behind again. Every
 * page built during this repair was absent from it: my tasks, goods
 * receipt, QC testing, QA disposition, traceability, batch execution,
 * materials, instruments, in-process, master formulas, access control,
 * deviations, CAPA. Reloading on any of them returned the person to
 * the dashboard.
 *
 * A list that has to be remembered is a list that will be forgotten.
 * The EXHAUSTIVENESS CHECK below turns the next omission into a
 * typecheck failure rather than a bug somebody hits on a refresh.
 */
export const PAGE_IDS = [
  'dashboard', 'upload', 'archive', 'regulations',
  'legal-review', 'training-log', 'company-members', 'company-invites',
  'company-departments', 'company-settings', 'correction-editor', 'profile',
  'license-vault', 'integrations', 'audit-trail', 'role-management',
  'enterprise-dashboard', 'org-management', 'ai-insights', 'content-calendar',
  'team-chat', 'drift-monitor', 'consent-management', 'content-blocks',
  'agency-portal', 'compliance-reporting', 'horizon-scanning', 'channel-rules',
  'regulatory-library', 'translation-compliance', 'crisis-response', 'programmatic-ad',
  'whistleblower', 'predictive-risk', 'social-listening', 'website-monitoring',
  'vendor-scorecard', 'capa-management', 'deviations', 'access-control',
  'materials', 'in-process', 'instruments', 'my-tasks',
  'goods-receipt', 'qc-testing', 'qa-disposition', 'traceability',
  'dispatch', 'batch-execution', 'master-formulas', 'training-simulation',
  'claim-extraction', 'pharma-integrations', 'secret-vault', 'legal-marketplace',
  'legal-partner-dashboard', 'partner-verification', 'policy-assistant', 'grc-frameworks',
  'grc-controls', 'grc-automation', 'grc-dashboard', 'policies',
  'policy-detail', 'my-policies', 'vendors', 'vendor-detail',
  'audit-sessions', 'audit-session-detail', 'risk-register', 'risk-detail',
  'command-center', 'obligations', 'obligation-detail', 'identity-providers',
  'platform-jobs', 'retention-policies', 'legal-holds', 'governance-timeline',
  'ai-assets', 'ai-asset-detail', 'ai-usage', 'ai-incidents',
  'ai-reviews', 'ai-prompts', 'ai-dashboard', 'platform-webhooks',
  'platform-evidence-ingestions', 'platform-ecosystem', 'notifications', 'billing',
  'batch-release', 'change-control', 'sop-library', 'supplier-qualification',
  'gmp-inspection', 'framework-library', 'control-monitoring', 'products',
  'regulatory-affairs', 'son-compliance', 'ctd-dossier', 'contraband-rejection',
  'shipment-event-log', 'cn-declarations', 'compliance-alerting', 'audit-prep',
  'coa',
  'product-specifications',
  'settings-home',
] as const;

/**
 * Fails to compile if a PageId is missing from PAGE_IDS above.
 *
 * The error names the missing members, because `Exclude<...>` resolves
 * to them: "Type '\"new-page\"' is not assignable to type 'true'".
 */
type MissingPageIds = Exclude<PageId, typeof PAGE_IDS[number]>;
const _pageIdsAreExhaustive: MissingPageIds extends never ? true : MissingPageIds = true;
void _pageIdsAreExhaustive;

const PAGE_ID_SET: ReadonlySet<string> = new Set(PAGE_IDS);

/** Whether a stored or deep-linked value names a page that exists. */
export function isPageId(value: unknown): value is PageId {
  return typeof value === 'string' && PAGE_ID_SET.has(value);
}

interface MainLayoutProps {
  children: ReactNode;
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
}

type NavigateToEventDetail = {
  page: PageId;
  contentId?: string;
};

const CORRECTION_OPEN_KEY = 'cc_open_correction_id';
//  The groups no longer collapse, so the old key has nothing to
//  store. A new key, because the shape it holds is different: host
//  page ids that the reader has opened, not group names they closed.
const EXPANDED_HOSTS_KEY = 'cc_expanded_nav_hosts';

/**
 * Sidebar group order — the compliance cycle: see what needs me, do the work,
 * prove it happened, then everything that supports it.
 *
 * Declared explicitly rather than inferred from array position, because a
 * couple of items change category by industry (training records) and would
 * otherwise pull their group to the top of the sidebar.
 */
//  HS-02's groups, in the order the design draws them. The list itself
//  lives in lib/navigation/hs02.ts with the destinations, so the rail's
//  order and its contents cannot drift apart.
const CATEGORY_ORDER: readonly string[] = RAIL_GROUPS;

/**
 * ONB-08's sidebar, which is a SHORTER sidebar on purpose.
 *
 * The design draws four groups and a handful of items in each: the work
 * a regulated manufacturer does, in the order a batch moves through it.
 * This product has around ninety pages. Showing all of them, grouped by
 * subsystem, made the sidebar a directory of the software rather than a
 * description of the job — you scrolled it to find anything.
 *
 * So the pages the design names are lifted into its four groups, in its
 * order, with its words: "Registrations & Licences" rather than
 * "Regulatory Affairs", because that is what the person is looking for.
 *
 * EVERY OTHER PAGE IS STILL HERE, under "More" at the bottom, collapsed.
 * Nothing became unreachable and no permission changed — the list below
 * is untouched, including every `hidden` test, and this only decides
 * which heading each surviving item sits under. A design that hides
 * working pages is a design that loses them.
 *
 * A PAGE THAT IS NOT IN THIS MAP LANDS UNDER "More", WHICH STARTS
 * COLLAPSED. That is the whole behaviour, and it is easy to miss when
 * adding a page: the route works, the item is in the list below, the
 * `hidden` test passes — and the only way to reach it is to scroll to
 * the bottom of the sidebar and expand a group. It reads as missing.
 *
 * That is exactly what happened to Materials, Instruments, In-Process
 * Checks and Roles & Access. They were built, routed and listed, and
 * none of them was in here, so all four sat collapsed under More while
 * being reported as not existing. They are now placed above, in the
 * order a batch moves through them.
 *
 * So: ADDING A PAGE MEANS ADDING IT HERE TOO, or deciding on purpose
 * that it belongs under More. The earlier note said no page existed for
 * Materials; one does now, and the note outlived it.
 */

//  WHERE THE RAIL IS DECIDED NOW: lib/navigation/hs02.ts.
//
//  This file used to hold `DB01_NAV`, a map of page -> DB-01 group,
//  plus a fallback that sent anything missing from it to a collapsed
//  "More" group. HS-01 row 1 decided against that arrangement —
//  "One rail for every page and role (HS-02)" — and named DB-01 as
//  one of the four rails it replaces.
//
//  So the map is gone and `DESTINATIONS` replaces it. The difference
//  that matters is the type: it is Record<PageId, Destination>, so a
//  page with no stated destination does not compile. There is no
//  fallback left to fall into.

/** Everything the design does not name starts collapsed. */
//  Was ['More']. There is no More group to collapse now, and every
//  HS-02 group is drawn flat, so nothing starts closed.
function loadExpandedHosts(): string[] {
  try {
    const raw = localStorage.getItem(EXPANDED_HOSTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    //  Private windows and blocked site data both land here. The rail
    //  still works; it just forgets which hosts were open.
    return [];
  }
}

export default function MainLayout({
  children,
  currentPage,
  onNavigate,
}: MainLayoutProps) {
  const { signOut, profile } = useAuth();
  const { plan, isTrialing, daysRemaining } = usePlan();
  const [toastParams, setToastParams] = useState<{ message: string; type?: 'success' | 'warning' } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  //  HS-02 draws a flat rail. Pages that belong INSIDE one of its
  //  entries — Settings' sections, CoA under Batch Release, CAPA under
  //  Deviation / CAPA — are reachable here as a nested list under the
  //  host, collapsed, until Phase 2 gives the host real tabs.
  //
  //  Collapsed by default ON PURPOSE, and it is worth saying why this
  //  is not the "More" problem again: More was ONE anonymous bucket
  //  holding 80 unrelated pages, and nothing told you what was in it.
  //  These are named children of the entry they belong to, the host is
  //  one click away, and a host holding the current page opens itself.
  const [expandedHosts, setExpandedHosts] = useState<string[]>(loadExpandedHosts);
  const toggleHost = (id: string) =>
    setExpandedHosts((prev) => {
      const next = prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id];
      try {
        localStorage.setItem(EXPANDED_HOSTS_KEY, JSON.stringify(next));
      } catch { /* storage unavailable — expansion still works for this session */ }
      return next;
    });

  const industryType = (profile as any)?.industry_type as string | null | undefined;
  const isLogisticsProfile = industryType?.trim().toLowerCase() === 'logistics & courier';
  // Manufacturing & Quality (GMP, batch release, SOPs, CAPA, supplier qual) only
  // applies to sectors that actually manufacture / move goods — life sciences,
  // food, cosmetics, medical devices (life_sciences) and logistics. Sectors like
  // finance or advertising don't use it, so the whole section is hidden for them.
  const industryCategory = getIndustryCategory(industryType);
  //  NAMED EXCLUSIONS, NOT A NAMED ALLOW-LIST, AND THAT IS THE WHOLE
  //  POINT. This used to read `=== 'life_sciences' || === 'logistics'`,
  //  which meant 'generic' hid the entire Quality Operations section —
  //  every screen built from the design file, plus batch release, SOPs,
  //  deviations and CAPA.
  //
  //  'generic' is what categorize() returns for an EMPTY industry_type
  //  and for the literal option "Other". So an account created before
  //  that field existed, or one whose owner picked Other, loses half
  //  the product with no message, no empty state and nothing in the
  //  sidebar to suggest anything is missing. It looks like the features
  //  were never built.
  //
  //  Hiding a nav item is not a security control — row-level security
  //  is, and it does not consult this. So the failure modes are not
  //  symmetric: showing a section to a company that has no use for it
  //  is clutter, while hiding it from a company that lives on it is
  //  indistinguishable from the work not existing. This fails open and
  //  excludes only the two categories we can positively say do not
  //  manufacture or move goods.
  const usesManufacturingQuality =
    industryCategory !== 'financial' && industryCategory !== 'advertising';
  const perms = getPermissions({
    profileRole: profile?.role,
    customPermissions: (profile as any)?.customPermissions,
    moduleAccess: (profile as any)?.module_access,
    industryType,
  });

  // ✅ Listen for programmatic navigation events
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<NavigateToEventDetail>;
      const page = ce?.detail?.page;
      if (!page) return;

      const contentId = ce?.detail?.contentId;
      if (page === 'correction-editor' && contentId) {
        localStorage.setItem(CORRECTION_OPEN_KEY, contentId);
      }

      onNavigate(page);
    };

    window.addEventListener('navigate-to', handler as EventListener);
    return () => window.removeEventListener('navigate-to', handler as EventListener);
  }, [onNavigate]);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail) {
        setToastParams(ce.detail);
      }
    };
    window.addEventListener('global-toast', handleToast);
    return () => window.removeEventListener('global-toast', handleToast);
  }, []);

  const navItems: {
    id: PageId;
    label: string;
    icon: typeof LayoutDashboard;
    category: string;
    hidden?: boolean;
  }[] = [
      // ── 1. Home — "what needs me today" ──────────────────────────────
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, category: 'Home' },
      { id: 'command-center', label: 'Command Center', icon: Gauge, category: 'Home', hidden: !perms.canViewGrcDashboard },
      { id: 'compliance-reporting', label: 'Compliance Report', icon: Activity, category: 'Home', hidden: !perms.canViewComplianceReporting },
      { id: 'ai-insights', label: 'AI Insights', icon: Sparkles, category: 'Home' },
      { id: 'enterprise-dashboard', label: 'Group Overview', icon: Network, category: 'Home', hidden: !profile?.organization_id || !perms.canViewComplianceReporting },
      { id: 'team-chat', label: 'Team Chat', icon: MessageSquare, category: 'Home' },

      // ── 2. Quality Operations ────────────────────────────────────────
      { id: 'batch-release', label: 'Batch Release', icon: FlaskConical, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      { id: 'coa', label: 'Certificates of Analysis', icon: FileCheck2, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      //  The shop-floor view of one batch: W4·17's stage strip and
      //  W4·18's clearance conditions. Distinct from Batch Release,
      //  which is QA deciding on a finished batch — this is the stages
      //  being run.
      //  DB-01 lists these five and no page answers to any of them. They
      //  are listed so the rail reads as the design draws it; each opens
      //  a panel that says so. Gated exactly like the manufacturing
      //  screens beside them, so a finance workspace does not gain a tab
      //  by way of a placeholder.
      { id: 'my-tasks', label: 'My tasks', icon: ListChecks, category: 'Quality Operations', hidden: false },
      { id: 'goods-receipt', label: 'Goods receipt', icon: Truck, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      { id: 'qc-testing', label: 'QC testing', icon: FlaskConical, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      { id: 'qa-disposition', label: 'QA disposition', icon: ClipboardCheck, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      { id: 'traceability', label: 'Traceability', icon: Network, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      { id: 'dispatch', label: 'Dispatch', icon: Truck, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },

      { id: 'materials', label: 'Materials', icon: PackageCheck, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      { id: 'instruments', label: 'Instruments', icon: Gauge, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      { id: 'in-process', label: 'In-Process Checks', icon: Gauge, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      { id: 'batch-execution', label: 'Batch Execution', icon: FlaskConical, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      { id: 'product-specifications', label: 'Specifications', icon: ClipboardCheck, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      { id: 'master-formulas', label: 'Master Formulas', icon: BookMarked, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },

      //  Deviations and CAPA are two registers, not one. This item
      //  read "Deviation / CAPA" while pointing only at the CAPA page,
      //  so a deviation had no destination; now each has its own, and
      //  the CAPA label stops claiming the other.
      { id: 'deviations', label: 'Deviations', icon: ClipboardList, category: 'Quality Operations', hidden: !perms.canViewCapaManagement || !usesManufacturingQuality },
      { id: 'capa-management', label: 'CAPA', icon: ClipboardList, category: 'Quality Operations', hidden: !perms.canViewCapaManagement || !usesManufacturingQuality },
      { id: 'change-control', label: 'Change Control', icon: GitMerge, category: 'Quality Operations', hidden: !usesManufacturingQuality },
      { id: 'sop-library', label: 'SOP Library', icon: BookMarked, category: 'Quality Operations', hidden: !usesManufacturingQuality },
      { id: 'supplier-qualification', label: 'Supplier Qual', icon: PackageCheck, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      { id: 'gmp-inspection', label: 'GMP Inspection', icon: Factory, category: 'Quality Operations', hidden: isLogisticsProfile || !usesManufacturingQuality },
      // Training records are inspection evidence for a manufacturer — an
      // inspector asks for them. They stay in Administration for sectors that
      // don't run a quality system.
      { id: 'training-log', label: 'Training Records', icon: GraduationCap, category: usesManufacturingQuality ? 'Quality Operations' : 'Administration', hidden: !perms.canViewTraining },
      { id: 'training-simulation', label: 'Training Sim', icon: GraduationCap, category: usesManufacturingQuality ? 'Quality Operations' : 'Administration', hidden: !perms.canViewTrainingSimulation },

      // ── 3. Logistics Operations ──────────────────────────────────────
      { id: 'shipment-event-log',  label: 'Shipment Event Log',  icon: Truck,       category: 'Logistics Operations', hidden: !isLogisticsProfile },
      { id: 'contraband-rejection', label: 'Contraband Rejection', icon: PackageX,  category: 'Logistics Operations', hidden: !isLogisticsProfile },
      { id: 'cn-declarations',     label: 'CN22/CN23 Declarations', icon: ScrollText, category: 'Logistics Operations', hidden: !isLogisticsProfile },

      // ── 4. Controls & Frameworks ─────────────────────────────────────
      // Two parallel framework/control systems still exist in the schema
      // (grc_* and framework_*). Until they are merged they at least sit
      // together, so it is obvious they are the same job.
      { id: 'grc-dashboard', label: 'Control Posture', icon: BarChart3, category: 'Controls & Frameworks', hidden: !perms.canViewGrcDashboard },
      { id: 'framework-library', label: 'Framework Library', icon: Layers, category: 'Controls & Frameworks' },
      { id: 'grc-frameworks', label: 'GRC Frameworks', icon: ShieldCheck, category: 'Controls & Frameworks', hidden: !perms.canViewGrcFrameworks },
      { id: 'grc-controls', label: 'Controls', icon: ListChecks, category: 'Controls & Frameworks', hidden: !perms.canViewGrcControls },
      { id: 'control-monitoring', label: 'Control Health', icon: ClipboardCheck, category: 'Controls & Frameworks' },
      { id: 'grc-automation', label: 'Automated Testing', icon: Zap, category: 'Controls & Frameworks', hidden: !perms.canViewGrcAutomation },
      { id: 'obligations', label: 'Obligations', icon: Scale, category: 'Controls & Frameworks', hidden: !perms.canViewObligations },

      // ── 5. Risk ──────────────────────────────────────────────────────
      { id: 'risk-register', label: 'Risk Register', icon: ShieldAlert, category: 'Risk', hidden: !perms.canViewRiskRegister },
      { id: 'predictive-risk', label: 'Risk Modeling', icon: BrainCircuit, category: 'Risk', hidden: !perms.canViewPredictiveRisk },
      { id: 'compliance-alerting', label: 'Compliance Alerts', icon: Bell, category: 'Risk', hidden: !perms.canViewComplianceAlerts },
      { id: 'vendors', label: 'Vendors', icon: Building2, category: 'Risk', hidden: !perms.canViewVendors },
      { id: 'vendor-scorecard', label: 'Vendor Scorecard', icon: Building2, category: 'Risk', hidden: !perms.canViewVendorScorecard },
      { id: 'crisis-response', label: 'Crisis Response', icon: Siren, category: 'Risk', hidden: !perms.canViewCrisisResponse },
      { id: 'whistleblower', label: 'Internal Reports', icon: ShieldAlert, category: 'Risk', hidden: !perms.canViewWhistleblower },

      // ── 6. Regulatory ────────────────────────────────────────────────
      // License Vault holds the company's own NAFDAC licences, so it belongs
      // here — it was previously filed under vendor management.
      { id: 'license-vault', label: 'Licences & Permits', icon: FileKey, category: 'Regulatory', hidden: !perms.canViewLicenseVault },
      { id: 'products', label: 'Products', icon: Boxes, category: 'Regulatory', hidden: isLogisticsProfile },
      { id: 'regulatory-affairs', label: 'Regulatory Affairs', icon: FileSearch,  category: 'Regulatory', hidden: isLogisticsProfile },
      { id: 'son-compliance',     label: 'SON Compliance',     icon: Award,       category: 'Regulatory', hidden: isLogisticsProfile },
      { id: 'ctd-dossier',        label: 'CTD Dossier Tracker', icon: FileStack,  category: 'Regulatory', hidden: isLogisticsProfile },
      { id: 'horizon-scanning', label: 'Horizon Scan', icon: Radar, category: 'Regulatory', hidden: !perms.canViewHorizonScanning },
      { id: 'drift-monitor', label: 'Drift Monitor', icon: Radar, category: 'Regulatory', hidden: !perms.canViewDriftMonitor },
      { id: 'regulations', label: 'Regulations Ledger', icon: BookOpen, category: 'Regulatory' },
      { id: 'regulatory-library', label: 'Reg Library', icon: Library, category: 'Regulatory', hidden: !perms.canViewRegulatoryLibrary },

      // ── 7. Policies ──────────────────────────────────────────────────
      { id: 'policies', label: 'Policies', icon: Scale, category: 'Policies', hidden: !perms.canViewPolicies },
      { id: 'my-policies', label: 'My Policies', icon: ShieldCheck, category: 'Policies', hidden: !perms.canViewMyPolicies },
      { id: 'policy-assistant', label: 'Policy Assistant', icon: FileEdit, category: 'Policies' },

      // ── 8. Audit & Evidence ──────────────────────────────────────────
      { id: 'audit-trail', label: 'Audit Trail', icon: ShieldCheck, category: 'Audit & Evidence', hidden: !perms.canViewAuditTrail },
      { id: 'audit-sessions', label: 'Audit Workspace', icon: ClipboardCheck, category: 'Audit & Evidence', hidden: !perms.canViewAuditWorkspace },
      { id: 'audit-prep', label: 'AI Audit Prep', icon: Sparkles, category: 'Audit & Evidence', hidden: !perms.canViewAuditPrep },
      { id: 'governance-timeline', label: 'Governance Timeline', icon: History, category: 'Audit & Evidence', hidden: !perms.canViewGovernanceTimeline },
      { id: 'platform-evidence-ingestions', label: 'Evidence Ingestions', icon: FileStack, category: 'Audit & Evidence', hidden: !perms.canViewEvidenceIngestions },
      { id: 'legal-holds', label: 'Legal Holds', icon: Lock, category: 'Audit & Evidence', hidden: !perms.canViewLegalHold },
      { id: 'retention-policies', label: 'Data Retention', icon: Trash2, category: 'Audit & Evidence', hidden: !perms.canViewRetention },

      // ── 9. Content Compliance ────────────────────────────────────────
      { id: 'upload', label: 'Upload Content', icon: Upload, category: 'Content Compliance', hidden: !perms.canUpload },
      { id: 'legal-review', label: 'Legal Review', icon: Scale, category: 'Content Compliance', hidden: !perms.canViewLegalReview },
      { id: 'archive', label: 'Content Archive', icon: Archive, category: 'Content Compliance', hidden: !perms.canViewArchive },
      { id: 'content-calendar', label: 'Content Calendar', icon: CalendarDays, category: 'Content Compliance', hidden: !perms.canUpload },
      { id: 'content-blocks', label: 'Content Blocks', icon: Blocks, category: 'Content Compliance', hidden: !perms.canViewContentBlocks },
      { id: 'channel-rules', label: 'Channel Rules', icon: Layers, category: 'Content Compliance', hidden: !perms.canViewChannelRules },
      { id: 'claim-extraction', label: 'Claim NLP', icon: FileSearch, category: 'Content Compliance', hidden: !perms.canViewClaimExtraction },
      { id: 'translation-compliance', label: 'Translation', icon: Languages, category: 'Content Compliance', hidden: !perms.canViewTranslationCompliance },
      { id: 'agency-portal', label: 'Agency Portal', icon: Briefcase, category: 'Content Compliance', hidden: !perms.canViewAgencyPortal },
      { id: 'consent-management', label: 'Consent Mgmt', icon: UserCheck, category: 'Content Compliance', hidden: !perms.canViewConsentManagement },
      { id: 'social-listening', label: 'Social Listening', icon: Radio, category: 'Content Compliance', hidden: !perms.canViewSocialListening },
      { id: 'website-monitoring', label: 'Web Monitoring', icon: Globe, category: 'Content Compliance', hidden: !perms.canViewWebsiteMonitoring },
      { id: 'programmatic-ad', label: 'Ad Compliance', icon: MonitorDot, category: 'Content Compliance', hidden: !perms.canViewProgrammaticAd },

      // ── 10. AI Governance — governing your AI, not AI helping you ────
      { id: 'ai-dashboard', label: 'AI Dashboard', icon: LayoutDashboard, category: 'AI Governance', hidden: !perms.canViewAIDashboard },
      { id: 'ai-assets', label: 'AI Systems Register', icon: BrainCircuit, category: 'AI Governance', hidden: !perms.canViewAIGovernance },
      { id: 'ai-usage', label: 'AI Usage', icon: Activity, category: 'AI Governance', hidden: !perms.canViewAIUsage },
      { id: 'ai-reviews', label: 'AI Reviews', icon: ShieldCheck, category: 'AI Governance', hidden: !perms.canViewAIReviews },
      { id: 'ai-prompts', label: 'AI Prompts', icon: FileEdit, category: 'AI Governance', hidden: !perms.canViewAIPrompts },
      { id: 'ai-incidents', label: 'AI Incidents', icon: ShieldAlert, category: 'AI Governance', hidden: !perms.canViewAIIncidents },

      // ── 11. Administration ───────────────────────────────────────────
      { id: 'billing', label: 'Billing & Plan', icon: CreditCard, category: 'Administration', hidden: !perms.canViewBilling },
      //  CF-02. The gate is the UNION of the sections' own existing
      //  checks — never a permission of its own — so this entry appears
      //  exactly when there is something behind it. See
      //  lib/navigation/settingsSections.ts.
      { id: 'settings-home', label: 'Settings', icon: SettingsIcon, category: 'Administration',
        hidden: !mayOpenSettingsHome(perms, profile as never) },
      { id: 'company-settings', label: 'Company Settings', icon: Building2, category: 'Administration', hidden: !perms.canManageRoles },
      { id: 'company-members', label: 'Members', icon: User, category: 'Administration', hidden: !perms.canViewMembers },
      { id: 'company-invites', label: 'Invites', icon: User, category: 'Administration', hidden: !perms.canInvite },
      { id: 'company-departments', label: 'Departments', icon: User, category: 'Administration', hidden: !perms.canInvite },
      { id: 'role-management', label: 'Role Management', icon: KeyRound, category: 'Administration', hidden: !perms.canManageRoles },
      //  W2·0. Deliberately NOT hidden behind canManageRoles: the roles
      //  matrix answers "who may do what, and what am I allowed to do",
      //  which is a question everybody on a GMP system has. Only acting
      //  on a request needs the permission, and the page gates that
      //  itself rather than hiding the whole screen.
      { id: 'access-control', label: 'Roles & Access', icon: ShieldCheck, category: 'Administration' },
      { id: 'org-management', label: 'Org Management', icon: Building2, category: 'Administration', hidden: !profile?.organization_id || !perms.canManageRoles },
      { id: 'identity-providers', label: 'Single Sign-On', icon: Fingerprint, category: 'Administration', hidden: !perms.canViewIdentity },
      { id: 'integrations', label: 'Integrations', icon: Plug, category: 'Administration', hidden: !perms.canViewIntegrations },
      { id: 'pharma-integrations', label: 'Pharma Integrations', icon: FlaskConical, category: 'Administration', hidden: !perms.canViewPharmaIntegrations },
      { id: 'platform-webhooks', label: 'Outbound Webhooks', icon: Radio, category: 'Administration', hidden: !perms.canViewWebhooks },
      { id: 'platform-jobs', label: 'Platform Jobs', icon: Activity, category: 'Administration', hidden: !perms.canViewPlatformJobs },
      { id: 'platform-ecosystem', label: 'Partner Ecosystem', icon: Network, category: 'Administration', hidden: !perms.canViewEcosystem },
      { id: 'secret-vault', label: 'Secret Vault', icon: FileKey, category: 'Administration', hidden: !perms.canManageRoles && profile?.role !== 'admin' },
      { id: 'partner-verification', label: 'Partner Verification', icon: ShieldCheck, category: 'Administration', hidden: !perms.canManageRoles },

      // ── Hidden / external ────────────────────────────────────────────
      { id: 'correction-editor', label: 'Correction Editor', icon: Scale, category: 'Hidden', hidden: true },
      { id: 'legal-marketplace', label: 'Legal Marketplace', icon: Building2, category: 'External Partners', hidden: profile?.role === 'legal_partner' },
      { id: 'legal-partner-dashboard', label: 'Partner Console', icon: LayoutDashboard, category: 'External Partners', hidden: profile?.role !== 'legal_partner' },
    ];

  //  HS-02's grouping, applied AFTER the list above rather than written
  //  into it. Every `hidden` test has already run, so an item the person
  //  may not see never reaches this and no permission is widened by it.
  //
  //  Each item takes its destination's group, order and words. A page
  //  that belongs INSIDE another one — CoA inside Batch Release, CAPA
  //  inside Deviation / CAPA, every Settings section inside Settings —
  //  is marked `parent` here and drawn nested below its host further
  //  down, rather than being given a rail entry of its own.
  //
  //  `category: 'Hidden'` is kept for the one page that carries it
  //  (`correction-editor`), and a standalone page gets the same
  //  treatment: reachable by its own route, absent from the rail by
  //  statement rather than by omission.
  const regrouped = navItems.map((item) => {
    const dest = DESTINATIONS[item.id];
    if (!dest || item.category === 'Hidden') {
      return { ...item, category: 'Hidden', order: 99, parent: null as PageId | null };
    }
    switch (dest.kind) {
      case 'rail':
      case 'pendingDesign':
      case 'review':
        return {
          ...item, category: dest.group as string, label: dest.label,
          order: dest.order, parent: null as PageId | null,
        };
      //  A record page is reached from its list, never from the rail.
      //  It keeps its route and drops out of the sidebar entirely.
      case 'detail':
        return { ...item, category: 'Hidden', order: 99, parent: null as PageId | null };
      case 'hosted': {
        //  The group is the host's, so an orphaned child (host hidden
        //  by a permission the child does not need) can still be drawn
        //  in the right place instead of vanishing.
        const rail = railEntryFor(item.id);
        const railDest = rail ? DESTINATIONS[rail] : undefined;
        const group =
          railDest && (railDest.kind === 'rail' || railDest.kind === 'pendingDesign' || railDest.kind === 'review')
            ? (railDest.group as string)
            : 'Hidden';
        return {
          ...item,
          category: group,
          label: dest.label ?? item.label,
          //  Sorts after every rail entry in the group; the renderer
          //  pulls these out and draws them under their host anyway.
          order: BEYOND_DESIGN + 90,
          parent: dest.host as PageId | null,
        };
      }
      case 'standalone':
      default:
        return { ...item, category: 'Hidden', order: 99, parent: null as PageId | null };
    }
  });

  //  PM-03 APPLIED TO THE RAIL. Until now nothing in this file consulted
  //  the role a person actually holds: canonicalRole() in permissions.ts
  //  folds every job into six legacy buckets and knows none of the eight
  //  roles the design tabulates, so a Storekeeper and a QA Manager saw
  //  the same sidebar. This is where that stops.
  //
  //  Applied ONLY when a work role resolves. The design says what each
  //  of its eight roles may open; it does not say what somebody with no
  //  job assigned in this workspace sees, and withholding every
  //  tabulated section from them on that silence would empty the rail
  //  for every account created before company_role was being set. That
  //  gap is recorded rather than decided here — see roleAccess.ts.
  //  WHERE PM-03 GOVERNS A PAGE, PM-03 DECIDES — AND THE LEGACY MODEL
  //  DOES NOT GET A SECOND VOTE.
  //
  //  This was not a theoretical conflict. Rendering the shell as each of
  //  the eight roles showed Deviation / CAPA missing from ALL of them,
  //  including QA Manager, who the design gives Act on it. The cause is
  //  `!perms.canViewCapaManagement`: permissions.ts resolves a job title
  //  through canonicalRole(), which knows none of PM-03's roles, so a
  //  qa_manager falls through to the empty permission set and the item
  //  is hidden by a model that has never heard of the role asking.
  //
  //  AND-ing the two models together can only ever subtract, so the
  //  design could never grant anything the legacy model had not already
  //  allowed. For a governed page the grid is therefore the sole
  //  authority on ROLE.
  //
  //  The INDUSTRY gate is kept, because it answers a different question
  //  — whether this workspace does manufacturing at all — and PM-03 says
  //  nothing about it. A logistics or finance workspace still has no
  //  batch to release, whoever is asking.
  //  THE SET, NOT THE SOLE ROLE. 20261119000000 lets one person hold
  //  several operational roles, and resolveWorkRole answers NULL for
  //  anybody who does — which here meant the PM-03 branch was skipped
  //  for exactly those people and the legacy model got the second vote
  //  the comment above says it must not have. Found by auditing the
  //  callers after the model changed, not by a failing test.
  const workRoles = resolveWorkRoles(profile);
  const hasWorkRole = workRoles.length > 0;
  const industryAllowsQuality = usesManufacturingQuality && !isLogisticsProfile;
  const visibleNavItems = regrouped.filter((item) => {
    if (item.category === 'Hidden') return false;
    if (hasWorkRole && PAGE_SECTION[item.id]) {
      return industryAllowsQuality && pageOpenableBy(workRoles, item.id);
    }
    if (item.hidden) return false;
    if (hasWorkRole && !pageOpenableBy(workRoles, item.id)) return false;
    return true;
  });

  //  "Head of Quality", from ONB-01. An underscored permission role is
  //  the fallback and is tidied on the way out, so `content_creator`
  //  reads as "Content Creator" rather than as a database value.
  const jobTitleLabel = ((profile as any)?.job_title as string | undefined)?.trim()
    || (profile?.role ?? '').replace(/_/g, ' ');

  // Auditor portal mode: show only Audit Workspace
  const isAuditorPortal = (profile as any)?.role === 'auditor';
  const displayNavItems = isAuditorPortal
    ? visibleNavItems.filter(item => item.id === 'audit-sessions' || item.id === 'audit-session-detail')
    : visibleNavItems;
  const categories = [...new Set(displayNavItems.map(item => item.category))]
    .sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));


  return (
    <div className="min-h-screen flex font-sans bg-[var(--color-bg)] text-[var(--color-text-primary)]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR AREA */}
      {/*  ONB-08 draws the navigation on dark navy beside a cream
          content area, and the two together are what make the screen
          recognisable. Rather than rewrite forty utility classes, the
          --color-* tokens they already read are REDEFINED on this
          container, so everything inside inherits the navy palette and
          nothing outside it changes. The classes stay exactly as they
          were; only the values they resolve to differ in here.  */}
      <div
        style={{
          '--color-surface': 'var(--nv-surface-raised)',
          '--color-surface-alt': 'var(--nv-surface-hover)',
          '--color-border': 'var(--nv-border-default)',
          '--color-border-hover': 'var(--nv-border-strong)',
          '--color-text-primary': 'var(--nv-text-primary)',
          '--color-text-secondary': 'var(--nv-text-secondary)',
          '--color-text-tertiary': 'var(--nv-text-tertiary)',
          '--color-accent': 'var(--nv-action-primary-bg)',
          '--color-card-shadow': 'none',
          '--color-card-shadow-hover': 'none',
          background: '#101931',
        } as CSSProperties}
        className={`
        fixed lg:sticky top-0 z-50 lg:z-auto
        w-[260px] flex-shrink-0 flex flex-col h-screen p-4 pr-0 gap-4
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Brand */}
        {/*  THE WORDMARK, not a shield beside the word "Criateur". The
            brand kit's on-dark artwork is the mark this product signs
            everything else with — the splash, the sign-in panel, every
            onboarding step — and the sidebar was the one place still
            drawing a generic icon and setting the name in a system
            font. Same asset as those screens, so they cannot drift.  */}
        <div className="h-16 flex items-center px-2 shrink-0">
          <img
            src={appUrl('/criateur-logo-ondark.svg')}
            alt="Criateur"
            className="h-7 w-auto"
          />
          {/* Close sidebar on mobile */}
          <button
            className="lg:hidden ml-auto p-1 rounded-lg hover:dash-surface-alt transition-colors dash-text-tertiary"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Categories - Each in its own card */}
        <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-4 scrollbar-hide">
          {categories.map(category => {
            const inGroup = displayNavItems.filter(item => item.category === category);

            //  A hosted page whose HOST is not visible is promoted to a
            //  top-level entry in the same group. Without this, a
            //  permission that hides the host would silently take the
            //  child with it — which is how pages got lost before.
            const visibleIds = new Set(inGroup.map(i => i.id));
            const topLevel = inGroup
              .filter(i => !i.parent || !visibleIds.has(i.parent))
              .sort((a, b) => a.order - b.order);
            if (topLevel.length === 0) return null;

            const childrenOf = (id: string) => inGroup.filter(i => i.parent === id);

            //  HS-02's groups are not cards and do not collapse: a green
            //  label, the items under it, no panel, no border, no
            //  chevron. Every group is now one of the design's, so every
            //  group is drawn that way — the card-with-a-chevron variant
            //  existed only for "More", which no longer exists.

            return (
              <div key={category} className="space-y-1">
                <h4 className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 mb-1 text-left"
                    style={{ color: 'var(--color-accent)' }}>
                  {category}
                </h4>
                {topLevel.map((item, i) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  const kids = childrenOf(item.id);
                  const holdsChild = kids.some(k => k.id === currentPage);
                  const open = expandedHosts.includes(item.id) || holdsChild;

                  //  The rule between what the design names and what we
                  //  added to its groups. Drawn above the FIRST item past
                  //  the mark, and only when the design's own items
                  //  precede it — a group that is entirely ours gets no
                  //  rule.
                  const opensExtras = item.order >= BEYOND_DESIGN
                    && i > 0 && topLevel[i - 1]!.order < BEYOND_DESIGN;

                  return (
                    <Fragment key={item.id}>
                    {opensExtras && (
                      <div className="mx-3 my-1.5 border-t dash-border" aria-hidden />
                    )}
                    <div className="flex items-stretch gap-1">
                      <button
                        onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                        className={`flex-1 min-w-0 flex items-center gap-3 px-3 py-2 rounded-xl transition-all group ${isActive
                          ? 'text-white shadow-md'
                          : 'text-[var(--color-text-secondary)] hover:dash-surface-alt hover:text-[var(--color-text-primary)]'
                          }`}
                        style={isActive ? { background: 'var(--color-accent)' } : undefined}
                      >
                        <Icon
                          size={20}
                          strokeWidth={1.5}
                          className={`flex-shrink-0 ${isActive ? 'text-white' : 'dash-text-tertiary group-hover:text-[var(--color-text-primary)]'}`}
                        />
                        {/*  No tracking-wide, and 13px: at 14px with extra
                             letter-spacing "Registrations & Licences" ran
                             past the rail and truncated to
                             "Registrations & Licenc…". The design fits it
                             on one line, so the label does too. */}
                        <span className="font-medium text-[13px] truncate" title={item.label}>{item.label}</span>
                      </button>
                      {kids.length > 0 && (
                        <button
                          onClick={() => toggleHost(item.id)}
                          aria-expanded={open}
                          aria-label={`${open ? 'Hide' : 'Show'} ${item.label} sections`}
                          className="shrink-0 px-2 rounded-xl flex items-center justify-center min-w-[32px] dash-text-tertiary hover:dash-surface-alt transition-colors"
                        >
                          <span className="text-[10px] font-semibold tabular-nums mr-1">{kids.length}</span>
                          {open ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
                        </button>
                      )}
                    </div>
                    {open && kids.length > 0 && (
                      <div className="ml-4 pl-3 border-l dash-border space-y-0.5">
                        {kids.map(kid => {
                          const KidIcon = kid.icon;
                          const kidActive = currentPage === kid.id;
                          return (
                            <button
                              key={kid.id}
                              onClick={() => { onNavigate(kid.id); setSidebarOpen(false); }}
                              className={`w-full flex items-center gap-2.5 px-3 py-1.5 min-h-[32px] rounded-lg transition-all group ${kidActive
                                ? 'text-white shadow-sm'
                                : 'text-[var(--color-text-secondary)] hover:dash-surface-alt hover:text-[var(--color-text-primary)]'
                                }`}
                              style={kidActive ? { background: 'var(--color-accent)' } : undefined}
                            >
                              <KidIcon
                                size={16}
                                strokeWidth={1.5}
                                className={`flex-shrink-0 ${kidActive ? 'text-white' : 'dash-text-tertiary group-hover:text-[var(--color-text-primary)]'}`}
                              />
                              <span className="font-medium text-[12.5px] truncate" title={kid.label}>{kid.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    </Fragment>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Trial countdown banner */}
        {isTrialing && daysRemaining !== null && daysRemaining <= 7 && (
          <div
            className="rounded-2xl border px-4 py-3 shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
            style={{ borderColor: 'var(--color-accent)', background: 'var(--color-accent-soft)' }}
            onClick={() => onNavigate('billing')}
          >
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-3.5 h-3.5 text-[var(--color-accent)] flex-shrink-0" />
              <p className="text-xs font-bold text-[var(--color-accent)]">
                Trial: {daysRemaining} day{daysRemaining === 1 ? '' : 's'} left
              </p>
            </div>
            <p className="text-[10px] text-[var(--color-text-secondary)] leading-snug">
              Upgrade to keep your data &amp; access.
            </p>
          </div>
        )}

        {/*  ONB-08 ends the rail with a rule and two plain items, not a
             card. */}
        <div className="border-t dash-border mx-3 mb-2 shrink-0" aria-hidden />
        <div className="p-2 shrink-0 flex flex-col gap-1 mb-4">
          <button
            onClick={() => { onNavigate('profile'); setTimeout(() => window.dispatchEvent(new CustomEvent('profile-tab', { detail: { tab: 'security' } })), 50); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--color-text-secondary)] hover:dash-surface-alt hover:text-[var(--color-text-primary)] transition-colors group"
          >
            <KeyRound size={20} strokeWidth={1.5} className="flex-shrink-0 dash-text-tertiary group-hover:text-[var(--color-text-primary)]" />
            {/*  "Settings", as ONB-08 labels it. It opens the personal
                 security tab. It was renamed to "My Account" to keep it
                 apart from the company-wide page under Administration,
                 but that page reads "Company Settings" in full, so the
                 two were never actually ambiguous — and the design's
                 word is the one people scan for. */}
            <span className="font-medium text-[13px]">Settings</span>
          </button>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors group"
          >
            <LogOut size={20} strokeWidth={1.5} className="flex-shrink-0" />
            <span className="font-medium text-[13px]">Log Out</span>
          </button>
        </div>
      </div>

      {/* MAIN CONTENT SHELL — left margin on lg+ to account for sticky sidebar */}
      <div className="flex-1 flex flex-col min-w-0 h-screen bg-[var(--color-bg)] overflow-visible lg:ml-0 ml-0">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-8 flex-shrink-0 gap-4 overflow-visible relative z-40">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              className="lg:hidden p-2 rounded-xl hover:dash-surface-alt transition-colors dash-text-secondary"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <OfflineBadge />
          </div>

          {/*  Global search: REMOVED, ON THE DESIGN'S OWN INSTRUCTION.
                 HS-01 row 2 of the dead-end register: the field took
                 typing and did nothing, in the old product and here —
                 no value, no onChange, no handler. The register's
                 decision is "number lookup only … if it isn't ready,
                 remove the field", and it is not ready: a lookup across
                 lots, batches, deviations, certificates and licences is
                 its own piece of work.

                 A search box that silently discards what somebody types
                 is worse than no search box, because they believe they
                 have searched. Restoring it means building the lookup,
                 not re-adding the input. */}
          <div className="flex-1" />

          {/* Right Action Items */}
          <div className="flex items-center gap-3 shrink-0 overflow-visible">
            {/* Wrapper for the NotificationBell to apply correct icon colors if needed, but it works standalone */}
            <div className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors overflow-visible">
              <NotificationBell />
            </div>

            <div className="relative group">
              <button className="flex items-center gap-3 p-1 rounded-xl hover:dash-surface-alt transition-all cursor-pointer border border-transparent hover:border-[var(--color-border)] group/profile">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-bold dash-text">{profile?.full_name}</span>
                  {/*  THE JOB TITLE, not the permission role. ONB-01 asks
                      for "Head of Quality" and the design shows it; this
                      showed `content_creator` — a raw enum from the
                      permission system, naming a job nobody in a GMP
                      workspace holds. Falls back to the role only when
                      no title was given, so the line is never empty.  */}
                  <span className="text-[9px] dash-text-tertiary uppercase tracking-widest font-bold">
                    {jobTitleLabel}
                  </span>
                </div>
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm shadow-md overflow-hidden" style={{ background: 'var(--color-accent)' }}>
                  {(profile as any)?.avatar_url ? (
                    <img
                      src={(profile as any).avatar_url}
                      alt={profile?.full_name || 'Profile avatar'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>
                      {(profile?.full_name ?? 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  )}
                </div>
                <ChevronDown className="w-3.5 h-3.5 dash-text-tertiary group-hover:text-[var(--color-text-primary)] transition-colors" />
              </button>

              {/* Dropdown Menu */}
              <div
                className="absolute top-full right-0 mt-2 w-56 bg-[var(--color-surface)] rounded-xl shadow-xl shadow-black/40 border dash-border py-2
                 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 transform origin-top-right group-hover:scale-100 scale-95"
              >
                <div className="px-4 py-2 border-b dash-border mb-2 block md:hidden">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{profile?.full_name}</p>
                  <p className="text-xs dash-text-tertiary truncate">{profile?.role}</p>
                </div>
                <button
                  onClick={() => onNavigate('profile')}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-sm dash-text hover:dash-surface-alt transition-colors"
                >
                  <User className="w-4 h-4 dash-text-tertiary" />
                  <span>Profile</span>
                </button>
                <button
                  onClick={() => { onNavigate('profile'); setTimeout(() => window.dispatchEvent(new CustomEvent('profile-tab', { detail: { tab: 'security' } })), 50); }}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-sm dash-text hover:dash-surface-alt transition-colors"
                >
                  <KeyRound className="w-4 h-4 dash-text-tertiary" />
                  <span>Security</span>
                </button>
                <button
                  onClick={() => { onNavigate('profile'); setTimeout(() => window.dispatchEvent(new CustomEvent('profile-tab', { detail: { tab: 'notifications' } })), 50); }}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-sm dash-text hover:dash-surface-alt transition-colors"
                >
                  <Bell className="w-4 h-4 dash-text-tertiary" />
                  <span>Notifications</span>
                </button>
                <button
                  onClick={() => { onNavigate('profile'); setTimeout(() => window.dispatchEvent(new CustomEvent('profile-tab', { detail: { tab: 'support' } })), 50); }}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-sm dash-text hover:dash-surface-alt transition-colors"
                >
                  <LifeBuoy className="w-4 h-4 dash-text-tertiary" />
                  <span>Support</span>
                </button>
                <div className="border-t dash-border my-2" />
                <button
                  onClick={() => signOut()}
                  className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main id="main-scroll-container" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pt-2">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {toastParams && (
        <Toast
          message={toastParams.message}
          type={toastParams.type}
          onClose={() => setToastParams(null)}
          duration={8000}
        />
      )}
    </div>
  );
}

