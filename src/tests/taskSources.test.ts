/**
 * The task sources, and the thing that makes them worth having as data.
 *
 * ── THE BUG THIS FILE EXISTS TO PREVENT ──
 *
 * The derivation this replaced had three sources and two could never
 * return a row:
 *
 *   batch_records WHERE status = 'pending_qa'   — no such state
 *   deviations    WHERE status <> 'closed'      — no such column
 *
 * Both were installed, plausible, and silently produced nothing, with
 * the error swallowed by a logger.debug. A QA Manager's task list
 * showed material dispositions and never a batch release.
 *
 * A test asserting "listTasks returns an array" would have passed
 * throughout, which is the same shape of failure as the supplier guard
 * that named a lifecycle state the supplier lifecycle does not have.
 *
 * So the check here is not that the code runs. It is that every state
 * key the sources name is a state the MIGRATIONS actually declare, and
 * every column they filter on is a column those migrations create —
 * read out of the SQL rather than restated here, because a second copy
 * of the list is a second thing to forget to update.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  TASK_SOURCES, sourcesForRole, type TaskSource,
} from '../lib/tasks/taskSources';
import { PM_SECTIONS, canAct } from '../lib/access/roleAccess';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/** Every migration, concatenated. The schema as written down. */
function allSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
    .join('\n');
}

const SQL = allSql();

/**
 * The lifecycle states declared for an entity type.
 *
 * Lifted from the seeding statements rather than from a list kept
 * here. The states are inserted as quoted keys near their definition;
 * this gathers every quoted lower_snake token that appears as a state
 * key anywhere, which is deliberately generous — the assertion that
 * matters is that a source's state is PRESENT, and a generous reading
 * makes a false failure unlikely while still catching 'pending_qa',
 * which appears nowhere.
 */
function stateKeysInSchema(): Set<string> {
  const keys = new Set<string>();
  //  lifecycle_states rows are seeded as (..., 'state_key', ...) and
  //  also appear in state_key = '...' comparisons throughout the
  //  guards. Both forms are evidence the state exists.
  for (const m of SQL.matchAll(/state_key\s*(?:=|IN\s*\()?\s*'([a-z_]+)'/g)) keys.add(m[1]!);
  for (const m of SQL.matchAll(/,\s*'([a-z_]+)'\s*,\s*'[^']*'\s*,\s*\d+\s*,\s*(?:true|false)/g)) {
    keys.add(m[1]!);
  }
  return keys;
}

const STATES = stateKeysInSchema();

/** The columns any CREATE TABLE or ADD COLUMN in the migrations names. */
function columnsInSchema(): Set<string> {
  const cols = new Set<string>();
  for (const m of SQL.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/gi)) {
    cols.add(m[1]!.toLowerCase());
  }
  //  Inside a CREATE TABLE body, a column is a line starting with an
  //  identifier followed by a type word.
  for (const m of SQL.matchAll(/^\s{2,}([a-z_]+)\s+(?:uuid|text|boolean|numeric|integer|bigint|date|timestamptz|jsonb|serial)/gim)) {
    cols.add(m[1]!.toLowerCase());
  }
  return cols;
}

const COLUMNS = columnsInSchema();

describe('the schema reader itself', () => {
  //  If these fail, the two suites below are vacuous — they would pass
  //  by finding nothing to check. Asserted first for that reason.
  it('found a plausible number of lifecycle states', () => {
    expect(STATES.size).toBeGreaterThan(20);
  });

  it('found states it is supposed to find', () => {
    for (const s of ['quarantine', 'under_test', 'approved', 'qc_in_progress', 'released']) {
      expect(STATES.has(s), `state ${s} not found in the migrations`).toBe(true);
    }
  });

  //  THE CONTROL CASE. The string that was in the old derivation must
  //  be absent, or this test cannot detect the bug it was written for.
  it('does not find the state the old derivation invented', () => {
    expect(STATES.has('pending_qa')).toBe(false);
  });

  it('found a plausible number of columns', () => {
    expect(COLUMNS.size).toBeGreaterThan(100);
  });
});

describe('every task source names something that exists', () => {
  const named = (s: TaskSource) =>
    'isNull' in s.awaiting ? `${s.table}.${s.awaiting.column} IS NULL`
                           : `${s.table}.${s.awaiting.column} = '${s.awaiting.equals}'`;

  it.each(TASK_SOURCES.map((s) => [s.key, s] as const))(
    '%s filters on a column the migrations create', (_key, s) => {
      expect(COLUMNS.has(s.awaiting.column), `${named(s)} — no such column`).toBe(true);
    });

  it.each(TASK_SOURCES.map((s) => [s.key, s] as const))(
    '%s waits on a state the migrations declare', (_key, s) => {
      if ('isNull' in s.awaiting) return;        // a null check names no state
      expect(STATES.has(s.awaiting.equals), `${named(s)} — no such state`).toBe(true);
    });

  it.each(TASK_SOURCES.map((s) => [s.key, s] as const))(
    '%s reads a label column the migrations create', (_key, s) => {
      expect(COLUMNS.has(s.labelColumn), `${s.table}.${s.labelColumn} — no such column`).toBe(true);
    });

  it('every source belongs to a real PM-03 column', () => {
    for (const s of TASK_SOURCES) {
      expect(PM_SECTIONS, `${s.key} names section ${s.section}`).toContain(s.section);
    }
  });

  it('no two sources share a key', () => {
    const keys = TASK_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('sourcesForRole', () => {
  it('gives a QA manager the work PM-03 says is theirs', () => {
    const keys = sourcesForRole('qa_manager').map((s) => s.key);
    //  Act on qa_disposition, batch_release, deviation_capa, suppliers.
    expect(keys).toContain('material_disposition');
    expect(keys).toContain('batch_release');
    expect(keys).toContain('deviation_close');
    expect(keys).toContain('supplier_approve');
  });

  //  THE ONE THE OLD DERIVATION GOT WRONG IN PRACTICE, for a different
  //  reason: it offered the source and the source was dead.
  it('and that includes the batch release the old derivation never produced', () => {
    expect(sourcesForRole('qa_manager').map((s) => s.key)).toContain('batch_release');
  });

  it('gives a production supervisor the batch floor and not the release', () => {
    const keys = sourcesForRole('production_supervisor').map((s) => s.key);
    expect(keys).toContain('batch_execution');
    expect(keys).not.toContain('batch_release');
    expect(keys).not.toContain('material_disposition');
  });

  it('gives a QC analyst testing and not disposition', () => {
    const keys = sourcesForRole('qc_analyst').map((s) => s.key);
    expect(keys).toContain('material_testing');
    expect(keys).not.toContain('material_disposition');
  });

  it('gives a storekeeper nothing from these sources', () => {
    //  PM-03 gives the Storekeeper Act on goods receipt, material lots
    //  and distribution — none of which is a source here, because none
    //  of them has a record WAITING on a storekeeper's decision.
    expect(sourcesForRole('storekeeper')).toEqual([]);
  });

  it('gives a compliance admin nothing, because View is not Act', () => {
    expect(sourcesForRole('compliance_admin')).toEqual([]);
  });

  //  FAILS CLOSED. An unresolved role is not a role with work.
  it('gives an unresolved role nothing', () => {
    expect(sourcesForRole(null)).toEqual([]);
    expect(sourcesForRole(undefined)).toEqual([]);
  });

  it('never offers a source the role cannot act in', () => {
    for (const role of ['qa_manager', 'qa_officer', 'qc_analyst',
                        'production_supervisor', 'procurement'] as const) {
      for (const s of sourcesForRole(role)) {
        expect(canAct(role, s.section), `${role} / ${s.key}`).toBe(true);
      }
    }
  });
});
