/**
 * Investigation, root cause and register — W5·11.
 *
 * THE RULE THAT SPANS DV-04, DV-05 AND DV-05b is the design's own
 * check against the PRD: "Root cause uses one framework per analysis,
 * configurable per company. Five whys and 5W1H no longer appear
 * together."
 *
 * The database enforces that in both directions — a CHECK keeps 5W1H
 * answers off a five-whys analysis, a trigger keeps whys off a 5W1H
 * one. `hasForeignContent` is the screen's own check, and it is not
 * redundant: a screen receives whatever the transport gives it, and
 * drawing a chain of whys under a 5W1H heading is the one failure that
 * looks like a working screen.
 *
 * AND ONE THING IS DEFENDED BY ABSENCE. Nothing here decides whether a
 * deviation may be closed. `assessReadiness` counts only the
 * conditions the database marks blocking, and the CAPA condition is
 * advisory while W5·11 decision 4 is open. A predicate here that
 * refused closure would be this module answering a question the lead
 * has not.
 */
import { describe, it, expect } from 'vitest';
import {
  FRAMEWORKS, hasForeignContent, nextWhyQuestion, whyProgress, answerProgress,
  canComplete, completeButtonLabel, dueLabel, triageGaps, triageMessage,
  assessReadiness, signButtonLabel, sortRegister, summariseRegister,
  emptyRegisterMessage,
  type RootCauseAnalysis, type ReadinessCondition, type RegisterRow,
  type Investigation,
} from '../lib/deviations/investigation';

const analysis = (over: Partial<RootCauseAnalysis> = {}): RootCauseAnalysis => ({
  id: 'a1', framework: 'five_whys', whys: [], answers: {},
  determinedRootCause: null, rootCauseCategory: null, completedAt: null,
  ...over,
});

describe('one framework per analysis', () => {
  it('describes both, and only in one place', () => {
    expect(FRAMEWORKS.five_whys.label).toBe('Five whys');
    expect(FRAMEWORKS['5w1h'].label).toBe('5W1H');
    expect(FRAMEWORKS.five_whys.description.length).toBeGreaterThan(30);
    expect(FRAMEWORKS['5w1h'].description.length).toBeGreaterThan(30);
  });

  //  Six fixed questions, in the database's own column order — so a
  //  screen cannot present them in one order and store them in
  //  another.
  it('gives 5W1H six prompts in the column order', () => {
    expect(FRAMEWORKS['5w1h'].prompts.map((p) => p.key))
      .toEqual(['what', 'why', 'where', 'when', 'who', 'how']);
  });

  //  Five whys has NO fixed prompts: its questions are written as the
  //  chain goes, from the previous answer.
  it('gives five whys none, because its questions are written as it goes', () => {
    expect(FRAMEWORKS.five_whys.prompts).toEqual([]);
  });

  //  ═══ THE ONE THAT MATTERS ═══
  it('notices content belonging to the other framework, both ways', () => {
    expect(hasForeignContent(analysis({
      framework: 'five_whys', answers: { what: 'Tablets ran heavy' },
    }))).toBe(true);

    expect(hasForeignContent(analysis({
      framework: '5w1h',
      whys: [{ seq: 1, question: 'Why?', answer: 'The hopper was topped up.' }],
    }))).toBe(true);
  });

  it('and does not cry wolf on a well-formed analysis of either kind', () => {
    expect(hasForeignContent(analysis({
      framework: 'five_whys',
      whys: [{ seq: 1, question: 'Why?', answer: 'The hopper was topped up.' }],
    }))).toBe(false);

    expect(hasForeignContent(analysis({
      framework: '5w1h', answers: { what: 'Tablets ran heavy', why: null },
    }))).toBe(false);
  });

  //  An empty 5W1H answer is not foreign content — it is a question
  //  nobody has reached yet.
  it('treats blank answers as unanswered, not as the wrong framework', () => {
    expect(hasForeignContent(analysis({
      framework: 'five_whys', answers: { what: '   ', why: null },
    }))).toBe(false);
  });
});

describe('the chain of whys', () => {
  //  What makes it a chain rather than five separate questions: each
  //  question quotes the previous answer.
  it('asks the next question from the previous answer', () => {
    expect(nextWhyQuestion([])).toBe('Why did this happen?');
    expect(nextWhyQuestion([
      { seq: 1, question: 'Why did this happen?', answer: 'The hopper was topped up.' },
    ])).toBe('Why did that happen? — "The hopper was topped up"');
  });

  //  Trimmed of its full stop, so the question does not read
  //  "…topped up.." — small, and the kind of thing that makes a screen
  //  look unfinished.
  it('does not double the punctuation', () => {
    expect(nextWhyQuestion([{ seq: 1, question: 'Why?', answer: 'It drifted!' }]))
      .not.toMatch(/!"/);
  });

  it('ignores an unanswered step when phrasing the next question', () => {
    expect(nextWhyQuestion([
      { seq: 1, question: 'Why?', answer: 'The hopper was topped up.' },
      { seq: 2, question: 'Why did that happen?', answer: '   ' },
    ])).toMatch(/hopper was topped up/);
  });

  //  NOT A PERCENTAGE OF FIVE. The framework's own description says
  //  "usually five steps; sometimes three, sometimes seven", and a
  //  progress bar out of five would make a three-step answer look
  //  unfinished — which is how people learn to pad.
  it('counts the steps that exist, not a fixed five', () => {
    const whys = [
      { seq: 1, question: 'Why?', answer: 'A' },
      { seq: 2, question: 'Why?', answer: 'B' },
      { seq: 3, question: 'Why?', answer: null },
    ];
    expect(whyProgress(whys)).toEqual({ answered: 2, total: 3 });
  });

  //  5W1H DOES have a denominator: six fixed questions, and an
  //  unanswered one is a gap somebody can see.
  it('counts 5W1H out of six', () => {
    expect(answerProgress({ what: 'x', why: 'y' })).toEqual({ answered: 2, total: 6 });
    expect(answerProgress({})).toEqual({ answered: 0, total: 6 });
  });
});

describe('recording the root cause', () => {
  //  Mirrors rca_complete_needs_both: a conclusion without a category
  //  is half an answer, a category without a conclusion is a label
  //  with nothing under it.
  it('needs both the conclusion and the category', () => {
    expect(canComplete(analysis({ determinedRootCause: 'Fill cam worn' }))).toBe(false);
    expect(canComplete(analysis({ rootCauseCategory: 'machine' }))).toBe(false);
    expect(canComplete(analysis({
      determinedRootCause: 'Fill cam worn', rootCauseCategory: 'machine',
    }))).toBe(true);
  });

  //  ...and NOT a full chain. A root cause that became obvious at the
  //  second why is still a root cause, and demanding five teaches
  //  people to pad.
  it('does not demand a full chain of whys', () => {
    expect(canComplete(analysis({
      whys: [{ seq: 1, question: 'Why?', answer: 'The cam is worn.' }],
      determinedRootCause: 'Fill cam worn', rootCauseCategory: 'machine',
    }))).toBe(true);
  });

  it('says which half is missing', () => {
    expect(completeButtonLabel(analysis())).toMatch(/write the root cause/i);
    expect(completeButtonLabel(analysis({ determinedRootCause: 'Fill cam worn' })))
      .toMatch(/choose a category/i);
    expect(completeButtonLabel(analysis({
      determinedRootCause: 'Fill cam worn', rootCauseCategory: 'machine',
    }))).toBe('Record the root cause');
  });

  it('and says so once it is recorded', () => {
    expect(completeButtonLabel(analysis({ completedAt: '2026-10-20' })))
      .toBe('Root cause recorded');
  });
});

describe('the due date', () => {
  const inv = (over: Partial<Investigation> = {}): Investigation => ({
    deviationId: 'd1', deviationNumber: 'DEV-00001', title: 'T',
    severity: 'major', impact: 'yes', stateKey: 'under_investigation',
    stateLabel: 'Under Investigation', ownerName: 'Ada Okafor',
    dueDate: '2026-10-09', daysOverdue: 11, isOverdue: true,
    immediateAction: null, containment: null, ...over,
  });

  //  "Overdue" alone is a state; "11 days overdue" is a fact somebody
  //  has to answer for.
  it('names the number of days overdue', () => {
    expect(dueLabel(inv())).toBe('11 days overdue · was due 2026-10-09');
    expect(dueLabel(inv({ daysOverdue: 1 }))).toMatch(/^1 day overdue/);
  });

  it('counts down when it is not yet due', () => {
    expect(dueLabel(inv({ daysOverdue: -3, isOverdue: false }))).toMatch(/Due in 3 days/);
    expect(dueLabel(inv({ daysOverdue: 0, isOverdue: false }))).toBe('Due today');
  });

  //  No due date is not "due today" and not "overdue" — it is a gap in
  //  triage, which is a different thing to chase.
  it('says plainly when no date was ever set', () => {
    expect(dueLabel(inv({ dueDate: null, daysOverdue: null, isOverdue: false })))
      .toBe('No due date set');
  });

  //  W5·11 decision 2 is open — who sets the owner and the date. So
  //  the gap is REPORTED, and the message says who it waits on without
  //  claiming a rule nobody confirmed.
  it('reports a missing owner or date rather than demanding either', () => {
    expect(triageGaps(inv())).toEqual([]);
    expect(triageGaps(inv({ ownerName: null }))).toEqual(['no owner']);
    expect(triageGaps(inv({ ownerName: null, dueDate: null })))
      .toEqual(['no owner', 'no due date']);
    expect(triageMessage(inv())).toBeNull();
    expect(triageMessage(inv({ ownerName: null }))).toMatch(/QA sets both at triage/);
  });
});

describe('the closure checklist', () => {
  const cond = (
    key: string, met: boolean, blocking: boolean, sortOrder: number,
  ): ReadinessCondition => ({
    key, met, blocking, title: key, detail: 'because', sortOrder,
  });

  const CONDITIONS = [
    cond('impact_assessed', true, true, 10),
    cond('root_cause_determined', false, true, 20),
    cond('capa_decided', false, false, 30),
    cond('awaiting_qa', true, true, 40),
  ];

  //  ═══ THE ONE THAT MATTERS ═══
  //  Decision 4 is open: whether a CAPA, or an explicit "not needed"
  //  with a reason, is required before closure. So the condition is
  //  shown and counted and refuses nothing — and if it is ever made
  //  blocking by accident, `canSign` changes and this notices.
  it('counts only the conditions that actually stop closure', () => {
    const r = assessReadiness(CONDITIONS);
    expect(r.outstanding.map((c) => c.key)).toEqual(['root_cause_determined']);
    expect(r.advisory.map((c) => c.key)).toEqual(['capa_decided']);
    expect(r.canSign).toBe(false);
  });

  it('lets QA sign once the blocking ones are met, advisory or not', () => {
    const r = assessReadiness(CONDITIONS.map((c) =>
      c.key === 'root_cause_determined' ? { ...c, met: true } : c));
    expect(r.canSign).toBe(true);
    //  The CAPA condition is still unmet and still shown.
    expect(r.advisory).toHaveLength(1);
  });

  it('keeps every condition, in the database\'s order', () => {
    const r = assessReadiness([...CONDITIONS].reverse());
    expect(r.conditions.map((c) => c.key))
      .toEqual(['impact_assessed', 'root_cause_determined', 'capa_decided', 'awaiting_qa']);
    expect(r.conditions).toHaveLength(CONDITIONS.length);
  });

  //  An advisory condition in the count would make the button refuse
  //  something it will accept — the slower half of the same lie as a
  //  button that accepts what it will refuse.
  it('counts only blocking conditions on the button', () => {
    expect(signButtonLabel(assessReadiness(CONDITIONS), true)).toBe('1 thing outstanding');
    expect(signButtonLabel(assessReadiness(CONDITIONS.map((c) =>
      c.key === 'root_cause_determined' ? { ...c, met: true } : c)), true))
      .toBe('Sign and close');
  });

  //  "Only QA roles see the sign button" — the component does not
  //  render it at all for anybody else; the label covers the case
  //  where a screen renders it anyway.
  it('says whose job closure is, for a viewer who is not QA', () => {
    expect(signButtonLabel(assessReadiness(CONDITIONS), false))
      .toBe('QA closes this deviation');
  });
});

describe('the register', () => {
  const row = (over: Partial<RegisterRow> = {}): RegisterRow => ({
    id: 'r', deviationNumber: 'DEV-00001', title: 'T', severity: 'minor',
    impact: 'no', sourceType: 'batch', sourceLabel: 'PCM-2610-014',
    stateKey: 'under_investigation', stateLabel: 'Under Investigation',
    dueDate: null, daysOverdue: null, isOverdue: false,
    raisedAt: '2026-10-20T08:00:00Z', linkedCapaCount: 0, ...over,
  });

  //  ═══ THE ONE THAT MATTERS ═══
  //  Overdue first, and severity BELOW it. A minor deviation three
  //  weeks past its date says more about the system than a critical
  //  one raised this morning, and the register is read to find what
  //  has been forgotten.
  it('sorts overdue above severity', () => {
    const sorted = sortRegister([
      row({ id: 'fresh-critical', severity: 'critical' }),
      row({ id: 'late-minor', severity: 'minor', isOverdue: true, daysOverdue: 21 }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['late-minor', 'fresh-critical']);
  });

  it('then by severity, then by age', () => {
    const sorted = sortRegister([
      row({ id: 'minor-old', severity: 'minor', raisedAt: '2026-01-01T00:00:00Z' }),
      row({ id: 'major', severity: 'major' }),
      row({ id: 'critical', severity: 'critical' }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['critical', 'major', 'minor-old']);
  });

  it('puts the oldest first within one severity', () => {
    const sorted = sortRegister([
      row({ id: 'new', severity: 'major', raisedAt: '2026-10-20T00:00:00Z' }),
      row({ id: 'old', severity: 'major', raisedAt: '2026-09-01T00:00:00Z' }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['old', 'new']);
  });

  it('counts what is overdue and what blocks release', () => {
    const s = summariseRegister([
      row({ id: '1', impact: 'yes' }),
      row({ id: '2', impact: 'no', isOverdue: true, daysOverdue: 4 }),
      row({ id: '3', impact: 'undetermined' }),
    ]);
    expect(s.total).toBe(3);
    expect(s.overdue).toBe(1);
    //  'undetermined' is NOT counted as blocking here: whether it
    //  blocks is W5·11 decision 1, held as a company setting, and this
    //  summary counts only what is unambiguous.
    expect(s.blockingRelease).toBe(1);
  });

  //  DV-10. An empty list with no words leaves somebody unable to tell
  //  a working system with nothing in it from a broken filter, and
  //  those have very different next steps.
  it('says which kind of empty it is', () => {
    expect(emptyRegisterMessage(false)).toMatch(/closed ones are hidden/i);
    expect(emptyRegisterMessage(true)).toMatch(/no deviations have been raised/i);
    //  …and the first one says where they come from, so it is not a
    //  dead end.
    expect(emptyRegisterMessage(true)).toMatch(/batch, a lot, an instrument or a QC result/);
  });
});
