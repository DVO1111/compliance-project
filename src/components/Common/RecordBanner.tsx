/**
 * record/banner — the strip directly under a record header that says
 * why the record is not behaving normally.
 *
 * From the design system's own description of the component (node
 * 38:441 in Criateur Compliance · Product Design):
 *
 *   "Record-level banner, directly under the record header. Locked
 *    (hold blue, lock icon, E4.1/E4.3), Returned (hold blue, return
 *    icon, quoted mandatory comment, B3.7/E4.4), Changed after signing
 *    (overdue red, X3.5). Uses State colours, so it never reads as
 *    rejected. Compliance directive (hold, pause octagon, raised-at
 *    stage, received date, response deadline, paused vs active clock,
 *    quoted directive, "not a rejection" line; A1.3–A1.6). Licence
 *    expired (red border on overdue tint, cross icon, names the
 *    licence, expiry date and renewal status; A5.6–A5.7)."
 *
 * "USES STATE COLOURS, SO IT NEVER READS AS REJECTED" is the load-
 * bearing sentence and the reason the palette below is bound rather
 * than chosen. A locked record and a returned one are blue, not red,
 * because neither is a refusal — a reviewer who sees red assumes the
 * submission failed, and acts on that. Only the two states that really
 * are failures use the overdue tint, and rejected red is not used here
 * at all.
 *
 * TWO OF THESE STATES ARE THE SIGNATURE STATES. "Locked" is what a
 * signed, closed record shows; "changed after signing" is what it shows
 * when the record moved underneath a signature that was taken over it.
 * The second is the visible half of the hash check in
 * lifecycle_consume_signature — the database refuses the transition,
 * and this is how the person finds out why.
 *
 * Every colour, size and weight here is read from the component, not
 * sampled from a screenshot. See src/styles/tokens.css for the tokens
 * and why they are bound.
 */

import type { CSSProperties, ReactNode } from 'react';
import { ICONS, STATUS_ICONS, iconProps } from '../../lib/design/icons';

export type RecordBannerState =
  /** A signed or closed record. Nothing on it can change. */
  | 'locked'
  /** Sent back for revision, with the reviewer's mandatory comment. */
  | 'returned'
  /** The record moved after a signature was taken over it. */
  | 'changed_after_signing'
  /** A regulator paused review pending a response. Not a rejection. */
  | 'compliance_directive'
  /** The licence this record depends on has expired. */
  | 'licence_expired';

/** A small label-over-value pair in the banner's fact row. */
export interface RecordBannerFact {
  /** Upper-cased by the style, so pass it as written. */
  label: string;
  value: ReactNode;
}

export interface RecordBannerProps {
  state: RecordBannerState;
  /** The one-line explanation. The design writes it as a sentence. */
  title: string;
  /** Optional, and shown in the order given. */
  facts?: RecordBannerFact[];
  /**
   * A quotation from somebody outside the system — a regulator's
   * directive, a reviewer's comment. Rendered as a quote block, which
   * is why it is separate from `note`: the words are not ours.
   */
  quote?: string;
  /** One closing line in quieter type. */
  note?: string;
  className?: string;
}

/**
 * Tint, stroke and glyph per state.
 *
 * The glyphs come from the project's icon registry rather than from the
 * component's exported SVG, because the registry already maps the
 * toolkit's names onto the icon set this app ships and records where a
 * substitution was made. Embedding the SVG would duplicate that mapping
 * and let the two drift.
 */
const STATES: Record<RecordBannerState, {
  bg: string; border: string; text: string;
  icon: typeof ICONS['action/check'];
}> = {
  locked: {
    bg: 'var(--nv-light-state-hold-bg)',
    border: 'var(--nv-light-state-hold-border)',
    text: 'var(--nv-light-state-hold-text)',
    icon: ICONS['lifecycle/lock-record'],
  },
  returned: {
    bg: 'var(--nv-light-state-hold-bg)',
    border: 'var(--nv-light-state-hold-border)',
    text: 'var(--nv-light-state-hold-text)',
    icon: ICONS['lifecycle/returned'],
  },
  compliance_directive: {
    bg: 'var(--nv-light-state-hold-bg)',
    border: 'var(--nv-light-state-hold-border)',
    text: 'var(--nv-light-state-hold-text)',
    //  The pause octagon. An octagon and not another coloured circle,
    //  so hold stays distinguishable from rejected in greyscale — the
    //  icon toolkit is explicit that colour is never the only signal.
    icon: STATUS_ICONS.on_hold.icon,
  },
  changed_after_signing: {
    bg: 'var(--nv-light-state-overdue-bg)',
    border: 'var(--nv-light-state-overdue-border)',
    text: 'var(--nv-light-state-overdue-text)',
    icon: ICONS['quality/reject'],
  },
  licence_expired: {
    bg: 'var(--nv-light-state-overdue-bg)',
    border: 'var(--nv-light-state-overdue-border)',
    text: 'var(--nv-light-state-overdue-text)',
    icon: ICONS['quality/reject'],
  },
};

export default function RecordBanner({
  state, title, facts, quote, note, className,
}: RecordBannerProps) {
  const s = STATES[state];
  const Glyph = s.icon;

  return (
    <div
      className={className}
      style={{ ...banner, background: s.bg, borderColor: s.border }}
      //  The state is announced, not inferred from colour. A screen
      //  reader gets "status" and the title sentence, which carries the
      //  meaning on its own — the design's rule that colour is never
      //  the only signal applies here too.
      role="status"
    >
      <span aria-hidden="true" style={{ color: s.text, flexShrink: 0, lineHeight: 0, marginTop: 1 }}>
        <Glyph {...iconProps('md')} />
      </span>

      <div style={column}>
        <p style={{ ...titleStyle, color: s.text }}>{title}</p>

        {facts && facts.length > 0 && (
          <div style={factRow}>
            {facts.map((f) => (
              <div key={f.label} style={fact}>
                <span style={factLabel}>{f.label}</span>
                <span style={factValue}>{f.value}</span>
              </div>
            ))}
          </div>
        )}

        {/*  A blockquote, because the words are somebody else's — a
            regulator's directive or a reviewer's comment — and the
            design gives them their own surface and rule.  */}
        {quote && (
          <blockquote style={{ ...quoteBlock, borderLeftColor: s.border }}>
            <p style={quoteText}>{quote}</p>
          </blockquote>
        )}

        {note && <p style={noteStyle}>{note}</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */

//  The 4px left border is the component's: a record banner is read
//  down the left edge of the record, so the stroke is heavier there.
const banner: CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'flex-start',
  padding: '16px 20px',
  borderRadius: 12,
  borderStyle: 'solid',
  borderWidth: '1px 1px 1px 4px',
  fontFamily: 'var(--nv-font-body)',
};

const column: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
  flex: '1 0 0', minWidth: 0,
};

const titleStyle: CSSProperties = {
  margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600,
  overflowWrap: 'anywhere',
};

const factRow: CSSProperties = {
  display: 'flex', flexWrap: 'wrap',
  gap: '6px 24px', alignItems: 'flex-start',
};

const fact: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
};

const factLabel: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: 'normal',
  textTransform: 'uppercase',
  color: 'var(--nv-light-text-tertiary)',
  whiteSpace: 'nowrap',
};

const factValue: CSSProperties = {
  fontSize: 13, fontWeight: 600, lineHeight: 'normal',
  color: 'var(--nv-light-text-primary)',
  whiteSpace: 'nowrap',
};

const quoteBlock: CSSProperties = {
  margin: 0, width: '100%', boxSizing: 'border-box',
  padding: '10px 14px',
  borderRadius: 8,
  borderLeft: '3px solid',
  background: 'var(--nv-light-surface)',
};

const quoteText: CSSProperties = {
  margin: 0, fontSize: 13, lineHeight: '20px',
  color: 'var(--nv-light-text-primary)',
  overflowWrap: 'anywhere',
};

const noteStyle: CSSProperties = {
  margin: 0, fontSize: 12, lineHeight: '18px',
  color: 'var(--nv-light-text-secondary)',
  overflowWrap: 'anywhere',
};
