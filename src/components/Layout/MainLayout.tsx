import { getPermissions } from '../../lib/permissions';
import { ReactNode, useEffect, useState } from 'react';
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
  Search,
  FileEdit,
  ListChecks,
  ClipboardCheck,
  Fingerprint,
  Menu,
  X,
  CreditCard,
} from 'lucide-react';
import { usePlan } from '../../hooks/usePlan';

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
  | 'dashboard';

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

export default function MainLayout({
  children,
  currentPage,
  onNavigate,
}: MainLayoutProps) {
  const { signOut, profile } = useAuth();
  const { plan, isTrialing, daysRemaining } = usePlan();
  const [toastParams, setToastParams] = useState<{ message: string; type?: 'success' | 'warning' } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const perms = getPermissions({
    profileRole: profile?.role,
    customPermissions: (profile as any)?.customPermissions,
    moduleAccess: (profile as any)?.module_access,
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
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, category: 'Overview' },
      { id: 'content-calendar', label: 'Content Calendar', icon: CalendarDays, category: 'Overview', hidden: false },
      { id: 'team-chat', label: 'Team Chat', icon: MessageSquare, category: 'Overview', hidden: false },
      { id: 'ai-insights', label: 'AI Insights', icon: Sparkles, category: 'Overview', hidden: false },
      { id: 'compliance-reporting', label: 'Compliance Report', icon: Activity, category: 'Overview', hidden: !perms.canViewComplianceReporting },

      { id: 'upload', label: 'Upload Content', icon: Upload, category: 'Content & Marketing', hidden: !perms.canUpload },
      { id: 'content-blocks', label: 'Content Blocks', icon: Blocks, category: 'Content & Marketing', hidden: !perms.canViewContentBlocks },
      { id: 'archive', label: 'Content Archive', icon: Archive, category: 'Content & Marketing', hidden: !perms.canViewArchive },
      { id: 'agency-portal', label: 'Agency Portal', icon: Briefcase, category: 'Content & Marketing', hidden: !perms.canViewAgencyPortal },
      { id: 'translation-compliance', label: 'Translation', icon: Languages, category: 'Content & Marketing', hidden: !perms.canViewTranslationCompliance },

      { id: 'legal-review', label: 'Legal Review', icon: Scale, category: 'Legal & Review', hidden: !perms.canViewLegalReview },
      { id: 'regulations', label: 'Regulations Ledger', icon: BookOpen, category: 'Legal & Review' },
      { id: 'regulatory-library', label: 'Reg Library', icon: Library, category: 'Legal & Review', hidden: !perms.canViewRegulatoryLibrary },
      { id: 'consent-management', label: 'Consent Mgmt', icon: UserCheck, category: 'Legal & Review', hidden: !perms.canViewConsentManagement },
      { id: 'channel-rules', label: 'Channel Rules', icon: Layers, category: 'Legal & Review', hidden: !perms.canViewChannelRules },
      { id: 'claim-extraction', label: 'Claim NLP', icon: FileSearch, category: 'Legal & Review', hidden: !perms.canViewClaimExtraction },
      { id: 'policy-assistant', label: 'Policy Assistant', icon: FileEdit, category: 'Legal & Review' },
      { id: 'grc-dashboard', label: 'GRC Posture', icon: BarChart3, category: 'Legal & Review', hidden: !perms.canViewGrcDashboard },
      { id: 'grc-frameworks', label: 'GRC Frameworks', icon: ShieldCheck, category: 'Legal & Review', hidden: !perms.canViewGrcFrameworks },
      { id: 'grc-controls', label: 'GRC Controls', icon: ListChecks, category: 'Legal & Review', hidden: !perms.canViewGrcControls },
      { id: 'grc-automation', label: 'Automation', icon: Zap, category: 'Legal & Review', hidden: !perms.canViewGrcAutomation },
      { id: 'command-center', label: 'Command Center', icon: LayoutDashboard, category: 'Governance', hidden: !perms.canViewAuditTrail },
      { id: 'risk-register', label: 'Risk Register', icon: ShieldAlert, category: 'Governance', hidden: !perms.canViewGrcFrameworks },
      { id: 'obligations', label: 'Obligations', icon: Scale, category: 'Governance', hidden: !perms.canViewGrcFrameworks },
      { id: 'identity-providers', label: 'Identity & SSO', icon: Fingerprint, category: 'Governance', hidden: !perms.canViewIdentity },
      { id: 'retention-policies', label: 'Data Retention', icon: CalendarDays, category: 'Governance', hidden: !perms.canViewRetention },
      { id: 'legal-holds', label: 'Legal Holds', icon: ShieldAlert, category: 'Governance', hidden: !perms.canViewLegalHold },
      { id: 'governance-timeline', label: 'Gov Timeline', icon: Activity, category: 'Governance', hidden: !perms.canViewGovernanceTimeline },
      { id: 'ai-dashboard', label: 'AI Dashboard', icon: LayoutDashboard, category: 'AI Governance', hidden: !perms.canViewAIDashboard },
      { id: 'ai-assets', label: 'AI Assets', icon: BrainCircuit, category: 'AI Governance', hidden: !perms.canViewAIGovernance },
      { id: 'ai-usage', label: 'AI Usage', icon: Activity, category: 'AI Governance', hidden: !perms.canViewAIUsage },
      { id: 'ai-reviews', label: 'AI Reviews', icon: ShieldCheck, category: 'AI Governance', hidden: !perms.canViewAIReviews },
      { id: 'ai-prompts', label: 'AI Prompts', icon: FileEdit, category: 'AI Governance', hidden: !perms.canViewAIPrompts },
      { id: 'ai-incidents', label: 'AI Incidents', icon: ShieldAlert, category: 'AI Governance', hidden: !perms.canViewAIIncidents },
      { id: 'policies', label: 'Policies', icon: Scale, category: 'Legal & Review', hidden: !perms.canViewPolicies },
      { id: 'my-policies', label: 'My Policies', icon: ShieldCheck, category: 'Legal & Review', hidden: !perms.canViewMyPolicies },
      { id: 'vendors', label: 'Vendors', icon: Building2, category: 'Legal & Review', hidden: !perms.canViewVendors },
      { id: 'audit-sessions', label: 'Audit Workspace', icon: ClipboardCheck, category: 'Legal & Review', hidden: !perms.canViewAuditWorkspace },

      { id: 'drift-monitor', label: 'Drift Monitor', icon: Radar, category: 'Monitoring & Risk', hidden: !perms.canViewDriftMonitor },
      { id: 'horizon-scanning', label: 'Horizon Scan', icon: Radar, category: 'Monitoring & Risk', hidden: !perms.canViewHorizonScanning },
      { id: 'crisis-response', label: 'Crisis Response', icon: Siren, category: 'Monitoring & Risk', hidden: !perms.canViewCrisisResponse },
      { id: 'programmatic-ad', label: 'Ad Compliance', icon: MonitorDot, category: 'Monitoring & Risk', hidden: !perms.canViewProgrammaticAd },
      { id: 'whistleblower', label: 'Internal Reports', icon: ShieldAlert, category: 'Monitoring & Risk', hidden: !perms.canViewWhistleblower },
      { id: 'predictive-risk', label: 'Risk Modeling', icon: BrainCircuit, category: 'Monitoring & Risk', hidden: !perms.canViewPredictiveRisk },
      { id: 'social-listening', label: 'Social Listening', icon: Radio, category: 'Monitoring & Risk', hidden: !perms.canViewSocialListening },
      { id: 'website-monitoring', label: 'Web Monitoring', icon: Globe, category: 'Monitoring & Risk', hidden: !perms.canViewWebsiteMonitoring },
      { id: 'vendor-scorecard', label: 'Vendor Scorecard', icon: Building2, category: 'Monitoring & Risk', hidden: !perms.canViewVendorScorecard },
      { id: 'capa-management', label: 'CAPA', icon: ClipboardList, category: 'Monitoring & Risk', hidden: !perms.canViewCapaManagement },

      { id: 'billing', label: 'Billing & Plan', icon: CreditCard, category: 'Administration', hidden: !perms.canViewMembers },
      { id: 'company-settings', label: 'Company Settings', icon: Building2, category: 'Administration', hidden: !perms.canViewMembers },
      { id: 'company-members', label: 'Members', icon: User, category: 'Administration', hidden: !perms.canViewMembers },
      { id: 'company-invites', label: 'Invites', icon: User, category: 'Administration', hidden: !perms.canInvite },
      { id: 'company-departments', label: 'Departments', icon: User, category: 'Administration', hidden: !perms.canInvite },
      { id: 'license-vault', label: 'License Vault', icon: FileKey, category: 'Administration', hidden: !perms.canViewLicenseVault },
      { id: 'integrations', label: 'Integrations', icon: Plug, category: 'Administration', hidden: !perms.canViewLicenseVault },
      { id: 'audit-trail', label: 'Audit Trail', icon: ShieldCheck, category: 'Administration', hidden: !perms.canViewAuditTrail },
      { id: 'secret-vault', label: 'Secret Vault', icon: FileKey, category: 'Administration', hidden: !perms.canManageRoles && profile?.role !== 'admin' },
      { id: 'role-management', label: 'Role Management', icon: KeyRound, category: 'Administration', hidden: !perms.canManageRoles },
      { id: 'org-management', label: 'Org Management', icon: Building2, category: 'Administration', hidden: !profile?.organization_id || !perms.canManageRoles },
      { id: 'training-log', label: 'Training Log', icon: GraduationCap, category: 'Administration', hidden: !perms.canViewTraining },
      { id: 'training-simulation', label: 'Training Sim', icon: GraduationCap, category: 'Administration', hidden: !perms.canViewTrainingSimulation },
      { id: 'platform-jobs', label: 'Platform Jobs', icon: Activity, category: 'Administration', hidden: !perms.canViewPlatformJobs },
      { id: 'platform-webhooks', label: 'Outbound Webhooks', icon: Radio, category: 'Administration', hidden: !perms.canViewWebhooks },

      { id: 'correction-editor', label: 'Correction Editor', icon: Scale, category: 'Hidden', hidden: true },
      { id: 'legal-marketplace', label: 'Legal Marketplace', icon: Building2, category: 'External Partners', hidden: profile?.role === 'legal_partner' },
      { id: 'legal-partner-dashboard', label: 'Partner Console', icon: LayoutDashboard, category: 'External Partners', hidden: profile?.role !== 'legal_partner' },
      { id: 'partner-verification', label: 'Partner Verification', icon: ShieldCheck, category: 'Administration', hidden: !perms.canManageRoles },
    ];

  const visibleNavItems = navItems.filter((item) => !item.hidden);

  // Auditor portal mode: show only Audit Workspace
  const isAuditorPortal = (profile as any)?.role === 'auditor';
  const displayNavItems = isAuditorPortal
    ? visibleNavItems.filter(item => item.id === 'audit-sessions' || item.id === 'audit-session-detail')
    : visibleNavItems;
  const categories = [...new Set(displayNavItems.map(item => item.category))];

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
      <div className={`
        fixed lg:sticky top-0 z-50 lg:z-auto
        w-[260px] flex-shrink-0 flex flex-col h-screen p-4 pr-0 gap-4
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Brand Card */}
        <div className="h-16 dash-card border dash-border rounded-2xl flex items-center px-4 shrink-0 shadow-sm">
          <div className="p-1.5 rounded-lg mr-3 shadow-md" style={{ background: 'var(--color-accent)' }}>
            <ShieldCheck size={20} strokeWidth={1.5} className="text-white" />
          </div>
          <div className="flex-1">
            <span className="font-bold text-lg text-[var(--color-text-primary)] tracking-tight leading-none block">Criateur</span>
            <span className="text-[10px] block text-[var(--color-text-tertiary)] uppercase tracking-wider font-semibold">Compliance</span>
          </div>
          {/* Close sidebar on mobile */}
          <button
            className="lg:hidden p-1 rounded-lg hover:dash-surface-alt transition-colors dash-text-tertiary"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Categories - Each in its own card */}
        <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-4 scrollbar-hide">
          {categories.map(category => {
            const items = displayNavItems.filter(item => item.category === category);
            if (items.length === 0) return null;

            return (
              <div key={category} className="dash-card border dash-border rounded-2xl p-2.5 shadow-sm space-y-1">
                <h4 className="px-3 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-2 text-left">{category}</h4>
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all group ${isActive
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
                      <span className="font-medium text-sm tracking-wide truncate" title={item.label}>{item.label}</span>
                    </button>
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

        {/* Settings & Logout Card */}
        <div className="dash-card border dash-border rounded-2xl p-2 shrink-0 shadow-sm flex flex-col gap-1 mb-4">
          <button
            onClick={() => { onNavigate('profile'); setTimeout(() => window.dispatchEvent(new CustomEvent('profile-tab', { detail: { tab: 'security' } })), 50); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--color-text-secondary)] hover:dash-surface-alt hover:text-[var(--color-text-primary)] transition-colors group"
          >
            <KeyRound size={20} strokeWidth={1.5} className="flex-shrink-0 dash-text-tertiary group-hover:text-[var(--color-text-primary)]" />
            <span className="font-medium tracking-wide">Settings</span>
          </button>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors group"
          >
            <LogOut size={20} strokeWidth={1.5} className="flex-shrink-0" />
            <span className="font-medium tracking-wide">Log Out</span>
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

          {/* Global Search Bar */}
          <div className="flex-1 max-w-xl">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary transition-colors" />
              <input
                type="text"
                placeholder="Search documents, updates, regulations..."
                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 transition-all shadow-sm"
                style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-focus-within:opacity-100 transition-opacity">
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-medium dash-text-tertiary bg-[var(--color-surface-alt)] border dash-border rounded">Esc</kbd>
              </div>
            </div>
          </div>

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
                  <span className="text-[9px] dash-text-tertiary uppercase tracking-widest font-bold">{profile?.role}</span>
                </div>
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm shadow-md overflow-hidden" style={{ background: 'var(--color-accent)' }}>
                  <img
                    src={(profile as any)?.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'}
                    alt={profile?.full_name || 'Profile avatar'}
                    className="w-full h-full object-cover"
                  />
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

