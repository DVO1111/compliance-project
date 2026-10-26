/**
 * Seed specs.
 *
 * EXAMPLES UNTIL THE REAL FILES EXIST. The column names, natural keys and
 * references all come from the data, and the Drive folder could not be read
 * from this environment — see docs/SEED_IMPORT.md. These two are written
 * against tables that do exist in the schema, so the pipeline can be
 * exercised end to end, but they are not claimed to match any file you have.
 *
 * Replace them once the files arrive. The validator will report a spec that
 * does not match its file rather than importing it wrongly.
 */
import type { SeedSpec } from '../src/lib/seed/seedValidation';

export const SPECS: SeedSpec[] = [
  {
    table: 'suppliers',
    required: ['code', 'name'],
    //  Natural key, never a uuid: a uuid in a spreadsheet is not stable
    //  across environments, and re-running an import keyed on one creates
    //  a second copy of everything.
    conflictTarget: ['code'],
    enums: {
      //  Read off suppliers_qualification_chk rather than chosen here, so
      //  the two cannot drift.
      qualification_status: ['qualified', 'pending', 'disqualified'],
    },
  },
  {
    table: 'materials',
    required: ['code', 'name'],
    conflictTarget: ['code'],
    references: [
      { column: 'supplier_code', table: 'suppliers', lookupColumn: 'code' },
    ],
  },
];
