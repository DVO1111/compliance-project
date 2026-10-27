/**
 * Build the adapted demonstration seed.
 *
 *   npx tsx scripts/seed/demo/build.ts \
 *     --seed /path/to/generate.py/out/seed.json \
 *     --out  /path/to/adapted
 *
 * Reads the CANONICAL generator output — `seed.json`, produced by
 * `seed/incoming/source/generate.py` — applies `mapping.ts`, and writes
 * SQL that this application's schema will actually accept, plus a report
 * of everything it did not emit and why.
 *
 * The workbooks are not read. They are the same 882 rows in another
 * format, and reading both is how a dataset gets loaded twice.
 *
 * ── WHAT IT WILL NOT DO ───────────────────────────────────────────────────
 *
 * It drops no row silently. A source table that is not emitted appears in
 * the report with its class and its reason, and a source table that is not
 * classified at all is a hard error — `mapping.ts` has to have an opinion
 * about every one of the 42.
 *
 * It invents no value. Where the application requires a column the source
 * does not supply, the value comes from `constants` in the mapping, where
 * it is visible and reviewable, or the row is not emitted.
 *
 * It emits no signature. See the `electronic_signatures` entry in
 * mapping.ts: a hash computed under a different convention would pass the
 * application's CHECK and fail its verification.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MAPPINGS, MAPPABLE, unclassified, type TableMapping } from './mapping';

type Row = Record<string, unknown>;

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  console.error(`--${name} is required`);
  process.exit(2);
}

/** SQL literal. Dates and timestamps arrive from the generator as ISO text. */
function lit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  //  Everything else is written as text and left for Postgres to coerce to
  //  the column's own type. Guessing the type here is how a date becomes a
  //  string and a numeric becomes an error.
  return `'${String(v).replace(/'/g, "''")}'`;
}

interface Emitted { table: string; rows: number; statements: string[]; ids: string[] }

function emit(
  m: TableMapping,
  rows: Row[],
  problems: string[],
  allTables: Record<string, Row[]>,
  /** ids this build has already emitted, per SOURCE table name. */
  emittedIds: Record<string, Set<string>>,
): Emitted {
  const statements: string[] = [];
  const ids: string[] = [];
  const fields = m.fields ?? {};

  for (const [i, row] of rows.entries()) {
    if (m.only && row[m.only.field] !== m.only.equals) {
      problems.push(
        `${m.source} row ${i + 1}: ${m.only.field} = `
        + `"${String(row[m.only.field])}", not "${m.only.equals}" — not emitted`,
      );
      continue;
    }

    /*
     *  A foreign key that points at a row this build did not emit.
     *
     *  Emitting it anyway would abort the whole import on a constraint
     *  violation partway through, so the row is dropped — but reported with
     *  the parent it wanted, because it is a consequence of an earlier
     *  decision and not a trim for convenience. This is why `order`
     *  matters: the parent has to have been emitted already.
     */
    let orphaned = false;
    for (const req of m.requires ?? []) {
      const parent = row[req.field];
      const known = emittedIds[req.from];
      if (known === undefined) {
        problems.push(
          `${m.source} row ${i + 1}: cannot check ${req.field} — `
          + `${req.from} is emitted after this table, so its order is wrong`,
        );
        orphaned = true;
        break;
      }
      if (typeof parent !== 'string' || !known.has(parent)) {
        problems.push(
          `${m.source} row ${i + 1}: ${req.field} = ${String(parent)} is not a `
          + `${req.from} row this seed emits — not emitted`,
        );
        orphaned = true;
        break;
      }
    }
    if (orphaned) continue;
    const out: Record<string, unknown> = {};

    for (const [src, tgt] of Object.entries(fields)) {
      if (!(src in row)) continue;
      let v = row[src];
      const table = m.enums?.[tgt];
      if (table && typeof v === 'string') {
        //  An unmapped enum value is reported, never passed through to be
        //  refused by a CHECK halfway through a load.
        if (!(v in table)) {
          problems.push(
            `${m.source} row ${i + 1}: ${tgt} = "${v}" has no mapping to the `
            + `application's vocabulary (${Object.values(table).join(', ')})`,
          );
          continue;
        }
        v = table[v];
      }
      out[tgt] = v;
    }

    //  Values the application denormalises that the source keeps on a
    //  related row. Resolved from the source's own data, never invented.
    for (const [tgt, d] of Object.entries(m.derives ?? {})) {
      const key = row[d.via];
      if (key === null || key === undefined) {
        problems.push(`${m.source} row ${i + 1}: cannot derive ${tgt} — ${d.via} is empty`);
        continue;
      }
      const related = (allTables[d.from] ?? []).find((r) => r.id === key);
      if (!related) {
        problems.push(
          `${m.source} row ${i + 1}: cannot derive ${tgt} — no ${d.from} row `
          + `with id ${String(key)}`,
        );
        continue;
      }
      out[tgt] = related[d.take];
    }

    //  Computed values, from the source row's own columns. Run before
    //  constants so a constant still only ever fills a gap, and after
    //  `fields` so a computed column can deliberately replace a mapped one.
    for (const [tgt, fn] of Object.entries(m.computed ?? {})) {
      const v = fn(row, allTables);
      if (v === undefined) {
        problems.push(`${m.source} row ${i + 1}: ${tgt} could not be computed`);
        continue;
      }
      out[tgt] = v;
    }

    for (const [k, v] of Object.entries(m.constants ?? {})) {
      //  Constants never overwrite a mapped value; they fill a gap.
      if (!(k in out)) out[k] = v;
    }

    if (Object.keys(out).length === 0) {
      problems.push(`${m.source} row ${i + 1}: nothing mapped, row not emitted`);
      continue;
    }

    const cols = Object.keys(out);
    if (typeof out.id === 'string') ids.push(out.id);
    statements.push(
      `INSERT INTO ${m.target} (${cols.join(', ')}) VALUES `
      + `(${cols.map((c) => lit(out[c])).join(', ')}) ON CONFLICT (id) DO NOTHING;`,
    );
  }

  return { table: m.target!, rows: statements.length, statements, ids };
}

function main(): void {
  const seedPath = arg('seed');
  const outDir = arg('out');
  if (!existsSync(seedPath)) {
    console.error(`No seed.json at ${seedPath}. Run the package generator first.`);
    process.exit(2);
  }

  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as {
    anchor_date: string;
    users: Row[];
    tables: Record<string, Row[]>;
  };

  const sourceTables = Object.keys(seed.tables);
  const missing = unclassified(sourceTables);
  if (missing.length > 0) {
    //  A source table nobody has an opinion about would otherwise vanish.
    console.error(
      `These source tables are not classified in mapping.ts:\n  ${missing.join('\n  ')}`,
    );
    process.exit(1);
  }

  const problems: string[] = [];
  const emitted: Emitted[] = [];

  //  Keyed by SOURCE table, so `requires` can ask "did we emit the parent".
  //  Filled as we go, which is what makes `order` load-bearing rather than
  //  cosmetic.
  const emittedIds: Record<string, Set<string>> = {};

  for (const m of MAPPABLE) {
    const rows = seed.tables[m.source] ?? [];
    if (rows.length === 0) continue;
    const e = emit(m, rows, problems, seed.tables, emittedIds);
    emittedIds[m.source] = new Set(e.ids);
    emitted.push(e);
  }

  mkdirSync(outDir, { recursive: true });

  const totalRows = emitted.reduce((n, e) => n + e.rows, 0);
  const sourceRows = sourceTables.reduce((n, t) => n + seed.tables[t].length, 0);

  const sql = [
    '-- Criateur demonstration seed, ADAPTED to the application schema.',
    '-- Generated by scripts/seed/demo/build.ts from the package generator.',
    '-- Do not edit by hand; rebuild instead.',
    `-- Source anchor: ${seed.anchor_date}`,
    `-- ${totalRows} rows across ${emitted.length} tables `
      + `(source had ${sourceRows} rows across ${sourceTables.length}).`,
    '--',
    '-- Wrapped in one transaction: a failure anywhere leaves nothing behind.',
    '-- Every statement is ON CONFLICT (id) DO NOTHING, so a repeated run is',
    '-- a no-op rather than a duplicate.',
    '',
    'BEGIN;',
    '',
    "DO $$ BEGIN",
    "  IF COALESCE(current_setting('criateur.environment', true), '') <> 'demo' THEN",
    "    RAISE EXCEPTION 'Refusing to run: set criateur.environment = ''demo''.';",
    '  END IF;',
    'END $$;',
    '',
  ];

  for (const e of emitted) {
    sql.push(`-- ${e.table}: ${e.rows} row(s)`);
    sql.push(...e.statements, '');
  }
  sql.push('COMMIT;', '');

  /*
   *  THE REGISTRY, and why the reset is built from it.
   *
   *  The package's own reset keys on companies.is_demo, which this
   *  application does not have. Rather than add a demo flag to a
   *  production table, the importer records exactly which ids it wrote and
   *  the reset deletes exactly those — so it cannot touch a company, user
   *  or record the seed did not create, whatever else is in the database.
   *
   *  The registry lives only in the demo database; it is not a repository
   *  migration, because nothing in the application needs it.
   */
  sql.push(
    '-- Registry: exactly what this seed owns, so the reset can be exact.',
    'BEGIN;',
    'CREATE TABLE IF NOT EXISTS demo_seed_records (',
    '  table_name text NOT NULL,',
    '  record_id  uuid NOT NULL,',
    '  seeded_at  timestamptz NOT NULL DEFAULT now(),',
    '  PRIMARY KEY (table_name, record_id)',
    ');',
    '',
  );
  for (const e of emitted) {
    if (e.ids.length === 0) continue;
    sql.push(
      `INSERT INTO demo_seed_records (table_name, record_id) VALUES`,
      e.ids.map((id) => `  ('${e.table}', '${id}')`).join(',\n') + ' ON CONFLICT DO NOTHING;',
      '',
    );
  }
  sql.push('COMMIT;', '');

  writeFileSync(join(outDir, '10_demo_adapted.sql'), sql.join('\n'));

  //  Reset: reverse insertion order, and only ids the registry owns.
  const reset = [
    '-- Criateur demonstration seed — RESET.',
    '-- Deletes ONLY the records this seed created, by id, from the registry.',
    '-- It cannot remove a company, user or record the seed did not write.',
    '--',
    '-- Generated by scripts/seed/demo/build.ts. Do not edit by hand.',
    '',
    'BEGIN;',
    '',
    "DO $$ BEGIN",
    "  IF COALESCE(current_setting('criateur.environment', true), '') <> 'demo' THEN",
    "    RAISE EXCEPTION 'Refusing to run: set criateur.environment = ''demo''.';",
    '  END IF;',
    "  IF to_regclass('public.demo_seed_records') IS NULL THEN",
    "    RAISE EXCEPTION 'Refusing to run: no demo_seed_records registry in this database.';",
    '  END IF;',
    'END $$;',
    '',
  ];
  for (const e of [...emitted].reverse()) {
    const m = MAPPABLE.find((x) => x.target === e.table);
    if (m?.resetVia === 'cascade') {
      //  Deliberately no DELETE. See `resetVia` in mapping.ts: deleting
      //  these before their parent is refused outright on an approved
      //  formula, and the parent's own delete removes them.
      reset.push(
        `-- ${e.table}: no DELETE — removed by the cascade from its parent.`,
        `--   Deleting it directly is refused once the formula is approved`,
        `--   (MASTER_FORMULA_APPROVED_FROZEN). ${e.rows} row(s) are still`,
        '--   registered, and the registry is cleared below.',
      );
      continue;
    }
    reset.push(
      `DELETE FROM ${e.table} WHERE id IN (`,
      `  SELECT record_id FROM demo_seed_records WHERE table_name = '${e.table}');`,
    );
  }
  reset.push('', 'DELETE FROM demo_seed_records;', '', 'COMMIT;', '');
  writeFileSync(join(outDir, '30_demo_reset.sql'), reset.join('\n'));

  //  The report is the deliverable, not a by-product: it is where every
  //  unemitted table has to account for itself.
  const report: string[] = [
    '# Adapted demonstration seed — build report', '',
    `Source: \`${seedPath}\`, anchor ${seed.anchor_date}`,
    `Source dataset: **${sourceRows} rows across ${sourceTables.length} tables**`,
    `Emitted: **${totalRows} rows across ${emitted.length} tables**`, '',
    '## Emitted', '',
    '| target table | rows |', '|---|---|',
    ...emitted.map((e) => `| \`${e.table}\` | ${e.rows} |`), '',
  ];

  for (const klass of ['adaptable', 'unsupported', 'blocked'] as const) {
    const group = MAPPINGS.filter((m) => m.klass === klass);
    if (group.length === 0) continue;
    const rowsIn = (s: string) => seed.tables[s]?.length ?? 0;
    report.push(
      `## ${klass} — ${group.length} table(s), `
      + `${group.reduce((n, m) => n + rowsIn(m.source), 0)} row(s) not emitted`, '',
    );
    for (const m of group) {
      report.push(`### \`${m.source}\` (${rowsIn(m.source)} rows)`, '',
        m.target ? `Target: \`${m.target}\`` : 'No target.', '', m.note, '');
    }
  }

  if (problems.length > 0) {
    report.push('## Problems found while emitting', '',
      ...problems.map((p) => `- ${p}`), '');
  }

  writeFileSync(join(outDir, 'BUILD_REPORT.md'), report.join('\n'));

  console.log(`\nAdapted seed written to ${outDir}`);
  console.log(`  ${totalRows} rows across ${emitted.length} tables`);
  console.log(`  source had ${sourceRows} rows across ${sourceTables.length} tables`);
  if (problems.length > 0) {
    console.log(`\n  ${problems.length} problem(s):`);
    for (const p of problems.slice(0, 10)) console.log(`    ${p}`);
    if (problems.length > 10) console.log(`    … and ${problems.length - 10} more`);
  }
  console.log(`\n  report: ${join(outDir, 'BUILD_REPORT.md')}`);
}

main();
