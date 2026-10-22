/**
 * The permissions screen shows PM-03's grid — including its third
 * state.
 *
 * The matrix on this page used to be built as
 * `forbidden.has(s) ? 'view' : 'act'`, which cannot produce "no
 * access". Every role therefore read as acting or viewing on every
 * section, and the one fact the screen exists to show — that a
 * Storekeeper has none at all on QC testing — was absent from it.
 *
 * These assertions count cells against the design rather than against
 * the module that builds them, so the arithmetic has to come out.
 */

import { describe, it, expect } from 'vitest';
import { sectionAccess, PM_SECTIONS } from '../lib/access/roleAccess';
import {
  SECTION_LABELS, LEVEL_MEANING, canBeRequested,
  type AccessSection, type WorkRole,
} from '../lib/access/permissionRequests';

/** The eight rows PM-03 draws, in its order. */
const ROLES: WorkRole[] = [
  'procurement', 'storekeeper', 'qc_analyst', 'qa_officer', 'qa_manager',
  'production_supervisor', 'compliance_admin', 'management',
];

describe('every PM-03 column exists in the request catalogue', () => {
  //  A section the catalogue does not know cannot be drawn on the
  //  matrix and cannot be asked for. Five of PM-03's eleven were
  //  missing, so a storekeeper looking at a locked CoA register had no
  //  way to request it.
  it('can label all eleven', () => {
    for (const s of PM_SECTIONS) {
      expect(SECTION_LABELS[s as unknown as AccessSection], s).toBeTruthy();
    }
  });

  it('tells somebody what View and Act would let them do', () => {
    for (const s of PM_SECTIONS) {
      const m = LEVEL_MEANING[s as unknown as AccessSection];
      expect(m?.view, `${s} view`).toBeTruthy();
      expect(m?.act, `${s} act`).toBeTruthy();
    }
  });

  it('lets the five that were added be requested', () => {
    for (const s of ['suppliers', 'goods_receipt', 'coa_register', 'traceability', 'distribution']) {
      expect(canBeRequested(s as AccessSection), s).toBe(true);
    }
  });
});

describe('the grid the matrix renders', () => {
  const cells = ROLES.flatMap((r) =>
    PM_SECTIONS.map((s) => sectionAccess(r, s)));

  it('covers eight roles by eleven sections', () => {
    expect(cells).toHaveLength(88);
  });

  //  Transcribed from PM-03 and added up by hand: 17 Act, 50 View, 21
  //  with no access. If a cell is flipped anywhere, one of these three
  //  moves and the test says which direction.
  it('has the design’s totals', () => {
    const tally = (g: string) => cells.filter((c) => c === g).length;
    expect(tally('act'), 'Act cells').toBe(17);
    expect(tally('view'), 'View cells').toBe(50);
    expect(tally('none'), 'no-access cells').toBe(21);
  });

  it('puts no-access cells only where the design has them', () => {
    const none = ROLES.filter((r) => PM_SECTIONS.some((s) => sectionAccess(r, s) === 'none'));
    //  QA Officer, QA Manager, Compliance admin and Management have a
    //  full row; everybody else is withheld something.
    expect(new Set(none)).toEqual(new Set([
      'procurement', 'storekeeper', 'qc_analyst', 'production_supervisor',
    ]));
  });

  it('gives a Storekeeper five sections they cannot open', () => {
    const closed = PM_SECTIONS.filter((s) => sectionAccess('storekeeper', s) === 'none');
    expect(closed).toEqual([
      'qc_testing', 'qa_disposition', 'batch_release', 'deviation_capa', 'coa_register',
    ]);
  });
});
