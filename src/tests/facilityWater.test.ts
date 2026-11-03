/**
 * Water treatment — FL-10 and FL-11.
 *
 * The judgement is the database's and
 * `supabase/tests/facility_water_treatment_test.sql` holds it with 57
 * assertions. Section B there is the one that matters: a pH of 4.0
 * against a range of 5.0 to 7.0 is outside limits, and the
 * environmental function would have called it a pass.
 *
 * Tested here is the client's half: that `recordResult` never sends
 * `outcome`, and that the LIMIT and LAST RESULT columns render each
 * of FL-11's four shapes of limit in the words the design uses. A
 * limit printed wrongly is a limit somebody checks a reading against
 * wrongly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const insert = vi.fn();
const eq = vi.fn();
const rpc = vi.fn();

vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    insert: (...a: unknown[]) => { insert(...a); return chain; },
    select: () => chain,
    eq: (...a: unknown[]) => { eq(...a); return chain; },
    order: () => chain,
  });
  return { supabase: { from: vi.fn(() => chain), rpc: (...a: unknown[]) => rpc(...a) } };
});

import {
  formatLimit, formatLastResult, formatLaboratory, validateWaterResult,
  recordResult, listWaterRegister, listStages, summarise, triage,
  describeWaterError, WATER_OUTCOME_LABELS, WATER_OUTCOME_TONE,
  type WaterRegisterRow,
} from '../lib/facility/facilityWaterService';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261208000000_facility_water_treatment.sql'),
  'utf8',
);

function row(over: Partial<WaterRegisterRow> = {}): WaterRegisterRow {
  return {
    test_id: 't1', source_id: 'w1', source_name: 'Purified water loop',
    source_ref: 'BH-1', test_name: 'Conductivity, RO permeate',
    sample_point: 'RO permeate', frequency: 'daily',
    limit_kind: 'max', limit_min: null, limit_max: 1.3,
    expected_text: null, result_unit: 'µS/cm',
    laboratory_kind: 'in_house', laboratory_name: 'In-house',
    last_result_id: 'r1', last_sampled_on: '2026-10-21', last_due_on: null,
    last_value: 1.1, last_text: null, last_received: true,
    last_report_ref: null, last_outcome: 'within_limits',
    ...over,
  };
}

beforeEach(() => {
  insert.mockClear(); eq.mockClear(); rpc.mockClear();
  insert.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ data: [], error: null });
});

describe('formatLimit — FL-11s four shapes', () => {
  it('prints a maximum as "or less"', () => {
    expect(formatLimit(row({ limit_kind: 'max', limit_max: 1.3 }))).toBe('1.3 or less');
  });

  it('prints a zero maximum as the bare figure', () => {
    //  FL-11's free-chlorine row reads "0.00", not "0 or less".
    expect(formatLimit(row({ limit_kind: 'max', limit_max: 0 }))).toBe('0');
  });

  it('prints a range with an en dash', () => {
    const out = formatLimit(row({ limit_kind: 'range', limit_min: 5, limit_max: 7 }));
    expect(out).toBe('5 – 7');
    //  Not a hyphen: the design uses an en dash, and a hyphen reads
    //  as a minus sign next to numbers.
    expect(out).not.toContain('-');
  });

  it('prints a qualitative expectation with its unit', () => {
    //  "Absent in 100 mL".
    expect(formatLimit(row({
      limit_kind: 'qualitative', expected_text: 'Absent',
      result_unit: '100 mL', limit_max: null,
    }))).toBe('Absent in 100 mL');
  });

  it('prints a qualitative expectation with no unit plainly', () => {
    expect(formatLimit(row({
      limit_kind: 'qualitative', expected_text: 'Absent',
      result_unit: null, limit_max: null,
    }))).toBe('Absent');
  });

  it.each([
    ['a range missing its lower bound', { limit_kind: 'range' as const, limit_min: null, limit_max: 7 }],
    ['a max missing its ceiling', { limit_kind: 'max' as const, limit_max: null }],
    ['a qualitative test with no expectation', { limit_kind: 'qualitative' as const, expected_text: null, limit_max: null }],
  ])('shows a dash rather than a broken limit for %s', (_label, over) => {
    //  The database refuses to store these, but a dash is still
    //  better than "null or less" if one ever arrives.
    expect(formatLimit(row(over))).toBe('—');
  });
});

describe('formatLastResult', () => {
  it('prints a numeric result with its unit and day', () => {
    expect(formatLastResult(row({ last_value: 1.1 }))).toBe('1.1 µS/cm · 21 Oct');
  });

  it('prints a qualitative result as its text', () => {
    expect(formatLastResult(row({
      last_value: null, last_text: 'Absent', last_sampled_on: '2026-10-15',
    }))).toBe('Absent · 15 Oct');
  });

  /*
   *  FL-11's monthly row: "Not received · due 15 Oct". This must not
   *  render as a result, and must not render as a missed test — the
   *  sample was taken and the laboratory has not reported.
   */
  it('prints an awaited laboratory report with its due date', () => {
    expect(formatLastResult(row({
      last_received: false, last_due_on: '2026-10-15', last_value: null,
    }))).toBe('Not received · due 15 Oct');
  });

  it('prints an awaited report with no due date without saying "due"', () => {
    expect(formatLastResult(row({
      last_received: false, last_due_on: null, last_value: null,
    }))).toBe('Not received');
  });

  it('says so when a test has never been sampled', () => {
    //  Distinct from a zero result, which is a real reading.
    expect(formatLastResult(row({ last_result_id: null }))).toBe('Never sampled');
  });

  it('prints a zero result as a reading, not as nothing', () => {
    expect(formatLastResult(row({ last_value: 0, result_unit: 'mg/L' })))
      .toBe('0 mg/L · 21 Oct');
  });
});

describe('formatLaboratory', () => {
  it('names an in-house laboratory', () => {
    expect(formatLaboratory(row())).toBe('In-house');
  });

  it('appends the report reference when there is one', () => {
    expect(formatLaboratory(row({
      laboratory_kind: 'external', laboratory_name: 'Labcheck Analytical',
      last_report_ref: 'LA-88412',
    }))).toBe('Labcheck Analytical · LA-88412');
  });

  it('falls back to the kind when no name is recorded', () => {
    expect(formatLaboratory(row({
      laboratory_kind: 'external', laboratory_name: null, last_report_ref: null,
    }))).toBe('External');
  });
});

describe('validateWaterResult', () => {
  it('requires a figure on a numeric test', () => {
    expect(validateWaterResult(
      { test_id: 't', sampled_on: '2026-10-21' }, 'max',
    ).result_value).toBeTruthy();
  });

  it('requires text on a qualitative test', () => {
    expect(validateWaterResult(
      { test_id: 't', sampled_on: '2026-10-21' }, 'qualitative',
    ).result_text).toBeTruthy();
  });

  it('accepts zero as a figure', () => {
    //  A free-chlorine reading of 0.00 is the compliant answer, and a
    //  falsy check would reject it.
    expect(validateWaterResult(
      { test_id: 't', sampled_on: '2026-10-21', result_value: 0 }, 'max',
    )).toEqual({});
  });

  it('requires no figure at all when the report has not come back', () => {
    expect(validateWaterResult(
      { test_id: 't', sampled_on: '2026-10-21', received: false }, 'max',
    )).toEqual({});
  });

  it('requires a sampling date', () => {
    expect(validateWaterResult(
      { test_id: 't', sampled_on: '', result_value: 1 }, 'max',
    ).sampled_on).toBeTruthy();
  });
});

describe('recordResult', () => {
  /*
   *  THE ASSERTION THAT MATTERS, and the same one FL-01's recording
   *  path carries: the client must not be able to state whether the
   *  water met its specification.
   */
  it('never sends outcome', async () => {
    await recordResult('c1', {
      test_id: 't1', sampled_on: '2026-10-21', result_value: 9.9,
      ...({ outcome: 'within_limits' } as object),
    }, 'u1');
    expect(insert.mock.calls[0][0]).not.toHaveProperty('outcome');
  });

  it('takes company_id from the caller, never from the draft', async () => {
    await recordResult('company-real', {
      test_id: 't1', sampled_on: '2026-10-21', result_value: 1,
      ...({ company_id: 'company-attacker' } as object),
    }, 'u1');
    expect((insert.mock.calls[0][0] as Record<string, unknown>).company_id)
      .toBe('company-real');
  });

  it('keeps a zero result rather than nulling it', async () => {
    await recordResult('c1', { test_id: 't1', sampled_on: '2026-10-21', result_value: 0 }, 'u1');
    expect((insert.mock.calls[0][0] as Record<string, unknown>).result_value).toBe(0);
  });

  it('defaults received to true', async () => {
    await recordResult('c1', { test_id: 't1', sampled_on: '2026-10-21', result_value: 1 }, 'u1');
    expect((insert.mock.calls[0][0] as Record<string, unknown>).received).toBe(true);
  });

  it('sends received false when the report is awaited', async () => {
    await recordResult('c1', {
      test_id: 't1', sampled_on: '2026-10-01', received: false, due_on: '2026-10-15',
    }, 'u1');
    const p = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(p.received).toBe(false);
    expect(p.due_on).toBe('2026-10-15');
  });

  it('trims text fields and nulls the empty ones', async () => {
    await recordResult('c1', {
      test_id: 't1', sampled_on: '2026-10-21', result_text: ' Absent ', report_ref: '   ',
    }, 'u1');
    const p = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(p.result_text).toBe('Absent');
    expect(p.report_ref).toBeNull();
  });
});

describe('summarise and triage', () => {
  it('counts what needs attention', () => {
    const out = summarise([
      row({ test_id: 'a', last_outcome: 'within_limits' }),
      row({ test_id: 'b', last_outcome: 'outside_limits' }),
      row({ test_id: 'c', last_outcome: 'awaiting_laboratory' }),
      row({ test_id: 'd', last_result_id: null, last_outcome: null }),
    ]);
    expect(out).toEqual({ tests: 4, outside: 1, awaiting: 1, neverSampled: 1 });
  });

  it('puts a failing result first, then an unchased report', () => {
    const out = triage([
      row({ test_id: 'ok', test_name: 'A ok', last_outcome: 'within_limits' }),
      row({ test_id: 'never', test_name: 'B never', last_result_id: null, last_outcome: null }),
      row({ test_id: 'await', test_name: 'C awaiting', last_outcome: 'awaiting_laboratory' }),
      row({ test_id: 'bad', test_name: 'D bad', last_outcome: 'outside_limits' }),
    ]);
    expect(out.map((r) => r.test_id)).toEqual(['bad', 'await', 'never', 'ok']);
  });
});

describe('the outcome vocabulary reads correctly', () => {
  it('does not present an awaited report as a pass', () => {
    expect(WATER_OUTCOME_LABELS.awaiting_laboratory.toLowerCase()).not.toContain('within');
    //  A warning rather than neutral: somebody has to chase it.
    expect(WATER_OUTCOME_TONE.awaiting_laboratory).toBe('warn');
  });

  it('does not present "not assessed" as a pass', () => {
    expect(WATER_OUTCOME_LABELS.not_assessed.toLowerCase()).not.toContain('within');
  });
});

describe('the queries are company-scoped', () => {
  it('passes the company to the register RPC', async () => {
    await listWaterRegister('c1');
    expect(rpc).toHaveBeenCalledWith('facility_water_register', { p_company_id: 'c1' });
  });

  it('filters stages by company as well as source', async () => {
    await listStages('c1', 'w1');
    expect(eq.mock.calls).toEqual([['company_id', 'c1'], ['source_id', 'w1']]);
  });
});

describe('the refusals a reader can act on', () => {
  it.each([
    ['WATER_TEST_WRONG_COMPANY', /no water test of this company/i],
    ['WATER_SOURCE_NOT_FOUND', /no water source of this company/i],
    ['facility_water_limit_shape_chk', /a range needs both ends/i],
    ['facility_water_range_ordered_chk', /cannot be below the bottom/i],
  ])('explains %s', (raw, pattern) => {
    expect(describeWaterError(raw).message).toMatch(pattern);
  });

  it('passes an unrecognised message through', () => {
    expect(describeWaterError('connection reset').message).toBe('connection reset');
  });
});

describe('the migration judges results itself', () => {
  //  Comments explain at length WHY the environmental function is not
  //  reused, so the structural assertions read executable SQL only.
  const SQL_ONLY = MIGRATION
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

  it('derives the outcome in a BEFORE trigger', () => {
    expect(SQL_ONLY).toMatch(/BEFORE INSERT OR UPDATE ON public\.facility_water_results/);
    expect(SQL_ONLY).toMatch(/NEW\.outcome := public\.facility_water_outcome\(/);
  });

  it('tests both ends of a range', () => {
    //  The whole reason this model exists. An upper-bound-only test
    //  passes a pH of 4.0 against 5.0 to 7.0.
    expect(SQL_ONLY).toMatch(/p_result_value < p_limit_min OR p_result_value > p_limit_max/);
  });

  it('checks "not received" before anything else', () => {
    const fn = SQL_ONLY.slice(SQL_ONLY.indexOf('CREATE OR REPLACE FUNCTION public.facility_water_outcome'));
    const notReceived = fn.indexOf('awaiting_laboratory');
    const qualitative = fn.indexOf("p_limit_kind = 'qualitative'");
    //  A report that has not arrived cannot be judged, and judging it
    //  as a pass would be the worst available default.
    expect(notReceived).toBeGreaterThan(-1);
    expect(notReceived).toBeLessThan(qualitative);
  });

  it('keeps the derivation IMMUTABLE', () => {
    const fn = SQL_ONLY.slice(
      SQL_ONLY.indexOf('CREATE OR REPLACE FUNCTION public.facility_water_outcome'),
      SQL_ONLY.indexOf('fn_facility_water_outcome'),
    );
    expect(fn).toMatch(/IMMUTABLE/);
  });

  it('writes no pharmacopoeial figures into the schema', () => {
    //  FL-11's monthly row says "Per WHO drinking-water list", which
    //  is a reference to somebody else's document. The actual limits
    //  are a company's own specification and belong in data.
    expect(SQL_ONLY).not.toMatch(/WHO|pharmacopoeia|USP|\bEP\b/i);
  });

  it('gives all four tables a company_id foreign key', () => {
    const fks = SQL_ONLY.match(
      /company_id\s+uuid NOT NULL REFERENCES public\.companies \(id\) ON DELETE CASCADE/g,
    ) ?? [];
    expect(fks.length).toBe(4);
  });

  it('adds no signature and raises no deviation', () => {
    expect(SQL_ONLY).not.toMatch(/electronic_signature|requires_signature/i);
    expect(SQL_ONLY).not.toMatch(/INSERT INTO public\.deviations/i);
  });
});
