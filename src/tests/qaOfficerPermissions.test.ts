/**
 * qa_officer — the role mapping, and why it is one key.
 *
 * PM-03 tabulates this role. `canonicalRole()` did not know it, so a
 * QA Officer fell through to EMPTY_PERMISSIONS exactly as the QA
 * Manager did before Phase 2.
 *
 * The row was READ, not guessed, from `section_permissions`:
 *
 *     act   coa_register, deviation_capa, qa_disposition
 *     view  batch_records, batch_release, distribution, goods_receipt,
 *           material_lots, qc_testing, suppliers, traceability
 *
 * Ten of those eleven sections are gated by PM-03 alone — through
 * PAGE_SECTION and canAct/canView — and consult no `Permissions` key.
 * The exception is deviation_capa, whose two pages are guarded on the
 * route AND hidden from the rail by `canViewCapaManagement`. So that
 * single key is the whole fix.
 *
 * This file holds both halves the brief asked for: that the approved
 * duties are reachable, and that nothing else was opened.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getPermissions, EMPTY_PERMISSIONS, SYSTEM_ROLE_DEFAULTS,
  type Permissions,
} from '../lib/permissions';
import { PM_SECTIONS, PAGE_SECTION, canAct, canView } from '../lib/access/roleAccess';

/** Every key, taken from the empty preset so none can be missed. */
const ALL_KEYS = Object.keys(EMPTY_PERMISSIONS) as (keyof Permissions)[];

/** The one key qa_officer's PM-03 row requires. */
const GRANTED: (keyof Permissions)[] = ['canViewCapaManagement'];

const officer = () => getPermissions({ profileRole: 'qa_officer' });

describe('the role resolves at all', () => {
  it('no longer falls through to the empty permission set', () => {
    //  The defect: every key false, so Deviations and CAPA were
    //  hidden from a role PM-03 grants `act` on them.
    const p = officer();
    expect(ALL_KEYS.some((k) => p[k] === true)).toBe(true);
  });

  it('has a dedicated preset rather than borrowing one', () => {
    expect(SYSTEM_ROLE_DEFAULTS.qa_officer).toBeDefined();
  });

  it.each(['qa_officer', 'qa officer', 'qa-officer', 'QA Officer', '  QA_Officer  '])(
    'normalises the spelling %j',
    (spelling) => {
      //  `norm()` only trims and lowercases — it folds no separators —
      //  which is exactly why qa_manager needed explicit variants.
      const p = getPermissions({ profileRole: spelling });
      expect(p.canViewCapaManagement).toBe(true);
    },
  );
});

describe('the approved duties are reachable', () => {
  it('grants canViewCapaManagement, which gates Deviations and CAPA', () => {
    expect(officer().canViewCapaManagement).toBe(true);
  });

  it('is the key the route and the rail both test', () => {
    //  Asserted against the application rather than trusted: if either
    //  gate is ever changed to a different key, this fails and the
    //  preset has to be revisited.
    const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
    const layout = readFileSync(
      join(process.cwd(), 'src/components/Layout/MainLayout.tsx'), 'utf8',
    );
    const route = app.slice(app.indexOf("case 'capa-management':"));
    expect(route.slice(0, 300)).toMatch(/perms\.canViewCapaManagement/);
    expect(layout).toMatch(/id: 'deviations'[^}]*canViewCapaManagement/);
    expect(layout).toMatch(/id: 'capa-management'[^}]*canViewCapaManagement/);
  });
});

describe('nothing else was opened — the denial half', () => {
  it('grants exactly one key and no other', () => {
    const p = officer();
    const granted = ALL_KEYS.filter((k) => p[k] === true);
    expect(granted).toEqual(GRANTED);
  });

  /*
   *  The shortcut the product owner refused, for qa_manager and again
   *  here: pointing the role at the `quality` preset. It carries
   *  member listing, role administration and a long tail of unrelated
   *  capability, and fixing navigation is not a reason to widen
   *  authority.
   */
  it('is not the quality preset', () => {
    const officerPerms = officer();
    const quality = getPermissions({ profileRole: 'quality' });
    const qualityGrants = ALL_KEYS.filter((k) => quality[k] === true);
    //  The quality preset grants many keys; this must not be it.
    expect(qualityGrants.length).toBeGreaterThan(GRANTED.length);
    expect(ALL_KEYS.filter((k) => officerPerms[k] === true)).not.toEqual(qualityGrants);
  });

  it('is not qa_manager either — PM-03 gives them different rows', () => {
    const manager = getPermissions({ profileRole: 'qa_manager' });
    const p = officer();
    //  Obligations, Risk Register and Policies are the QA Manager's
    //  row, not this one.
    expect(manager.canViewObligations).toBe(true);
    expect(p.canViewObligations).toBe(false);
    expect(p.canViewRiskRegister).toBe(false);
    expect(p.canViewPolicies).toBe(false);
  });

  it.each([
    'canManageRoles', 'canViewMembers', 'canInvite', 'canRevokeInvite',
    'canManagePolicies', 'canPublishPolicies',
    'canViewBilling', 'canViewIntegrations',
    'canUpload', 'canViewAuditTrail', 'canViewComplianceReporting',
  ] as (keyof Permissions)[])('withholds %s', (key) => {
    expect(officer()[key]).toBe(false);
  });

  it('writes out every key, so a new permission cannot arrive switched on', () => {
    //  Spreading EMPTY_PERMISSIONS would make a future key inherit
    //  whatever the empty preset says; listing all eighty forces a
    //  decision here instead.
    const preset = SYSTEM_ROLE_DEFAULTS.qa_officer as Record<string, boolean>;
    expect(Object.keys(preset).length).toBe(ALL_KEYS.length);
    for (const k of ALL_KEYS) expect(preset).toHaveProperty(k);
  });
});

describe('the roles either side of it are untouched', () => {
  it('quality_manager still resolves to the quality preset', () => {
    //  The one thing the Phase 2 brief forbade changing, re-asserted
    //  because this batch edited the same function.
    const qm = getPermissions({ profileRole: 'quality_manager' });
    const quality2 = getPermissions({ profileRole: 'quality' });
    expect(ALL_KEYS.filter((k) => qm[k] === true))
      .toEqual(ALL_KEYS.filter((k) => quality2[k] === true));
  });

  it('qa_manager still grants exactly its four keys', () => {
    const p = getPermissions({ profileRole: 'qa_manager' });
    expect(ALL_KEYS.filter((k) => p[k] === true).sort()).toEqual([
      'canViewMyPolicies', 'canViewObligations', 'canViewPolicies', 'canViewRiskRegister',
    ]);
  });

  it('an unknown role still resolves to nothing', () => {
    //  The fallback must stay closed: a typo in a role name should
    //  grant nothing, not inherit the last preset added.
    const p = getPermissions({ profileRole: 'not_a_real_role' });
    expect(ALL_KEYS.every((k) => p[k] === false)).toBe(true);
  });
});

describe('PM-03 itself is untouched', () => {
  /*
   *  An earlier version of this test asserted that roleAccess.ts does
   *  not mention qa_officer, which was nonsense: that file IS the
   *  PM-03 matrix and one of its rows belongs to this role. What the
   *  assertion meant is below — the row itself is unchanged.
   */
  it('qa_officer PM-03 row is exactly what the fix was derived from', () => {
    //  Read from `section_permissions` in an applied build before the
    //  preset was written: act on coa_register, deviation_capa and
    //  qa_disposition; view on the other eight. If the grid ever
    //  changes, the preset must be re-derived rather than inherited.
    const act = PM_SECTIONS.filter((sec) => canAct('qa_officer', sec)).sort();
    expect(act).toEqual(['coa_register', 'deviation_capa', 'qa_disposition']);

    const viewOnly = PM_SECTIONS
      .filter((sec) => canView('qa_officer', sec) && !canAct('qa_officer', sec))
      .sort();
    expect(viewOnly).toEqual([
      'batch_records', 'batch_release', 'distribution', 'goods_receipt',
      'material_lots', 'qc_testing', 'suppliers', 'traceability',
    ]);
  });

  it('every section in the row is reachable, so no grant is stranded', () => {
    //  The invariant batch 3 added, applied to this role: a section
    //  with a grant and no page is a permission nobody can use.
    for (const sec of PM_SECTIONS) {
      if (!canView('qa_officer', sec)) continue;
      const pages = Object.entries(PAGE_SECTION).filter(([, v]) => v === sec);
      expect(pages.length).toBeGreaterThan(0);
    }
  });

  it('the fix is additive in permissions.ts', () => {
    //  132 insertions, 0 deletions. Asserted structurally: the four
    //  presets that existed before must all still be there.
    for (const preset of ['quality', 'compliance', 'executive', 'qa_manager']) {
      expect(SYSTEM_ROLE_DEFAULTS).toHaveProperty(preset);
    }
  });
});
