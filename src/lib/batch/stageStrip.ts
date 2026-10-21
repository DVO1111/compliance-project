/**
 * The stage strip, and what the workstation needs — W4·17.
 *
 * Two of the design's rules live here because both are the kind a
 * screen quietly breaks:
 *
 *   "Locked stage greyed with no explanation: no. Every locked stage
 *    says what it waits for."
 *   "Complete and sign stays disabled with the reason given."
 *
 * A disabled control with no reason and a greyed stage with no reason
 * are the same bug, and both are what a screen does by default. So
 * neither `StageState` nor `CompletionBlocker` has a shape that can
 * express "not available" without the sentence beside it.
 *
 * NOTHING HERE DECIDES ANYTHING. batch_stage_strip and
 * batch_stage_completion_blockers compute both in the database, which
 * derives "locked" from the same condition batch_stage_start() refuses
 * on. A browser that worked it out for itself would eventually offer a
 * stage the gate then refuses.
 *
 * TOUCH TARGETS. The design is drawn for a 1180 × 820 tablet at a
 * workstation, operated with gloves: "56 px buttons, 64 px fields and
 * keys, 8–12 px gaps". Those numbers are the design's own assumption
 * pending its item 02, and they are here as named constants rather
 * than scattered through components so replacing them later is one
 * edit rather than a hunt.
 */

export const TOUCH = {
  /** Any button or tappable row. */
  target: 56,
  /** A field a reading is typed into, and a keypad key. */
  field: 64,
  /** The smallest gap between two targets. */
  gap: 12,
} as const;

export type StageState = 'done' | 'current' | 'locked' | 'closed';

export interface StripStage {
  stageId: string;
  sequenceNo: number;
  name: string;
  status: string;
  state: StageState;
  /**
   * Why it is not open. Null ONLY when the state is 'current' or
   * 'done' — any other state without a sentence is the failure the
   * design rules out, and `waitingReason` below refuses to invent one.
   */
  waitingFor: string | null;
  requiresVerifier: boolean;
  signedByOperator: boolean;
  signedByVerifier: boolean;
  readingsTotal: number;
  readingsRecorded: number;
  readingsOutOfSpec: number;
}

export interface CompletionBlocker {
  key: string;
  title: string;
  detail: string;
  sortOrder: number;
}

/**
 * The sentence to show on a stage that is not open.
 *
 * Returns null for an open stage, and NEVER a placeholder for a locked
 * one with no reason — a generic "not available yet" would satisfy the
 * letter of the rule and defeat it. If the database ever returns a
 * locked stage with no sentence, that is a bug worth seeing on screen.
 */
export function waitingReason(stage: StripStage): string | null {
  if (stage.state === 'current' || stage.state === 'done') return null;
  return stage.waitingFor;
}

/** Whether this stage can be worked on right now. */
export function isOpen(stage: StripStage): boolean {
  return stage.state === 'current';
}

/**
 * Where the batch is, for the header: "Stage 4 of 9".
 *
 * Counts DONE stages rather than taking the current one's index,
 * because a reopened stage puts the current one behind completed ones
 * and "stage 3 of 9" on a batch with five done stages would be wrong
 * in the direction that matters.
 */
export function progress(stages: StripStage[]): { done: number; total: number; label: string } {
  const done = stages.filter((s) => s.state === 'done').length;
  return { done, total: stages.length, label: `${done} of ${stages.length} stages complete` };
}

/**
 * The three sign-off states the design draws, as one value.
 *
 * BR-03 is `none`, BR-04 is `operator`, BR-05 is `both`. Keeping it as
 * one value rather than two booleans means a screen cannot render the
 * impossible fourth combination — a verifier signature with no
 * operator signature — which the database also refuses.
 */
export type SignOffState = 'none' | 'operator' | 'both' | 'not_required';

export function signOffState(stage: StripStage): SignOffState {
  if (!stage.requiresVerifier) return 'not_required';
  if (stage.signedByVerifier) return 'both';
  if (stage.signedByOperator) return 'operator';
  return 'none';
}

/**
 * The label on the primary button, which names the count when it is
 * disabled.
 *
 * "Complete and sign stays disabled with the reason given" — a
 * disabled button saying only "Complete and sign" leaves somebody
 * pressing it to find out why, which is the same failure as hiding the
 * reason, one press later.
 */
export function completeButtonLabel(blockers: CompletionBlocker[]): string {
  if (blockers.length === 0) return 'Complete and sign';
  return blockers.length === 1
    ? 'Blocked by 1 thing'
    : `Blocked by ${blockers.length} things`;
}

/**
 * Whether a typed reading is inside its limits — checked as it is
 * typed, per BR-03.
 *
 * A BLANK IS NOT A FAILURE. An operator part-way through typing "12.5"
 * has typed "1", then "12", then "12." — flagging each of those red
 * would make the field shout at somebody doing nothing wrong. Only a
 * complete, parseable number out of range is out of range.
 */
export type ReadingCheck = 'empty' | 'unparseable' | 'in_range' | 'out_of_range' | 'no_limits';

export function checkReading(
  raw: string, min: number | null | undefined, max: number | null | undefined,
): ReadingCheck {
  if (raw.trim() === '') return 'empty';

  const n = Number(raw);
  //  "12." and "-" are mid-typing, not errors. Number('12.') is 12, so
  //  the trailing-separator case passes through as in-range, which is
  //  what somebody typing wants.
  if (!Number.isFinite(n)) return 'unparseable';

  if (min == null && max == null) return 'no_limits';
  if (min != null && n < min) return 'out_of_range';
  if (max != null && n > max) return 'out_of_range';
  return 'in_range';
}
