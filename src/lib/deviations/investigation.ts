/**
 * The investigation, the root cause and the register — W5·11
 * (DV-04, DV-05, DV-05b, DV-07, DV-09, DV-10).
 *
 * TWO RULES SPAN THESE SCREENS.
 *
 * 1. ONE FRAMEWORK PER ANALYSIS. The design's check against the PRD is
 *    explicit: "Five whys and 5W1H no longer appear together."
 *    DV-05 draws a chain of whys, DV-05b draws six named questions,
 *    and an analysis is one or the other. The database enforces it in
 *    both directions; `framework` below is what the screen renders
 *    from, and `FRAMEWORKS` is the only place the two are described.
 *
 * 2. OVERDUE IS A FACT ABOUT TODAY, not a flag. `daysOverdue` arrives
 *    derived from the due date and the current date, and nothing here
 *    caches it. A register that says "overdue" about something due
 *    next week is a register people stop reading.
 *
 * AND ONE THING IS DEFENDED BY ABSENCE: nothing here decides whether a
 * deviation may be closed. `deviation_closure_readiness` reports, and
 * its CAPA condition is advisory because W5·11 decision 4 — whether a
 * CAPA or an explicit "not needed" is required — is still open. A
 * predicate here that refused closure would be this module answering a
 * question the lead has not.
 */

export type Framework = 'five_whys' | '5w1h';

export interface FrameworkSpec {
  key: Framework;
  label: string;
  /** What it asks of the person doing it, so a company choosing
   *  between them is choosing on something real. */
  description: string;
  /** The fixed questions, for 5W1H. Empty for five whys, whose
   *  questions are written as the chain goes. */
  prompts: Array<{ key: string; question: string; hint: string }>;
}

export const FRAMEWORKS: Record<Framework, FrameworkSpec> = {
  five_whys: {
    key: 'five_whys',
    label: 'Five whys',
    description: 'Ask why the previous answer happened, until the answer is something '
      + 'the system can change. Usually five steps; sometimes three, sometimes seven.',
    prompts: [],
  },
  '5w1h': {
    key: '5w1h',
    label: '5W1H',
    description: 'Six fixed questions. Better than five whys where the facts are '
      + 'scattered and nobody is yet sure what happened.',
    //  The database's own column order, so a screen cannot present
    //  them in one order and store them in another.
    prompts: [
      { key: 'what',  question: 'What happened?',
        hint: 'The observation, not the explanation.' },
      { key: 'why',   question: 'Why does it matter?',
        hint: 'What it affects — product, process, record.' },
      { key: 'where', question: 'Where did it happen?',
        hint: 'Line, room, stage, step.' },
      { key: 'when',  question: 'When did it happen?',
        hint: 'And when it was noticed, if those differ.' },
      { key: 'who',   question: 'Who was involved?',
        hint: 'Roles rather than blame.' },
      { key: 'how',   question: 'How did it happen?',
        hint: 'The sequence, as far as it is known.' },
    ],
  },
};

/** A step in a five-whys chain. The question is kept as well as the
 *  answer, because the chain is unreadable a month later with only the
 *  answers. */
export interface Why {
  seq: number;
  question: string;
  answer: string | null;
}

export interface RootCauseAnalysis {
  id: string;
  framework: Framework;
  whys: Why[];
  /** The six 5W1H answers, keyed as FRAMEWORKS['5w1h'].prompts are. */
  answers: Record<string, string | null>;
  determinedRootCause: string | null;
  rootCauseCategory: string | null;
  completedAt: string | null;
}

/**
 * Whether an analysis holds content belonging to a framework it is not
 * using.
 *
 * The database makes this impossible in both directions. This exists
 * for the screen, which receives whatever the transport gives it: a
 * cached payload from before a migration, a hand-rolled fixture, a
 * future endpoint that joins carelessly. Drawing a chain of whys under
 * a 5W1H heading would be the one failure that looks like a working
 * screen.
 */
export function hasForeignContent(a: RootCauseAnalysis): boolean {
  if (a.framework === 'five_whys') {
    return Object.values(a.answers).some((v) => (v ?? '').trim().length > 0);
  }
  return a.whys.length > 0;
}

/** The next question in a five-whys chain, phrased from the previous
 *  answer — which is what makes it a chain rather than five separate
 *  questions. */
export function nextWhyQuestion(whys: readonly Why[]): string {
  const answered = whys.filter((w) => (w.answer ?? '').trim().length > 0);
  if (answered.length === 0) return 'Why did this happen?';
  const last = answered[answered.length - 1].answer!.trim();
  //  Trimmed of its full stop so the question does not read "Why did
  //  The hopper was topped up.. happen?".
  const stem = last.replace(/[.!?]+$/, '');
  return `Why did that happen? — "${stem}"`;
}

/** How far along a five-whys chain is. Not a percentage of five: the
 *  design's own description says "usually five steps; sometimes three,
 *  sometimes seven", and a progress bar out of five would make a
 *  three-step answer look unfinished. */
export function whyProgress(whys: readonly Why[]): { answered: number; total: number } {
  return {
    answered: whys.filter((w) => (w.answer ?? '').trim().length > 0).length,
    total: whys.length,
  };
}

/** The same for 5W1H, where there IS a denominator: six fixed
 *  questions, and an unanswered one is a gap somebody can see. */
export function answerProgress(answers: Record<string, string | null>): {
  answered: number; total: number;
} {
  const prompts = FRAMEWORKS['5w1h'].prompts;
  return {
    answered: prompts.filter((p) => (answers[p.key] ?? '').trim().length > 0).length,
    total: prompts.length,
  };
}

/**
 * Whether the analysis can be completed.
 *
 * Mirrors `rca_complete_needs_both`: a conclusion without a category
 * is half an answer, and a category without a conclusion is a label
 * with nothing under it. The framework content is deliberately NOT
 * required — a root cause that became obvious at the second why is
 * still a root cause, and demanding five would teach people to pad.
 */
export function canComplete(a: RootCauseAnalysis): boolean {
  return (a.determinedRootCause ?? '').trim().length > 0
    && (a.rootCauseCategory ?? '').trim().length > 0;
}

export function completeButtonLabel(a: RootCauseAnalysis): string {
  if (a.completedAt) return 'Root cause recorded';
  const hasCause = (a.determinedRootCause ?? '').trim().length > 0;
  const hasCategory = (a.rootCauseCategory ?? '').trim().length > 0;
  if (!hasCause && !hasCategory) return 'Write the root cause to record it';
  if (!hasCause) return 'Write the root cause to record it';
  if (!hasCategory) return 'Choose a category to record it';
  return 'Record the root cause';
}

// ── the investigation view ───────────────────────────────────────────

export interface Investigation {
  deviationId: string;
  deviationNumber: string;
  title: string;
  severity: string;
  impact: string;
  stateKey: string;
  stateLabel: string;
  ownerName: string | null;
  dueDate: string | null;
  /** Derived server-side from the due date and today. Null when there
   *  is no due date, which is not the same as zero. */
  daysOverdue: number | null;
  isOverdue: boolean;
  immediateAction: string | null;
  containment: string | null;
}

/**
 * How the due date should read.
 *
 * Names the number of days either way, because "overdue" alone is a
 * state and "11 days overdue" is a fact somebody has to answer for.
 */
export function dueLabel(i: Pick<Investigation, 'dueDate' | 'daysOverdue' | 'isOverdue'>): string {
  if (!i.dueDate) return 'No due date set';
  if (i.daysOverdue === null) return `Due ${i.dueDate}`;
  if (i.daysOverdue > 0) {
    return `${i.daysOverdue} day${i.daysOverdue === 1 ? '' : 's'} overdue · was due ${i.dueDate}`;
  }
  const inDays = -i.daysOverdue;
  if (inDays === 0) return `Due today`;
  return `Due in ${inDays} day${inDays === 1 ? '' : 's'} · ${i.dueDate}`;
}

/**
 * Whether the investigation has an owner and a date at all.
 *
 * W5·11 decision 2 is open — "Who sets the investigation owner and due
 * date? The design has QA set them at triage, not the person raising."
 * So this REPORTS the gap rather than demanding either, and the screen
 * says who it is waiting on without claiming a rule nobody confirmed.
 */
export function triageGaps(i: Investigation): string[] {
  const gaps: string[] = [];
  if (!i.ownerName) gaps.push('no owner');
  if (!i.dueDate) gaps.push('no due date');
  return gaps;
}

export function triageMessage(i: Investigation): string | null {
  const gaps = triageGaps(i);
  if (gaps.length === 0) return null;
  return `This deviation has ${gaps.join(' and ')}. QA sets both at triage.`;
}

// ── the closure checklist ────────────────────────────────────────────

export interface ReadinessCondition {
  key: string;
  met: boolean;
  /** Whether failing this actually stops closure today. The CAPA
   *  condition is false while decision 4 is open — reported and
   *  counted, refusing nothing. */
  blocking: boolean;
  title: string;
  detail: string;
  sortOrder: number;
}

export interface Readiness {
  conditions: ReadinessCondition[];
  /** Conditions that are both unmet and enforced. */
  outstanding: ReadinessCondition[];
  /** Unmet but advisory — shown, counted, and not in the way. */
  advisory: ReadinessCondition[];
  canSign: boolean;
}

export function assessReadiness(conditions: readonly ReadinessCondition[]): Readiness {
  const sorted = [...conditions].sort((a, b) => a.sortOrder - b.sortOrder);
  const outstanding = sorted.filter((c) => !c.met && c.blocking);
  return {
    conditions: sorted,
    outstanding,
    advisory: sorted.filter((c) => !c.met && !c.blocking),
    canSign: outstanding.length === 0,
  };
}

/**
 * The words on the sign button.
 *
 * Counts only the conditions that actually stop it. An advisory one in
 * the count would make the button refuse something it will accept,
 * which is the slower half of the same lie as a button that accepts
 * what it will refuse.
 */
export function signButtonLabel(r: Readiness, isQa: boolean): string {
  //  "Only QA roles see the sign button" (DV-07). This label exists
  //  for the case where a screen renders it anyway; the component does
  //  not render it for a non-QA viewer at all.
  if (!isQa) return 'QA closes this deviation';
  if (r.canSign) return 'Sign and close';
  return r.outstanding.length === 1
    ? '1 thing outstanding'
    : `${r.outstanding.length} things outstanding`;
}

// ── the register ─────────────────────────────────────────────────────

export interface RegisterRow {
  id: string;
  deviationNumber: string;
  title: string;
  severity: string;
  impact: string;
  sourceType: string;
  sourceLabel: string | null;
  stateKey: string;
  stateLabel: string;
  dueDate: string | null;
  daysOverdue: number | null;
  isOverdue: boolean;
  raisedAt: string;
  linkedCapaCount: number;
}

/**
 * The register's own order, applied again on the client.
 *
 * The database orders it correctly; this re-sorts because a list whose
 * order depends on the transport is a list that will one day put the
 * thing three weeks late at the bottom. Overdue first, then gravest,
 * then oldest — severity BELOW overdue on purpose: a minor deviation
 * three weeks past its date says more about the system than a critical
 * one raised this morning.
 */
export function sortRegister(rows: readonly RegisterRow[]): RegisterRow[] {
  const sev = (s: string) => (s === 'critical' ? 0 : s === 'major' ? 1 : 2);
  return [...rows].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    if (sev(a.severity) !== sev(b.severity)) return sev(a.severity) - sev(b.severity);
    return a.raisedAt.localeCompare(b.raisedAt);
  });
}

export interface RegisterSummary {
  rows: RegisterRow[];
  total: number;
  overdue: number;
  blockingRelease: number;
}

export function summariseRegister(rows: readonly RegisterRow[]): RegisterSummary {
  const sorted = sortRegister(rows);
  return {
    rows: sorted,
    total: sorted.length,
    overdue: sorted.filter((r) => r.isOverdue).length,
    //  'undetermined' counted as blocking here would be this module
    //  deciding W5·11 decision 1. It counts what is unambiguous —
    //  impact 'yes' — and the deviation's own screen states the rest
    //  from the company's setting.
    blockingRelease: sorted.filter((r) => r.impact === 'yes').length,
  };
}

/**
 * What the empty register says (DV-10).
 *
 * An empty list with no words leaves somebody unable to tell a working
 * system with nothing in it from a broken filter — and those have very
 * different next steps.
 */
export function emptyRegisterMessage(includingClosed: boolean): string {
  return includingClosed
    ? 'No deviations have been raised yet. They appear here as soon as somebody raises one '
      + 'from a batch, a lot, an instrument or a QC result.'
    : 'No open deviations. Closed ones are hidden — turn them on to see the full history.';
}
