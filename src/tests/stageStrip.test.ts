/**
 * The stage strip and the workstation rules — W4·17.
 *
 * Two of the design's "not done if" clauses are what these assert, and
 * both describe a bug a screen commits by default:
 *
 *   "Locked stage greyed with no explanation: no. Every locked stage
 *    says what it waits for."
 *   "Complete and sign stays disabled with the reason given."
 *
 * The third group is checkReading, which is the one with a subtle
 * failure: a field that validates as you type will call "1" invalid
 * while somebody is on their way to typing "12.5", and shout at a
 * person doing nothing wrong.
 */
import { describe, it, expect } from 'vitest';
import {
  TOUCH, waitingReason, isOpen, progress, signOffState,
  completeButtonLabel, checkReading,
  type StripStage, type CompletionBlocker,
} from '../lib/batch/stageStrip';

const stage = (over: Partial<StripStage> & { sequenceNo: number }): StripStage => ({
  stageId: `s${over.sequenceNo}`,
  name: `Stage ${over.sequenceNo}`,
  status: 'pending',
  state: 'locked',
  waitingFor: 'Waiting for stage 1, Dispensing, which is pending.',
  requiresVerifier: false,
  signedByOperator: false,
  signedByVerifier: false,
  readingsTotal: 0, readingsRecorded: 0, readingsOutOfSpec: 0,
  ...over,
});

const STRIP: StripStage[] = [
  stage({ sequenceNo: 1, state: 'done', status: 'complete', waitingFor: null,
          signedByOperator: true, readingsTotal: 3, readingsRecorded: 3 }),
  stage({ sequenceNo: 2, state: 'current', status: 'in_progress', waitingFor: null,
          requiresVerifier: true, readingsTotal: 4, readingsRecorded: 1 }),
  stage({ sequenceNo: 3, state: 'locked', status: 'pending',
          waitingFor: 'Waiting for stage 2, Mixing, which is in progress.' }),
];

describe('what a stage is waiting for', () => {
  //  THE ONE THE DESIGN RULES OUT.
  it('gives every locked stage a sentence', () => {
    for (const s of STRIP) {
      if (s.state === 'locked' || s.state === 'closed') {
        expect(waitingReason(s), s.name).toBeTruthy();
      }
    }
  });

  it('gives an open or finished stage none', () => {
    expect(waitingReason(STRIP[0])).toBeNull();
    expect(waitingReason(STRIP[1])).toBeNull();
  });

  //  A generic "not available yet" would satisfy the letter of the
  //  rule and defeat it. If the database ever returns a locked stage
  //  with no sentence, that should be visible rather than papered over.
  it('does not invent a placeholder when the reason is missing', () => {
    expect(waitingReason(stage({ sequenceNo: 9, state: 'locked', waitingFor: null }))).toBeNull();
  });

  it('names the stage being waited for', () => {
    expect(waitingReason(STRIP[2])).toContain('stage 2');
  });

  it('treats only the current stage as workable', () => {
    expect(STRIP.filter(isOpen).map((s) => s.sequenceNo)).toEqual([2]);
  });
});

describe('progress', () => {
  it('counts completed stages', () => {
    expect(progress(STRIP)).toEqual({ done: 1, total: 3, label: '1 of 3 stages complete' });
  });

  //  Counted from DONE stages, not from the current one's index: a
  //  reopened stage puts the current one behind completed ones, and
  //  "stage 2 of 9" on a batch with five done stages understates it.
  it('is not the current stage\'s index', () => {
    const reopened = [
      stage({ sequenceNo: 1, state: 'current', status: 'in_progress', waitingFor: null }),
      stage({ sequenceNo: 2, state: 'done', status: 'complete', waitingFor: null }),
      stage({ sequenceNo: 3, state: 'done', status: 'complete', waitingFor: null }),
    ];
    expect(progress(reopened).done).toBe(2);
  });
});

describe('the two signatures', () => {
  it('reports none, one, or both', () => {
    const s = (o: boolean, v: boolean) =>
      signOffState(stage({ sequenceNo: 1, requiresVerifier: true,
                           signedByOperator: o, signedByVerifier: v }));
    expect(s(false, false)).toBe('none');
    expect(s(true, false)).toBe('operator');
    expect(s(true, true)).toBe('both');
  });

  it('says so when no second signature is required', () => {
    expect(signOffState(stage({ sequenceNo: 1, requiresVerifier: false }))).toBe('not_required');
  });
});

describe('the Complete and sign button', () => {
  const b = (n: number): CompletionBlocker[] =>
    Array.from({ length: n }, (_, i) => ({
      key: `k${i}`, title: `t${i}`, detail: `d${i}`, sortOrder: i,
    }));

  //  A disabled button saying only "Complete and sign" leaves somebody
  //  pressing it to find out why — the same failure as hiding the
  //  reason, one press later.
  it('names the count while blocked', () => {
    expect(completeButtonLabel(b(3))).toBe('Blocked by 3 things');
    expect(completeButtonLabel(b(1))).toBe('Blocked by 1 thing');
  });

  it('offers the signature when nothing blocks', () => {
    expect(completeButtonLabel([])).toBe('Complete and sign');
  });
});

describe('checking a reading as it is typed', () => {
  it('passes a value inside its limits', () => {
    expect(checkReading('550', 530, 570)).toBe('in_range');
  });

  it('flags one outside', () => {
    expect(checkReading('580', 530, 570)).toBe('out_of_range');
    expect(checkReading('500', 530, 570)).toBe('out_of_range');
  });

  it('counts the limits themselves as inside', () => {
    expect(checkReading('530', 530, 570)).toBe('in_range');
    expect(checkReading('570', 530, 570)).toBe('in_range');
  });

  //  THE SUBTLE ONE. Somebody typing "12.5" types "1" first. A field
  //  that went red at "1" would shout at a person doing nothing wrong,
  //  and they would learn to ignore it — including when it matters.
  it('does not flag a number on its way to being typed', () => {
    expect(checkReading('', 530, 570)).toBe('empty');
    expect(checkReading('  ', 530, 570)).toBe('empty');
    //  "55" IS out of range against 530-570 and should say so — the
    //  rule is that an empty or unparseable field is not a failure,
    //  not that partial numbers are exempt.
    expect(checkReading('55', 530, 570)).toBe('out_of_range');
    //  A trailing separator is mid-typing and parses to a number.
    expect(checkReading('550.', 530, 570)).toBe('in_range');
  });

  it('calls something that is not a number unparseable, not out of range', () => {
    expect(checkReading('abc', 530, 570)).toBe('unparseable');
    expect(checkReading('-', 530, 570)).toBe('unparseable');
  });

  //  A one-sided limit is a real specification: "not more than 50 ppm"
  //  has no lower bound and must still be checked.
  it('handles a one-sided limit', () => {
    expect(checkReading('40', null, 50)).toBe('in_range');
    expect(checkReading('60', null, 50)).toBe('out_of_range');
    expect(checkReading('10', 5, null)).toBe('in_range');
    expect(checkReading('1', 5, null)).toBe('out_of_range');
  });

  it('says when there are no limits at all rather than passing silently', () => {
    expect(checkReading('anything-numeric-free', null, null)).toBe('unparseable');
    expect(checkReading('42', null, null)).toBe('no_limits');
  });
});

describe('touch targets', () => {
  //  The design is drawn for gloved hands at a workstation: "56 px
  //  buttons, 64 px fields and keys, 8–12 px gaps". These are its own
  //  assumption pending the floor-use rules, and a later edit that
  //  shrank them would be invisible on a desk and wrong on a line.
  it('keeps the workstation minimums', () => {
    expect(TOUCH.target).toBeGreaterThanOrEqual(56);
    expect(TOUCH.field).toBeGreaterThanOrEqual(64);
    expect(TOUCH.gap).toBeGreaterThanOrEqual(8);
  });

  it('makes a reading field at least as big as a button', () => {
    expect(TOUCH.field).toBeGreaterThanOrEqual(TOUCH.target);
  });
});
