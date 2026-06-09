import { moduleAccessToPermissions } from './moduleAccess';

export type Permissions = {
  canViewMembers: boolean;
  canInvite: boolean;
  canRevokeInvite: boolean;
  canViewLegalReview: boolean;
  canUpload: boolean;
  canViewArchive: boolean;
  canViewTraining: boolean;
  canViewLicenseVault: boolean;
  canViewAuditTrail: boolean;
  canManageRoles: boolean;
  canViewDriftMonitor: boolean;
  canViewConsentManagement: boolean;
  canViewContentBlocks: boolean;
  canViewAgencyPortal: boolean;
  canViewComplianceReporting: boolean;
  canViewHorizonScanning: boolean;
  canViewChannelRules: boolean;
  canViewRegulatoryLibrary: boolean;
  canViewTranslationCompliance: boolean;
  canViewCrisisResponse: boolean;
  canViewProgrammaticAd: boolean;
  canViewWhistleblower: boolean;
  canViewPredictiveRisk: boolean;
  canViewSocialListening: boolean;
  canViewWebsiteMonitoring: boolean;
  canViewVendorScorecard: boolean;
  canViewCapaManagement: boolean;
  canViewTrainingSimulation: boolean;
  canViewClaimExtraction: boolean;
  canViewPharmaIntegrations: boolean;
  canViewGrcFrameworks: boolean;
  canManageGrcFrameworks: boolean;
  canViewGrcControls: boolean;
  canManageGrcControls: boolean;
  canViewGrcDashboard: boolean;
  canViewGrcAutomation: boolean;
  canManageGrcAutomation: boolean;
  canViewPolicies: boolean;
  canManagePolicies: boolean;
  canPublishPolicies: boolean;
  canViewMyPolicies: boolean;
  canViewVendors: boolean;
  canManageVendors: boolean;
  canViewAuditWorkspace: boolean;
  canManageAuditWorkspace: boolean;
  canViewIdentity: boolean;
  canManageIdentity: boolean;
  canViewAuditExports: boolean;
  canManageAuditExports: boolean;
  canViewPlatformJobs: boolean;
  canManagePlatformJobs: boolean;
  canViewRetention: boolean;
  canManageRetention: boolean;
  canViewLegalHold: boolean;
  canManageLegalHold: boolean;
  canViewGovernanceTimeline: boolean;
  canViewAIGovernance: boolean;
  canManageAIAssets: boolean;
  canViewAIUsage: boolean;
  canManageAIUsageReviews: boolean;
  canViewAIIncidents: boolean;
  canManageAIIncidents: boolean;
  canViewAIReviews: boolean;
  canManageAIReviews: boolean;
  canViewAIPrompts: boolean;
  canManageAIPrompts: boolean;
  canViewAIDashboard: boolean;
  canManageApiKeys: boolean;
  canViewWebhooks: boolean;
  canManageWebhooks: boolean;
  canViewEvidenceIngestions: boolean;
  canManageEvidenceIngestions: boolean;
  canViewEcosystem: boolean;
  canManageEcosystem: boolean;
};

/** Every permission key — used by the Role Management UI to render toggles */
export const ALL_PERMISSION_KEYS: { key: keyof Permissions; label: string; group: string }[] = [
  // Content
  { key: 'canUpload',          label: 'Upload Content',        group: 'Content' },
  { key: 'canViewArchive',     label: 'View Archive',          group: 'Content' },
  { key: 'canViewTraining',    label: 'View Training Log',     group: 'Content' },

  // Legal & Compliance
  { key: 'canViewLegalReview', label: 'View Legal Review',     group: 'Legal & Compliance' },
  { key: 'canViewAuditTrail',  label: 'View Audit Trail',      group: 'Legal & Compliance' },

  // Organisation
  { key: 'canViewMembers',     label: 'View Members',          group: 'Organisation' },
  { key: 'canInvite',          label: 'Send Invites',          group: 'Organisation' },
  { key: 'canRevokeInvite',    label: 'Revoke Invites',        group: 'Organisation' },
  { key: 'canViewLicenseVault',label: 'View License Vault',    group: 'Organisation' },

  // Administration
  { key: 'canManageRoles',     label: 'Manage Roles',          group: 'Administration' },

  // Monitoring & Compliance
  { key: 'canViewDriftMonitor',       label: 'View Drift Monitor',      group: 'Monitoring' },
  { key: 'canViewConsentManagement',  label: 'View Consent Management', group: 'Monitoring' },
  { key: 'canViewContentBlocks',      label: 'View Content Blocks',     group: 'Content' },

  // Advanced Features
  { key: 'canViewAgencyPortal',        label: 'View Agency Portal',         group: 'Agency' },
  { key: 'canViewComplianceReporting', label: 'View Compliance Reporting',  group: 'Reporting' },
  { key: 'canViewHorizonScanning',     label: 'View Horizon Scanning',     group: 'Monitoring' },
  { key: 'canViewChannelRules',        label: 'View Channel Rules',        group: 'Content' },
  { key: 'canViewRegulatoryLibrary',   label: 'View Regulatory Library',   group: 'Legal & Compliance' },
  { key: 'canViewTranslationCompliance', label: 'View Translation Compliance', group: 'Content' },
  { key: 'canViewCrisisResponse',       label: 'View Crisis Response',       group: 'Monitoring' },
  { key: 'canViewProgrammaticAd',       label: 'View Programmatic Ads',      group: 'Monitoring' },
  { key: 'canViewWhistleblower',        label: 'View Internal Reports',      group: 'Legal & Compliance' },
  { key: 'canViewPredictiveRisk',       label: 'View Predictive Risk',       group: 'Reporting' },

  // Batch 2 Features
  { key: 'canViewSocialListening',      label: 'View Social Listening',      group: 'Monitoring' },
  { key: 'canViewWebsiteMonitoring',    label: 'View Website Monitoring',    group: 'Monitoring' },
  { key: 'canViewVendorScorecard',      label: 'View Vendor Scorecard',      group: 'Agency' },
  { key: 'canViewCapaManagement',       label: 'View CAPA Management',       group: 'Legal & Compliance' },
  { key: 'canViewTrainingSimulation',   label: 'View Training Simulation',   group: 'Content' },
  { key: 'canViewClaimExtraction',      label: 'View Claim Extraction',      group: 'Legal & Compliance' },
  { key: 'canViewPharmaIntegrations',   label: 'View Pharma Integrations',   group: 'Agency' },
  { key: 'canViewGrcFrameworks',        label: 'View GRC Frameworks',        group: 'Legal & Compliance' },
  { key: 'canManageGrcFrameworks',      label: 'Manage GRC Frameworks',      group: 'Legal & Compliance' },
  { key: 'canViewGrcControls',          label: 'View GRC Controls',          group: 'Legal & Compliance' },
  { key: 'canManageGrcControls',        label: 'Manage GRC Controls',        group: 'Legal & Compliance' },
  { key: 'canViewGrcDashboard',         label: 'View GRC Dashboard',         group: 'Legal & Compliance' },
  { key: 'canViewGrcAutomation',        label: 'View GRC Automation',        group: 'Legal & Compliance' },
  { key: 'canManageGrcAutomation',      label: 'Manage GRC Automation',      group: 'Legal & Compliance' },

  // Governance
  { key: 'canViewPolicies',             label: 'View Policies',              group: 'Governance' },
  { key: 'canManagePolicies',           label: 'Manage Policies',            group: 'Governance' },
  { key: 'canPublishPolicies',          label: 'Publish Policies',           group: 'Governance' },
  { key: 'canViewMyPolicies',           label: 'View My Policies',           group: 'Governance' },
  { key: 'canViewVendors',              label: 'View Vendors',               group: 'Governance' },
  { key: 'canManageVendors',            label: 'Manage Vendors',             group: 'Governance' },
  { key: 'canViewAuditWorkspace',       label: 'View Audit Workspace',       group: 'Governance' },
  { key: 'canManageAuditWorkspace',     label: 'Manage Audit Workspace',     group: 'Governance' },
  { key: 'canViewIdentity',             label: 'View Identity Providers',    group: 'Governance' },
  { key: 'canManageIdentity',           label: 'Manage Identity Providers',  group: 'Governance' },
  { key: 'canViewAuditExports',         label: 'View Audit Exports',         group: 'Audit' },
  { key: 'canManageAuditExports',       label: 'Manage Audit Exports',       group: 'Audit' },
  { key: 'canViewPlatformJobs',         label: 'View Platform Jobs',         group: 'Platform' },
  { key: 'canManagePlatformJobs',       label: 'Manage Platform Jobs',       group: 'Platform' },
  { key: 'canViewEvidenceIngestions',   label: 'View Evidence Ingestions',  group: 'Platform' },
  { key: 'canManageEvidenceIngestions', label: 'Manage Evidence Ingestions',group: 'Platform' },
  { key: 'canViewEcosystem',            label: 'View Partner Ecosystem',    group: 'Platform' },
  { key: 'canManageEcosystem',          label: 'Manage Partner Ecosystem',  group: 'Platform' },
  { key: 'canViewRetention',            label: 'View Data Retention',        group: 'Governance' },
  { key: 'canManageRetention',          label: 'Manage Data Retention',      group: 'Governance' },
  { key: 'canViewLegalHold',            label: 'View Legal Holds',           group: 'Governance' },
  { key: 'canManageLegalHold',          label: 'Manage Legal Holds',         group: 'Governance' },
  { key: 'canViewGovernanceTimeline',   label: 'View Governance Timeline',   group: 'Governance' },
  { key: 'canViewAIGovernance',         label: 'View AI Governance',         group: 'AI Governance' },
  { key: 'canManageAIAssets',           label: 'Manage AI Assets',           group: 'AI Governance' },
  { key: 'canViewAIUsage',              label: 'View AI Usage Logs',         group: 'AI Governance' },
  { key: 'canViewAIIncidents',          label: 'View AI Incidents',          group: 'AI Governance' },
  { key: 'canManageAIIncidents',        label: 'Manage AI Incidents',        group: 'AI Governance' },
  { key: 'canViewAIReviews',            label: 'View AI Reviews',            group: 'AI Governance' },
  { key: 'canManageAIReviews',          label: 'Manage AI Reviews',          group: 'AI Governance' },
  { key: 'canViewAIPrompts',             label: 'View AI Prompts',            group: 'AI Governance' },
  { key: 'canManageAIPrompts',           label: 'Manage AI Prompts',          group: 'AI Governance' },
  { key: 'canViewAIDashboard',          label: 'View AI Dashboard',          group: 'AI Governance' },
  { key: 'canManageApiKeys',            label: 'Manage API Keys',            group: 'Administration' },
  { key: 'canViewWebhooks',             label: 'View Webhooks',              group: 'Platform' },
  { key: 'canManageWebhooks',           label: 'Manage Webhooks',            group: 'Platform' },
];

/** Default permission sets for legacy roles — matches pre-RBAC behaviour exactly */
export const SYSTEM_ROLE_DEFAULTS: Record<string, Permissions> = {
  marketing: {
    canViewMembers: true, canInvite: false, canRevokeInvite: false,
    canViewLegalReview: false, canUpload: true, canViewArchive: true,
    canViewTraining: true, canViewLicenseVault: false, canViewAuditTrail: false,
    canManageRoles: false, canViewDriftMonitor: false, canViewConsentManagement: false,
    canViewContentBlocks: true, canViewAgencyPortal: false,
    canViewComplianceReporting: false, canViewHorizonScanning: true,
    canViewChannelRules: false, canViewRegulatoryLibrary: true,
    canViewTranslationCompliance: true, canViewCrisisResponse: false,
    canViewProgrammaticAd: true, canViewWhistleblower: false, canViewPredictiveRisk: true,
    canViewSocialListening: true, canViewWebsiteMonitoring: false,
    canViewVendorScorecard: false, canViewCapaManagement: false,
    canViewTrainingSimulation: true, canViewClaimExtraction: false,
    canViewPharmaIntegrations: false,
    canViewGrcFrameworks: false, canManageGrcFrameworks: false,
    canViewGrcControls: false, canManageGrcControls: false,
    canViewGrcDashboard: false,
    canViewGrcAutomation: false, canManageGrcAutomation: false,
    canViewPolicies: true, canManagePolicies: false, canPublishPolicies: false,
    canViewMyPolicies: true,
    canViewVendors: false, canManageVendors: false,
    canViewAuditWorkspace: false, canManageAuditWorkspace: false,
    canViewIdentity: false, canManageIdentity: false,
    canViewAuditExports: false, canManageAuditExports: false,
    canViewPlatformJobs: false, canManagePlatformJobs: false,
    canViewRetention: false, canManageRetention: false,
    canViewLegalHold: false, canManageLegalHold: false,
    canViewGovernanceTimeline: true,
    canViewAIGovernance: false, canManageAIAssets: false,
    canViewAIUsage: false, canManageAIUsageReviews: false,
    canViewAIIncidents: false, canManageAIIncidents: false,
    canViewAIReviews: false, canManageAIReviews: false,
    canViewAIPrompts: false, canManageAIPrompts: false,
    canViewAIDashboard: false,
    canManageApiKeys: false,
    canViewWebhooks: false, canManageWebhooks: false,
    canViewEvidenceIngestions: false, canManageEvidenceIngestions: false,
    canViewEcosystem: false, canManageEcosystem: false,
  },
  compliance: {
    canViewMembers: true, canInvite: false, canRevokeInvite: false,
    canViewLegalReview: true, canUpload: false, canViewArchive: false,
    canViewTraining: false, canViewLicenseVault: false, canViewAuditTrail: true,
    canManageRoles: false, canViewDriftMonitor: true, canViewConsentManagement: true,
    canViewContentBlocks: false, canViewAgencyPortal: true,
    canViewComplianceReporting: true, canViewHorizonScanning: true,
    canViewChannelRules: true, canViewRegulatoryLibrary: true,
    canViewTranslationCompliance: true, canViewCrisisResponse: true,
    canViewProgrammaticAd: true, canViewWhistleblower: true, canViewPredictiveRisk: true,
    canViewSocialListening: true, canViewWebsiteMonitoring: true,
    canViewVendorScorecard: true, canViewCapaManagement: true,
    canViewTrainingSimulation: true, canViewClaimExtraction: true,
    canViewPharmaIntegrations: true,
    canViewGrcFrameworks: true, canManageGrcFrameworks: true,
    canViewGrcControls: true, canManageGrcControls: true,
    canViewGrcDashboard: true,
    canViewGrcAutomation: true, canManageGrcAutomation: true,
    canViewPolicies: true, canManagePolicies: true, canPublishPolicies: true,
    canViewMyPolicies: true,
    canViewVendors: true, canManageVendors: true,
    canViewAuditWorkspace: true, canManageAuditWorkspace: true,
    canViewIdentity: true, canManageIdentity: true,
    canViewAuditExports: true, canManageAuditExports: true,
    canViewPlatformJobs: true, canManagePlatformJobs: false,
    canViewRetention: true, canManageRetention: true,
    canViewLegalHold: true, canManageLegalHold: true,
    canViewGovernanceTimeline: true,
    canViewAIGovernance: true, canManageAIAssets: true,
    canViewAIUsage: true, canManageAIUsageReviews: true,
    canViewAIIncidents: true, canManageAIIncidents: true,
    canViewAIReviews: true, canManageAIReviews: true,
    canViewAIPrompts: true, canManageAIPrompts: true,
    canViewAIDashboard: true,
    canManageApiKeys: true,
    canViewWebhooks: true, canManageWebhooks: true,
    canViewEvidenceIngestions: true, canManageEvidenceIngestions: true,
    canViewEcosystem: true, canManageEcosystem: true,
  },
  executive: {
    canViewMembers: true, canInvite: true, canRevokeInvite: true,
    canViewLegalReview: true, canUpload: false, canViewArchive: true,
    canViewTraining: false, canViewLicenseVault: true, canViewAuditTrail: true,
    canManageRoles: true, canViewDriftMonitor: true, canViewConsentManagement: true,
    canViewContentBlocks: true, canViewAgencyPortal: true,
    canViewComplianceReporting: true, canViewHorizonScanning: true,
    canViewChannelRules: true, canViewRegulatoryLibrary: true,
    canViewTranslationCompliance: true, canViewCrisisResponse: true,
    canViewProgrammaticAd: true, canViewWhistleblower: true, canViewPredictiveRisk: true,
    canViewSocialListening: true, canViewWebsiteMonitoring: true,
    canViewVendorScorecard: true, canViewCapaManagement: true,
    canViewTrainingSimulation: true, canViewClaimExtraction: true,
    canViewPharmaIntegrations: true,
    canViewGrcFrameworks: true, canManageGrcFrameworks: true,
    canViewGrcControls: true, canManageGrcControls: true,
    canViewGrcDashboard: true,
    canViewGrcAutomation: true, canManageGrcAutomation: true,
    canViewPolicies: true, canManagePolicies: true, canPublishPolicies: true,
    canViewMyPolicies: true,
    canViewVendors: true, canManageVendors: true,
    canViewAuditWorkspace: true, canManageAuditWorkspace: true,
    canViewIdentity: true, canManageIdentity: true,
    canViewAuditExports: true, canManageAuditExports: true,
    canViewPlatformJobs: true, canManagePlatformJobs: true,
    canViewRetention: true, canManageRetention: true,
    canViewLegalHold: true, canManageLegalHold: true,
    canViewGovernanceTimeline: true,
    canViewAIGovernance: true, canManageAIAssets: true,
    canViewAIUsage: true, canManageAIUsageReviews: true,
    canViewAIIncidents: true, canManageAIIncidents: true,
    canViewAIReviews: true, canManageAIReviews: true,
    canViewAIPrompts: true, canManageAIPrompts: true,
    canViewAIDashboard: true,
    canManageApiKeys: true,
    canViewWebhooks: true, canManageWebhooks: true,
    canViewEvidenceIngestions: true, canManageEvidenceIngestions: true,
    canViewEcosystem: true, canManageEcosystem: true,
  },
  agency: {
    canViewMembers: false, canInvite: false, canRevokeInvite: false,
    canViewLegalReview: false, canUpload: true, canViewArchive: true,
    canViewTraining: false, canViewLicenseVault: false, canViewAuditTrail: false,
    canManageRoles: false, canViewDriftMonitor: false, canViewConsentManagement: false,
    canViewContentBlocks: true, canViewAgencyPortal: true,
    canViewComplianceReporting: false, canViewHorizonScanning: false,
    canViewChannelRules: false, canViewRegulatoryLibrary: false,
    canViewTranslationCompliance: false, canViewCrisisResponse: false,
    canViewProgrammaticAd: false, canViewWhistleblower: false, canViewPredictiveRisk: false,
    canViewSocialListening: false, canViewWebsiteMonitoring: false,
    canViewVendorScorecard: false, canViewCapaManagement: false,
    canViewTrainingSimulation: false, canViewClaimExtraction: false,
    canViewPharmaIntegrations: false,
    canViewGrcFrameworks: false, canManageGrcFrameworks: false,
    canViewGrcControls: false, canManageGrcControls: false,
    canViewGrcDashboard: false,
    canViewGrcAutomation: false, canManageGrcAutomation: false,
    canViewPolicies: true, canManagePolicies: false, canPublishPolicies: false,
    canViewMyPolicies: true,
    canViewVendors: false, canManageVendors: false,
    canViewAuditWorkspace: false, canManageAuditWorkspace: false,
    canViewIdentity: false, canManageIdentity: false,
    canViewAuditExports: false, canManageAuditExports: false,
    canViewPlatformJobs: false, canManagePlatformJobs: false,
    canViewRetention: false, canManageRetention: false,
    canViewLegalHold: false, canManageLegalHold: false,
    canViewGovernanceTimeline: false,
    canViewAIGovernance: false, canManageAIAssets: false,
    canViewAIUsage: false, canManageAIUsageReviews: false,
    canViewAIIncidents: false, canManageAIIncidents: false,
    canViewAIReviews: false, canManageAIReviews: false,
    canViewAIPrompts: false, canManageAIPrompts: false,
    canViewAIDashboard: false,
    canManageApiKeys: false,
    canViewWebhooks: false, canManageWebhooks: false,
    canViewEvidenceIngestions: false, canManageEvidenceIngestions: false,
    canViewEcosystem: false, canManageEcosystem: false,
  },
  auditor: {
    canViewMembers: false, canInvite: false, canRevokeInvite: false,
    canViewLegalReview: false, canUpload: false, canViewArchive: false,
    canViewTraining: false, canViewLicenseVault: false, canViewAuditTrail: false,
    canManageRoles: false, canViewDriftMonitor: false, canViewConsentManagement: false,
    canViewContentBlocks: false, canViewAgencyPortal: false,
    canViewComplianceReporting: false, canViewHorizonScanning: false,
    canViewChannelRules: false, canViewRegulatoryLibrary: false,
    canViewTranslationCompliance: false, canViewCrisisResponse: false,
    canViewProgrammaticAd: false, canViewWhistleblower: false, canViewPredictiveRisk: false,
    canViewSocialListening: false, canViewWebsiteMonitoring: false,
    canViewVendorScorecard: false, canViewCapaManagement: false,
    canViewTrainingSimulation: false, canViewClaimExtraction: false,
    canViewPharmaIntegrations: false,
    canViewGrcFrameworks: false, canManageGrcFrameworks: false,
    canViewGrcControls: false, canManageGrcControls: false,
    canViewGrcDashboard: false,
    canViewGrcAutomation: false, canManageGrcAutomation: false,
    canViewPolicies: false, canManagePolicies: false, canPublishPolicies: false,
    canViewMyPolicies: false,
    canViewVendors: false, canManageVendors: false,
    canViewAuditWorkspace: true, canManageAuditWorkspace: false,
    canViewIdentity: false, canManageIdentity: false,
    canViewAuditExports: true, canManageAuditExports: false,
    canViewPlatformJobs: false, canManagePlatformJobs: false,
    canViewRetention: false, canManageRetention: false,
    canViewLegalHold: false, canManageLegalHold: false,
    canViewGovernanceTimeline: true,
    canViewAIGovernance: false, canManageAIAssets: false,
    canViewAIUsage: false, canManageAIUsageReviews: false,
    canViewAIIncidents: false, canManageAIIncidents: false,
    canViewAIReviews: false, canManageAIReviews: false,
    canViewAIPrompts: false, canManageAIPrompts: false,
    canViewAIDashboard: true,
    canManageApiKeys: false,
    canViewWebhooks: true,
    canManageWebhooks: false,
    canViewEvidenceIngestions: true,
    canManageEvidenceIngestions: false,
    canViewEcosystem: true,
    canManageEcosystem: false,
  },
};

/** All-false baseline */
export const EMPTY_PERMISSIONS: Permissions = {
  canViewMembers: false, canInvite: false, canRevokeInvite: false,
  canViewLegalReview: false, canUpload: false, canViewArchive: false,
  canViewTraining: false, canViewLicenseVault: false, canViewAuditTrail: false,
  canManageRoles: false, canViewDriftMonitor: false, canViewConsentManagement: false,
  canViewContentBlocks: false, canViewAgencyPortal: false,
  canViewComplianceReporting: false, canViewHorizonScanning: false,
  canViewChannelRules: false, canViewRegulatoryLibrary: false,
  canViewTranslationCompliance: false, canViewCrisisResponse: false,
  canViewProgrammaticAd: false, canViewWhistleblower: false, canViewPredictiveRisk: false,
  canViewSocialListening: false, canViewWebsiteMonitoring: false,
  canViewVendorScorecard: false, canViewCapaManagement: false,
  canViewTrainingSimulation: false, canViewClaimExtraction: false,
  canViewPharmaIntegrations: false,
  canViewGrcFrameworks: false, canManageGrcFrameworks: false,
  canViewGrcControls: false, canManageGrcControls: false,
  canViewGrcDashboard: false,
  canViewGrcAutomation: false, canManageGrcAutomation: false,
  canViewPolicies: false, canManagePolicies: false, canPublishPolicies: false,
  canViewMyPolicies: false,
  canViewVendors: false, canManageVendors: false,
  canViewAuditWorkspace: false, canManageAuditWorkspace: false,
  canViewIdentity: false, canManageIdentity: false,
  canViewAuditExports: false, canManageAuditExports: false,
  canViewPlatformJobs: false, canManagePlatformJobs: false,
  canViewRetention: false, canManageRetention: false,
  canViewLegalHold: false, canManageLegalHold: false,
  canViewGovernanceTimeline: false,
  canViewAIGovernance: false,
  canManageAIAssets: false,
  canViewAIUsage: false,
  canManageAIUsageReviews: false,
  canViewAIIncidents: false,
  canManageAIIncidents: false,
  canViewAIReviews: false,
  canManageAIReviews: false,
  canViewAIPrompts: false,
  canManageAIPrompts: false,
  canViewAIDashboard: false,
  canManageApiKeys: false,
  canViewWebhooks: false,
  canManageWebhooks: false,
  canViewEvidenceIngestions: false,
  canManageEvidenceIngestions: false,
  canViewEcosystem: false,
  canManageEcosystem: false,
};

function norm(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
}

/** Map any legacy role string to its canonical key */
function canonicalRole(role: string): string {
  const r = norm(role);
  if (r === "marketing") return "marketing";
  if (r === "compliance" || r === "legal") return "compliance";
  if (r === "executive" || r === "exec" || r === "owner" || r === "admin") return "executive";
  if (r === "agency" || r === "external" || r === "vendor") return "agency";
  if (r === "auditor") return "auditor";
  return r;
}

/** Permission keys suppressed for Logistics & Courier companies (pharma/content-marketing features) */
const LOGISTICS_SUPPRESSED: (keyof Permissions)[] = [
  'canViewPharmaIntegrations',
  'canViewClaimExtraction',
  'canViewAgencyPortal',
  'canViewChannelRules',
  'canViewTranslationCompliance',
  'canViewProgrammaticAd',
  'canViewSocialListening',
  'canViewWebsiteMonitoring',
  'canViewContentBlocks',
];

function applyIndustrySuppression(perms: Permissions, industryType?: string | null): Permissions {
  if (!industryType) return perms;
  const industry = industryType.trim().toLowerCase();
  if (industry === 'logistics & courier') {
    const suppressed = { ...perms };
    for (const key of LOGISTICS_SUPPRESSED) suppressed[key] = false as never;
    return suppressed;
  }
  return perms;
}

/**
 * Resolve permissions for a user.
 *
 * Priority:
 *   1. `moduleAccess` string[] (from company_members, set at invite time) — highest priority
 *   2. `customPermissions` (from custom_roles JSONB) — if a custom role is assigned
 *   3. Legacy `profileRole` string → SYSTEM_ROLE_DEFAULTS lookup
 *   4. All-false fallback
 *
 * After role resolution, `industryType` applies a suppression overlay that
 * hides sector-irrelevant modules (e.g. pharma/content modules for logistics companies).
 */
export function getPermissions(opts?: {
  profileRole?: string | null;
  customPermissions?: Partial<Permissions> | null;
  moduleAccess?: string[] | null;
  industryType?: string | null;
}): Permissions {
  let base: Permissions;

  // Path 1: module-level access assigned at invite time
  if (opts?.moduleAccess && opts.moduleAccess.length > 0) {
    base = moduleAccessToPermissions(opts.moduleAccess);
  } else if (opts?.customPermissions) {
    // Path 2: custom role permissions override legacy role
    base = { ...EMPTY_PERMISSIONS, ...opts.customPermissions };
  } else {
    // Path 3: legacy role string
    const canon = canonicalRole(opts?.profileRole ?? '');
    base = SYSTEM_ROLE_DEFAULTS[canon] ?? { ...EMPTY_PERMISSIONS };
  }

  return applyIndustrySuppression(base, opts?.industryType);
}
