/**
 * Enterprise Identity Service
 *
 * CRUD operations for identity providers, role mappings, and session tracking.
 * Every mutation logs to audit_logs via recordAuditEvent().
 */

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

// ── Types ──────────────────────────────────────────────────────────

export interface IdentityProvider {
  id: string;
  company_id: string;
  provider_type: 'saml' | 'oidc' | 'google' | 'azure' | 'okta';
  name: string;
  domain: string | null;
  metadata: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface IdentitySession {
  id: string;
  user_id: string | null;
  company_id: string | null;
  provider_id: string | null;
  login_method: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface IdentityRoleMapping {
  id: string;
  provider_id: string;
  external_group: string;
  role: string | null;
  custom_role_id: string | null;
  created_at: string;
}

// ── Identity Provider CRUD ─────────────────────────────────────────

/** Register a new SSO / Identity Provider */
export async function registerIdentityProvider(params: {
  companyId: string;
  userId: string;
  providerType: IdentityProvider['provider_type'];
  name: string;
  domain?: string;
  metadata?: Record<string, unknown>;
}): Promise<IdentityProvider | null> {
  const { data, error } = await (supabase as any)
    .from('identity_providers')
    .insert({
      company_id: params.companyId,
      provider_type: params.providerType,
      name: params.name,
      domain: params.domain ?? null,
      metadata: params.metadata ?? {},
      enabled: true,
    })
    .select()
    .single();

  if (error) {
    logger.error('[IdentityService] registerIdentityProvider error:', error);
    throw new Error(error.message);
  }

  await recordAuditEvent({
    userId: params.userId,
    action: 'create_identity_provider',
    entityType: 'identity_provider',
    entityId: data.id,
    companyId: params.companyId,
    metadata: { provider_type: params.providerType, name: params.name, domain: params.domain },
    captureEvidence: false,
  });

  return data as IdentityProvider;
}

/** Update an existing identity provider's settings */
export async function updateIdentityProvider(params: {
  providerId: string;
  companyId: string;
  userId: string;
  updates: Partial<Pick<IdentityProvider, 'name' | 'domain' | 'metadata' | 'enabled' | 'provider_type'>>;
}): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.updates.name !== undefined) payload.name = params.updates.name;
  if (params.updates.domain !== undefined) payload.domain = params.updates.domain;
  if (params.updates.metadata !== undefined) payload.metadata = params.updates.metadata;
  if (params.updates.enabled !== undefined) payload.enabled = params.updates.enabled;
  if (params.updates.provider_type !== undefined) payload.provider_type = params.updates.provider_type;

  const { error } = await (supabase as any)
    .from('identity_providers')
    .update(payload)
    .eq('id', params.providerId);

  if (error) {
    logger.error('[IdentityService] updateIdentityProvider error:', error);
    throw new Error(error.message);
  }

  await recordAuditEvent({
    userId: params.userId,
    action: 'update_identity_provider',
    entityType: 'identity_provider',
    entityId: params.providerId,
    companyId: params.companyId,
    metadata: { updates: params.updates },
    captureEvidence: false,
  });
}

/** Disable (soft-delete) an identity provider */
export async function disableIdentityProvider(params: {
  providerId: string;
  companyId: string;
  userId: string;
}): Promise<void> {
  const { error } = await (supabase as any)
    .from('identity_providers')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('id', params.providerId);

  if (error) {
    logger.error('[IdentityService] disableIdentityProvider error:', error);
    throw new Error(error.message);
  }

  await recordAuditEvent({
    userId: params.userId,
    action: 'disable_identity_provider',
    entityType: 'identity_provider',
    entityId: params.providerId,
    companyId: params.companyId,
    captureEvidence: false,
  });
}

/** List all identity providers for a company */
export async function listIdentityProviders(companyId: string): Promise<IdentityProvider[]> {
  const { data, error } = await (supabase as any)
    .from('identity_providers')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[IdentityService] listIdentityProviders error:', error);
    return [];
  }
  return (data ?? []) as IdentityProvider[];
}

// ── Role Mapping CRUD ──────────────────────────────────────────────

/** Map an SSO external group to a platform role */
export async function mapSSORole(params: {
  providerId: string;
  companyId: string;
  userId: string;
  externalGroup: string;
  role?: string;
  customRoleId?: string;
}): Promise<IdentityRoleMapping | null> {
  const { data, error } = await (supabase as any)
    .from('identity_role_mappings')
    .insert({
      provider_id: params.providerId,
      external_group: params.externalGroup,
      role: params.role ?? null,
      custom_role_id: params.customRoleId ?? null,
    })
    .select()
    .single();

  if (error) {
    logger.error('[IdentityService] mapSSORole error:', error);
    throw new Error(error.message);
  }

  await recordAuditEvent({
    userId: params.userId,
    action: 'identity_role_mapping',
    entityType: 'identity_role_mapping',
    entityId: data.id,
    companyId: params.companyId,
    metadata: {
      provider_id: params.providerId,
      external_group: params.externalGroup,
      role: params.role,
      custom_role_id: params.customRoleId,
    },
    captureEvidence: false,
  });

  return data as IdentityRoleMapping;
}

/** Remove a role mapping */
export async function removeRoleMapping(params: {
  mappingId: string;
  companyId: string;
  userId: string;
}): Promise<void> {
  const { error } = await (supabase as any)
    .from('identity_role_mappings')
    .delete()
    .eq('id', params.mappingId);

  if (error) {
    logger.error('[IdentityService] removeRoleMapping error:', error);
    throw new Error(error.message);
  }

  await recordAuditEvent({
    userId: params.userId,
    action: 'delete_identity_role_mapping',
    entityType: 'identity_role_mapping',
    entityId: params.mappingId,
    companyId: params.companyId,
    captureEvidence: false,
  });
}

/** List role mappings for a provider */
export async function listRoleMappings(providerId: string): Promise<IdentityRoleMapping[]> {
  const { data, error } = await (supabase as any)
    .from('identity_role_mappings')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[IdentityService] listRoleMappings error:', error);
    return [];
  }
  return (data ?? []) as IdentityRoleMapping[];
}

// ── Identity Sessions ──────────────────────────────────────────────

/** Record an identity login session */
export async function recordIdentitySession(params: {
  userId: string;
  companyId: string;
  providerId: string;
  loginMethod: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const { error } = await (supabase as any)
    .from('identity_sessions')
    .insert({
      user_id: params.userId,
      company_id: params.companyId,
      provider_id: params.providerId,
      login_method: params.loginMethod,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
    });

  if (error) {
    logger.error('[IdentityService] recordIdentitySession error:', error);
  }

  await recordAuditEvent({
    userId: params.userId,
    action: 'identity_login',
    entityType: 'identity_session',
    entityId: params.providerId,
    companyId: params.companyId,
    metadata: { login_method: params.loginMethod },
    captureEvidence: false,
  });
}

/** List recent identity sessions for a company */
export async function listRecentIdentitySessions(params: {
  companyId: string;
  limit?: number;
}): Promise<IdentitySession[]> {
  const { data, error } = await (supabase as any)
    .from('identity_sessions')
    .select('*')
    .eq('company_id', params.companyId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50);

  if (error) {
    logger.error('[IdentityService] listRecentIdentitySessions error:', error);
    return [];
  }
  return (data ?? []) as IdentitySession[];
}
