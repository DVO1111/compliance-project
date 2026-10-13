/**
 * In-process control: the zone classifier, and what a screen is told.
 *
 * TWO THINGS ARE BEING DEFENDED HERE.
 *
 * 1. THE BOUNDARIES. A zone scheme whose edges are ambiguous is five
 *    zones that sometimes mean four, and either direction of error is
 *    harmful: a limit read as exclusive raises an adjust on a tablet that
 *    was exactly on target's warning limit, every batch, until somebody
 *    stops believing the zones; a limit read too loosely passes a tablet
 *    that was over the action limit. So every edge is asserted at the
 *    value itself, not merely either side of it.
 *
 * 2. AGREEMENT WITH SQL. weight_variation_zone() in
 *    20261015000000_inprocess_control_and_oos.sql is the authority, and
 *    the same boundary table is asserted there in section D of
 *    supabase/tests/inprocess_control_test.sql. A screen that paints a
 *    reading green while the database filed it as zone 2 is worse than
 *    either answer on its own, because it is the one case nobody checks.
 *
 * And one thing is being defended by ABSENCE: nothing here, and nothing
 * in the model, refuses a reading. "An OOS reading blocks entry" is item
 * 11's first NOT DONE IF.
 */
import { describe, it, expect } from 'vitest';
import {
  weightZone,
  limitsAreOrdered,
  isInSpecification,
  adviseOnReading,
  sortByUrgency,
  describeDue,
  isOpen,
  canDecide,
  fetchSamplingDue,
  type InprocessClient,
  type ProductWeightLimits,
  type SamplingDue,
} from '../lib/pharma/inprocessModel';

/** The same limits the SQL suite uses for product A: 520 / 540 / 560 / 580
 *  around a 550 mg target, so a failure here and a failure there point at
 *  the same arithmetic. */
const LIMITS: Pick<ProductWeightLimits,
  'lal' | 'lwl' | 'uwl' | 'ual' |
  'zone_1_action' | 'zone_2u_action' | 'zone_2l_action' |
  'zone_3u_action' | 'zone_3l_action'> = {
  lal: 520,
  lwl: 540,
  uwl: 560,
  ual: 580,
  zone_1_action: 'accept',
  zone_2u_action: 'adjust',
  zone_2l_action: 'adjust',
  zone_3u_action: 'reject',
  zone_3l_action: 'reject',
};

describe('weightZone — every boundary', () => {
  //  Exactly the table in section D of the SQL suite, value for value.
  const cases: [number, string, string][] = [
    [519, '3L', 'below the lower action limit'],
    [520, '2L', 'exactly ON the lower action limit'],
    [521, '2L', 'just inside the lower action limit'],
    [539.9, '2L', 'just below the lower warning limit'],
    [540, '1', 'exactly ON the lower warning limit'],
    [550, '1', 'at target'],
    [560, '1', 'exactly ON the upper warning limit'],
    [560.1, '2U', 'just above the upper warning limit'],
    [580, '2U', 'exactly ON the upper action limit'],
    [580.1, '3U', 'just above the upper action limit'],
  ];

  for (const [value, expected, why] of cases) {
    it(`${value} mg is zone ${expected} — ${why}`, () => {
      expect(weightZone(LIMITS, value).zone).toBe(expected);
    });
  }

  it('carries the action the product configured, not a constant', () => {
    expect(weightZone(LIMITS, 550).action).toBe('accept');
    expect(weightZone(LIMITS, 570).action).toBe('adjust');
    expect(weightZone(LIMITS, 600).action).toBe('reject');

    //  THE ACTION IS CONFIGURATION. A product that resamples at the
    //  action limit instead of rejecting must get 'resample' — if this
    //  passed with the mapping hard-coded, "an action per zone" would be
    //  a column nobody reads.
    const resampler = { ...LIMITS, zone_3u_action: 'resample' as const };
    expect(weightZone(resampler, 600).action).toBe('resample');
  });

  it('reports an unconfigured product rather than defaulting it to zone 1', () => {
    const r = weightZone(null, 550);
    expect(r.zone).toBeNull();
    expect(r.action).toBeNull();
    expect(r.limitsConfigured).toBe(false);
  });

  it('does not classify a missing or non-finite value', () => {
    expect(weightZone(LIMITS, null).zone).toBeNull();
    expect(weightZone(LIMITS, undefined).zone).toBeNull();
    expect(weightZone(LIMITS, NaN).zone).toBeNull();
    //  ...but the limits ARE configured, and saying otherwise would make
    //  a screen report a configuration gap when the operator has simply
    //  not typed anything yet.
    expect(weightZone(LIMITS, null).limitsConfigured).toBe(true);
  });

  it('is per product: the same weight lands in different zones', () => {
    //  The SQL suite proves this with a second product; here it is the
    //  same function with a second limit set. A global table could not
    //  produce two answers for 550 mg.
    const other = { ...LIMITS, lal: 660, lwl: 680, uwl: 720, ual: 740 };
    expect(weightZone(LIMITS, 550).zone).toBe('1');
    expect(weightZone(other, 550).zone).toBe('3L');
  });
});

describe('limitsAreOrdered', () => {
  it('accepts a coherent set', () => {
    expect(limitsAreOrdered({ ...LIMITS, target_value: 550 })).toBe(true);
  });

  it('allows the target to sit on a warning limit', () => {
    expect(limitsAreOrdered({ ...LIMITS, target_value: 540 })).toBe(true);
    expect(limitsAreOrdered({ ...LIMITS, target_value: 560 })).toBe(true);
  });

  it('rejects swapped warning and action limits', () => {
    //  The data-entry slip this exists for: UWL and UAL transposed turns
    //  "adjust" into "reject" silently.
    expect(limitsAreOrdered({
      ...LIMITS, uwl: 580, ual: 560, target_value: 550,
    })).toBe(false);
  });

  it('rejects a target outside its own warning limits', () => {
    expect(limitsAreOrdered({ ...LIMITS, target_value: 530 })).toBe(false);
    expect(limitsAreOrdered({ ...LIMITS, target_value: 570 })).toBe(false);
  });

  it('rejects a lower action limit at or above the lower warning limit', () => {
    expect(limitsAreOrdered({ ...LIMITS, lal: 540, target_value: 550 })).toBe(false);
  });
});

describe('isInSpecification — independent of the zone', () => {
  //  The specification is 530-570 while the zone limits are
  //  520/540/560/580, so the two genuinely disagree in both directions.
  //  Anything that derived one from the other fails here.
  const spec = { min_value: 530, max_value: 570 };

  it('a reading can be IN specification and in zone 2U', () => {
    expect(isInSpecification(spec, 565)).toBe(true);
    expect(weightZone(LIMITS, 565).zone).toBe('2U');
  });

  it('and OUT of specification while still only zone 2U', () => {
    expect(isInSpecification(spec, 575)).toBe(false);
    expect(weightZone(LIMITS, 575).zone).toBe('2U');
  });

  it('is null when there is nothing to judge against', () => {
    expect(isInSpecification({ min_value: null, max_value: null }, 550)).toBeNull();
    expect(isInSpecification(spec, null)).toBeNull();
  });

  it('handles a one-sided specification', () => {
    expect(isInSpecification({ min_value: null, max_value: 1.0 }, 0.5)).toBe(true);
    expect(isInSpecification({ min_value: null, max_value: 1.0 }, 1.5)).toBe(false);
    expect(isInSpecification({ min_value: 530, max_value: null }, 9999)).toBe(true);
  });

  it('treats a value exactly on a specification limit as inside it', () => {
    expect(isInSpecification(spec, 530)).toBe(true);
    expect(isInSpecification(spec, 570)).toBe(true);
  });
});

describe('adviseOnReading', () => {
  const massSpec = {
    parameter: 'Tablet mass',
    unit: 'mg',
    min_value: 530,
    max_value: 570,
    is_weight_variation: true,
  };

  //  THE FIRST NOT DONE IF, asserted directly. There is no value, and no
  //  configuration, for which a screen is told not to save.
  it('never refuses a reading, whatever the number', () => {
    for (const v of [0, 1, 400, 519, 550, 580, 10_000, -5]) {
      expect(adviseOnReading(massSpec, LIMITS, v).canSave).toBe(true);
    }
    expect(adviseOnReading(massSpec, null, 400).canSave).toBe(true);
    expect(adviseOnReading(massSpec, LIMITS, null).canSave).toBe(true);
  });

  it('asks for an acknowledgement only when the reading is out of specification', () => {
    expect(adviseOnReading(massSpec, LIMITS, 550).needsAcknowledgement).toBe(false);
    expect(adviseOnReading(massSpec, LIMITS, 575).needsAcknowledgement).toBe(true);
  });

  it('does not ask for one merely because the zone is unhappy', () => {
    //  565 mg is zone 2U and inside the specification. The
    //  acknowledgement belongs to specification, and asking for one on
    //  every zone 2 reading would train operators to tick it blind.
    const a = adviseOnReading(massSpec, LIMITS, 565);
    expect(a.zone).toBe('2U');
    expect(a.needsAcknowledgement).toBe(false);
  });

  it('offers escalation for a zone 3 reading inside a loose specification', () => {
    //  A specification wide enough to contain the action limit. Zone 3
    //  with in_specification true is exactly the case a supervisor should
    //  see, and the one a purely spec-driven offer would miss.
    const loose = { ...massSpec, min_value: 400, max_value: 700 };
    const a = adviseOnReading(loose, LIMITS, 600);
    expect(a.inSpecification).toBe(true);
    expect(a.zone).toBe('3U');
    expect(a.offerEscalation).toBe(true);
  });

  it('offers nothing to escalate on a good reading', () => {
    expect(adviseOnReading(massSpec, LIMITS, 550).offerEscalation).toBe(false);
  });

  it('says so when the product has no limits, and still saves', () => {
    const a = adviseOnReading(massSpec, null, 550);
    expect(a.canSave).toBe(true);
    expect(a.zone).toBeNull();
    expect(a.severity).toBe('notice');
    expect(a.messages.join(' ')).toMatch(/no weight variation limits/i);
  });

  it('gives a non-weight attribute no zone at all', () => {
    const hardness = {
      parameter: 'Hardness', unit: 'N',
      min_value: 60, max_value: 100, is_weight_variation: false,
    };
    const a = adviseOnReading(hardness, LIMITS, 80);
    expect(a.zone).toBeNull();
    expect(a.action).toBeNull();
    //  And it is still judged against its own specification.
    expect(adviseOnReading(hardness, LIMITS, 110).inSpecification).toBe(false);
  });

  it('names the action the product configured in what it tells the operator', () => {
    const resampler = { ...LIMITS, zone_3u_action: 'resample' as const };
    const a = adviseOnReading({ ...massSpec, max_value: 700 }, resampler, 600);
    expect(a.messages.join(' ')).toMatch(/resample/);
  });

  it('grades severity without ever grading it into a refusal', () => {
    expect(adviseOnReading(massSpec, LIMITS, 550).severity).toBe('none');
    expect(adviseOnReading(massSpec, LIMITS, 565).severity).toBe('warning');
    expect(adviseOnReading(massSpec, LIMITS, 575).severity).toBe('alarm');
    expect(adviseOnReading({ ...massSpec, min_value: 400, max_value: 700 }, LIMITS, 600)
      .severity).toBe('alarm');
  });
});

describe('sampling prompts', () => {
  const due = (over: number, parameter: string, interval: number): SamplingDue => ({
    formula_parameter_id: `p-${parameter}`,
    parameter,
    parameter_type: 'product_attribute',
    interval_minutes: interval,
    last_recorded_at: null,
    next_due_at: '2026-10-13T08:00:00Z',
    minutes_overdue: over,
    readings_taken: 0,
  });

  it('orders the most overdue first', () => {
    const sorted = sortByUrgency([due(5, 'Hardness', 60), due(90, 'Tablet mass', 30)]);
    expect(sorted.map((d) => d.parameter)).toEqual(['Tablet mass', 'Hardness']);
  });

  it('does not mutate the list it was given', () => {
    const list = [due(5, 'a', 60), due(90, 'b', 30)];
    sortByUrgency(list);
    expect(list.map((d) => d.parameter)).toEqual(['a', 'b']);
  });

  it('says HOW overdue, not merely that something is', () => {
    //  "A sample is due" is a notification an operator learns to dismiss.
    expect(describeDue(due(0, 'Tablet mass', 30))).toMatch(/due now/);
    expect(describeDue(due(45, 'Tablet mass', 30))).toMatch(/45 min overdue/);
    expect(describeDue(due(135, 'Tablet mass', 30))).toMatch(/2 h 15 min overdue/);
  });

  it('counts readings already taken', () => {
    expect(describeDue({ ...due(5, 'Tablet mass', 30), readings_taken: 0 }))
      .toMatch(/no readings yet/);
    expect(describeDue({ ...due(5, 'Tablet mass', 30), readings_taken: 1 }))
      .toMatch(/1 reading so far/);
    expect(describeDue({ ...due(5, 'Tablet mass', 30), readings_taken: 4 }))
      .toMatch(/4 readings so far/);
  });
});

describe('fetchSamplingDue', () => {
  function client(
    reply: { data?: unknown; error?: { message: string } | null } | Error,
  ): InprocessClient {
    return {
      rpc: async () => {
        if (reply instanceof Error) throw reply;
        return { data: reply.data ?? null, error: reply.error ?? null };
      },
    };
  }

  it('returns what the server said, most overdue first', async () => {
    const rows = [
      { formula_parameter_id: 'a', parameter: 'Hardness', parameter_type: 'product_attribute',
        interval_minutes: 60, last_recorded_at: null, next_due_at: 'x',
        minutes_overdue: 5, readings_taken: 0 },
      { formula_parameter_id: 'b', parameter: 'Tablet mass', parameter_type: 'product_attribute',
        interval_minutes: 30, last_recorded_at: null, next_due_at: 'x',
        minutes_overdue: 90, readings_taken: 2 },
    ];
    const r = await fetchSamplingDue(client({ data: rows }), 's1');
    expect(r.checkFailed).toBe(false);
    expect(r.due.map((d) => d.parameter)).toEqual(['Tablet mass', 'Hardness']);
  });

  it('an empty list is not a failure', async () => {
    const r = await fetchSamplingDue(client({ data: [] }), 's1');
    expect(r.due).toEqual([]);
    expect(r.checkFailed).toBe(false);
  });

  //  THE OPPOSITE OF THE GATES. Elsewhere an unanswered question has to
  //  read as "no"; here a failure must NOT block anyone recording a
  //  reading. What it must not do is read as "nothing is due", which is
  //  why checkFailed exists at all.
  it('distinguishes "could not ask" from "nothing is due"', async () => {
    const onError = await fetchSamplingDue(client({ error: { message: 'boom' } }), 's1');
    expect(onError.due).toEqual([]);
    expect(onError.checkFailed).toBe(true);

    const onThrow = await fetchSamplingDue(client(new Error('network')), 's1');
    expect(onThrow.checkFailed).toBe(true);

    //  supabase-js RESOLVES a failed query with { data: null, error }, so
    //  a null payload is not an empty list either.
    const onNull = await fetchSamplingDue(client({ data: null }), 's1');
    expect(onNull.checkFailed).toBe(true);

    const onJunk = await fetchSamplingDue(client({ data: { nope: 1 } }), 's1');
    expect(onJunk.checkFailed).toBe(true);
  });

  it('asks nothing when there is no stage', async () => {
    let called = false;
    const c: InprocessClient = {
      rpc: async () => { called = true; return { data: [], error: null }; },
    };
    const r = await fetchSamplingDue(c, null);
    expect(called).toBe(false);
    expect(r.checkFailed).toBe(true);
  });
});

describe('escalations', () => {
  const open = { decision: null, raised_by: 'operator' } as const;
  const decided = { decision: 'reject' as const, raised_by: 'operator' };

  it('an undecided escalation is open', () => {
    expect(isOpen(open)).toBe(true);
    expect(isOpen(decided)).toBe(false);
  });

  it('the person who raised it cannot decide it', () => {
    //  The database refuses this too; the rule is in both places so a
    //  screen does not offer a button that produces an error the operator
    //  cannot act on.
    expect(canDecide(open, 'operator')).toBe(false);
    expect(canDecide(open, 'supervisor')).toBe(true);
  });

  it('nobody can decide it twice', () => {
    expect(canDecide(decided, 'supervisor')).toBe(false);
  });

  it('an unknown user cannot decide', () => {
    expect(canDecide(open, null)).toBe(false);
    expect(canDecide(open, undefined)).toBe(false);
    expect(canDecide(open, '')).toBe(false);
  });
});
