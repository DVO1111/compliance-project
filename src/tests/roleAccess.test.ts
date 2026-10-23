/**
 * The grid in roleAccess.ts against PM-03 · "Roles — what each role can
 * open", cell by cell.
 *
 * These assertions are transcribed from the Figma frame rather than
 * from the module they test, which is the only way the test can catch
 * the module being wrong. If a cell here disagrees with the design,
 * fix the test against the design first and the module second.
 *
 * The matrix was read out of the file on 2026-10-22 from node 84:1077,
 * eleven columns in this order:
 *
 *   Suppliers · Goods receipt · Material lots · QC testing ·
 *   QA disposition · Batch records · Batch release · Deviation / CAPA ·
 *   CoA register · Traceability · Distribution
 *
 * Audit trail is NOT a column: the design annotates it "a separate
 * switch", and the module keeps it out of the grid for that reason.
 */

import { describe, it, expect } from 'vitest';
import {
  sectionAccess, canView, canAct, canOpenPage, resolveWorkRole,
  PM_SECTIONS, PM_SECTION_LABELS, PAGE_SECTION, ROLES_NOT_IN_PM03,
  type PmSection, type Access,
} from '../lib/access/roleAccess';
import { ROLE_LABELS, type WorkRole } from '../lib/access/permissionRequests';

/** PM-03, transcribed. 'a' = Act, 'v' = View, '-' = no access. */
const DESIGN: Record<string, string[]> = {
  //                      sup gds lot qc  dis bat rel dev coa trc dst
  procurement:           ['a','v','v','-','-','-','-','v','v','v','-'],
  storekeeper:           ['v','a','a','-','-','v','-','-','-','v','a'],
  qc_analyst:            ['-','v','v','a','-','v','-','a','v','v','-'],
  qa_officer:            ['v','v','v','v','a','v','v','a','a','v','v'],
  qa_manager:            ['a','v','v','v','a','v','a','a','a','a','v'],
  production_supervisor: ['-','-','v','-','-','a','-','a','-','v','-'],
  compliance_admin:      ['v','v','v','v','v','v','v','v','v','v','v'],
  management:            ['v','v','v','v','v','v','v','v','v','v','v'],
};

const EXPAND: Record<string, Access> = { a: 'act', v: 'view', '-': 'none' };

describe('the grid matches PM-03', () => {
  it('has the design’s eleven columns, in its order', () => {
    expect(PM_SECTIONS).toEqual([
      'suppliers', 'goods_receipt', 'material_lots', 'qc_testing',
      'qa_disposition', 'batch_records', 'batch_release', 'deviation_capa',
      'coa_register', 'traceability', 'distribution',
    ]);
  });

  it('does not carry audit trail as a column', () => {
    expect(PM_SECTIONS).not.toContain('audit_trail' as PmSection);
  });

  it('labels every column', () => {
    for (const s of PM_SECTIONS) expect(PM_SECTION_LABELS[s], s).toBeTruthy();
  });

  for (const [role, cells] of Object.entries(DESIGN)) {
    it(`gives ${role} exactly what the design gives it`, () => {
      expect(cells.length, 'transcription has eleven cells').toBe(PM_SECTIONS.length);
      PM_SECTIONS.forEach((section, i) => {
        expect(sectionAccess(role as WorkRole, section), `${role}/${section}`)
          .toBe(EXPAND[cells[i]!]);
      });
    });
  }
});

describe('the restrictions that make a restricted role restricted', () => {
  //  These are the four segregation statements printed under PM-03's
  //  grid. Asserted directly, because they are the rules a reader of
  //  the screen would quote, and a regression in any of them is a
  //  compliance failure rather than a display bug.
  it('a Storekeeper cannot record QC results or make dispositions', () => {
    expect(canView('storekeeper', 'qc_testing')).toBe(false);
    expect(canView('storekeeper', 'qa_disposition')).toBe(false);
  });

  it('a QC Analyst cannot make dispositions or release', () => {
    expect(canAct('qc_analyst', 'qa_disposition')).toBe(false);
    expect(canView('qc_analyst', 'qa_disposition')).toBe(false);
    expect(canAct('qc_analyst', 'batch_release')).toBe(false);
  });

  it('production cannot approve lots or release', () => {
    expect(canAct('production_supervisor', 'material_lots')).toBe(false);
    expect(canAct('production_supervisor', 'batch_release')).toBe(false);
  });

  it('a Compliance admin can see everything and act on nothing', () => {
    for (const s of PM_SECTIONS) {
      expect(canView('compliance_admin', s), s).toBe(true);
      expect(canAct('compliance_admin', s), s).toBe(false);
    }
  });

  it('only the QA Manager may act on batch release', () => {
    const actors = (Object.keys(DESIGN) as WorkRole[])
      .filter((r) => canAct(r, 'batch_release'));
    expect(actors).toEqual(['qa_manager']);
  });

  it('only QA Officer and QA Manager may act on QA disposition', () => {
    const actors = (Object.keys(DESIGN) as WorkRole[])
      .filter((r) => canAct(r, 'qa_disposition'));
    expect(new Set(actors)).toEqual(new Set(['qa_officer', 'qa_manager']));
  });
});

describe('a role the design does not tabulate', () => {
  //  Failing closed is the point. The alternative — defaulting an
  //  unknown role to "view everything" — hands a section to somebody
  //  the design never considered, and does it silently.
  it('holds nothing rather than everything', () => {
    for (const role of ROLES_NOT_IN_PM03) {
      for (const s of PM_SECTIONS) {
        expect(sectionAccess(role, s), `${role}/${s}`).toBe('none');
      }
    }
  });

  it('treats an absent or unknown role as holding nothing', () => {
    expect(sectionAccess(null, 'batch_release')).toBe('none');
    expect(sectionAccess(undefined, 'batch_release')).toBe('none');
    expect(sectionAccess('not_a_role' as WorkRole, 'batch_release')).toBe('none');
  });
});

describe('pages map to the sections that govern them', () => {
  it('routes each tabulated page to its own column', () => {
    expect(PAGE_SECTION['materials']).toBe('material_lots');
    expect(PAGE_SECTION['batch-execution']).toBe('batch_records');
    expect(PAGE_SECTION['batch-release']).toBe('batch_release');
    expect(PAGE_SECTION['coa']).toBe('coa_register');
    expect(PAGE_SECTION['supplier-qualification']).toBe('suppliers');
  });

  it('puts deviations and CAPA under the one column the design draws', () => {
    expect(PAGE_SECTION['deviations']).toBe('deviation_capa');
    expect(PAGE_SECTION['capa-management']).toBe('deviation_capa');
  });

  it('lets a Storekeeper open goods receipt and refuses QC testing', () => {
    expect(canOpenPage('storekeeper', 'goods-receipt')).toBe(true);
    expect(canOpenPage('storekeeper', 'qc-testing')).toBe(false);
    expect(canOpenPage('storekeeper', 'qa-disposition')).toBe(false);
    expect(canOpenPage('storekeeper', 'batch-release')).toBe(false);
  });

  it('lets a QA Manager open every page the grid governs', () => {
    for (const page of Object.keys(PAGE_SECTION)) {
      expect(canOpenPage('qa_manager', page), page).toBe(true);
    }
  });

  //  A page outside the grid is the caller's decision, not this
  //  module's. Answering false here would silently remove pages the
  //  design never ruled on.
  it('does not rule on a page the design does not tabulate', () => {
    expect(canOpenPage('storekeeper', 'instruments')).toBe(true);
    expect(canOpenPage('storekeeper', 'sop-library')).toBe(true);
  });
});

describe('resolving the role off a profile', () => {
  it('prefers the workspace job over the account type', () => {
    expect(resolveWorkRole({ company_role: 'storekeeper', role: 'admin' }))
      .toBe('storekeeper');
  });

  it('reads the spellings that exist on older rows', () => {
    expect(resolveWorkRole({ role: 'QA Manager' })).toBe('qa_manager');
    expect(resolveWorkRole({ role: 'quality_manager' })).toBe('qa_manager');
    expect(resolveWorkRole({ company_role: 'Store-Keeper' })).toBe('storekeeper');
    expect(resolveWorkRole({ role: 'admin' })).toBe('compliance_admin');
  });

  it('returns null rather than guessing', () => {
    expect(resolveWorkRole({})).toBeNull();
    expect(resolveWorkRole(null)).toBeNull();
    expect(resolveWorkRole({ role: 'wizard' })).toBeNull();
  });

  //  A null role holds nothing, so an unrecognised job title restricts
  //  rather than exposes.
  it('leaves an unrecognised job title holding nothing', () => {
    const r = resolveWorkRole({ role: 'wizard' });
    for (const s of PM_SECTIONS) expect(sectionAccess(r, s), s).toBe('none');
  });
});

describe('every role in the grid is nameable on screen', () => {
  it('has a label for each', () => {
    for (const role of Object.keys(DESIGN) as WorkRole[]) {
      expect(ROLE_LABELS[role], role).toBeTruthy();
    }
  });
});
