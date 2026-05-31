import {
    CreditCard,
    CheckCircle,
    AlertTriangle,
    Clock,
    Zap,
    Users,
    ArrowRight,
    Loader2,
    Star,
    ShieldCheck,
    Building2,
    Mail,
    ExternalLink,
} from 'lucide-react';
import { usePlan } from '../../hooks/usePlan';
import { PLANS, PLAN_ORDER, isPlanUpgrade, type PlanId } from '../../lib/plans';

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatPrice(plan: typeof PLANS[PlanId]): string {
    if (plan.priceMonthly === null) return 'Custom';
    if (plan.priceMonthly === 0) return 'Free';
    return `$${plan.priceMonthly.toLocaleString()}`;
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; className: string }> = {
        active: { label: 'Active', className: 'bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/30' },
        trialing: { label: 'Trial', className: 'bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/30' },
        past_due: { label: 'Past Due', className: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/30' },
        cancelled: { label: 'Cancelled', className: 'bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)] border-[var(--color-border)]' },
        paused: { label: 'Paused', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    };
    const s = map[status] ?? map.active;
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.className}`}>
            {s.label}
        </span>
    );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
    planId,
    currentPlan,
    onUpgrade,
}: {
    planId: PlanId;
    currentPlan: PlanId;
    onUpgrade: (planId: PlanId) => void;
}) {
    const plan = PLANS[planId];
    const isCurrent = planId === currentPlan;
    const isUpgrade = isPlanUpgrade(currentPlan, planId);
    const isEnterprise = planId === 'enterprise';
    const isPopular = plan.badge === 'Most Popular';

    return (
        <div className={`relative flex flex-col rounded-2xl border transition-all ${
            isCurrent
                ? 'border-[var(--color-accent)] shadow-lg shadow-[var(--color-accent)]/10'
                : isPopular
                ? 'border-[var(--color-accent)]/40 shadow-md'
                : 'dash-border shadow-sm'
        } dash-card overflow-hidden`}>

            {/* Popular badge */}
            {isPopular && !isCurrent && (
                <div className="absolute top-0 inset-x-0 h-1 bg-[var(--color-accent)] rounded-t-2xl" />
            )}
            {isPopular && (
                <div className="absolute top-3 right-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold uppercase tracking-wide">
                        <Star className="w-2.5 h-2.5 fill-white" />
                        {plan.badge}
                    </span>
                </div>
            )}

            <div className="p-6 flex-1 flex flex-col gap-5">
                {/* Header */}
                <div>
                    <p className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-1">{plan.name}</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold dash-text">{formatPrice(plan)}</span>
                        {plan.priceMonthly !== null && plan.priceMonthly > 0 && (
                            <span className="text-sm dash-text-tertiary">/mo</span>
                        )}
                    </div>
                    <p className="text-xs dash-text-tertiary mt-1">{plan.tagline}</p>
                </div>

                {/* Limits chips */}
                <div className="flex gap-2 flex-wrap">
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--color-surface-alt)] text-xs font-medium dash-text-secondary border dash-border">
                        <Users className="w-3 h-3" />
                        {plan.seatLimit ? `${plan.seatLimit} seats` : 'Unlimited seats'}
                    </span>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--color-surface-alt)] text-xs font-medium dash-text-secondary border dash-border">
                        <Building2 className="w-3 h-3" />
                        {plan.brandLimit ? `${plan.brandLimit} brand` : 'Unlimited brands'}
                    </span>
                </div>

                {/* Feature list */}
                <ul className="space-y-2 flex-1">
                    {plan.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-2 text-sm dash-text-secondary">
                            <CheckCircle className="w-4 h-4 text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                            {h}
                        </li>
                    ))}
                </ul>

                {/* CTA */}
                <div className="mt-auto">
                    {isCurrent ? (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] text-[var(--color-accent)] text-sm font-semibold justify-center">
                            <CheckCircle className="w-4 h-4" />
                            Current Plan
                        </div>
                    ) : isEnterprise ? (
                        <a
                            href="mailto:sales@criateur.io?subject=Enterprise enquiry"
                            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border dash-border text-sm font-semibold dash-text hover:bg-[var(--color-surface-alt)] transition-colors"
                        >
                            <Mail className="w-4 h-4" />
                            Contact Sales
                            <ExternalLink className="w-3.5 h-3.5 dash-text-tertiary" />
                        </a>
                    ) : isUpgrade ? (
                        <button
                            onClick={() => onUpgrade(planId)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                            style={{ background: 'var(--color-accent)' }}
                        >
                            <Zap className="w-4 h-4" />
                            Upgrade to {plan.name}
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border dash-border text-sm font-medium dash-text-tertiary justify-center">
                            Downgrade available via support
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
    const { subscription, plan, isLoading, isTrialing, isPastDue, daysRemaining } = usePlan();

    const handleUpgrade = (targetPlan: PlanId) => {
        // Stripe checkout will be wired here in Sprint 3.2
        // For now, open the contact email so early pilot customers can manually upgrade
        const subject = encodeURIComponent(`Upgrade to ${PLANS[targetPlan].name} — ${subscription?.company_id ?? ''}`);
        window.open(`mailto:sales@criateur.io?subject=${subject}`, '_blank');
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
            </div>
        );
    }

    const currentPlanConfig = PLANS[plan];

    return (
        <div className="space-y-8">

            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold dash-text">Billing &amp; Plan</h1>
                <p className="text-sm dash-text-tertiary mt-1">
                    Manage your subscription, view usage, and upgrade your plan.
                </p>
            </div>

            {/* Trial / past-due alert banner */}
            {isTrialing && daysRemaining !== null && (
                <div className={`flex items-center justify-between gap-4 px-5 py-4 rounded-2xl border ${
                    daysRemaining <= 3
                        ? 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]'
                        : 'border-[var(--color-info)]/30 bg-[var(--color-info-soft)]'
                }`}>
                    <div className="flex items-center gap-3">
                        <Clock className={`w-5 h-5 flex-shrink-0 ${daysRemaining <= 3 ? 'text-[var(--color-danger)]' : 'text-[var(--color-info)]'}`} />
                        <div>
                            <p className={`text-sm font-semibold ${daysRemaining <= 3 ? 'text-[var(--color-danger)]' : 'text-[var(--color-info)]'}`}>
                                {daysRemaining === 0
                                    ? 'Your trial has expired'
                                    : `Your trial ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`}
                            </p>
                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                Upgrade now to keep access to all your compliance data.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleUpgrade('growth')}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white flex-shrink-0 hover:opacity-90 transition-opacity"
                        style={{ background: 'var(--color-accent)' }}
                    >
                        <Zap className="w-4 h-4" />
                        Upgrade Now
                    </button>
                </div>
            )}

            {isPastDue && (
                <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]">
                    <AlertTriangle className="w-5 h-5 text-[var(--color-danger)] flex-shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-[var(--color-danger)]">Payment past due</p>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                            Please update your payment method to restore full access.
                        </p>
                    </div>
                </div>
            )}

            {/* Current plan summary card */}
            <div className="dash-card border dash-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b dash-border flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-soft)] flex items-center justify-center">
                        <CreditCard className="w-4 h-4 text-[var(--color-accent)]" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold dash-text">Current Plan</h2>
                        <p className="text-xs dash-text-tertiary">Your active subscription details</p>
                    </div>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

                        {/* Plan + status */}
                        <div>
                            <p className="text-xs dash-text-tertiary font-medium uppercase tracking-wide mb-1">Plan</p>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-lg font-bold dash-text">{currentPlanConfig.name}</span>
                                {subscription && <StatusBadge status={subscription.status} />}
                            </div>
                            <p className="text-xs dash-text-tertiary mt-1">{currentPlanConfig.tagline}</p>
                        </div>

                        {/* Price */}
                        <div>
                            <p className="text-xs dash-text-tertiary font-medium uppercase tracking-wide mb-1">Price</p>
                            <p className="text-lg font-bold dash-text">
                                {currentPlanConfig.priceMonthly === null
                                    ? 'Custom'
                                    : currentPlanConfig.priceMonthly === 0
                                    ? 'Free'
                                    : `$${currentPlanConfig.priceMonthly.toLocaleString()}/mo`}
                            </p>
                            <p className="text-xs dash-text-tertiary mt-1">Billed monthly</p>
                        </div>

                        {/* Seats */}
                        <div>
                            <p className="text-xs dash-text-tertiary font-medium uppercase tracking-wide mb-1">Seat Limit</p>
                            <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 dash-text-tertiary" />
                                <p className="text-lg font-bold dash-text">
                                    {currentPlanConfig.seatLimit ?? '∞'}
                                </p>
                            </div>
                            <p className="text-xs dash-text-tertiary mt-1">
                                {currentPlanConfig.seatLimit ? `Up to ${currentPlanConfig.seatLimit} members` : 'Unlimited members'}
                            </p>
                        </div>

                        {/* Period end */}
                        <div>
                            <p className="text-xs dash-text-tertiary font-medium uppercase tracking-wide mb-1">
                                {isTrialing ? 'Trial Ends' : 'Renews'}
                            </p>
                            <p className="text-lg font-bold dash-text">
                                {subscription?.current_period_end
                                    ? new Date(subscription.current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                                    : '—'}
                            </p>
                            {daysRemaining !== null && (
                                <p className="text-xs dash-text-tertiary mt-1">{daysRemaining} days remaining</p>
                            )}
                        </div>
                    </div>

                    {/* Manage billing placeholder */}
                    {subscription?.stripe_customer_id && (
                        <div className="mt-6 pt-6 border-t dash-border flex items-center gap-3">
                            <button className="flex items-center gap-2 px-4 py-2 rounded-xl border dash-border text-sm font-medium dash-text hover:bg-[var(--color-surface-alt)] transition-colors">
                                <ExternalLink className="w-4 h-4" />
                                Manage Billing Portal
                            </button>
                            <span className="text-xs dash-text-tertiary">View invoices, update payment method, cancel plan</span>
                        </div>
                    )}

                    {!subscription?.stripe_customer_id && plan !== 'trial' && (
                        <div className="mt-6 pt-6 border-t dash-border">
                            <p className="text-xs dash-text-tertiary">
                                Payment portal will be available once Stripe is connected. Contact{' '}
                                <a href="mailto:support@criateur.io" className="text-[var(--color-accent)] hover:underline">
                                    support@criateur.io
                                </a>{' '}
                                for billing changes.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Plan comparison */}
            <div>
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-success-soft)] flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4 text-[var(--color-success)]" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold dash-text">Available Plans</h2>
                        <p className="text-xs dash-text-tertiary">Choose the plan that fits your team's needs</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {PLAN_ORDER.filter(p => p !== 'trial').map((planId) => (
                        <PlanCard
                            key={planId}
                            planId={planId}
                            currentPlan={plan}
                            onUpgrade={handleUpgrade}
                        />
                    ))}
                </div>
            </div>

            {/* Invoice history placeholder */}
            <div className="dash-card border dash-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b dash-border flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-alt)] flex items-center justify-center">
                        <CreditCard className="w-4 h-4 dash-text-tertiary" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold dash-text">Invoice History</h2>
                        <p className="text-xs dash-text-tertiary">Past payments and downloadable receipts</p>
                    </div>
                </div>
                <div className="p-12 text-center">
                    <CreditCard className="w-10 h-10 dash-text-tertiary mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium dash-text-secondary">No invoices yet</p>
                    <p className="text-xs dash-text-tertiary mt-1">
                        Invoice history will appear here once Stripe payment is connected.
                    </p>
                </div>
            </div>

        </div>
    );
}
