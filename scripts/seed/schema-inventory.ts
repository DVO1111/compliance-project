/**
 * Regenerate docs/seed/SCHEMA_INVENTORY.md from a live database.
 *
 *   PGHOST=/tmp PGPORT=5432 PGUSER=postgres PGDATABASE=criateur_local \
 *     npx tsx scripts/seed/schema-inventory.ts
 *
 * WHY THIS IS GENERATED AND NOT WRITTEN. The inventory is what a seed file
 * is reconciled against — "does this column exist", "is it required". A
 * hand-maintained list would drift from the migrations, and the first time
 * it did, a seed import would be validated against a schema that is not
 * the one it is about to be written into.
 *
 * Point it at a database that has every migration applied. The SQL test
 * rig's `criateur_local` is exactly that, which is why it is the default.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const QUERY = `
SELECT c.relname, a.attname, format_type(a.atttypid,a.atttypmod),
       CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE '' END,
       coalesce(pg_get_expr(d.adbin,d.adrelid),'')
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
WHERE n.nspname='public' AND c.relkind='r'
ORDER BY c.relname, a.attnum`;

function main(): void {
  const raw = execFileSync('psql', ['-X', '-At', '-F', '|', '-c', QUERY], {
    encoding: 'utf8',
    env: { ...process.env, PGDATABASE: process.env.PGDATABASE ?? 'criateur_local' },
  });

  const tables = new Map<string, string[][]>();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const cells = line.split('|');
    if (cells.length < 5) continue;
    const list = tables.get(cells[0]) ?? [];
    list.push(cells);
    tables.set(cells[0], list);
  }

  const out: string[] = [
    '# Application schema inventory',
    '',
    `Generated from a database with **all ${tables.size} public tables** created by `
    + "this repository's migrations, applied in order. This is the authoritative "
    + 'shape any seed file must match.',
    '',
    'Regenerate with `npx tsx scripts/seed/schema-inventory.ts` after adding a migration.',
    '',
    '## How to read it',
    '',
    '`column type [NOT NULL] [= default]`. A column marked NOT NULL with no default '
    + 'is one a seed row **must** supply.',
    '',
    `## Tables (${tables.size})`,
    '',
  ];

  for (const [table, cols] of tables) {
    const required = cols.filter((c) => c[3] === 'NOT NULL' && !c[4]).map((c) => c[1]);
    out.push(`### \`${table}\``, '');
    if (required.length > 0) {
      out.push(`**Required (NOT NULL, no default):** ${
        required.map((c) => `\`${c}\``).join(', ')}`, '');
    }
    out.push('```');
    for (const c of cols) {
      let line = `${c[1]} ${c[2]}`;
      if (c[3]) line += ' NOT NULL';
      if (c[4]) line += ` = ${c[4]}`;
      out.push(line);
    }
    out.push('```', '');
  }

  const path = join(process.cwd(), 'docs', 'seed', 'SCHEMA_INVENTORY.md');
  writeFileSync(path, out.join('\n'));
  console.log(`wrote docs/seed/SCHEMA_INVENTORY.md — ${tables.size} tables`);
}

main();
