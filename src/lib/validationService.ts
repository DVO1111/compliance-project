import { supabase } from './supabase';
import { getPermissions, Permissions } from './permissions';

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Validates that the current user belongs to the target company
 * and has the required permission to perform the action.
 * 
 * This provides the "Server-Side" guard required for platform hardening.
 */
export async function validateMutation(
  userId: string,
  companyId: string,
  requiredPermission?: keyof Permissions
): Promise<ValidationResult> {
  // 1. Fetch user profile from database (trusted source)
  const { data: profile, error } = await (supabase as any)
    .from('profiles')
    .select('organization_id, company_id, role, custom_role_id')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return { valid: false, message: 'User profile not found.' };
  }

  // 2. Verify Company Membership (Multi-tenant isolation)
  // We check both organization_id and company_id during transition
  const userCompanyId = profile.organization_id || profile.company_id;
  if (userCompanyId !== companyId) {
    return { valid: false, message: 'Access denied: User does not belong to this company.' };
  }

  // 3. Verify Permissions if specified
  if (requiredPermission) {
    let customPermissions = null;
    if (profile.custom_role_id) {
      const { data: role } = await (supabase as any)
        .from('custom_roles')
        .select('permissions')
        .eq('id', profile.custom_role_id)
        .single();
      if (role) customPermissions = role.permissions;
    }

    const perms = getPermissions({
      profileRole: profile.role,
      customPermissions
    });

    if (!perms[requiredPermission]) {
      return { valid: false, message: `Access denied: Missing required permission "${requiredPermission}".` };
    }
  }

  return { valid: true };
}
