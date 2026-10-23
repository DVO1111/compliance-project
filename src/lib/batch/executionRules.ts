/**
 * What a batch-execution screen may offer, and to whom.
 *
 * Extracted from the page for the reason dispositionRules, receiptRules
 * and qcRules were: this repo has no DOM testing library, so a rule
 * that lives inside a component cannot be tested at all. These are the
 * decisions worth getting wrong quietly, so they live where a test can
 * reach them.
 *
 * ── THIS IS NOT THE ENFORCEMENT ──
 *
 * PM-03 gives Act on `Batch records` to the Production supervisor and
 * View to the seven other roles it tabulates. That rule is enforced by
 * 20261106000000, as four guards on the tables the writes land in, so
 * it holds for a direct PostgREST call as well as for the RPC. What is
 * here decides whether a control is DRAWN, which is a different
 * question with a different failure mode: drawing a button the database
 * then refuses wastes somebody's time at a workstation, and hiding one
 * the database would have allowed invents a restriction.
 *
 * So every function below fails closed on an unknown role, and the page
 * says in words that the database decides. If these two ever disagree,
 * the database wins and the screen is wrong.
 *
 * ── WHY `start` ASKS ABOUT THE LINE AND `record` DOES NOT ──
 *
 * Line clearance gates the START of work on a line — that is what
 * line_clearance_assert_cleared() is called by. A reading taken inside
 * a stage that is already running is not gated by it, and refusing one
 * would mean an operator who is mid-stage when a condition appears
 * cannot write down what they just measured. Losing the measurement is
 * worse than recording it: the reading is the evidence either way.
 */

import { canAct } from '../access/roleAccess';
import type { WorkRole } from '../access/permissionRequests';
import type { StripStage, CompletionBlocker } from './stageStrip';
import type { FloorVerdict } from '../floor/floorConditions';

/**
 * Whether this role may act in the batch-records section at all.
 *
 * FAILS CLOSED on null. A role that has not resolved is not a role
 * with permission — the page is still loading, or the member has no
 * work role, and offering the floor controls in either case is the
 * wrong direction to guess in.
 */
export function mayExecute(role: WorkRole | null | undefined): boolean {
  if (!role) return false;
  return canAct(role, 'batch_records');
}

/**
 * The sentence shown instead of the controls.
 *
 * Names what the reader CAN do — PM-03 gives most of these roles View
 * on this section, so they are meant to be here, reading. A bare "you
 * do not have permission" on a page they were sent to by their own
 * sidebar reads as a bug.
 */
export function viewerNotice(role: WorkRole | null | undefined): string {
  if (!role) {
    return 'Your role has not loaded yet, so nothing on this page can be changed.';
  }
  return 'You can read this batch record but not change it. Starting a stage, '
    + 'recording a reading, dispensing material and signing a stage off are '
    + 'reserved to the production supervisor. The database enforces that, not '
    + 'this screen.';
}

/** A stage is open for work when the database says it is current. */
export function stageIsOpen(stage: StripStage | null | undefined): boolean {
  return stage?.state === 'current';
}

/**
 * Whether to offer "Start stage".
 *
 * Three things have to hold, and each is somebody else's answer:
 * the role (PM-03), the stage being next (batch_stage_strip) and the
 * line being cleared (line_clearance_conditions). A blocked floor
 * condition stops it; a flagged one does not, because flagged means the
 * work continues once somebody authorises it, and that is what the
 * notice above the strip is for.
 */
export function startOffered(
  stage: StripStage | null | undefined,
  verdict: FloorVerdict | null,
  role: WorkRole | null | undefined,
): boolean {
  if (!mayExecute(role)) return false;
  if (!stageIsOpen(stage)) return false;
  if (stage!.status !== 'pending') return false;
  //  Null is "not read yet", not "nothing wrong".
  if (verdict === null) return false;
  return verdict.canProceed;
}

/**
 * Whether to offer the reading entry and the dispensing picker.
 *
 * Both need the stage to be RUNNING. batch_stage_record_reading refuses
 * a pending stage outright — BATCH_STAGE_NOT_IN_PROGRESS — and
 * dispensing into a stage that has not started records material against
 * work nobody has begun.
 */
export function entryOffered(
  stage: StripStage | null | undefined,
  role: WorkRole | null | undefined,
): boolean {
  if (!mayExecute(role)) return false;
  return stage?.status === 'in_progress';
}

/**
 * Whether to offer "Complete and sign".
 *
 * Offered WITH BLOCKERS PRESENT, deliberately, and disabled. The
 * design's rule is "Complete and sign stays disabled with the reason
 * given" — removing the button when something is outstanding leaves an
 * operator looking for a control that is not there, which is the same
 * failure as a greyed one with no explanation.
 */
export function completeOffered(
  stage: StripStage | null | undefined,
  role: WorkRole | null | undefined,
): boolean {
  if (!mayExecute(role)) return false;
  return stage?.status === 'in_progress' || stage?.status === 'awaiting_verification';
}

export function completeEnabled(
  stage: StripStage | null | undefined,
  blockers: CompletionBlocker[],
  role: WorkRole | null | undefined,
): boolean {
  if (!completeOffered(stage, role)) return false;
  return blockers.length === 0;
}

/**
 * Which half of a dual sign-off this person is being asked for.
 *
 * `verify` only once the operator has signed, and only on a stage that
 * asks for a second person. The database refuses a verifier who is the
 * operator, so this is about which control to draw, not about who is
 * allowed — identity is checked where it can be trusted.
 */
export type SignStep = 'operator' | 'verify' | 'none';

export function signStep(
  stage: StripStage | null | undefined,
  viewerId: string | null | undefined,
): SignStep {
  if (!stage) return 'none';
  if (stage.status === 'awaiting_verification') {
    //  Nobody to compare against: offer it and let the database refuse
    //  a self-verification rather than hiding the control on a guess.
    if (!viewerId || !stage.operatorId) return 'verify';
    return stage.operatorId === viewerId ? 'none' : 'verify';
  }
  if (stage.status === 'in_progress') return 'operator';
  return 'none';
}

/**
 * The confirmation sentence before a stage is signed.
 *
 * Names the stage and whether a second person is still to come, because
 * "complete" on a stage that then sits waiting for a verifier is not
 * what the word suggests on its own.
 */
export function completeConfirmation(stage: StripStage): string {
  const head = `Sign stage ${stage.sequenceNo} · ${stage.name} as complete.`;
  return stage.requiresVerifier
    ? `${head} It then waits for a second person to verify it; it is not finished until they do.`
    : `${head} This stage needs no second signature.`;
}

/**
 * What a dispensing entry is missing before it can be sent.
 *
 * Returns the reasons rather than a boolean, so the screen can say
 * which one — a disabled button with no reason is the failure this
 * whole area is written against.
 */
export function dispensingIncomplete(args: {
  lotId: string | null;
  quantity: string;
  instrumentId: string | null;
}): string[] {
  const missing: string[] = [];
  if (!args.lotId) missing.push('Choose a lot.');
  const n = Number(args.quantity);
  if (args.quantity.trim() === '') missing.push('Enter the weighed quantity.');
  else if (!Number.isFinite(n) || n <= 0) missing.push('The quantity must be a number greater than zero.');
  if (!args.instrumentId) missing.push('Name the balance it was weighed on.');
  return missing;
}

/**
 * Whether a reading is ready to send.
 *
 * A numeric parameter needs a number; a text one needs text. Mirrors
 * qcRules.resultComplete, which had the same question for a different
 * table, and is separate from checkReading — that one says whether a
 * value is in SPECIFICATION, which is not the same as whether it has
 * been entered. An out-of-specification reading is still recorded; that
 * is the point of recording it.
 */
export function readingComplete(args: {
  parameterType: string;
  value: string;
  text: string;
}): boolean {
  if (args.parameterType === 'product_attribute' && args.text.trim() !== '') return true;
  const n = Number(args.value);
  return args.value.trim() !== '' && Number.isFinite(n);
}
