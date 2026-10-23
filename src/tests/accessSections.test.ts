/**
 * The section list and the duties rules exist twice — once as TypeScript
 * constants the UI renders from, once as rows the database decides
 * from. This file is what stops the two drifting.
 *
 * WHY THEY EXIST TWICE AT ALL. The constants let the request dialog
 * render, disable Act and explain itself with no round trip, and let
 * permissionRequests.test.ts run without a database. The rows are what
 * actually governs: access_decide reads them, and a browser's opinion
 * about segregation of duties is not a control. Neither copy can be
 * deleted, so the only honest thing to do is assert they agree.
 *
 * It reads the migration as text rather than connecting to Postgres,
 * which is the trade this test is making: it cannot see a column type
 * or an RLS policy — supabase/tests/access_requests_test.sql does that
 * — but it runs in the ordinary unit suite, so the drift is caught by
 * whoever introduces it rather than by CI twenty minutes later.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SECTION_LABELS, LEVEL_MEANING, UNREQUESTABLE, MAX_GRANT_DAYS,
  forbiddenActSections, checkConflict,
  type AccessSection, type WorkRole,
} from '../lib/access/permissionRequests';

//  BOTH MIGRATIONS THAT SEED SECTIONS, not just the first.
//
//  20261026000000 seeded fifteen. 20261103000000 adds the five PM-03
//  columns that were missing — suppliers, goods receipt, CoA register,
//  traceability and distribution — and reading only the first file made
//  this test fail on sections that ARE seeded, which is the test being
//  wrong rather than the schema. Any later migration that seeds more
//  must be added here too, or the agreement this file asserts quietly
//  stops covering them.
const MIGRATIONS = [
  '20261026000000_access_requests.sql',
  '20261103000000_access_sections_from_pm03.sql',
].map((f) => resolve(__dirname, '../../supabase/migrations/', f));
const sql = MIGRATIONS.map((f) => readFileSync(f, 'utf8')).join('\n');

/** The INSERT ... VALUES body for one table, as raw text. */
function valuesBlockFor(table: string): string {
  //  Every INSERT into the table across the concatenated migrations,
  //  joined. With more than one seeding migration, returning only the
  //  first block would silently drop the rows the later one adds.
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const start = sql.indexOf(`INSERT INTO public.${table}`, from);
    if (start === -1) break;
    const end = sql.indexOf('ON CONFLICT', start);
    expect(end, `no ON CONFLICT after an ${table} INSERT`).toBeGreaterThan(start);
    blocks.push(sql.slice(start, end));
    from = end;
  }
  expect(blocks.length, `no INSERT into ${table}`).toBeGreaterThan(0);
  return blocks.join('\n');
}

describe('the section list', () => {
  const seeded = [...valuesBlockFor('access_sections').matchAll(/^\s*\('([a-z_]+)',/gm)]
    .map((m) => m[1]);

  it('seeds the same sections the module knows about', () => {
    expect(new Set(seeded)).toEqual(new Set(Object.keys(SECTION_LABELS)));
  });

  it('seeds each one exactly once', () => {
    expect(seeded.length).toBe(new Set(seeded).size);
  });

  //  A section with no View/Act sentence renders an empty radio in the
  //  request dialog, which is how a person ends up agreeing to
  //  something nobody described.
  it('gives every section both level sentences', () => {
    for (const key of seeded as AccessSection[]) {
      expect(LEVEL_MEANING[key]?.view, key).toBeTruthy();
      expect(LEVEL_MEANING[key]?.act, key).toBeTruthy();
    }
  });

  //  "Release is a step permission, not a page permission; it can't be
  //  requested (2.5, C8.6)." Both copies have to say so, or the UI
  //  offers a Request button for something the database will refuse.
  it('marks batch release unrequestable in the migration too', () => {
    const block = valuesBlockFor('access_sections');
    const row = block.split('\n').find((l) => l.includes("('batch_release'"));
    expect(row).toBeTruthy();
    //  The row spans lines; take the whole statement after the key.
    const after = block.slice(block.indexOf("('batch_release'"));
    expect(after).toMatch(/cannot be requested/i);
    expect(UNREQUESTABLE.batch_release).toBeTruthy();
  });

  it('marks nothing else unrequestable in either copy', () => {
    expect(Object.keys(UNREQUESTABLE)).toEqual(['batch_release']);
  });
});

describe('the segregation-of-duties rules', () => {
  const pairs = [...valuesBlockFor('access_duty_conflicts')
    .matchAll(/^\s*\('([a-z_]+)',\s*'([a-z_]+)',/gm)]
    .map((m) => ({ role: m[1] as WorkRole, section: m[2] as AccessSection }));

  //  The allowlist is seeded (section, role) — the other way round
  //  from the denylist, because it is a different kind of statement.
  const owners = [...valuesBlockFor('access_act_owners')
    .matchAll(/^\s*\('([a-z_]+)',\s*'([a-z_]+)',/gm)]
    .map((m) => ({ section: m[1] as AccessSection, role: m[2] as WorkRole }));

  const ownedSections = new Set(owners.map((o) => o.section));
  const ownerOf = (section: AccessSection) =>
    new Set(owners.filter((o) => o.section === section).map((o) => o.role));

  /** What the migration's two tables, together, say about one cell. */
  const sqlForbids = (role: WorkRole, section: AccessSection) =>
    (ownedSections.has(section) && !ownerOf(section).has(role))
    || pairs.some((p) => p.role === role && p.section === section);

  it('seeds the pairs the module carries', () => {
    const fromSql = new Set(pairs.map((r) => `${r.role}/${r.section}`));
    for (const { role, section } of pairs) {
      expect(fromSql.has(`${role}/${section}`), `${role}/${section}`).toBe(true);
    }
    expect(pairs.length).toBeGreaterThanOrEqual(9);
  });

  //  "Segregation of duties — enforced for everyone, including
  //  admins." The one rule a permissions system is most likely to
  //  exempt itself from.
  it('binds the Compliance admin too', () => {
    expect(forbiddenActSections('compliance_admin')).toContain('qa_disposition');
    expect(sqlForbids('compliance_admin', 'qa_disposition')).toBe(true);
  });

  it('names owners for every section the module restricts by allowlist', () => {
    //  QA disposition is the one the design draws. If the module ever
    //  restricts another section this way and the migration does not,
    //  the browser disables a radio the database would grant.
    expect(ownedSections.has('qa_disposition')).toBe(true);
    expect(ownerOf('qa_disposition')).toEqual(new Set(['qa_officer', 'qa_manager']));
  });

  it('points every seeded pair at a section that exists', () => {
    for (const { section } of pairs) expect(SECTION_LABELS[section], section).toBeTruthy();
    for (const { section } of owners) expect(SECTION_LABELS[section], section).toBeTruthy();
  });

  //  THE ONE THAT MATTERS: the two copies agree on every cell, in both
  //  directions. A rule in the module and not the migration disables a
  //  radio the database grants; a rule in the migration and not the
  //  module offers a radio the save then refuses.
  it('agrees with the module on every role and section, both ways', () => {
    const roles: WorkRole[] = [
      'production_operator', 'production_supervisor', 'storekeeper',
      'qc_analyst', 'qa_officer', 'qa_manager', 'regulatory_affairs',
      'procurement', 'compliance_admin', 'other',
    ];
    for (const role of roles) {
      for (const section of Object.keys(SECTION_LABELS) as AccessSection[]) {
        expect(checkConflict(role, section, 'act').conflicts, `${role}/${section}`)
          .toBe(sqlForbids(role, section));
        //  And viewing is never refused by either copy.
        expect(checkConflict(role, section, 'view').conflicts, `${role}/${section} view`)
          .toBe(false);
      }
    }
  });
});

describe('how long a grant may run', () => {
  //  The cap is enforced twice — the drawer refuses a longer date, the
  //  function raises on one — and a mismatch means the UI offers a date
  //  the save then rejects.
  it('is the same number in the module and the migration default', () => {
    const def = /max_grant_days\s+int NOT NULL DEFAULT (\d+)/.exec(sql);
    expect(def, 'no max_grant_days default in the migration').toBeTruthy();
    expect(Number(def![1])).toBe(MAX_GRANT_DAYS);
  });

  it('falls back to the same number inside access_max_grant_days', () => {
    const fallback = /WHERE company_id = p_company_id\), (\d+)\)/.exec(sql);
    expect(fallback, 'no COALESCE fallback in access_max_grant_days').toBeTruthy();
    expect(Number(fallback![1])).toBe(MAX_GRANT_DAYS);
  });
});

describe('the writes that must stay closed', () => {
  //  Not a style check. The service calls RPCs rather than .insert()
  //  because the tables have no write policy; if one were ever added,
  //  the duties check could be skipped by writing directly, and every
  //  other test here would still pass.
  it('grants no write policy on the request or grant tables', () => {
    const policies = [...sql.matchAll(/CREATE POLICY\s+(\w+)\s+ON\s+public\.(\w+)\s+FOR\s+(\w+)/g)];
    for (const [, name, table, cmd] of policies) {
      if (table === 'access_permission_requests' || table === 'access_grants') {
        expect(cmd.toUpperCase(), `${name} on ${table}`).toBe('SELECT');
      }
    }
  });

  //  Without security_invoker the view runs as its owner, which reads
  //  access_grants with RLS bypassed — every company's grants at once.
  it('declares security_invoker on the active-grants view', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE VIEW public\.access_grants_active\s*\nWITH \(security_invoker = true\)/,
    );
  });
});
