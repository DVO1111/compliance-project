/**
 * plans.ts
 *
 * Single source of truth for all plan tiers, feature flags, and limits.
 * Used by usePlan hook, BillingPage, UpgradeModal, and any feature gate.
 */

export type PlanId = 'trial' | 'starter' | 'growth' | 'enterprise';

export type PlanFeature =
  | 'ai_analysis'
  | 'multi_jurisdiction'
  | 'audit_export'
  | 'legal_review'
  | 'grc_frameworks'
  | 'sso'
  | 'custom_integrations'
  | 'multi_brand'
  | 'advanced_reporting'
  | 'compliance_reporting'
  | 'horizon_scanning'
  | 'api_access';

export interface PlanConfig {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number | null; // null = contact sales
  currency: 'USD';
  seatLimit: number | null;    // null = unlimited
  brandLimit: number | null;   // null = unlimited
  features: PlanFeature[];
  highlights: string[];
  badge?: string;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  trial: {
    id: 'trial',
    name: 'Trial',
    tagline: 'Explore the full platform free for 14 days',
    priceMonthly: 0,
    currency: 'USD',
    seatLimit: 3,
    brandLimit: 1,
    features: [],
    highlights: [
      'Up to 3 users',
      '1 brand',
      'Core compliance engine',
      'NAFDAC rule set',
      'Basic audit trail',
      '14-day access',
    ],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'For small compliance teams',
    priceMonthly: 299,
    currency: 'USD',
    seatLimit: 5,
    brandLimit: 1,
    features: ['audit_export', 'compliance_reporting'],
    highlights: [
      'Up to 5 users',
      '1 brand',
      'Core compliance engine',
      'NAFDAC rule set',
      'Audit trail + PDF export',
      'Compliance reporting',
      'Email support',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    tagline: 'For scaling compliance operations',
    priceMonthly: 799,
    currency: 'USD',
    seatLimit: null,
    brandLimit: null,
    features: [
      'ai_analysis',
      'multi_jurisdiction',
      'audit_export',
      'legal_review',
      'grc_frameworks',
      'multi_brand',
      'advanced_reporting',
      'compliance_reporting',
      'horizon_scanning',
    ],
    highlights: [
      'Unlimited users',
      'Multiple brands',
      'Full compliance engine',
      'All jurisdictions (NAFDAC, FDA, EMA, WHO)',
      'AI-powered analysis',
      'Immutable audit trail + export',
      'Legal review workflows',
      'GRC framework management',
      'Horizon scanning & drift monitor',
      'Priority support',
    ],
    badge: 'Most Popular',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For large regulated organisations',
    priceMonthly: null,
    currency: 'USD',
    seatLimit: null,
    brandLimit: null,
    features: [
      'ai_analysis',
      'multi_jurisdiction',
      'audit_export',
      'legal_review',
      'grc_frameworks',
      'sso',
      'custom_integrations',
      'multi_brand',
      'advanced_reporting',
      'compliance_reporting',
      'horizon_scanning',
      'api_access',
    ],
    highlights: [
      'Everything in Growth',
      'SSO / SAML integration',
      'API access',
      'Dedicated Customer Success Manager',
      'Custom SLA guarantee',
      'On-premise deployment option',
      'Custom integrations',
      'Regulatory advisory hours',
      '24/7 phone support',
    ],
  },
};

/** Ordered upgrade path */
export const PLAN_ORDER: PlanId[] = ['trial', 'starter', 'growth', 'enterprise'];

export function planHasFeature(planId: PlanId | null | undefined, feature: PlanFeature): boolean {
  if (!planId) return false;
  return PLANS[planId]?.features.includes(feature) ?? false;
}

/** Returns the next plan above currentPlan, or null if already on enterprise */
export function getNextPlan(currentPlan: PlanId): PlanId | null {
  const idx = PLAN_ORDER.indexOf(currentPlan);
  return idx >= 0 && idx < PLAN_ORDER.length - 1 ? PLAN_ORDER[idx + 1] : null;
}

/** Returns true if targetPlan is strictly higher than currentPlan */
export function isPlanUpgrade(currentPlan: PlanId, targetPlan: PlanId): boolean {
  return PLAN_ORDER.indexOf(targetPlan) > PLAN_ORDER.indexOf(currentPlan);
}

/** Minimum plan that includes a given feature */
export function minimumPlanForFeature(feature: PlanFeature): PlanId | null {
  for (const planId of PLAN_ORDER) {
    if (PLANS[planId].features.includes(feature)) return planId;
  }
  return null;
}
