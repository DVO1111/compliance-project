/**
 * Seed import — the CLI.
 *
 * Validates every file against its spec and, only with --apply, writes.
 * The decisions live in src/lib/seed/seedValidation.ts, which is pure and
 * directly tested; this file is the plumbing around them.
 *
 *   npx tsx scripts/seed/import.ts            validate only (the default)
 *   npx tsx scripts/seed/import.ts --apply    validate, then write
 *
 * DRY RUN IS THE DEFAULT AND --apply IS THE ONLY WAY TO WRITE. A seed
 * importer whose default writes is one keystroke away from overwriting a
 * tenant.
 *
 * Connection comes from the environment, never from a committed file:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   server-side only; this script is not shipped
 *                               to a browser and the key must never be put
 *                               in VITE_* or in any committed .env
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  validateSeedFile, isImportable, importOrder,
  type SeedRow, type SeedSpec, type SeedReport,
} from '../../src/lib/seed/seedValidation';
import { SPECS } from '../../seed/manifest';

const APPLY = process.argv.includes('--apply');
const INCOMING = join(process.cwd(), 'seed', 'incoming');

/** Minimal CSV reader: quoted fields, embedded commas, doubled quotes. */
function parseCsv(text: string): SeedRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') {
      row.push(field); field = '';
      //  A trailing \r from a Windows-authored file is not part of the value.
      rows.push(row.map((v) => v.replace(/\r$/, '')));
      row = [];
      continue;
    }
    field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row.map((v) => v.replace(/\r$/, '')));
  }

  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (nonEmpty.length === 0) return [];
  const header = nonEmpty[0];
  return nonEmpty.slice(1).map((r) => {
    const o: SeedRow = {};
    header.forEach((h, i) => { o[h] = r[i] ?? null; });
    return o;
  });
}

function readRows(path: string): SeedRow[] {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error(`${path}: expected a JSON array of row objects`);
    }
    return parsed as SeedRow[];
  }
  return parseCsv(text);
}

function fileFor(spec: SeedSpec): string | null {
  for (const ext of ['csv', 'json']) {
    const p = join(INCOMING, `${spec.table}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    console.error(
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.\n'
      + 'Never put the service-role key in a committed file or a VITE_ variable.',
    );
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  if (!existsSync(INCOMING)) {
    console.error(
      `No seed/incoming directory. Put the files there — see docs/SEED_IMPORT.md.`,
    );
    process.exit(2);
  }

  //  A .sql file is reported, never executed. Seed data is read as data.
  const stray = readdirSync(INCOMING).filter((f) => f.endsWith('.sql'));
  for (const f of stray) {
    console.warn(
      `  ! ${f} is a SQL file. It will NOT be run. Seed files are read as `
      + `data; review it by hand before applying anything it contains.`,
    );
  }

  const order = importOrder(SPECS);
  const reports: SeedReport[] = [];
  let missing = 0;

  for (const table of order) {
    const spec = SPECS.find((s) => s.table === table);
    if (!spec) continue;

    const path = fileFor(spec);
    if (!path) {
      console.log(`  - ${spec.table}: no file, skipped`);
      missing += 1;
      continue;
    }

    //  The lookups this spec needs, fetched from the target project so a
    //  reference is checked against what is actually there.
    const known: Record<string, Set<string>> = {};
    for (const ref of spec.references ?? []) {
      const { data, error } = await db
        .from(ref.table)
        .select(ref.lookupColumn);
      if (error) {
        console.error(`  x ${spec.table}: cannot read ${ref.table} — ${error.message}`);
        process.exit(1);
      }
      known[`${ref.table}.${ref.lookupColumn}`] = new Set(
        (data ?? []).map((r) =>
          String((r as Record<string, unknown>)[ref.lookupColumn] ?? '').toLowerCase()),
      );
    }

    //  The table's real columns, so a misspelled header is reported rather
    //  than silently dropped.
    let allowed: string[] | undefined;
    const probe = await db.from(spec.table).select('*').limit(1);
    if (!probe.error && probe.data && probe.data.length > 0) {
      allowed = Object.keys(probe.data[0] as Record<string, unknown>);
    }

    const report = validateSeedFile(spec, readRows(path), known, allowed);
    reports.push(report);

    const mark = isImportable(report) ? 'ok' : 'PROBLEMS';
    console.log(`  ${mark === 'ok' ? '+' : 'x'} ${spec.table}: `
      + `${report.rows} row(s), ${report.problems.length} problem(s) [${mark}]`);
    for (const p of report.problems.slice(0, 20)) console.log(`      ${p.detail}`);
    if (report.problems.length > 20) {
      console.log(`      … and ${report.problems.length - 20} more`);
    }
  }

  const bad = reports.filter((r) => !isImportable(r));
  if (bad.length > 0) {
    console.error(`\n${bad.length} file(s) have problems. Nothing was written.`);
    process.exit(1);
  }
  if (reports.length === 0) {
    console.error(`\nNo seed files found in seed/incoming (${missing} spec(s) unmatched).`);
    process.exit(2);
  }

  if (!APPLY) {
    console.log(
      `\nDry run. ${reports.reduce((n, r) => n + r.rows, 0)} row(s) would be `
      + `written across ${reports.length} table(s). Re-run with --apply to write.`,
    );
    return;
  }

  for (const table of order) {
    const spec = SPECS.find((s) => s.table === table);
    const report = reports.find((r) => r.table === table);
    if (!spec || !report) continue;
    const path = fileFor(spec);
    if (!path) continue;

    //  Upsert on the natural key: re-running updates rather than
    //  duplicating, which is what makes the import repeatable.
    const { error } = await db
      .from(spec.table)
      .upsert(readRows(path) as never, { onConflict: spec.conflictTarget.join(',') });
    if (error) {
      console.error(`  x ${spec.table}: ${error.message}`);
      process.exit(1);
    }
    console.log(`  + ${spec.table}: ${report.rows} row(s) upserted`);
  }
  console.log('\nApplied.');
}

main().catch((e) => { console.error(e); process.exit(1); });
