/**
 * Release readiness — W4·15.
 *
 * The design's NOT DONE IF is the specification:
 *
 *   "Blocking conditions only after clicking: no. They lead the
 *    release screen and the lot detail."
 *
 * So the assertions that matter are about the SHAPE rather than the
 * arithmetic: that a summary always carries every condition, that the
 * count the button names matches the list the card shows, and that
 * readiness gaps are never counted as blockers. A `Readiness` that got
 * any of those wrong would let a screen tell somebody they may release
 * a lot the database will refuse, or the reverse.
 */
import { describe, it, expect } from 'vitest';
import {
  summarise, readinessHeadline, releaseButtonLabel, readinessSummary, actionFor,
  type ReleaseCondition,
} from '../lib/materials/releaseReadiness';

const c = (over: Partial<ReleaseCondition> & { key: string }): ReleaseCondition => ({
  met: true, blocking: true, title: over.key, detail: 'detail',
  waitingOn: null, sortOrder: 10, ...over,
});

/** The seven MT-06 draws, in the database's order. */
const SEVEN: ReleaseCondition[] = [
  c({ key: 'certificate_verified', met: false, blocking: true, sortOrder: 10,
      title: 'Supplier certificate not verified', waitingOn: 'WAITING ON YOU' }),
  c({ key: 'tests_complete', met: false, blocking: true, sortOrder: 20,
      title: '1 test incomplete', waitingOn: 'WAITING ON QC · S. BAKARE' }),
  c({ key: 'tests_passed', met: true, blocking: true, sortOrder: 30,
      title: '6 of 7 tests passed' }),
  c({ key: 'sampling_recorded', met: true, blocking: false, sortOrder: 40,
      title: 'Sampling recorded' }),
  c({ key: 'supplier_approved', met: true, blocking: false, sortOrder: 50,
      title: 'Supplier approved' }),
  c({ key: 'within_dating', met: true, blocking: false, sortOrder: 60,
      title: 'Within expiry and retest' }),
  c({ key: 'qa_release_role', met: true, blocking: true, sortOrder: 70,
      title: 'You hold the QA release role' }),
];

describe('summarising what stops release', () => {
  //  THE ONE THAT MATTERS. If a summary ever dropped a condition, the
  //  card would show a shorter list than the gate enforces and
  //  somebody would clear one blocker to discover the next — the exact
  //  bug the design rules out.
  it('keeps every condition, met or not', () => {
    const r = summarise(SEVEN);
    expect(r.conditions).toHaveLength(SEVEN.length);
    expect(new Set(r.conditions.map((x) => x.key)))
      .toEqual(new Set(SEVEN.map((x) => x.key)));
  });

  it('puts every condition in exactly one group', () => {
    const r = summarise(SEVEN);
    expect(r.blocking.length + r.met.length + r.outstanding.length).toBe(SEVEN.length);
    const keys = [...r.blocking, ...r.met, ...r.outstanding].map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  //  The design's own example: "2 BLOCKING · 5 MET".
  it('counts the design\'s worked example', () => {
    const r = summarise(SEVEN);
    expect(r.blocking.map((x) => x.key)).toEqual(['certificate_verified', 'tests_complete']);
    expect(r.met).toHaveLength(5);
    expect(readinessHeadline(r)).toBe('2 BLOCKING · 5 MET');
    expect(r.canRelease).toBe(false);
  });

  //  Sorted by the database's order, not re-sorted by severity here.
  //  The order encodes the sequence somebody works through.
  it('keeps the database\'s order', () => {
    const shuffled = [...SEVEN].reverse();
    expect(summarise(shuffled).conditions.map((x) => x.sortOrder))
      .toEqual([10, 20, 30, 40, 50, 60, 70]);
  });

  it('is releasable only when nothing blocking is unmet', () => {
    const all = SEVEN.map((x) => ({ ...x, met: true }));
    const r = summarise(all);
    expect(r.canRelease).toBe(true);
    expect(r.blocking).toHaveLength(0);
    expect(readinessHeadline(r)).toBe('ALL 7 CONDITIONS MET');
  });

  //  Three of the seven are readiness, not gate. Counting a missing
  //  sampling record against release would make a releasable lot look
  //  un-releasable, and the card's credibility rests on the count.
  it('never counts a readiness gap as a blocker', () => {
    const noSampling = SEVEN.map((x) =>
      x.key === 'sampling_recorded' ? { ...x, met: false } : { ...x, met: true });
    const r = summarise(noSampling);
    expect(r.canRelease).toBe(true);
    expect(r.blocking).toHaveLength(0);
    expect(r.outstanding.map((x) => x.key)).toEqual(['sampling_recorded']);
  });

  it('shows an outstanding condition without hiding it', () => {
    const noSampling = SEVEN.map((x) =>
      x.key === 'sampling_recorded' ? { ...x, met: false } : { ...x, met: true });
    const r = summarise(noSampling);
    expect(r.conditions.find((x) => x.key === 'sampling_recorded')).toBeTruthy();
  });

  it('handles a lot with no conditions at all without claiming it is ready', () => {
    const r = summarise([]);
    //  Nothing blocking, so nothing stops release — but the headline
    //  must not read as an endorsement of seven passed checks.
    expect(r.canRelease).toBe(true);
    expect(readinessHeadline(r)).toBe('ALL 0 CONDITIONS MET');
  });
});

describe('the button', () => {
  //  "Disabled button names the count." A disabled control saying only
  //  "Sign and release" leaves somebody clicking to find out why —
  //  the same failure as hiding the conditions, one click later.
  it('names the count while blocked', () => {
    expect(releaseButtonLabel(summarise(SEVEN))).toBe('Blocked by 2 conditions');
  });

  it('says one condition in the singular', () => {
    const one = SEVEN.map((x) =>
      x.key === 'certificate_verified' ? { ...x, met: true } : x);
    expect(releaseButtonLabel(summarise(one))).toBe('Blocked by 1 condition');
  });

  it('offers the signature once nothing blocks', () => {
    expect(releaseButtonLabel(summarise(SEVEN.map((x) => ({ ...x, met: true })))))
      .toBe('Sign and release');
  });

  //  The button's count and the card's list come from one summary, so
  //  they cannot disagree. This is what checks that they are read from
  //  the same place rather than computed twice.
  it('names exactly as many conditions as the card lists', () => {
    for (const unmet of [0, 1, 2, 3]) {
      const conditions = SEVEN.map((x, i) => ({ ...x, met: i >= unmet, blocking: true }));
      const r = summarise(conditions);
      const label = releaseButtonLabel(r);
      if (r.canRelease) { expect(label).toBe('Sign and release'); continue; }
      expect(label).toContain(String(r.blocking.length));
    }
  });
});

describe('the summary sentence', () => {
  it('promises the list is complete while blocked', () => {
    const s = readinessSummary(summarise(SEVEN));
    expect(s.title).toBe('Not ready to release');
    expect(s.detail).toMatch(/listed here before you try/i);
  });

  it('reads as an endorsement only when nothing blocks', () => {
    const s = readinessSummary(summarise(SEVEN.map((x) => ({ ...x, met: true }))));
    expect(s.title).toBe('Ready to release');
    expect(s.detail).toMatch(/signature/i);
  });
});

describe('where a blocker is cleared', () => {
  it('offers nothing on a met condition', () => {
    expect(actionFor(c({ key: 'certificate_verified', met: true }))).toBeNull();
  });

  //  The ink button marks the one thing the reader can clear
  //  themselves. "WAITING ON YOU" is what decides it.
  it('makes the reader\'s own blocker the primary action', () => {
    const mine = actionFor(c({
      key: 'certificate_verified', met: false, waitingOn: 'WAITING ON YOU',
    }));
    expect(mine).toEqual({ label: 'Review certificate', primary: true, target: 'certificate' });

    const theirs = actionFor(c({
      key: 'tests_complete', met: false, waitingOn: 'WAITING ON QC · S. BAKARE',
    }));
    expect(theirs?.primary).toBe(false);
  });

  //  A button that goes nowhere is worse than none: an expired lot is
  //  not fixed on a screen, and nobody grants themselves the release
  //  role.
  it('offers no action where there is nothing to do', () => {
    expect(actionFor(c({ key: 'within_dating', met: false }))).toBeNull();
    expect(actionFor(c({ key: 'qa_release_role', met: false }))).toBeNull();
  });

  it('gives every actionable blocker a label and a target', () => {
    for (const key of ['certificate_verified', 'tests_complete', 'tests_passed',
      'sampling_recorded', 'supplier_approved']) {
      const a = actionFor(c({ key, met: false }));
      expect(a?.label, key).toBeTruthy();
      expect(a?.target, key).toBeTruthy();
    }
  });

  //  An unknown key from a future migration must not crash a screen.
  it('ignores a condition it has never heard of', () => {
    expect(actionFor(c({ key: 'something_new', met: false }))).toBeNull();
  });
});
