/**
 * Yield reconciliation: the arithmetic, and the gate read.
 *
 * THIS ITEM BLOCKS, AND ITEM 11 DELIBERATELY DID NOT.
 *
 * inprocessControl.test.ts asserts that `canSave` is unconditionally
 * true for every value, because item 11's first NOT DONE IF is "an OOS
 * reading blocks entry". This file asserts the opposite for a different
 * act: recording is never refused, and PROCEEDING is. Both items are
 * right, and the line between them is the line between observing
 * something and acting on it.
 *
 * TWO THINGS ARE BEING DEFENDED HERE.
 *
 * 1. THE THRESHOLD COMPARISON. It is applied to the MAGNITUDE of a
 *    SIGNED variance, inclusively. Each of those three words has a
 *    plausible wrong version:
 *      - unsigned: throws away the difference between a batch that
 *        yielded too little and one that yielded too much, which are
 *        different failures with different causes;
 *      - signed comparison: lets any overage through, however large,
 *        because +40% is not greater than a 2% threshold in the way the
 *        naive comparison reads it;
 *      - exclusive: refuses a yield exactly on its own threshold, every
 *        time, which is how a control gets a reputation for crying wolf.
 *
 * 2. FAILING CLOSED. `checkStageYield` must never report "clear" because
 *    a request failed. supabase-js resolves a failed query with
 *    `{ data: null, error }`, and yield_block_reason returns NULL for
 *    "nothing blocks" — so the null payload and the failure look alike,
 *    and reading them alike is how a network error becomes permission to
 *    close a batch that never balanced.
 *
 * The SQL side asserts the same arithmetic in section B of
 * supabase/tests/yield_reconciliation_test.sql, including the same
 * boundary.
 */
import { describe, it, expect } from 'vitest';
import {
  yieldFigures,
  theoreticalFrom,
  configIsValid,
  adviseOnReconciliation,
  canAuthorise,
  isOutstanding,
  checkYieldClear,
  checkBatchYieldClear,
  BASIS_LABELS,
  THEORETICAL_BASES,
  type YieldGateClient,
} from '../lib/pharma/yieldModel';

describe('yieldFigures', () => {
  it('computes the percentage and the variance', () => {
    const f = yieldFigures(50, 49, 2)!;
    expect(f.yieldPct).toBe(98);
    expect(f.variancePct).toBe(-2);
  });

  //  THE BOUNDARY IS INCLUSIVE. 98% against a 2% threshold is exactly on
  //  it, and the same case is asserted in SQL (B5).
  it('a variance exactly ON the threshold is within it', () => {
    expect(yieldFigures(50, 49, 2)!.withinThreshold).toBe(true);
    expect(yieldFigures(50, 51, 2)!.withinThreshold).toBe(true);
  });

  it('and a hair beyond it is not', () => {
    expect(yieldFigures(50, 48.9, 2)!.withinThreshold).toBe(false);
    expect(yieldFigures(50, 51.1, 2)!.withinThreshold).toBe(false);
  });

  //  VARIANCE IS SIGNED: a shortfall and an overage are different
  //  problems. An absolute variance would make these two identical.
  it('keeps the sign: shortfall negative, overage positive', () => {
    expect(yieldFigures(50, 46, 2)!.variancePct).toBe(-8);
    expect(yieldFigures(50, 54, 2)!.variancePct).toBe(8);
  });

  //  THE THRESHOLD IS APPLIED TO THE MAGNITUDE. A signed comparison
  //  would let any overage through, however large, which is the more
  //  dangerous direction: a yield above theory means material is
  //  unaccounted for.
  it('an overage beyond threshold is outside it, not merely "not short"', () => {
    const f = yieldFigures(50, 70, 2)!;
    expect(f.variancePct).toBe(40);
    expect(f.withinThreshold).toBe(false);
  });

  it('a zero yield is a measurement, with a percentage of zero', () => {
    const f = yieldFigures(50, 0, 2)!;
    expect(f.yieldPct).toBe(0);
    expect(f.variancePct).toBe(-100);
    expect(f.withinThreshold).toBe(false);
  });

  //  A threshold of zero means "any variance at all blocks", a
  //  legitimate choice for a high-value product.
  it('a threshold of zero admits only an exact yield', () => {
    expect(yieldFigures(50, 50, 0)!.withinThreshold).toBe(true);
    expect(yieldFigures(50, 50.001, 0)!.withinThreshold).toBe(false);
  });

  it('refuses a theoretical quantity of zero or less — it is the denominator', () => {
    expect(yieldFigures(0, 10, 2)).toBeNull();
    expect(yieldFigures(-5, 10, 2)).toBeNull();
  });

  it('refuses a negative actual quantity, which is not a measurement', () => {
    expect(yieldFigures(50, -1, 2)).toBeNull();
  });

  it('refuses non-finite inputs rather than propagating NaN', () => {
    expect(yieldFigures(NaN, 10, 2)).toBeNull();
    expect(yieldFigures(50, NaN, 2)).toBeNull();
    expect(yieldFigures(50, 10, NaN)).toBeNull();
    expect(yieldFigures(Infinity, 10, 2)).toBeNull();
  });

  //  Rounded to four places, matching numeric(10,4), so a figure sitting
  //  exactly on a threshold reads the same in the browser and the
  //  database. 1/3 of 100 is the case that exposes a mismatch.
  it('rounds the way the database rounds', () => {
    const f = yieldFigures(3, 1, 70)!;
    expect(f.yieldPct).toBe(33.3333);
    expect(f.variancePct).toBe(-66.6667);
  });
});

describe('theoreticalFrom', () => {
  it("applies the product's stated conversion", () => {
    //  2000 tablets per kg of granule: the product states it, nothing
    //  derives it from the tablet mass.
    expect(theoreticalFrom(49.5, 2000)).toBe(99_000);
  });

  it('is the identity when the units are the same thing', () => {
    expect(theoreticalFrom(50, 1)).toBe(50);
  });

  it('refuses a factor of zero or less, which makes every yield zero', () => {
    expect(theoreticalFrom(50, 0)).toBeNull();
    expect(theoreticalFrom(50, -2)).toBeNull();
  });

  it('refuses non-finite inputs', () => {
    expect(theoreticalFrom(NaN, 1)).toBeNull();
    expect(theoreticalFrom(50, NaN)).toBeNull();
  });
});

describe('configIsValid', () => {
  const base = {
    variance_threshold_pct: 2,
    output_per_input: 1,
    input_unit: 'kg',
    output_unit: 'kg',
  };

  it('accepts a coherent config', () => {
    expect(configIsValid(base)).toBe(true);
  });

  it('accepts a threshold of zero', () => {
    expect(configIsValid({ ...base, variance_threshold_pct: 0 })).toBe(true);
  });

  it('refuses a negative threshold, which is not a tolerance', () => {
    expect(configIsValid({ ...base, variance_threshold_pct: -1 })).toBe(false);
  });

  //  A threshold of 100% or more would mean a batch that yielded nothing
  //  is within tolerance.
  it('refuses a threshold of 100% or more', () => {
    expect(configIsValid({ ...base, variance_threshold_pct: 100 })).toBe(false);
    expect(configIsValid({ ...base, variance_threshold_pct: 150 })).toBe(false);
  });

  it('refuses a conversion factor of zero or less', () => {
    expect(configIsValid({ ...base, output_per_input: 0 })).toBe(false);
  });

  it('refuses blank units', () => {
    expect(configIsValid({ ...base, input_unit: '  ' })).toBe(false);
    expect(configIsValid({ ...base, output_unit: '' })).toBe(false);
  });

  it('refuses a non-finite threshold', () => {
    expect(configIsValid({ ...base, variance_threshold_pct: NaN })).toBe(false);
  });
});

describe('adviseOnReconciliation', () => {
  //  THE OTHER HALF OF THE ITEM 11 / ITEM 12 LINE. Recording is never
  //  refused, whatever the numbers say. There is no quantity for which a
  //  screen is told not to record.
  it('never refuses to record, whatever the yield', () => {
    for (const actual of [0, 1, 25, 49, 50, 51, 500, 100_000]) {
      expect(adviseOnReconciliation(50, actual, 2).canRecord).toBe(true);
    }
    //  Including the cases where the figures cannot be computed at all.
    expect(adviseOnReconciliation(0, 10, 2).canRecord).toBe(true);
    expect(adviseOnReconciliation(50, -1, 2).canRecord).toBe(true);
  });

  it('says a within-threshold yield will not block', () => {
    const a = adviseOnReconciliation(50, 49, 2);
    expect(a.willBlock).toBe(false);
    expect(a.messages).toEqual([]);
  });

  it('says a variance beyond threshold will block, and why', () => {
    const a = adviseOnReconciliation(50, 45, 2, 'kg');
    expect(a.willBlock).toBe(true);
    expect(a.direction).toBe('shortfall');
    expect(a.messages.join(' ')).toMatch(/90%/);
    expect(a.messages.join(' ')).toMatch(/investigated and a supervisor authorises/);
  });

  it('distinguishes an overage from a shortfall', () => {
    expect(adviseOnReconciliation(50, 45, 2).direction).toBe('shortfall');
    expect(adviseOnReconciliation(50, 55, 2).direction).toBe('overage');
    expect(adviseOnReconciliation(50, 50, 2).direction).toBe('none');
  });

  //  Worth saying out loud, because an operator's instinct is that more
  //  is better. It is not: a yield above theory means the balance does
  //  not close.
  it('tells an operator why an overage is a problem at all', () => {
    const a = adviseOnReconciliation(50, 70, 2, 'kg');
    expect(a.messages.join(' ')).toMatch(/material balance does not close/);
  });

  it('does not lecture about overage on a shortfall', () => {
    const a = adviseOnReconciliation(50, 30, 2, 'kg');
    expect(a.messages.join(' ')).not.toMatch(/does not close/);
  });

  it('explains itself rather than going silent on uncomputable figures', () => {
    const a = adviseOnReconciliation(0, 10, 2);
    expect(a.figures).toBeNull();
    expect(a.willBlock).toBe(false);
    expect(a.messages.join(' ')).toMatch(/greater than zero/);
  });

  it('shows the signed variance in what it tells the operator', () => {
    expect(adviseOnReconciliation(50, 55, 2, 'kg').messages.join(' ')).toMatch(/\+10%/);
    expect(adviseOnReconciliation(50, 45, 2, 'kg').messages.join(' ')).toMatch(/-10%/);
  });
});

describe('canAuthorise', () => {
  const blocked = {
    within_threshold: false as const,
    authorised_by: null,
    investigation_required: true,
    recorded_by: 'operator',
  };

  it('a supervisor may authorise an investigated variance', () => {
    expect(canAuthorise(blocked, 'supervisor')).toBe(true);
  });

  //  The database refuses this too; the rule is in both places so a
  //  screen does not offer a button that produces an error the operator
  //  cannot act on.
  it('the person who recorded it may not', () => {
    expect(canAuthorise(blocked, 'operator')).toBe(false);
  });

  it('nobody may before the investigation', () => {
    expect(canAuthorise({ ...blocked, investigation_required: false }, 'supervisor')).toBe(false);
  });

  it('nor twice', () => {
    expect(canAuthorise({ ...blocked, authorised_by: 'someone' }, 'supervisor')).toBe(false);
  });

  //  Authorising a yield that was inside its threshold would leave a
  //  record implying there had been a problem.
  it('nor a yield that was within its threshold', () => {
    expect(canAuthorise({ ...blocked, within_threshold: true }, 'supervisor')).toBe(false);
  });

  it('nor one not yet judged', () => {
    expect(canAuthorise({ ...blocked, within_threshold: null }, 'supervisor')).toBe(false);
  });

  it('and an unknown user may not', () => {
    expect(canAuthorise(blocked, null)).toBe(false);
    expect(canAuthorise(blocked, undefined)).toBe(false);
    expect(canAuthorise(blocked, '')).toBe(false);
  });
});

describe('isOutstanding', () => {
  it('is true only for an unauthorised variance beyond threshold', () => {
    expect(isOutstanding({ within_threshold: false, authorised_by: null })).toBe(true);
    expect(isOutstanding({ within_threshold: false, authorised_by: 'sup' })).toBe(false);
    expect(isOutstanding({ within_threshold: true, authorised_by: null })).toBe(false);
    expect(isOutstanding({ within_threshold: null, authorised_by: null })).toBe(false);
  });
});

describe('the gate read — fails CLOSED', () => {
  function client(
    reply: { data?: unknown; error?: { message: string } | null } | Error,
  ): YieldGateClient {
    return {
      rpc: async () => {
        if (reply instanceof Error) throw reply;
        return { data: reply.data ?? null, error: reply.error ?? null };
      },
    };
  }

  it('is clear when the database says nothing blocks', async () => {
    const r = await checkYieldClear(client({ data: null }), 's1');
    expect(r.clear).toBe(true);
    expect(r.checkFailed).toBe(false);
  });

  it('is not clear when the database gives a reason', async () => {
    const r = await checkYieldClear(client({ data: 'Stage 1 yielded 92% of theory.' }), 's1');
    expect(r.clear).toBe(false);
    expect(r.reason).toMatch(/92%/);
    expect(r.checkFailed).toBe(false);
  });

  //  THE CASE THIS FILE EXISTS FOR. supabase-js resolves a failed query
  //  with { data: null, error }, and null is also how the gate says
  //  "nothing blocks" — so the two look alike on the wire. Reading them
  //  alike turns a network failure into permission to sign off a stage
  //  whose yield was never reconciled.
  it('an error is never clear, however it arrives', async () => {
    const onError = await checkYieldClear(client({ error: { message: 'boom' } }), 's1');
    expect(onError.clear).toBe(false);
    expect(onError.checkFailed).toBe(true);

    const onThrow = await checkYieldClear(client(new Error('network')), 's1');
    expect(onThrow.clear).toBe(false);
    expect(onThrow.checkFailed).toBe(true);

    //  Both null data AND an error: the null must not win.
    const both = await checkYieldClear(client({ data: null, error: { message: 'boom' } }), 's1');
    expect(both.clear).toBe(false);
    expect(both.checkFailed).toBe(true);
  });

  it('an unexpected shape is not clear either', async () => {
    const r = await checkYieldClear(client({ data: { nope: 1 } }), 's1');
    expect(r.clear).toBe(false);
    expect(r.checkFailed).toBe(true);
  });

  it('a missing stage id is not clear, and asks nothing', async () => {
    let called = false;
    const c: YieldGateClient = {
      rpc: async () => { called = true; return { data: null, error: null }; },
    };
    const r = await checkYieldClear(c, null);
    expect(r.clear).toBe(false);
    expect(r.checkFailed).toBe(true);
    expect(called).toBe(false);
  });

  it('the batch gate behaves identically', async () => {
    expect((await checkBatchYieldClear(client({ data: null }), 'b1')).clear).toBe(true);
    expect((await checkBatchYieldClear(client({ error: { message: 'x' } }), 'b1')).clear).toBe(false);
    expect((await checkBatchYieldClear(client(new Error('x')), 'b1')).clear).toBe(false);
    expect((await checkBatchYieldClear(client({ data: 7 }), 'b1')).clear).toBe(false);
    expect((await checkBatchYieldClear(client({ data: null }), null)).clear).toBe(false);
  });

  it('calls the right function for each scope', async () => {
    const seen: string[] = [];
    const c: YieldGateClient = {
      rpc: async (fn) => { seen.push(fn); return { data: null, error: null }; },
    };
    await checkYieldClear(c, 's1');
    await checkBatchYieldClear(c, 'b1');
    expect(seen).toEqual(['yield_block_reason', 'yield_batch_block_reason']);
  });
});

describe('the basis vocabulary', () => {
  it('every basis has a label, so a screen never shows a bare key', () => {
    for (const b of THEORETICAL_BASES) {
      expect(BASIS_LABELS[b]).toBeTruthy();
      expect(BASIS_LABELS[b]).not.toBe(b);
    }
  });

  it('matches the vocabulary the database accepts', () => {
    //  The same four, in the same spelling, as yrc_basis_chk.
    expect([...THEORETICAL_BASES].sort()).toEqual([
      'dispensed_to_batch',
      'dispensed_to_stage',
      'planned_batch_size',
      'previous_stage_output',
    ]);
  });
});
