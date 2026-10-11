/**
 * The batch status map in batchReleaseService.ts has to agree with the
 * lifecycle definition in the migration, and nothing in TypeScript makes
 * that true. So this suite reads the migration and compares.
 *
 * WHY THIS IS WORTH A TEST RATHER THAN A COMMENT
 * ----------------------------------------------
 * Since Week 4 item 07 the batch's state lives in the lifecycle engine
 * and `batch_records.status` is a mirror the database refuses to let the
 * client write. The service therefore translates "move this batch to
 * released" into the engine action `release`, using a hand-written table
 * of (from -> to) => action_key.
 *
 * Two things can go wrong with a table like that, and neither shows up at
 * compile time or in a passing screen:
 *
 *   A transition exists in the database and not in the map. The button is
 *   simply missing, or throws "cannot move straight to", and the feature
 *   looks broken for a reason nobody can see in the code they are reading.
 *
 *   The map claims a transition the database does not have. The button is
 *   offered, the operator presses it, and the engine refuses — which is a
 *   worse outcome than not offering it, because it happens on the floor
 *   rather than in CI.
 *
 * Reading the migration is deliberate. Asserting against a second
 * hand-written list would only prove the two lists match each other.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BATCH_TRANSITIONS } from '../lib/pharma/batchTransitions';

const MIGRATION = 'supabase/migrations/20261011000000_batch_record_and_stages.sql';

/**
 * The migration declares its transitions with plpgsql variables for the
 * state ids (`s_prog`, `s_qci`), each assigned from a state_key a few
 * lines above. Both halves are read so the comparison is against the
 * state KEYS the service speaks, not against variable names.
 */
function parseBatchTransitions(sql: string): Map<string, string> {
  //  SELECT id INTO s_prog FROM public.lifecycle_states WHERE definition_id=v_def AND state_key='in_progress';
  const varToState = new Map<string, string>();
  const varRe = /SELECT\s+id\s+INTO\s+(s_\w+)\s+FROM\s+public\.lifecycle_states\s+WHERE\s+definition_id=v_def\s+AND\s+state_key='([a-z_]+)'/g;
  for (const m of sql.matchAll(varRe)) varToState.set(m[1], m[2]);

  //  (v_def,s_qci ,s_rel ,'release',        'Release batch',  40,false,false),
  //  Only rows whose BOTH state variables are batch_record states are
  //  taken, which is what keeps the batch_stage definition in the same
  //  file from leaking in: its variables are assigned in a separate block
  //  and overwrite nothing here, because the two blocks use different
  //  names for everything except s_prog.
  const out = new Map<string, string>();
  const rowRe = /\(v_def,\s*(s_\w+?)\s*,\s*(s_\w+?)\s*,\s*'([a-z_]+)'/g;
  for (const m of sql.matchAll(rowRe)) {
    const from = varToState.get(m[1]);
    const to = varToState.get(m[2]);
    if (!from || !to) continue;
    out.set(`${from}->${to}`, m[3]);
  }
  return out;
}

/**
 * The batch_record definition and the batch_stage definition both live in
 * this migration and both use `s_prog`. Splitting on the stage block's own
 * marker keeps the two apart; without it the stage's `start` transition
 * would be read as a batch transition.
 */
function batchRecordBlock(sql: string): string {
  const start = sql.indexOf('$batch_lifecycle$');
  const end = sql.indexOf('$stage_lifecycle$');
  expect(start, 'the batch_record lifecycle block should be present').toBeGreaterThan(-1);
  expect(end, 'the batch_stage lifecycle block should be present').toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('batch status transitions agree with the lifecycle definition', () => {
  const sql = readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
  const declared = parseBatchTransitions(batchRecordBlock(sql));

  it('finds the transitions in the migration at all', () => {
    //  A parser that silently matches nothing would make every assertion
    //  below vacuously true, so the count is asserted first.
    expect(declared.size).toBeGreaterThanOrEqual(12);
  });

  it('maps in_progress -> execution_complete to close_execution', () => {
    expect(declared.get('in_progress->execution_complete')).toBe('close_execution');
  });

  it('declares no transition the service cannot name', () => {
    const missing = [...declared.keys()].filter(k => !(k in BATCH_TRANSITIONS));
    expect(missing, 'transitions in the database with no entry in BATCH_TRANSITIONS').toEqual([]);
  });

  it('claims no transition the database does not declare', () => {
    const invented = Object.keys(BATCH_TRANSITIONS).filter(k => !declared.has(k));
    expect(invented, 'entries in BATCH_TRANSITIONS with no transition behind them').toEqual([]);
  });

  it('agrees on the action key for every transition', () => {
    const disagreements: string[] = [];
    for (const [key, action] of declared) {
      if (BATCH_TRANSITIONS[key] && BATCH_TRANSITIONS[key] !== action) {
        disagreements.push(`${key}: service says "${BATCH_TRANSITIONS[key]}", migration says "${action}"`);
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('has an entry for every move the batch release screen offers', () => {
    //  Kept in step with nextActions() in BatchReleasePage.tsx by hand,
    //  which is the one hand-written list left — but it is now the only
    //  one, and a missing entry here fails rather than throwing at a user.
    const offered: [string, string][] = [
      ['in_progress', 'hold'],
      ['execution_complete', 'qc_pending'],
      ['qc_pending', 'qc_in_progress'],
      ['qc_pending', 'hold'],
      ['qc_in_progress', 'released'],
      ['qc_in_progress', 'hold'],
      ['qc_in_progress', 'rejected'],
      ['hold', 'in_progress'],
      ['hold', 'qc_in_progress'],
      ['hold', 'rejected'],
    ];
    const unsupported = offered
      .map(([from, to]) => `${from}->${to}`)
      .filter(k => !declared.has(k));
    expect(unsupported, 'buttons the screen offers that the engine would refuse').toEqual([]);
  });
});
