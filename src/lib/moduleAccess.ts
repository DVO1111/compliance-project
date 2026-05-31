/**
 * moduleAccess.ts
 *
 * Defines the 7 module bundles an admin can assign when inviting a user.
 * Each bundle maps to a set of Permissions flags.
 *
 * This is Option A (module-level access) from the Sprint 4 design.
 * Option B (per-permission) remains achievable via custom_roles JSONB.
 */

import type { Permissions } from './permissions';
import { EMPTY_PERMISSIONS } from './permissions';

export const MODULE_KEYS = [
  'content_review',
  'legal_review',
  'compliance_reporting',
  'risk_governance',
  'policy_management',
  'vendor_management',
  'ai_governance',
] as const;

export type ModuleKey = typeof MODULE_KEYS[number];

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  description: string;
  /** Lucide icon name (string only — caller imports the icon) */
  icon: string;
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    key: 'content_review',
    name: 'Content & Review',
    description: 'Upload content, view archive, submit for compliance review',
    icon: 'Upload',
  },
  {
    key: 'legal_review',
    name: 'Legal Review',
    description: 'Review queue, approve/reject submissions, correction editor',
    icon: 'Scale',
  },
  {
    key: 'compliance_reporting',
    name: 'Compliance Reports',
    description: 'Compliance reports, audit trail, evidence export',
    icon: 'BarChart3',
  },
  {
    key: 'risk_governance',
    name: 'Risk & Governance',
    description: 'Risk register, obligations, command center, governance timeline',
    icon: 'ShieldAlert',
  },
  {
    key: 'policy_management',
    name: 'Policies',
    description: 'View, manage, and publish company policies',
    icon: 'FileText',
  },
  {
    key: 'vendor_management',
    name: 'Vendors',
    description: 'Vendor list, contracts, expiry tracking',
    icon: 'Building2',
  },
  {
    key: 'ai_governance',
    name: 'AI Governance',
    description: 'AI assets, usage logs, incidents, reviews, and prompts',
    icon: 'BrainCircuit',
  },
];

/**
 * Maps each module key to the Permissions flags it enables.
 * An invited user receives the union of all flags across their assigned modules.
 */
export const MODULE_TO_PERMISSIONS: Record<ModuleKey, Partial<Permissions>> = {
  content_review: {
    canUpload: true,
    canViewArchive: true,
    canViewContentBlocks: true,
    canViewTraining: true,
    canViewTrainingSimulation: true,
  },
  legal_review: {
    canViewLegalReview: true,
    canViewAuditTrail: true,
    canViewChannelRules: true,
    canViewConsentManagement: true,
    canViewClaimExtraction: true,
  },
  compliance_reporting: {
    canViewComplianceReporting: true,
    canViewAuditTrail: true,
    canViewAuditExports: true,
    canViewGovernanceTimeline: true,
    canViewRegulatoryLibrary: true,
    canViewHorizonScanning: true,
  },
  risk_governance: {
    canViewGrcFrameworks: true,
    canViewGrcControls: true,
    canViewGrcDashboard: true,
    canViewGrcAutomation: true,
    canViewDriftMonitor: true,
    canViewGovernanceTimeline: true,
    canViewWhistleblower: true,
    canViewPredictiveRisk: true,
    canViewCapaManagement: true,
  },
  policy_management: {
    canViewPolicies: true,
    canViewMyPolicies: true,
    canManagePolicies: true,
    canPublishPolicies: true,
  },
  vendor_management: {
    canViewVendors: true,
    canManageVendors: true,
    canViewVendorScorecard: true,
  },
  ai_governance: {
    canViewAIGovernance: true,
    canViewAIUsage: true,
    canViewAIDashboard: true,
    canViewAIIncidents: true,
    canViewAIReviews: true,
    canViewAIPrompts: true,
  },
};

/**
 * Convert an array of module keys into a flat Permissions object.
 * Used by getPermissions() as the highest-priority resolution path.
 */
export function moduleAccessToPermissions(modules: string[]): Permissions {
  const merged: Permissions = { ...EMPTY_PERMISSIONS };

  for (const key of modules) {
    const flags = MODULE_TO_PERMISSIONS[key as ModuleKey];
    if (flags) {
      Object.assign(merged, flags);
    }
  }

  return merged;
}

/**
 * Returns the display label for a module key, with a safe fallback.
 */
export function getModuleLabel(key: string): string {
  return MODULE_DEFINITIONS.find(m => m.key === key)?.name ?? key;
}
