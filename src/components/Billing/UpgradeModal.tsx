/**
 * UpgradeModal
 *
 * Drop-in modal shown whenever a user hits a feature gate.
 *
 * Usage:
 *   const [showUpgrade, setShowUpgrade] = useState(false);
 *
 *   <button onClick={() => setShowUpgrade(true)}>Try AI Analysis</button>
 *
 *   {showUpgrade && (
 *     <UpgradeModal
 *       featureLabel="AI-Powered Analysis"
 *       requiredPlan="growth"
 *       onClose={() => setShowUpgrade(false)}
 *     />
 *   )}
 */

import { X, Zap, CheckCircle, ArrowRight, Lock } from 'lucide-react';
import { createPortal } from 'react-dom';
import { PLANS, type PlanId } from '../../lib/plans';

interface UpgradeModalProps {
  /** Human-readable name of the locked feature, e.g. "AI-Powered Analysis" */
  featureLabel: string;
  /** The minimum plan that unlocks this feature */
  requiredPlan: PlanId;
  onClose: () => void;
}

export default function UpgradeModal({ featureLabel, requiredPlan, onClose }: UpgradeModalProps) {
  const plan = PLANS[requiredPlan];

  const handleUpgrade = () => {
    if (requiredPlan === 'enterprise') {
      window.open('mailto:sales@criateur.io?subject=Enterprise enquiry', '_blank');
    } else {
      // Will navigate to billing page when Stripe is wired
      window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'billing' } }));
    }
    onClose();
  };

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-[var(--color-surface)] rounded-2xl shadow-2xl border dash-border overflow-hidden">

        {/* Accent top strip */}
        <div className="h-1 w-full" style={{ background: 'var(--color-accent)' }} />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--color-accent-soft)' }}>
              <Lock className="w-5 h-5 text-[var(--color-accent)]" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest dash-text-tertiary">Feature Locked</p>
              <h2 className="text-base font-bold dash-text mt-0.5">{featureLabel}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] dash-text-tertiary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 space-y-5">
          <p className="text-sm dash-text-secondary leading-relaxed">
            <span className="font-semibold dash-text">{featureLabel}</span> is available on the{' '}
            <span className="font-semibold text-[var(--color-accent)]">{plan.name}</span> plan
            {requiredPlan !== 'enterprise' && ` from $${plan.priceMonthly?.toLocaleString()}/mo`}.
          </p>

          {/* What you get */}
          <div className="rounded-xl border dash-border bg-[var(--color-surface-alt)] p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide dash-text-tertiary mb-2">
              Included in {plan.name}
            </p>
            {plan.highlights.slice(0, 5).map((h) => (
              <div key={h} className="flex items-center gap-2 text-sm dash-text-secondary">
                <CheckCircle className="w-3.5 h-3.5 text-[var(--color-success)] flex-shrink-0" />
                {h}
              </div>
            ))}
            {plan.highlights.length > 5 && (
              <p className="text-xs dash-text-tertiary pl-5">
                + {plan.highlights.length - 5} more features
              </p>
            )}
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleUpgrade}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: 'var(--color-accent)' }}
            >
              <Zap className="w-4 h-4" />
              {requiredPlan === 'enterprise' ? 'Contact Sales' : `Upgrade to ${plan.name}`}
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border dash-border text-sm font-medium dash-text hover:bg-[var(--color-surface-alt)] transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
