/**
 * The yield account at Packing — W4·19, YR-01.
 *
 * "Theoretical, packed, samples, rejects, unaccounted, yield and
 *  variance against the threshold; red block on completion;
 *  investigation and supervisor route."
 *
 * TWO PERCENTAGES, AND THEY ARE NOT THE SAME NUMBER. The design's own
 * figures settle it:
 *
 *     theoretical 300,000 · packed 289,440 · samples 1,260 ·
 *     rejects 2,100 · unaccounted 7,200 (2.4 %) ·
 *     actual yield 96.5 % · variance − 3.5 %
 *
 * 96.5 % is packed over theoretical. The accounted total over
 * theoretical is 97.6 %. So the threshold is applied to PACKED — which
 * is what `actual_quantity` holds and what `yield_pct`, `variance_pct`
 * and `within_threshold` are derived from — while the unaccounted line
 * measures something else entirely: material the paperwork cannot
 * locate.
 *
 * Both belong on the screen. Showing only the yield hides 7,200
 * tablets nobody can find; showing only the account hides the 3.5 %
 * shortfall the stage is actually blocked on. A screen that collapsed
 * them into one figure would be arithmetically tidy and would lose
 * whichever one mattered that day.
 *
 * SAMPLES AND REJECTS ARE FOUND, NOT LOST. They are lines of their own
 * rather than part of the remainder, because folding them in would
 * report 10,560 tablets unaccounted and send somebody looking through
 * the warehouse for material sitting in the QC lab.
 *
 * NOTHING HERE DECIDES THE BLOCK. `yield_block_reason` does, and item
 * 12's `batch_stage_complete` enforces it. This module formats and
 * explains; `blocks` below is read from the record, never recomputed —
 * a second comparison would be a second verdict.
 */

export type AccountLineKey =
  | 'theoretical' | 'packed' | 'samples' | 'rejects' | 'accounted' | 'unaccounted';

export type AccountLineKind = 'theoretical' | 'counted' | 'derived';

export interface AccountLine {
  key: AccountLineKey;
  label: string;
  /** null when no breakdown was recorded. Absent, not zero: a
   *  reconciliation with one figure instead of three is still valid,
   *  and "0 samples" is a claim nobody made. */
  quantity: number | null;
  unit: string;
  pctOfTheoretical: number | null;
  kind: AccountLineKind;
  /** Decision 4 for the lead: whether unaccounted is a line the
   *  operator must explain, or only part of the variance. False on
   *  every line today, and carried through from the database so that
   *  answering it is a change in one place. */
  mustExplain: boolean;
  sortOrder: number;
}

export interface YieldVerdict {
  yieldPct: number | null;
  /** Signed. Negative is a shortfall. */
  variancePct: number | null;
  thresholdPct: number | null;
  /** Read from the record. Never derived here — see the header. */
  withinThreshold: boolean | null;
  investigationRequired: boolean;
  authorised: boolean;
}

/**
 * The short labels YR-M01 uses on a phone.
 *
 * "Theoretical", not "Theoretical yield"; "Packed", not "Packed,
 * released to store". At 390 px the long labels pushed every figure
 * onto a second line, and seven two-line rows is not an account
 * anybody reads — it is a list of fourteen things.
 *
 * NOT DERIVED by truncating the long ones. "Packed, released to
 * store" truncated is "Packed, releas…", and a label that trails off
 * reads as a rendering fault rather than as a deliberate short form.
 * They are written out, so each one is a word somebody chose.
 */
export const SHORT_LABEL: Record<AccountLineKey, string> = {
  theoretical: 'Theoretical',
  packed: 'Packed',
  samples: 'Samples',
  rejects: 'Rejects',
  accounted: 'Accounted for',
  unaccounted: 'Unaccounted',
};

/** The label for a line at the layout in use. */
export function lineLabel(line: AccountLine, layout: 'workstation' | 'phone'): string {
  return layout === 'phone' ? SHORT_LABEL[line.key] : line.label;
}

// ── formatting ───────────────────────────────────────────────────────

/** Quantities with thousands separators, as YR-01 shows them
 *  ("289,440 tablets"). Grouped because a six-figure tablet count is
 *  unreadable otherwise, and a misread count is the thing this whole
 *  screen exists to catch. */
export function formatQuantity(q: number | null, unit: string): string {
  if (q === null || !Number.isFinite(q)) return '—';
  const abs = Math.abs(q);
  //  Whole units for counts, one decimal where the figure is not whole
  //  — a mass in kilograms often is not, and rounding 49.9 to 50 on
  //  this screen would hide 0.1 of a batch.
  const digits = Number.isInteger(q) ? 0 : abs < 100 ? 3 : 1;
  const n = q.toLocaleString('en-NG', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
  //  A NON-BREAKING SPACE, because the unit belongs to the number. At
  //  phone width the figures have to be allowed to wrap, and the first
  //  thing they did was break "289,440 tablets" across two lines —
  //  leaving a column of bare numbers above a column of bare units.
  //  With this, the only place a figure can break is the "·" in the
  //  unaccounted line, which is where a break makes sense.
  return `${n}\u00a0${unit}`;
}

/** Percentages to one decimal place, as the design shows them
 *  ("96.5 %", "2.4 %"). */
export function formatPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return '—';
  return `${p.toFixed(1)} %`;
}

/** A SIGNED percentage, with a real minus sign rather than a hyphen,
 *  as the design writes it ("− 3.5 %"). The sign is the point: +3.5 %
 *  and −3.5 % are both 3.5 % out and they are different problems. */
export function formatSignedPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return '—';
  const sign = p < 0 ? '−' : p > 0 ? '+' : '';
  return `${sign} ${Math.abs(p).toFixed(1)} %`.trim();
}

/**
 * A bare figure, for the phone's narrow column: "300,000", "96.5 %".
 *
 * THE UNIT IS DROPPED, NOT LOST. YR-M01 prints the quantities without
 * it, because seven repetitions of "tablets" down a 390 px column is
 * noise — but a column of unlabelled numbers is a real loss, so the
 * card states the unit once above the table instead. `accountUnit`
 * below is what it says.
 */
export function formatBare(q: number | null, kind: 'quantity' | 'pct'): string {
  if (q === null || !Number.isFinite(q)) return '—';
  if (kind === 'pct') return formatPct(q);
  const abs = Math.abs(q);
  const digits = Number.isInteger(q) ? 0 : abs < 100 ? 3 : 1;
  return q.toLocaleString('en-NG', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

/** The unit the quantities are in, said once. Null when the lines
 *  disagree about it, which should not happen — a reconciliation has
 *  one output unit — and is reported rather than guessed at. */
export function accountUnit(lines: AccountLine[]): string | null {
  const units = new Set(lines.filter((l) => l.quantity !== null).map((l) => l.unit));
  return units.size === 1 ? [...units][0] : null;
}

/** The unaccounted line as YR-01 writes it: "7,200 tablets · 2.4 %".
 *  Both, because the quantity is what somebody goes and looks for and
 *  the percentage is what makes it large or small. */
export function formatUnaccounted(line: AccountLine): string {
  if (line.quantity === null) return 'Not broken down';
  const q = formatQuantity(Math.abs(line.quantity), line.unit);
  const p = formatPct(Math.abs(line.pctOfTheoretical ?? 0));
  if (line.quantity < 0) {
    //  More material than theory allows for. Said in words, because
    //  "−2.4 %" on a line called "Unaccounted" reads as a credit and
    //  it is not one: it is the same question in the other direction.
    return `${q} · ${p} more than theoretical`;
  }
  return `${q} · ${p}`;
}

// ── the threshold band ───────────────────────────────────────────────

export interface ThresholdBand {
  /** The full labels, with their figures. Used in the strip's
   *  accessible description, not inside the segments — see below. */
  belowLabel: string;
  withinLabel: string;
  aboveLabel: string;
  /** One word each, which is what fits inside a segment at phone
   *  width. */
  belowShort: string;
  withinShort: string;
  aboveShort: string;
  /** Where the yield sits across the band, 0–100, or null when there
   *  is no yield to place. */
  markerPct: number | null;
  /** The share of the band the within-threshold window occupies. */
  withinWidthPct: number;
}

/**
 * The threshold strip under the account.
 *
 * YR-01 draws three segments — "below 98.0 %", "threshold 98.0 –
 * 101.0 %", "above 101.0 %" — at widths 200 / 240 / 200, with the
 * marker at 96.5 %.
 *
 * THE SAME HONESTY PROBLEM AS THE ZONE GAUGE, with the same answer.
 * "Below 98 %" runs down to zero and "above 101 %" runs up without
 * limit, so the strip is not a linear axis and does not pretend to be:
 * the middle window is the threshold, drawn at a fixed share, and the
 * two ends are "outside it, low" and "outside it, high". A yield inside
 * the window is placed in true proportion within it. A yield outside is
 * placed by how far outside, as a fraction of the window's own width,
 * clamped at the edge — so 40 % and 90 % both sit at the far left, and
 * the figure is printed beside the strip so neither is read off it.
 *
 * Note the band is NOT symmetric: a 2 % threshold admits 98 % to
 * 102 %, and the design's example admits 98 % to 101 %, which means a
 * threshold whose two sides differ. The function takes both ends rather
 * than a single threshold for that reason — deriving them from one
 * number would quietly correct the design.
 */
export function thresholdBand(
  yieldPct: number | null,
  lowerPct: number,
  upperPct: number,
): ThresholdBand {
  const withinWidthPct = 37.5;   //  240 of 640, as the design draws it
  const endWidthPct = (100 - withinWidthPct) / 2;
  const span = upperPct - lowerPct;

  let markerPct: number | null = null;
  if (yieldPct !== null && Number.isFinite(yieldPct)) {
    if (yieldPct < lowerPct) {
      const out = span > 0 ? (lowerPct - yieldPct) / span : 1;
      markerPct = Math.max(0, endWidthPct * (1 - Math.min(1, out)));
    } else if (yieldPct > upperPct) {
      const out = span > 0 ? (yieldPct - upperPct) / span : 1;
      markerPct = endWidthPct + withinWidthPct
        + Math.min(1, out) * endWidthPct;
    } else {
      const within = span > 0 ? (yieldPct - lowerPct) / span : 0.5;
      markerPct = endWidthPct + within * withinWidthPct;
    }
  }

  return {
    belowLabel: `below ${lowerPct.toFixed(1)} %`,
    withinLabel: `threshold ${lowerPct.toFixed(1)} – ${upperPct.toFixed(1)} %`,
    aboveLabel: `above ${upperPct.toFixed(1)} %`,
    //  THE SHORT FORMS ARE WHAT GOES INSIDE THE SEGMENTS. The full
    //  labels do not fit at phone width — the middle one rendered as
    //  "reshold 98.0 – 101.0" — and a clipped number on a threshold
    //  strip is worse than no number, because a half-read "101.0" and
    //  a half-read "01.0 %" look the same. So the segments carry one
    //  word each and the figures go in the line underneath, where
    //  they have the whole width and wrap properly.
    belowShort: 'below',
    withinShort: 'threshold',
    aboveShort: 'above',
    markerPct,
    withinWidthPct,
  };
}

/** The line under the strip. Carries every figure the segments no
 *  longer have room for, so nothing is lost at phone width. */
export function thresholdNote(
  yieldPct: number | null, lowerPct: number, upperPct: number,
): string {
  return `${formatPct(yieldPct)} · threshold ${lowerPct.toFixed(1)} – `
    + `${upperPct.toFixed(1)} % · set per product and stage`;
}

/** The two ends of the window from a single stored threshold, which is
 *  how the database holds it: a magnitude applied to a signed variance,
 *  inclusively, so 2 % admits 98 % to 102 %. Kept separate from
 *  `thresholdBand` so a company with an asymmetric window can supply
 *  both ends without this function being in the way. */
export function thresholdWindow(thresholdPct: number): { lower: number; upper: number } {
  return { lower: 100 - thresholdPct, upper: 100 + thresholdPct };
}

// ── what the screen does about it ────────────────────────────────────

export interface AccountSummary {
  lines: AccountLine[];
  verdict: YieldVerdict;
  /** Whether a breakdown was recorded at all. */
  brokenDown: boolean;
  /** True when this variance stops the stage being completed. Read
   *  from `withinThreshold`, which the database derived. */
  blocks: boolean;
  /** True when the block has been investigated and authorised, so the
   *  stage can be completed with the variance on the record. */
  cleared: boolean;
}

export function summarise(lines: AccountLine[], verdict: YieldVerdict): AccountSummary {
  const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const blocks = verdict.withinThreshold === false;
  return {
    lines: sorted,
    verdict,
    brokenDown: sorted.some((l) => l.kind === 'counted' && l.key !== 'packed'
                                   && l.quantity !== null),
    blocks,
    //  Both halves. "Proceeding needs an investigation flag AND
    //  supervisor authorisation" — an authorisation without the
    //  investigation is the thing item 12's third NOT DONE IF is about.
    cleared: blocks && verdict.investigationRequired && verdict.authorised,
  };
}

/**
 * The headline on the block panel. YR-01's words: "Can't complete
 * Packing".
 *
 * The stage is named rather than called "this stage", because an
 * operator standing at Packing with a tablet in their hand should not
 * have to work out which stage the screen means.
 */
export function blockHeadline(stageName: string, s: AccountSummary): string {
  if (!s.blocks) return `${stageName} is ready to complete`;
  if (s.cleared) return `${stageName} — variance authorised`;
  return `Can’t complete ${stageName}`;
}

/**
 * The one-line version, for YR-M01's compact panel.
 *
 * SHORTER, NOT TRUNCATED. The long detail says the figure, the
 * threshold, and what has to happen before the stage can complete;
 * cutting it at a character count would drop whichever of the three
 * fell off the end. This states the figure and the threshold, and the
 * line above the action bar says what happens next — so the same
 * three facts are on the screen, in two places that each fit.
 */
export function blockDetailShort(s: AccountSummary): string {
  const { yieldPct, thresholdPct } = s.verdict;
  if (!s.blocks) {
    return `Yield ${formatPct(yieldPct)} is within the ${formatPct(thresholdPct)} threshold.`;
  }
  const below = (yieldPct ?? 100) < 100;
  const edge = thresholdPct === null ? null : below ? 100 - thresholdPct : 100 + thresholdPct;
  const base = `Yield ${formatPct(yieldPct)} is ${below ? 'below' : 'above'} the `
    + `${formatPct(edge)} threshold for this product and stage.`;
  return s.cleared ? `${base} A supervisor has authorised it.` : base;
}

/** The line above the phone's action bar — the "what happens next"
 *  half of the detail above. */
export function phoneRouteNote(s: AccountSummary): string {
  if (!s.blocks || s.cleared) return '';
  return 'Recount, or flag for investigation so a supervisor can decide whether the '
    + 'stage may be completed with the variance on the record.';
}

/** The sentence under it. Names the figure, the threshold and what
 *  happens next, in that order — the figure first because it is the
 *  thing being disputed. */
export function blockDetail(s: AccountSummary, stageName: string): string {
  const { yieldPct, thresholdPct } = s.verdict;
  if (!s.blocks) {
    return `Yield is ${formatPct(yieldPct)}, within the `
      + `${formatPct(thresholdPct)} threshold for this product and stage.`;
  }
  const lower = thresholdPct === null ? null : 100 - thresholdPct;
  const direction = (yieldPct ?? 100) < 100 ? 'below' : 'above';
  const edge = direction === 'below' ? lower : (thresholdPct === null ? null : 100 + thresholdPct);
  const base = `Yield is ${formatPct(yieldPct)}, ${direction} the `
    + `${formatPct(edge)} threshold for this product and stage.`;
  if (s.cleared) {
    return `${base} A supervisor has authorised it, so ${stageName} can be completed `
      + 'with the variance on the record.';
  }
  return `${base} ${stageName} cannot be completed until the variance is investigated `
    + 'and a supervisor authorises it.';
}

/** The primary button. Says what pressing it will actually start,
 *  rather than offering an action that is about to be refused — the
 *  same rule as W4·18's `actionLabel`. */
export function completeButtonLabel(s: AccountSummary): string {
  if (!s.blocks || s.cleared) return 'Complete and sign stage';
  return 'Can’t complete · yield outside threshold';
}

/** The two routes YR-01 offers, in its order: recount first, because a
 *  wrong count is the commonest explanation for a variance and the only
 *  one that costs nothing to rule out. */
export function routes(s: AccountSummary, layout: 'workstation' | 'phone' = 'workstation'):
Array<{ key: 'investigate' | 'recount'; label: string; detail: string }> {
  if (!s.blocks || s.cleared) return [];
  return [
    { key: 'investigate',
      //  "…and ask supervisor" is dropped on a phone, where it wrapped
      //  a 56 px button onto two lines. The supervisor is still named
      //  — in the line above the action bar, where there is room for
      //  the whole sentence.
      label: layout === 'phone'
        ? 'Flag for investigation'
        : 'Flag for investigation and ask supervisor',
      detail: 'Records what was looked into and sends the variance to a supervisor '
        + 'to authorise or refuse.' },
    { key: 'recount',
      label: 'Recount',
      detail: 'Counts again before anything is recorded. A miscount is the commonest '
        + 'cause of a variance and the cheapest to rule out.' },
  ];
}
