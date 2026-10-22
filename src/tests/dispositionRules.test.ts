/**
 * The QA disposition screen's rules.
 *
 * This is the gate that decides whether a material reaches production,
 * so what is asserted here is mostly what the screen must REFUSE to
 * offer. A control that is always refused by the database teaches
 * people the product is broken; a control that is offered when it
 * should not be teaches them the rule does not exist.
 */

import { describe, it, expect } from 'vitest';
import {
  DISPOSITIONS, mayDecide, releaseOffered, rejectOffered, rejectComplete,
  decisionConfirmation, type DispositionKey,
} from '../lib/materials/dispositionRules';
import type { Readiness } from '../lib/materials/releaseReadiness';
import type { WorkRole } from '../lib/access/permissionRequests';

const readiness = (canRelease: boolean): Readiness => ({
  conditions: [], blocking: [], met: [], outstanding: [], canRelease,
});

describe('who may decide', () => {
  it('is the QA Officer and the QA Manager, and nobody else', () => {
    const roles: WorkRole[] = [
      'procurement', 'storekeeper', 'qc_analyst', 'qa_officer', 'qa_manager',
      'production_supervisor', 'compliance_admin', 'management',
    ];
    expect(roles.filter(mayDecide)).toEqual(['qa_officer', 'qa_manager']);
  });

  //  The segregation PM-03 prints under its grid. An admin who can
  //  grant themselves the section still cannot act in it.
  it('refuses a Compliance admin as firmly as a Storekeeper', () => {
    expect(mayDecide('compliance_admin')).toBe(false);
    expect(mayDecide('storekeeper')).toBe(false);
  });

  it('refuses an absent or unrecognised role', () => {
    expect(mayDecide(null)).toBe(false);
    expect(mayDecide(undefined)).toBe(false);
    expect(mayDecide('wizard' as WorkRole)).toBe(false);
  });
});

describe('offering the release control', () => {
  it('offers it only when the conditions are met', () => {
    expect(releaseOffered(readiness(true))).toBe(true);
    expect(releaseOffered(readiness(false))).toBe(false);
  });

  //  THE CASE THAT MATTERS. readiness is null while the conditions are
  //  being read and after a read that failed. "We do not know yet"
  //  must not render as "ready", or a lot whose blocking conditions
  //  simply had not arrived gets a release button.
  it('fails closed while the conditions are unknown', () => {
    expect(releaseOffered(null)).toBe(false);
    expect(releaseOffered(undefined)).toBe(false);
  });
});

describe('rejecting', () => {
  //  The asymmetry is deliberate: a lot can meet every condition and
  //  still be rejected on judgement. Gating rejection behind the same
  //  conditions as release would let the system say yes more easily
  //  than no.
  it('stays available on a lot that is ready to release', () => {
    expect(rejectOffered('qa_manager')).toBe(true);
    expect(releaseOffered(readiness(true))).toBe(true);
  });

  it('is still a QA decision', () => {
    expect(rejectOffered('storekeeper')).toBe(false);
    expect(rejectOffered('qc_analyst')).toBe(false);
  });

  it('needs a disposition and a reason, both', () => {
    expect(rejectComplete('destruction', 'Out of specification on assay')).toBe(true);
    expect(rejectComplete('', 'Out of specification on assay')).toBe(false);
    expect(rejectComplete('destruction', '')).toBe(false);
    expect(rejectComplete(null, null)).toBe(false);
  });

  //  A rejected lot that cannot be explained later is a finding, and a
  //  space bar is not an explanation.
  it('does not accept whitespace as a reason', () => {
    expect(rejectComplete('downgrade', '   ')).toBe(false);
    expect(rejectComplete('downgrade', '\n\t ')).toBe(false);
  });

  it('offers exactly the design’s three dispositions, in its order', () => {
    expect(DISPOSITIONS.map((d) => d.key))
      .toEqual(['return_to_supplier', 'destruction', 'downgrade']);
    expect(DISPOSITIONS.map((d) => d.label))
      .toEqual(['Return to supplier', 'Destruction', 'Downgrade']);
  });

  it('accepts every disposition it offers', () => {
    for (const d of DISPOSITIONS) {
      expect(rejectComplete(d.key as DispositionKey, 'a reason'), d.key).toBe(true);
    }
  });
});

describe('what the screen says afterwards', () => {
  //  The consequence, not the operation. "Released" tells a
  //  storekeeper nothing; "now available to production" tells them
  //  what changed for them.
  it('names the consequence of a release', () => {
    expect(decisionConfirmation('release', 'ML-2610-031'))
      .toBe('Lot ML-2610-031 released. It is now available to production.');
  });

  it('names the consequence of a rejection', () => {
    expect(decisionConfirmation('reject', 'ML-2610-044'))
      .toBe('Lot ML-2610-044 rejected. It stays blocked from issue.');
  });
});
