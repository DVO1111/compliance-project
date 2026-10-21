/**
 * Raising a deviation — W5·11.
 *
 * THE ONE DEFECT THESE EXIST TO PREVENT is a preselected impact.
 * "Impact preselected: no. All three options start empty, a blank
 * impact is an error" is the design's NOT DONE IF, and the reason is
 * worth keeping next to the assertions: a form that arrives with an
 * answer already chosen collects the opinion of whoever wrote the
 * form, several thousand times, under the name of whoever pressed
 * Raise.
 *
 * The second thing defended is the distinction the design states in
 * four words — "Undetermined is fine; blank isn't". They are not
 * degrees of the same thing. Undetermined is an assessment somebody
 * made and can be held to: it blocks release until somebody finds
 * out, and it is a row in the register with a name on it. Blank is the
 * absence of one, and it cannot be chased because nobody can tell it
 * from a form somebody was halfway through.
 */
import { describe, it, expect } from 'vitest';
import {
  emptyDraft, checkDraft, canRaise, raiseButtonLabel,
  optionsAreWellFormed, sortOptions, chosenConsequence, consequenceTone,
  contextIsComplete, raiseHeading, SEVERITIES, IMPACTS,
  SEVERITY_LABEL, SEVERITY_MEANING,
  type DeviationDraft, type ImpactOption,
} from '../lib/deviations/raise';

const full = (over: Partial<DeviationDraft> = {}): DeviationDraft => ({
  ...emptyDraft('batch', 'b1'),
  title: 'Tablet mass above the action limit on check #14',
  severity: 'major',
  impact: 'yes',
  ...over,
});

const OPTIONS: ImpactOption[] = [
  { impact: 'yes', label: 'Yes — product quality is affected', effect: 'blocks',
    consequence: 'This will block release of batch PCM-2610-014 until the deviation is closed.',
    sortOrder: 1 },
  { impact: 'no', label: 'No — product quality is not affected', effect: 'warns',
    consequence: 'Release of batch PCM-2610-014 will carry a warning, not a block.',
    sortOrder: 2 },
  { impact: 'undetermined', label: 'Undetermined — not yet assessed', effect: 'blocks',
    consequence: 'This will block release of batch PCM-2610-014 until somebody assesses the '
      + 'impact. Undetermined is a real answer; blank is not.',
    sortOrder: 3 },
];

describe('nothing is chosen for you', () => {
  //  ═══ THE ONE THAT MATTERS ═══
  it('starts with no severity and no impact', () => {
    const d = emptyDraft('batch', 'b1');
    expect(d.severity).toBeNull();
    expect(d.impact).toBeNull();
  });

  //  The context DOES arrive filled in, which is the other half of the
  //  same rule: the decisions are the person's and the facts are the
  //  record's.
  it('but arrives knowing what it is being raised against', () => {
    const d = emptyDraft('material_lot', 'lot-7');
    expect(d.sourceType).toBe('material_lot');
    expect(d.sourceId).toBe('lot-7');
  });

  it('refuses a blank impact, by name', () => {
    const problems = checkDraft(full({ impact: null }));
    expect(problems.map((p) => p.field)).toContain('impact');
    expect(canRaise(full({ impact: null }))).toBe(false);
  });

  //  "Undetermined is fine; blank isn't" — and the message says so,
  //  because somebody who genuinely does not know needs telling that
  //  saying so is allowed.
  it('tells the person that undetermined is a real answer', () => {
    const p = checkDraft(full({ impact: null })).find((x) => x.field === 'impact')!;
    expect(p.message).toMatch(/undetermined is a real answer/i);
    expect(p.message).toMatch(/blank is not/i);
  });

  it('accepts undetermined as a choice', () => {
    expect(canRaise(full({ impact: 'undetermined' }))).toBe(true);
  });

  //  title is NOT NULL in the database (3B.1), and whitespace is not a
  //  title.
  it('refuses a blank or whitespace title', () => {
    expect(canRaise(full({ title: '' }))).toBe(false);
    expect(canRaise(full({ title: '   ' }))).toBe(false);
  });

  //  A raise flow whose record failed to load would otherwise raise a
  //  deviation against nothing.
  it('refuses a row source with no row', () => {
    expect(canRaise(full({ sourceType: 'batch', sourceId: null }))).toBe(false);
  });

  //  …but process and facility name a thing rather than a row, which
  //  is why the column permits a null source id for exactly those two.
  it('allows process and facility to have no row behind them', () => {
    expect(canRaise(full({ sourceType: 'process', sourceId: null }))).toBe(true);
    expect(canRaise(full({ sourceType: 'facility', sourceId: null }))).toBe(true);
  });

  //  Every problem at once. A form that reveals one missing field at a
  //  time is a form somebody presses Raise on four times, and on a
  //  tablet at a press that is four trips back up the sheet.
  it('reports every problem at once, not the first', () => {
    const problems = checkDraft(emptyDraft('batch', 'b1'));
    expect(problems.map((p) => p.field).sort())
      .toEqual(['impact', 'severity', 'title']);
  });
});

describe('the raise button', () => {
  it('offers the plain action when everything is chosen', () => {
    expect(raiseButtonLabel(full())).toBe('Raise deviation');
  });

  //  "Raise unavailable with the reason shown" — it says what is
  //  missing rather than going dim and leaving somebody to hunt.
  it('names the single missing thing', () => {
    expect(raiseButtonLabel(full({ impact: null }))).toBe('Choose an impact to raise');
    expect(raiseButtonLabel(full({ severity: null }))).toBe('Choose a severity to raise');
    expect(raiseButtonLabel(full({ title: '' }))).toBe('Add a title to raise');
  });

  //  …and counts when there are several, because "Choose a severity
  //  and an impact and give it a title" is a sentence nobody reads on
  //  a tablet.
  it('counts when several are missing', () => {
    expect(raiseButtonLabel(emptyDraft('batch', 'b1')))
      .toBe('3 things to choose before raising');
  });
});

describe('what each impact option will do', () => {
  //  THREE, NEVER FOUR. Blank is not a fourth option; it is the
  //  absence of one. And the one that goes missing in practice is
  //  `undetermined`, deleted by a well-meaning change on the grounds
  //  that people should decide.
  it('requires exactly the three the column accepts', () => {
    expect(optionsAreWellFormed(OPTIONS)).toBe(true);
    expect(optionsAreWellFormed(OPTIONS.filter((o) => o.impact !== 'undetermined')))
      .toBe(false);
    expect(optionsAreWellFormed([...OPTIONS, { ...OPTIONS[0], impact: 'yes' }]))
      .toBe(false);
  });

  //  An option with no consequence is an option that says nothing
  //  about release, which is the only reason it is on the screen.
  it('requires every option to state a consequence', () => {
    expect(optionsAreWellFormed(
      OPTIONS.map((o) => (o.impact === 'no' ? { ...o, consequence: '  ' } : o)),
    )).toBe(false);
  });

  it('keeps the database order, whatever the transport did', () => {
    const shuffled = [OPTIONS[2], OPTIONS[0], OPTIONS[1]];
    expect(sortOptions(shuffled).map((o) => o.impact))
      .toEqual(['yes', 'no', 'undetermined']);
  });

  //  DV-03: once an option is chosen its consequence is promoted out
  //  of the list and stated on its own. The other two stop being
  //  relevant, and leaving all three equally loud is how somebody
  //  reads the wrong one.
  it('promotes the chosen option\'s consequence', () => {
    expect(chosenConsequence(OPTIONS, 'yes')!.consequence)
      .toMatch(/block release of batch PCM-2610-014/);
    expect(chosenConsequence(OPTIONS, null)).toBeNull();
  });

  //  The same vocabulary as the floor, so one tone means one thing
  //  across the product.
  it('draws a blocking consequence as blocked and a warning as flagged', () => {
    expect(consequenceTone(chosenConsequence(OPTIONS, 'yes'))).toBe('blocked');
    expect(consequenceTone(chosenConsequence(OPTIONS, 'no'))).toBe('flagged');
    expect(consequenceTone(null)).toBe('none');
  });

  //  ═══ AND THE ONE THAT KEEPS DECISION 1 OPEN ═══
  //  Undetermined's effect comes from the database, which reads the
  //  company's setting. Nothing here decides it — so a company that
  //  turns it off gets 'warns' and this module does not argue.
  it('takes undetermined\'s effect from the data, not from a rule here', () => {
    expect(consequenceTone(chosenConsequence(OPTIONS, 'undetermined'))).toBe('blocked');
    const relaxed = OPTIONS.map((o) =>
      o.impact === 'undetermined' ? { ...o, effect: 'warns' as const } : o);
    expect(consequenceTone(chosenConsequence(relaxed, 'undetermined'))).toBe('flagged');
  });
});

describe('severity', () => {
  it('offers the three the column accepts, gravest first', () => {
    expect(SEVERITIES).toEqual(['critical', 'major', 'minor']);
  });

  //  The commonest mistake on this screen is reaching for Critical in
  //  order to make something stop — when the field that stops it is
  //  the one underneath. So each meaning describes what the severity
  //  IS, and none of them mentions blocking.
  it('describes each severity without promising it blocks anything', () => {
    for (const s of SEVERITIES) {
      expect(SEVERITY_LABEL[s].length).toBeGreaterThan(0);
      expect(SEVERITY_MEANING[s].length).toBeGreaterThan(20);
      expect(SEVERITY_MEANING[s]).not.toMatch(/block/i);
    }
  });

  it('keeps impact as the thing that gates release', () => {
    expect(IMPACTS).toEqual(['yes', 'no', 'undetermined']);
  });
});

describe('the locked context', () => {
  const lines = [
    { key: 'batch', label: 'Batch', value: 'PCM-2610-014' },
    { key: 'product', label: 'Product', value: 'Paracetamol 500 mg Tablets' },
  ];

  it('is complete when every line has a value', () => {
    expect(contextIsComplete(lines)).toBe(true);
  });

  //  A raise flow opened over a record that failed to load would show
  //  empty context and silently raise a deviation against nothing.
  it('is not complete when a line is empty, or when there are none', () => {
    expect(contextIsComplete([...lines, { key: 'x', label: 'Stage', value: '' }])).toBe(false);
    expect(contextIsComplete([])).toBe(false);
  });

  it('names the record in the heading', () => {
    expect(raiseHeading('batch', 'PCM-2610-014'))
      .toBe('Raise a deviation on batch PCM-2610-014');
    expect(raiseHeading('material_lot', 'ML-2610-028'))
      .toBe('Raise a deviation on lot ML-2610-028');
    expect(raiseHeading('process', null)).toBe('Raise a deviation');
  });
});
