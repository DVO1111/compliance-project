/**
 * The yield account at Packing — W4·19, YR-01.
 *
 * THE DESIGN'S OWN FIGURES ARE THE FIXTURE, because they are what
 * settled the one question this section turned on:
 *
 *     theoretical 300,000 · packed 289,440 · samples 1,260 ·
 *     rejects 2,100 · unaccounted 7,200 (2.4 %) ·
 *     actual yield 96.5 % · variance − 3.5 %
 *
 * 289,440 + 1,260 + 2,100 = 292,800, so 7,200 unaccounted is 2.4 %.
 * But 96.5 % is 289,440 / 300,000, NOT 292,800 / 300,000 (97.6 %). So
 * the threshold is applied to PACKED ALONE, and the two percentages on
 * the card are different numbers measuring different things:
 *
 *     yield       — how much came out saleable. The threshold blocks
 *                   on this.
 *     unaccounted — how much the paperwork cannot locate. Nothing
 *                   blocks on it; somebody goes and looks.
 *
 * The first draft of the backend summed the three lines into
 * actual_quantity, which would have made the stage above PASS: 49.9 of
 * 50 is a 0.2 % variance where packing 49 is 2 %. A stage that packed
 * 2 % short would have cleared the gate because somebody sampled it.
 * These assertions are what keep that fixed.
 *
 * AND NOTHING HERE RECOMPUTES THE VERDICT. `withinThreshold` is read
 * off the record, derived by item 12's trigger; `summarise` reports it.
 * A second comparison would be a second verdict and the two would
 * differ on exactly the boundary case item 12 spent a section getting
 * right.
 */
import { describe, it, expect } from 'vitest';
import {
  summarise, formatQuantity, formatPct, formatSignedPct, formatUnaccounted,
  thresholdBand, thresholdNote, thresholdWindow, blockHeadline, blockDetail,
  completeButtonLabel, routes, lineLabel, formatBare, accountUnit,
  blockDetailShort, phoneRouteNote,
  type AccountLine, type YieldVerdict,
} from '../lib/yield/yieldAccount';

const line = (
  key: AccountLine['key'], label: string, quantity: number | null,
  pct: number | null, kind: AccountLine['kind'], sortOrder: number,
): AccountLine => ({
  key, label, quantity, unit: 'tablets', pctOfTheoretical: pct,
  kind, mustExplain: false, sortOrder,
});

//  YR-01, exactly.
const LINES: AccountLine[] = [
  line('theoretical', 'Theoretical yield', 300000, 100, 'theoretical', 1),
  line('packed', 'Packed, released to store', 289440, 96.48, 'counted', 2),
  line('samples', 'In-process and QC samples', 1260, 0.42, 'counted', 3),
  line('rejects', 'Counted rejects', 2100, 0.7, 'counted', 4),
  line('accounted', 'Accounted for', 292800, 97.6, 'derived', 5),
  line('unaccounted', 'Unaccounted', 7200, 2.4, 'derived', 6),
];

const BLOCKED: YieldVerdict = {
  yieldPct: 96.48, variancePct: -3.52, thresholdPct: 2,
  withinThreshold: false, investigationRequired: false, authorised: false,
};

describe('the two percentages', () => {
  //  ═══ THE ONE THAT MATTERS ═══
  //  Unaccounted is NOT the variance. 2.4 % and 3.5 % are different
  //  measurements of different things, and a card that showed one as
  //  the other would hide either the shortfall the stage is blocked on
  //  or the 7,200 tablets nobody can find.
  it('keeps unaccounted and the variance as separate figures', () => {
    const s = summarise(LINES, BLOCKED);
    const un = s.lines.find((l) => l.key === 'unaccounted')!;
    expect(un.pctOfTheoretical).toBe(2.4);
    expect(Math.abs(s.verdict.variancePct!)).toBe(3.52);
    expect(un.pctOfTheoretical).not.toBe(Math.abs(s.verdict.variancePct!));
  });

  //  Samples and rejects are ACCOUNTED FOR, so they are inside the
  //  accounted line and outside the unaccounted one. Folding them in
  //  would report 10,560 tablets missing and send somebody through the
  //  warehouse for material sitting in the QC lab.
  it('counts samples and rejects as found, not as lost', () => {
    const q = (k: AccountLine['key']) =>
      LINES.find((l) => l.key === k)!.quantity!;
    expect(q('packed') + q('samples') + q('rejects')).toBe(q('accounted'));
    expect(q('theoretical') - q('accounted')).toBe(q('unaccounted'));
  });

  //  The yield is packed over theoretical, not accounted over
  //  theoretical. This is the assertion the first draft failed.
  it('reads the yield from packed alone', () => {
    const s = summarise(LINES, BLOCKED);
    const packed = s.lines.find((l) => l.key === 'packed')!;
    expect(packed.pctOfTheoretical).toBe(s.verdict.yieldPct);
    const accounted = s.lines.find((l) => l.key === 'accounted')!;
    expect(accounted.pctOfTheoretical).not.toBe(s.verdict.yieldPct);
  });
});

describe('the verdict', () => {
  //  READ, not recomputed. A card that compared the variance to the
  //  threshold itself would be a second verdict, and the two would
  //  differ on exactly the boundary case.
  it('takes the block from the record rather than comparing again', () => {
    //  A variance of 2.5 against a threshold of 2 that the record says
    //  is WITHIN. Nonsensical as data, and the point: the card must
    //  report what it was told, so that a disagreement surfaces here
    //  rather than being silently corrected on screen.
    const s = summarise(LINES, {
      ...BLOCKED, variancePct: -2.5, withinThreshold: true,
    });
    expect(s.blocks).toBe(false);
  });

  it('blocks when the record says the variance is outside', () => {
    expect(summarise(LINES, BLOCKED).blocks).toBe(true);
  });

  //  An unrecorded reconciliation is not a pass. `withinThreshold` is
  //  null before anything is reconciled, and null is not false.
  it('does not block on an unreconciled stage', () => {
    const s = summarise(LINES, {
      yieldPct: null, variancePct: null, thresholdPct: 2,
      withinThreshold: null, investigationRequired: false, authorised: false,
    });
    expect(s.blocks).toBe(false);
    expect(s.cleared).toBe(false);
  });

  //  BOTH HALVES. "Proceeding needs an investigation flag AND
  //  supervisor authorisation" — an authorisation without the
  //  investigation is what item 12's third NOT DONE IF is about.
  it('needs the investigation and the authorisation to clear a block', () => {
    const base = { ...BLOCKED };
    expect(summarise(LINES, base).cleared).toBe(false);
    expect(summarise(LINES, { ...base, investigationRequired: true }).cleared).toBe(false);
    expect(summarise(LINES, { ...base, authorised: true }).cleared).toBe(false);
    expect(summarise(LINES, {
      ...base, investigationRequired: true, authorised: true,
    }).cleared).toBe(true);
  });

  it('notices whether a breakdown was recorded at all', () => {
    expect(summarise(LINES, BLOCKED).brokenDown).toBe(true);
    const bare = LINES.map((l) =>
      l.key === 'samples' || l.key === 'rejects' || l.key === 'accounted'
        || l.key === 'unaccounted'
        ? { ...l, quantity: null, pctOfTheoretical: null }
        : l);
    expect(summarise(bare, BLOCKED).brokenDown).toBe(false);
    //  ...and it still has a yield and a verdict. The breakdown
    //  explains a figure; it is not a precondition for having one.
    expect(summarise(bare, BLOCKED).verdict.yieldPct).toBe(96.48);
    expect(summarise(bare, BLOCKED).blocks).toBe(true);
  });
});

describe('the words', () => {
  //  The design's word, and the stage named. An operator at Packing
  //  with a tablet in their hand should not have to work out which
  //  stage the screen means.
  it('names the stage in the block headline', () => {
    expect(blockHeadline('Packing', summarise(LINES, BLOCKED)))
      .toBe('Can’t complete Packing');
  });

  it('says it is ready when nothing blocks', () => {
    const s = summarise(LINES, { ...BLOCKED, withinThreshold: true });
    expect(blockHeadline('Packing', s)).toMatch(/ready to complete/i);
  });

  it('says the variance was authorised once it has been', () => {
    const s = summarise(LINES, {
      ...BLOCKED, investigationRequired: true, authorised: true,
    });
    expect(blockHeadline('Packing', s)).toMatch(/authorised/i);
  });

  //  The figure first, because it is the thing being disputed; then
  //  the threshold; then what happens next.
  it('gives the figure, the threshold and the next step, in that order', () => {
    const detail = blockDetail(summarise(LINES, BLOCKED), 'Packing');
    expect(detail.indexOf('96.5')).toBeLessThan(detail.indexOf('98.0'));
    expect(detail).toMatch(/below/);
    expect(detail).toMatch(/investigated and a supervisor authorises/i);
  });

  it('says which side of the threshold an overage is on', () => {
    const over = summarise(LINES, {
      ...BLOCKED, yieldPct: 104, variancePct: 4,
    });
    expect(blockDetail(over, 'Packing')).toMatch(/above the 102\.0 %/);
  });

  //  Says what pressing it will start, rather than offering an action
  //  about to be refused — W4·18's rule, same wording.
  it('uses the design\'s word on the refused button', () => {
    expect(completeButtonLabel(summarise(LINES, BLOCKED)))
      .toBe('Can’t complete · yield outside threshold');
  });

  it('offers the plain action when nothing blocks, and once cleared', () => {
    expect(completeButtonLabel(summarise(LINES, { ...BLOCKED, withinThreshold: true })))
      .toBe('Complete and sign stage');
    expect(completeButtonLabel(summarise(LINES, {
      ...BLOCKED, investigationRequired: true, authorised: true,
    }))).toBe('Complete and sign stage');
  });

  //  Recount first. A wrong count is the commonest explanation for a
  //  variance and the only one that costs nothing to rule out — but
  //  the design lists investigation first, so that is the order.
  it('offers both routes while blocked, and neither otherwise', () => {
    const r = routes(summarise(LINES, BLOCKED));
    expect(r.map((x) => x.key)).toEqual(['investigate', 'recount']);
    expect(routes(summarise(LINES, { ...BLOCKED, withinThreshold: true }))).toEqual([]);
    expect(routes(summarise(LINES, {
      ...BLOCKED, investigationRequired: true, authorised: true,
    }))).toEqual([]);
  });
});

describe('the figures as written', () => {
  //  Grouped, as YR-01 shows them. A six-figure tablet count without
  //  separators is unreadable, and a misread count is the thing this
  //  screen exists to catch.
  it('groups thousands', () => {
    expect(formatQuantity(289440, 'tablets')).toBe('289,440 tablets');
    expect(formatQuantity(1260, 'tablets')).toBe('1,260 tablets');
  });

  //  THE UNIT CANNOT BE SEPARATED FROM ITS NUMBER. The figures wrap at
  //  phone width, and the first thing they did was break "289,440
  //  tablets" over two lines — a column of bare numbers above a column
  //  of bare units. A non-breaking space is what stops it, so the only
  //  place a figure may break is the "·" in the unaccounted line.
  it('binds the unit to its number with a non-breaking space', () => {
    expect(formatQuantity(289440, 'tablets')).not.toContain('440 tablets');
    expect(formatQuantity(289440, 'tablets')).toContain(' ');
  });

  //  A mass is often not whole, and rounding 49.9 kg to 50 on this
  //  screen would hide a fifth of the variance.
  it('keeps the decimals on a quantity that has them', () => {
    expect(formatQuantity(49.9, 'kg')).toBe('49.900 kg');
    expect(formatQuantity(49, 'kg')).toBe('49 kg');
  });

  it('shows an absent figure as absent, not as zero', () => {
    expect(formatQuantity(null, 'tablets')).toBe('—');
    expect(formatPct(null)).toBe('—');
    expect(formatSignedPct(null)).toBe('—');
  });

  //  A REAL MINUS SIGN, and the sign is the point: +3.5 % and −3.5 %
  //  are both 3.5 % out and they are different problems.
  it('signs the variance with a minus sign, not a hyphen', () => {
    expect(formatSignedPct(-3.52)).toBe('− 3.5 %');
    expect(formatSignedPct(3.52)).toBe('+ 3.5 %');
    expect(formatSignedPct(0)).toBe('0.0 %');
  });

  it('writes the unaccounted line as YR-01 writes it', () => {
    const un = LINES.find((l) => l.key === 'unaccounted')!;
    expect(formatUnaccounted(un)).toBe('7,200\u00a0tablets · 2.4 %');
  });

  //  An overage says so in words. "−2.4 %" on a line called
  //  "Unaccounted" reads as a credit, and it is not one: it is the
  //  same question in the other direction.
  it('says in words when there is MORE material than theory allows', () => {
    const over: AccountLine = {
      ...LINES.find((l) => l.key === 'unaccounted')!,
      quantity: -2400, pctOfTheoretical: -0.8,
    };
    expect(formatUnaccounted(over))
      .toBe('2,400\u00a0tablets · 0.8 % more than theoretical');
  });

  it('says so when nothing was broken down', () => {
    const none: AccountLine = {
      ...LINES.find((l) => l.key === 'unaccounted')!,
      quantity: null, pctOfTheoretical: null,
    };
    expect(formatUnaccounted(none)).toBe('Not broken down');
  });
});

describe('the threshold strip', () => {
  it('names both ends of the window', () => {
    const b = thresholdBand(96.48, 98, 101);
    expect(b.belowLabel).toBe('below 98.0 %');
    expect(b.withinLabel).toBe('threshold 98.0 – 101.0 %');
    expect(b.aboveLabel).toBe('above 101.0 %');
  });

  //  The segments carry one word each, because the full labels do not
  //  fit at phone width — the middle one rendered as "reshold 98.0 –
  //  101.0", and a half-read threshold is worse than no threshold.
  it('gives each segment a label short enough to survive a phone', () => {
    const b = thresholdBand(96.48, 98, 101);
    for (const short of [b.belowShort, b.withinShort, b.aboveShort]) {
      expect(short.length).toBeLessThanOrEqual(10);
      expect(short).not.toMatch(/\d/);
    }
  });

  //  ...and every figure the segments gave up is in the line beneath,
  //  so nothing is lost — only moved somewhere it has room to wrap.
  it('keeps every figure in the note under the strip', () => {
    const note = thresholdNote(96.48, 98, 101);
    expect(note).toContain('96.5 %');
    expect(note).toContain('98.0');
    expect(note).toContain('101.0');
    expect(note).toMatch(/per product and stage/);
  });

  //  The window the database's single threshold implies: a magnitude
  //  applied to a signed variance, so 2 % admits 98 % to 102 %.
  it('derives a symmetric window from a single threshold', () => {
    expect(thresholdWindow(2)).toEqual({ lower: 98, upper: 102 });
  });

  //  ...but takes an ASYMMETRIC one when given it. The design's
  //  example window is 98.0 – 101.0 %, and deriving both ends from one
  //  number would quietly correct the design.
  it('accepts an asymmetric window without normalising it', () => {
    const b = thresholdBand(100, 98, 101);
    expect(b.withinLabel).toContain('98.0 – 101.0');
  });

  it('places a yield inside the window proportionally within it', () => {
    const end = (100 - 37.5) / 2;
    expect(thresholdBand(98, 98, 102).markerPct).toBeCloseTo(end, 6);
    expect(thresholdBand(102, 98, 102).markerPct).toBeCloseTo(end + 37.5, 6);
    expect(thresholdBand(100, 98, 102).markerPct).toBeCloseTo(end + 18.75, 6);
  });

  //  CLAMPED AT BOTH ENDS. "Below 98 %" runs down to zero and "above
  //  101 %" runs up without limit, so a marker out there says which
  //  side and not how far — and the figure is printed beside the strip
  //  so nobody reads a magnitude off it.
  it('clamps a yield outside the window instead of running off the strip', () => {
    for (const y of [97, 90, 50, 0]) {
      const m = thresholdBand(y, 98, 102).markerPct!;
      expect(m, `yield ${y}`).toBeGreaterThanOrEqual(0);
      expect(m, `yield ${y}`).toBeLessThan((100 - 37.5) / 2);
    }
    for (const y of [103, 120, 400]) {
      const m = thresholdBand(y, 98, 102).markerPct!;
      expect(m, `yield ${y}`).toBeLessThanOrEqual(100);
      expect(m, `yield ${y}`).toBeGreaterThan((100 - 37.5) / 2 + 37.5);
    }
  });

  it('places no marker when there is no yield', () => {
    expect(thresholdBand(null, 98, 102).markerPct).toBeNull();
  });
});

/**
 * YR-M01 — the phone.
 *
 * The phone card is not the workstation card narrower. It drops the
 * threshold strip, shortens every label, prints the figures bare and
 * moves both routes into a bar at the bottom. Each of those loses
 * something, and these assert that what is lost turns up somewhere
 * else on the same screen rather than going missing.
 */
describe('the phone layout', () => {
  //  SHORT, NOT TRUNCATED. "Packed, releas…" reads as a rendering
  //  fault; "Packed" reads as a word somebody chose.
  it('gives every line a short label that is a whole word', () => {
    for (const l of LINES) {
      const short = lineLabel(l, 'phone');
      expect(short.length).toBeLessThanOrEqual(l.label.length);
      expect(short).not.toMatch(/[….]$/);
      expect(short.length).toBeGreaterThan(0);
    }
    expect(lineLabel(LINES[1], 'phone')).toBe('Packed');
    expect(lineLabel(LINES[1], 'workstation')).toBe('Packed, released to store');
  });

  //  The figures go bare so seven "tablets" do not run down a 390 px
  //  column — so the unit has to be recoverable, once, from the lines.
  it('prints figures bare and still knows the unit', () => {
    expect(formatBare(300000, 'quantity')).toBe('300,000');
    expect(formatBare(96.48, 'pct')).toBe('96.5 %');
    expect(formatBare(null, 'quantity')).toBe('—');
    expect(accountUnit(LINES)).toBe('tablets');
  });

  //  A reconciliation with no breakdown still has a unit, from the
  //  lines that do have a figure.
  it('finds the unit from whichever lines were recorded', () => {
    const bare = LINES.map((l) =>
      ['samples', 'rejects', 'accounted', 'unaccounted'].includes(l.key)
        ? { ...l, quantity: null } : l);
    expect(accountUnit(bare)).toBe('tablets');
  });

  //  Reported rather than guessed at. A reconciliation has one output
  //  unit, so lines that disagree are a fault, and printing one of
  //  them over a column of the other would be the worst outcome.
  it('reports no unit at all when the lines disagree', () => {
    const mixed = LINES.map((l) =>
      l.key === 'samples' ? { ...l, unit: 'kg' } : l);
    expect(accountUnit(mixed)).toBeNull();
  });

  //  ═══ THE ONE THAT MATTERS FOR THE PHONE ═══
  //  The strip is dropped, so the figures it carried — the yield and
  //  the threshold it is being judged against — must be in the one
  //  line that replaces it. Without this, the phone shows a block
  //  with no number behind it.
  it('keeps the yield and the threshold in the short detail', () => {
    const d = blockDetailShort(summarise(LINES, BLOCKED));
    expect(d).toContain('96.5 %');
    expect(d).toContain('98.0 %');
    expect(d).toMatch(/below/);
  });

  it('says which side an overage is on, in the short form too', () => {
    const over = summarise(LINES, { ...BLOCKED, yieldPct: 104, variancePct: 4 });
    expect(blockDetailShort(over)).toMatch(/above the 102\.0 %/);
  });

  it('says the variance was authorised, in the short form', () => {
    const ok = summarise(LINES, {
      ...BLOCKED, investigationRequired: true, authorised: true,
    });
    expect(blockDetailShort(ok)).toMatch(/authorised/i);
  });

  //  The other half of the detail — what happens next — is the line
  //  above the action bar, beside the buttons that do it.
  it('puts the next step beside the buttons that take it', () => {
    const note = phoneRouteNote(summarise(LINES, BLOCKED));
    expect(note).toMatch(/recount/i);
    expect(note).toMatch(/supervisor/i);
    //  Nothing to say when nothing blocks.
    expect(phoneRouteNote(summarise(LINES, { ...BLOCKED, withinThreshold: true })))
      .toBe('');
  });

  //  "…and ask supervisor" wrapped a 56 px button onto two lines, so
  //  it is dropped from the label — and the supervisor is named in
  //  the note above instead, which the previous assertion checks.
  it('shortens the investigate button and keeps the supervisor in the note', () => {
    const s = summarise(LINES, BLOCKED);
    const phone = routes(s, 'phone');
    const desk = routes(s, 'workstation');
    expect(phone[0].label).toBe('Flag for investigation');
    expect(desk[0].label).toBe('Flag for investigation and ask supervisor');
    //  Same routes, same order, either way.
    expect(phone.map((r) => r.key)).toEqual(desk.map((r) => r.key));
    expect(phoneRouteNote(s)).toMatch(/supervisor/i);
  });

  it('offers no routes on a phone when nothing blocks', () => {
    expect(routes(summarise(LINES, { ...BLOCKED, withinThreshold: true }), 'phone'))
      .toEqual([]);
  });
});
