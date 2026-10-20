/**
 * A weight zone chip (IP-01 through IP-05, and their phone versions).
 *
 * "Zones (distinguishable in greyscale): 1 = light circle; 2U/2L =
 *  outlined square with one arrow up/down; 3U/3L = dark solid square
 *  with two arrows. Colour is secondary."
 *
 * THE SHAPE IS DRAWN FROM `ZONE_GLYPH`, NOT FROM A BRANCH HERE. There
 * are five places a chip appears — the shift history, the recorded
 * grid, the live typing panel, the zone key, the running average — and
 * the table in `lib/inprocess/zones.ts` is what stops the fifth one
 * being a circle with an arrow in it.
 *
 * WHY THE ARROWS ARE SVG AND NOT A LUCIDE ICON. Two chevrons stacked
 * with no gap, at 16 px, inside a 28 px chip: that is a specific
 * drawing, and `<ChevronUp>` twice in a flex row is not it — the two
 * glyphs carry their own padding and the pair reads as one thick
 * arrow. The paths below are the chevron, placed so the two are
 * distinguishable at 28 px, which is the whole point of counting them.
 *
 * SIZE IS A PROP WITH TWO VALUES, not a number. 28 px is the chip in a
 * list; 40 px is the chip in the live typing panel, where it is the
 * thing an operator is looking at. A free-form size would produce a
 * 31 px chip somewhere and the arrows would stop being countable.
 */

import type { CSSProperties } from 'react';
import {
  ZONE_GLYPH, zoneDescription, type ZoneOrNone,
} from '../../lib/inprocess/zones';

export interface ZoneChipProps {
  zone: ZoneOrNone;
  size?: 'list' | 'focus';
  className?: string;
}

export default function ZoneChip({ zone, size = 'list', className }: ZoneChipProps) {
  const g = ZONE_GLYPH[zone];
  const tone = TONE[g.tone];
  const px = size === 'focus' ? 40 : 28;
  const arrow = size === 'focus' ? 14 : 11;

  return (
    <span
      className={className}
      style={{
        ...chip,
        height: px,
        minWidth: px,
        //  A circle is a circle at any size; a square keeps a small
        //  radius so it never reads as one.
        borderRadius: g.shape === 'circle' ? px / 2 : 4,
        padding: g.arrows > 0 ? `0 ${size === 'focus' ? 8 : 6}px` : 0,
        background: tone.bg,
        //  The solid variant has no border, because a border on a dark
        //  fill is a line nobody sees and an inconsistency somebody
        //  later "fixes" in the wrong direction.
        border: g.fill === 'solid' ? 'none' : `2px solid ${tone.border}`,
        borderStyle: g.tone === 'none' ? 'dashed' : 'solid',
        borderWidth: g.fill === 'solid' ? 0 : 2,
        borderColor: tone.border,
        color: tone.text,
        fontSize: size === 'focus' ? 15 : zone === '1' ? 13 : 12,
      }}
      title={zoneDescription(zone)}
      aria-label={zoneDescription(zone)}
      role="img"
    >
      {g.arrows > 0 && g.direction && (
        <span style={{ ...arrows, width: arrow }} aria-hidden>
          {Array.from({ length: g.arrows }, (_, i) => (
            <Chevron
              key={i} size={arrow} up={g.direction === 'up'}
              //  The second chevron NESTS into the first rather than
              //  stacking below it. A flex gap cannot be negative, so
              //  the overlap is a margin: without it the pair reads as
              //  one thick arrow and the count stops being the signal.
              overlap={i > 0}
            />
          ))}
        </span>
      )}
      <span style={{ fontWeight: 600, lineHeight: 1 }}>{g.label}</span>
    </span>
  );
}

/**
 * One chevron, stroked, with no padding of its own.
 *
 * `strokeWidth` is in the 24-unit viewBox, so it scales with the chip
 * rather than thinning out at 40 px. 2.75 is what keeps two of them
 * countable at 28 px without their ends touching.
 */
function Chevron({ size, up, overlap }: { size: number; up: boolean; overlap: boolean }) {
  return (
    <svg
      width={size} height={size * 0.56} viewBox="0 0 24 14"
      fill="none" stroke="currentColor" strokeWidth={2.75}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', marginTop: overlap ? -Math.round(size * 0.2) : 0 }}
    >
      {up ? <path d="M2 11 L12 3 L22 11" /> : <path d="M2 3 L12 11 L22 3" />}
    </svg>
  );
}

/**
 * The zone key for a product (IP-01's right-hand card).
 *
 * Bands high to low, which is the opposite of the gauge and
 * deliberately so: the gauge is a scale and reads left to right from
 * low, while this is a list and reads top to bottom from the worst
 * case — the row an operator checks first is the one that stops the
 * press.
 */
export function ZoneKeyCard({ bands, className }: {
  bands: Array<{
    zone: ZoneOrNone; boundText: string; actionText: string;
  }>;
  className?: string;
}) {
  return (
    <section className={className} style={card} aria-labelledby="zone-key">
      <h2 id="zone-key" style={cardTitle}>Weight zones for this product</h2>

      {bands.length === 0 ? (
        //  No bands rather than five empty ones — inprocess_zone_key
        //  returns nothing for an unconfigured product, and this says
        //  so instead of drawing a gauge nobody set.
        <p style={empty}>
          No weight variation limits are configured for this product, so readings are
          recorded and judged against specification but not put in a zone. Someone with
          product setup access can add them.
        </p>
      ) : bands.map((b) => (
        <div key={b.zone} style={keyRow}>
          <span style={{ width: 64, flexShrink: 0, display: 'flex' }}>
            <ZoneChip zone={b.zone} />
          </span>
          <span style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column' }}>
            <span style={boundLine}>{b.boundText}</span>
            <span style={actionLine}>{b.actionText}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const chip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  gap: 2, boxSizing: 'border-box', flexShrink: 0,
  fontFamily: 'var(--nv-font-body)', whiteSpace: 'nowrap',
};

const arrows: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
};

const TONE: Record<string, { bg: string; border: string; text: string }> = {
  zone1: { bg: 'var(--nv-light-zone-1-bg)', border: 'var(--nv-light-zone-1-border)',
           text: 'var(--nv-light-zone-1-text)' },
  zone2: { bg: 'var(--nv-light-zone-2-bg)', border: 'var(--nv-light-zone-2-border)',
           text: 'var(--nv-light-zone-2-text)' },
  zone3: { bg: 'var(--nv-light-zone-3-bg)', border: 'var(--nv-light-zone-3-border)',
           text: 'var(--nv-light-zone-3-text)' },
  none:  { bg: 'var(--nv-light-zone-none-bg)', border: 'var(--nv-light-zone-none-border)',
           text: 'var(--nv-light-zone-none-text)' },
};

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8,
  padding: 14, borderRadius: 12, minWidth: 0,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const cardTitle: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-body)', fontWeight: 600,
  fontSize: 15, lineHeight: '22px',
};

const keyRow: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
};

const boundLine: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 12, lineHeight: '16px',
  color: 'var(--nv-light-text-primary)',
};

const actionLine: CSSProperties = {
  fontSize: 12, lineHeight: '16px', color: 'var(--nv-light-text-secondary)',
};

const empty: CSSProperties = {
  margin: 0, padding: '12px 14px', borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
  fontSize: 13, lineHeight: '20px', color: 'var(--nv-light-text-secondary)',
};
