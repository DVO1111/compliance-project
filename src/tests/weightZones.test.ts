/**
 * Weight zones on a workstation — W4·19.
 *
 * THREE THINGS ARE DEFENDED HERE, and they are the three the design
 * states as rules rather than as screen descriptions.
 *
 * 1. THE GLYPHS ARE DISTINGUISHABLE WITHOUT COLOUR. "Zones
 *    (distinguishable in greyscale): 1 = light circle; 2U/2L =
 *    outlined square with one arrow up/down; 3U/3L = dark solid square
 *    with two arrows. Colour is secondary." The assertion that matters
 *    is not that each zone has the right shape — it is that no two
 *    zones share a shape-plus-arrows signature, which is the property
 *    that survives a black-and-white printout and a colour vision
 *    deficiency.
 *
 * 2. THE GAUGE DOES NOT LIE. The middle three bands are to scale and
 *    the labels under them name real positions; the unbounded ends are
 *    fixed-width and a marker in one of them is clamped. A gauge that
 *    placed a marker at 3× the action limit two thirds of the way
 *    along zone 3U would be inventing a ceiling.
 *
 * 3. THE MARKER AND THE CLASSIFIER AGREE. `markerZone` comes from the
 *    band predicates, which carry the same inclusive/exclusive
 *    convention as `weightZone` and `weight_variation_zone`. A gauge
 *    whose marker sat in zone 1 while the chip beside it said 2U would
 *    be worse than either answer alone.
 */
import { describe, it, expect } from 'vitest';
import {
  ZONE_GLYPH, zoneDescription, buildGauge, parseTyped, runningAverage,
  promptStatusLine, promptDetailLine, shouldChime, progressLabel, sampleComplete,
  type ZoneBand, type ZoneOrNone,
} from '../lib/inprocess/zones';
import { weightZone } from '../lib/pharma/inprocessModel';

//  The limits IP-01 shows, which are also the test fixture's:
//  LAL 575 < LWL 590 <= target 605 <= UWL 620 < UAL 635.
const LIMITS = {
  lal: 575, lwl: 590, uwl: 620, ual: 635,
  zone_1_action: 'accept' as const,
  zone_2u_action: 'adjust' as const,
  zone_2l_action: 'adjust' as const,
  zone_3u_action: 'resample' as const,
  zone_3l_action: 'resample' as const,
};

const BANDS: ZoneBand[] = [
  { zone: '3L', action: 'resample', lowerBound: null, upperBound: 575,
    lowerInclusive: false, upperInclusive: false, boundText: 'below 575 mg', sortOrder: 1 },
  { zone: '2L', action: 'adjust', lowerBound: 575, upperBound: 590,
    lowerInclusive: true, upperInclusive: false, boundText: '575 to under 590 mg',
    sortOrder: 2 },
  { zone: '1', action: 'accept', lowerBound: 590, upperBound: 620,
    lowerInclusive: true, upperInclusive: true, boundText: '590 to 620 mg', sortOrder: 3 },
  { zone: '2U', action: 'adjust', lowerBound: 620, upperBound: 635,
    lowerInclusive: false, upperInclusive: true, boundText: 'over 620 to 635 mg',
    sortOrder: 4 },
  { zone: '3U', action: 'resample', lowerBound: 635, upperBound: null,
    lowerInclusive: false, upperInclusive: false, boundText: 'above 635 mg', sortOrder: 5 },
];

describe('the glyphs, without colour', () => {
  //  THE ONE THAT MATTERS. Not "zone 1 is a circle" — that is one
  //  branch of a lookup. This asserts the whole table is INJECTIVE on
  //  shape, fill, arrows and direction, which is the property that
  //  survives greyscale. Add a sixth zone that happens to reuse
  //  "square, tint, one arrow, up" and this fails.
  it('gives no two zones the same shape signature', () => {
    const zones: ZoneOrNone[] = ['1', '2U', '2L', '3U', '3L', 'none'];
    const signatures = zones.map((z) => {
      const g = ZONE_GLYPH[z];
      return `${g.shape}/${g.fill}/${g.arrows}/${g.direction ?? '-'}`;
    });
    expect(new Set(signatures).size).toBe(zones.length);
  });

  //  The arrow COUNT carries severity and the DIRECTION carries which
  //  way the process is drifting. Two facts from one glyph, which is
  //  why 2U and 2L differ in nothing else.
  it('counts arrows by severity and points them by direction', () => {
    expect(ZONE_GLYPH['1'].arrows).toBe(0);
    expect(ZONE_GLYPH['2U'].arrows).toBe(1);
    expect(ZONE_GLYPH['2L'].arrows).toBe(1);
    expect(ZONE_GLYPH['3U'].arrows).toBe(2);
    expect(ZONE_GLYPH['3L'].arrows).toBe(2);

    expect(ZONE_GLYPH['2U'].direction).toBe('up');
    expect(ZONE_GLYPH['2L'].direction).toBe('down');
    expect(ZONE_GLYPH['3U'].direction).toBe('up');
    expect(ZONE_GLYPH['3L'].direction).toBe('down');
  });

  it('pairs 2U with 2L and 3U with 3L in everything but direction', () => {
    const strip = (z: ZoneOrNone) => {
      const { direction, label, ...rest } = ZONE_GLYPH[z];
      void direction; void label;
      return rest;
    };
    expect(strip('2U')).toEqual(strip('2L'));
    expect(strip('3U')).toEqual(strip('3L'));
  });

  //  Zone 3 is the only filled one, which is what makes it read as a
  //  stop rather than a warning — the same device as the quarantine
  //  badge and FloorNotice's blocked variant.
  it('fills only zone 3', () => {
    expect(ZONE_GLYPH['3U'].fill).toBe('solid');
    expect(ZONE_GLYPH['3L'].fill).toBe('solid');
    for (const z of ['1', '2U', '2L', 'none'] as ZoneOrNone[]) {
      expect(ZONE_GLYPH[z].fill).toBe('tint');
    }
  });

  //  An unzoned reading is not a quiet zone 1. A product with no
  //  limits yields no zone, and drawing it as zone 1 would be a green
  //  light nobody set.
  it('draws the absence of a zone as its own thing, not as zone 1', () => {
    expect(ZONE_GLYPH.none).not.toEqual(ZONE_GLYPH['1']);
    expect(ZONE_GLYPH.none.tone).toBe('none');
    expect(zoneDescription('none')).toMatch(/no weight limits/i);
  });

  it('says every zone out loud for anybody not seeing the glyph', () => {
    for (const z of ['1', '2U', '2L', '3U', '3L', 'none'] as ZoneOrNone[]) {
      expect(zoneDescription(z).length).toBeGreaterThan(10);
    }
    expect(zoneDescription('2U')).toMatch(/above the warning limit/i);
    expect(zoneDescription('3L')).toMatch(/below the action limit/i);
  });
});

describe('the gauge', () => {
  it('lays the bands out low to high', () => {
    const g = buildGauge(BANDS, null);
    expect(g.segments.map((s) => s.zone)).toEqual(['3L', '2L', '1', '2U', '3U']);
  });

  it('adds up to the full width', () => {
    const g = buildGauge(BANDS, null);
    const total = g.segments.reduce((sum, s) => sum + s.widthPct, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  //  THE BOUNDED MIDDLE IS TO SCALE. Zone 1 spans 30 mg and each zone
  //  2 spans 15, so zone 1 must be exactly twice as wide as either —
  //  that is what makes the four limit labels under it real positions
  //  rather than decoration.
  it('draws the bounded bands in true proportion to their spans', () => {
    const g = buildGauge(BANDS, null);
    const w = (z: string) => g.segments.find((s) => s.zone === z)!.widthPct;
    expect(w('1') / w('2U')).toBeCloseTo(2, 6);
    expect(w('2L')).toBeCloseTo(w('2U'), 6);
  });

  //  ...and the unbounded ends are NOT to scale, equally and visibly.
  //  A fixed width out here is the gauge declining to invent a ceiling.
  it('gives the unbounded ends a fixed, equal share and marks them', () => {
    const g = buildGauge(BANDS, null);
    const low = g.segments.find((s) => s.zone === '3L')!;
    const high = g.segments.find((s) => s.zone === '3U')!;
    expect(low.widthPct).toBeCloseTo(high.widthPct, 6);
    expect(low.unbounded).toBe(true);
    expect(high.unbounded).toBe(true);
    expect(g.segments.filter((s) => s.unbounded)).toHaveLength(2);
  });

  //  The labels name the four limits, each at the left edge it
  //  describes. The leftmost band has no left edge, so its slot is
  //  empty rather than carrying its neighbour's label.
  it('labels the four limits at the edges they belong to', () => {
    const g = buildGauge(BANDS, null);
    expect(g.segments.map((s) => s.edgeLabel))
      .toEqual([null, 'LAL', 'LWL', 'UWL', 'UAL']);
    expect(g.segments.map((s) => s.edgeValue))
      .toEqual([null, 575, 590, 620, 635]);
  });

  //  ═══ THE ONE THAT MATTERS ═══
  //  The marker and the classifier must agree at every boundary. Both
  //  carry the convention that a warning limit belongs to zone 1 and
  //  an action limit to zone 2; if they ever diverge, a gauge paints a
  //  reading in a band the database filed it outside of.
  it('puts the marker in the zone the classifier assigns, at every edge', () => {
    for (const v of [500, 574, 575, 589, 590, 605, 620, 621, 635, 636, 900]) {
      const fromGauge = buildGauge(BANDS, v).markerZone;
      const fromClassifier = weightZone(LIMITS, v).zone;
      expect(fromGauge, `value ${v}`).toBe(fromClassifier);
    }
  });

  it('places a value inside a bounded band proportionally within it', () => {
    const g = buildGauge(BANDS, 605);       // dead centre of zone 1
    const before = g.segments
      .filter((s) => s.sortOrder < 3)
      .reduce((sum, s) => sum + s.widthPct, 0);
    const zone1 = g.segments.find((s) => s.zone === '1')!;
    expect(g.markerPct).toBeCloseTo(before + zone1.widthPct / 2, 6);
  });

  //  CLAMPED, so a wildly out-of-range value cannot be read as a
  //  magnitude. 700 mg and 7,000 mg are both "well past the action
  //  limit"; the gauge says that and the figure beside it says which.
  it('clamps a marker in an unbounded end rather than running off', () => {
    const far = buildGauge(BANDS, 700).markerPct!;
    const absurd = buildGauge(BANDS, 7000).markerPct!;
    expect(far).toBeLessThanOrEqual(100);
    expect(absurd).toBeLessThanOrEqual(100);
    expect(absurd).toBeCloseTo(far, 6);
    expect(buildGauge(BANDS, 1).markerPct!).toBeGreaterThanOrEqual(0);
  });

  it('places no marker when there is nothing to place', () => {
    expect(buildGauge(BANDS, null).markerPct).toBeNull();
    expect(buildGauge(BANDS, null).markerZone).toBeNull();
    expect(buildGauge(BANDS, NaN).markerPct).toBeNull();
  });

  //  No bands means no gauge, which is what an unconfigured product
  //  gets. Five empty bands would draw a scale nobody set.
  it('draws nothing for a product with no limits', () => {
    const g = buildGauge([], 605);
    expect(g.segments).toHaveLength(0);
    expect(g.markerPct).toBeNull();
  });
});

describe('the field', () => {
  //  CANNOT BE FALSE. Item 11's first NOT DONE IF is "an OOS reading
  //  blocks entry", and the type says so: `canSave: true`. Asserted
  //  across the range so that making it conditional breaks a test and
  //  not only a type.
  it('never refuses a value, however far out', () => {
    for (const t of ['0', '1', '605', '700', '99999', '-5', '0.0001']) {
      expect(parseTyped(t).canSave).toBe(true);
    }
  });

  //  A partial entry is null, not zero. "." is somebody halfway
  //  through typing, and a reading of zero is a catastrophe — they
  //  must not look alike.
  it('treats a partial entry as nothing typed, not as zero', () => {
    expect(parseTyped('').value).toBeNull();
    expect(parseTyped('.').value).toBeNull();
    expect(parseTyped('   ').value).toBeNull();
    expect(parseTyped('-').value).toBeNull();
    expect(parseTyped('0').value).toBe(0);
  });

  //  The text is kept exactly as typed: "60", "60." and "60.0" are
  //  three different things mid-entry, and normalising them makes the
  //  field fight the keypad.
  it('keeps what was typed exactly as typed', () => {
    expect(parseTyped('605.').text).toBe('605.');
    expect(parseTyped('605.0').value).toBe(605);
    expect(parseTyped('605.').value).toBe(605);
  });

  it('averages what is recorded, to one decimal place', () => {
    expect(runningAverage([604, 611, 598, 607])).toBe(605);
    expect(runningAverage([604, 611, 599])).toBe(604.7);
  });

  //  An average of no readings is not zero.
  it('has no average before anything is recorded', () => {
    expect(runningAverage([])).toBeNull();
    expect(runningAverage([NaN])).toBeNull();
  });

  //  Says the denominator, because a sample of twenty is a defined
  //  test and an operator who stops at twelve has not taken it.
  it('names the denominator in the progress label', () => {
    expect(progressLabel(14, 20)).toBe('14 of 20 weighed');
    expect(sampleComplete(19, 20)).toBe(false);
    expect(sampleComplete(20, 20)).toBe(true);
    expect(sampleComplete(21, 20)).toBe(true);
  });
});

describe('the sample due prompt', () => {
  //  Says HOW overdue. "A sample is due" is a notification an operator
  //  learns to dismiss, and the gap between due and taken is the
  //  number an inspector asks about.
  it('names the minutes it is overdue', () => {
    expect(promptStatusLine({ minutesOverdue: 2 })).toBe('SAMPLE DUE NOW · 2 MIN OVERDUE');
    expect(promptStatusLine({ minutesOverdue: 0.4 })).toBe('SAMPLE DUE NOW');
    expect(promptStatusLine({ minutesOverdue: 95 }))
      .toBe('SAMPLE DUE NOW · 1 H 35 MIN OVERDUE');
  });

  it('counts down before it is due, rather than claiming it is', () => {
    expect(promptStatusLine({ minutesOverdue: -8 })).toBe('SAMPLE DUE IN 8 MIN');
    expect(promptStatusLine({ minutesOverdue: -95 })).toBe('SAMPLE DUE IN 1 H 35 MIN');
  });

  //  "The tablet chimes every minute until it's taken" — said on
  //  screen, because a prompt that chimes without saying it will keep
  //  chiming reads as a fault.
  it('says that it will keep chiming', () => {
    const detail = promptDetailLine({
      minutesOverdue: 2, intervalMinutes: 30, dueAt: '10:30',
      parameter: 'Tablet mass', checkNumber: 14,
      alsoChecking: ['Hardness', 'Thickness'],
    });
    expect(detail).toContain('Due 10:30');
    expect(detail).toMatch(/chimes every minute/i);
    expect(detail).toMatch(/hardness and thickness/i);
  });

  //  ═══ THE ONE THAT MATTERS ═══
  //  Once per overdue minute, and NEVER before it is due. A prompt
  //  that chimed while counting down would make the overdue chime mean
  //  nothing, which is how a workstation's volume gets turned down and
  //  no prompt is ever heard again.
  it('chimes once a minute, and not at all before it is due', () => {
    expect(shouldChime(-1, null)).toBe(false);
    expect(shouldChime(-0.5, null)).toBe(false);

    expect(shouldChime(0, null)).toBe(true);
    //  Same minute, already chimed: silent.
    expect(shouldChime(0.9, 0)).toBe(false);
    //  Next minute: chimes.
    expect(shouldChime(1, 0)).toBe(true);
    expect(shouldChime(1.4, 1)).toBe(false);
    expect(shouldChime(2, 1)).toBe(true);
  });

  //  Never twice for the same minute, however often the clock ticks —
  //  a component re-rendering four times a second must not produce
  //  four chimes.
  it('never chimes twice for one minute', () => {
    let last: number | null = null;
    let chimes = 0;
    //  Ticks counted in tenths as integers rather than accumulated as
    //  0.1 floats, which never lands on 3.0 exactly and would make the
    //  fixture, not the rule, decide the answer.
    for (let tick = 0; tick <= 30; tick += 1) {
      const t = tick / 10;
      if (shouldChime(t, last)) { chimes += 1; last = Math.floor(t); }
    }
    expect(chimes).toBe(4);     // minutes 0, 1, 2, 3
  });
});
