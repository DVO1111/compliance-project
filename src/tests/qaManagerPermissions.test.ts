/**
 * qa_manager — the least-privilege preset, and what it must not grant.
 *
 * ── THE DEFECT ──
 *
 * PM-03 names this role `qa_manager`. `canonicalRole()` knew only
 * "quality_manager", and `norm()` trims and lower-cases without folding
 * separators, so "qa_manager", "QA Manager" and "qa-manager" all fell
 * through to `EMPTY_PERMISSIONS`. A QA Manager therefore could not see
 * Obligations, Risk Register or Policies — the three pages decision D1
 * put in the pilot.
 *
 * ── THE REPAIR, AND THE REPAIR THAT WAS REFUSED ──
 *
 * Pointing `qa_manager` at the existing `quality` preset would have
 * fixed the navigation in one line and granted a long tail of unrelated
 * authority with it — `canViewMembers`, the administrative surface, and
 * more. The product owner refused that explicitly. So there is a
 * dedicated preset granting exactly three view permissions.
 *
 * These tests exist to keep it that way. The first group proves D1 is
 * actually satisfied; the second is the one that matters in six months,
 * when somebody "fixes" a missing page by widening this preset.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  getPermissions, SYSTEM_ROLE_DEFAULTS, EMPTY_PERMISSIONS,
  type Permissions,
} from '../lib/permissions';

const qa = () => getPermissions({ profileRole: 'qa_manager' });

/** The three D1 granted. */
const D1_GRANTED: (keyof Permissions)[] = [
  'canViewObligations', 'canViewRiskRegister', 'canViewPolicies',
];

/**
 * The full grant: D1's three plus `canViewMyPolicies`.
 *
 * That fourth key carries NO authority. It is referenced in exactly one
 * place in the application — the `hidden` test on the My Policies nav
 * item — and gates no route, no write and no service call. The route for
 * that page is guarded by `canViewPolicies`, which this role has, so
 * withholding the flag would not deny access; it would hide a page the
 * role is authorised to open. Asserted below rather than just stated.
 */
const GRANTED: (keyof Permissions)[] = [...D1_GRANTED, 'canViewMyPolicies'];

describe('decision 1 is actually satisfied for the role PM-03 names', () => {
  it.each(D1_GRANTED)('qa_manager may view %s', (key) => {
    expect(qa()[key]).toBe(true);
  });

  //  The spellings that occur in this codebase. norm() does not fold
  //  separators, so each has to be handled explicitly — and "QA Manager"
  //  is the one that appears in copy and in fixtures.
  it.each(['qa_manager', 'QA Manager', 'qa-manager', 'QA_MANAGER', '  qa_manager  '])(
    'resolves the spelling %p to the same preset',
    (spelling) => {
      expect(getPermissions({ profileRole: spelling })).toEqual(qa());
    },
  );

  it('is no longer the all-false fallback', () => {
    expect(qa()).not.toEqual(EMPTY_PERMISSIONS);
  });
});

describe('qa_manager receives no unrelated authority', () => {
  it('grants exactly four permissions out of eighty', () => {
    const granted = (Object.entries(qa()) as [keyof Permissions, boolean][])
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort();
    expect(granted).toEqual([...GRANTED].sort());
  });

  //  Named individually as well as counted, because a count tells you
  //  something changed and a name tells you what.
  it.each<keyof Permissions>([
    'canManagePolicies', 'canPublishPolicies',
    'canManageRoles', 'canViewMembers', 'canInvite', 'canRevokeInvite',
    'canViewBilling', 'canViewIntegrations', 'canManageApiKeys',
    'canViewAuditTrail', 'canManageVendors', 'canManageAuditWorkspace',
    'canViewAIDashboard',
  ])('does not grant %s', (key) => {
    expect(qa()[key]).toBe(false);
  });

  it('is strictly narrower than the quality preset it was not given', () => {
    const quality = SYSTEM_ROLE_DEFAULTS['quality']!;
    const mine = qa();
    const extra = (Object.keys(mine) as (keyof Permissions)[])
      .filter((k) => mine[k] && !quality[k]);
    //  Narrower, not merely different: everything qa_manager holds, the
    //  quality preset also holds.
    expect(extra).toEqual([]);
    const fewer = (Object.keys(mine) as (keyof Permissions)[])
      .filter((k) => quality[k] && !mine[k]);
    expect(fewer.length).toBeGreaterThan(0);
  });

  //  Keeps the justification for the fourth key honest: if
  //  canViewMyPolicies ever starts gating a route or a write, this fails
  //  and the grant has to be re-argued.
  it('the fourth key is visibility-only — it gates nothing but a nav item', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        //  The definition sites and this test are expected.
        if (/permissions\.ts$|moduleAccess\.ts$|\.test\.tsx?$/.test(full)) continue;
        if (readFileSync(full, 'utf8').includes('canViewMyPolicies')) hits.push(full);
      }
    };
    walk('src');
    //  One reference only, and it is the nav item's `hidden` test. If the
    //  key ever gates a route, a write or a service call, this fails and
    //  the grant has to be argued again rather than inherited.
    expect(hits).toEqual([join('src', 'components', 'Layout', 'MainLayout.tsx')]);
    const layout = readFileSync(hits[0]!, 'utf8');
    const line = layout.split('\n').find((l) => l.includes('canViewMyPolicies'))!;
    expect(line).toContain('hidden:');
    expect(line).toContain("id: 'my-policies'");
  });

  it('does not grant policy authoring just because it grants policy viewing', () => {
    const p = qa();
    expect(p.canViewPolicies).toBe(true);
    expect(p.canManagePolicies).toBe(false);
    expect(p.canPublishPolicies).toBe(false);
  });
});

describe('every other role keeps the behaviour it had', () => {
  //  `quality_manager` is the spelling that already worked, and the
  //  instruction was explicit that it must not change. It still resolves
  //  to the broader `quality` preset — an asymmetry kept on purpose and
  //  recorded as outstanding.
  it('quality_manager still resolves to the quality preset', () => {
    expect(getPermissions({ profileRole: 'quality_manager' }))
      .toEqual(getPermissions({ profileRole: 'quality' }));
  });

  it('quality_manager and qa_manager are deliberately NOT the same today', () => {
    expect(getPermissions({ profileRole: 'quality_manager' })).not.toEqual(qa());
  });

  it.each(['marketing', 'compliance', 'executive', 'agency', 'auditor', 'quality'])(
    '%s resolves to its own preset, unchanged',
    (role) => {
      expect(getPermissions({ profileRole: role }))
        .toEqual(SYSTEM_ROLE_DEFAULTS[role]!);
    },
  );

  it.each(['admin', 'owner', 'exec'])('%s still maps to executive', (alias) => {
    expect(getPermissions({ profileRole: alias }))
      .toEqual(getPermissions({ profileRole: 'executive' }));
  });

  it('an unknown role is still the all-false fallback', () => {
    expect(getPermissions({ profileRole: 'wharf_inspector' })).toEqual(EMPTY_PERMISSIONS);
  });

  //  qa_officer has the same defect qa_manager had — PM-03 names it and
  //  canonicalRole does not know it. Left alone on purpose: the
  //  instruction covered qa_manager, and changing another role's
  //  resolution was not asked for. Asserted so the gap is recorded in a
  //  test rather than only in prose, and so this flips visibly the day
  //  somebody decides to close it.
  it('qa_officer remains unresolved — a known gap, not a silent one', () => {
    expect(getPermissions({ profileRole: 'qa_officer' })).toEqual(EMPTY_PERMISSIONS);
  });
});

describe('the preset is complete, so a new permission cannot arrive switched on', () => {
  it('states every key EMPTY_PERMISSIONS states', () => {
    const preset = SYSTEM_ROLE_DEFAULTS['qa_manager']!;
    expect(Object.keys(preset).sort()).toEqual(Object.keys(EMPTY_PERMISSIONS).sort());
  });

  //  The type already requires this; asserting it means a key added to
  //  the type and defaulted somewhere else still shows up here.
  it('defaults every ungranted key to false rather than leaving it undefined', () => {
    const preset = SYSTEM_ROLE_DEFAULTS['qa_manager']!;
    for (const [k, v] of Object.entries(preset)) {
      expect(typeof v, `${k} is not a boolean`).toBe('boolean');
      if (!(GRANTED as string[]).includes(k)) {
        expect(v, `${k} should be false for qa_manager`).toBe(false);
      }
    }
  });
});

describe('industry suppression still applies on top', () => {
  //  The preset is the base, not the answer: a logistics workspace
  //  suppresses sector-irrelevant modules afterwards. None of the three
  //  is in that list, so they survive — asserted because "the overlay
  //  quietly removed D1's pages" would be a confusing bug to chase.
  it('keeps the three for a logistics workspace', () => {
    const p = getPermissions({ profileRole: 'qa_manager', industryType: 'Logistics & Courier' });
    for (const k of D1_GRANTED) expect(p[k]).toBe(true);
  });
});
