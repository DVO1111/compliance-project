/**
 * CF-02 Settings home — consolidation that grants nothing.
 *
 * ── THE TRAP THIS SCREEN HAD TO AVOID ──
 *
 * `company-settings` is guarded by `canManageRoles`. It was also the
 * rail entry called "Settings". So routing the consolidated home through
 * it would have put every configuration area behind a
 * role-administration permission: a person allowed to see Billing and
 * nothing else would have needed role-admin to reach Billing.
 *
 * The other shortcut — inventing a broad `canViewSettings` and handing
 * it out — is the one the brief forbids, and it would undo the
 * least-privilege `qa_manager` preset immediately.
 *
 * So the home is gated by the UNION of the sections' own existing
 * checks. These tests pin that: the home grants nothing, each section
 * keeps its own gate, and `qa_manager` in particular gets no Settings
 * access out of this.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SETTINGS_SECTIONS, SETTINGS_AREAS,
  permittedSettingsSections, mayOpenSettingsHome,
} from '../lib/navigation/settingsSections';
import { getPermissions, EMPTY_PERMISSIONS, type Permissions } from '../lib/permissions';
import { DESTINATIONS, hostedUnder } from '../lib/navigation/hs02';

const as = (role: string) => getPermissions({ profileRole: role });
const withOrg = { organization_id: 'org-1', role: null };

describe('the home has no permission of its own', () => {
  //  The gate is DERIVED, never stored: it is exactly "at least one
  //  section is permitted". Asserted across every role rather than
  //  spot-checked, because the failure mode would be the two drifting
  //  apart — an entry drawn with nothing behind it, or hidden with
  //  something behind it.
  it.each(['executive', 'compliance', 'marketing', 'auditor', 'quality', 'qa_manager', 'wharf_inspector'])(
    'for %s, the entry is offered exactly when a section is',
    (role) => {
      const perms = as(role);
      expect(mayOpenSettingsHome(perms, withOrg))
        .toBe(permittedSettingsSections(perms, withOrg).length > 0);
    },
  );

  //  `access-control` carried NO gate as a sidebar entry, and keeps
  //  none. So the home is never actually empty today, and a viewer
  //  holding nothing else still sees the role matrix — exactly as they
  //  did when it was its own sidebar entry. Preserved deliberately
  //  rather than tightened as a side effect of consolidating: this
  //  change is not the place to start refusing something.
  it('offers exactly the ungated section to a viewer with no permissions', () => {
    const open = permittedSettingsSections(EMPTY_PERMISSIONS, null).map((s) => s.page);
    expect(open).toEqual(['access-control']);
    expect(mayOpenSettingsHome(EMPTY_PERMISSIONS, null)).toBe(true);
  });

  //  And the empty-state copy still has to exist, because a viewer can
  //  reach the page by URL in a future where that section IS gated.
  it('keeps an empty state that distinguishes "none assigned" from "nothing here"', () => {
    const page = readFileSync(join('src', 'components', 'Settings', 'SettingsHomePage.tsx'), 'utf8');
    expect(page).toContain('sections.length === 0');
    expect(page).toContain('not an empty workspace');
  });

  it('opens for anybody holding any one section, and no more than that', () => {
    const onlyBilling: Permissions = { ...EMPTY_PERMISSIONS, canViewBilling: true };
    expect(mayOpenSettingsHome(onlyBilling, null)).toBe(true);
    const pages = permittedSettingsSections(onlyBilling, null).map((s) => s.page).sort();
    //  Billing plus the ungated matrix. Crucially NOT the company
    //  profile, which needs canManageRoles.
    expect(pages).toEqual(['access-control', 'billing']);
  });

  //  The whole point: reaching Billing must not require role admin.
  it('does not require canManageRoles to reach a section that never needed it', () => {
    const onlyBilling: Permissions = { ...EMPTY_PERMISSIONS, canViewBilling: true };
    expect(onlyBilling.canManageRoles).toBe(false);
    expect(permittedSettingsSections(onlyBilling, null).map((s) => s.page)).toContain('billing');
  });

  it('invents no permission key — every gate reads existing Permissions fields', () => {
    const src = readFileSync(join('src', 'lib', 'navigation', 'settingsSections.ts'), 'utf8');
    const referenced = [...src.matchAll(/\bp\.(can\w+)/g)].map((m) => m[1]!);
    expect(referenced.length).toBeGreaterThan(0);
    for (const key of referenced) {
      expect(Object.keys(EMPTY_PERMISSIONS), `${key} is not a real permission`).toContain(key);
    }
    //  And no new broad key was added to the type to serve this screen.
    expect(Object.keys(EMPTY_PERMISSIONS)).not.toContain('canViewSettings');
    expect(Object.keys(EMPTY_PERMISSIONS)).not.toContain('canManageSettings');
  });
});

describe('qa_manager gains no Settings access from this', () => {
  const qa = as('qa_manager');

  it('holds none of the administrative section permissions', () => {
    for (const key of [
      'canManageRoles', 'canViewMembers', 'canInvite', 'canViewBilling',
      'canViewAuditTrail', 'canViewIntegrations', 'canViewIdentity',
      'canViewWebhooks', 'canViewPlatformJobs', 'canViewEcosystem',
    ] as (keyof Permissions)[]) {
      expect(qa[key], `qa_manager should not hold ${key}`).toBe(false);
    }
  });

  it('sees only the ungated role matrix, and no configuration area', () => {
    const pages = permittedSettingsSections(qa, { role: 'qa_manager' }).map((s) => s.page);
    expect(pages).toEqual(['access-control']);
    expect(pages).not.toContain('company-settings');
    expect(pages).not.toContain('billing');
    expect(pages).not.toContain('role-management');
  });
});

describe('each section keeps the gate it already had', () => {
  //  Read out of MainLayout rather than restated, so a gate changed in
  //  one place and not the other fails here. This is the correspondence
  //  that makes "copied verbatim" checkable.
  const layout = readFileSync(join('src', 'components', 'Layout', 'MainLayout.tsx'), 'utf8');

  it.each<[string, string]>([
    ['company-settings', 'canManageRoles'],
    ['company-members', 'canViewMembers'],
    ['company-invites', 'canInvite'],
    ['company-departments', 'canInvite'],
    ['role-management', 'canManageRoles'],
    ['billing', 'canViewBilling'],
    ['audit-trail', 'canViewAuditTrail'],
    ['identity-providers', 'canViewIdentity'],
    ['integrations', 'canViewIntegrations'],
    ['pharma-integrations', 'canViewPharmaIntegrations'],
    ['platform-webhooks', 'canViewWebhooks'],
    ['platform-jobs', 'canViewPlatformJobs'],
    ['platform-ecosystem', 'canViewEcosystem'],
    ['partner-verification', 'canManageRoles'],
  ])('%s is still gated on %s in the sidebar definition', (page, key) => {
    const line = layout.split('\n').find((l) => l.includes(`id: '${page}'`));
    expect(line, `no sidebar entry found for ${page}`).toBeDefined();
    expect(line!).toContain(key);
  });

  it('grants a section to a role exactly when that role holds its key', () => {
    for (const role of ['executive', 'compliance', 'marketing', 'auditor', 'quality', 'qa_manager']) {
      const perms = as(role);
      const open = new Set(permittedSettingsSections(perms, withOrg).map((s) => s.page));
      for (const s of SETTINGS_SECTIONS) {
        expect(
          open.has(s.page),
          `${role}: ${s.page} visibility disagrees with its own predicate`,
        ).toBe(s.permitted(perms, withOrg));
      }
    }
  });
});

describe('the two-part gates keep both parts', () => {
  it('org-management needs an organisation AND canManageRoles', () => {
    const exec = as('executive');
    expect(exec.canManageRoles).toBe(true);
    const noOrg = permittedSettingsSections(exec, { organization_id: null }).map((s) => s.page);
    expect(noOrg).not.toContain('org-management');
    const withOrgPages = permittedSettingsSections(exec, withOrg).map((s) => s.page);
    expect(withOrgPages).toContain('org-management');
  });

  it('secret-vault admits canManageRoles OR a platform admin', () => {
    const plain: Permissions = { ...EMPTY_PERMISSIONS };
    expect(permittedSettingsSections(plain, { role: 'admin' }).map((s) => s.page))
      .toContain('secret-vault');
    expect(permittedSettingsSections(plain, { role: 'qa_manager' }).map((s) => s.page))
      .not.toContain('secret-vault');
  });
});

describe('the home is wired into navigation as the Settings entry', () => {
  it('is the rail entry, with the company-profile page inside it', () => {
    expect(DESTINATIONS['settings-home']).toMatchObject({
      kind: 'rail', group: 'Settings', label: 'Settings',
    });
    expect(DESTINATIONS['company-settings']).toMatchObject({
      kind: 'hosted', host: 'settings-home',
    });
  });

  it('hosts every section it lists', () => {
    const hosted = new Set(hostedUnder('settings-home').map((c) => c.id));
    for (const s of SETTINGS_SECTIONS) {
      expect(hosted.has(s.page), `${s.page} is listed on the home but not hosted under it`).toBe(true);
    }
  });

  it('lists every area it declares, and declares every area it lists', () => {
    const used = new Set(SETTINGS_SECTIONS.map((s) => s.area));
    expect([...used].sort()).toEqual([...SETTINGS_AREAS].sort());
  });

  it('names each section once', () => {
    const pages = SETTINGS_SECTIONS.map((s) => s.page);
    expect(new Set(pages).size).toBe(pages.length);
  });
});
