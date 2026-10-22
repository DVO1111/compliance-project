/**
 * PM-03's grid, written down twice, compared here.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * The grid lives in two places and has to: `src/lib/access/roleAccess.ts`
 * decides what a screen draws, and `section_permissions` (seeded by
 * 20261106000000) decides what the database allows. Neither can read
 * the other at runtime — one is TypeScript in a browser, the other is
 * rows in Postgres — so the only way they stay the same grid is a test
 * that reads both and compares them.
 *
 * ── AND IT IS NOT HYPOTHETICAL ──
 *
 * They were already different. The SQL seed gave the QA Officer `act`
 * on `batch_release` and on `distribution`; roleAccess.ts has `view`
 * for both. Two cells, transposed while re-typing the same grid into a
 * second language — the exact failure the tuple-per-role layout was
 * chosen to make visible, which happened anyway on the way across.
 *
 * It was found by rendering the Dispatch page and noticing a QA
 * Officer was shown a read-only notice where the seeded grid said they
 * could act. A test comparing the two would have named it in a second.
 *
 * ── THE SQL IS READ, NOT RESTATED ──
 *
 * The expected values are parsed out of the migration file itself. A
 * third copy of the grid in this file would be a third thing to keep
 * in step, and the first one to be forgotten.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PM_SECTIONS, sectionAccess, type PmSection,
} from '../lib/access/roleAccess';
import type { WorkRole } from '../lib/access/permissionRequests';

const MIGRATION = join(
  process.cwd(), 'supabase', 'migrations',
  '20261106000000_batch_execution_section_authorisation.sql',
);

/** The roles the seed tabulates, in the design's own row order. */
const ROLES: WorkRole[] = [
  'procurement', 'storekeeper', 'qc_analyst', 'qa_officer', 'qa_manager',
  'production_supervisor', 'compliance_admin', 'management',
] as WorkRole[];

/**
 * The seeded grid, lifted out of the migration.
 *
 * Each role is one `('role', ARRAY[...])` row inside the WITH clause.
 */
function seededGrid(): Record<string, string[]> {
  const sql = readFileSync(MIGRATION, 'utf8');
  const out: Record<string, string[]> = {};
  const rowPattern = /\('([a-z_]+)',\s*ARRAY\[([^\]]+)\]\)/g;
  for (const m of sql.matchAll(rowPattern)) {
    const role = m[1]!;
    const cells = [...m[2]!.matchAll(/'([a-z]+)'/g)].map((c) => c[1]!);
    out[role] = cells;
  }
  return out;
}

/** The column order the seed's `cols` CTE declares. */
function seededSections(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8');
  const block = sql.slice(sql.indexOf('), cols(section, ord) AS (VALUES'));
  return [...block.matchAll(/\('([a-z_]+)',\s*\d+\)/g)].map((m) => m[1]!);
}

const SEEDED = seededGrid();
const SEEDED_SECTIONS = seededSections();

describe('the migration reader itself', () => {
  //  If these fail the comparison below is vacuous — it would pass by
  //  finding nothing to compare.
  it('found all eight roles in the seed', () => {
    expect(Object.keys(SEEDED).sort()).toEqual([...ROLES].sort());
  });

  it('found eleven cells for every role', () => {
    for (const role of ROLES) {
      expect(SEEDED[role]?.length, `${role} row length`).toBe(11);
    }
  });

  it('found the column order the seed uses', () => {
    expect(SEEDED_SECTIONS).toHaveLength(11);
  });
});

describe('the SQL grid and the TypeScript grid are the same grid', () => {
  //  COLUMN ORDER FIRST. If the two disagree about which column is
  //  which, every cell comparison below is comparing the wrong pair and
  //  could pass by coincidence.
  it('agree on the column order', () => {
    expect(SEEDED_SECTIONS).toEqual(PM_SECTIONS);
  });

  it.each(ROLES.map((r) => [r] as const))('%s matches cell for cell', (role) => {
    const seeded = SEEDED[role]!;
    const fromCode = PM_SECTIONS.map((s) => sectionAccess(role, s));
    //  Compared as one string per role so a failure prints the whole
    //  row rather than one cell, which is how a transposition is
    //  recognised as a transposition.
    expect(seeded.join(' '), `seeded ${role}`).toBe(fromCode.join(' '));
  });

  //  The specific cells that were wrong, named so a reader of a future
  //  failure knows this has happened before and where.
  it('agree on the two cells that were once transposed', () => {
    for (const [role, section] of [
      ['qa_officer', 'batch_release'],
      ['qa_officer', 'distribution'],
    ] as const) {
      const idx = PM_SECTIONS.indexOf(section as PmSection);
      expect(SEEDED[role]![idx], `${role} / ${section}`)
        .toBe(sectionAccess(role as WorkRole, section as PmSection));
    }
  });

  //  Every cell is one of the three states PM-03 draws. A typo like
  //  'veiw' would otherwise pass the comparison only if it appeared in
  //  both, and fail confusingly if it did not.
  it('use only act, view and none', () => {
    for (const role of ROLES) {
      for (const cell of SEEDED[role]!) {
        expect(['act', 'view', 'none'], `${role} has ${cell}`).toContain(cell);
      }
    }
  });
});
