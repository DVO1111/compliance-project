/**
 * The quarantine banner (node 124:770) — MT-03.
 *
 * "Navy quarantine banner plus a 'what release needs' list from day
 * one."
 *
 * WHY THIS IS NOT RecordBanner. record/banner draws five states on a
 * light ground, in the State colours, for records that are locked,
 * returned, changed or paused. A quarantined lot is none of those: it
 * is the one state in the system that bars an action everywhere at
 * once — "from any screen or integration" — and the design draws it as
 * a solid navy panel for exactly that reason. Putting it through
 * RecordBanner would have made it a sixth tint among five, which is
 * the "Quarantine looks like On hold" failure the design rules out.
 *
 * The sentence is not softened. A lot in quarantine cannot be picked,
 * issued, or dispensed, and the banner says so in those words rather
 * than "awaiting QA" — because somebody looking for why their batch
 * will not start needs the answer, not the status.
 */

import type { CSSProperties } from 'react';
import { Lock } from 'lucide-react';

export interface QuarantineBannerProps {
  /** "10 Oct 2026 · 2 days". The caller formats; the banner shows. */
  since: string;
  /**
   * What happens next, in the person's own terms: "QC records sampling,
   * then tests." Optional, because a lot deep in testing has a
   * different next step and a lot with none should not invent one.
   */
  nextStep?: string;
  className?: string;
}

export default function QuarantineBanner({ since, nextStep, className }: QuarantineBannerProps) {
  return (
    <section className={className} style={banner} role="status">
      <span style={tile}>
        <Lock size={20} strokeWidth={1.75} aria-hidden />
      </span>

      {/*  minWidth, not 0. At phone width the Since column held its
          size and squeezed the title to one word per line — the most
          important sentence on the screen, rendered as a column. A
          floor makes the row wrap the date below instead. */}
      <span style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={title}>Quarantined · blocked from dispensing and production</span>
        <span style={body}>
          This lot can't be picked in dispensing or issued to a batch, from any screen or
          integration, until QA releases it.{nextStep ? ` Next: ${nextStep}` : ''}
        </span>
      </span>

      <span style={{ display: 'flex', flexDirection: 'column', gap: 2,
                     alignItems: 'flex-end', flexShrink: 0, marginLeft: 'auto' }}>
        <span style={meta}>Since</span>
        <span style={{ fontWeight: 600, fontSize: 13, lineHeight: '18px', color: '#ffffff' }}>
          {since}
        </span>
      </span>
    </section>
  );
}

const banner: CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap',
  padding: '16px 20px', borderRadius: 12, width: '100%', boxSizing: 'border-box',
  background: 'var(--nv-light-state-quarantine-bg)',
  fontFamily: 'var(--nv-font-body)',
};

const tile: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36, flexShrink: 0, borderRadius: 8,
  background: 'var(--nv-light-state-quarantine-tile)',
  color: '#ffffff',
};

const title: CSSProperties = {
  fontWeight: 600, fontSize: 15, lineHeight: '22px', color: '#ffffff',
};

const body: CSSProperties = {
  fontSize: 13, lineHeight: '19px',
  color: 'var(--nv-light-state-quarantine-body)',
};

const meta: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--nv-light-state-quarantine-meta)',
};
