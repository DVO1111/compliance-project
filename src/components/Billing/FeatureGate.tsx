/**
 * FeatureGate
 *
 * Wraps a page or section. If the current plan includes the feature, renders
 * children. Otherwise renders a full upgrade wall with plan details and CTA.
 *
 * Usage in App.tsx:
 *   case 'legal-review':
 *     return (
 *       <FeatureGate feature="legal_review" featureLabel="Legal Review Workflow">
 *         <LegalReviewPage />
 *       </FeatureGate>
 *     );
 */

import { Lock, Zap, CheckCircle, ArrowRight, Loader2, Mail } from 'lucide-react';
import { usePlan } from '../../hooks/usePlan';
import { PLANS, minimumPlanForFeature, type PlanFeature } from '../../lib/plans';

// Per-feature copy shown inside the upgrade wall
const FEATURE_DESCRIPTIONS: Partial<Record<PlanFeature, string>> = {
  ai_analysis:
    'AI-powered compliance analysis scans your content against regulatory rules, surfaces risk patterns, and generates actionable findings — automatically.',
  legal_review:
    'Route submissions through a structured legal review workflow with SLA tracking, version diffs, annotations, and multi-step approvals.',
  grc_frameworks:
    'Map your GRC controls to industry frameworks, track evidence, automate control testing, and view your full compliance posture in one place.',
  horizon_scanning:
    'Monitor regulatory changes across jurisdictions in real time, detect compliance drift before it becomes a violation.',
  compliance_reporting:
    'Generate detailed compliance reports for any time period — exportable as PDF, ready for regulatory submissions.',
  sso:
    'Connect your identity provider (Okta, Azure AD, Google Workspace) via SAML/SSO so your team logs in with their existing corporate credentials.',
  custom_integrations:
    'Build custom webhooks, API integrations, and data pipelines to connect Criateur OS with your existing compliance and security stack.',
  api_access:
    'Programmatic access to audit events, submissions, and risk data via REST API — push events to your SIEM, GRC tool, or BI platform.',
  audit_export:
    'Export sealed, tamper-evident audit packages as JSON or PDF — formatted for regulatory submission.',
  multi_jurisdiction:
    'Run scans against FDA, EMA, and WHO rule sets in addition to NAFDAC — get jurisdiction-by-jurisdiction compliance breakdowns.',
};

interface FeatureGateProps {
  feature: PlanFeature;
  /** Human-readable name shown in the upgrade wall heading */
  featureLabel: string;
  children: React.ReactNode;
}

export default function FeatureGate({ feature, featureLabel, children }: FeatureGateProps) {
  const { canAccess, isLoading } = usePlan();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }

  if (canAccess(feature)) {
    return <>{children}</>;
  }

  // Determine minimum plan required and build the wall
  const requiredPlanId = minimumPlanForFeature(feature);
  const requiredPlan = requiredPlanId ? PLANS[requiredPlanId] : PLANS['growth'];
  const isEnterprise = requiredPlanId === 'enterprise';
  const description = FEATURE_DESCRIPTIONS[feature] ?? `${featureLabel} is a premium feature on the ${requiredPlan.name} plan.`;

  return (
    <div className="flex items-start justify-center min-h-[60vh] py-12 px-4">
      <div className="w-full max-w-2xl space-y-6">

        {/* Lock header */}
        <div className="text-center space-y-3">
          <div
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-lg"
            style={{ background: 'var(--color-accent-soft)' }}
          >
            <Lock className="w-8 h-8 text-[var(--color-accent)]" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-1">
              {requiredPlan.name} Plan Required
            </p>
            <h1 className="text-2xl font-bold dash-text">{featureLabel}</h1>
            <p className="text-sm dash-text-secondary mt-2 leading-relaxed max-w-md mx-auto">
              {description}
            </p>
          </div>
        </div>

        {/* Plan card */}
        <div className="dash-card border dash-border rounded-2xl shadow-sm overflow-hidden">
          {/* Accent strip */}
          <div className="h-1 w-full" style={{ background: 'var(--color-accent)' }} />

          <div className="p-6 space-y-5">
            {/* Plan name + price */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-0.5">
                  {requiredPlan.name}
                </p>
                <p className="text-sm dash-text-secondary">{requiredPlan.tagline}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-extrabold dash-text">
                  {requiredPlan.priceMonthly === null
                    ? 'Custom'
                    : requiredPlan.priceMonthly === 0
                    ? 'Free'
                    : `$${requiredPlan.priceMonthly.toLocaleString()}`}
                </p>
                {requiredPlan.priceMonthly !== null && requiredPlan.priceMonthly > 0 && (
                  <p className="text-xs dash-text-tertiary">/month</p>
                )}
              </div>
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {requiredPlan.highlights.slice(0, 6).map((h) => (
                <div key={h} className="flex items-center gap-2 text-sm dash-text-secondary">
                  <CheckCircle className="w-3.5 h-3.5 text-[var(--color-success)] flex-shrink-0" />
                  {h}
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex items-center gap-3 pt-2 flex-wrap">
              {isEnterprise ? (
                <a
                  href="mailto:sales@criateur.io?subject=Enterprise enquiry"
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: 'var(--color-accent)' }}
                >
                  <Mail className="w-4 h-4" />
                  Contact Sales
                  <ArrowRight className="w-4 h-4" />
                </a>
              ) : (
                <button
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('navigate-to', { detail: { page: 'billing' } })
                    )
                  }
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: 'var(--color-accent)' }}
                >
                  <Zap className="w-4 h-4" />
                  Upgrade to {requiredPlan.name}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('navigate-to', { detail: { page: 'billing' } })
                  )
                }
                className="text-sm font-medium text-[var(--color-accent)] hover:underline"
              >
                View all plans
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
