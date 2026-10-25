/**
 * What the certificate screen may offer, and to whom.
 *
 * Pure functions, no database. The database is the authority on every
 * rule below; these decide what to *show*, so that a control the
 * database would refuse is not offered in the first place. Where the
 * two could disagree, the database wins and the screen reports its
 * refusal — `coaService.describeCoaError` carries that wording.
 *
 * ── THE ROLE SPLIT IS NOT SETTLED, AND THIS FILE SAYS SO ──
 *
 * `20261130000000` reserves certificate verification to a role the
 * matrix gives Act on **QC testing or QA disposition** — that is
 * qc_analyst, qa_officer and qa_manager. It derives that from the grid
 * at run time rather than naming roles, so it follows PM-03.
 *
 * A narrower split has been *proposed* — QC testing verifies, QA
 * disposition dispositions — and is pending the quality owner's
 * confirmation. It is not implemented here, because narrowing who may
 * verify is a permission change and this file is not the place to make
 * one on a proposal. `mayVerify` therefore mirrors the database as it
 * stands today; `PROPOSED_VERIFIER_SECTIONS` records the narrower rule
 * so the change is a one-line edit with a test already written for it.
 *
 * Either way the separation the decision is actually about already
 * holds: whoever verifies a lot's certificate is refused that lot's
 * disposition by `duty_conflict`, enforced in the lifecycle guard.
 */

import { sectionAccessFor, type PmSection } from '../access/roleAccess';
import type { WorkRole } from '../access/permissionRequests';
import type { CertificateRow, DiscrepancyRow, VerificationStatus } from './coaService';

/** Sections whose Act holders may verify today — mirrors 20261130000000. */
export const VERIFIER_SECTIONS: PmSection[] = ['qc_testing', 'qa_disposition'];

/**
 * The narrower split proposed for the pilot, awaiting the quality
 * owner. NOT in force. Swapping `mayVerify` to read this is the whole
 * change, and it must be made in the database at the same time.
 */
export const PROPOSED_VERIFIER_SECTIONS: PmSection[] = ['qc_testing'];

/**
 * May these roles verify a certificate?
 *
 * Takes the full set, not a single role: somebody holding two roles is
 * entitled to the union of what they allow, and `resolveWorkRole`
 * answers null for exactly those people — which would silently hide a
 * control from a QC Analyst who is also a QA Manager.
 *
 * `=== 'act'` rather than `!== 'none'`, so a PM-04 restriction that
 * lowers somebody to view also removes the control, matching the
 * database.
 */
export function mayVerify(roles: WorkRole[]): boolean {
  return VERIFIER_SECTIONS.some((s) => sectionAccessFor(roles, s) === 'act');
}

/**
 * May these roles file a certificate the supplier sent?
 *
 * Yes — anyone in the company. Filing is paperwork: it writes no
 * verification field and the database gates only `verification_status`
 * and `verified_by`. A screen that also blocked goods-in from
 * attaching the supplier's document would be a different and wrong
 * rule.
 */
export function mayFile(_roles: WorkRole[]): boolean {
  return true;
}

/** Who to ask, when the control is not offered. */
export function verifierSentence(): string {
  return 'Reserved to a QC Analyst, QA Officer or QA Manager.';
}

export function statusLabel(status: VerificationStatus): string {
  switch (status) {
    case 'verified':
      return 'Verified against specification';
    case 'discrepant':
      return 'Discrepancies found';
    case 'rejected':
      return 'Rejected';
    case 'unverified':
    default:
      return 'Not yet checked';
  }
}

export function statusTone(status: VerificationStatus): 'ok' | 'warn' | 'bad' | 'idle' {
  switch (status) {
    case 'verified':
      return 'ok';
    case 'discrepant':
      return 'warn';
    case 'rejected':
      return 'bad';
    default:
      return 'idle';
  }
}

/**
 * The one-line summary for a lot.
 *
 * An unverified certificate and no certificate at all are DIFFERENT
 * states and are worded differently. Collapsing them is how a lot with
 * an unchecked certificate comes to look finished, which is the
 * dangerous way to get this screen wrong.
 */
export function certificateHeadline(certificates: CertificateRow[]): string {
  if (certificates.length === 0) {
    return 'No supplier certificate has been filed for this lot.';
  }
  const unverified = certificates.filter((c) => c.verification_status === 'unverified').length;
  const discrepant = certificates.filter((c) => c.verification_status === 'discrepant').length;
  const verified = certificates.filter((c) => c.verification_status === 'verified').length;

  if (discrepant > 0) {
    const n = certificates.reduce((sum, c) => sum + (c.discrepancy_count ?? 0), 0);
    return `${discrepant} certificate${discrepant === 1 ? '' : 's'} with ${n} discrepanc${
      n === 1 ? 'y' : 'ies'
    } against the specification.`;
  }
  if (unverified > 0) {
    return `${unverified} certificate${
      unverified === 1 ? '' : 's'
    } filed but not yet checked against the specification.`;
  }
  return `${verified} certificate${verified === 1 ? '' : 's'} verified against specification.`;
}

/** Critical discrepancies first — they are the ones that stop a release. */
export function discrepancyLines(rows: DiscrepancyRow[]): DiscrepancyRow[] {
  return [...rows].sort((a, b) => {
    if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1;
    return a.parameter.localeCompare(b.parameter);
  });
}

export function discrepancyTypeLabel(kind: DiscrepancyRow['discrepancy_type']): string {
  switch (kind) {
    case 'out_of_specification':
      return 'Outside specification';
    case 'missing_result':
      return 'Not stated on the certificate';
    case 'unparseable_value':
      return 'Value could not be read';
    case 'unit_mismatch':
      return 'Unit does not match';
    case 'extra_parameter':
      return 'Not in the specification';
    default:
      return kind;
  }
}

/**
 * Is this certificate worth offering a verify button for?
 *
 * Re-verifying a certificate is allowed by the database — it
 * recomputes and re-stamps — but offering it by default invites
 * somebody to overwrite an existing attribution without meaning to.
 * So the control is offered for an unverified certificate, and for a
 * discrepant one (where re-checking after a supplier correction is a
 * real workflow), and not for one already verified clean.
 */
export function verifyOffered(certificate: CertificateRow): boolean {
  return (
    certificate.verification_status === 'unverified' ||
    certificate.verification_status === 'discrepant'
  );
}
