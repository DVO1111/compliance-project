/**
 * Asking for access, and deciding on it — W2-0.
 *
 * Every assertion below is a rule the design states, not a rule I
 * invented, and each test names the sentence it is holding the code to.
 * The ones that matter most are the two that cannot be fixed later by a
 * patch: that release can never be requested, and that an admin cannot
 * click through a segregation-of-duties conflict. Those are the controls
 * an inspector tests first, and a regression in either is not a bug in a
 * screen — it is a finding.
 */
import { describe, it, expect } from 'vitest';
import {
  SECTION_LABELS, UNREQUESTABLE, canBeRequested, unrequestableReason,
  checkConflict, forbiddenActSections, checkDecision, describeDecision,
  MAX_GRANT_DAYS,
  type AccessSection, type AccessLevel, type WorkRole,
  type AccessRequestInput, type Decision,
} from '../lib/access/permissionRequests';

const ALL_SECTIONS = Object.keys(SECTION_LABELS) as AccessSection[];

const ALL_ROLES: WorkRole[] = [
  'production_operator', 'production_supervisor', 'storekeeper',
  'qc_analyst', 'qa_officer', 'qa_manager', 'regulatory_affairs',
  'procurement', 'compliance_admin', 'other',
];

const LEVELS: AccessLevel[] = ['view', 'act'];

const TODAY = new Date(Date.UTC(2026, 9, 19));
const day = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const ask = (over: Partial<AccessRequestInput> = {}): AccessRequestInput => ({
  section: 'qc_testing',
  level: 'view',
  scope: 'Lots they received',
  until: day(2026, 11, 30),
  reason: 'Needs to see the result before signing the receipt.',
  ...over,
});

describe('what can be asked for', () => {
  //  "Release is a step permission, not a page permission; it can't be
  //  requested (2.5, C8.6)."
  it('refuses to make batch release requestable', () => {
    expect(canBeRequested('batch_release')).toBe(false);
    expect(unrequestableReason('batch_release')).toMatch(/cannot be requested/i);
  });

  //  The locked tile has no Request button and says why in the person's
  //  own words. A reason that is missing leaves the tile saying nothing.
  it('gives every unrequestable section a reason to show on the tile', () => {
    for (const [section, reason] of Object.entries(UNREQUESTABLE)) {
      expect(reason, section).toBeTruthy();
      expect(unrequestableReason(section as AccessSection), section).toBe(reason);
    }
  });

  it('leaves every other section requestable', () => {
    for (const s of ALL_SECTIONS) {
      if (s === 'batch_release') continue;
      expect(canBeRequested(s), s).toBe(true);
      expect(unrequestableReason(s), s).toBeNull();
    }
  });

  it('gives every section a label, so no dialog shows a raw key', () => {
    for (const s of ALL_SECTIONS) expect(SECTION_LABELS[s], s).toBeTruthy();
  });
});

describe('the automatic conflict check', () => {
  //  "Act is disabled where segregation of duties forbids it" — the rule
  //  is about ACTING. The design's own example grants a storekeeper View
  //  on QC testing and marks it "No conflict", so View must never be a
  //  conflict for anyone, anywhere.
  it('never treats View as a conflict, for any role in any section', () => {
    for (const role of ALL_ROLES) {
      for (const section of ALL_SECTIONS) {
        expect(checkConflict(role, section, 'view').conflicts, `${role}/${section}`).toBe(false);
      }
    }
  });

  it('is the design\'s worked example: storekeeper viewing QC testing is no conflict', () => {
    expect(checkConflict('storekeeper', 'qc_testing', 'view')).toEqual({ conflicts: false });
  });

  //  The example the drawer draws: a QC Analyst asking to Act on QA
  //  disposition. If this one ever came back clean the screenshot in the
  //  design would be a lie.
  it('is the design\'s worked example: QC analyst acting on QA disposition is a conflict', () => {
    const c = checkConflict('qc_analyst', 'qa_disposition', 'act');
    expect(c.conflicts).toBe(true);
    expect(c.reason).toMatch(/approving their own result/i);
  });

  //  A bare "Conflict" tells the admin nothing and the asker less. The
  //  design's declines name the right person — "Ask Tunde to issue lots"
  //  — so a conflict has to carry both halves.
  it('never reports a conflict without a reason and somewhere else to ask', () => {
    for (const role of ALL_ROLES) {
      for (const section of ALL_SECTIONS) {
        const c = checkConflict(role, section, 'act');
        if (c.conflicts) {
          expect(c.reason, `${role}/${section}`).toBeTruthy();
          expect(c.insteadAsk, `${role}/${section}`).toBeTruthy();
        }
      }
    }
  });

  it('separates production from the checks on production', () => {
    for (const role of ['production_operator', 'production_supervisor'] as WorkRole[]) {
      expect(checkConflict(role, 'qa_disposition', 'act').conflicts, role).toBe(true);
      expect(checkConflict(role, 'qc_testing', 'act').conflicts, role).toBe(true);
    }
  });

  it('keeps the store out of testing what it received', () => {
    expect(checkConflict('storekeeper', 'qc_testing', 'act').conflicts).toBe(true);
  });

  //  The compliance admin administers access; it is not a role that
  //  bypasses the duties rule, but neither is it one the rule blocks.
  it('does not forbid roles that have no conflicting duty', () => {
    expect(forbiddenActSections('qa_manager')).toEqual([]);
    expect(forbiddenActSections('compliance_admin')).toEqual([]);
    expect(forbiddenActSections('other')).toEqual([]);
  });

  //  forbiddenActSections drives which Act radios the dialog disables.
  //  If it disagreed with checkConflict, the dialog would offer Act on
  //  something the admin's drawer then refuses — the asker would be sent
  //  down a path that cannot end in a grant.
  it('agrees with checkConflict for every role and section', () => {
    for (const role of ALL_ROLES) {
      const forbidden = new Set(forbiddenActSections(role));
      for (const section of ALL_SECTIONS) {
        expect(forbidden.has(section), `${role}/${section}`)
          .toBe(checkConflict(role, section, 'act').conflicts);
      }
    }
  });
});

describe('deciding on a request', () => {
  //  "Decline. They keep their current access. A reason is required."
  it('requires a reason to decline', () => {
    const bad = checkDecision({ kind: 'decline', reason: '   ' }, ask(), 'storekeeper', TODAY);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.field).toBe('reason');

    const good = checkDecision(
      { kind: 'decline', reason: 'Issuing material is a Storekeeper task.' },
      ask(), 'storekeeper', TODAY,
    );
    expect(good.ok).toBe(true);
  });

  //  A decline is always available. It is the safe answer, and a
  //  conflict or an expired date must not block the admin from saying
  //  no — otherwise a conflicting request could not be disposed of.
  it('lets a conflicting request be declined', () => {
    const d = checkDecision(
      { kind: 'decline', reason: 'QA disposition belongs to QA.' },
      ask({ section: 'qa_disposition', level: 'act' }), 'qc_analyst', TODAY,
    );
    expect(d.ok).toBe(true);
  });

  it('grants a clean request as asked', () => {
    expect(checkDecision({ kind: 'grant_as_asked' }, ask(), 'storekeeper', TODAY).ok).toBe(true);
  });

  //  THE ONE THAT MATTERS. An admin may narrow a request. They may not
  //  approve a segregation-of-duties breach by clicking through it, by
  //  either route — as asked, or dressed up as a limited grant.
  it('refuses to grant Act into a conflict, however the grant is shaped', () => {
    const request = ask({ section: 'qa_disposition', level: 'act', until: null });

    const asAsked = checkDecision({ kind: 'grant_as_asked' }, request, 'qc_analyst', TODAY);
    expect(asAsked.ok).toBe(false);
    if (!asAsked.ok) {
      expect(asAsked.field).toBe('conflict');
      expect(asAsked.message).toMatch(/approving their own result/i);
    }

    const narrowed = checkDecision({
      kind: 'grant_with_limits', level: 'act',
      scope: 'One batch only', until: day(2026, 10, 26),
      note: 'Just this once, for the backlog.',
    }, request, 'qc_analyst', TODAY);
    expect(narrowed.ok).toBe(false);
    if (!narrowed.ok) expect(narrowed.field).toBe('conflict');
  });

  //  Narrowing Act to View is exactly how a conflicting request should
  //  be salvaged, and it has to be allowed or the admin's only option is
  //  a decline.
  it('allows a conflicting Act request to be narrowed down to View', () => {
    const d = checkDecision({
      kind: 'grant_with_limits', level: 'view',
      scope: 'Their own lots', until: day(2026, 11, 1),
      note: 'View only. Disposition stays with QA.',
    }, ask({ section: 'qa_disposition', level: 'act' }), 'qc_analyst', TODAY);
    expect(d.ok).toBe(true);
  });

  it('refuses a grant on a section that cannot be requested at all', () => {
    const d = checkDecision(
      { kind: 'grant_as_asked' },
      ask({ section: 'batch_release', level: 'act' }), 'qa_officer', TODAY,
    );
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.field).toBe('conflict');
  });

  //  "Note to Tunde (required when you change the request)."
  it('requires a note when the grant differs from what was asked', () => {
    const request = ask();
    const shorter: Decision = {
      kind: 'grant_with_limits', level: 'view',
      scope: request.scope, until: day(2026, 10, 26), note: '',
    };
    const bad = checkDecision(shorter, request, 'storekeeper', TODAY);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.field).toBe('note');

    const good = checkDecision(
      { ...shorter, note: 'A week to start with. Ask again if you still need it.' },
      request, 'storekeeper', TODAY,
    );
    expect(good.ok).toBe(true);
  });

  it('counts a narrower scope as a change that needs a note', () => {
    const d = checkDecision({
      kind: 'grant_with_limits', level: 'view',
      scope: 'Only lot MAT-2026-0114', until: ask().until, note: '  ',
    }, ask(), 'storekeeper', TODAY);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.field).toBe('note');
  });

  //  Picking "grant with limits" and then changing nothing is a grant as
  //  asked. Recording it as a limited grant would put a note in the log
  //  about a limit that does not exist.
  it('rejects a limited grant that narrows nothing', () => {
    const request = ask();
    const d = checkDecision({
      kind: 'grant_with_limits', level: request.level,
      scope: request.scope, until: request.until, note: 'Fine by me.',
    }, request, 'storekeeper', TODAY);
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.field).toBe('limits');
      expect(d.message).toMatch(/grant as asked/i);
    }
  });

  //  Limits narrow. An admin who wants to hand out more than was asked
  //  for is making a different decision, and it must not travel under a
  //  note addressed to the asker.
  it('refuses to upgrade a View request to Act', () => {
    const d = checkDecision({
      kind: 'grant_with_limits', level: 'act',
      scope: ask().scope, until: ask().until, note: 'You may as well have Act.',
    }, ask({ section: 'sop_library' }), 'regulatory_affairs', TODAY);
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.field).toBe('limits');
      expect(d.message).toMatch(/more than was asked for/i);
    }
  });
});

describe('how long a grant runs', () => {
  //  "Grants with an end date are removed automatically when they
  //  expire." An end date in the past would be removed the moment it was
  //  written, so it is a mistake and not a very short grant.
  it('refuses an end date that has already passed', () => {
    const d = checkDecision(
      { kind: 'grant_as_asked' }, ask({ until: day(2026, 10, 18) }), 'storekeeper', TODAY,
    );
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.field).toBe('limits');
  });

  it('accepts today as an end date', () => {
    const d = checkDecision(
      { kind: 'grant_as_asked' }, ask({ until: day(2026, 10, 19) }), 'storekeeper', TODAY,
    );
    expect(d.ok).toBe(true);
  });

  it('caps a temporary grant at the maximum, counted to the day', () => {
    const last = new Date(Date.UTC(2026, 9, 19) + MAX_GRANT_DAYS * 86400000);
    const iso = last.toISOString().slice(0, 10);
    expect(checkDecision({ kind: 'grant_as_asked' }, ask({ until: iso }), 'storekeeper', TODAY).ok)
      .toBe(true);

    const overBy1 = new Date(last.getTime() + 86400000).toISOString().slice(0, 10);
    const d = checkDecision({ kind: 'grant_as_asked' }, ask({ until: overBy1 }), 'storekeeper', TODAY);
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.field).toBe('limits');
      expect(d.message).toContain(String(MAX_GRANT_DAYS));
    }
  });

  //  "No end date" is a real choice on the dialog, for access somebody
  //  needs as part of their job rather than for one task.
  it('allows no end date at all', () => {
    expect(checkDecision({ kind: 'grant_as_asked' }, ask({ until: null }), 'storekeeper', TODAY).ok)
      .toBe(true);
  });

  //  The cap applies to whichever date will actually be written, so an
  //  admin cannot escape it by converting an open-ended request into a
  //  "limited" grant with a date years out.
  it('applies the cap to the admin\'s date, not only the asker\'s', () => {
    const d = checkDecision({
      kind: 'grant_with_limits', level: 'view',
      scope: 'Their own lots', until: day(2030, 1, 1), note: 'Long one.',
    }, ask({ until: null }), 'storekeeper', TODAY);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.field).toBe('limits');
  });
});

describe('the change log line', () => {
  it('distinguishes the three outcomes', () => {
    expect(describeDecision({ kind: 'grant_as_asked' })).toBe('Granted');
    expect(describeDecision({
      kind: 'grant_with_limits', level: 'view', scope: 's', until: null, note: 'n',
    })).toBe('Granted, narrowed');
    expect(describeDecision({ kind: 'decline', reason: 'r' })).toBe('Declined');
  });
});

describe('no decision is ever refused silently', () => {
  //  The counterpart of the products page's VERIFY line: a check that
  //  fails has to say which field is wrong and why, or the drawer has a
  //  dead button and no explanation.
  it('always names a field and a message when it refuses', () => {
    const decisions: Decision[] = [
      { kind: 'grant_as_asked' },
      { kind: 'decline', reason: '' },
      { kind: 'decline', reason: 'No.' },
      { kind: 'grant_with_limits', level: 'view', scope: 'x', until: null, note: '' },
      { kind: 'grant_with_limits', level: 'act', scope: 'x', until: day(2030, 1, 1), note: 'n' },
    ];
    for (const role of ALL_ROLES) {
      for (const section of ALL_SECTIONS) {
        for (const level of LEVELS) {
          for (const decision of decisions) {
            const where = `${role}/${section}/${level}/${decision.kind}`;
            const r = checkDecision(decision, ask({ section, level }), role, TODAY);
            if (!r.ok) {
              expect(r.field, where).toBeTruthy();
              expect(r.message.trim(), where).toBeTruthy();
            }
          }
        }
      }
    }
  });
});
