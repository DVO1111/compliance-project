/**
 * What stops a material lot being released — W4·15 (MT-03, MT-06, MT-07).
 *
 * The design's NOT DONE IF is the specification this module exists to
 * satisfy:
 *
 *   "Blocking conditions only after clicking: no. They lead the release
 *    screen and the lot detail."
 *
 * THE SHAPE IS THE ARGUMENT. A screen that can render "blocked" without
 * also having every condition to render beside it will, sooner or
 * later, render one blocker at a time: clear it, discover the next,
 * clear that, discover the third. That is the exact failure the design
 * rules out, and it is a shape problem rather than a diligence problem
 * — so `Readiness` carries the whole list, counted, and has no field
 * that means "the reason".
 *
 * NOTHING HERE DECIDES ANYTHING. The conditions are computed by
 * material_lot_release_conditions in the database, which is also where
 * material_lot_release_block_reason reads them from, so the screen and
 * the gate cannot disagree. This module shapes and counts what comes
 * back; it does not re-derive it. A browser's opinion about whether a
 * lot may be released is not a control.
 */

/** The seven the design draws. Open, because the database owns the list. */
export type ConditionKey =
  | 'certificate_verified' | 'tests_complete' | 'tests_passed'
  | 'sampling_recorded' | 'supplier_approved' | 'within_dating'
  | 'qa_release_role'
  | (string & {});

export interface ReleaseCondition {
  key: ConditionKey;
  met: boolean;
  /**
   * Whether failing it actually stops release today.
   *
   * Three of the seven are readiness rather than gate — sampling,
   * dating and supplier approval — and the distinction is load-bearing:
   * the header counts "2 BLOCKING · 5 MET" and the Sign and release
   * button is disabled by the blocking ones alone. Showing a readiness
   * gap as a blocker would make a releasable lot look un-releasable.
   */
  blocking: boolean;
  title: string;
  detail: string;
  /** "WAITING ON QC · S. BAKARE". Null once met. */
  waitingOn: string | null;
  sortOrder: number;
}

export interface Readiness {
  conditions: ReleaseCondition[];
  /** Unmet AND blocking. What the header and the button count. */
  blocking: ReleaseCondition[];
  met: ReleaseCondition[];
  /** Unmet but not blocking — shown, not counted against release. */
  outstanding: ReleaseCondition[];
  canRelease: boolean;
}

/**
 * Sorts and counts what the database returned.
 *
 * Blocking first and in the database's own order, because the order
 * encodes the sequence somebody works through: certificate, then
 * tests, then everything else. Re-sorting by severity here would put
 * the hardest thing first, which reads as a wall rather than a queue.
 */
export function summarise(conditions: ReleaseCondition[]): Readiness {
  const sorted = [...conditions].sort((a, b) => a.sortOrder - b.sortOrder);
  const blocking = sorted.filter((c) => c.blocking && !c.met);
  const met = sorted.filter((c) => c.met);
  const outstanding = sorted.filter((c) => !c.blocking && !c.met);

  return {
    conditions: sorted,
    blocking,
    met,
    outstanding,
    canRelease: blocking.length === 0,
  };
}

/** "2 BLOCKING · 5 MET", the header line on MT-06. */
export function readinessHeadline(r: Readiness): string {
  return r.canRelease
    ? `ALL ${r.met.length} CONDITIONS MET`
    : `${r.blocking.length} BLOCKING · ${r.met.length} MET`;
}

/**
 * The words on the primary button.
 *
 * "Disabled button names the count" — a disabled control that says
 * only "Sign and release" leaves somebody clicking it to find out why
 * nothing happened, which is the same failure as hiding the conditions
 * and arrives at it one click later.
 */
export function releaseButtonLabel(r: Readiness): string {
  if (r.canRelease) return 'Sign and release';
  return r.blocking.length === 1
    ? 'Blocked by 1 condition'
    : `Blocked by ${r.blocking.length} conditions`;
}

/**
 * The sentence under the title on a blocked lot.
 *
 * Addressed to the person reading it, and explicit that the list is
 * complete — the design's own words, because "everything that stops
 * release is listed here before you try" is a promise the screen makes
 * and this module's shape keeps.
 */
export function readinessSummary(r: Readiness): { title: string; detail: string } {
  if (r.canRelease) {
    return {
      title: 'Ready to release',
      detail: 'Every condition is met. Release is signed, and the signature is what records it.',
    };
  }
  return {
    title: 'Not ready to release',
    detail: `Everything that stops release is listed here before you try. `
      + `Sign and release turns on when ${r.blocking.length === 1 ? 'it is' : 'all are'} cleared.`,
  };
}

/**
 * Where a blocking condition is cleared.
 *
 * MT-06 puts a button on each blocker — "View tests", "Review
 * certificate" — and the one the reader can act on themselves is the
 * ink button while the rest are outline. Which is which comes from
 * waiting_on: a condition waiting on you is yours to clear.
 */
export interface ConditionAction {
  label: string;
  /** The ink (dark) button, for the one thing the reader can do now. */
  primary: boolean;
  /** Which screen it goes to; the caller routes. */
  target: 'tests' | 'certificate' | 'sampling' | 'supplier' | 'lot';
}

export function actionFor(condition: ReleaseCondition): ConditionAction | null {
  if (condition.met) return null;
  const mine = (condition.waitingOn ?? '').toUpperCase().includes('YOU');

  switch (condition.key) {
    case 'certificate_verified':
      return { label: 'Review certificate', primary: mine, target: 'certificate' };
    case 'tests_complete':
    case 'tests_passed':
      return { label: 'View tests', primary: mine, target: 'tests' };
    case 'sampling_recorded':
      return { label: 'Record sampling', primary: mine, target: 'sampling' };
    case 'supplier_approved':
      return { label: 'Open supplier', primary: false, target: 'supplier' };
    //  Dating and the QA role have nowhere useful to send somebody:
    //  an expired lot is not fixed on a screen, and a person without
    //  the release role cannot grant it to themselves. A button that
    //  goes nowhere is worse than none.
    default:
      return null;
  }
}
