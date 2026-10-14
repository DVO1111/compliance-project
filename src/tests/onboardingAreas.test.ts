/**
 * ONB-04 and ONB-05's rules.
 *
 * The ones worth a test are the ones that are invisible when they break:
 *
 *   - an area offered to the wrong industry. The notes are explicit —
 *     "a pharmaceutical manufacturer never sees logistics or customs
 *     modules: they are not offered at all" — and the failure is a card
 *     appearing on a screen nobody will look at twice.
 *
 *   - a coming-later area that can be ticked. It would be stored, and
 *     the workspace would carry a module that does not exist.
 *
 *   - a job title treated as a permission level. "Head of Quality"
 *     mapped onto `admin` hands someone the ability to remove their
 *     colleagues, which does not follow from running a QA department.
 */
import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_AREAS, areasForIndustry, sectionsForIndustry,
  defaultAreasFor, modulesForAreas, switchedOnLine, recommendedHeading,
} from '../lib/onboarding/onboardingAreas';
import { INDUSTRIES } from '../lib/onboarding/onboardingData';
import {
  TEAM_ROLES, ROLE_TITLES, roleByTitle, permissionRoleFor, INVITE_PERMISSION_LEVEL,
} from '../lib/onboarding/teamRoles';
import { MODULE_KEYS, moduleAccessToPermissions } from '../lib/moduleAccess';
import { completedFromState, EMPTY_SETUP_STATE } from '../lib/onboarding/setupSteps';

describe('the areas a workspace can switch on', () => {
  it('names what the team will do, never a module', () => {
    //  "Plain language, never technical module names (W1·14 VERIFY)."
    //  A title that is a noun phrase ending in a product word is the
    //  shape this rule forbids.
    for (const a of ONBOARDING_AREAS) {
      expect(a.title).not.toMatch(/\bmodule\b/i);
      expect(a.title.toLowerCase()).not.toMatch(/^(batch execution|document control|capa management)$/);
    }
  });

  it('every grant is a module key the permission system understands', () => {
    //  A typo here grants nothing and fails silently:
    //  moduleAccessToPermissions skips keys it does not know.
    for (const a of ONBOARDING_AREAS) {
      for (const g of a.grants) {
        expect(MODULE_KEYS).toContain(g);
      }
    }
  });

  it('recommendedFor is always a subset of offeredTo', () => {
    //  Otherwise an area would start ticked on a screen that never
    //  renders it, and be saved by someone who never saw it.
    for (const a of ONBOARDING_AREAS) {
      for (const industry of a.recommendedFor) {
        expect(a.offeredTo).toContain(industry);
      }
    }
  });

  it('nothing coming later is recommended, or grants anything', () => {
    for (const a of ONBOARDING_AREAS.filter((x) => x.state === 'coming-later')) {
      expect(a.recommendedFor).toEqual([]);
      expect(a.grants).toEqual([]);
    }
  });

  //  The deliberate MVP exclusions named in the notes.
  it('the four coming-later areas are the four the notes name', () => {
    expect(ONBOARDING_AREAS.filter((a) => a.state === 'coming-later').map((a) => a.id).sort())
      .toEqual(['allergens', 'pharmacovigilance', 'recalls', 'supplier-portal']);
  });
});

describe('what each industry is offered', () => {
  it('pharma gets the eight recommended areas the design shows', () => {
    const { recommended } = sectionsForIndustry('pharma');
    expect(recommended.map((a) => a.id)).toEqual([
      'materials', 'floor', 'release', 'deviations',
      'sops', 'changes', 'registrations', 'inspections',
    ]);
    expect(switchedOnLine(recommended.length)).toMatch(/^8 areas switched on\./);
  });

  it('pharma is also offered SON and import permits, unticked', () => {
    const { alsoAvailable } = sectionsForIndustry('pharma');
    expect(alsoAvailable.map((a) => a.id)).toEqual(['son', 'import-permits']);
    expect(defaultAreasFor('pharma')).not.toContain('son');
  });

  //  THE J9.1 RULE. An importer manufactures nothing, so a batch record
  //  is not something they could ever raise — the card is absent, not
  //  greyed, and absent from every section including "also available".
  it('an importer is never shown the factory floor', () => {
    const offered = areasForIndustry('importer').map((a) => a.id);
    expect(offered).not.toContain('floor');
    expect(offered).not.toContain('release');

    const s = sectionsForIndustry('importer');
    const everywhere = [...s.recommended, ...s.alsoAvailable, ...s.comingLater].map((a) => a.id);
    expect(everywhere).not.toContain('floor');
  });

  it('import permits start ticked for an importer and not for a maker', () => {
    expect(defaultAreasFor('importer')).toContain('import-permits');
    expect(defaultAreasFor('food')).not.toContain('import-permits');
  });

  it('MANCAP starts ticked for food and beverage', () => {
    expect(defaultAreasFor('food')).toContain('son');
  });

  //  J9.1 is about not OFFERING an irrelevant module. Coming-later
  //  areas are offered to nobody — they are the roadmap, which the
  //  notes give as one set and the design shows in full.
  it('every industry sees the same four coming-later areas', () => {
    for (const i of INDUSTRIES) {
      expect(sectionsForIndustry(i.id).comingLater.map((a) => a.id).sort())
        .toEqual(['allergens', 'pharmacovigilance', 'recalls', 'supplier-portal']);
    }
  });

  it('every industry gets at least one recommended area', () => {
    //  A screen whose first card is empty would read as a loading
    //  failure, and Continue would refuse with nothing to tick.
    for (const i of INDUSTRIES) {
      expect(sectionsForIndustry(i.id).recommended.length).toBeGreaterThan(0);
    }
  });

  it('the heading reads as the design writes it', () => {
    const pharma = INDUSTRIES.find((i) => i.id === 'pharma')!;
    expect(recommendedHeading(pharma.plural))
      .toBe('Recommended for pharmaceutical manufacturers');
  });
});

describe('areas to permissions', () => {
  it('collapses the bundles several areas share', () => {
    //  Both grant quality_operations; the stored list must not say it
    //  twice.
    const keys = modulesForAreas(['release', 'changes']);
    expect(keys).toEqual(['quality_operations']);
  });

  it('a coming-later area grants nothing even if it is passed in', () => {
    expect(modulesForAreas(['pharmacovigilance'])).toEqual([]);
  });

  it('an unknown area is ignored rather than throwing', () => {
    expect(modulesForAreas(['not-an-area', 'sops'])).toContain('policy_management');
  });

  it('the default pharma selection actually unlocks the product', () => {
    const perms = moduleAccessToPermissions(modulesForAreas(defaultAreasFor('pharma')));
    expect(perms.canViewCapaManagement).toBe(true);
    expect(perms.canViewPolicies).toBe(true);
  });

  it('counts one area in the singular', () => {
    expect(switchedOnLine(1)).toMatch(/^1 area switched on\./);
  });
});

describe('team roles', () => {
  it('are the five the screen lists, in order', () => {
    expect(ROLE_TITLES).toEqual([
      'Head of Quality / QA Manager',
      'QC Analyst',
      'Production Manager',
      'Regulatory Affairs Lead',
      'Managing Director',
    ]);
  });

  //  "The copy says QC cannot release, so nobody expects the action and
  //  then finds it missing." That sentence is the feature.
  it('say plainly that a QC Analyst cannot release', () => {
    expect(roleByTitle('QC Analyst')?.meaning).toMatch(/cannot release/i);
  });

  it('none of them is one of the old permission levels', () => {
    //  "The ADM-04 invite modal used Admin / Legal / Marketing / Viewer
    //  … Both are replaced."
    for (const t of ROLE_TITLES) {
      expect(['Admin', 'Legal', 'Marketing', 'Viewer']).not.toContain(t);
    }
  });

  //  THE ONE THAT MATTERS. A job is not a permission: deriving one from
  //  the other is how a laboratory manager ends up able to remove their
  //  colleagues.
  it('no job title becomes an elevated permission level', () => {
    for (const t of ROLE_TITLES) {
      expect(permissionRoleFor(t)).toBe(INVITE_PERMISSION_LEVEL);
      expect(['admin', 'owner']).not.toContain(permissionRoleFor(t));
    }
  });

  it('the roles that usually sign are the ones with signing authority', () => {
    expect(TEAM_ROLES.filter((r) => r.usuallySigns).map((r) => r.id))
      .toEqual(['head-of-quality', 'regulatory-affairs-lead', 'managing-director']);
  });
});

describe('when step 5 counts as done', () => {
  //  "Invitations are sent by email when you continue. People who
  //  haven't accepted yet show as pending." Waiting on someone else's
  //  inbox is not an unfinished setup task.
  it('a sent invitation is enough', () => {
    const done = completedFromState({ ...EMPTY_SETUP_STATE, pendingInviteCount: 1 });
    expect(done['invite-team']).toBe(true);
  });

  it('being alone in the workspace is not', () => {
    const done = completedFromState({ ...EMPTY_SETUP_STATE, memberCount: 1 });
    expect(done['invite-team']).toBe(false);
  });
});
