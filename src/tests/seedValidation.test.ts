/**
 * Seed-import validation.
 *
 * Task 5 asks that seed validation "catches invalid foreign keys and
 * duplicate records", which is what the two headline blocks below assert.
 * The rest covers the cases a real spreadsheet produces: trailing spaces,
 * a renamed header, a blank cell that is not the same as a zero, and a
 * second run that must not duplicate the first.
 */

import { describe, it, expect } from 'vitest';
import {
  validateSeedFile, isImportable, importOrder, normaliseRow, keyOf,
  type SeedSpec, type SeedRow,
} from '../lib/seed/seedValidation';

const SUPPLIERS: SeedSpec = {
  table: 'suppliers',
  required: ['code', 'name'],
  conflictTarget: ['code'],
  enums: { qualification_status: ['qualified', 'pending', 'disqualified'] },
};

const MATERIALS: SeedSpec = {
  table: 'materials',
  required: ['code', 'name'],
  conflictTarget: ['code'],
  references: [{ column: 'supplier_code', table: 'suppliers', lookupColumn: 'code' }],
};

const KNOWN = { 'suppliers.code': new Set(['sup-001', 'sup-002']) };

function rows(...r: SeedRow[]): SeedRow[] { return r; }

describe('invalid foreign keys', () => {
  it('catches a reference that does not exist', () => {
    const report = validateSeedFile(MATERIALS, rows(
      { code: 'MAT-1', name: 'Lactose', supplier_code: 'SUP-001' },
      { code: 'MAT-2', name: 'Starch', supplier_code: 'SUP-999' },
    ), KNOWN);

    expect(isImportable(report)).toBe(false);
    const fk = report.problems.filter((p) => p.kind === 'unresolved_reference');
    expect(fk).toHaveLength(1);
    expect(fk[0].row).toBe(3);
    expect(fk[0].detail).toMatch(/SUP-999/);
  });

  it('matches a reference case-insensitively, as a spreadsheet will not be consistent', () => {
    const report = validateSeedFile(MATERIALS, rows(
      { code: 'MAT-1', name: 'Lactose', supplier_code: 'sup-001' },
      { code: 'MAT-2', name: 'Starch', supplier_code: 'SUP-002' },
    ), KNOWN);
    expect(isImportable(report)).toBe(true);
  });

  it('treats an unloaded lookup as a problem, not as clean', () => {
    /*
     *  The dangerous direction. If a missing lookup set were read as "no
     *  references to check", a CLI bug would turn into a silent import of
     *  rows whose relationships were never verified.
     */
    const report = validateSeedFile(MATERIALS, rows(
      { code: 'MAT-1', name: 'Lactose', supplier_code: 'SUP-001' },
    ), {});
    expect(isImportable(report)).toBe(false);
    expect(report.problems[0].detail).toMatch(/was not loaded/);
  });

  it('allows a blank reference, which means "not linked" rather than "wrong"', () => {
    const report = validateSeedFile(MATERIALS, rows(
      { code: 'MAT-1', name: 'Lactose', supplier_code: '' },
    ), KNOWN);
    expect(isImportable(report)).toBe(true);
  });
});

describe('duplicate records', () => {
  it('catches two rows sharing a natural key', () => {
    const report = validateSeedFile(SUPPLIERS, rows(
      { code: 'SUP-001', name: 'Alpha Chemicals' },
      { code: 'SUP-002', name: 'Beta Supplies' },
      { code: 'SUP-001', name: 'Alpha Chemicals Ltd' },
    ));
    const dups = report.problems.filter((p) => p.kind === 'duplicate_in_file');
    expect(dups).toHaveLength(1);
    expect(dups[0].row).toBe(4);
    expect(dups[0].detail).toMatch(/duplicates row 2/);
  });

  it('catches duplicates that differ only by case or spacing', () => {
    //  "SUP-001" and " sup-001 " are the same supplier, and upserting both
    //  means the file silently decides which name wins.
    const report = validateSeedFile(SUPPLIERS, rows(
      { code: 'SUP-001', name: 'Alpha' },
      { code: ' sup-001 ', name: 'Alpha Chemicals' },
    ));
    expect(report.problems.some((p) => p.kind === 'duplicate_in_file')).toBe(true);
  });

  it('refuses a file with no natural key, because it cannot be re-run', () => {
    const report = validateSeedFile(SUPPLIERS, rows({ name: 'Alpha' }));
    expect(report.problems.some(
      (p) => p.kind === 'missing_column' && p.column === 'code',
    )).toBe(true);
  });
});

describe('required values and vocabularies', () => {
  it('catches a missing required column', () => {
    const report = validateSeedFile(SUPPLIERS, rows({ code: 'SUP-001' }));
    expect(report.problems.some(
      (p) => p.kind === 'missing_column' && p.column === 'name',
    )).toBe(true);
  });

  it('catches a blank cell in a required column', () => {
    const report = validateSeedFile(SUPPLIERS, rows(
      { code: 'SUP-001', name: 'Alpha' },
      { code: 'SUP-002', name: '   ' },
    ));
    const missing = report.problems.filter((p) => p.kind === 'missing_value');
    expect(missing).toHaveLength(1);
    expect(missing[0].row).toBe(3);
  });

  it('catches a value outside a fixed vocabulary', () => {
    const report = validateSeedFile(SUPPLIERS, rows(
      { code: 'SUP-001', name: 'Alpha', qualification_status: 'approved' },
    ));
    const bad = report.problems.filter((p) => p.kind === 'invalid_enum');
    expect(bad).toHaveLength(1);
    expect(bad[0].detail).toMatch(/qualified, pending, disqualified/);
  });

  it('reports a misspelled column instead of dropping it', () => {
    /*
     *  Without this, a file carrying `suplier_code` imports "successfully"
     *  with every relationship missing — which looks exactly like a clean
     *  seed until somebody opens the app.
     */
    const report = validateSeedFile(
      SUPPLIERS,
      rows({ code: 'SUP-001', name: 'Alpha', suplier_code: 'X' }),
      {},
      ['code', 'name', 'qualification_status'],
    );
    expect(report.problems.some(
      (p) => p.kind === 'unknown_column' && p.column === 'suplier_code',
    )).toBe(true);
  });

  it('refuses an empty file rather than reporting a clean import of nothing', () => {
    const report = validateSeedFile(SUPPLIERS, []);
    expect(isImportable(report)).toBe(false);
    expect(report.problems[0].kind).toBe('empty_file');
  });
});

describe('a bad file writes nothing at all', () => {
  it('is not importable when any row is bad', () => {
    /*
     *  Importing the good rows of a bad file leaves a partially-seeded
     *  tenant, and the rows that fail are the ones carrying relationships.
     *  What survives looks like a successful import.
     */
    const report = validateSeedFile(MATERIALS, rows(
      { code: 'MAT-1', name: 'Lactose', supplier_code: 'SUP-001' },
      { code: 'MAT-2', name: 'Starch', supplier_code: 'SUP-999' },
      { code: 'MAT-3', name: 'Talc', supplier_code: 'SUP-002' },
    ), KNOWN);

    expect(isImportable(report)).toBe(false);
    //  Still reported, so the operator can see how much of the file is fine.
    expect(report.writable).toBe(2);
    expect(report.rows).toBe(3);
  });
});

describe('normalisation', () => {
  it('trims values and treats a blank cell as absent, not as empty text', () => {
    const r = normaliseRow({ code: '  SUP-1  ', note: '   ', qty: 0 });
    expect(r.code).toBe('SUP-1');
    expect(r.note).toBeNull();
    //  Zero is a value. Treating it as blank would turn a real quantity
    //  into a missing one.
    expect(r.qty).toBe(0);
  });

  it('normalises a spreadsheet header to a column name', () => {
    const r = normaliseRow({ 'Supplier Code': 'SUP-1', ' Name ': 'Alpha' });
    expect(r.supplier_code).toBe('SUP-1');
    expect(r.name).toBe('Alpha');
  });

  it('builds a case-insensitive natural key', () => {
    expect(keyOf({ code: 'SUP-1' }, ['code']))
      .toBe(keyOf({ code: 'sup-1' }, ['code']));
  });
});

describe('import order', () => {
  it('puts a referenced table before the table that references it', () => {
    const order = importOrder([MATERIALS, SUPPLIERS]);
    expect(order.indexOf('suppliers')).toBeLessThan(order.indexOf('materials'));
  });

  it('refuses a cycle rather than choosing an order', () => {
    //  A cycle means the data cannot be loaded in one pass. Picking an
    //  order would just move the failure to run time.
    const a: SeedSpec = {
      table: 'a', required: [], conflictTarget: ['id'],
      references: [{ column: 'b_id', table: 'b', lookupColumn: 'id' }],
    };
    const b: SeedSpec = {
      table: 'b', required: [], conflictTarget: ['id'],
      references: [{ column: 'a_id', table: 'a', lookupColumn: 'id' }],
    };
    expect(() => importOrder([a, b])).toThrow(/cycle/i);
  });

  it('tolerates a reference to a table that is not seeded', () => {
    //  `companies` already exists in the database; a seed file may point at
    //  it without a spec of its own.
    const spec: SeedSpec = {
      table: 'sites', required: ['name'], conflictTarget: ['name'],
      references: [{ column: 'company_name', table: 'companies', lookupColumn: 'name' }],
    };
    expect(importOrder([spec])).toEqual(['sites']);
  });
});
