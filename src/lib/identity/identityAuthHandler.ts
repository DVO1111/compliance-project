/**
 * Enterprise Identity Auth Handler
 *
 * Handles the SSO login lifecycle:
 *   1. Validate SSO payload
 *   2. Resolve provider via domain
 *   3. Auto-provision user if needed
 *   4. Apply role mappings
 *   5. Record session + audit log
 */

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import {
  recordIdentitySession,
  type IdentityProvider,
  type IdentityRoleMapping,
} from './identityService';
import { logger } from '../logger';

// ── Types ──────────────────────────────────────────────────────────

export interface SSOPayload {
  email: string;
  fullName?: string;
  externalGroups?: string[];
  providerType?: IdentityProvider['provider_type'];
  ipAddress?: string;
  userAgent?: string;
}

export interface SSOLoginResult {
  success: boolean;
  userId?: string;
  companyId?: string;
  providerId?: string;
  provisioned?: boolean;
  error?: string;
}

// ── Domain Resolution ──────────────────────────────────────────────

/**
 * Extract the domain from an email and look up the matching identity provider.
 */
export async function resolveProviderByDomain(
  email: string
): Promise<IdentityProvider | null> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  const { data, error } = await (supabase as any)
    .from('identity_providers')
    .select('*')
    .eq('domain', domain)
    .eq('enabled', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('[IdentityAuth] resolveProviderByDomain error:', error);
    return null;
  }

  return (data ?? null) as IdentityProvider | null;
}

// ── Auto-Provisioning ──────────────────────────────────────────────

/**
 * Auto-create a profile when a user with a matching domain logs in for the
 * first time. Creates the profile with minimal onboarding fields populated.
 */
export async function autoProvisionUser(params: {
  email: string;
  fullName?: string;
  companyId: string;
  providerId: string;
  userId: string;         // auth.uid() from the Supabase session
}): Promise<{ profileId: string; wasCreated: boolean }> {
  // Check if profile already exists
  const { data: existing } = await (supabase as any)
    .from('profiles')
    .select('id')
    .eq('id', params.userId)
    .maybeSingle();

  if (existing) {
    // Profile exists — ensure company_id is set
    const { error: updateErr } = await (supabase as any)
      .from('profiles')
      .update({ company_id: params.companyId })
      .eq('id', params.userId);

    if (updateErr) {
      logger.error('[IdentityAuth] autoProvisionUser update error:', updateErr);
    }

    return { profileId: existing.id, wasCreated: false };
  }

  // Create new profile with minimal fields
  const { data: newProfile, error } = await (supabase as any)
    .from('profiles')
    .insert({
      id: params.userId,
      email: params.email,
      full_name: params.fullName ?? params.email.split('@')[0],
      company_id: params.companyId,
      role: 'marketing',  // safe default; SSO role mapping applies after
      onboarding_completed: true,
    })
    .select('id')
    .single();

  if (error) {
    logger.error('[IdentityAuth] autoProvisionUser insert error:', error);
    throw new Error(error.message);
  }

  // Audit the auto-provision
  await recordAuditEvent({
    userId: params.userId,
    action: 'identity_auto_provision',
    entityType: 'profile',
    entityId: newProfile.id,
    companyId: params.companyId,
    metadata: { email: params.email, provider_id: params.providerId },
    captureEvidence: false,
  });

  return { profileId: newProfile.id, wasCreated: true };
}

// ── Role Mapping Application ───────────────────────────────────────

/**
 * Given a list of external groups from the SSO payload, find matching
 * role mappings and apply the first match to the user's profile.
 */
async function applyRoleMappings(params: {
  userId: string;
  providerId: string;
  externalGroups: string[];
}): Promise<void> {
  if (!params.externalGroups.length) return;

  // Fetch all mappings for this provider
  const { data: mappings, error } = await (supabase as any)
    .from('identity_role_mappings')
    .select('*')
    .eq('provider_id', params.providerId);

  if (error || !mappings) return;

  const typedMappings = mappings as IdentityRoleMapping[];

  // Find first matching group
  const normalizedGroups = params.externalGroups.map(g => g.toLowerCase());
  const match = typedMappings.find(m =>
    normalizedGroups.includes(m.external_group.toLowerCase())
  );

  if (!match) return;

  // Apply the mapped role
  const updates: Record<string, unknown> = {};
  if (match.custom_role_id) {
    updates.custom_role_id = match.custom_role_id;
  } else if (match.role) {
    updates.role = match.role;
  }

  if (Object.keys(updates).length > 0) {
    await (supabase as any)
      .from('profiles')
      .update(updates)
      .eq('id', params.userId);
  }
}

// ── Main SSO Login Handler ─────────────────────────────────────────

/**
 * Full SSO login orchestration:
 *   1. Validate payload
 *   2. Resolve provider by domain
 *   3. Auto-provision user profile
 *   4. Apply role mappings from external groups
 *   5. Record identity session
 *   6. Write audit log
 */
export async function handleSSOLogin(
  payload: SSOPayload,
  authUserId: string
): Promise<SSOLoginResult> {
  try {
    // 1. Validate payload
    if (!payload.email || !payload.email.includes('@')) {
      return { success: false, error: 'Invalid email in SSO payload' };
    }

    // 2. Resolve provider via domain
    const provider = await resolveProviderByDomain(payload.email);
    if (!provider) {
      return { success: false, error: 'No identity provider configured for this domain' };
    }

    // 3. Auto-provision or attach user
    const { profileId, wasCreated } = await autoProvisionUser({
      email: payload.email,
      fullName: payload.fullName,
      companyId: provider.company_id,
      providerId: provider.id,
      userId: authUserId,
    });

    // 4. Apply role mappings
    if (payload.externalGroups && payload.externalGroups.length > 0) {
      await applyRoleMappings({
        userId: authUserId,
        providerId: provider.id,
        externalGroups: payload.externalGroups,
      });
    }

    // 5. Record identity session
    await recordIdentitySession({
      userId: authUserId,
      companyId: provider.company_id,
      providerId: provider.id,
      loginMethod: provider.provider_type,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
    });

    // 6. Audit log
    await recordAuditEvent({
      userId: authUserId,
      action: 'identity_login',
      entityType: 'identity_session',
      entityId: provider.id,
      companyId: provider.company_id,
      metadata: {
        email: payload.email,
        provider_type: provider.provider_type,
        provisioned: wasCreated,
        external_groups: payload.externalGroups,
      },
      captureEvidence: false,
    });

    return {
      success: true,
      userId: profileId,
      companyId: provider.company_id,
      providerId: provider.id,
      provisioned: wasCreated,
    };
  } catch (err) {
    logger.error('[IdentityAuth] handleSSOLogin error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
