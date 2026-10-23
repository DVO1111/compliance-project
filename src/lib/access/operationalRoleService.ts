/**
 * Operational role assignments.
 *
 * The register that says what somebody may do on the floor, separate
 * from company_members.role, which says what they are to the workspace.
 * Since 20261119000000 PM-03 reads only this one.
 *
 * Every rule here is the database's. This module calls the RPCs and
 * reports what comes back; it does not decide who may assign, because
 * a decision made here is one a direct table write walks around. The
 * trigger on operational_role_assignments applies the same refusals to
 * both routes, which is the property the suite asserts.
 */
import { supabase } from '../supabase';
import { logger } from '../logger';

/** PM-03's eight. Mirrors app_operational_roles(). */
export const OPERATIONAL_ROLES = [
  'procurement', 'storekeeper', 'qc_analyst', 'qa_officer',
  'qa_manager', 'production_supervisor', 'compliance_admin', 'management',
] as const;

export type OperationalRole = (typeof OPERATIONAL_ROLES)[number];

export const OPERATIONAL_ROLE_LABELS: Record<OperationalRole, string> = {
  procurement: 'Procurement',
  storekeeper: 'Storekeeper',
  qc_analyst: 'QC Analyst',
  qa_officer: 'QA Officer',
  qa_manager: 'QA Manager',
  production_supervisor: 'Production Supervisor',
  compliance_admin: 'Compliance Admin',
  management: 'Management',
};

export type RoleAssignment = {
  id: string;
  user_id: string;
  role: OperationalRole;
  reason: string;
  assigned_by: string | null;
  assigned_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
};

/**
 * Every assignment in a company, live and withdrawn.
 *
 * Revoked rows are included deliberately: who held an authority and
 * when they stopped is the evidence, and a list that quietly drops
 * them answers "who can release batches" while hiding "who could, in
 * March".
 */
export async function listAssignments(companyId: string): Promise<RoleAssignment[]> {
  const { data, error } = await (supabase as any)
    .from('operational_role_assignments')
    .select('id, user_id, role, reason, assigned_by, assigned_at, revoked_by, revoked_at, revoke_reason')
    .eq('company_id', companyId)
    .order('assigned_at', { ascending: false });

  if (error) {
    logger.error('listAssignments failed:', error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as RoleAssignment[];
}

/** The roles one person holds right now. */
export async function rolesHeldBy(
  companyId: string,
  userId: string,
): Promise<OperationalRole[]> {
  const { data, error } = await (supabase as any)
    .from('operational_role_assignments')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error) {
    logger.error('rolesHeldBy failed:', error.message);
    throw new Error(error.message);
  }
  return ((data ?? []) as { role: OperationalRole }[]).map((r) => r.role).sort();
}

/**
 * Grants a role. The reason is required by the table, not by politeness:
 * an assignment nobody explained is one nobody can review.
 *
 * Refusals that reach the caller, all from the database:
 *   OPERATIONAL_ROLE_FORBIDDEN     not an owner, admin or compliance admin
 *   OPERATIONAL_ROLE_SELF          granting it to yourself
 *   OPERATIONAL_ROLE_UNKNOWN       not one of the eight
 *   OPERATIONAL_ROLE_NOT_A_MEMBER  not an active member of this company
 */
export async function assignRole(
  companyId: string,
  userId: string,
  role: OperationalRole,
  reason: string,
): Promise<string> {
  const { data, error } = await (supabase as any).rpc('operational_role_assign', {
    p_company_id: companyId,
    p_user_id: userId,
    p_role: role,
    p_reason: reason,
  });

  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Withdraws a role. The row stays; the person loses the role from the
 * next statement onward.
 */
export async function revokeRole(assignmentId: string, reason: string): Promise<void> {
  const { error } = await (supabase as any).rpc('operational_role_revoke', {
    p_assignment_id: assignmentId,
    p_reason: reason,
  });

  if (error) throw new Error(error.message);
}

/**
 * Turns a database refusal into a sentence worth showing.
 *
 * Falls through to the raw message rather than a generic one: a
 * refusal the screen cannot name is still more useful to the person
 * than "something went wrong".
 */
export function explainRoleError(message: string): string {
  if (message.includes('OPERATIONAL_ROLE_SELF')) {
    return 'You cannot give yourself an operational role. Another owner, admin or compliance admin has to do it.';
  }
  if (message.includes('OPERATIONAL_ROLE_FORBIDDEN')) {
    return 'Assigning operational roles is reserved to a workspace owner or admin, or to a compliance admin.';
  }
  if (message.includes('OPERATIONAL_ROLE_NOT_A_MEMBER')) {
    return 'That person is not an active member of this company.';
  }
  if (message.includes('OPERATIONAL_ROLE_UNKNOWN')) {
    return 'That is not one of the eight operational roles.';
  }
  if (message.includes('OPERATIONAL_ROLE_IMMUTABLE')) {
    return 'An assignment can be withdrawn but not edited or deleted — the record of who held it stands.';
  }
  if (message.includes('OPERATIONAL_ROLE_REASON_REQUIRED')) {
    return 'Say why the role is being withdrawn.';
  }
  return message;
}
