/**
 * CF-02 — Settings home: every setting in one place.
 *
 * ── WHAT CF-01 FOUND, AND WHY THIS EXISTS ──
 *
 * CF-01 ("Configuration audit") walked fifteen configuration areas and
 * recorded where each one lives, ending with the conclusion this module
 * implements: *"Every area is now reachable from one Settings home
 * (CF-02)"*. HS-02's own relocation table agrees — "Roles & permissions,
 * People, Sites, Specifications & forms, Approval rules → Settings
 * (CF-02)", and "Audit trail → Settings › Audit trail".
 *
 * Before this, the seventeen configuration pages were seventeen sidebar
 * entries, and the one called "Settings" was the company-profile page.
 *
 * ── THE PERMISSION PROBLEM THIS HAD TO AVOID ──
 *
 * `company-settings` is guarded by `canManageRoles`. Routing the whole
 * of Settings behind that page would have put every configuration area
 * behind a role-administration permission — so a person allowed to see
 * Billing, and nothing else, would have needed role-admin to reach it.
 *
 * The opposite shortcut was available and is worse: granting a broad
 * "settings" permission to whoever needs one section. That is the thing
 * the brief forbids, and it would undo the least-privilege work on
 * `qa_manager` immediately.
 *
 * So the home is gated by the UNION of the sections' own existing
 * fine-grained checks, and it lists only the sections the viewer
 * actually holds. Nobody gains a permission; the pages they already
 * hold simply acquire one place to be found. A viewer who holds no
 * section at all has no Settings entry, which is correct — there would
 * be nothing behind it.
 *
 * Every predicate below is the page's EXISTING gate, copied verbatim
 * from the sidebar definitions it replaces, and
 * `src/tests/settingsHome.test.ts` asserts that correspondence so the
 * two cannot drift.
 */

import type { Permissions } from '../permissions';
import type { PageId } from '../../components/Layout/MainLayout';

/** The minimum shape of a profile these predicates read. */
export interface SettingsProfileShape {
  role?: string | null;
  organization_id?: string | null;
}

export interface SettingsSection {
  page: PageId;
  label: string;
  /** One line, in the person's language rather than the module's. */
  description: string;
  /**
   * CF-01's grouping, so the home reads the way the audit does rather
   * than the way the codebase happens to be arranged.
   */
  area: 'Company' | 'People and access' | 'Records and evidence' | 'Platform';
  /** The page's own existing gate. Not a new rule. */
  permitted: (perms: Permissions, profile?: SettingsProfileShape | null) => boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  // ── Company ───────────────────────────────────────────────────────
  {
    page: 'company-settings',
    label: 'Company profile',
    description: 'Name, sites and the details that appear on records and certificates.',
    area: 'Company',
    permitted: (p) => p.canManageRoles,
  },
  {
    page: 'company-departments',
    label: 'Departments',
    description: 'Departments drive document numbering, so a wrong one gives wrong numbers.',
    area: 'Company',
    permitted: (p) => p.canInvite,
  },
  {
    page: 'billing',
    label: 'Billing & plan',
    description: 'Subscription, invoices and what the current plan includes.',
    area: 'Company',
    permitted: (p) => p.canViewBilling,
  },
  {
    page: 'org-management',
    label: 'Organisation',
    description: 'Companies grouped under one organisation.',
    area: 'Company',
    //  Both halves of the original gate: a company with no
    //  organisation_id has nothing to manage here.
    permitted: (p, profile) => Boolean(profile?.organization_id) && p.canManageRoles,
  },

  // ── People and access ─────────────────────────────────────────────
  {
    page: 'company-members',
    label: 'Members',
    description: 'Who is in the workspace, and which sites they can see.',
    area: 'People and access',
    permitted: (p) => p.canViewMembers,
  },
  {
    page: 'company-invites',
    label: 'Invitations',
    description: 'Invitations sent and still pending.',
    area: 'People and access',
    permitted: (p) => p.canInvite,
  },
  {
    page: 'access-control',
    label: 'Roles & access',
    description: 'The operational role matrix: what each role can open and act on.',
    area: 'People and access',
    //  The sidebar entry carried no gate at all. Kept as it was.
    permitted: () => true,
  },
  {
    page: 'role-management',
    label: 'Role management',
    description: 'Fine-tune what a role may do, beyond its defaults.',
    area: 'People and access',
    permitted: (p) => p.canManageRoles,
  },
  {
    page: 'identity-providers',
    label: 'Single sign-on',
    description: 'Sign-in through an identity provider instead of a password.',
    area: 'People and access',
    permitted: (p) => p.canViewIdentity,
  },

  // ── Records and evidence ──────────────────────────────────────────
  {
    page: 'audit-trail',
    label: 'Audit trail',
    description: 'Read-only history, filtered to one record or one area.',
    area: 'Records and evidence',
    permitted: (p) => p.canViewAuditTrail,
  },
  {
    page: 'secret-vault',
    label: 'Secret vault',
    description: 'Credentials held for integrations, and who may read them.',
    area: 'Records and evidence',
    //  The original gate admitted a platform admin as well.
    permitted: (p, profile) => p.canManageRoles || profile?.role === 'admin',
  },

  // ── Platform ──────────────────────────────────────────────────────
  {
    page: 'integrations',
    label: 'Integrations',
    description: 'Connected systems and what each one is allowed to do.',
    area: 'Platform',
    permitted: (p) => p.canViewIntegrations,
  },
  {
    page: 'pharma-integrations',
    label: 'Pharma integrations',
    description: 'Regulator and laboratory connections specific to manufacturing.',
    area: 'Platform',
    permitted: (p) => p.canViewPharmaIntegrations,
  },
  {
    page: 'platform-webhooks',
    label: 'Outbound webhooks',
    description: 'Where the platform sends events, and their delivery history.',
    area: 'Platform',
    permitted: (p) => p.canViewWebhooks,
  },
  {
    page: 'platform-jobs',
    label: 'Platform jobs',
    description: 'Scheduled and background work, with what each run did.',
    area: 'Platform',
    permitted: (p) => p.canViewPlatformJobs,
  },
  {
    page: 'platform-ecosystem',
    label: 'Partner ecosystem',
    description: 'Partners connected to this workspace.',
    area: 'Platform',
    permitted: (p) => p.canViewEcosystem,
  },
  {
    page: 'partner-verification',
    label: 'Partner verification',
    description: 'Checks a partner has to pass before being connected.',
    area: 'Platform',
    permitted: (p) => p.canManageRoles,
  },
];

/** CF-01's areas, in the order the home draws them. */
export const SETTINGS_AREAS: SettingsSection['area'][] = [
  'Company', 'People and access', 'Records and evidence', 'Platform',
];

/** The sections this viewer may actually open. */
export function permittedSettingsSections(
  perms: Permissions,
  profile?: SettingsProfileShape | null,
): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => s.permitted(perms, profile));
}

/**
 * Whether the Settings entry is offered at all.
 *
 * The union of the sections' own gates — never a permission of its own.
 * Holding none of them means there is nothing behind the entry, so it is
 * not drawn.
 */
export function mayOpenSettingsHome(
  perms: Permissions,
  profile?: SettingsProfileShape | null,
): boolean {
  return permittedSettingsSections(perms, profile).length > 0;
}
