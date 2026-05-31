/**
 * usePlan
 *
 * Returns the current company's subscription plan and derived helpers.
 * Auto-creates a 14-day trial if no subscription row exists yet.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getSubscription,
  createTrialSubscription,
  type Subscription,
} from '../lib/billingService';
import {
  planHasFeature,
  type PlanFeature,
  type PlanId,
} from '../lib/plans';

export interface UsePlanResult {
  subscription: Subscription | null;
  plan: PlanId;
  isLoading: boolean;
  /** true when status is 'active' or 'trialing' */
  isActive: boolean;
  isTrialing: boolean;
  isPastDue: boolean;
  isCancelled: boolean;
  /** Calendar days remaining in the current period, or null if unknown */
  daysRemaining: number | null;
  /** Returns true if the current plan includes the requested feature */
  canAccess: (feature: PlanFeature) => boolean;
  seatLimit: number | null;
  reload: () => void;
}

export function usePlan(): UsePlanResult {
  const { profile } = useAuth();
  const companyId = (profile as any)?.company_id as string | undefined;

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = () => setTick(t => t + 1);

  useEffect(() => {
    if (!companyId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      let sub = await getSubscription(companyId);

      // Auto-provision a trial for brand-new companies
      if (!sub) {
        sub = await createTrialSubscription(companyId);
      }

      if (!cancelled) {
        setSubscription(sub);
        setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [companyId, tick]);

  const plan: PlanId = subscription?.plan ?? 'trial';
  const status = subscription?.status;

  const isActive = status === 'active' || status === 'trialing';
  const isTrialing = status === 'trialing';
  const isPastDue = status === 'past_due';
  const isCancelled = status === 'cancelled';

  const daysRemaining: number | null = (() => {
    if (!subscription?.current_period_end) return null;
    const diff = Math.ceil(
      (new Date(subscription.current_period_end).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24)
    );
    return diff > 0 ? diff : 0;
  })();

  const canAccess = (feature: PlanFeature) => planHasFeature(plan, feature);

  return {
    subscription,
    plan,
    isLoading,
    isActive,
    isTrialing,
    isPastDue,
    isCancelled,
    daysRemaining,
    canAccess,
    seatLimit: subscription?.seat_limit ?? null,
    reload,
  };
}
