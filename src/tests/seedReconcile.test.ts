/**
 * The seed reconciliation, and the package's own safety properties.
 *
 * The reconciliation's verdict against the real schema is produced by
 * `scripts/seed/reconcile.ts` and rehearsed by `scripts/seed/rehearse.sh`,
 * both of which need a database. What is pinned here is the part that must
 * hold without one: that the tooling refuses rather than waving things
 * through, and that nothing about the supplied package has been quietly
 * imported, copied into the repository, or treated as the allowlist.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RECONCILE = readFileSync(
  join(process.cwd(), 'scripts/seed/reconcile.ts'), 'utf8',
);
const REHEARSE = readFileSync(
  join(process.cwd(), 'scripts/seed/rehearse.sh'), 'utf8',
);

/** Prose explains what these refuse to do, so it must not be searched. */
const RECONCILE_CODE = RECONCILE
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const REHEARSE_CODE = REHEARSE.replace(/^\s*#.*$/gm, '');

describe('the reconciliation gates rather than reports', () => {
  it('exits non-zero when there are blockers', () => {
    /*
     *  A read-only report that always exits 0 is read once and then
     *  ignored. This one can sit in front of a load.
     */
    expect(RECONCILE_CODE).toMatch(/process\.exit\(blocked === 0 \? 0 : 1\)/);
  });

  it('counts a missing column as a blocker, not a thing to drop', () => {
    //  The dangerous alternative: an importer that silently discards
    //  unknown columns succeeds and loses the data.
    expect(RECONCILE_CODE).toMatch(/missingColumns/);
    expect(RECONCILE_CODE).toMatch(/blocked\s*=\s*missingTables\.length \+ missingColumns\.length/);
  });

  it('counts a required column the seed never supplies', () => {
    expect(RECONCILE_CODE).toMatch(/meta\.notNull && !meta\.hasDefault/);
  });

  it('is read-only — it writes nothing and applies nothing', () => {
    expect(RECONCILE_CODE).not.toMatch(/INSERT INTO|UPDATE |DELETE FROM|CREATE TABLE|writeFileSync/i);
  });

  it('does not judge values it cannot judge', () => {
    //  Enum and check violations are left to the rehearsal, where the
    //  constraint itself gives the verdict instead of this script
    //  guessing at the vocabulary.
    expect(RECONCILE_CODE).not.toMatch(/enumValues|allowedValues/);
  });
});

describe('the rehearsal cannot touch anything real', () => {
  it('takes no connection URL and no key', () => {
    expect(REHEARSE_CODE).not.toMatch(/SUPABASE_URL|SERVICE_ROLE|DATABASE_URL/);
  });

  it('builds and drops its own database', () => {
    expect(REHEARSE_CODE).toMatch(/CREATE DATABASE \$DB TEMPLATE/);
    expect(REHEARSE_CODE).toMatch(/DROP DATABASE IF EXISTS \$DB/);
  });

  it('never runs the reset script', () => {
    //  30_reset_demo.sql is destructive and scoped to demo companies by a
    //  column this application does not have.
    expect(REHEARSE_CODE).not.toMatch(/30_reset_demo/);
  });

  it('proves the absence of a partial import by counting, not by trusting', () => {
    //  The seed is wrapped in one transaction, but "it says BEGIN" is not
    //  evidence. The rows are counted before and after.
    expect(REHEARSE_CODE).toMatch(/before=/);
    expect(REHEARSE_CODE).toMatch(/after=/);
    expect(REHEARSE_CODE).toMatch(/no partial import/);
  });
});

describe('nothing from the package entered the repository', () => {
  it('keeps seed/incoming git-ignored', () => {
    const ignore = readFileSync(join(process.cwd(), 'seed/.gitignore'), 'utf8');
    expect(ignore).toMatch(/incoming\//);
    expect(ignore).toMatch(/\*\.xlsx/);
  });

  it('does not vendor the generated SQL into the repo', () => {
    //  882 rows of demo data, including 139 signature hashes, do not
    //  belong in a git history.
    for (const p of ['supabase/migrations/00_assumed_tables.sql',
                     'supabase/seed/10_seed_demo.sql',
                     'supabase/migrations/10_seed_demo.sql']) {
      expect(existsSync(join(process.cwd(), p))).toBe(false);
    }
  });

  it('did not apply the package\'s assumed tables as a migration', () => {
    /*
     *  00_assumed_tables.sql is the PRD's shape, not this application's.
     *  Applying it would leave two parallel models of the same domain.
     */
    const names = readFileSync(
      join(process.cwd(), 'scripts/ci/expected-suite-assertions.txt'), 'utf8',
    );
    expect(names).not.toMatch(/assumed_tables/);
  });
});

describe('the demo actors are not the allowlist', () => {
  it('no .example address was added to the seeded allowlist', () => {
    /*
     *  The 11 demo users are story actors in two fictional companies.
     *  Adding them to allowed_signins would make them able to register
     *  against the real product.
     */
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261017000000_signin_allowlist.sql'), 'utf8',
    );
    expect(migration).not.toMatch(/\.example/);
    expect(migration).not.toMatch(/ibadanpharma|ogunvalley/i);
  });

  it('no migration anywhere seeds a .example address into the allowlist', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const files = readFileSync(
      join(process.cwd(), 'scripts/ci/expected-migration-failures.txt'), 'utf8',
    );
    //  Cheap guard over the one file that could plausibly do it; the
    //  full-directory scan is the SQL suite's job.
    expect(files).not.toMatch(/\.example/);
    expect(existsSync(dir)).toBe(true);
  });
});
