/**
 * Raising a deviation — W5·11 (DV-01, DV-02, DV-03 and their phones).
 *
 * THE RULE THIS SECTION TURNS ON is stated twice in the design, once
 * as a requirement and once as a failure:
 *
 *   "Severity and impact as deliberate choices; 'yes' says it will
 *    block release."
 *   "Impact preselected: no. All three options start empty, a blank
 *    impact is an error."
 *
 * A PRESELECTED IMPACT IS THE ONE DEFECT THIS MODULE EXISTS TO
 * PREVENT. Not because a default would be inaccurate — any of the
 * three could be defensible — but because the whole point of the
 * field is that somebody decided. A form that arrives with
 * "undetermined" already chosen collects the opinion of whoever wrote
 * the form, several thousand times, under the name of whoever pressed
 * Raise. `emptyDraft()` below returns nulls, the types are nullable,
 * and `checkDraft` refuses a blank.
 *
 * "UNDETERMINED IS FINE; BLANK ISN'T" is the distinction underneath
 * that, and it is a real one: undetermined is an assessment somebody
 * made and can be held to — it says "I do not yet know", it blocks
 * release until somebody finds out, and it is a row in the register
 * with a name on it. Blank is the absence of an assessment, and it
 * cannot be chased because nobody can tell it from a form somebody
 * was halfway through.
 *
 * NOTHING HERE DECIDES WHAT AN IMPACT WILL DO TO RELEASE.
 * `deviation_impact_consequence` does, derived from the gate's own
 * rule and from the company's setting for an undetermined impact —
 * W5·11 decision 1, which is open. A sentence written here would be
 * this module's opinion of a rule it does not own.
 */

export type Severity = 'critical' | 'major' | 'minor';
export type Impact = 'yes' | 'no' | 'undetermined';

/** What a deviation can be raised against. Mirrors the column's own
 *  vocabulary; 'process' and 'facility' name a thing rather than a
 *  row, which is why `sourceId` is nullable. */
export type SourceType =
  | 'batch' | 'material_lot' | 'equipment' | 'qc_result' | 'process' | 'facility';

export const SEVERITIES: readonly Severity[] = ['critical', 'major', 'minor'];
export const IMPACTS: readonly Impact[] = ['yes', 'no', 'undetermined'];

/** Gravest first, which is the order the options are shown in: a
 *  person scanning a list of three reads the top one as the most
 *  serious, and putting Minor there would quietly understate every
 *  deviation raised in a hurry. */
export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
};

/**
 * What each severity means, in the words somebody choosing has to
 * weigh.
 *
 * Severity is NOT what gates release — impact is — and these say so,
 * because the commonest mistake on this screen is to reach for
 * Critical in order to make something stop, when the field that stops
 * it is the one underneath.
 */
export const SEVERITY_MEANING: Record<Severity, string> = {
  critical: 'Patient safety, or a regulatory commitment, is at risk.',
  major: 'A GMP requirement was not met, and product or process is affected.',
  minor: 'A departure with no effect on product quality or the system.',
};

export interface DeviationDraft {
  title: string;
  description: string;
  /** Null until chosen. Never defaulted — see the header. */
  severity: Severity | null;
  impact: Impact | null;
  /** Filled in from the record the raise flow was opened over, and not
   *  editable: the whole point of raising from a record is that the
   *  context comes from the record. */
  sourceType: SourceType;
  sourceId: string | null;
}

/**
 * A draft with nothing chosen.
 *
 * The context is supplied because the flow is always opened over a
 * record; the two decisions are null because they are decisions.
 */
export function emptyDraft(sourceType: SourceType, sourceId: string | null): DeviationDraft {
  return {
    title: '', description: '',
    severity: null, impact: null,
    sourceType, sourceId,
  };
}

export interface DraftProblem {
  field: 'title' | 'severity' | 'impact' | 'source';
  message: string;
}

/**
 * What is still missing, in the order the form asks for it.
 *
 * REPORTS EVERY PROBLEM, not the first. A form that reveals one
 * missing field at a time is a form somebody presses Raise on four
 * times, and on a tablet at a press that is four trips back up the
 * sheet.
 */
export function checkDraft(d: DeviationDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];

  //  deviations.title is NOT NULL (3B.1) and blank-checked in the
  //  database. Said here first so the sheet can say it before the
  //  round trip.
  if (d.title.trim() === '') {
    problems.push({ field: 'title', message: 'Give it a title — one line, what happened.' });
  }

  if (d.severity === null) {
    problems.push({ field: 'severity', message: 'Choose a severity.' });
  }

  //  THE ONE. Not "choose an impact" — the message says what the
  //  third option is for, because somebody who genuinely does not know
  //  needs to be told that saying so is allowed.
  if (d.impact === null) {
    problems.push({
      field: 'impact',
      message: 'Choose whether product quality is affected. '
        + 'If you do not know yet, Undetermined is a real answer — blank is not.',
    });
  }

  if (d.sourceType !== 'process' && d.sourceType !== 'facility' && !d.sourceId) {
    problems.push({
      field: 'source',
      message: 'This deviation has lost the record it was raised from. Close and start again '
        + 'from the record, so the context is filled in.',
    });
  }

  return problems;
}

/** Whether the draft can be raised. Derived from `checkDraft` rather
 *  than re-tested, so the button and the messages can never disagree. */
export function canRaise(d: DeviationDraft): boolean {
  return checkDraft(d).length === 0;
}

/**
 * The words on the Raise button.
 *
 * "Raise unavailable with the reason shown" (DV-01) — so the button
 * says what is missing rather than going dim and leaving somebody to
 * hunt. One missing thing is named; several are counted, because
 * "Choose a severity and an impact and give it a title" is a sentence
 * nobody reads on a tablet.
 */
export function raiseButtonLabel(d: DeviationDraft): string {
  const problems = checkDraft(d);
  if (problems.length === 0) return 'Raise deviation';
  if (problems.length === 1) {
    switch (problems[0].field) {
      case 'title':    return 'Add a title to raise';
      case 'severity': return 'Choose a severity to raise';
      case 'impact':   return 'Choose an impact to raise';
      default:         return "Can't raise — the record is missing";
    }
  }
  return `${problems.length} things to choose before raising`;
}

// ── what each impact option will do ──────────────────────────────────

/** One option as `deviation_impact_consequence` reports it. The
 *  consequence is a sentence the database composed from the gate's own
 *  rule and the company's settings; nothing here rewrites it. */
export interface ImpactOption {
  impact: Impact;
  label: string;
  /** What release will actually do. 'blocks' | 'warns' | 'none'. */
  effect: 'blocks' | 'warns' | 'none';
  consequence: string;
  sortOrder: number;
}

/**
 * Whether the options are shaped the way the rule requires.
 *
 * Three, and exactly the three the column accepts. A fourth option, or
 * a missing one, means the sheet is about to offer something the
 * database will refuse — and the one that goes missing in practice is
 * `undetermined`, because it is the one a well-meaning change deletes
 * on the grounds that people should decide.
 */
export function optionsAreWellFormed(options: readonly ImpactOption[]): boolean {
  if (options.length !== IMPACTS.length) return false;
  const keys = new Set(options.map((o) => o.impact));
  return IMPACTS.every((i) => keys.has(i))
    && options.every((o) => o.consequence.trim().length > 0);
}

/** Sorted as the database ordered them, defensively — an options list
 *  whose order depends on the transport is one that will one day put
 *  "No" at the top. */
export function sortOptions(options: readonly ImpactOption[]): ImpactOption[] {
  return [...options].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * The option the sheet should emphasise once one is chosen.
 *
 * DV-03: "Major + impact Yes chosen; 'This will block release of
 * PCM-2610-014' stated before raising." So the chosen option's
 * consequence is promoted out of the list and shown on its own — the
 * other two stop being relevant the moment one is picked, and leaving
 * all three equally loud is how somebody reads the wrong one.
 */
export function chosenConsequence(
  options: readonly ImpactOption[], impact: Impact | null,
): ImpactOption | null {
  if (impact === null) return null;
  return options.find((o) => o.impact === impact) ?? null;
}

/** How the chosen consequence should be drawn: the same flagged /
 *  blocked vocabulary as the floor, so one tone means one thing across
 *  the product. */
export function consequenceTone(o: ImpactOption | null): 'blocked' | 'flagged' | 'none' {
  if (o === null) return 'none';
  return o.effect === 'blocks' ? 'blocked' : o.effect === 'warns' ? 'flagged' : 'none';
}

// ── the context the flow was opened over ─────────────────────────────

/** A line of locked context on the sheet. Filled in from the record,
 *  never typed — "context pre-filled" is the design's DONE MEANS, and
 *  a field somebody can edit is a field somebody will edit wrongly at
 *  four in the morning. */
export interface ContextLine {
  key: string;
  label: string;
  value: string;
}

/**
 * Whether the context is complete enough to raise from.
 *
 * A raise flow opened over a record that failed to load would show
 * empty context and silently raise a deviation against nothing. The
 * sheet checks rather than trusting its own props.
 */
export function contextIsComplete(lines: readonly ContextLine[]): boolean {
  return lines.length > 0 && lines.every((l) => l.value.trim().length > 0);
}

/** The heading over the sheet, naming what is being raised against. */
export function raiseHeading(sourceType: SourceType, sourceLabel: string | null): string {
  const what = SOURCE_NOUN[sourceType];
  return sourceLabel ? `Raise a deviation on ${what} ${sourceLabel}` : `Raise a deviation`;
}

const SOURCE_NOUN: Record<SourceType, string> = {
  batch: 'batch',
  material_lot: 'lot',
  equipment: 'instrument',
  qc_result: 'QC result',
  process: 'the process',
  facility: 'the facility',
};
