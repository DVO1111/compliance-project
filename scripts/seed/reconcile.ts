/**
 * Reconcile the supplied seed package against the real application schema.
 *
 *   PGHOST=/tmp PGPORT=5432 PGUSER=postgres PGDATABASE=criateur_local \
 *     npx tsx scripts/seed/reconcile.ts
 *
 * READ-ONLY. It parses the generated SQL, asks the database what actually
 * exists, and prints a verdict per table and per column. It writes nothing
 * and connects to nothing but the database you point it at — which must be
 * a disposable local one, never the live project.
 *
 * ── WHY PARSE THE SQL RATHER THAN RUN IT ──────────────────────────────────
 *
 * Running it is the thing we are trying to decide whether to do. A failed
 * import stops at the first bad statement, tells you about that one, and
 * leaves the database half-populated — on a multi-tenant schema, a company
 * with some of its materials and none of its batches. Parsing gives the
 * whole list of problems before anything is written, which is the only way
 * to decide whether the dataset is loadable at all.
 *
 * ── WHAT IT CLASSIFIES ────────────────────────────────────────────────────
 *
 *   MISSING TABLE   the application has no such table. The seed's
 *                   00_assumed_tables.sql would create it, and that file is
 *                   explicitly not an approved migration.
 *   MISSING COLUMN  the table exists and the column does not. Importing
 *                   would fail, or — worse, if a tool "helpfully" dropped
 *                   unknown columns — would succeed with data silently gone.
 *   REQUIRED UNMET  a NOT NULL column with no default that the seed never
 *                   supplies. The insert fails.
 *   OK              table and every column the seed writes exist.
 *
 * It does not judge VALUES. Enum and check-constraint violations surface in
 * the rehearsal load against a throwaway database, where the constraint
 * itself gives the verdict rather than this script guessing at it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SQL_FILES = [
  'seed/incoming/sql/10_seed_demo.sql',
  'seed/incoming/sql/20_lifecycle_state.sql',
];

interface SeedTable { table: string; columns: Set<string>; rows: number }

/** `INSERT INTO t (a, b, c) VALUES (...)` — the only shape the generator emits. */
function parseInserts(sql: string, into: Map<string, SeedTable>): void {
  const re = /INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const table = m[1].toLowerCase();
    const cols = m[2]
      .split(',')
      .map((c) => c.trim().replace(/^"|"$/g, '').toLowerCase())
      .filter(Boolean);
    const entry = into.get(table) ?? { table, columns: new Set<string>(), rows: 0 };
    for (const c of cols) entry.columns.add(c);
    entry.rows += 1;
    into.set(table, entry);
  }
}

interface Col { type: string; notNull: boolean; hasDefault: boolean }

function liveSchema(): Map<string, Map<string, Col>> {
  const raw = execFileSync('psql', ['-X', '-At', '-F', '|', '-c', `
    SELECT c.relname, a.attname, format_type(a.atttypid,a.atttypmod),
           a.attnotnull, (d.adbin IS NOT NULL)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relkind='r'`], {
    encoding: 'utf8',
    env: { ...process.env, PGDATABASE: process.env.PGDATABASE ?? 'criateur_local' },
  });

  const out = new Map<string, Map<string, Col>>();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const [t, col, type, notNull, hasDefault] = line.split('|');
    const tbl = out.get(t) ?? new Map<string, Col>();
    tbl.set(col, { type, notNull: notNull === 't', hasDefault: hasDefault === 't' });
    out.set(t, tbl);
  }
  return out;
}

function main(): void {
  const seed = new Map<string, SeedTable>();
  let anyFile = false;
  for (const f of SQL_FILES) {
    const p = join(process.cwd(), f);
    if (!existsSync(p)) { console.error(`missing: ${f}`); continue; }
    anyFile = true;
    parseInserts(readFileSync(p, 'utf8'), seed);
  }
  if (!anyFile) {
    console.error('No seed SQL found under seed/incoming/sql. Nothing to reconcile.');
    process.exit(2);
  }

  const live = liveSchema();

  const missingTables: string[] = [];
  const missingColumns: { table: string; column: string }[] = [];
  const requiredUnmet: { table: string; column: string }[] = [];
  const okTables: string[] = [];

  for (const [name, t] of [...seed].sort()) {
    const cols = live.get(name);
    if (!cols) { missingTables.push(name); continue; }

    let clean = true;
    for (const c of [...t.columns].sort()) {
      if (!cols.has(c)) { missingColumns.push({ table: name, column: c }); clean = false; }
    }
    //  A NOT NULL column with no default that the seed never writes will
    //  fail the insert. Worth knowing before the load, not during it.
    for (const [cname, meta] of cols) {
      if (meta.notNull && !meta.hasDefault && !t.columns.has(cname)) {
        requiredUnmet.push({ table: name, column: cname });
        clean = false;
      }
    }
    if (clean) okTables.push(name);
  }

  const totalRows = [...seed.values()].reduce((n, t) => n + t.rows, 0);

  console.log(`\nSeed package: ${seed.size} tables, ${totalRows} rows`);
  console.log(`Application schema: ${live.size} tables\n`);

  console.log(`COMPATIBLE            ${okTables.length} table(s)`);
  console.log(`MISSING TABLE         ${missingTables.length}`);
  console.log(`MISSING COLUMN        ${missingColumns.length}`);
  console.log(`REQUIRED NOT SUPPLIED ${requiredUnmet.length}\n`);

  if (missingTables.length) {
    console.log('── Tables the application does not have ──');
    for (const t of missingTables) {
      console.log(`  ${t}  (${seed.get(t)!.rows} row(s) would have no destination)`);
    }
    console.log();
  }

  if (missingColumns.length) {
    console.log('── Columns the seed writes that do not exist ──');
    for (const { table, column } of missingColumns) console.log(`  ${table}.${column}`);
    console.log();
  }

  if (requiredUnmet.length) {
    console.log('── Required columns the seed never supplies ──');
    for (const { table, column } of requiredUnmet) {
      const meta = live.get(table)!.get(column)!;
      console.log(`  ${table}.${column}  ${meta.type} NOT NULL, no default`);
    }
    console.log();
  }

  console.log('── Per table ──');
  for (const [name, t] of [...seed].sort()) {
    const verdict = missingTables.includes(name) ? 'NO TABLE'
      : missingColumns.some((m) => m.table === name) ? 'COLUMN GAP'
      : requiredUnmet.some((m) => m.table === name) ? 'REQUIRED GAP'
      : 'ok';
    console.log(`  ${name.padEnd(38)} ${String(t.rows).padStart(4)} row(s)  ${verdict}`);
  }

  const blocked = missingTables.length + missingColumns.length + requiredUnmet.length;
  console.log(
    blocked === 0
      ? '\nEvery seed table and column exists. Load order and values still '
        + 'have to be proven by the rehearsal.'
      : `\n${blocked} blocker(s). The dataset cannot be loaded as supplied.`,
  );
  //  Exit 1 on blockers so this can gate a rehearsal rather than being read
  //  by eye and waved through.
  process.exit(blocked === 0 ? 0 : 1);
}

main();
