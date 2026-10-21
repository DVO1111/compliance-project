#!/usr/bin/env node
/**
 * Generates 04-migration-evidence.sql — a read-only probe that asks the
 * live database, per migration, whether the objects that migration
 * creates are actually there.
 *
 * WHY THIS IS GENERATED AND NOT WRITTEN BY HAND.
 *
 * The live project's supabase_migrations.schema_migrations holds exactly
 * ONE row: 20260305800000, stamped on 5 March. Everything since — 176
 * files — was applied by hand or not at all, with nothing recorded. So
 * `supabase db push` refuses (58 local files predate that stamp) and
 * `--include-all` would replay eight-month-old migrations over their own
 * effects.
 *
 * The way out is `supabase migration repair`, which writes history
 * without executing anything: mark the already-applied migrations as
 * applied, then push only the genuinely missing ones.
 *
 * BUT MARKING A MIGRATION "APPLIED" IS A CLAIM, AND A WRONG ONE IS
 * PERMANENT. It tells every future push to skip that file forever, so a
 * migration that never actually ran becomes invisible — which is the
 * failure this project has already paid for twice, when
 * 20260921000000_licence_lifecycle sat unapplied and surfaced days later
 * as "starter licences cannot be saved", pointing at the wrong cause.
 *
 * So the repair list must be evidence, not inference. Dates are
 * inference: "everything before September is probably applied" rests on
 * five probed objects across a hundred and thirty-four migrations. This
 * script replaces that with a per-migration count of objects the
 * database can be asked about directly.
 *
 * WHAT IT PROBES, AND WHAT IT CANNOT.
 *
 * Tables, views and functions, by name. Function SIGNATURES are
 * deliberately not checked here: several functions are redefined by
 * later migrations with different parameters, so a signature mismatch
 * would read as "absent" when the schema plainly has the thing. Name
 * presence is the right evidence for "did this migration run".
 *
 * A migration that only ALTERs, only changes policies, or only runs an
 * UPDATE creates nothing probeable. Those are reported as
 * 'nothing probeable' rather than quietly counted as applied — they need
 * a human decision, and the generated file says so.
 *
 * Usage:  node scripts/fix/gen-migration-evidence.mjs [cutoff]
 *         cutoff defaults to 20260905000000, the boundary the schema
 *         evidence puts between applied and missing.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, '..', '..', 'supabase', 'migrations');
const OUT = join(HERE, '04-migration-evidence.sql');
const CUTOFF = process.argv[2] ?? '20260905000000';

/** Strip comments so a CREATE inside a comment is not counted. */
function decomment(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

/** Objects a migration creates, as [kind, identifier] pairs. */
function objectsOf(sql) {
  const s = decomment(sql);
  const out = [];
  const add = (kind, name) => {
    const id = name.toLowerCase();
    if (!out.some(([k, n]) => k === kind && n === id)) out.push([kind, id]);
  };

  for (const m of s.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?(\w+)"?/gi)) {
    add('table', m[1]);
  }
  for (const m of s.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?(\w+)"?/gi)) {
    add('view', m[1]);
  }
  for (const m of s.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?/gi)) {
    add('function', m[1]);
  }
  return out;
}

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql') && /^\d{14}_/.test(f))
  .sort()
  .filter((f) => f.slice(0, 14) < CUTOFF);

// SIX TIMESTAMPS ARE SHARED BY TWO FILES EACH. supabase_migrations
// keys on the version alone, so the history physically cannot
// distinguish them: one `migration repair --status applied
// 20260226200000` marks BOTH content_calendar and team_chat, and a
// later push skips both. Where the two files disagree — team_chat is
// pinned as not applying while content_calendar applies fine — that
// is a gap the history can never express. Flagged in the output rather
// than silently emitted as two identical repair commands, which is
// what the first run against live printed.
const byVersion = new Map();
for (const f of files) {
  const v = f.slice(0, 14);
  byVersion.set(v, [...(byVersion.get(v) ?? []), f]);
}
const shared = [...byVersion.entries()].filter(([, fs]) => fs.length > 1);

const rows = [];
const nothing = [];
for (const f of files) {
  const version = f.slice(0, 14);
  const objs = objectsOf(readFileSync(join(MIGRATIONS, f), 'utf8'));
  if (objs.length === 0) {
    nothing.push([version, f]);
    continue;
  }
  for (const [kind, id] of objs) rows.push([version, f, kind, id]);
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const values = rows
  .map(([v, f, k, i]) => `    (${lit(v)}, ${lit(f)}, ${lit(k)}, ${lit(i)})`)
  .join(',\n');
const sharedValues = shared.length
  ? shared.map(([v, fs]) => `    (${lit(v)}, ${lit(fs.join(' + '))})`).join(',\n')
  : `    (NULL, NULL)`;
const nothingValues = nothing.length
  ? nothing.map(([v, f]) => `    (${lit(v)}, ${lit(f)})`).join(',\n')
  : `    (NULL, NULL)`;

const sql = `-- MIGRATION EVIDENCE — read-only. Changes nothing.
--
-- GENERATED by scripts/fix/gen-migration-evidence.mjs. Do not edit by
-- hand; regenerate it. Covers the ${files.length} timestamped migrations dated
-- before ${CUTOFF}, probing ${rows.length} objects.
--
-- THE QUESTION THIS ANSWERS. The live project records exactly one
-- migration, 20260305800000, stamped on 5 March; the other 176 files
-- have no record at all. The route out is \`supabase migration repair\`,
-- which writes history without executing anything — but marking a
-- migration "applied" tells every future push to skip it forever, so a
-- wrong mark hides a real gap permanently. This is the evidence that
-- decides which marks are safe.
--
-- HOW TO READ THE VERDICT
--
--   applied        every object the migration creates is present.
--                  Safe to \`migration repair --status applied\`.
--   absent         none of them are present. It did not run; it belongs
--                  in the apply list, not the repair list.
--   PARTIAL        some present, some not. DO NOT repair and DO NOT
--                  blind-apply. Something ran halfway, or a later
--                  migration dropped one of its objects. Each of these
--                  needs reading before it is touched.
--   nothing probeable
--                  the migration only ALTERs, changes policies, or runs
--                  an UPDATE, so it creates nothing that can be asked
--                  about. Listed separately at the end. These cannot be
--                  verified this way and need a human decision.
--
-- Function names are checked, not signatures: several functions are
-- redefined by later migrations with different parameters, and a
-- signature mismatch would read as absent when the schema plainly has
-- the thing.

WITH expected(version, file, kind, ident) AS (
  VALUES
${values}
),
found AS (
  SELECT e.version, e.file, e.kind, e.ident,
    CASE e.kind
      WHEN 'function' THEN EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = e.ident)
      ELSE to_regclass('public.' || quote_ident(e.ident)) IS NOT NULL
    END AS present
  FROM expected e
),
rollup AS (
  SELECT version, file,
         count(*) AS objects,
         count(*) FILTER (WHERE present) AS present
  FROM found GROUP BY version, file
)
SELECT version, objects, present,
       CASE WHEN present = objects THEN 'applied'
            WHEN present = 0       THEN 'absent'
            ELSE 'PARTIAL' END AS verdict,
       file
FROM rollup
ORDER BY version;

-- The migrations that create nothing probeable. Each needs a human
-- decision rather than a count.
WITH nothing_probeable(version, file) AS (
  VALUES
${nothingValues}
)
SELECT version, 'nothing probeable' AS verdict, file
FROM nothing_probeable
WHERE version IS NOT NULL
ORDER BY version;

-- TIMESTAMPS SHARED BY TWO FILES. supabase_migrations keys on the
-- version alone, so one repair marks BOTH files and a later push skips
-- both. Where the pair disagree, that is a gap the history cannot
-- express, and renaming one of the files is the only real fix.
WITH shared_timestamps(version, files) AS (
  VALUES
${sharedValues}
)
SELECT version, 'SHARED TIMESTAMP' AS verdict, files
FROM shared_timestamps
WHERE version IS NOT NULL
ORDER BY version;

-- WHAT TO DO WITH THE RESULT
--
-- Every 'applied' row is a candidate for:
--     supabase migration repair --status applied <version>
-- Run them in one batch, confirm with \`supabase migration list\`, and
-- only then \`supabase db push\`, which will apply the files dated after
-- the cutoff.
--
-- Every 'absent' and every 'PARTIAL' row stays out of the repair list.
-- A PARTIAL in particular must not be repaired OR blind-applied: it
-- means something ran halfway, and re-running it may collide with what
-- is already there.
`;

writeFileSync(OUT, sql);
console.log(`migrations before ${CUTOFF}: ${files.length}`);
console.log(`  with probeable objects: ${files.length - nothing.length}`);
console.log(`  creating nothing probeable: ${nothing.length}`);
console.log(`objects probed: ${rows.length}`);
console.log(`wrote ${OUT}`);
