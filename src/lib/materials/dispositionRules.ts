/**
 * The rules behind the QA disposition screen, as functions rather than
 * conditions buried in JSX.
 *
 * This project has no DOM testing library — all 897 unit tests are
 * pure logic — so a rule written inline in a component cannot be
 * tested at all, and the rules on this screen are the ones that decide
 * whether a material reaches production. They live here so they can be
 * asserted.
 *
 * None of these is the enforcement. app_assert_step() refuses the step
 * in a trigger and material_lot_release_block_reason() refuses an
 * unready lot, both in the database. These decide what the screen
 * OFFERS, and the point of getting them right is that a control which
 * is always refused teaches people the system is broken rather than
 * that the lot is not ready.
 */

import type { Readiness } from './releaseReadiness';
import { canAct } from '../access/roleAccess';
import type { WorkRole } from '../access/permissionRequests';

/** MT-08's three dispositions. A closed list, in the design's order. */
export const DISPOSITIONS = [
  { key: 'return_to_supplier', label: 'Return to supplier' },
  { key: 'destruction',        label: 'Destruction' },
  { key: 'downgrade',          label: 'Downgrade' },
] as const;

export type DispositionKey = typeof DISPOSITIONS[number]['key'];

/**
 * Whether this viewer may decide at all.
 *
 * PM-03 reserves material disposition to the QA Officer and QA
 * Manager. A Compliance admin sees everything and acts in no quality
 * step, which is the segregation the frame prints, so they are
 * refused here as firmly as a Storekeeper is.
 */
export function mayDecide(role: WorkRole | null | undefined): boolean {
  return canAct(role, 'qa_disposition');
}

/**
 * Whether to offer the release control.
 *
 * FAILS CLOSED, and the null case is the one that matters: readiness
 * is null while the conditions are still being read and after a read
 * that failed. Treating "we do not know yet" as "ready" would offer a
 * release on a lot whose blocking conditions had simply not arrived.
 */
export function releaseOffered(readiness: Readiness | null | undefined): boolean {
  return readiness?.canRelease === true;
}

/**
 * Rejecting always remains available, including on a lot that is
 * ready to release.
 *
 * Deliberate, and the asymmetry is the point: a QA decision is not
 * only "is it good enough" — a lot can meet every condition and still
 * be rejected on judgement. Blocking rejection behind the same
 * conditions as release would make the system able to say yes more
 * easily than no.
 */
export function rejectOffered(role: WorkRole | null | undefined): boolean {
  return mayDecide(role);
}

/**
 * A rejection needs a disposition and a reason, both.
 *
 * A rejected lot that cannot be explained later is a finding. The
 * reason is trimmed before counting, so a space bar is not a reason.
 */
export function rejectComplete(
  disposition: DispositionKey | '' | null | undefined,
  reason: string | null | undefined,
): boolean {
  return !!disposition && (reason ?? '').trim().length > 0;
}

/**
 * What the screen says after a decision lands, in the words that
 * describe the consequence rather than the operation.
 *
 * "Released" on its own does not tell a storekeeper anything; "now
 * available to production" does.
 */
export function decisionConfirmation(kind: 'release' | 'reject', lotNumber: string): string {
  return kind === 'release'
    ? `Lot ${lotNumber} released. It is now available to production.`
    : `Lot ${lotNumber} rejected. It stays blocked from issue.`;
}
