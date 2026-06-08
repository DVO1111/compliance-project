import { supabase } from './supabase';
import type { Permissions } from './permissions';
import { SYSTEM_ROLE_DEFAULTS } from './permissions';
import { logger } from './logger';
import { recordAuditEvent } from './auditService';

/* ──────────────────────── Types ──────────────────────── */

export interface CustomRole {
  id: string;
  company_id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: Record<string, boolean>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ──────────────────────── Queries ──────────────────────── */

/** Fetch all custom roles for a company */
export async function fetchCompanyRoles(companyId: string): Promise<CustomRole[]> {
  const { data, error } = await (supabase as any)
    .from('custom_roles')
    .select('*')
    .eq('company_id', companyId)
    .order('is_system', { ascending: false })
    .order('name');

  if (error) {
    logger.error('fetchCompanyRoles error:', error);
    return [];
  }
  return (data ?? []) as CustomRole[];
}

/** Fetch a single role by ID */
export async function fetchRoleById(roleId: string): Promise<CustomRole | null> {
  const { data, error } = await (supabase as any)
    .from('custom_roles')
    .select('*')
    .eq('id', roleId)
    .maybeSingle();

  if (error) {
    logger.error('fetchRoleById error:', error);
    return null;
  }
  return (data ?? null) as CustomRole | null;
}

/** Get the user count per role for a company */
export async function fetchRoleUserCounts(
  companyId: string
): Promise<Record<string, number>> {
  const { data, error } = await (supabase as any)
    .from('profiles')
    .select('custom_role_id')
    .eq('company_id', companyId)
    .not('custom_role_id', 'is', null);

  if (error) {
    logger.error('fetchRoleUserCounts error:', error);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = row.custom_role_id;
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/* ──────────────────────── Seeding ──────────────────────── */

/**
 * Ensure the 3 system default roles exist for a company (idempotent)
 *
 * ✅ FIX: Do NOT upsert from the browser (RLS will block -> 403 spam)
 * Instead call the SECURITY DEFINER RPC you created in SQL: ensure_system_roles(p_company_id uuid)
 */
export async function ensureSystemRoles(companyId: string): Promise<void> {
  if (!companyId) return;

  // 1) Preferred path: RPC (server-side, bypasses RLS safely)
  const { error } = await (supabase as any).rpc('ensure_system_roles', {
    p_company_id: companyId,
  });

  if (!error) return;

  // 2) Fallback: log helpful message (keep the app running)
  // If you still see errors here, it means:
  // - the RPC doesn't exist, or
  // - EXECUTE permission wasn't granted, or
  // - function name/arg doesn't match
  logger.error('ensureSystemRoles RPC failed:', error);

  // Optional: last resort fallback (disabled by default)
  // If you want a fallback upsert, you MUST loosen RLS INSERT policy.
  // Keeping it disabled is safer.
}

/* ──────────────────────── CRUD ──────────────────────── */

/** Create a new custom role */
export async function createCustomRole(params: {
  companyId: string;
  name: string;
  description: string;
  permissions: Partial<Permissions>;
  createdBy: string;
}): Promise<CustomRole | null> {
  const { data, error } = await (supabase as any)
    .from('custom_roles')
    .insert({
      company_id: params.companyId,
      name: params.name,
      description: params.description,
      is_system: false,
      permissions: params.permissions,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) {
    logger.error('createCustomRole error:', error);
    throw new Error(error.message);
  }

  try {
    await recordAuditEvent({
      companyId: params.companyId, userId: params.createdBy,
      action: `role.created: ${params.name}`,
      entityType: 'custom_role', entityId: data.id,
      metadata: { name: params.name },
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }

  return data as CustomRole;
}

/** Update a custom role's name, description, or permissions */
export async function updateCustomRole(
  roleId: string,
  updates: {
    name?: string;
    description?: string;
    permissions?: Partial<Permissions>;
  },
  companyId?: string,
  userId?: string,
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.permissions !== undefined) payload.permissions = updates.permissions;

  const { error } = await (supabase as any)
    .from('custom_roles')
    .update(payload)
    .eq('id', roleId);

  if (error) {
    logger.error('updateCustomRole error:', error);
    throw new Error(error.message);
  }

  if (companyId && userId) {
    try {
      await recordAuditEvent({
        companyId, userId,
        action: 'role.updated',
        entityType: 'custom_role', entityId: roleId,
        metadata: { fields: Object.keys(updates) },
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }
}

/** Delete a custom role (only non-system roles) */
export async function deleteCustomRole(roleId: string, companyId?: string, userId?: string): Promise<void> {
  // First, unassign any users with this role
  await (supabase as any)
    .from('profiles')
    .update({ custom_role_id: null })
    .eq('custom_role_id', roleId);

  const { error } = await (supabase as any)
    .from('custom_roles')
    .delete()
    .eq('id', roleId)
    .eq('is_system', false);

  if (error) {
    logger.error('deleteCustomRole error:', error);
    throw new Error(error.message);
  }

  if (companyId && userId) {
    try {
      await recordAuditEvent({
        companyId, userId,
        action: 'role.deleted',
        entityType: 'custom_role', entityId: roleId,
        metadata: {},
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }
}

/* ──────────────────────── Assignment ──────────────────────── */

/** Assign a custom role to a user (sets profiles.custom_role_id) */
export async function assignRoleToUser(
  targetUserId: string,
  roleId: string | null,
  companyId?: string,
  actorUserId?: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('profiles')
    .update({ custom_role_id: roleId })
    .eq('id', targetUserId);

  if (error) {
    logger.error('assignRoleToUser error:', error);
    throw new Error(error.message);
  }

  if (companyId && actorUserId) {
    try {
      await recordAuditEvent({
        companyId, userId: actorUserId,
        action: roleId ? `role.assigned: role ${roleId} to user ${targetUserId}` : `role.unassigned: from user ${targetUserId}`,
        entityType: 'custom_role', entityId: roleId ?? targetUserId,
        metadata: { targetUserId, roleId },
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }
}