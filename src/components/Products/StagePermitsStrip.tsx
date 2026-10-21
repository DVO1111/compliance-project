/**
 * "What each stage permits" (node 65:1650).
 *
 * A legend, placed on the product registry so somebody can answer "why
 * can this product not start a batch" without opening it. The design
 * puts it on PR-01 under the table.
 *
 * It is static — the five stages are the product lifecycle's, not a
 * given company's data — so it takes no props. The sentences come from
 * src/lib/products/stagePermits.ts, which is also what the per-row
 * "What it permits" column reads, so the legend and the column cannot
 * disagree about what a stage means.
 */

import type { CSSProperties } from 'react';
import StateBadge from '../Common/StateBadge';
import { STAGE_PERMITS, STAGE_FOOTNOTE } from '../../lib/products/stagePermits';

export default function StagePermitsStrip({ className }: { className?: string }) {
  return (
    <section className={className} style={strip} aria-labelledby="stage-permits">
      <h3 id="stage-permits" style={heading}>What each stage permits</h3>

      <div style={grid}>
        {STAGE_PERMITS.map((s) => (
          <div key={s.stage} style={cell}>
            <StateBadge state={s.badge}>{s.label}</StateBadge>
            <p style={permits}>{s.permits}</p>
          </div>
        ))}
      </div>

      <p style={footnote}>{STAGE_FOOTNOTE}</p>
    </section>
  );
}

const strip: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
  padding: 16, borderRadius: 12,
  background: 'var(--nv-light-surface-sunken)',
  fontFamily: 'var(--nv-font-body)',
};

const heading: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 11, lineHeight: '16px', letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--nv-light-text-tertiary)',
};

const grid: CSSProperties = {
  display: 'grid',
  //  Five across where there is room, wrapping to two or one rather
  //  than squeezing five columns onto a phone.
  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
  gap: 10,
};

const cell: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
  padding: 12, borderRadius: 8,
  background: 'var(--nv-light-surface)',
};

const permits: CSSProperties = {
  margin: 0, fontSize: 12, lineHeight: '18px',
  color: 'var(--nv-light-text-secondary)',
};

const footnote: CSSProperties = {
  margin: 0, fontSize: 11.5, lineHeight: '16px',
  color: 'var(--nv-light-text-tertiary)',
};
