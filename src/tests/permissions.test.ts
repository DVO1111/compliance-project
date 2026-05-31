import { describe, it, expect } from 'vitest';
import { getPermissions, SYSTEM_ROLE_DEFAULTS, type Permissions } from '../lib/permissions';

describe('permissions — admin/executive role', () => {
  it('executive role gets full permissions (all true)', () => {
    const perms = getPermissions({ profileRole: 'executive' });

    expect(perms.canViewMembers).toBe(true);
    expect(perms.canInvite).toBe(true);
    expect(perms.canRevokeInvite).toBe(true);
    expect(perms.canManageRoles).toBe(true);
    expect(perms.canUpload).toBe(false); // executive doesn't upload
    expect(perms.canViewLegalReview).toBe(true);
    expect(perms.canViewAuditTrail).toBe(true);
    expect(perms.canManagePolicies).toBe(true);
    expect(perms.canPublishPolicies).toBe(true);
    expect(perms.canManageVendors).toBe(true);
    expect(perms.canManageAuditWorkspace).toBe(true);
    expect(perms.canManageApiKeys).toBe(true);
    expect(perms.canViewAIDashboard).toBe(true);
  });

  it('"admin" maps to executive role', () => {
    const perms = getPermissions({ profileRole: 'admin' });
    const execPerms = getPermissions({ profileRole: 'executive' });
    expect(perms).toEqual(execPerms);
  });

  it('"owner" maps to executive role', () => {
    const perms = getPermissions({ profileRole: 'owner' });
    const execPerms = getPermissions({ profileRole: 'executive' });
    expect(perms).toEqual(execPerms);
  });
});

describe('permissions — viewer/restricted roles', () => {
  it('marketing role has restricted permissions', () => {
    const perms = getPermissions({ profileRole: 'marketing' });

    expect(perms.canUpload).toBe(true);
    expect(perms.canViewArchive).toBe(true);
    expect(perms.canViewTraining).toBe(true);

    // Should NOT have admin capabilities
    expect(perms.canManageRoles).toBe(false);
    expect(perms.canInvite).toBe(false);
    expect(perms.canRevokeInvite).toBe(false);
    expect(perms.canViewLegalReview).toBe(false);
    expect(perms.canManagePolicies).toBe(false);
    expect(perms.canManageVendors).toBe(false);
    expect(perms.canManageApiKeys).toBe(false);
  });

  it('agency role can only upload and view archive/portal', () => {
    const perms = getPermissions({ profileRole: 'agency' });

    expect(perms.canUpload).toBe(true);
    expect(perms.canViewArchive).toBe(true);
    expect(perms.canViewAgencyPortal).toBe(true);
    expect(perms.canViewContentBlocks).toBe(true);

    // Should NOT have any admin or compliance capabilities
    expect(perms.canViewMembers).toBe(false);
    expect(perms.canViewLegalReview).toBe(false);
    expect(perms.canViewAuditTrail).toBe(false);
    expect(perms.canManageRoles).toBe(false);
    expect(perms.canManageGrcFrameworks).toBe(false);
  });

  it('auditor role gets only audit-related view permissions', () => {
    const perms = getPermissions({ profileRole: 'auditor' });

    expect(perms.canViewAuditWorkspace).toBe(true);
    expect(perms.canViewAuditExports).toBe(true);
    expect(perms.canViewGovernanceTimeline).toBe(true);
    expect(perms.canViewAIDashboard).toBe(true);

    // Should NOT be able to manage anything
    expect(perms.canManageAuditWorkspace).toBe(false);
    expect(perms.canManageAuditExports).toBe(false);
    expect(perms.canUpload).toBe(false);
    expect(perms.canManageRoles).toBe(false);
    expect(perms.canViewLegalReview).toBe(false);
  });
});

describe('permissions — custom permissions override', () => {
  it('custom permissions override defaults completely', () => {
    const custom: Partial<Permissions> = {
      canUpload: true,
      canViewArchive: true,
      canManageRoles: true,
    };

    const perms = getPermissions({
      profileRole: 'marketing',
      customPermissions: custom,
    });

    // Custom permissions applied
    expect(perms.canUpload).toBe(true);
    expect(perms.canViewArchive).toBe(true);
    expect(perms.canManageRoles).toBe(true);

    // Everything else defaults to false (not inherited from marketing)
    expect(perms.canViewTraining).toBe(false);
    expect(perms.canViewLegalReview).toBe(false);
  });

  it('custom permissions with empty object gives all-false', () => {
    const perms = getPermissions({ customPermissions: {} });

    const allKeys = Object.keys(perms) as (keyof Permissions)[];
    for (const key of allKeys) {
      expect(perms[key]).toBe(false);
    }
  });

  it('custom permissions take priority over profileRole', () => {
    const perms = getPermissions({
      profileRole: 'executive',
      customPermissions: { canViewMembers: false, canManageRoles: false },
    });

    // Custom says false — should override executive defaults
    expect(perms.canViewMembers).toBe(false);
    expect(perms.canManageRoles).toBe(false);
  });
});

describe('permissions — edge cases', () => {
  it('unknown role returns all-false permissions', () => {
    const perms = getPermissions({ profileRole: 'nonexistent_role' });

    const allKeys = Object.keys(perms) as (keyof Permissions)[];
    for (const key of allKeys) {
      expect(perms[key]).toBe(false);
    }
  });

  it('null profileRole returns all-false permissions', () => {
    const perms = getPermissions({ profileRole: null });

    const allKeys = Object.keys(perms) as (keyof Permissions)[];
    for (const key of allKeys) {
      expect(perms[key]).toBe(false);
    }
  });

  it('no arguments returns all-false permissions', () => {
    const perms = getPermissions();

    const allKeys = Object.keys(perms) as (keyof Permissions)[];
    for (const key of allKeys) {
      expect(perms[key]).toBe(false);
    }
  });

  it('"legal" maps to compliance role', () => {
    const perms = getPermissions({ profileRole: 'legal' });
    const compPerms = getPermissions({ profileRole: 'compliance' });
    expect(perms).toEqual(compPerms);
  });

  it('"vendor" maps to agency role', () => {
    const perms = getPermissions({ profileRole: 'vendor' });
    const agencyPerms = getPermissions({ profileRole: 'agency' });
    expect(perms).toEqual(agencyPerms);
  });

  it('role matching is case-insensitive', () => {
    const upper = getPermissions({ profileRole: 'EXECUTIVE' });
    const lower = getPermissions({ profileRole: 'executive' });
    const mixed = getPermissions({ profileRole: 'Executive' });
    expect(upper).toEqual(lower);
    expect(mixed).toEqual(lower);
  });

  it('role matching trims whitespace', () => {
    const padded = getPermissions({ profileRole: '  executive  ' });
    const clean = getPermissions({ profileRole: 'executive' });
    expect(padded).toEqual(clean);
  });

  it('SYSTEM_ROLE_DEFAULTS covers all five system roles', () => {
    expect(Object.keys(SYSTEM_ROLE_DEFAULTS)).toEqual(
      expect.arrayContaining(['marketing', 'compliance', 'executive', 'agency', 'auditor'])
    );
  });
});
