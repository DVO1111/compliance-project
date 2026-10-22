import * as Sentry from '@sentry/react';
import { getPermissions } from './lib/permissions';
import { appPath, appUrl, SIGN_IN_PATHS, WORKSPACE_PATH } from './lib/routing';
import AccessDenied from './components/Common/AccessDenied';
import PageErrorFallback from './components/Common/PageErrorFallback';
import ScreenNotBuilt from './components/Common/ScreenNotBuilt';
import { pageRefused } from './lib/access/roleAccess';
import { useEffect, useRef, useState, lazy, Suspense, type ComponentType } from 'react';
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
import AccessRequestsPage from './components/Auth/AccessRequestsPage';
import SignupPage from './components/Auth/SignupPage';
import SetupHubGate from './components/Onboarding/navy/SetupHubGate';
import { downloadImportTemplate } from './lib/onboarding/importTemplate';
import BrandSplash from './components/BrandSplash';
import ConfigurationNeeded from './components/ConfigurationNeeded';
import WorkspaceSetupNeeded from './components/WorkspaceSetupNeeded';
import { isSupabaseConfigured } from './lib/supabase';
import MainLayout from './components/Layout/MainLayout';
import type { PageId } from './components/Layout/MainLayout';
import { useCalendarReminders } from './hooks/useCalendarReminders';
import { useRoutePersistence } from './hooks/useRoutePersistence';
import { applyDeepLinksFromUrl } from './integrations/utils/deepLinks';
import RealtimePopups from './components/Notifications/RealtimePopups';
import FeatureGate from './components/Billing/FeatureGate';

/**
 * A lazily-loaded page, with one recovery the plain `lazy` does not have.
 *
 * Vite writes content-hashed filenames, so EVERY DEPLOY CHANGES THE CHUNK
 * NAMES. A tab opened before a deploy is holding an index.html that names
 * the old ones, and when the person then navigates, the browser asks for
 * a file that no longer exists. Netlify's SPA fallback answers any
 * unmatched path with index.html at status 200 — so the request does not
 * even fail honestly: it succeeds, returns HTML, and the browser reports
 * a module that will not parse.
 *
 * It did not matter when the whole app was one chunk loaded at the first
 * paint. It matters now, and it is not an edge case: it is what happens
 * to anyone with the app open while a deploy lands.
 *
 * So a failed chunk fetch reloads the page once, which fetches the
 * current index.html and the chunks it names. The one-shot flag is
 * cleared by the next page that loads successfully, so a later deploy
 * can recover the same way; without that it would reload only once ever.
 * If the reload does not fix it, the error boundary around renderPage
 * shows PageErrorFallback rather than a blank screen.
 */
const CHUNK_RELOAD_KEY = 'criateur.chunk-reload';

function lazyPage<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    load()
      .then((mod) => {
        //  Loaded cleanly, so any earlier recovery is spent and the next
        //  deploy is allowed its own reload.
        try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* private mode */ }
        return mod;
      })
      .catch((err) => {
        let alreadyTried = true;
        try {
          alreadyTried = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
          if (!alreadyTried) sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        } catch {
          //  No sessionStorage (private mode, blocked storage). Reloading
          //  without the flag risks a loop, so fall through to the error
          //  boundary instead, which is recoverable by hand.
        }
        if (!alreadyTried) window.location.reload();
        throw err;
      }),
  );
}

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
const DepartmentsPage           = lazyPage(() => import('./components/company/DepartmentsPage'));
const AIDashboardPage           = lazyPage(() => import('./components/Governance/AI/AIDashboardPage'));
const FirstRunDashboard         = lazyPage(() => import('./components/Dashboard/FirstRunDashboard'));
import { isQaAuthority } from './lib/pharma/qaAuthority';

const ProductsPage              = lazyPage(() => import('./components/Products/ProductsPage'));
const DeviationsPage            = lazyPage(() => import('./components/Deviations/DeviationsPage'));
const AccessPage                = lazyPage(() => import('./components/Access/AccessPage'));
const MaterialsPage             = lazyPage(() => import('./components/Materials/MaterialsPage'));
const InstrumentsPage           = lazyPage(() => import('./components/Floor/InstrumentsPage'));
const InprocessPage             = lazyPage(() => import('./components/Inprocess/InprocessPage'));
const BatchExecutionPage        = lazyPage(() => import('./components/Batch/BatchExecutionPage'));
const MasterFormulaPage         = lazyPage(() => import('./components/Formula/MasterFormulaPage'));
const UploadPage                = lazyPage(() => import('./components/Upload/UploadPage'));
const ArchivePage               = lazyPage(() => import('./components/Archive/ArchivePage'));
const RegulationsPage           = lazyPage(() => import('./components/Regulations/RegulationsPage'));
const LegalReviewPage           = lazyPage(() => import('./components/LegalReview/LegalReviewPage'));
const CorrectionEditorPage      = lazyPage(() => import('./components/CorrectionEditor/CorrectionEditorPage'));
const MembersPage               = lazyPage(() => import('./components/company/MembersPage'));
const InvitesPage               = lazyPage(() => import('./components/company/InvitesPage'));
const TrainingLogPage           = lazyPage(() => import('./components/Training/TrainingLogPage'));
const ProfilePage               = lazyPage(() => import('./components/Profile/ProfilePage'));
const NotificationsPage         = lazyPage(() => import('./components/Notifications/NotificationsPage'));
const LicenseVaultPage          = lazyPage(() => import('./components/LicenseVault/LicenseVaultPage'));
const IntegrationsPage          = lazyPage(() => import('./components/Integrations/IntegrationsPage'));
const AuditTrailPage            = lazyPage(() => import('./components/AuditTrail/AuditTrailPage'));
const RoleManagementPage        = lazyPage(() => import('./components/Roles/RoleManagementPage'));
const ContentCalendarPage       = lazyPage(() => import('./components/Calendar/ContentCalendarPage'));
const TeamChatPage              = lazyPage(() => import('./components/Chat/TeamChatPage'));
const DriftMonitorPage          = lazyPage(() => import('./components/DriftMonitor/DriftMonitorPage'));
const ConsentManagementPage     = lazyPage(() => import('./components/ConsentManagement/ConsentManagementPage'));
const ContentBlocksPage         = lazyPage(() => import('./components/ContentBlocks/ContentBlocksPage'));
const AgencyPortalPage          = lazyPage(() => import('./components/AgencyPortal/AgencyPortalPage'));
const ComplianceReportingPage   = lazyPage(() => import('./components/Reporting/ComplianceReportingPage'));
const HorizonScanningPage       = lazyPage(() => import('./components/HorizonScanning/HorizonScanningPage'));
const ChannelRulesPage          = lazyPage(() => import('./components/ChannelRules/ChannelRulesPage'));
const RegulatoryLibraryPage     = lazyPage(() => import('./components/RegulatoryLibrary/RegulatoryLibraryPage'));
const TranslationCompliancePage = lazyPage(() => import('./components/TranslationCompliance/TranslationCompliancePage'));
const CrisisResponsePage        = lazyPage(() => import('./components/CrisisResponse/CrisisResponsePage'));
const ProgrammaticAdPage        = lazyPage(() => import('./components/ProgrammaticAd/ProgrammaticAdPage'));
const WhistleblowerPage         = lazyPage(() => import('./components/Whistleblower/WhistleblowerPage'));
const PredictiveRiskPage        = lazyPage(() => import('./components/PredictiveRisk/PredictiveRiskPage'));
const SocialListeningPage       = lazyPage(() => import('./components/SocialListening/SocialListeningPage'));
const WebsiteMonitoringPage     = lazyPage(() => import('./components/WebsiteMonitoring/WebsiteMonitoringPage'));
const VendorScorecardPage       = lazyPage(() => import('./components/VendorScorecard/VendorScorecardPage'));
const CapaManagementPage        = lazyPage(() => import('./components/CapaManagement/CapaManagementPage'));
const TrainingSimulationPage    = lazyPage(() => import('./components/TrainingSimulation/TrainingSimulationPage'));
const ClaimExtractionPage       = lazyPage(() => import('./components/ClaimExtraction/ClaimExtractionPage'));
const SecretVaultPage           = lazyPage(() => import('./components/Vault/SecretVaultPage'));
const LegalMarketplacePage      = lazyPage(() => import('./components/Marketplace/LegalMarketplacePage'));
const LegalPartnerDashboard     = lazyPage(() => import('./components/Marketplace/LegalPartnerDashboard'));
const PartnerVerificationPage   = lazyPage(() => import('./components/Marketplace/PartnerVerificationPage'));
const PolicyAssistantPage       = lazyPage(() => import('./components/PolicyAssistant/PolicyAssistantPage'));
const GrcFrameworksPage         = lazyPage(() => import('./components/GrcFrameworks/GrcFrameworksPage'));
const GrcControlsPage           = lazyPage(() => import('./components/GrcControls/GrcControlsPage'));
const GrcDashboardPage          = lazyPage(() => import('./components/GrcDashboard/GrcDashboardPage'));
const GrcAutomationPage         = lazyPage(() => import('./components/GrcAutomation/GrcAutomationPage'));
const AIAssetsPage              = lazyPage(() => import('./components/Governance/AI/AIAssetsPage'));
const AIAssetDetailPage         = lazyPage(() => import('./components/Governance/AI/AIAssetDetailPage'));
const AIUsageLogsPage           = lazyPage(() => import('./components/Governance/AI/AIUsageLogsPage'));
const AIReviewsPage             = lazyPage(() => import('./components/Governance/AI/AIReviewsPage'));
const AIPromptTemplatesPage     = lazyPage(() => import('./components/Governance/AI/AIPromptTemplatesPage'));
const AIIncidentsPage           = lazyPage(() => import('./components/Governance/AI/AIIncidentsPage'));
const PoliciesPage              = lazyPage(() => import('./components/Governance/Policies/PoliciesPage'));
const PolicyDetailPage          = lazyPage(() => import('./components/Governance/Policies/PolicyDetailPage'));
const MyPoliciesPage            = lazyPage(() => import('./components/Governance/Policies/MyPoliciesPage'));
const VendorsPage               = lazyPage(() => import('./components/Vendors/VendorsPage'));
const VendorDetailPage          = lazyPage(() => import('./components/Vendors/VendorDetailPage'));
const AuditSessionsPage         = lazyPage(() => import('./components/Governance/Audits/AuditSessionsPage'));
const AuditSessionDetailPage    = lazyPage(() => import('./components/Governance/Audits/AuditSessionDetailPage'));
const RiskRegisterPage          = lazyPage(() => import('./components/Governance/Risks/RiskRegisterPage'));
const RiskDetailDrawer          = lazyPage(() => import('./components/Governance/Risks/RiskDetailDrawer'));
const CommandCenterPage         = lazyPage(() => import('./components/Governance/CommandCenter/CommandCenterPage'));
const ObligationListPage        = lazyPage(() => import('./components/Governance/Obligations/ObligationListPage'));
const ObligationDetailPage      = lazyPage(() => import('./components/Governance/Obligations/ObligationDetailPage'));
const IdentityProvidersPage     = lazyPage(() => import('./components/Governance/Identity/IdentityProvidersPage'));
const PlatformJobsPage          = lazyPage(() => import('./components/Platform/PlatformJobsPage'));
const RetentionPoliciesPage     = lazyPage(() => import('./components/Governance/Retention/RetentionPoliciesPage'));
const LegalHoldsPage            = lazyPage(() => import('./components/Governance/LegalHold/LegalHoldsPage'));
const GovernanceTimelinePage    = lazyPage(() => import('./components/Governance/Timeline/GovernanceTimelinePage'));
const WebhooksPage              = lazyPage(() => import('./components/Platform/WebhooksPage'));
const EvidenceIngestionsPage    = lazyPage(() => import('./components/Platform/EvidenceIngestionsPage'));
const EcosystemHubPage          = lazyPage(() => import('./components/Platform/EcosystemHubPage'));
const CompanySettingsPage       = lazyPage(() => import('./components/company/CompanySettingsPage'));
const BillingPage               = lazyPage(() => import('./components/Billing/BillingPage'));
const BatchReleasePage          = lazyPage(() => import('./components/BatchRelease/BatchReleasePage'));
const ChangeControlPage         = lazyPage(() => import('./components/ChangeControl/ChangeControlPage'));
const SopLibraryPage            = lazyPage(() => import('./components/SopLibrary/SopLibraryPage'));
const ComingSoonPage            = lazyPage(() => import('./components/Common/ComingSoonPage'));
const AIInsightsPage            = lazyPage(() => import('./components/Dashboard/AIInsightsPage'));
const FrameworkLibraryPage      = lazyPage(() => import('./components/FrameworkLibrary/FrameworkLibraryPage'));
const ControlHealthDashboard    = lazyPage(() => import('./components/ControlMonitoring/ControlHealthDashboard'));
const RegulatoryAffairsPage     = lazyPage(() => import('./components/RegulatoryAffairs/RegulatoryAffairsPage'));
const GmpInspectionPage         = lazyPage(() => import('./components/GmpInspection/GmpInspectionPage'));
const SONCompliancePage         = lazyPage(() => import('./components/SONCompliance/SONCompliancePage'));
const CTDDossierPage            = lazyPage(() => import('./components/CTDDossier/CTDDossierPage'));
const ContrabandRejectionPage   = lazyPage(() => import('./components/ContrabandRejection/ContrabandRejectionPage'));
const ShipmentEventLogPage      = lazyPage(() => import('./components/Logistics/ShipmentEventLogPage'));
const CN2223DeclarationPage     = lazyPage(() => import('./components/Logistics/CN2223DeclarationPage'));
const ComplianceAlertingPage    = lazyPage(() => import('./components/Alerts/ComplianceAlertingPage'));
const AuditPrepPage             = lazyPage(() => import('./components/AuditPrep/AuditPrepPage'));
const CoaRegisterPage           = lazyPage(() => import('./components/Coa/CoaRegisterPage'));
const OrgManagementPanel        = lazyPage(() => import('./components/Enterprise/OrgManagementPanel'));
const EnterpriseDashboardPage   = lazyPage(() => import('./components/Enterprise/EnterpriseDashboardPage'));
const PharmaIntegrationsPage    = lazyPage(() => import('./components/PharmaIntegrations/PharmaIntegrationsPage'));

type UnauthView = 'landing' | 'platform' | 'who' | 'about' | 'contact' | 'login' | 'signup';

/**
 * ONB-08's "Finish setting up" rows, and the page each one finishes on.
 *
 * Every row goes somewhere that can actually complete it, which is the
 * difference between a checklist and a list of links: Invitations opens
 * the invite register where a pending invitation can be resent or
 * revoked, Licence details opens Regulatory Affairs where the expiry
 * date the renewal alerts need is entered, and Starter records opens the
 * obligation register the starter rows were written into.
 *
 * 'import' is not here. It downloads the template rather than opening a
 * page, so App handles it directly.
 */
const FINISH_ROW_PAGES: Record<'invitations' | 'licence-details' | 'starter-records', PageId> = {
  invitations: 'company-invites',
  'licence-details': 'regulatory-affairs',
  'starter-records': 'obligations',
};

function isValidPageId(value: any): value is PageId {
  return (
    value === 'dashboard' ||
    value === 'products' ||
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
  const { user, profile, loading, isRecoveringPassword, isRecoveryCallback, isInitialPasswordSetup, refreshProfile, signOut } = useAuth();

  const inviteTokenFromUrl = (() => {
    try {
      if (appPath() !== '/invite/accept') return null;
      const params = new URLSearchParams(window.location.search);
      return params.get('token');
    } catch {
      return null;
    }
  })();

  const setupPasswordLink = (() => {
    try {
      return new URLSearchParams(window.location.search).get('setup') === '1';
    } catch {
      return false;
    }
  })();

  const passwordPreview = import.meta.env.DEV && (() => {
    try { return new URLSearchParams(window.location.search).get('preview-password') === '1'; }
    catch { return false; }
  })();

  const accessRequestsPath = (() => {
    try { return appPath() === '/access-requests'; } catch { return false; }
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
  const wantsLogin = (() => {
    try {
      return (SIGN_IN_PATHS as readonly string[]).includes(appPath());
    } catch {
      return false;
    }
  })();

  //  /dashboard, the workspace's own address. A signed-out visitor who
  //  asks for it gets the sign-in screen rather than the marketing page,
  //  the same way /onboarding behaves: they asked for the product, and
  //  the answer to "you need an account for that" is the way in.
  //
  //  This matters most the morning after. A bookmark on /dashboard, a
  //  session that has since expired, and without this the first thing
  //  the workspace shows its own user is an advertisement for itself.
  const wantsWorkspace = (() => {
    try {
      return appPath() === WORKSPACE_PATH;
    } catch {
      return false;
    }
  })();

  /*  TWO ADDRESSES, AND THE DIFFERENCE IS WHO THEY ARE FOR.

      /onboarding          the product. It needs an account: a signed-out
                           visitor is sent to the sign-in screen, not
                           shown a demonstration of a workspace they do
                           not have. Signing in lands them back here,
                           because the address does not change.

      /design/onboarding   the viewer, for showing the screen to people
                           without giving them a login. No account, no
                           data, nothing to sign in to.

      Keeping the demo on its own address is what lets /onboarding be a
      real route rather than a presentation. */
  const onboardingPath = (() => {
    try {
      return appPath();
    } catch {
      return '';
    }
  })();

  const wantsOnboardingHub =
    onboardingPath === '/onboarding' || onboardingPath === '/design/onboarding';

  /*  THE MARKETING SITE OWNS "/", SIGNED IN OR NOT.
      criateur.com is the front door: whoever types it gets the landing
      page. It used to depend on whether a session happened to be in the
      browser, so a signed-in visitor got the product — or, once the hub
      started claiming that slot, the onboarding screen under the
      marketing address. The home page of a company's website should not
      change depending on who is looking at it.
      The product is reached by its own addresses: /login to sign in,
      /onboarding to set up, and the workspace from there. */
  const wantsLandingPage = onboardingPath === '/';

  //  /onboarding opens on the sign-in form for a signed-out visitor, the
  //  same as /portal does. "Take me to onboarding" and "take me to the
  //  product" are the same request when there is no session.
  const [unauthView, setUnauthView] = useState<UnauthView>(
    wantsLogin || wantsOnboardingHub || wantsWorkspace ? 'login' : 'landing',
  );
  const [currentPage, setCurrentPage] = useRoutePersistence<PageId>('dashboard', isValidPageId);

  //  SIGNING OUT LANDS ON SIGN IN, not on the marketing home page.
  //
  //  unauthView is seeded ONCE, from the address at mount. Nobody signs
  //  out from /login — they sign out from /dashboard — so that seed was
  //  'landing', and the person who had just asked to leave the product
  //  was shown the front door of the website instead of the way back
  //  in. Getting back to work then meant knowing to type /login.
  //
  //  Only a real transition counts. A visitor who ARRIVES signed out
  //  still gets whatever their address asked for, which is what keeps
  //  "/" the marketing site for everybody. The ref is what tells the two
  //  apart: React cannot distinguish "signed out just now" from "was
  //  never signed in" by looking at `user` alone, since both are null.
  //
  //  An expired session arrives here too, and the sign-in screen is the
  //  right answer for that as well.
  //  SIGNING IN MOVES THE ADDRESS TO THE WORKSPACE, which is the other
  //  half of the same idea. Sign-in used to leave the bar reading
  //  /login with the dashboard on screen: the address named the screen
  //  you had just left, a reload looked like being signed out, and
  //  there was no URL to bookmark or to send anyone.
  //
  //  Only from a sign-in address. Somebody who signed in on a password
  //  recovery link, an invite acceptance or /onboarding is in the middle
  //  of something at an address that means something, and moving them to
  //  /dashboard would interrupt it. SetupHubGate sets /onboarding for
  //  itself when it opens, so a workspace that still needs setup ends up
  //  there regardless of this.
  const hadSession = useRef(false);
  useEffect(() => {
    if (!user) return;
    if (!wantsLogin) return;
    try { window.history.replaceState({}, '', appUrl(WORKSPACE_PATH)); }
    catch { /* history is unavailable in some embedded views */ }
  }, [user, wantsLogin]);

  useEffect(() => {
    if (user) { hadSession.current = true; return; }
    if (!hadSession.current) return;
    hadSession.current = false;
    setUnauthView('login');
    //  The address too, so a reload stays on sign-in rather than
    //  bouncing back to the landing page the old address still names.
    try { window.history.replaceState({}, '', appUrl('/login')); }
    catch { /* history is unavailable in some embedded views */ }
  }, [user]);
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

        //  /dashboard, not "/". The marketing site owns "/" for everyone,
        //  signed in or not, so sending someone there right after they
        //  accepted an invite showed them the company home page while
        //  setCurrentPage said dashboard: the address and the screen
        //  disagreed, and a reload resolved it the wrong way.
        window.history.replaceState({}, '', appUrl(WORKSPACE_PATH));
        setCurrentPage('dashboard');
      } catch {
        // keep token for retry
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /*  THERE IS ONE ONBOARDING SCREEN AND IT IS THE REAL ONE.
      /design/onboarding used to serve a viewer with a demonstration
      strip across the top — device toggles, buttons to tick steps, a
      PREVIEW banner. It is gone. A screen that cannot be filled in is
      not onboarding, and a banner saying so does not make it one. The
      alias still answers, so a link someone was given does not 404; it
      goes to the same place as /onboarding. */
  if (wantsOnboardingHub && !isSupabaseConfigured) {
    return <ConfigurationNeeded />;
  }

  /*  Everything past this point needs a backend. Saying so beats a
      spinner that never resolves or a login form that cannot work.
      The hub above is served first because it needs no database. */
  if (!isSupabaseConfigured) {
    return <ConfigurationNeeded />;
  }

  if (passwordPreview) {
    return <ResetPasswordPage initialSetup preview />;
  }

  if (loading) {
    return <BrandSplash />;
  }

  //  A recovery link signs the user in before they have proved they know a
  //  password, so this gate sits ABOVE every other branch — including the
  //  invite flow and the authenticated app. Anything lower would render the
  //  product to whoever opened the mailbox.
  if (setupPasswordLink || isInitialPasswordSetup) {
    return <ResetPasswordPage initialSetup />;
  }

  if (isRecoveringPassword || isRecoveryCallback) {
    return <ResetPasswordPage />;
  }

  if (accessRequestsPath) {
    return user
      ? <AccessRequestsPage />
      : <LoginPage
          onToggleSignup={() => setUnauthView('signup')}
          onRequestAccess={() => setUnauthView('contact')}
          onBackToLanding={() => setUnauthView('landing')}
        />;
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

  //  THE MARKETING SITE, which owns "/" whether or not someone is signed
  //  in, as well as every signed-out visit. Its sub-pages — Platform,
  //  Who it's for, About, Contact — are state rather than addresses, so
  //  they are served from inside this block too; routing "/" straight to
  //  the landing component would have made them unreachable.
  //  /login and /portal are sign-in entry points while the visitor is signed out.
  //  After sign-in, profile loading determines the destination: incomplete
  //  setup opens onboarding, while an already configured workspace opens the
  //  product. This avoids trapping a valid session on its entry form.
  //  /dashboard is included: asking for the workspace without a session
  //  is a request to sign in, not a reason to be shown the website.
  if ((wantsLogin || wantsWorkspace) && !user) {
    return (
      <LoginPage
        onToggleSignup={() => setUnauthView('signup')}
        onRequestAccess={() => setUnauthView('contact')}
        onBackToLanding={() => {
          try { window.history.replaceState({}, '', appUrl('/')); } catch { /* no history */ }
          setUnauthView('landing');
        }}
      />
    );
  }

  if (!user || wantsLandingPage) {
    //  Leaving the sign-in screen for the marketing site has to drop the
    //  /onboarding address with it. Otherwise the landing page renders
    //  under a URL that promises onboarding — which is exactly the
    //  "it just shows the landing page" confusion this route is meant to
    //  end.
    const backToLanding = () => {
      if (wantsOnboardingHub) {
        try { window.history.replaceState({}, '', appUrl('/')); } catch { /* no history */ }
      }
      setUnauthView('landing');
    };

    if (unauthView === 'signup') {
      return (
        <SignupPage
          onToggleLogin={() => setUnauthView('login')}
          onBackToLanding={backToLanding}
        />
      );
    }

    if (unauthView === 'login') {
      return (
        <LoginPage
          onToggleSignup={() => setUnauthView('signup')}
          onRequestAccess={() => setUnauthView('contact')}
          onBackToLanding={backToLanding}
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

  //  Signed in, but the product has no record of them. This used to be a
  //  spinner with a guess about email verification and a sign-out link —
  //  and nothing in the app could create the missing profile, so it was a
  //  dead end. WorkspaceSetupNeeded does the work instead.
  if (user && !profile) {
    return <WorkspaceSetupNeeded />;
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

  const setupDoneKey = `setup_done_${user?.id}`;

  /*  WHO SEES ONBOARDING: anyone who has not finished it.
      Two conditions used to narrow this and both were wrong for the
      flow as it stands.
        - onboarding_completed was required, from when the old wizard
          ran first and set it. The hub is what sets it now.
        - the role had to be Admin, Executive or Compliance. But
          provision_profile writes the least-privileged role by design,
          so the account a new signup creates was excluded from the
          onboarding meant for new signups: signing in went straight to
          an empty dashboard.
      Finishing the hub sets onboarding_completed, and "Finish later" is
      remembered per user, so neither path loops. */
  const needsSetup =
    profile &&
    !profile.onboarding_completed &&
    !localStorage.getItem(setupDoneKey);

  //  LOG IN → ONBOARDING. The v2 hub (ONB-00) is what you land on after
  //  signing in, and it is what /onboarding serves.
  //
  //  IT IS CHECKED BEFORE THE OLD WIZARD, which is the whole point.
  //  provision_profile writes onboarding_completed = false, so a brand
  //  new account matched the wizard's branch first and the hub was
  //  never reached — someone who asked for /onboarding got "Welcome
  //  aboard" instead, with no clue why.
  //
  //  The wizard still exists below for anyone mid-flow in it, but the
  //  hub now takes precedence: it collects the same industry and
  //  region, plus the four things the wizard never did, and finishing
  //  it marks onboarding complete so the wizard does not reappear.
  //
  //  It never blocks: "Finish later" opens the workspace and is
  //  remembered, so the hub does not return on every sign-in.
  if (wantsOnboardingHub || needsSetup) {
    return (
      <SetupHubGate
        companyId={profile?.company_id}
        userId={user?.id}
        //  ONB-05 shows the signed-in person as the first row of the
        //  team table — "Ada Okafor (you) · admin" — and their job
        //  title comes from ONB-01, not from their permission level.
        me={{
          email: user?.email ?? '',
          fullName: profile?.full_name ?? '',
          jobTitle: (profile as any)?.job_title ?? '',
        }}
        onFinish={(navigateTo?: string) => {
          localStorage.setItem(setupDoneKey, 'true');
          //  Leaving the hub has to leave its ADDRESS too. The route is
          //  read from window.location on every render, so finishing
          //  while the bar still says /onboarding would land straight
          //  back on the hub.
          //  TO /dashboard, for the same reason. "Go to dashboard" on the
          //  last onboarding screen put people on the marketing home
          //  page — the one screen in the flow that promises the
          //  workspace was the one that did not open it.
          if (wantsOnboardingHub) {
            try { window.history.replaceState({}, '', appUrl(WORKSPACE_PATH)); }
            catch { /* history is unavailable in some embedded views */ }
          }
          if (navigateTo) {
            window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: navigateTo } }));
          }
          refreshProfile();
        }}
      />
    );
  }

  //  ONB-08 · the dashboard, full stop.
  //
  //  THERE IS NO LONGER A BRANCH HERE, and removing it is the point.
  //  This used to choose between ONB-08 and the older DashboardPage by
  //  the industry on the signed-in person's PROFILE — and that profile
  //  field is set once, at sign-up, from a list that still offers
  //  "Advertising & Marketing Agency", "Financial Services" and
  //  "Logistics & Courier" from what this codebase used to be. So an
  //  account created before the product became a NAFDAC compliance tool
  //  carried an answer from a different product, and that stale answer
  //  silently decided which dashboard the workspace got. It took four
  //  rounds to find, because every branch of it fails without an error:
  //  you are simply shown a different screen.
  //
  //  Criateur onboards regulated manufacturers. This is their dashboard.
  //  One workspace, one dashboard, no condition in between.
  //
  //  DashboardPage is still in the repository, unrouted. If a workspace
  //  ever needs it, it belongs behind its own page and its own nav item,
  //  chosen deliberately — not behind a field nobody knows is deciding.
  //
  //  DECLARED ONCE AND USED TWICE, because the switch below ends in
  //  `default: dashboard`, so an unmatched PageId lands on the same
  //  screen rather than somewhere else.
  const dashboard = () => (
    <FirstRunDashboard
      companyId={profile?.company_id}
      userId={user?.id}
      //  The registry, at last. For as long as no products page existed
      //  this pointed at Regulatory Affairs — the nearest true
      //  destination, but a licence register and not this.
      onAddProduct={() => setCurrentPage('products')}
      onImportSpreadsheet={() => downloadImportTemplate()}
      onOpenRow={(key) => {
        if (key === 'import') { downloadImportTemplate(); return; }
        setCurrentPage(FINISH_ROW_PAGES[key]);
      }}
    />
  );

  const renderPage = () => {
    //  PM-03 ENFORCED ON THE ROUTE, NOT ONLY IN THE RAIL.
    //
    //  Hiding a sidebar item is a courtesy, not a control: the page id
    //  is reachable by a saved link, a KPI tile, a notification or the
    //  navigate-to event, and until now every one of those paths
    //  rendered the page regardless of who was asking. A Storekeeper
    //  could open QA disposition by any route except the one that was
    //  hidden from them.
    //
    //  This refuses the page itself. It is still not the last line —
    //  row-level security in the database is — but it closes the gap
    //  between what the rail offers and what the application serves.
    //
    //  Only pages PM-03 governs are checked; canOpenPage returns true
    //  for the rest, which keeps their existing gating in charge.
    if (pageRefused(profile, currentPage)) {
      return <AccessDenied />;
    }

    switch (currentPage) {
      case 'dashboard':
        return dashboard();

      //  The product registry, which ONB-08's first action opens.
      case 'products':
        return (
          <ProductsPage
            companyId={profile?.company_id}
            userId={user?.id}
            onOpenRegistrations={() => setCurrentPage('regulatory-affairs')}
            onImportSpreadsheet={() => downloadImportTemplate()}
          />
        );

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

      //  W4·17 and W4·18 share a screen because they are one
      //  question on the floor: which stage am I on, and may I start
      //  it. The clearance conditions sit above the strip for the
      //  same reason.
      //  W2·0. Roles and access are not a manufacturing screen — every
      //  workspace has people and permissions — so this is NOT behind
      //  the manufacturing gate the batch screens use.
      case 'access-control':
        return <AccessPage
          companyId={profile?.company_id}
          canDecide={perms.canManageRoles || isQaAuthority((profile as any)?.company_role)}
        />;

      //  W4·18. Calibration is the half of the floor gates that is a
      //  list of its own — clearance lives on the batch, and dispensing
      //  is a step inside running one.
      case 'instruments':
        return !isLogisticsProfile
          ? <InstrumentsPage companyId={profile?.company_id} />
          : <AccessDenied />;

      //  W4·19. The supervisor half: readings an operator escalated,
      //  waiting for a decision. Recording a reading is a floor action
      //  and belongs on the batch, not behind a dropdown here.
      case 'in-process':
        return !isLogisticsProfile
          ? <InprocessPage
              companyId={profile?.company_id}
              userId={user?.id}
              canDecide={isQaAuthority((profile as any)?.company_role)}
            />
          : <AccessDenied />;

      //  DB-01 DRAWS THESE FIVE AND NOTHING ANSWERS TO THEM YET.
      //  They are routes rather than dead rail labels, and each says
      //  plainly that the screen is not built. The alternative — point
      //  them at the nearest existing page — looks finished, which is
      //  how a gap gets demonstrated, filed against, and discovered
      //  only after somebody has built on it.
      case 'my-tasks':
        return <ScreenNotBuilt
          name="My tasks" designRef="DB-01"
          whatItWillDo={'Everything waiting on you — signatures, investigations, '
            + 'calibrations due and lots to disposition — in one list, ordered by what '
            + 'blocks other people first.'} />;
      case 'goods-receipt':
        return <ScreenNotBuilt
          name="Goods receipt" designRef="DB-01"
          whatItWillDo={'Booking a delivery in against its purchase order and supplier, '
            + 'raising the lot and putting it straight into quarantine.'} />;
      case 'qc-testing':
        return <ScreenNotBuilt
          name="QC testing" designRef="DB-01"
          whatItWillDo={'The testing queue and results per lot and per batch, against the '
            + 'specification each one was sampled under.'} />;
      case 'qa-disposition':
        return <ScreenNotBuilt
          name="QA disposition" designRef="DB-01"
          whatItWillDo={'The QA decision on a tested lot — release, reject or hold — with '
            + 'the signature that makes it a record.'} />;
      case 'traceability':
        return <ScreenNotBuilt
          name="Traceability" designRef="DB-01"
          whatItWillDo={'Forward and backward genealogy: which batches a lot went into, '
            + 'and every material that went into a batch.'} />;

      //  W4·15. Lots, and why a lot may or may not be released.
      case 'materials':
        return !isLogisticsProfile
          ? <MaterialsPage companyId={profile?.company_id} />
          : <AccessDenied />;

      //  The same gate Batch Release uses: these are manufacturing
      //  screens, and a logistics workspace has no batches to run.
      case 'batch-execution':
        return !isLogisticsProfile
          ? <BatchExecutionPage companyId={profile?.company_id} userId={user?.id} />
          : <AccessDenied />;

      //  W4·16. Comparing two versions is the question somebody
      //  actually arrives with, so it is the page.
      case 'master-formulas':
        return !isLogisticsProfile
          ? <MasterFormulaPage companyId={profile?.company_id} />
          : <AccessDenied />;

      //  W5·11. The register, the raise sheet and the investigation
      //  view. `isQa` governs whether the closure sign button is
      //  RENDERED — not whether it is enabled — because the database
      //  refuses a closure signature from a non-QA caller and a greyed
      //  button would invite an error nobody can act on. Same source
      //  of truth as batch release: the company-membership role, not
      //  the profile role.
      case 'deviations':
        return perms.canViewCapaManagement
          ? <DeviationsPage
              companyId={profile?.company_id}
              userId={user?.id}
              isQa={isQaAuthority((profile as any)?.company_role)}
            />
          : <AccessDenied />;

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
        return dashboard();
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
