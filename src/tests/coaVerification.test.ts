/**
 * Incoming supplier CoA — what the screen offers, and to whom.
 *
 * The database side of this workflow already has 73 assertions in
 * `incoming_coa_verification_test.sql` plus the authority section in
 * `decision_enforcement_test.sql` §I. These tests cover the half that
 * did not exist: the rules the interface uses to decide what to show,
 * and the wording it puts on a refusal.
 *
 * The point of the authority tests here is NOT to re-prove the
 * database's rule — it is to prove the screen does not offer a control
 * the database would refuse, and does not hide one it would allow.
 */

import { describe, it, expect } from 'vitest';
import {
  mayVerify, mayFile, verifyOffered, certificateHeadline,
  discrepancyLines, discrepancyTypeLabel, statusLabel, statusTone,
  VERIFIER_SECTIONS, PROPOSED_VERIFIER_SECTIONS,
} from '../lib/materials/coaRules';
import { describeCoaError } from '../lib/materials/coaService';
import type { CertificateRow, DiscrepancyRow } from '../lib/materials/coaService';
import type { WorkRole } from '../lib/access/permissionRequests';

function cert(over: Partial<CertificateRow> = {}): CertificateRow {
  return {
    id: 'c1', company_id: 'co', material_lot_id: 'l1',
    certificate_number: 'CoA-1', issued_date: null, received_date: null,
    supplier_results: [], verification_status: 'unverified',
    verified_at: null, verified_by: null, discrepancy_count: 0,
    uploaded_by: null, created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('who may verify a supplier certificate', () => {
  //  These three hold Act on a quality column in PM-03, so
  //  20261130000000 admits them. The screen must agree.
  it.each<WorkRole>(['qc_analyst', 'qa_officer', 'qa_manager'])(
    'offers verification to %s',
    (role) => {
      expect(mayVerify([role])).toBe(true);
    },
  );

  //  These hold no Act on qc_testing or qa_disposition. The database
  //  refuses them with COA_VERIFY_FORBIDDEN, so the control must not
  //  be offered.
  it.each<WorkRole>([
    'storekeeper', 'procurement', 'production_supervisor', 'compliance_admin', 'management',
  ])('does not offer verification to %s', (role) => {
    expect(mayVerify([role])).toBe(false);
  });

  //  NO ABSENT-ROLE EXCEPTION. The hole that 20261130000000 closed was
  //  precisely that a member holding nothing could verify.
  it('does not offer verification to somebody holding no operational role', () => {
    expect(mayVerify([])).toBe(false);
  });

  //  THE MULTI-ROLE CASE, which is why mayVerify takes a set. A person
  //  holding both roles answers null to resolveWorkRole, and a screen
  //  built on that would hide the control from somebody entitled to it.
  it('offers verification to a holder of two roles, one of which qualifies', () => {
    expect(mayVerify(['storekeeper', 'qc_analyst'])).toBe(true);
    expect(mayVerify(['qc_analyst', 'qa_manager'])).toBe(true);
  });

  it('refuses a holder of two roles when neither qualifies', () => {
    expect(mayVerify(['storekeeper', 'procurement'])).toBe(false);
  });
});

describe('filing a certificate stays clerical', () => {
  //  Only verification is a quality judgement. If goods-in could no
  //  longer attach the supplier's document that would be a defect, not
  //  a control.
  it.each<WorkRole[]>([['storekeeper'], ['procurement'], ['qc_analyst'], []])(
    'lets %s file a certificate',
    (roles) => {
      expect(mayFile(roles)).toBe(true);
    },
  );
});

describe('the proposed narrower split is recorded but not in force', () => {
  //  D-1 proposed: QC testing verifies, QA disposition dispositions.
  //  Pending the quality owner. Until confirmed, the screen must match
  //  the database, which admits both sections.
  it('still admits QA disposition, matching the deployed database', () => {
    expect(VERIFIER_SECTIONS).toEqual(['qc_testing', 'qa_disposition']);
    expect(mayVerify(['qa_officer'])).toBe(true);
  });

  it('records the proposed split as QC testing only', () => {
    expect(PROPOSED_VERIFIER_SECTIONS).toEqual(['qc_testing']);
  });

  //  A guard against the narrowing being applied here alone: if
  //  somebody edits mayVerify to the proposal without the migration,
  //  this fails and says why.
  it('fails loudly if the narrowing is applied in the UI before the database', () => {
    expect(VERIFIER_SECTIONS).toContain('qa_disposition');
  });
});

describe('the refusal tells the reader what to do', () => {
  it('explains COA_VERIFY_FORBIDDEN without blaming the screen', () => {
    const d = describeCoaError(
      'COA_VERIFY_FORBIDDEN: verifying an incoming certificate against the material specification is quality work...',
    );
    expect(d.code).toBe('COA_VERIFY_FORBIDDEN');
    expect(d.message).toMatch(/QC testing or QA disposition/);
    expect(d.message).toMatch(/database enforces that, not this screen/);
  });

  it('names the missing specification as the thing to fix', () => {
    const d = describeCoaError('COA_NO_SPECIFICATION: no effective specification');
    expect(d.code).toBe('COA_NO_SPECIFICATION');
    expect(d.message).toMatch(/Approve a material specification first/);
  });

  it('distinguishes a cross-company refusal from an authorisation one', () => {
    expect(describeCoaError('COA_FORBIDDEN: caller is not a member').code).toBe('COA_FORBIDDEN');
  });

  //  An unrecognised code is passed through, not flattened. Flattening
  //  a real finding into "something went wrong" loses it.
  it('passes an unknown error through rather than hiding it', () => {
    const d = describeCoaError('MATERIAL_LOT_FROZEN: something specific');
    expect(d.code).toBe('UNKNOWN');
    expect(d.message).toContain('MATERIAL_LOT_FROZEN');
  });
});

describe('an unchecked certificate does not read as a finished one', () => {
  it('says plainly when nothing has been filed', () => {
    expect(certificateHeadline([])).toMatch(/No supplier certificate/);
  });

  //  The dangerous collapse: "filed" must not read as "checked".
  it('distinguishes filed-but-unchecked from verified', () => {
    const filed = certificateHeadline([cert()]);
    expect(filed).toMatch(/not yet checked/);
    expect(filed).not.toMatch(/verified against specification\./);
  });

  it('leads with discrepancies when there are any', () => {
    const line = certificateHeadline([
      cert({ verification_status: 'discrepant', discrepancy_count: 2 }),
    ]);
    expect(line).toMatch(/2 discrepancies/);
  });

  it('reports a clean verification', () => {
    expect(certificateHeadline([cert({ verification_status: 'verified' })])).toMatch(
      /1 certificate verified against specification/,
    );
  });

  it('pluralises honestly', () => {
    const line = certificateHeadline([
      cert({ id: 'a', verification_status: 'discrepant', discrepancy_count: 1 }),
    ]);
    expect(line).toMatch(/1 discrepancy/);
  });
});

describe('the verify control is offered when it means something', () => {
  it('is offered for an unchecked certificate', () => {
    expect(verifyOffered(cert())).toBe(true);
  });

  //  Re-checking after a supplier correction is a real workflow.
  it('is offered again for a discrepant certificate', () => {
    expect(verifyOffered(cert({ verification_status: 'discrepant' }))).toBe(true);
  });

  //  Not offered for one already clean: the database would allow a
  //  re-verify and overwrite the existing attribution, and nobody
  //  should do that by accident.
  it('is not offered for one already verified clean', () => {
    expect(verifyOffered(cert({ verification_status: 'verified' }))).toBe(false);
  });
});

describe('discrepancies are presented worst-first', () => {
  const rows: DiscrepancyRow[] = [
    { id: '1', certificate_id: 'c1', parameter: 'Water', discrepancy_type: 'out_of_specification',
      specification_limit: '<= 5', stated_value: '7', is_critical: false,
      detected_at: 'x', resolved_at: null },
    { id: '2', certificate_id: 'c1', parameter: 'Assay', discrepancy_type: 'missing_result',
      specification_limit: '95-105', stated_value: null, is_critical: true,
      detected_at: 'x', resolved_at: null },
  ];

  it('puts critical parameters first', () => {
    expect(discrepancyLines(rows).map((r) => r.parameter)).toEqual(['Assay', 'Water']);
  });

  it('does not mutate the input', () => {
    const before = rows.map((r) => r.parameter);
    discrepancyLines(rows);
    expect(rows.map((r) => r.parameter)).toEqual(before);
  });

  it('labels every discrepancy type in words', () => {
    const kinds: DiscrepancyRow['discrepancy_type'][] = [
      'out_of_specification', 'missing_result', 'unparseable_value',
      'unit_mismatch', 'extra_parameter',
    ];
    for (const k of kinds) {
      expect(discrepancyTypeLabel(k)).not.toBe(k);
      expect(discrepancyTypeLabel(k).length).toBeGreaterThan(3);
    }
  });
});

describe('status wording', () => {
  it('never shows a raw enum', () => {
    for (const s of ['unverified', 'verified', 'discrepant', 'rejected'] as const) {
      expect(statusLabel(s)).not.toBe(s);
    }
  });

  it('tones discrepant as a warning and rejected as bad', () => {
    expect(statusTone('verified')).toBe('ok');
    expect(statusTone('discrepant')).toBe('warn');
    expect(statusTone('rejected')).toBe('bad');
    expect(statusTone('unverified')).toBe('idle');
  });
});
