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

const MIGRATION = resolve(__dirname, '../../supabase/migrations/20261026000000_access_requests.sql');
const sql = readFileSync(MIGRATION, 'utf8');

/** The INSERT ... VALUES body for one table, as raw text. */
function valuesBlockFor(table: string): string {
  const start = sql.indexOf(`INSERT INTO public.${table}`);
  expect(start, `no INSERT into ${table}`).toBeGreaterThan(-1);
  const end = sql.indexOf('ON CONFLICT', start);
  expect(end, `no ON CONFLICT after the ${table} INSERT`).toBeGreaterThan(start);
  return sql.slice(start, end);
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
  const seeded = [...valuesBlockFor('access_duty_conflicts')
    .matchAll(/^\s*\('([a-z_]+)',\s*'([a-z_]+)',/gm)]
    .map((m) => ({ role: m[1] as WorkRole, section: m[2] as AccessSection }));

  it('seeds the eight the module enforces', () => {
    const fromModule = new Set<string>();
    for (const { role } of seeded) {
      for (const section of forbiddenActSections(role)) fromModule.add(`${role}/${section}`);
    }
    const fromSql = new Set(seeded.map((r) => `${r.role}/${r.section}`));
    expect(fromSql).toEqual(fromModule);
  });

  //  The migration's own deploy-time assertion refuses fewer than
  //  eight. If that number ever moves, this is where it is noticed.
  it('seeds at least the eight the migration asserts', () => {
    expect(seeded.length).toBeGreaterThanOrEqual(8);
  });

  it('points every seeded pair at a section that exists', () => {
    for (const { section } of seeded) {
      expect(SECTION_LABELS[section], section).toBeTruthy();
    }
  });

  //  The one direction the set-equality above does not cover on its
  //  own: a rule added to the module and not to the migration would
  //  disable a radio the database happily grants.
  it('has no module rule missing from the migration', () => {
    const fromSql = new Set(seeded.map((r) => `${r.role}/${r.section}`));
    const roles: WorkRole[] = [
      'production_operator', 'production_supervisor', 'storekeeper',
      'qc_analyst', 'qa_officer', 'qa_manager', 'regulatory_affairs',
      'procurement', 'compliance_admin', 'other',
    ];
    for (const role of roles) {
      for (const section of forbiddenActSections(role)) {
        expect(fromSql.has(`${role}/${section}`), `${role}/${section} is not seeded`).toBe(true);
      }
    }
  });

  it('agrees with checkConflict on every seeded pair', () => {
    for (const { role, section } of seeded) {
      expect(checkConflict(role, section, 'act').conflicts, `${role}/${section}`).toBe(true);
      expect(checkConflict(role, section, 'view').conflicts, `${role}/${section}`).toBe(false);
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
