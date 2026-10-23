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

/**
 * Roles whose grant and revocation need an electronic signature.
 * Mirrors the gmp_critical_roles table, which is derived from PM-03:
 * these are the roles the design gives one of its five protected steps.
 * The database is authoritative — this list only decides whether the
 * screen asks for a password before calling.
 */
export const SIGNATURE_REQUIRED_ROLES: OperationalRole[] = [
  'qa_manager', 'qa_officer', 'compliance_admin',
];

export function needsSignature(role: OperationalRole): boolean {
  return SIGNATURE_REQUIRED_ROLES.includes(role);
}

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
  grant_signature_id: string | null;
  revoke_signature_id: string | null;
  /** 'rpc' | 'service' | 'bootstrap_self_declared' */
  provenance: string;
  declaration: string | null;
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
    .select('id, user_id, role, reason, assigned_by, assigned_at, revoked_by, revoked_at, ' +
            'revoke_reason, grant_signature_id, revoke_signature_id, provenance, declaration')
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
  signatureId?: string,
): Promise<string> {
  const { data, error } = await (supabase as any).rpc('operational_role_assign', {
    p_company_id: companyId,
    p_user_id: userId,
    p_role: role,
    p_reason: reason,
    p_signature_id: signatureId ?? null,
  });

  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Signs for an appointment or a withdrawal.
 *
 * The signature is bound to this company, this person, this role and
 * this action — and, for a withdrawal, this assignment. It authorises
 * that one act and cannot be replayed onto another, so it is minted
 * immediately before the call it authorises rather than held.
 *
 * Returns the signature id, or throws with the database's own code.
 */
export async function signRoleAction(
  companyId: string,
  userId: string,
  role: OperationalRole,
  action: 'grant' | 'revoke',
  password: string,
  assignmentId?: string,
  reason?: string,
): Promise<string> {
  const { data, error } = await (supabase as any).rpc('operational_role_sign', {
    p_company_id: companyId,
    p_user_id: userId,
    p_role: role,
    p_action: action,
    p_password: password,
    p_assignment_id: assignmentId ?? null,
    p_reason: reason ?? null,
  });

  if (error) throw new Error(error.message);
  const r = data as { ok?: boolean; code?: string; message?: string; signature_id?: string };
  if (!r?.ok) throw new Error(r?.code ? `${r.code}: ${r.message ?? ''}` : 'signing failed');
  return r.signature_id as string;
}

/**
 * Initial setup for a workspace where nobody else can grant the role.
 *
 * Self-declared and signed, permanently marked, and reported by
 * unsignedGrants(). It does NOT independently verify the declaration —
 * see docs/operational-role-model.md. The database refuses it the
 * moment a second person exists who could appoint properly.
 */
export async function bootstrapRole(
  companyId: string,
  role: OperationalRole,
  declaration: string,
  signatureId: string,
): Promise<string> {
  const { data, error } = await (supabase as any).rpc('operational_role_bootstrap', {
    p_company_id: companyId,
    p_role: role,
    p_declaration: declaration,
    p_signature_id: signatureId,
  });

  if (error) throw new Error(error.message);
  return data as string;
}

export type UnsignedGrant = {
  assignment_id: string;
  user_id: string;
  role: OperationalRole;
  provenance: string;
  reason: string;
  declaration: string | null;
  assigned_at: string;
  still_live: boolean;
  finding: string;
};

/** Every grant no second person signed for. The review screen's list. */
export async function unsignedGrants(companyId: string): Promise<UnsignedGrant[]> {
  const { data, error } = await (supabase as any)
    .rpc('operational_role_unsigned_grants', { p_company_id: companyId });
  if (error) throw new Error(error.message);
  return (data ?? []) as UnsignedGrant[];
}

/**
 * Withdraws a role. The row stays; the person loses the role from the
 * next statement onward.
 */
export async function revokeRole(
  assignmentId: string,
  reason: string,
  signatureId?: string,
): Promise<void> {
  const { error } = await (supabase as any).rpc('operational_role_revoke', {
    p_assignment_id: assignmentId,
    p_reason: reason,
    p_signature_id: signatureId ?? null,
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
  if (message.includes('OPERATIONAL_ROLE_SIGNATURE_REQUIRED')) {
    return 'This role carries a quality authority, so granting or withdrawing it has to be signed. Enter your password.';
  }
  if (message.includes('OPERATIONAL_ROLE_SIGNATURE_MISMATCH')) {
    return 'That signature was taken over a different appointment. Sign again for this one.';
  }
  if (message.includes('OPERATIONAL_ROLE_SIGNATURE_INVALID')) {
    return 'That signature could not be found. Sign again.';
  }
  if (message.includes('OPERATIONAL_ROLE_BOOTSTRAP_UNAVAILABLE')) {
    return 'Somebody else in this workspace can grant this role, so one of them has to. Initial setup is only for a workspace where nobody else could.';
  }
  if (message.includes('OPERATIONAL_ROLE_DECLARATION_REQUIRED')) {
    return 'State in writing what authority you hold and under what appointment. This is the record a regulator reads.';
  }
  if (message.includes('E_SIGNATURE_BAD_PASSWORD')) {
    return 'That password is not correct.';
  }
  if (message.includes('E_SIGNATURE_LOCKED')) {
    return 'Too many failed signature attempts. Wait before trying again.';
  }
  return message;
}
