import * as Sentry from '@sentry/react';
import { getPermissions } from './lib/permissions';
import AccessDenied from './components/Common/AccessDenied';
import PageErrorFallback from './components/Common/PageErrorFallback';
import { useEffect, useState, lazy, Suspense } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { supabase } from './lib/supabase';
import OnboardingCompany from './pages/OnboardingCompany';
import AcceptInvitePage from './components/company/AcceptInvitePage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import PlatformPage from './pages/PlatformPage';
import WhoItsForPage from './pages/WhoItsForPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import type { MarketingPage } from './pages/landing/shell';
import LoginPage from './components/Auth/LoginPage';
import ResetPasswordPage from './components/Auth/ResetPasswordPage';
import SignupPage from './components/Auth/SignupPage';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import CompanySetupChecklist from './components/Onboarding/CompanySetupChecklist';
import SetupHubPreview from './components/Onboarding/navy/SetupHubPreview';
import BrandSplash from './components/BrandSplash';
import MainLayout from './components/Layout/MainLayout';
import type { PageId } from './components/Layout/MainLayout';
import { useCalendarReminders } from './hooks/useCalendarReminders';
import { useRoutePersistence } from './hooks/useRoutePersistence';
import { applyDeepLinksFromUrl } from './integrations/utils/deepLinks';
import RealtimePopups from './components/Notifications/RealtimePopups';
import FeatureGate from './components/Billing/FeatureGate';

/* ──────────────────────────────────────────────────────────────────
   THE PAGES ARE LOADED ON DEMAND.

   Every one of these was a static import, which put all ~95 of them —
   and everything they pull in: pdfjs-dist, mammoth, jszip, recharts,
   framer-motion — into ONE chunk that the browser had to download and
   parse before it could draw anything at all. Including the login
   form. Someone signing in was waiting on the code for pages they had
   not asked for and might never open.

   Each page is now its own chunk, fetched when its route is first
   shown. The Suspense boundary is around renderPage() at the bottom of
   this file, inside MainLayout, so the shell stays on screen while a
   page arrives rather than the app blanking.

   WHAT MUST NOT BE LAZY, and why they are still imported above:
     AccessDenied, FeatureGate   rendered as the fallback INSIDE a case,
                                 so lazying them would put a second
                                 spinner behind the first;
     MainLayout, RealtimePopups  the shell itself — it is what the
                                 fallback is drawn inside;
     PageErrorFallback           it has to be loadable when a chunk
                                 fails, which is exactly when a fetch
                                 is not to be relied on.
   ────────────────────────────────────────────────────────────────── */
const DepartmentsPage           = lazy(() => import('./components/company/DepartmentsPage'));
const AIDashboardPage           = lazy(() => import('./components/Governance/AI/AIDashboardPage'));
const DashboardPage             = lazy(() => import('./components/Dashboard/DashboardPage'));
const UploadPage                = lazy(() => import('./components/Upload/UploadPage'));
const ArchivePage               = lazy(() => import('./components/Archive/ArchivePage'));
const RegulationsPage           = lazy(() => import('./components/Regulations/RegulationsPage'));
const LegalReviewPage           = lazy(() => import('./components/LegalReview/LegalReviewPage'));
const CorrectionEditorPage      = lazy(() => import('./components/CorrectionEditor/CorrectionEditorPage'));
const MembersPage               = lazy(() => import('./components/company/MembersPage'));
const InvitesPage               = lazy(() => import('./components/company/InvitesPage'));
const TrainingLogPage           = lazy(() => import('./components/Training/TrainingLogPage'));
const ProfilePage               = lazy(() => import('./components/Profile/ProfilePage'));
const NotificationsPage         = lazy(() => import('./components/Notifications/NotificationsPage'));
const LicenseVaultPage          = lazy(() => import('./components/LicenseVault/LicenseVaultPage'));
const IntegrationsPage          = lazy(() => import('./components/Integrations/IntegrationsPage'));
const AuditTrailPage            = lazy(() => import('./components/AuditTrail/AuditTrailPage'));
const RoleManagementPage        = lazy(() => import('./components/Roles/RoleManagementPage'));
const ContentCalendarPage       = lazy(() => import('./components/Calendar/ContentCalendarPage'));
const TeamChatPage              = lazy(() => import('./components/Chat/TeamChatPage'));
const DriftMonitorPage          = lazy(() => import('./components/DriftMonitor/DriftMonitorPage'));
const ConsentManagementPage     = lazy(() => import('./components/ConsentManagement/ConsentManagementPage'));
const ContentBlocksPage         = lazy(() => import('./components/ContentBlocks/ContentBlocksPage'));
const AgencyPortalPage          = lazy(() => import('./components/AgencyPortal/AgencyPortalPage'));
const ComplianceReportingPage   = lazy(() => import('./components/Reporting/ComplianceReportingPage'));
const HorizonScanningPage       = lazy(() => import('./components/HorizonScanning/HorizonScanningPage'));
const ChannelRulesPage          = lazy(() => import('./components/ChannelRules/ChannelRulesPage'));
const RegulatoryLibraryPage     = lazy(() => import('./components/RegulatoryLibrary/RegulatoryLibraryPage'));
const TranslationCompliancePage = lazy(() => import('./components/TranslationCompliance/TranslationCompliancePage'));
const CrisisResponsePage        = lazy(() => import('./components/CrisisResponse/CrisisResponsePage'));
const ProgrammaticAdPage        = lazy(() => import('./components/ProgrammaticAd/ProgrammaticAdPage'));
const WhistleblowerPage         = lazy(() => import('./components/Whistleblower/WhistleblowerPage'));
const PredictiveRiskPage        = lazy(() => import('./components/PredictiveRisk/PredictiveRiskPage'));
const SocialListeningPage       = lazy(() => import('./components/SocialListening/SocialListeningPage'));
const WebsiteMonitoringPage     = lazy(() => import('./components/WebsiteMonitoring/WebsiteMonitoringPage'));
const VendorScorecardPage       = lazy(() => import('./components/VendorScorecard/VendorScorecardPage'));
const CapaManagementPage        = lazy(() => import('./components/CapaManagement/CapaManagementPage'));
const TrainingSimulationPage    = lazy(() => import('./components/TrainingSimulation/TrainingSimulationPage'));
const ClaimExtractionPage       = lazy(() => import('./components/ClaimExtraction/ClaimExtractionPage'));
const SecretVaultPage           = lazy(() => import('./components/Vault/SecretVaultPage'));
const LegalMarketplacePage      = lazy(() => import('./components/Marketplace/LegalMarketplacePage'));
const LegalPartnerDashboard     = lazy(() => import('./components/Marketplace/LegalPartnerDashboard'));
const PartnerVerificationPage   = lazy(() => import('./components/Marketplace/PartnerVerificationPage'));
const PolicyAssistantPage       = lazy(() => import('./components/PolicyAssistant/PolicyAssistantPage'));
const GrcFrameworksPage         = lazy(() => import('./components/GrcFrameworks/GrcFrameworksPage'));
const GrcControlsPage           = lazy(() => import('./components/GrcControls/GrcControlsPage'));
const GrcDashboardPage          = lazy(() => import('./components/GrcDashboard/GrcDashboardPage'));
const GrcAutomationPage         = lazy(() => import('./components/GrcAutomation/GrcAutomationPage'));
const AIAssetsPage              = lazy(() => import('./components/Governance/AI/AIAssetsPage'));
const AIAssetDetailPage         = lazy(() => import('./components/Governance/AI/AIAssetDetailPage'));
const AIUsageLogsPage           = lazy(() => import('./components/Governance/AI/AIUsageLogsPage'));
const AIReviewsPage             = lazy(() => import('./components/Governance/AI/AIReviewsPage'));
const AIPromptTemplatesPage     = lazy(() => import('./components/Governance/AI/AIPromptTemplatesPage'));
const AIIncidentsPage           = lazy(() => import('./components/Governance/AI/AIIncidentsPage'));
const PoliciesPage              = lazy(() => import('./components/Governance/Policies/PoliciesPage'));
const PolicyDetailPage          = lazy(() => import('./components/Governance/Policies/PolicyDetailPage'));
const MyPoliciesPage            = lazy(() => import('./components/Governance/Policies/MyPoliciesPage'));
const VendorsPage               = lazy(() => import('./components/Vendors/VendorsPage'));
const VendorDetailPage          = lazy(() => import('./components/Vendors/VendorDetailPage'));
const AuditSessionsPage         = lazy(() => import('./components/Governance/Audits/AuditSessionsPage'));
const AuditSessionDetailPage    = lazy(() => import('./components/Governance/Audits/AuditSessionDetailPage'));
const RiskRegisterPage          = lazy(() => import('./components/Governance/Risks/RiskRegisterPage'));
const RiskDetailDrawer          = lazy(() => import('./components/Governance/Risks/RiskDetailDrawer'));
const CommandCenterPage         = lazy(() => import('./components/Governance/CommandCenter/CommandCenterPage'));
const ObligationListPage        = lazy(() => import('./components/Governance/Obligations/ObligationListPage'));
const ObligationDetailPage      = lazy(() => import('./components/Governance/Obligations/ObligationDetailPage'));
const IdentityProvidersPage     = lazy(() => import('./components/Governance/Identity/IdentityProvidersPage'));
const PlatformJobsPage          = lazy(() => import('./components/Platform/PlatformJobsPage'));
const RetentionPoliciesPage     = lazy(() => import('./components/Governance/Retention/RetentionPoliciesPage'));
const LegalHoldsPage            = lazy(() => import('./components/Governance/LegalHold/LegalHoldsPage'));
const GovernanceTimelinePage    = lazy(() => import('./components/Governance/Timeline/GovernanceTimelinePage'));
const WebhooksPage              = lazy(() => import('./components/Platform/WebhooksPage'));
const EvidenceIngestionsPage    = lazy(() => import('./components/Platform/EvidenceIngestionsPage'));
const EcosystemHubPage          = lazy(() => import('./components/Platform/EcosystemHubPage'));
const CompanySettingsPage       = lazy(() => import('./components/company/CompanySettingsPage'));
const BillingPage               = lazy(() => import('./components/Billing/BillingPage'));
const BatchReleasePage          = lazy(() => import('./components/BatchRelease/BatchReleasePage'));
const ChangeControlPage         = lazy(() => import('./components/ChangeControl/ChangeControlPage'));
const SopLibraryPage            = lazy(() => import('./components/SopLibrary/SopLibraryPage'));
const ComingSoonPage            = lazy(() => import('./components/Common/ComingSoonPage'));
const AIInsightsPage            = lazy(() => import('./components/Dashboard/AIInsightsPage'));
const FrameworkLibraryPage      = lazy(() => import('./components/FrameworkLibrary/FrameworkLibraryPage'));
const ControlHealthDashboard    = lazy(() => import('./components/ControlMonitoring/ControlHealthDashboard'));
const RegulatoryAffairsPage     = lazy(() => import('./components/RegulatoryAffairs/RegulatoryAffairsPage'));
const GmpInspectionPage         = lazy(() => import('./components/GmpInspection/GmpInspectionPage'));
const SONCompliancePage         = lazy(() => import('./components/SONCompliance/SONCompliancePage'));
const CTDDossierPage            = lazy(() => import('./components/CTDDossier/CTDDossierPage'));
const ContrabandRejectionPage   = lazy(() => import('./components/ContrabandRejection/ContrabandRejectionPage'));
const ShipmentEventLogPage      = lazy(() => import('./components/Logistics/ShipmentEventLogPage'));
const CN2223DeclarationPage     = lazy(() => import('./components/Logistics/CN2223DeclarationPage'));
const ComplianceAlertingPage    = lazy(() => import('./components/Alerts/ComplianceAlertingPage'));
const AuditPrepPage             = lazy(() => import('./components/AuditPrep/AuditPrepPage'));
const CoaRegisterPage           = lazy(() => import('./components/Coa/CoaRegisterPage'));
const OrgManagementPanel        = lazy(() => import('./components/Enterprise/OrgManagementPanel'));
const EnterpriseDashboardPage   = lazy(() => import('./components/Enterprise/EnterpriseDashboardPage'));
const PharmaIntegrationsPage    = lazy(() => import('./components/PharmaIntegrations/PharmaIntegrationsPage'));

type UnauthView = 'landing' | 'platform' | 'who' | 'about' | 'contact' | 'login' | 'signup';

function isValidPageId(value: any): value is PageId {
  return (
    value === 'dashboard' ||
    value === 'upload' ||
    value === 'archive' ||
    value === 'regulations' ||
    value === 'legal-review' ||
    value === 'training-log' ||
    value === 'company-settings' ||
    value === 'company-members' ||
    value === 'company-invites' ||
    value === 'company-departments' ||
    value === 'correction-editor' ||
    value === 'profile' ||
    value === 'license-vault' ||
    value === 'integrations' ||
    value === 'audit-trail' ||
    value === 'role-management' ||
    value === 'content-calendar' ||
    value === 'team-chat' ||
    value === 'drift-monitor' ||
    value === 'consent-management' ||
    value === 'content-blocks' ||
    value === 'agency-portal' ||
    value === 'compliance-reporting' ||
    value === 'horizon-scanning' ||
    value === 'channel-rules' ||
    value === 'regulatory-library' ||
    value === 'translation-compliance' ||
    value === 'crisis-response' ||
    value === 'programmatic-ad' ||
    value === 'whistleblower' ||
    value === 'predictive-risk' ||
    value === 'social-listening' ||
    value === 'website-monitoring' ||
    value === 'vendor-scorecard' ||
    value === 'capa-management' ||
    value === 'training-simulation' ||
    value === 'claim-extraction' ||
    value === 'secret-vault' ||
    value === 'legal-marketplace' ||
    value === 'legal-partner-dashboard' ||
    value === 'partner-verification' ||
    value === 'policy-assistant' ||
    value === 'grc-frameworks' ||
    value === 'grc-controls' ||
    value === 'grc-automation' ||
    value === 'grc-dashboard' ||
    value === 'policies' ||
    value === 'policy-detail' ||
    value === 'my-policies' ||
    value === 'vendors' ||
    value === 'vendor-detail' ||
    value === 'audit-sessions' ||
    value === 'audit-session-detail' ||
    value === 'risk-register' ||
    value === 'risk-detail' ||
    value === 'command-center' ||
    value === 'obligations' ||
    value === 'obligation-detail' ||
    value === 'identity-providers' ||
    value === 'platform-jobs' ||
    value === 'retention-policies' ||
    value === 'legal-holds' ||
    value === 'governance-timeline' ||
    value === 'ai-reviews' ||
    value === 'ai-prompts' ||
    value === 'platform-webhooks' ||
    value === 'platform-evidence-ingestions' ||
    value === 'platform-ecosystem' ||
    value === 'billing' ||
    value === 'notifications' ||
    value === 'batch-release' ||
    value === 'change-control' ||
    value === 'sop-library' ||
    value === 'supplier-qualification' ||
    value === 'gmp-inspection' ||
    value === 'ai-insights' ||
    value === 'framework-library' ||
    value === 'control-monitoring' ||
    value === 'regulatory-affairs' ||
    value === 'son-compliance' ||
    value === 'ctd-dossier' ||
    value === 'contraband-rejection' ||
    value === 'shipment-event-log' ||
    value === 'cn-declarations' ||
    value === 'compliance-alerting' ||
    value === 'audit-prep' ||
    value === 'coa' ||
    // Previously missing, so a reload or deep link while on any of these
    // silently dropped the user back to the dashboard.
    value === 'ai-dashboard' ||
    value === 'ai-assets' ||
    value === 'ai-asset-detail' ||
    value === 'ai-usage' ||
    value === 'ai-incidents' ||
    value === 'org-management' ||
    value === 'enterprise-dashboard' ||
    value === 'pharma-integrations'
  );
}

/**
 * What is shown while a page's chunk is in flight.
 *
 * It is deliberately small and in the content area. The full-screen
 * splash is for "the app does not know who you are yet"; a page loading
 * is not that, and borrowing the splash for it would make every
 * navigation look like a cold start.
 */
function PageLoading() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      style={{ display: 'grid', placeItems: 'center', minHeight: 320, padding: 32 }}
    >
      <svg width="28" height="28" viewBox="0 0 32 32" className="navy-btn-spinner"
           style={{ color: 'var(--color-text-secondary, #8e8e8e)' }}>
        <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor"
                strokeWidth="3" strokeLinecap="round" strokeDasharray="61.26 20.42" />
      </svg>
    </div>
  );
}

function AppContent() {
  const { user, profile, loading, isRecoveringPassword, refreshProfile, signOut } = useAuth();

  const inviteTokenFromUrl = (() => {
    try {
      if (window.location.pathname !== '/invite/accept') return null;
      const params = new URLSearchParams(window.location.search);
      return params.get('token');
    } catch {
      return null;
    }
  })();

  /* The marketing nav no longer offers Sign In — the public site is a
     lead-generation site, not a product front door. Existing users get in at
     /portal, which netlify.toml's SPA fallback already serves. Without this
     the sign-in form would be unreachable: unauthView is state, not a route,
     so removing the button would otherwise remove the only way to it.

     /login stays as a silent alias. It is not advertised anywhere, but it is
     the first path anyone guesses, and it may already have been shared — a
     404-looking landing page for someone trying to sign in is not worth the
     tidiness of retiring it. */
  const SIGN_IN_PATHS = ['/portal', '/login'];

  const wantsLogin = (() => {
    try {
      const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
      return SIGN_IN_PATHS.includes(path);
    } catch {
      return false;
    }
  })();

  /*  /onboarding. The old /design/onboarding stays as a silent alias —
      it was published in a commit message and may already have been
      linked to, and a 404 for someone opening a link they were given is
      not worth the tidiness of retiring it. */
  const ONBOARDING_PATHS = ['/onboarding', '/design/onboarding'];

  const wantsOnboardingHub = (() => {
    try {
      const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
      return ONBOARDING_PATHS.includes(path);
    } catch {
      return false;
    }
  })();

  const [unauthView, setUnauthView] = useState<UnauthView>(wantsLogin ? 'login' : 'landing');
  const [currentPage, setCurrentPage] = useRoutePersistence<PageId>('dashboard', isValidPageId);
  const [currentPolicyId, setCurrentPolicyId] = useState<string | null>(null);
  const [currentVendorId, setCurrentVendorId] = useState<string | null>(null);
  const [currentAuditSessionId, setCurrentAuditSessionId] = useState<string | null>(null);
  const [currentRiskId, setCurrentRiskId] = useState<string | null>(null);
  const [currentObligationId, setCurrentObligationId] = useState<string | null>(null);
  const [currentAIAssetId, setCurrentAIAssetId] = useState<string | null>(null);

  useEffect(() => {
    applyDeepLinksFromUrl({
      setCurrentPage,
      isValidPageId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      const page = e?.detail?.page;
      if (isValidPageId(page)) {
        setCurrentPage(page);
        if (e.detail.policyId) {
          setCurrentPolicyId(e.detail.policyId);
        }
        if (e.detail.vendorId) {
          setCurrentVendorId(e.detail.vendorId);
        }
        if (e.detail.auditSessionId) {
          setCurrentAuditSessionId(e.detail.auditSessionId);
        }
        if (e.detail.riskId) {
          setCurrentRiskId(e.detail.riskId);
        }
        if (e.detail.obligationId) {
          setCurrentObligationId(e.detail.obligationId);
        }
        if (e.detail.aiAssetId) {
          setCurrentAIAssetId(e.detail.aiAssetId);
        }
      }
    };

    window.addEventListener('navigate', handler as any);
    window.addEventListener('navigate-to', handler as any);

    return () => {
      window.removeEventListener('navigate', handler as any);
      window.removeEventListener('navigate-to', handler as any);
    };
  }, []);

  // Resilience: Auto-flush action queue on reconnect
  useEffect(() => {
    const onOnline = async () => {
      const { actionQueue } = await import('./lib/actionQueue');
      const queueSize = await actionQueue.size();
      if (queueSize > 0) {
        // console.log("[Queue] Back online — flushing...");
        const result = await actionQueue.flush();
        window.dispatchEvent(new CustomEvent('global-toast', {
          detail: {
            message: `Synced ${result.success} pending actions${result.failed > 0 ? `, ${result.failed} failed` : ''} `,
            type: 'success'
          }
        }));
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useCalendarReminders((profile as any)?.company_id ?? null, user?.id ?? null);

  useEffect(() => {
    if (!user) return;

    const pending = localStorage.getItem('pending_invite_token');
    if (!pending) return;

    (async () => {
      try {
        const { error } = await (supabase as any).rpc('accept_company_invite', {
          p_token: pending,
        });
        if (error) throw error;

        localStorage.removeItem('pending_invite_token');
        await refreshProfile();

        window.history.replaceState({}, '', '/');
        setCurrentPage('dashboard');
      } catch {
        // keep token for retry
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /*  /onboarding — the v2 onboarding hub (ONB-00) as a viewer. It sits
      ABOVE the auth gates on purpose: it holds no session, reads no
      table and writes nothing, so waiting on an auth round-trip would
      only make it slower to open. It is NOT yet the screen a new user
      is routed to — see SetupHubPreview for why the hub cannot be the
      live gate until the six step screens exist. */
  if (wantsOnboardingHub) {
    return <SetupHubPreview />;
  }

  if (loading) {
    return <BrandSplash />;
  }

  //  A recovery link signs the user in before they have proved they know a
  //  password, so this gate sits ABOVE every other branch — including the
  //  invite flow and the authenticated app. Anything lower would render the
  //  product to whoever opened the mailbox.
  if (isRecoveringPassword) {
    return <ResetPasswordPage />;
  }

  if (inviteTokenFromUrl !== null) {
    if (!user) {
      if (unauthView === 'login') {
        return (
          <LoginPage
            onToggleSignup={() => setUnauthView('signup')}
            onRequestAccess={() => setUnauthView('contact')}
            onBackToLanding={() => setUnauthView('landing')}
          />
        );
      }

      if (unauthView === 'signup') {
        return (
          <SignupPage
            onToggleLogin={() => setUnauthView('login')}
            onBackToLanding={() => setUnauthView('landing')}
          />
        );
      }

      return (
        <AcceptInvitePage
          token={inviteTokenFromUrl}
          onGoLogin={() => setUnauthView('login')}
          onGoSignup={() => setUnauthView('signup')}
          onDone={() => setCurrentPage('dashboard')}
        />
      );
    }

    return (
      <AcceptInvitePage
        token={inviteTokenFromUrl}
        onGoLogin={() => setUnauthView('login')}
        onGoSignup={() => setUnauthView('signup')}
        onDone={() => setCurrentPage('dashboard')}
      />
    );
  }

  if (!user) {
    if (unauthView === 'signup') {
      return (
        <SignupPage
          onToggleLogin={() => setUnauthView('login')}
          onBackToLanding={() => setUnauthView('landing')}
        />
      );
    }

    if (unauthView === 'login') {
      return (
        <LoginPage
          onToggleSignup={() => setUnauthView('signup')}
          onRequestAccess={() => setUnauthView('contact')}
          onBackToLanding={() => setUnauthView('landing')}
        />
      );
    }

    // The marketing pages address each other by name; 'home' is the landing
    // view, every other page id is its own view.
    const goToMarketingPage = (page: MarketingPage) =>
      setUnauthView(page === 'home' ? 'landing' : page);

    if (unauthView === 'platform') {
      return (
        <PlatformPage
          onRequestInfo={() => setUnauthView('contact')}
          onNavigateToPage={goToMarketingPage}
        />
      );
    }

    if (unauthView === 'who') {
      return (
        <WhoItsForPage
          onRequestInfo={() => setUnauthView('contact')}
          onNavigateToPage={goToMarketingPage}
        />
      );
    }

    if (unauthView === 'about') {
      return (
        <AboutPage
          onRequestInfo={() => setUnauthView('contact')}
          onNavigateToPage={goToMarketingPage}
        />
      );
    }

    if (unauthView === 'contact') {
      return (
        <ContactPage
          onRequestInfo={() => setUnauthView('contact')}
          onNavigateToPage={goToMarketingPage}
        />
      );
    }

    return (
      <LandingPage
        onRequestInfo={() => setUnauthView('contact')}
        onNavigateToPage={goToMarketingPage}
      />
    );
  }

  if (user && !profile) {
    // Signed in but no profile row yet. This is normally a brief provisioning
    // window, but if a session gets stuck without a profile (e.g. signup that
    // never completed verification), give the user a way out instead of an
    // endless spinner.
    return (
      <BrandSplash
        message="Setting up your account… If this doesn’t finish, your sign-up may not have been verified."
        action={
          <button
            onClick={() => signOut()}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              font: 'inherit', fontSize: 14,
              color: 'var(--nv-text-primary)', textDecoration: 'underline',
            }}
          >
            Sign out and try again
          </button>
        }
      />
    );
  }

  const industryType = (profile as any)?.industry_type as string | null | undefined;
  const isLogisticsProfile = industryType?.trim().toLowerCase() === 'logistics & courier';
  const perms = getPermissions({
    profileRole: profile?.role,
    customPermissions: (profile as any)?.customPermissions,
    moduleAccess: (profile as any)?.module_access,
    industryType,
  });

  if (profile && !profile.company_id) {
    // If there's a pending invite token, accept it first instead of creating a new company.
    // This guards against the edge case where a user created an account via the normal
    // SignupPage while an invite token was already in localStorage.
    const pendingToken = localStorage.getItem('pending_invite_token');
    if (pendingToken) {
      return (
        <AcceptInvitePage
          token={pendingToken}
          onGoLogin={() => {}}
          onGoSignup={() => {}}
          onDone={async () => refreshProfile()}
        />
      );
    }
    return <OnboardingCompany onDone={async () => refreshProfile()} />;
  }

  if (profile && !profile.onboarding_completed) {
    return <OnboardingWizard onComplete={async () => refreshProfile()} />;
  }

  const setupDoneKey = `setup_done_${user?.id}`;
  const needsSetup =
    profile &&
    profile.onboarding_completed &&
    !localStorage.getItem(setupDoneKey) &&
    ['Admin', 'Executive', 'Compliance'].includes(profile.role ?? '');

  if (needsSetup) {
    return (
      <CompanySetupChecklist
        onComplete={(navigateTo?: string) => {
          localStorage.setItem(setupDoneKey, 'true');
          if (navigateTo) {
            window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: navigateTo } }));
          }
          refreshProfile();
        }}
      />
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage onNavigateToArchive={() => setCurrentPage('archive')} />;

      case 'upload':
        return perms.canUpload ? <UploadPage /> : <AccessDenied />;

      case 'archive':
        return perms.canViewArchive ? <ArchivePage /> : <AccessDenied />;

      case 'regulations':
        return <RegulationsPage />;

      case 'legal-review':
        return perms.canViewLegalReview ? (
          <FeatureGate feature="legal_review" featureLabel="Legal Review Workflow">
            <LegalReviewPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'training-log':
        return perms.canViewTraining ? <TrainingLogPage /> : <AccessDenied />;

      case 'company-settings':
        return perms.canManageRoles ? <CompanySettingsPage /> : <AccessDenied />;

      case 'company-members':
        return perms.canViewMembers ? <MembersPage /> : <AccessDenied />;

      case 'company-invites':
        return perms.canInvite ? <InvitesPage /> : <AccessDenied />;

      case 'company-departments':
        return perms.canInvite ? <DepartmentsPage /> : <AccessDenied />;

      case 'correction-editor':
        return <CorrectionEditorPage onDone={() => setCurrentPage('archive')} />;

      case 'profile':
        return <ProfilePage />;

      case 'notifications':
        return <NotificationsPage />;

      case 'billing':
        return perms.canViewBilling ? <BillingPage /> : <AccessDenied />;

      case 'license-vault':
        return perms.canViewLicenseVault ? <LicenseVaultPage /> : <AccessDenied />;

      case 'integrations':
        return perms.canViewIntegrations ? (
          <FeatureGate feature="custom_integrations" featureLabel="Custom Integrations">
            <IntegrationsPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'audit-trail':
        return perms.canViewAuditTrail ? <AuditTrailPage /> : <AccessDenied />;

      case 'role-management':
        return perms.canManageRoles ? <RoleManagementPage /> : <AccessDenied />;

      case 'content-calendar':
        return <ContentCalendarPage />;

      case 'team-chat':
        return <TeamChatPage />;

      case 'drift-monitor':
        return perms.canViewDriftMonitor ? (
          <FeatureGate feature="horizon_scanning" featureLabel="Regulatory Drift Monitor">
            <DriftMonitorPage onNavigate={(id) => setCurrentPage(id as PageId)} />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'consent-management':
        return perms.canViewConsentManagement ? <ConsentManagementPage /> : <AccessDenied />;

      case 'content-blocks':
        return perms.canViewContentBlocks ? <ContentBlocksPage /> : <AccessDenied />;

      case 'agency-portal':
        return perms.canViewAgencyPortal ? <AgencyPortalPage /> : <AccessDenied />;

      case 'compliance-reporting':
        return perms.canViewComplianceReporting ? (
          <FeatureGate feature="compliance_reporting" featureLabel="Compliance Reporting">
            <ComplianceReportingPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'horizon-scanning':
        return perms.canViewHorizonScanning ? (
          <FeatureGate feature="horizon_scanning" featureLabel="Horizon Scanning">
            <HorizonScanningPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'channel-rules':
        return perms.canViewChannelRules ? <ChannelRulesPage /> : <AccessDenied />;

      case 'regulatory-library':
        return perms.canViewRegulatoryLibrary ? <RegulatoryLibraryPage /> : <AccessDenied />;

      case 'translation-compliance':
        return perms.canViewTranslationCompliance ? <TranslationCompliancePage /> : <AccessDenied />;

      case 'crisis-response':
        return perms.canViewCrisisResponse ? <CrisisResponsePage /> : <AccessDenied />;

      case 'programmatic-ad':
        return perms.canViewProgrammaticAd ? <ProgrammaticAdPage /> : <AccessDenied />;

      case 'whistleblower':
        return perms.canViewWhistleblower ? <WhistleblowerPage /> : <AccessDenied />;

      case 'predictive-risk':
        return perms.canViewPredictiveRisk ? <PredictiveRiskPage /> : <AccessDenied />;

      case 'social-listening':
        return perms.canViewSocialListening ? <SocialListeningPage /> : <AccessDenied />;

      case 'website-monitoring':
        return perms.canViewWebsiteMonitoring ? <WebsiteMonitoringPage /> : <AccessDenied />;

      case 'vendor-scorecard':
        return perms.canViewVendorScorecard ? <VendorScorecardPage /> : <AccessDenied />;

      case 'capa-management':
        return perms.canViewCapaManagement ? <CapaManagementPage /> : <AccessDenied />;

      case 'training-simulation':
        return perms.canViewTrainingSimulation ? <TrainingSimulationPage /> : <AccessDenied />;

      case 'claim-extraction':
        return perms.canViewClaimExtraction ? <ClaimExtractionPage /> : <AccessDenied />;

      case 'secret-vault':
        return <SecretVaultPage />; // The page handles its own auth inside

      case 'legal-marketplace':
        return <LegalMarketplacePage />;

      case 'legal-partner-dashboard':
        return <LegalPartnerDashboard onNavigateToMarketplace={() => setCurrentPage('legal-marketplace')} />;

      case 'partner-verification':
        return <PartnerVerificationPage />;

      case 'policy-assistant':
        return <PolicyAssistantPage />;

      case 'grc-frameworks':
        return perms.canViewGrcFrameworks ? (
          <FeatureGate feature="grc_frameworks" featureLabel="GRC Frameworks">
            <GrcFrameworksPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'grc-controls':
        return perms.canViewGrcControls ? (
          <FeatureGate feature="grc_frameworks" featureLabel="GRC Controls">
            <GrcControlsPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'grc-automation':
        return perms.canViewGrcAutomation ? (
          <FeatureGate feature="grc_frameworks" featureLabel="GRC Automation">
            <GrcAutomationPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'grc-dashboard':
        return perms.canViewGrcDashboard ? (
          <FeatureGate feature="grc_frameworks" featureLabel="GRC Posture Dashboard">
            <GrcDashboardPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'policies':
        return perms.canViewPolicies ? <PoliciesPage /> : <AccessDenied />;

      case 'policy-detail':
        return perms.canViewPolicies ? <PolicyDetailPage policyId={currentPolicyId} onBack={() => setCurrentPage('policies')} /> : <AccessDenied />;

      case 'my-policies':
        return perms.canViewPolicies ? <MyPoliciesPage /> : <AccessDenied />;

      case 'vendors':
        return perms.canViewVendors ? <VendorsPage /> : <AccessDenied />;

      case 'vendor-detail':
        return perms.canViewVendors ? <VendorDetailPage vendorId={currentVendorId} onBack={() => setCurrentPage('vendors')} /> : <AccessDenied />;

      case 'audit-sessions':
        return perms.canViewAuditWorkspace ? <AuditSessionsPage /> : <AccessDenied />;

      case 'audit-session-detail':
        return perms.canViewAuditWorkspace ? <AuditSessionDetailPage auditSessionId={currentAuditSessionId} onBack={() => setCurrentPage('audit-sessions')} /> : <AccessDenied />;

      case 'risk-register':
        return perms.canViewRiskRegister ? <RiskRegisterPage /> : <AccessDenied />;

      case 'risk-detail':
        return perms.canViewRiskRegister ? <RiskDetailDrawer riskId={currentRiskId} onBack={() => setCurrentPage('risk-register')} /> : <AccessDenied />;

      case 'command-center':
        return perms.canViewGrcDashboard ? <CommandCenterPage /> : <AccessDenied />;

      case 'obligations':
        return perms.canViewObligations ? <ObligationListPage /> : <AccessDenied />;

      case 'obligation-detail':
        return perms.canViewObligations ? <ObligationDetailPage obligationId={currentObligationId!} onBack={() => setCurrentPage('obligations')} /> : <AccessDenied />;

      case 'identity-providers':
        return perms.canViewIdentity ? (
          <FeatureGate feature="sso" featureLabel="Identity & SSO">
            <IdentityProvidersPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'platform-jobs':
        return perms.canViewPlatformJobs ? <PlatformJobsPage /> : <AccessDenied />;

      case 'retention-policies':
        return perms.canViewRetention ? <RetentionPoliciesPage /> : <AccessDenied />;

      case 'legal-holds':
        return perms.canViewLegalHold ? <LegalHoldsPage /> : <AccessDenied />;

      case 'governance-timeline':
        return perms.canViewGovernanceTimeline ? <GovernanceTimelinePage /> : <AccessDenied />;

      case 'ai-assets':
        return perms.canViewAIGovernance ? (
          <FeatureGate feature="ai_analysis" featureLabel="AI Asset Registry">
            <AIAssetsPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'ai-asset-detail':
        return perms.canViewAIGovernance ? (
          <FeatureGate feature="ai_analysis" featureLabel="AI Asset Details">
            <AIAssetDetailPage assetId={currentAIAssetId} onBack={() => setCurrentPage('ai-assets')} />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'ai-usage':
        return perms.canViewAIUsage ? (
          <FeatureGate feature="ai_analysis" featureLabel="AI Usage Logs">
            <AIUsageLogsPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'ai-dashboard':
        return perms.canViewAIDashboard ? (
          <FeatureGate feature="ai_analysis" featureLabel="AI Governance Dashboard">
            <AIDashboardPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'ai-reviews':
        return perms.canViewAIReviews ? (
          <FeatureGate feature="ai_analysis" featureLabel="AI Reviews">
            <AIReviewsPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'ai-prompts':
        return perms.canViewAIPrompts ? (
          <FeatureGate feature="ai_analysis" featureLabel="AI Prompt Library">
            <AIPromptTemplatesPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'ai-incidents':
        return perms.canViewAIIncidents ? (
          <FeatureGate feature="ai_analysis" featureLabel="AI Incidents">
            <AIIncidentsPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'platform-webhooks':
        return perms.canViewWebhooks ? (
          <FeatureGate feature="api_access" featureLabel="Outbound Webhooks">
            <WebhooksPage />
          </FeatureGate>
        ) : <AccessDenied />;

      case 'platform-evidence-ingestions':
        return perms.canViewEvidenceIngestions ? <EvidenceIngestionsPage /> : <AccessDenied />;

      case 'platform-ecosystem':
        return perms.canViewEcosystem ? <EcosystemHubPage /> : <AccessDenied />;

      case 'batch-release':
        return !isLogisticsProfile ? <BatchReleasePage /> : <AccessDenied />;

      case 'change-control':
        return <ChangeControlPage />;

      case 'sop-library':
        return <SopLibraryPage />;

      case 'supplier-qualification':
        return !isLogisticsProfile
          ? <ComingSoonPage title="Supplier Qualification" description="Manage and qualify raw material suppliers and CMOs against GMP/HACCP requirements." />
          : <AccessDenied />;

      case 'gmp-inspection':
        return !isLogisticsProfile ? <GmpInspectionPage /> : <AccessDenied />;

      case 'ai-insights':
        return <AIInsightsPage />;

      case 'framework-library':
        return <FrameworkLibraryPage />;

      case 'control-monitoring':
        return <ControlHealthDashboard />;

      case 'regulatory-affairs':
        return !isLogisticsProfile ? <RegulatoryAffairsPage /> : <AccessDenied />;

      case 'son-compliance':
        return <SONCompliancePage />;

      case 'ctd-dossier':
        return !isLogisticsProfile ? <CTDDossierPage /> : <AccessDenied />;

      case 'contraband-rejection':
        return isLogisticsProfile ? <ContrabandRejectionPage /> : <AccessDenied />;

      case 'shipment-event-log':
        return isLogisticsProfile ? <ShipmentEventLogPage /> : <AccessDenied />;

      case 'cn-declarations':
        return isLogisticsProfile ? <CN2223DeclarationPage /> : <AccessDenied />;

      case 'compliance-alerting':
        return perms.canViewComplianceAlerts ? <ComplianceAlertingPage /> : <AccessDenied />;

      case 'audit-prep':
        return perms.canViewAuditPrep ? <AuditPrepPage /> : <AccessDenied />;

      case 'coa':
        return isLogisticsProfile ? <AccessDenied /> : <CoaRegisterPage />;

      // These three had a PageId and a component but no case, so navigating to
      // them silently fell through to the dashboard.
      case 'org-management':
        return perms.canManageRoles && profile?.organization_id
          ? <OrgManagementPanel organizationId={profile.organization_id} currentUserId={profile.id} />
          : <AccessDenied />;

      case 'enterprise-dashboard':
        return perms.canViewComplianceReporting && profile?.organization_id
          ? <EnterpriseDashboardPage organizationId={profile.organization_id} />
          : <AccessDenied />;

      case 'pharma-integrations':
        return perms.canViewPharmaIntegrations ? <PharmaIntegrationsPage /> : <AccessDenied />;

      default:
        return <DashboardPage />;
    }
  };

  return (
    <MainLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      <Sentry.ErrorBoundary
        key={currentPage}
        fallback={({ error, resetError }) => (
          <PageErrorFallback error={error as Error} onReset={resetError} />
        )}
      >
        {/*  The page's own chunk is fetched here. The fallback is a
             quiet in-place spinner, not the full-screen splash: the
             sidebar, header and the page the user came from stay where
             they are, so a page arriving does not look like the app
             restarting. Keyed to currentPage so React does not hold the
             previous page on screen while the next one loads.  */}
        <Suspense fallback={<PageLoading />}>
          {renderPage()}
        </Suspense>
      </Sentry.ErrorBoundary>
      <RealtimePopups />
    </MainLayout>
  );
}

function App() {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="min-h-screen bg-[var(--color-surface,#f8fafc)] flex items-center justify-center">
          <PageErrorFallback error={error as Error} onReset={resetError} />
        </div>
      )}
    >
      <AuthProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AuthProvider>
    </Sentry.ErrorBoundary>
  );
}

export default App;
