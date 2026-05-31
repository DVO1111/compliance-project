/**
 * billingService.ts
 *
 * Supabase queries for the `subscriptions` table.
 * Stripe / Paystack webhook handlers live in Supabase edge functions
 * and update this table directly — the frontend only reads from it.
 */

import { supabase } from './supabase';
import { logger } from './logger';
import type { PlanId } from './plans';

export interface Subscription {
  id: string;
  company_id: string;
  plan: PlanId;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'paused';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  paystack_customer_code: string | null;
  paystack_subscription_code: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  seat_limit: number | null;
  created_at: string;
  updated_at: string;
}

export async function getSubscription(companyId: string): Promise<Subscription | null> {
  try {
    const { data, error } = await (supabase as any)
      .from('subscriptions')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) {
      logger.warn('billingService.getSubscription error:', error.message);
      return null;
    }
    return (data as Subscription) ?? null;
  } catch (err: any) {
    logger.warn('billingService.getSubscription threw:', err?.message);
    return null;
  }
}

/**
 * Auto-creates a 14-day trial subscription when a new company has no subscription row.
 * Called once from usePlan on first load.
 */
export async function createTrialSubscription(companyId: string): Promise<Subscription | null> {
  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 14);

  try {
    const { data, error } = await (supabase as any)
      .from('subscriptions')
      .insert({
        company_id: companyId,
        plan: 'trial',
        status: 'trialing',
        current_period_start: now.toISOString(),
        current_period_end: trialEnd.toISOString(),
        cancel_at_period_end: false,
        seat_limit: 3,
      })
      .select()
      .single();

    if (error) {
      logger.warn('billingService.createTrialSubscription error:', error.message);
      return null;
    }
    return data as Subscription;
  } catch (err: any) {
    logger.warn('billingService.createTrialSubscription threw:', err?.message);
    return null;
  }
}
