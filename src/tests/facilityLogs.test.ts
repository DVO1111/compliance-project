/**
 * Facility logs — the service's own decisions, and the one it refuses
 * to make.
 *
 * The register's triage order, the overdue rule and the tile counts are
 * this service's logic and are tested here. Whether a reading passed is
 * NOT: `facility_log_outcome()` decides that in the database, and
 * `supabase/tests/facility_logs_test.sql` holds it with 31 assertions.
 *
 * The test that matters most here is the one asserting `recordEntry`
 * never sends `outcome`. That is the defect this feature was built to
 * avoid, and it is the same one 20261203000000 had to remove from the
 * customs flag.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const insert = vi.fn();
const single = vi.fn();
const eq = vi.fn();
const rpc = vi.fn();

vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    insert: (...a: unknown[]) => { insert(...a); return chain; },
    select: () => chain,
    single: () => single(),
    eq: (...a: unknown[]) => { eq(...a); return chain; },
    order: () => chain,
    limit: () => chain,
  });
  return { supabase: { from: vi.fn(() => chain), rpc: (...a: unknown[]) => rpc(...a) } };
});

import {
  recordEntry, listRegister, isOverdue, summarise, triageOrder, filterByTab,
  describeFacilityError, FREQUENCY_DAYS, OUTCOME_LABELS, OUTCOME_TONE,
  LOG_TYPE_TABS, LOG_TYPE_LABELS,
  type RegisterRow, type FacilityOutcome, type FacilityLogType,
} from '../lib/facility/facilityLogService';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261204000000_facility_logs.sql'),
  'utf8',
);

/** A register row with sane defaults, overridden per test. */
function row(over: Partial<RegisterRow> = {}): RegisterRow {
  return {
    schedule_id: 's1', zone_id: 'z1', zone_name: 'Granulation room G2',
    zone_grade: 'Grade D', zone_line_ref: 'Line TL-1',
    log_type: 'environmental_surface', description: 'Surface swabs, 5 sites',
    frequency: 'weekly', due_time: null,
    alert_limit: 25, action_limit: 50, result_unit: 'CFU',
    last_entry_id: 'e1', last_recorded_at: '2026-10-20T06:00:00Z',
    last_result_value: 18, last_result_position: 'C1-S4',
    last_outcome: 'within_limits', last_reference: null,
    days_since_last: 2,
    ...over,
  };
}

beforeEach(() => {
  insert.mockClear(); single.mockClear(); eq.mockClear(); rpc.mockClear();
  single.mockResolvedValue({ data: { id: 'e9', outcome: 'outside_action' }, error: null });
  rpc.mockResolvedValue({ data: [], error: null });
});

describe('recordEntry never asserts the verdict', () => {
  it('sends the measurement and no outcome', async () => {
    await recordEntry({
      companyId: 'co-1', zoneId: 'z1', scheduleId: 's1',
      logType: 'environmental_surface', recordedBy: 'u1',
      resultValue: 112, resultUnit: 'CFU', resultPosition: 'CP-3',
    });
    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.result_value).toBe(112);
    expect(payload.result_position).toBe('CP-3');
    //  The point of the whole feature's design.
    expect(payload).not.toHaveProperty('outcome');
  });

  it('reads the verdict back from the row the database returned', async () => {
    const entry = await recordEntry({
      companyId: 'co-1', zoneId: 'z1', logType: 'cleaning_routine', recordedBy: 'u1',
    });
    expect(entry.outcome).toBe('outside_action');
  });

  it('marks a test that was not carried out without inventing a result', async () => {
    await recordEntry({
      companyId: 'co-1', zoneId: 'z1', logType: 'cleaning_deep',
      recordedBy: 'u1', performed: false,
    });
    const payload = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.performed).toBe(false);
    expect(payload.result_value).toBeNull();
  });

  it('scopes the register call to one company', async () => {
    await listRegister('co-7');
    expect(rpc).toHaveBeenCalledWith('facility_log_register', { p_company_id: 'co-7' });
  });
});

describe('the outcome rule lives in the database, and says so', () => {
  it('derives the outcome in a BEFORE trigger', () => {
    expect(MIGRATION).toContain('BEFORE INSERT OR UPDATE ON public.facility_log_entries');
    expect(MIGRATION).toContain('EXECUTE FUNCTION public.fn_facility_log_outcome()');
  });

  it('overwrites whatever the caller sent', () => {
    expect(MIGRATION).toContain('NEW.outcome := public.facility_log_outcome(');
  });

  //  not_assessed exists precisely so a reading with no limit is not
  //  recorded as having passed one.
  it('keeps "no limit set" distinct from "within limits"', () => {
    expect(MIGRATION).toContain("'not_assessed'");
    expect(MIGRATION).toContain('p_alert_limit IS NULL AND p_action_limit IS NULL');
  });

  it('refuses a schedule from another zone, whose limits would be wrong', () => {
    expect(MIGRATION).toContain('FACILITY_SCHEDULE_WRONG_ZONE');
  });

  it('refuses a zone from another company', () => {
    expect(MIGRATION).toContain('FACILITY_ZONE_WRONG_COMPANY');
  });

  //  The gap found on the logistics tables, not repeated here.
  it('references companies from all three new tables', () => {
    const refs = MIGRATION.match(/REFERENCES public\.companies \(id\)/g) ?? [];
    expect(refs.length).toBeGreaterThanOrEqual(3);
  });
});

describe('overdue', () => {
  it.each<[RegisterRow['frequency'], number]>([
    ['daily', 1], ['weekly', 7], ['monthly', 30], ['quarterly', 91],
  ])('a %s test is overdue after %i day(s)', (frequency, days) => {
    expect(isOverdue(row({ frequency, days_since_last: days }))).toBe(false);
    expect(isOverdue(row({ frequency, days_since_last: days + 0.5 }))).toBe(true);
  });

  //  FL-01's "Not sampled" row. Never recorded is overdue by
  //  definition — treating it as fine would hide the one case most
  //  worth seeing.
  it('treats a test that has never been recorded as overdue', () => {
    expect(isOverdue(row({ last_recorded_at: null, days_since_last: null }))).toBe(true);
  });

  it('agrees with the frequency table it is derived from', () => {
    expect(Object.keys(FREQUENCY_DAYS).sort()).toEqual(
      ['daily', 'monthly', 'quarterly', 'weekly'],
    );
  });
});

describe('the register summary', () => {
  it('counts the outcomes FL-01 puts on tiles', () => {
    const s = summarise([
      row({ schedule_id: 'a', last_outcome: 'outside_action' }),
      row({ schedule_id: 'b', last_outcome: 'outside_alert' }),
      row({ schedule_id: 'c', last_outcome: 'within_limits' }),
      row({ schedule_id: 'd', last_outcome: null, last_recorded_at: null, days_since_last: null }),
    ]);
    expect(s.outsideAction).toBe(1);
    expect(s.outsideAlert).toBe(1);
    //  The never-recorded row is overdue.
    expect(s.overdue).toBe(1);
  });

  it('counts an overdue deep clean separately, as FL-01 does', () => {
    const s = summarise([
      row({ schedule_id: 'a', log_type: 'cleaning_deep', frequency: 'monthly', days_since_last: 40 }),
      row({ schedule_id: 'b', log_type: 'cleaning_routine', frequency: 'daily', days_since_last: 0.1 }),
    ]);
    expect(s.deepCleanOverdue).toBe(1);
    expect(s.overdue).toBe(1);
  });

  it('counts a pest finding only when it breached a limit', () => {
    const s = summarise([
      row({ schedule_id: 'a', log_type: 'pest_control', last_outcome: 'outside_action' }),
      row({ schedule_id: 'b', log_type: 'pest_control', last_outcome: 'within_limits' }),
    ]);
    expect(s.pestFindings).toBe(1);
  });

  it('counts today\'s daily tests against the number due', () => {
    const today = new Date().toISOString();
    const s = summarise([
      row({ schedule_id: 'a', frequency: 'daily', last_recorded_at: today }),
      row({ schedule_id: 'b', frequency: 'daily', last_recorded_at: '2020-01-01T00:00:00Z' }),
      row({ schedule_id: 'c', frequency: 'weekly', last_recorded_at: today }),
    ]);
    expect(s.dueToday).toBe(2);
    expect(s.doneToday).toBe(1);
  });

  it('summarises an empty register without throwing', () => {
    const s = summarise([]);
    expect(s).toMatchObject({ outsideAction: 0, overdue: 0, dueToday: 0, doneToday: 0 });
  });
});

describe('triage order — FL-01\'s "today, overdue and failed first"', () => {
  it('puts an action-limit breach first, then overdue, then alert', () => {
    const ordered = triageOrder([
      row({ schedule_id: 'ok', last_outcome: 'within_limits' }),
      row({ schedule_id: 'alert', last_outcome: 'outside_alert' }),
      row({ schedule_id: 'overdue', last_outcome: 'within_limits', days_since_last: 99 }),
      row({ schedule_id: 'action', last_outcome: 'outside_action' }),
    ]).map((r) => r.schedule_id);
    expect(ordered).toEqual(['action', 'overdue', 'alert', 'ok']);
  });

  //  A stale pass is not a pass: overdue has to outrank a clean last
  //  result, or the row that most needs attention sinks.
  it('ranks an overdue clean result above an in-date alert', () => {
    const ordered = triageOrder([
      row({ schedule_id: 'alert-in-date', last_outcome: 'outside_alert', days_since_last: 1 }),
      row({ schedule_id: 'clean-overdue', last_outcome: 'within_limits', days_since_last: 99 }),
    ]).map((r) => r.schedule_id);
    expect(ordered[0]).toBe('clean-overdue');
  });

  it('does not mutate its input', () => {
    const rows = [row({ schedule_id: 'a' }), row({ schedule_id: 'b', last_outcome: 'outside_action' })];
    const before = rows.map((r) => r.schedule_id);
    triageOrder(rows);
    expect(rows.map((r) => r.schedule_id)).toEqual(before);
  });

  it('breaks ties by zone then description, so the order is stable', () => {
    const ordered = triageOrder([
      row({ schedule_id: '2', zone_name: 'B zone', description: 'a test' }),
      row({ schedule_id: '1', zone_name: 'A zone', description: 'b test' }),
    ]).map((r) => r.schedule_id);
    expect(ordered).toEqual(['1', '2']);
  });
});

describe('tabs', () => {
  it('covers every log type exactly once across FL-01\'s four tabs', () => {
    const all = LOG_TYPE_TABS.flatMap((t) => t.type);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(
      (Object.keys(LOG_TYPE_LABELS) as FacilityLogType[]).sort(),
    );
  });

  it('filters to the chosen tab', () => {
    const rows = [
      row({ schedule_id: 'a', log_type: 'environmental_air' }),
      row({ schedule_id: 'b', log_type: 'cleaning_deep' }),
      row({ schedule_id: 'c', log_type: 'water' }),
    ];
    const cleaning = LOG_TYPE_TABS.find((t) => t.label === 'Cleaning')!.type;
    expect(filterByTab(rows, cleaning).map((r) => r.schedule_id)).toEqual(['b']);
  });

  it('names and tones every outcome, so none renders blank', () => {
    const outcomes: FacilityOutcome[] = [
      'within_limits', 'outside_alert', 'outside_action', 'not_done', 'not_assessed',
    ];
    for (const o of outcomes) {
      expect(OUTCOME_LABELS[o]?.length ?? 0).toBeGreaterThan(0);
      expect(OUTCOME_TONE[o]).toBeDefined();
    }
    //  "Recorded, no limit set" must not read as a pass.
    expect(OUTCOME_LABELS.not_assessed.toLowerCase()).not.toContain('within');
  });
});

describe('refusals keep their code', () => {
  it.each<[string, string]>([
    ['FACILITY_ZONE_WRONG_COMPANY', 'another company'],
    ['FACILITY_SCHEDULE_WRONG_ZONE', 'different zone'],
    ['FACILITY_ZONE_NOT_FOUND', 'no longer exists'],
    ['facility_schedule_limits_ordered', 'cannot be below'],
  ])('translates %s into something actionable', (raw, expected) => {
    const d = describeFacilityError(`ERROR: ${raw}: detail`);
    expect(d.message.toLowerCase()).toContain(expected.toLowerCase());
    expect(d.code).not.toBe('UNKNOWN');
  });

  it('passes an unknown message through rather than flattening it', () => {
    const d = describeFacilityError('deadlock detected');
    expect(d.code).toBe('UNKNOWN');
    expect(d.message).toContain('deadlock detected');
  });
});
