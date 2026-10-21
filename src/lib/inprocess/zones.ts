/**
 * Weight zones on a workstation — W4·19.
 *
 * The design states one rule for this section the way W4·18 stated one
 * for the floor, as a definition rather than a screen description:
 *
 *   "Zones (distinguishable in greyscale): 1 = light circle; 2U/2L =
 *    outlined square with one arrow up/down; 3U/3L = dark solid square
 *    with two arrows. Colour is secondary."
 *
 * WHY "COLOUR IS SECONDARY" IS LOAD-BEARING AND NOT A COURTESY. A zone
 * chip is 28 px of type on a tablet held under factory lighting, often
 * behind a screen protector, sometimes by somebody with a colour vision
 * deficiency, and sometimes printed to paper by an inspector in black
 * and white. Amber-on-cream against green-on-cream survives none of
 * those reliably. The SHAPE does: a circle is not a square, one arrow
 * is not two, and an outline is not a fill. So the glyph is the
 * primary signal and the palette agrees with it.
 *
 * WHICH MEANS THE GLYPH CANNOT BE A PER-SCREEN DECISION. There are
 * chips in five places — the shift history, the recorded grid, the
 * live typing panel, the zone key and the running average — and if
 * each picked its own shape, the one drawn last would be a circle with
 * an arrow in it. ZONE_GLYPH below is the single table, and the
 * components read it.
 *
 * NOTHING HERE REFUSES A READING. Item 11's first NOT DONE IF is "an
 * OOS reading blocks entry", and this module classifies and describes;
 * it has no predicate a screen could disable a button from. The live
 * conditions come back from the database in W4·18's flagged/blocked
 * shape, every row flagged, and `FloorNotice` renders them.
 */

import type { WeightZone, ZoneAction } from '../pharma/inprocessModel';

// ── the glyph table ──────────────────────────────────────────────────

/** The absence of a zone, which is a thing a chip has to be able to
 *  show: a product with no weight limits yields an unzoned reading, and
 *  drawing it as zone 1 would be a green light nobody set. */
export type ZoneOrNone = WeightZone | 'none';

export interface ZoneGlyph {
  /** The shape. A circle for zone 1, a square for everything else —
   *  the first thing the eye separates, before any colour. */
  shape: 'circle' | 'square';
  /** How the shape is drawn. Zone 3 is the only filled one, which is
   *  what makes it read as a stop rather than a warning. */
  fill: 'tint' | 'solid';
  /** How many arrows, and which way. Zero for zone 1 and for an
   *  unzoned reading, one for zone 2, two for zone 3. */
  arrows: 0 | 1 | 2;
  direction: 'up' | 'down' | null;
  /** The text in the chip. "1", "2U", "3L" — the brief's own names. */
  label: string;
  /** Which token family paints it. */
  tone: 'zone1' | 'zone2' | 'zone3' | 'none';
}

/**
 * The one table. Five zones and the absence of one.
 *
 * The arrow count carries the severity and the direction carries which
 * way the process is drifting, which is why 2U and 2L share every
 * other property: an operator reads "one arrow, pointing up" as
 * "slightly heavy", and that is two independent facts from one glyph.
 */
export const ZONE_GLYPH: Record<ZoneOrNone, ZoneGlyph> = {
  '1':  { shape: 'circle', fill: 'tint',  arrows: 0, direction: null,
          label: '1',  tone: 'zone1' },
  '2U': { shape: 'square', fill: 'tint',  arrows: 1, direction: 'up',
          label: '2U', tone: 'zone2' },
  '2L': { shape: 'square', fill: 'tint',  arrows: 1, direction: 'down',
          label: '2L', tone: 'zone2' },
  '3U': { shape: 'square', fill: 'solid', arrows: 2, direction: 'up',
          label: '3U', tone: 'zone3' },
  '3L': { shape: 'square', fill: 'solid', arrows: 2, direction: 'down',
          label: '3L', tone: 'zone3' },
  //  Not a sixth zone. A dashed grey square with a dash in it: visibly
  //  not a measurement anybody judged.
  none: { shape: 'square', fill: 'tint',  arrows: 0, direction: null,
          label: '–',  tone: 'none' },
};

/** What a chip should say out loud, for a screen reader and for the
 *  `title` a supervisor hovers. The glyph carries this visually; a
 *  label carries it to everybody else. */
export function zoneDescription(zone: ZoneOrNone): string {
  switch (zone) {
    case '1':  return 'Zone 1 — inside the warning limits';
    case '2U': return 'Zone 2U — above the warning limit';
    case '2L': return 'Zone 2L — below the warning limit';
    case '3U': return 'Zone 3U — above the action limit';
    case '3L': return 'Zone 3L — below the action limit';
    default:   return 'No zone — this product has no weight limits configured';
  }
}

/** Zone actions, in the design's words. "1 accept, 2 adjust, 3 resample
 *  (reject since last good check if repeated)" is the design's own
 *  proposal and the first of its decisions for the lead, so the wording
 *  below describes each action without claiming which zone takes it —
 *  that comes from the product's configuration. */
export const ACTION_LABEL: Record<ZoneAction, string> = {
  accept:   'Accept',
  adjust:   'Adjust',
  resample: 'Resample',
  reject:   'Reject',
};

// ── the zone key and the gauge ───────────────────────────────────────

/** One band of the key, as inprocess_zone_key() reports it. */
export interface ZoneBand {
  zone: WeightZone;
  action: ZoneAction;
  /** null at an unbounded end. Reported as absent rather than as a
   *  large number: zone 3U has no ceiling and a gauge that drew one
   *  would be inventing a limit nobody configured. */
  lowerBound: number | null;
  upperBound: number | null;
  lowerInclusive: boolean;
  upperInclusive: boolean;
  boundText: string;
  sortOrder: number;
}

export interface GaugeSegment extends ZoneBand {
  /** Share of the gauge's width, as a percentage. */
  widthPct: number;
  /** Whether this segment runs off the end of the scale. */
  unbounded: boolean;
  /** The limit at this segment's left edge, labelled — LAL, LWL, UWL,
   *  UAL. null on the leftmost segment, which has no left edge. */
  edgeLabel: string | null;
  edgeValue: number | null;
}

export interface Gauge {
  segments: GaugeSegment[];
  /** Where a value sits, as a percentage across the whole gauge, or
   *  null when there is nothing to place. */
  markerPct: number | null;
  /** The zone the marker is in, which is the classifier's answer and
   *  not something derived from markerPct. */
  markerZone: WeightZone | null;
}

/**
 * The share of the gauge each unbounded end takes.
 *
 * THE GAUGE IS NOT A LINEAR SCALE, AND SAYS SO. Zone 3U runs to
 * infinity; no honest linear axis can show it. Two bad answers were
 * available: clip the axis at some multiple of the action limit (which
 * invents a limit), or scale the bounded bands so small that the three
 * zones that matter become a sliver (which hides the ones an operator
 * reads). So the bounded bands share the middle in true proportion to
 * their spans — that part IS to scale, and the four limit labels under
 * it are real positions — and each unbounded end takes a fixed slice
 * that the component draws with a faded edge, because it represents
 * "and beyond" rather than a quantity.
 *
 * A marker inside the bounded middle is therefore positioned honestly.
 * A marker in an unbounded end is positioned by how far past the action
 * limit the value is, as a fraction of the adjacent band's span,
 * clamped — so 3U at one band-width past UAL sits at the far edge and
 * stays there. It cannot be read as a magnitude, and the value is
 * printed beside it so nobody has to.
 */
const UNBOUNDED_SHARE = 0.14;

export function buildGauge(bands: ZoneBand[], value: number | null): Gauge {
  const sorted = [...bands].sort((a, b) => a.sortOrder - b.sortOrder);
  if (sorted.length === 0) return { segments: [], markerPct: null, markerZone: null };

  const bounded = sorted.filter((b) => b.lowerBound !== null && b.upperBound !== null);
  const unboundedCount = sorted.length - bounded.length;
  const span = (b: ZoneBand) => (b.upperBound as number) - (b.lowerBound as number);
  const totalSpan = bounded.reduce((sum, b) => sum + span(b), 0);

  const middleShare = 1 - unboundedCount * UNBOUNDED_SHARE;

  const segments: GaugeSegment[] = sorted.map((b, i) => {
    const unbounded = b.lowerBound === null || b.upperBound === null;
    //  The leftmost band has no left edge to label; every other band's
    //  left edge is a real limit, named in the order the design gives
    //  them: LAL, LWL, UWL, UAL.
    const edge = i === 0 ? null : EDGE_LABELS[i - 1] ?? null;
    return {
      ...b,
      unbounded,
      widthPct: unbounded || totalSpan <= 0
        ? UNBOUNDED_SHARE * 100
        : (span(b) / totalSpan) * middleShare * 100,
      edgeLabel: edge,
      edgeValue: edge === null ? null : b.lowerBound,
    };
  });

  return { segments, ...placeMarker(segments, value) };
}

//  In gauge order, low to high. The leftmost band (3L) has no left
//  edge, so these label the four boundaries after it.
const EDGE_LABELS = ['LAL', 'LWL', 'UWL', 'UAL'];

function placeMarker(
  segments: GaugeSegment[], value: number | null,
): Pick<Gauge, 'markerPct' | 'markerZone'> {
  if (value === null || !Number.isFinite(value)) {
    return { markerPct: null, markerZone: null };
  }

  let left = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    const inThis =
      (s.lowerBound === null
        || (s.lowerInclusive ? value >= s.lowerBound : value > s.lowerBound))
      && (s.upperBound === null
        || (s.upperInclusive ? value <= s.upperBound : value < s.upperBound));

    if (inThis) {
      let within: number;
      if (s.lowerBound !== null && s.upperBound !== null) {
        //  Honest interpolation: this part of the gauge is to scale.
        within = (value - s.lowerBound) / (s.upperBound - s.lowerBound);
      } else if (s.upperBound !== null) {
        //  3L. How far below LAL, as a fraction of the band above it,
        //  measured from the right edge inwards and clamped.
        const ref = referenceSpan(segments, i, 1);
        within = ref > 0 ? Math.max(0, 1 - (s.upperBound - value) / ref) : 0.5;
      } else {
        //  3U. The same, from the left edge outwards.
        const ref = referenceSpan(segments, i, -1);
        within = ref > 0
          ? Math.min(1, (value - (s.lowerBound as number)) / ref)
          : 0.5;
      }
      return {
        markerPct: left + within * s.widthPct,
        markerZone: s.zone,
      };
    }
    left += s.widthPct;
  }
  //  Unreachable while the bands cover the line, which inprocess_zone_key
  //  guarantees. Reported as absent rather than guessed at.
  return { markerPct: null, markerZone: null };
}

/** The span of the nearest bounded neighbour, used only to position a
 *  marker inside an unbounded end. */
function referenceSpan(segments: GaugeSegment[], from: number, step: number): number {
  for (let i = from + step; i >= 0 && i < segments.length; i += step) {
    const s = segments[i];
    if (s.lowerBound !== null && s.upperBound !== null) return s.upperBound - s.lowerBound;
  }
  return 0;
}

// ── the sample due prompt ────────────────────────────────────────────

export interface SamplePrompt {
  /** How overdue, in minutes. Negative is not yet due. */
  minutesOverdue: number;
  intervalMinutes: number;
  dueAt: string;
  parameter: string;
  /** Which check this is — "Weight check #14". */
  checkNumber: number;
  /** Other tests being taken in the same visit to the press. */
  alsoChecking: string[];
}

/**
 * The line above the headline. "SAMPLE DUE NOW · 2 MIN OVERDUE".
 *
 * It names HOW overdue because "a sample is due" is a notification an
 * operator learns to dismiss, and because the gap between due and taken
 * is the number an inspector asks about.
 */
export function promptStatusLine(p: Pick<SamplePrompt, 'minutesOverdue'>): string {
  const m = Math.round(p.minutesOverdue);
  if (m < 0) {
    const ahead = Math.abs(m);
    return ahead < 60
      ? `SAMPLE DUE IN ${ahead} MIN`
      : `SAMPLE DUE IN ${Math.floor(ahead / 60)} H ${ahead % 60} MIN`;
  }
  if (m < 1) return 'SAMPLE DUE NOW';
  if (m < 60) return `SAMPLE DUE NOW · ${m} MIN OVERDUE`;
  return `SAMPLE DUE NOW · ${Math.floor(m / 60)} H ${m % 60} MIN OVERDUE`;
}

/** The line under the headline. Says when it fell due, what else is in
 *  the same visit, and that the prompt repeats — because a prompt that
 *  chimes without saying it will keep chiming reads as a fault. */
export function promptDetailLine(p: SamplePrompt): string {
  const parts = [`Due ${p.dueAt}`];
  if (p.alsoChecking.length > 0) {
    parts.push(`also checking ${listOut(p.alsoChecking)}`);
  }
  parts.push('the tablet chimes every minute until it’s taken');
  return parts.join(' · ');
}

function listOut(items: string[]): string {
  if (items.length === 1) return items[0].toLowerCase();
  return `${items.slice(0, -1).map((s) => s.toLowerCase()).join(', ')} and `
    + items[items.length - 1].toLowerCase();
}

/**
 * Whether the prompt should chime on this tick.
 *
 * "Chimes every minute until taken" — so the rule is a function of how
 * overdue it is, not a timer a component owns. A component that owned
 * one would keep chiming after the sample was taken if it unmounted in
 * the wrong order, and a workstation that chimes at nothing is a
 * workstation somebody turns the volume down on.
 *
 * Returns false before the sample is due. A prompt that chimed while
 * counting down would make the overdue chime mean nothing.
 */
export function shouldChime(minutesOverdue: number, lastChimedAtMinute: number | null): boolean {
  if (minutesOverdue < 0) return false;
  const minute = Math.floor(minutesOverdue);
  return lastChimedAtMinute === null || minute > lastChimedAtMinute;
}

// ── what a typed value is told ───────────────────────────────────────

export interface TypedReading {
  /** What the person has typed, exactly as typed. Kept as a string:
   *  "60", "60." and "60.0" are three different things to somebody
   *  mid-entry, and parsing early makes the field fight the keypad. */
  text: string;
  value: number | null;
  /** Always true — see the header, and ReadingAdvice.canSave. Present
   *  so that anybody tempted to make it conditional has to read why
   *  not. */
  canSave: true;
}

/** Parses what the keypad produced. An empty or partial entry is `null`
 *  rather than zero: a field holding "." is not a reading of nothing,
 *  it is somebody halfway through typing. */
export function parseTyped(text: string): TypedReading {
  const t = text.trim();
  const n = t === '' || t === '.' || t === '-' ? NaN : Number(t);
  return { text, value: Number.isFinite(n) ? n : null, canSave: true };
}

/** The running average of what has been recorded so far, to one decimal
 *  place as the design shows it. Null while nothing is recorded —
 *  an average of no readings is not zero. */
export function runningAverage(values: readonly number[]): number | null {
  const usable = values.filter((v) => Number.isFinite(v));
  if (usable.length === 0) return null;
  return Math.round((usable.reduce((a, b) => a + b, 0) / usable.length) * 10) / 10;
}

/** "14 of 20 weighed". Says the denominator, because a sample of twenty
 *  is a defined test and an operator who stops at twelve has not taken
 *  it. */
export function progressLabel(taken: number, required: number): string {
  return `${taken} of ${required} weighed`;
}

/** Whether the sample is complete. Not a gate on saving a reading —
 *  only on declaring the CHECK done, which is a different act. */
export function sampleComplete(taken: number, required: number): boolean {
  return taken >= required;
}
