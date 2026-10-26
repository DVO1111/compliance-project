/**
 * Facility logs, part 3 — trends (FL-06 / FL-07).
 *
 * The weekly maximum is the database's job and
 * `supabase/tests/facility_log_trend_test.sql` holds it with 24
 * assertions, including the one that matters: a week of 10, 10, 10
 * and 112 reports 112 and not the mean of 35.5, which would sit under
 * an action limit of 100 and draw as comfortable.
 *
 * What is tested here is the part the client decides:
 *
 *   - `bandFor`, which picks the POINT SHAPE. FL-06 forbids
 *     colour-only meaning, so the shape is the meaning and getting it
 *     wrong is a correctness bug, not a styling one.
 *   - `summariseTrend`, the sentence the design prints under each zone
 *     name — including the one threshold the design does not state.
 *   - `trendToCsv`, which must agree with the chart because
 *     "Show as table gives the same numbers".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rpc = vi.fn();
vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
  });
  return { supabase: { from: vi.fn(() => chain), rpc: (...a: unknown[]) => rpc(...a) } };
});

import {
  bandFor, groupTrend, summariseTrend, trendToCsv, listTrend,
  BAND_LEGEND, TREND_RANGES, TREND_LOG_TYPES, RISING_RUN_MIN_POINTS,
  describeProtocol, SAMPLE_METHOD_LABELS, SAMPLE_METHOD_LOG_TYPE,
  TREND_METHOD_TABS,
  type TrendRow, type TrendSeries,
} from '../lib/facility/facilityLogService';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261206000000_facility_log_trend.sql'),
  'utf8',
);

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
});

/** A trend row with defaults; `week` is an offset in weeks. */
function row(over: Partial<TrendRow> = {}): TrendRow {
  return {
    zone_id: 'z1', zone_name: 'Compression hall C1', zone_grade: 'Grade D',
    week_start: '2026-09-07', max_value: 20, max_recorded_at: '2026-09-09T06:00:00Z',
    sample_count: 1, result_unit: 'CFU', alert_limit: 50, action_limit: 100,
    //  Added with 20261210000000: a trend row now says which sampling
    //  method it charted, because settle plates and active air measure
    //  different quantities and must never share an axis.
    sample_method: 'settle_plate',
    //  And the denominator it was read against, so a chart can print
    //  "per plate per 4h" instead of a bare count.
    protocol_exposure_minutes: 240,
    protocol_volume_litres: null,
    ...over,
  };
}

function series(values: number[], over: Partial<TrendSeries> = {}): TrendSeries {
  const rows = values.map((v, i) => row({
    week_start: `2026-09-${String(7 + i * 7).padStart(2, '0')}`,
    max_value: v,
    max_recorded_at: `2026-09-${String(9 + i * 7).padStart(2, '0')}T06:00:00Z`,
  }));
  return { ...groupTrend(rows)[0], ...over };
}

describe('bandFor — the point shape, which is the meaning', () => {
  it('is within when under both limits', () => {
    expect(bandFor(20, 50, 100)).toBe('within');
  });

  it('is above alert once it passes the alert limit', () => {
    expect(bandFor(51, 50, 100)).toBe('above_alert');
  });

  it('is outside action once it passes the action limit', () => {
    expect(bandFor(112, 50, 100)).toBe('outside_action');
  });

  /*
   *  Tests action BEFORE alert, deliberately matching the order in
   *  `facility_log_outcome()`. If this were reversed, a 112 against
   *  50/100 would draw as a hollow square ("above alert") while the
   *  row it came from is recorded as outside the action limit — the
   *  chart would contradict the record.
   */
  it('prefers outside_action when a value passes both limits', () => {
    expect(bandFor(500, 50, 100)).toBe('outside_action');
  });

  it('treats a value exactly on a limit as not having passed it', () => {
    //  The database uses `>`, not `>=`. The client must agree, or a
    //  reading of exactly 100 draws as a breach and reads as a pass.
    expect(bandFor(50, 50, 100)).toBe('within');
    expect(bandFor(100, 50, 100)).toBe('above_alert');
  });

  it('copes with one or both limits missing', () => {
    expect(bandFor(900, null, null)).toBe('within');
    expect(bandFor(900, null, 100)).toBe('outside_action');
    expect(bandFor(900, 50, null)).toBe('above_alert');
  });

  it('handles a zero limit, which means any detection is a breach', () => {
    expect(bandFor(0.5, null, 0)).toBe('outside_action');
    expect(bandFor(0, null, 0)).toBe('within');
  });
});

describe('groupTrend — one series per chart', () => {
  it('splits rows by zone', () => {
    const out = groupTrend([
      row({ zone_id: 'a', zone_name: 'Alpha' }),
      row({ zone_id: 'b', zone_name: 'Bravo' }),
      row({ zone_id: 'a', zone_name: 'Alpha', week_start: '2026-09-14' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((s) => s.zoneId === 'a')!.points).toHaveLength(2);
  });

  it('orders points oldest first, whatever order they arrived in', () => {
    const out = groupTrend([
      row({ week_start: '2026-09-21' }),
      row({ week_start: '2026-09-07' }),
      row({ week_start: '2026-09-14' }),
    ]);
    expect(out[0].points.map((p) => p.weekStart))
      .toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
  });

  it('puts the worst chart first', () => {
    //  Same triage reasoning as FL-01's table: the chart that breached
    //  an action limit is the one to read.
    const out = groupTrend([
      row({ zone_id: 'clean', zone_name: 'A clean zone', max_value: 10 }),
      row({ zone_id: 'bad', zone_name: 'Zzz breached', max_value: 112 }),
      row({ zone_id: 'warn', zone_name: 'Mmm alerted', max_value: 60 }),
    ]);
    expect(out.map((s) => s.zoneId)).toEqual(['bad', 'warn', 'clean']);
  });

  it('coerces numeric strings, which is how pg returns numeric', () => {
    //  `numeric` arrives as a string over the wire. Left uncoerced,
    //  '112' > '50' is a string comparison and sorting breaks.
    const out = groupTrend([
      row({ max_value: '112' as unknown as number, sample_count: '4' as unknown as number }),
    ]);
    expect(out[0].points[0].value).toBe(112);
    expect(typeof out[0].points[0].value).toBe('number');
    expect(out[0].points[0].samples).toBe(4);
  });
});

describe('summariseTrend — the sentence FL-06 prints', () => {
  it('reports a rising run with its start and both ends', () => {
    const s = summariseTrend(series([28, 60, 112]));
    expect(s.direction).toBe('rising');
    expect(s.sentence).toMatch(/risen every week since/);
    expect(s.sentence).toContain('28 → 112 CFU');
  });

  it('names both crossings separately', () => {
    //  Crossing the alert limit and crossing the action limit are
    //  different events with different consequences.
    const s = summariseTrend(series([28, 60, 112]));
    expect(s.sentence).toMatch(/the alert limit on/);
    expect(s.sentence).toMatch(/the action limit on/);
  });

  it('omits the crossing clause when nothing was crossed', () => {
    const s = summariseTrend(series([5, 10, 20]));
    expect(s.direction).toBe('rising');
    expect(s.sentence).not.toMatch(/Crossed/);
  });

  /*
   *  THE THRESHOLD THE DESIGN DOES NOT STATE. FL-06 shows a "rising"
   *  narrative and a "Flat, except …" narrative but never says where
   *  the line between them falls. Three points is the choice, because
   *  two points is only "the last reading was higher than the one
   *  before", which happens constantly.
   *
   *  Pinned here so that changing it has to be a decision.
   */
  it('needs three points to call a series rising', () => {
    expect(RISING_RUN_MIN_POINTS).toBe(3);
    expect(summariseTrend(series([28, 112])).direction).toBe('flat');
    expect(summariseTrend(series([28, 60, 112])).direction).toBe('rising');
  });

  it('only counts the trailing run, not an earlier one', () => {
    //  Rose, fell, then rose twice. The trailing run is 2 points, so
    //  this is not "rising every week".
    expect(summariseTrend(series([10, 20, 30, 5, 10])).direction).toBe('flat');
  });

  it('reports a flat series with no breach plainly', () => {
    const s = summariseTrend(series([10, 12, 9, 11]));
    expect(s.direction).toBe('flat');
    expect(s.worstBand).toBe('within');
    expect(s.sentence).toMatch(/stayed within limits/);
  });

  it('names the excepted weeks on a flat series, with the day', () => {
    //  The design's second chart reads "Flat, except week of 13 Oct:
    //  52 on 18 Oct" — the week AND the day the reading was taken.
    const s = summariseTrend(series([10, 60, 10, 12]));
    expect(s.sentence).toMatch(/^Flat, except week of /);
    expect(s.sentence).toContain('60 CFU on');
  });

  it('caps the named exceptions rather than printing a paragraph', () => {
    const s = summariseTrend(series([60, 61, 10, 62, 63, 12]));
    expect(s.sentence).toMatch(/and \d+ more\.$/);
  });

  it('builds the badge from direction and the worst band', () => {
    expect(summariseTrend(series([28, 60, 112])).badge).toBe('Rising · outside action limit');
    expect(summariseTrend(series([10, 60, 10, 12])).badge).toBe('Flat · above alert limit');
    expect(summariseTrend(series([10, 12, 11, 10])).badge).toBe('Flat · within limits');
  });

  it('reports the worst band even when it is not the last point', () => {
    //  A series that breached and then recovered has still breached.
    const s = summariseTrend(series([112, 10, 10, 10]));
    expect(s.worstBand).toBe('outside_action');
  });

  it('says so when there are no readings rather than drawing nothing', () => {
    const s = summariseTrend({
      zoneId: 'z', zoneName: 'Empty', zoneGrade: null, unit: null,
      alertLimit: null, actionLimit: null, sampleMethod: null,
      protocolExposureMinutes: null, protocolVolumeLitres: null, points: [],
    });
    expect(s.sentence).toMatch(/No measured readings/);
    expect(s.badge).toBe('No readings');
  });

  it('omits the unit when there is none, without printing "undefined"', () => {
    const s = summariseTrend(series([1, 2, 3], { unit: null }));
    expect(s.sentence).not.toMatch(/undefined|null/);
  });
});

describe('trendToCsv — the same numbers as the chart', () => {
  it('emits one row per point with a header', () => {
    const csv = trendToCsv([series([28, 60, 112])]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Week starting');
    expect(lines).toHaveLength(4);
  });

  it('names the standing in words, as the legend does', () => {
    //  A CSV has no shapes, so the band has to be spelled out — and
    //  with the same wording the legend uses.
    const csv = trendToCsv([series([112])]);
    expect(csv).toContain(BAND_LEGEND.outside_action);
  });

  it('escapes a quote in a zone name instead of breaking the row', () => {
    const s = series([10], { zoneName: 'The "cold" room' });
    const csv = trendToCsv([s]);
    expect(csv).toContain('"The ""cold"" room"');
    expect(csv.split('\n')).toHaveLength(2);
  });

  it('carries the limits, so a reader can check the standing themselves', () => {
    const csv = trendToCsv([series([112])]);
    expect(csv).toContain('50');
    expect(csv).toContain('100');
  });
});

describe('listTrend', () => {
  it('passes the company, log type and window to the RPC', async () => {
    await listTrend('c1', 'environmental_air', 4);
    expect(rpc).toHaveBeenCalledWith('facility_log_trend', {
      p_company_id: 'c1', p_log_type: 'environmental_air', p_weeks: 4,
      //  Null means every method, which is what this three-argument
      //  call meant before 20261210000000 added the filter.
      p_sample_method: null,
    });
  });

  it('passes a named method through, so a tab charts only its own', async () => {
    //  The whole reason the filter exists: a settle-plate chart must
    //  not include active-air readings, because the two measure
    //  different quantities and would share one axis and one limit.
    await listTrend('c1', 'environmental_air', 4, 'settle_plate');
    expect(rpc).toHaveBeenCalledWith('facility_log_trend', {
      p_company_id: 'c1', p_log_type: 'environmental_air', p_weeks: 4,
      p_sample_method: 'settle_plate',
    });
  });

  it('surfaces a refusal rather than returning an empty chart', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    await expect(listTrend('c1', 'environmental_air', 4)).rejects.toThrow(/permission denied/);
  });
});

describe('what trends, and what the design fixes', () => {
  it('offers only the measured log types', () => {
    //  A cleaning or pest record is done or not done. Offering it a
    //  trend tab would promise a chart that is always empty.
    expect(TREND_LOG_TYPES).toEqual(['environmental_air', 'environmental_surface']);
  });

  it("offers FL-06's three periods", () => {
    expect(TREND_RANGES.map((r) => r.label)).toEqual(['4 weeks', '12 weeks', '6 months']);
  });

  it('names the shape in every legend string, not the colour', () => {
    //  FL-07 is the greyscale check. If a legend entry said "red
    //  square" it would fail that check, and read wrongly aloud.
    for (const text of Object.values(BAND_LEGEND)) {
      expect(text).toMatch(/\((filled circle|hollow square|solid square)\)/);
    }
  });

  it('aggregates by maximum in the migration, not by mean', () => {
    //  The whole point of FL-06's subtitle. A mean hides the single
    //  excursion the screen exists to surface.
    expect(MIGRATION).toMatch(/max\(s\.result_value\) AS max_value/);
    expect(MIGRATION).not.toMatch(/avg\(s\.result_value\)/);
  });

  it('keeps the trend function SECURITY INVOKER', () => {
    expect(MIGRATION).toMatch(/SECURITY INVOKER/);
    expect(MIGRATION).not.toMatch(/SECURITY DEFINER/);
  });

  it('plots nothing that has no number', () => {
    expect(MIGRATION).toMatch(/result_value IS NOT NULL/);
  });

  it('writes nothing', () => {
    for (const forbidden of [/\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /CREATE TRIGGER/i]) {
      expect(MIGRATION).not.toMatch(forbidden);
    }
  });
});

/*
 *  Sampling methods (20261210000000). Settle plates and active air
 *  both measure "air", and both report a count, but they are not the
 *  same measurement: one is colonies landing on a plate over a stated
 *  exposure, the other is colonies recovered from a stated volume
 *  drawn through a sampler. A count without its denominator is not a
 *  result, and the two must never share an axis or a limit.
 */
describe('sampling methods', () => {
  it('keeps settle plates and active air as distinct methods', () => {
    expect(SAMPLE_METHOD_LABELS.settle_plate).not.toBe(SAMPLE_METHOD_LABELS.active_air);
    //  Both are air methods, which is exactly why the method filter
    //  exists: log_type alone cannot separate them.
    expect(SAMPLE_METHOD_LOG_TYPE.settle_plate).toBe('environmental_air');
    expect(SAMPLE_METHOD_LOG_TYPE.active_air).toBe('environmental_air');
    expect(SAMPLE_METHOD_LOG_TYPE.surface_swab).toBe('environmental_surface');
  });

  it('offers each method as its own FL-06 tab', () => {
    expect(TREND_METHOD_TABS).toHaveLength(3);
    expect(new Set(TREND_METHOD_TABS).size).toBe(3);
    for (const m of TREND_METHOD_TABS) expect(SAMPLE_METHOD_LABELS[m]).toBeTruthy();
  });

  it('prints the denominator each method is actually read against', () => {
    //  Exposure for a plate, volume for a sampler — never the other
    //  way round, and never one borrowed for the other.
    expect(describeProtocol('settle_plate', 240, null)).toMatch(/\b4\s?h\b/);
    expect(describeProtocol('active_air', null, 1000)).toMatch(/1000|1 m/);
    expect(describeProtocol('settle_plate', 240, null)).not.toMatch(/m³|litre/i);
  });

  it('says nothing rather than inventing a denominator it was not given', () => {
    expect(describeProtocol('settle_plate', null, null)).toBeNull();
    expect(describeProtocol('active_air', null, null)).toBeNull();
    expect(describeProtocol(null, 240, 1000)).toBeNull();
  });

  it('carries the protocol on the series, so the chart can caption it', () => {
    const [s] = groupTrend([
      row({ sample_method: 'active_air', protocol_exposure_minutes: null,
            protocol_volume_litres: 1000, result_unit: 'CFU/m3' }),
    ]);
    expect(s.sampleMethod).toBe('active_air');
    expect(s.protocolVolumeLitres).toBe(1000);
    expect(s.protocolExposureMinutes).toBeNull();
    expect(describeProtocol(
      s.sampleMethod, s.protocolExposureMinutes, s.protocolVolumeLitres,
    )).toBeTruthy();
  });

  it('never averages two methods into one series', () => {
    /*
     *  The failure this guards. One zone, one week, both air methods:
     *  3 on plates against a limit of 2, and 3 per m³ against a limit
     *  of 10. Merged, the zone reads as one comfortable series. Kept
     *  apart, the plate series is a breach.
     */
    const series = groupTrend([
      row({ zone_id: 'zA', sample_method: 'settle_plate', max_value: 3,
            alert_limit: 1, action_limit: 2, result_unit: 'CFU/plate/4h',
            protocol_exposure_minutes: 240, protocol_volume_litres: null }),
      row({ zone_id: 'zA', sample_method: 'active_air', max_value: 3,
            alert_limit: 5, action_limit: 10, result_unit: 'CFU/m3',
            protocol_exposure_minutes: null, protocol_volume_litres: 1000 }),
    ]);
    expect(series).toHaveLength(2);
    const bands = series.map((s) => summariseTrend(s).worstBand).sort();
    expect(bands).toEqual(['outside_action', 'within']);
  });

  it('asks the database for one method at a time', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await listTrend('c1', 'environmental_air', 12, 'active_air');
    expect(rpc).toHaveBeenCalledWith('facility_log_trend', expect.objectContaining({
      p_sample_method: 'active_air',
    }));
  });
});
