/**
 * Seed-import validation.
 *
 * The pure half of the seed process: everything that decides whether a file
 * may be written, with no database and no filesystem, so the rules can be
 * tested directly rather than by importing something and seeing what
 * happened.
 *
 * ── WHY VALIDATION IS SEPARATE FROM IMPORT ────────────────────────────────
 *
 * A seed file is somebody else's spreadsheet. It arrives with trailing
 * spaces, two spellings of the same company, a foreign key typed by hand and
 * a column that was renamed last month. Writing it row by row and stopping
 * at the first failure leaves the database half-seeded — which on a
 * multi-tenant schema means a company with some of its materials and none of
 * its suppliers, and no record of which.
 *
 * So the whole file is checked before anything is written, and a file with
 * any error writes nothing at all.
 *
 * ── IDEMPOTENCE ───────────────────────────────────────────────────────────
 *
 * Every table is seeded through a NATURAL KEY — a code, a reference, a name
 * within a company — and never through a generated uuid. Running the import
 * twice must not create a second copy, and a uuid in a spreadsheet is not
 * stable across environments. `conflictTarget` on each spec is what makes
 * the second run an update instead of a duplicate.
 */

export type SeedValue = string | number | boolean | null;
export type SeedRow = Record<string, SeedValue>;

export interface SeedSpec {
  /** The table the file populates. */
  table: string;
  /** Columns that must be present and non-empty on every row. */
  required: string[];
  /**
   * The natural key. Re-running the import matches on these and updates,
   * rather than inserting a second row.
   */
  conflictTarget: string[];
  /**
   * Columns that name a row in another table, and where to look.
   * `column` holds the human-readable value in the file (a code, a name);
   * `lookup` says which table and column it must match.
   */
  references?: { column: string; table: string; lookupColumn: string }[];
  /** Columns whose value must be one of a fixed set. */
  enums?: Record<string, string[]>;
}

export interface SeedProblem {
  /** 1-based row number as it appears in the file, counting the header. */
  row: number | null;
  column: string | null;
  kind:
    | 'missing_column'
    | 'missing_value'
    | 'duplicate_in_file'
    | 'unknown_column'
    | 'invalid_enum'
    | 'unresolved_reference'
    | 'empty_file';
  detail: string;
}

export interface SeedReport {
  table: string;
  rows: number;
  problems: SeedProblem[];
  /** Rows that would be written if the import were applied. */
  writable: number;
}

/** Trim, and treat an empty string as absent — a spreadsheet's blank cell. */
export function normaliseValue(v: SeedValue): SeedValue {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  return t === '' ? null : t;
}

export function normaliseRow(row: SeedRow): SeedRow {
  const out: SeedRow = {};
  for (const [k, v] of Object.entries(row)) {
    //  Header names are normalised too: a spreadsheet's "Company Code"
    //  and the column `company_code` are the same column, and a seed run
    //  that failed on capitalisation would be rejecting good data.
    out[k.trim().toLowerCase().replace(/\s+/g, '_')] = normaliseValue(v);
  }
  return out;
}

/** The natural key of a row, as a comparable string. */
export function keyOf(row: SeedRow, conflictTarget: string[]): string {
  return conflictTarget
    .map((c) => String(row[c] ?? '').toLowerCase())
    .join('\u0000');
}

/**
 * Check one file against its spec.
 *
 * `knownValues` is what the database already holds for each referenced
 * lookup, as `"table.column" -> set of values`. It is passed in rather than
 * fetched so this stays pure and testable; the CLI fetches it.
 *
 * `existingKeys` is the set of natural keys already present in the target
 * table. It does NOT make a row a problem — a row that already exists is
 * the normal case on a second run — it only lets the report say how many
 * rows are new and how many are updates.
 */
export function validateSeedFile(
  spec: SeedSpec,
  rawRows: SeedRow[],
  knownValues: Record<string, Set<string>> = {},
  allowedColumns?: string[],
): SeedReport {
  const problems: SeedProblem[] = [];
  const rows = rawRows.map(normaliseRow);

  if (rows.length === 0) {
    problems.push({
      row: null, column: null, kind: 'empty_file',
      detail: `${spec.table}: the file has no rows`,
    });
    return { table: spec.table, rows: 0, problems, writable: 0 };
  }

  const present = new Set(Object.keys(rows[0]));

  for (const col of spec.required) {
    if (!present.has(col)) {
      problems.push({
        row: null, column: col, kind: 'missing_column',
        detail: `${spec.table}: required column "${col}" is not in the file`,
      });
    }
  }
  for (const col of spec.conflictTarget) {
    if (!present.has(col)) {
      problems.push({
        row: null, column: col, kind: 'missing_column',
        detail:
          `${spec.table}: the natural key needs "${col}", which is not in the `
          + 'file — without it the import cannot be re-run safely',
      });
    }
  }

  /*
   *  An unknown column is reported, not ignored. A file with `suplier_code`
   *  would otherwise import with that value silently dropped, and the
   *  result looks like a successful seed with missing relationships.
   */
  if (allowedColumns) {
    const allowed = new Set(allowedColumns);
    for (const col of present) {
      if (!allowed.has(col)) {
        problems.push({
          row: null, column: col, kind: 'unknown_column',
          detail:
            `${spec.table}: the file has a column "${col}" that the table does `
            + 'not have — check the spelling before importing',
        });
      }
    }
  }

  const seen = new Map<string, number>();
  const badRows = new Set<number>();

  rows.forEach((row, i) => {
    const lineNo = i + 2; // +1 for zero-index, +1 for the header line

    for (const col of spec.required) {
      if (present.has(col) && row[col] === null) {
        problems.push({
          row: lineNo, column: col, kind: 'missing_value',
          detail: `${spec.table} row ${lineNo}: "${col}" is required and is empty`,
        });
        badRows.add(i);
      }
    }

    for (const [col, allowed] of Object.entries(spec.enums ?? {})) {
      const v = row[col];
      if (v !== null && v !== undefined && !allowed.includes(String(v))) {
        problems.push({
          row: lineNo, column: col, kind: 'invalid_enum',
          detail:
            `${spec.table} row ${lineNo}: "${col}" is "${String(v)}", which is `
            + `not one of ${allowed.join(', ')}`,
        });
        badRows.add(i);
      }
    }

    for (const ref of spec.references ?? []) {
      const v = row[ref.column];
      if (v === null || v === undefined) continue;
      const known = knownValues[`${ref.table}.${ref.lookupColumn}`];
      //  No lookup set means the caller did not fetch it; that is a CLI
      //  bug, not a data problem, and must not be reported as clean.
      if (!known) {
        problems.push({
          row: lineNo, column: ref.column, kind: 'unresolved_reference',
          detail:
            `${spec.table} row ${lineNo}: cannot check "${ref.column}" because `
            + `${ref.table}.${ref.lookupColumn} was not loaded`,
        });
        badRows.add(i);
        continue;
      }
      if (!known.has(String(v).toLowerCase())) {
        problems.push({
          row: lineNo, column: ref.column, kind: 'unresolved_reference',
          detail:
            `${spec.table} row ${lineNo}: "${ref.column}" is "${String(v)}", `
            + `which does not exist in ${ref.table}.${ref.lookupColumn}`,
        });
        badRows.add(i);
      }
    }

    //  Duplicates WITHIN the file. Two rows with one natural key would
    //  upsert over each other, so the file silently decides which wins —
    //  which is exactly the kind of thing nobody notices until the data is
    //  wrong.
    if (spec.conflictTarget.every((c) => present.has(c))) {
      const k = keyOf(row, spec.conflictTarget);
      const first = seen.get(k);
      if (first !== undefined) {
        problems.push({
          row: lineNo, column: spec.conflictTarget.join('+'),
          kind: 'duplicate_in_file',
          detail:
            `${spec.table} row ${lineNo}: duplicates row ${first} on `
            + `${spec.conflictTarget.join(' + ')}`,
        });
        badRows.add(i);
      } else {
        seen.set(k, lineNo);
      }
    }
  });

  return {
    table: spec.table,
    rows: rows.length,
    problems,
    writable: rows.length - badRows.size,
  };
}

/**
 * A file is importable only when it has NO problems.
 *
 * Deliberately all-or-nothing. Importing the good rows of a bad file leaves
 * a partially-seeded tenant, and the rows that failed are exactly the ones
 * carrying the relationships — so what survives is a company with materials
 * and no suppliers, which looks like a successful import.
 */
export function isImportable(report: SeedReport): boolean {
  return report.problems.length === 0;
}

/**
 * The order files must be imported in.
 *
 * Derived from the specs' own references rather than written down
 * separately, so adding a spec cannot leave a stale list behind. Throws on
 * a cycle rather than picking an order, because a cycle means the data
 * cannot be loaded in one pass and somebody has to decide what to do.
 */
export function importOrder(specs: SeedSpec[]): string[] {
  const byTable = new Map(specs.map((s) => [s.table, s]));
  const state = new Map<string, 'visiting' | 'done'>();
  const order: string[] = [];

  function visit(table: string, trail: string[]): void {
    if (state.get(table) === 'done') return;
    if (state.get(table) === 'visiting') {
      throw new Error(
        `Seed specs contain a cycle: ${[...trail, table].join(' -> ')}`,
      );
    }
    const spec = byTable.get(table);
    if (!spec) return; // referenced table is not seeded; it must already exist
    state.set(table, 'visiting');
    for (const ref of spec.references ?? []) {
      visit(ref.table, [...trail, table]);
    }
    state.set(table, 'done');
    order.push(table);
  }

  for (const s of specs) visit(s.table, []);
  return order;
}
