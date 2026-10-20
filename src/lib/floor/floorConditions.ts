/**
 * Flagged versus blocked — W4·18.
 *
 * The design states one rule that spans all seven screens of this
 * section, and it is the only one written as a definition rather than
 * as a screen description:
 *
 *   "Flagged vs blocked: flagged = amber, info icon, 'you can continue
 *    with…'; blocked = solid red, ✕, 'can't', no way past it on
 *    screen."
 *
 * WHY IT LIVES IN ONE FILE. Seven screens across three domains —
 * clearance, dispensing, calibration — each have conditions that stop
 * work or merely mark it. If each screen decided which treatment to
 * use, the rule would survive about a fortnight: one screen would grey
 * a button for a flagged condition, another would show amber for
 * something genuinely impossible, and an operator would learn that
 * neither colour means anything in particular. So the severity comes
 * from the database, the treatment is defined once here, and the
 * screens render rather than classify.
 *
 * THE TWO ARE NOT DEGREES OF THE SAME THING. They differ in what the
 * person does next, which is the only difference that matters at a
 * workstation:
 *
 *   flagged — the work continues once somebody with the right
 *             standing authorises it. The notice names who.
 *   blocked — the work stops. The notice names what must change, and
 *             there is no control on the screen that proceeds anyway.
 *
 * `continue_with` is the structural expression of that: non-optional
 * on a flagged condition, absent on a blocked one. A `FloorCondition`
 * that said "you can continue with" and then nothing would be worse
 * than no distinction at all, because it would look right.
 */

export type Severity = 'flagged' | 'blocked';

export interface FloorCondition {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  /**
   * Who or what lets the work continue. The database guarantees this
   * is present on every flagged row and absent on every blocked one;
   * `isWellFormed` below is what notices a regression.
   */
  continueWith: string | null;
  sortOrder: number;
}

export interface FloorVerdict {
  conditions: FloorCondition[];
  blocked: FloorCondition[];
  flagged: FloorCondition[];
  /** Nothing stops the work. Flagged conditions do not stop it. */
  canProceed: boolean;
  /** Can proceed, but somebody has to authorise it first. */
  needsAuthorisation: boolean;
}

/**
 * Sorts and counts, in the database's own order.
 *
 * Blocked first: a screen showing an amber notice above a red one
 * invites somebody to deal with the amber and discover the red
 * afterwards.
 */
export function assess(conditions: FloorCondition[]): FloorVerdict {
  const sorted = [...conditions].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'blocked' ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });

  const blocked = sorted.filter((c) => c.severity === 'blocked');
  const flagged = sorted.filter((c) => c.severity === 'flagged');

  return {
    conditions: sorted,
    blocked,
    flagged,
    canProceed: blocked.length === 0,
    needsAuthorisation: blocked.length === 0 && flagged.length > 0,
  };
}

/**
 * Whether a condition is shaped the way the rule requires.
 *
 * Not defensive programming for its own sake: the one failure mode
 * that would look fine on screen is a flagged condition with no
 * `continueWith`, which renders as a promise with nothing after it.
 * Screens call this and show the condition as blocked if it fails —
 * the safe direction, since "you can't" is never dangerous and "you
 * can continue with (nothing)" is.
 */
export function isWellFormed(c: FloorCondition): boolean {
  if (c.severity === 'flagged') return (c.continueWith ?? '').trim().length > 0;
  return c.continueWith == null;
}

/**
 * The severity a screen should actually render.
 *
 * Degrades a malformed flagged condition to blocked rather than
 * drawing the broken promise. See isWellFormed.
 */
export function effectiveSeverity(c: FloorCondition): Severity {
  return isWellFormed(c) ? c.severity : 'blocked';
}

/**
 * The words on the primary button.
 *
 * Blocked names the count and says "can't", because the design's rule
 * is that a blocked notice uses that word. Flagged says what the next
 * step actually is — getting an authorisation — rather than pretending
 * the action is available.
 */
export function actionLabel(verdict: FloorVerdict, ready: string): string {
  if (verdict.blocked.length > 0) {
    return verdict.blocked.length === 1
      ? "Can't continue · 1 thing to fix"
      : `Can't continue · ${verdict.blocked.length} things to fix`;
  }
  if (verdict.flagged.length > 0) return 'Continue with authorisation';
  return ready;
}

/**
 * A lot the picker may offer.
 *
 * "Unapproved lots selectable then refused: no. They are never listed;
 * the picker says so." The list comes from dispensable_lots, which
 * asks the dispensing gate per lot — so this type has no `disabled`
 * or `reason` field. There is nowhere to put one, which is the point:
 * a shape with a `disabled` flag is a shape that invites a greyed row.
 */
export interface DispensableLot {
  lotId: string;
  lotNumber: string;
  quantityAvailable: number;
  unitOfMeasure: string;
  retestDueDate: string | null;
  supplierExpiryDate: string | null;
}

/**
 * What the picker says when it has nothing to offer.
 *
 * An empty picker with no words is the worst version of this screen:
 * the operator cannot tell whether the system is broken, the material
 * is wrong, or there genuinely is no approved stock. All three have
 * different next steps.
 */
export function emptyPickerMessage(materialName: string): string {
  return `No approved lot of ${materialName} is available to dispense. `
    + 'Lots that are quarantined, rejected, past retest or used up are not listed here — '
    + 'check the material lots register to see where this material stands.';
}
