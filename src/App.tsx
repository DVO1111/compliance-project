import * as Sentry from '@sentry/react';
import { getPermissions } from './lib/permissions';
import AccessDenied from './components/Common/AccessDenied';
import PageErrorFallback from './components/Common/PageErrorFallback';
import { useEffect, useState } from 'react';
import DepartmentsPage from './components/company/DepartmentsPage';
import { ThemeProvider } from './contexts/ThemeContext';
import { supabase } from './lib/supabase';
import OnboardingCompany from './pages/OnboardingCompany';
import AcceptInvitePage from './components/company/AcceptInvitePage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './components/Auth/LoginPage';
import SignupPage from './components/Auth/SignupPage';
import OnboardingWizard from './components/Onboarding/OnboardingWizard';
import CompanySetupChecklist from './components/Onboarding/CompanySetupChecklist';
import MainLayout from './components/Layout/MainLayout';
import type { PageId } from './components/Layout/MainLayout';
import AIDashboardPage from './components/Governance/AI/AIDashboardPage';
import DashboardPage from './components/Dashboard/DashboardPage';
import UploadPage from './components/Upload/UploadPage';
import ArchivePage from './components/Archive/ArchivePage';
import RegulationsPage from './components/Regulations/RegulationsPage';
import LegalReviewPage from './components/LegalReview/LegalReviewPage';
import CorrectionEditorPage from './components/CorrectionEditor/CorrectionEditorPage';
import MembersPage from './components/company/MembersPage';
import InvitesPage from './components/company/InvitesPage';
import TrainingLogPage from './components/Training/TrainingLogPage';
import ProfilePage from './components/Profile/ProfilePage';
import NotificationsPage from './components/Notifications/NotificationsPage';
import LicenseVaultPage from './components/LicenseVault/LicenseVaultPage';
import IntegrationsPage from './components/Integrations/IntegrationsPage';
import AuditTrailPage from './components/AuditTrail/AuditTrailPage';
import RoleManagementPage from './components/Roles/RoleManagementPage';
import ContentCalendarPage from './components/Calendar/ContentCalendarPage';
import TeamChatPage from './components/Chat/TeamChatPage';
import DriftMonitorPage from './components/DriftMonitor/DriftMonitorPage';
import ConsentManagementPage from './components/ConsentManagement/ConsentManagementPage';
import ContentBlocksPage from './components/ContentBlocks/ContentBlocksPage';
import AgencyPortalPage from './components/AgencyPortal/AgencyPortalPage';
import ComplianceReportingPage from './components/Reporting/ComplianceReportingPage';
import HorizonScanningPage from './components/HorizonScanning/HorizonScanningPage';
import ChannelRulesPage from './components/ChannelRules/ChannelRulesPage';
import RegulatoryLibraryPage from './components/RegulatoryLibrary/RegulatoryLibraryPage';
import TranslationCompliancePage from './components/TranslationCompliance/TranslationCompliancePage';
import CrisisResponsePage from './components/CrisisResponse/CrisisResponsePage';
import ProgrammaticAdPage from './components/ProgrammaticAd/ProgrammaticAdPage';
import WhistleblowerPage from './components/Whistleblower/WhistleblowerPage';
import PredictiveRiskPage from './components/PredictiveRisk/PredictiveRiskPage';
import SocialListeningPage from './components/SocialListening/SocialListeningPage';
import WebsiteMonitoringPage from './components/WebsiteMonitoring/WebsiteMonitoringPage';
import VendorScorecardPage from './components/VendorScorecard/VendorScorecardPage';
import CapaManagementPage from './components/CapaManagement/CapaManagementPage';
import TrainingSimulationPage from './components/TrainingSimulation/TrainingSimulationPage';
import ClaimExtractionPage from './components/ClaimExtraction/ClaimExtractionPage';
import SecretVaultPage from './components/Vault/SecretVaultPage';
import LegalMarketplacePage from './components/Marketplace/LegalMarketplacePage';
import LegalPartnerDashboard from './components/Marketplace/LegalPartnerDashboard';
import PartnerVerificationPage from './components/Marketplace/PartnerVerificationPage';
import PolicyAssistantPage from './components/PolicyAssistant/PolicyAssistantPage';
import GrcFrameworksPage from './components/GrcFrameworks/GrcFrameworksPage';
import GrcControlsPage from './components/GrcControls/GrcControlsPage';
import GrcDashboardPage from './components/GrcDashboard/GrcDashboardPage';
import GrcAutomationPage from './components/GrcAutomation/GrcAutomationPage';
import AIAssetsPage from './components/Governance/AI/AIAssetsPage';
import AIAssetDetailPage from './components/Governance/AI/AIAssetDetailPage';
import AIUsageLogsPage from './components/Governance/AI/AIUsageLogsPage';
import AIReviewsPage from './components/Governance/AI/AIReviewsPage';
import AIPromptTemplatesPage from './components/Governance/AI/AIPromptTemplatesPage';
import AIIncidentsPage from './components/Governance/AI/AIIncidentsPage';
import PoliciesPage from './components/Governance/Policies/PoliciesPage';
import PolicyDetailPage from './components/Governance/Policies/PolicyDetailPage';
import MyPoliciesPage from './components/Governance/Policies/MyPoliciesPage';
import VendorsPage from './components/Vendors/VendorsPage';
import VendorDetailPage from './components/Vendors/VendorDetailPage';
import AuditSessionsPage from './components/Governance/Audits/AuditSessionsPage';
import AuditSessionDetailPage from './components/Governance/Audits/AuditSessionDetailPage';
import RiskRegisterPage from './components/Governance/Risks/RiskRegisterPage';
import RiskDetailDrawer from './components/Governance/Risks/RiskDetailDrawer';
import CommandCenterPage from './components/Governance/CommandCenter/CommandCenterPage';
import ObligationListPage from './components/Governance/Obligations/ObligationListPage';
import ObligationDetailPage from './components/Governance/Obligations/ObligationDetailPage';
import IdentityProvidersPage from './components/Governance/Identity/IdentityProvidersPage';
import PlatformJobsPage from './components/Platform/PlatformJobsPage';
import RetentionPoliciesPage from './components/Governance/Retention/RetentionPoliciesPage';
import LegalHoldsPage from './components/Governance/LegalHold/LegalHoldsPage';
import GovernanceTimelinePage from './components/Governance/Timeline/GovernanceTimelinePage';
import WebhooksPage from './components/Platform/WebhooksPage';
import EvidenceIngestionsPage from './components/Platform/EvidenceIngestionsPage';
import EcosystemHubPage from './components/Platform/EcosystemHubPage';
import { useCalendarReminders } from './hooks/useCalendarReminders';
import { useRoutePersistence } from './hooks/useRoutePersistence';
import { applyDeepLinksFromUrl } from './integrations/utils/deepLinks';
import RealtimePopups from './components/Notifications/RealtimePopups';
import CompanySettingsPage from './components/company/CompanySettingsPage';
import BillingPage from './components/Billing/BillingPage';
import FeatureGate from './components/Billing/FeatureGate';
import BatchReleasePage from './components/BatchRelease/BatchReleasePage';
import ChangeControlPage from './components/ChangeControl/ChangeControlPage';
import SopLibraryPage from './components/SopLibrary/SopLibraryPage';
import ComingSoonPage from './components/Common/ComingSoonPage';
import AIInsightsPage from './components/Dashboard/AIInsightsPage';
import FrameworkLibraryPage from './components/FrameworkLibrary/FrameworkLibraryPage';
import ControlHealthDashboard from './components/ControlMonitoring/ControlHealthDashboard';
import RegulatoryAffairsPage from './components/RegulatoryAffairs/RegulatoryAffairsPage';
import GmpInspectionPage from './components/GmpInspection/GmpInspectionPage';
import SONCompliancePage from './components/SONCompliance/SONCompliancePage';
import CTDDossierPage from './components/CTDDossier/CTDDossierPage';
import ContrabandRejectionPage from './components/ContrabandRejection/ContrabandRejectionPage';
import ShipmentEventLogPage from './components/Logistics/ShipmentEventLogPage';
import CN2223DeclarationPage from './components/Logistics/CN2223DeclarationPage';
import ComplianceAlertingPage from './components/Alerts/ComplianceAlertingPage';
import AuditPrepPage from './components/AuditPrep/AuditPrepPage';

type UnauthView = 'landing' | 'login' | 'signup';

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
    value === 'audit-prep'
  );
}

function AppContent() {
  const { user, profile, loading, refreshProfile } = useAuth();

  const inviteTokenFromUrl = (() => {
    try {
      if (window.location.pathname !== '/invite/accept') return null;
      const params = new URLSearchParams(window.location.search);
      return params.get('token');
    } catch {
      return null;
    }
  })();

  const [unauthView, setUnauthView] = useState<UnauthView>('landing');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#002D62] to-[#00A86B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white"></div>
      </div>
    );
  }

  if (inviteTokenFromUrl !== null) {
    if (!user) {
      if (unauthView === 'login') {
        return (
          <LoginPage
            onToggleSignup={() => setUnauthView('signup')}
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
          onBackToLanding={() => setUnauthView('landing')}
        />
      );
    }

    return (
      <LandingPage
        onNavigateToLogin={() => setUnauthView('login')}
        onNavigateToSignup={() => setUnauthView('signup')}
      />
    );
  }

  if (user && !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#002D62] to-[#00A86B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white"></div>
      </div>
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
        return perms.canViewMembers ? <CompanySettingsPage /> : <AccessDenied />;

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
        return <BillingPage />;

      case 'license-vault':
        return perms.canViewLicenseVault ? <LicenseVaultPage /> : <AccessDenied />;

      case 'integrations':
        return perms.canViewLicenseVault ? (
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
        return perms.canViewGrcFrameworks ? <RiskRegisterPage /> : <AccessDenied />;

      case 'risk-detail':
        return perms.canViewGrcFrameworks ? <RiskDetailDrawer riskId={currentRiskId} onBack={() => setCurrentPage('risk-register')} /> : <AccessDenied />;

      case 'command-center':
        return perms.canViewAuditTrail ? <CommandCenterPage /> : <AccessDenied />;

      case 'obligations':
        return perms.canViewGrcFrameworks ? <ObligationListPage /> : <AccessDenied />;

      case 'obligation-detail':
        return perms.canViewGrcFrameworks ? <ObligationDetailPage obligationId={currentObligationId!} onBack={() => setCurrentPage('obligations')} /> : <AccessDenied />;

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
        return perms.canViewGrcFrameworks ? <ComplianceAlertingPage /> : <AccessDenied />;

      case 'audit-prep':
        return perms.canViewGrcFrameworks ? <AuditPrepPage /> : <AccessDenied />;

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
        {renderPage()}
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
