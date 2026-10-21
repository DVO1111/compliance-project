/**
 * The zone gauge (IP-02, IP-M02).
 *
 * "A zone gauge with LAL / LWL / UWL / UAL", with the marker moving as
 * the value is typed.
 *
 * THIS GAUGE IS HONEST ABOUT NOT BEING A FULL SCALE, which took some
 * deciding. Zone 3U runs to infinity and 3L runs to zero, so there is
 * no linear axis that shows all five bands. Two tempting answers were
 * both wrong:
 *
 *   clip the axis at, say, twice the action limit — which puts a
 *     number on the gauge that nobody configured, and makes a reading
 *     at 3× UAL sit in the middle of zone 3U as though it were
 *     ordinary;
 *   scale all five bands equally — which makes zone 1, the band an
 *     operator is trying to stay inside, one fifth of the width
 *     regardless of how wide it actually is.
 *
 * So: THE MIDDLE THREE BANDS ARE TO SCALE. 2L, 1 and 2U share the
 * middle in true proportion to their spans, and the four limit labels
 * underneath sit at real positions — a value typed between LAL and UAL
 * is placed honestly and can be read off the gauge. The two outer
 * bands are fixed-width and drawn with a FADED OUTER EDGE, which is
 * the visual statement that they continue past the end. A marker in
 * one of them is positioned by how far past the action limit the value
 * is, clamped at the edge, and the value is printed beside the gauge
 * so nobody has to read a magnitude off a band that has none.
 *
 * THE ZONE UNDER THE MARKER COMES FROM THE CLASSIFIER, not from where
 * the marker landed. `buildGauge` returns `markerZone` from the band
 * predicates, and the chip beside the value shows the database's
 * answer. A gauge whose marker and whose chip could disagree would be
 * worse than either alone.
 */

import type { CSSProperties } from 'react';
import { buildGauge, type ZoneBand } from '../../lib/inprocess/zones';

export interface ZoneGaugeProps {
  bands: ZoneBand[];
  /** The value being typed, or null while the field is empty. */
  value: number | null;
  unit: string;
  className?: string;
}

export default function ZoneGauge({ bands, value, unit, className }: ZoneGaugeProps) {
  const gauge = buildGauge(bands, value);
  if (gauge.segments.length === 0) return null;

  return (
    <div className={className} style={wrap}>
      <div style={track} role="img"
           aria-label={gaugeLabel(gauge.segments.length, unit)}>
        {gauge.segments.map((s, i) => (
          <div
            key={s.zone}
            style={{
              ...segment,
              width: `${s.widthPct}%`,
              background: SEG_TONE[tier(s.zone)],
              //  The faded outer edge on the unbounded ends. It is the
              //  gauge saying "and beyond", and it is why a fixed width
              //  out here is not a claim about quantity.
              maskImage: s.unbounded
                ? `linear-gradient(to ${i === 0 ? 'right' : 'left'}, `
                  + 'rgba(0,0,0,0.25) 0%, rgba(0,0,0,1) 70%)'
                : undefined,
              WebkitMaskImage: s.unbounded
                ? `linear-gradient(to ${i === 0 ? 'right' : 'left'}, `
                  + 'rgba(0,0,0,0.25) 0%, rgba(0,0,0,1) 70%)'
                : undefined,
              borderTopLeftRadius: i === 0 ? 4 : 0,
              borderBottomLeftRadius: i === 0 ? 4 : 0,
              borderTopRightRadius: i === gauge.segments.length - 1 ? 4 : 0,
              borderBottomRightRadius: i === gauge.segments.length - 1 ? 4 : 0,
              color: tier(s.zone) === 3 ? '#ffffff' : 'var(--nv-light-text-primary)',
            }}
          >
            {s.zone}
          </div>
        ))}

        {gauge.markerPct !== null && (
          <span
            style={{ ...marker, left: `${gauge.markerPct}%` }}
            aria-hidden
          />
        )}
      </div>

      {/*  The limit labels, each at its band's left edge. The leftmost
          band has no left edge, so its slot is empty rather than
          carrying a label that belongs to its neighbour. */}
      <div style={labelRow}>
        {gauge.segments.map((s) => (
          <span key={s.zone} style={{ ...labelCell, width: `${s.widthPct}%` }}>
            {s.edgeLabel !== null && s.edgeValue !== null
              ? `${s.edgeLabel} ${s.edgeValue}`
              : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function gaugeLabel(n: number, unit: string): string {
  return `Weight zone gauge, ${n} bands in ${unit}. `
    + 'The three middle bands are drawn to scale between the action limits; '
    + 'the outer bands continue beyond them.';
}

/** 1, 2 or 3 — the severity tier, which is what the gauge paints by.
 *  2U and 2L share a colour here because the gauge already says which
 *  side of target they are on by where they sit. */
function tier(zone: string): 1 | 2 | 3 {
  if (zone === '1') return 1;
  return zone.startsWith('3') ? 3 : 2;
}

// ── Styles ───────────────────────────────────────────────────────────

const wrap: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, width: '100%', minWidth: 0,
};

const track: CSSProperties = {
  display: 'flex', position: 'relative', width: '100%',
  height: 28, borderRadius: 4,
};

const segment: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxSizing: 'border-box', overflow: 'hidden',
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 11, lineHeight: '14px', letterSpacing: '0.02em',
};

const SEG_TONE: Record<1 | 2 | 3, string> = {
  1: 'var(--nv-light-zone-1-bg)',
  2: 'var(--nv-light-zone-2-bg)',
  3: 'var(--nv-light-zone-3-bg)',
};

const marker: CSSProperties = {
  position: 'absolute', top: -4, width: 4, height: 36, borderRadius: 2,
  //  Navy, not a zone colour. The marker says "you are here", and a
  //  marker that changed colour with the band would be saying the same
  //  thing twice and competing with the chip that says it properly.
  background: 'var(--nv-light-ink-bg)',
  transform: 'translateX(-2px)',
  //  Moves with each digit, which is the point of IP-02. Short enough
  //  that it reads as the value moving rather than as an animation.
  transition: 'left 120ms ease-out',
};

const labelRow: CSSProperties = {
  display: 'flex', width: '100%',
};

const labelCell: CSSProperties = {
  boxSizing: 'border-box',
  fontFamily: 'var(--nv-font-mono)', fontSize: 10, lineHeight: '14px',
  color: 'var(--nv-light-text-tertiary)',
  //  Each label sits at the left edge it names, so it lines up with
  //  the boundary rather than with the middle of a band.
  textAlign: 'left', whiteSpace: 'nowrap', overflow: 'visible',
};
