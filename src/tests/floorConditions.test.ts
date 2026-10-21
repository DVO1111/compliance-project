/**
 * Flagged versus blocked — W4·18.
 *
 * The design states the rule as a definition, and these hold the code
 * to it:
 *
 *   "flagged = amber, info icon, 'you can continue with…'; blocked =
 *    solid red, ✕, 'can't', no way past it on screen."
 *
 * The assertion that matters most is the one about a MALFORMED flagged
 * condition. A flagged row with no `continueWith` renders as "You can
 * continue with:" followed by nothing — a promise with a hole in it,
 * on a screen somebody is using with gloves on in a noisy room. It
 * degrades to blocked, because "you can't" is never dangerous and the
 * broken promise is.
 */
import { describe, it, expect } from 'vitest';
import {
  assess, isWellFormed, effectiveSeverity, actionLabel, emptyPickerMessage,
  type FloorCondition,
} from '../lib/floor/floorConditions';

const blocked = (over: Partial<FloorCondition> = {}): FloorCondition => ({
  key: 'b', severity: 'blocked',
  title: 'Line TL-2 is blocked',
  detail: 'A changeover verification failed.',
  continueWith: null, sortOrder: 10, ...over,
});

const flagged = (over: Partial<FloorCondition> = {}): FloorCondition => ({
  key: 'f', severity: 'flagged',
  title: 'Outside tolerance',
  detail: '26.0 kg weighed against 24.0 kg ± 2 %.',
  continueWith: 'A supervisor signing in here, with a reason.',
  sortOrder: 20, ...over,
});

describe('the shape of the rule', () => {
  //  THE ONE THAT MATTERS. Both halves: a flagged row must offer a way
  //  on, and a blocked row must not.
  it('requires a flagged condition to say what lets the work continue', () => {
    expect(isWellFormed(flagged())).toBe(true);
    expect(isWellFormed(flagged({ continueWith: null }))).toBe(false);
    expect(isWellFormed(flagged({ continueWith: '   ' }))).toBe(false);
  });

  it('requires a blocked condition to offer none', () => {
    expect(isWellFormed(blocked())).toBe(true);
    expect(isWellFormed(blocked({ continueWith: 'Ask anyone' }))).toBe(false);
  });

  //  The degradation direction is the safe one. A screen showing "you
  //  can't" where it could have shown "you can continue with…" costs
  //  somebody a phone call; the reverse costs a batch.
  it('renders a malformed flagged condition as blocked, never the reverse', () => {
    expect(effectiveSeverity(flagged({ continueWith: null }))).toBe('blocked');
    expect(effectiveSeverity(flagged())).toBe('flagged');
    expect(effectiveSeverity(blocked())).toBe('blocked');
    //  A malformed BLOCKED row also degrades to blocked: there is no
    //  path by which bad data makes something look passable.
    expect(effectiveSeverity(blocked({ continueWith: 'Ask anyone' }))).toBe('blocked');
  });
});

describe('assessing a set of conditions', () => {
  it('lets work proceed when nothing blocks', () => {
    const v = assess([]);
    expect(v.canProceed).toBe(true);
    expect(v.needsAuthorisation).toBe(false);
  });

  //  Flagged does not stop the work. That is the whole distinction,
  //  and getting it backwards would turn every out-of-tolerance weight
  //  into a halt.
  it('lets work proceed with an authorisation when only flagged', () => {
    const v = assess([flagged()]);
    expect(v.canProceed).toBe(true);
    expect(v.needsAuthorisation).toBe(true);
  });

  it('stops the work when anything blocks', () => {
    const v = assess([flagged(), blocked()]);
    expect(v.canProceed).toBe(false);
    expect(v.needsAuthorisation).toBe(false);
  });

  //  Amber above red would invite somebody to clear the amber and
  //  discover the red afterwards — the one-at-a-time failure this
  //  whole section is written against.
  it('puts blocked conditions first', () => {
    const v = assess([flagged({ key: 'f1' }), blocked({ key: 'b1' }), flagged({ key: 'f2' })]);
    expect(v.conditions.map((c) => c.key)).toEqual(['b1', 'f1', 'f2']);
  });

  it('keeps the database order within a severity', () => {
    const v = assess([
      flagged({ key: 'f2', sortOrder: 30 }),
      flagged({ key: 'f1', sortOrder: 10 }),
    ]);
    expect(v.flagged.map((c) => c.key)).toEqual(['f1', 'f2']);
  });

  it('keeps every condition, in exactly one group', () => {
    const input = [blocked({ key: 'b1' }), flagged({ key: 'f1' }), blocked({ key: 'b2' })];
    const v = assess(input);
    expect(v.blocked.length + v.flagged.length).toBe(input.length);
    expect(v.conditions).toHaveLength(input.length);
  });
});

describe('the button', () => {
  it('uses the design\'s word and names the count when blocked', () => {
    expect(actionLabel(assess([blocked()]), 'Record and sign'))
      .toBe("Can't continue · 1 thing to fix");
    expect(actionLabel(assess([blocked({ key: 'b1' }), blocked({ key: 'b2' })]), 'Record and sign'))
      .toBe("Can't continue · 2 things to fix");
  });

  //  Not "Record and sign" with a hidden extra step: the button says
  //  what pressing it will actually start.
  it('says an authorisation is coming when flagged', () => {
    expect(actionLabel(assess([flagged()]), 'Record and sign'))
      .toBe('Continue with authorisation');
  });

  it('offers the plain action when nothing is wrong', () => {
    expect(actionLabel(assess([]), 'Record and sign')).toBe('Record and sign');
  });
});

describe('the empty lot picker', () => {
  //  An empty picker with no words leaves an operator unable to tell a
  //  broken system from no approved stock, and those have different
  //  next steps.
  it('names the material and says which lots are absent', () => {
    const m = emptyPickerMessage('Paracetamol BP');
    expect(m).toContain('Paracetamol BP');
    expect(m).toMatch(/quarantined/i);
    expect(m).toMatch(/rejected/i);
    //  And where to look, so it is not a dead end.
    expect(m).toMatch(/material lots register/i);
  });
});
