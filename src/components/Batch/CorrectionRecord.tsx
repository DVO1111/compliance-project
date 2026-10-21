/**
 * A corrected reading (BR-06, and BR-02's corrections log).
 *
 * The design's NOT DONE IF: "Correction hides the original: no. The
 * original is shown beside the new value and stays on the record."
 *
 * WHY BOTH VALUES, FOREVER. A batch record is evidence. "The tablet
 * mass was 548 mg" and "the tablet mass was recorded as 520 mg and
 * later corrected to 548 mg, by this person, for this reason" are
 * different claims, and only the second one is true. A correction that
 * replaced the value would turn a record of what happened into a
 * record of what somebody decided it should say — which is the thing
 * §11.10(e) exists to prevent, and the first thing an inspector tests
 * by asking to see a corrected entry.
 *
 * So there is no `value` prop. The component takes BOTH values and has
 * no shape that can render one without the other.
 */

import type { CSSProperties } from 'react';
import { ArrowRight, Paperclip, PenLine } from 'lucide-react';

export interface Correction {
  parameterName: string;
  unit?: string | null;
  /** What was recorded first. Kept on the record permanently. */
  originalValue: string;
  /** What it was corrected to. */
  newValue: string;
  /** Required. A correction without one is not a correction. */
  reason: string;
  correctedBy: string;
  /** "12 Oct 2026 · 15:40". */
  correctedAt: string;
  /** "photo-of-printout.jpg" — the design offers an attachment. */
  attachment?: string | null;
  /**
   * True once both people have signed again. A correction reopens the
   * stage, so until they have, this is an unsigned change.
   */
  resigned?: boolean;
}

export interface CorrectionRecordProps {
  correction: Correction;
  className?: string;
}

export default function CorrectionRecord({ correction: c, className }: CorrectionRecordProps) {
  const unit = c.unit ? ` ${c.unit}` : '';

  return (
    <article className={className} style={card}>
      <header style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>{c.parameterName}</span>
        <span style={{ flex: 1, minWidth: 0 }} />
        <span style={label}>Corrected</span>
      </header>

      {/*  Side by side, not one replacing the other. The original is
          struck through rather than only greyed: on a printed batch
          record grey and black are the same ink. */}
      <div style={values}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={label}>Recorded first</span>
          <span style={{ ...value, ...original }}>{c.originalValue}{unit}</span>
        </span>

        <ArrowRight
          size={18} strokeWidth={2} aria-hidden
          style={{ flexShrink: 0, color: 'var(--nv-light-text-tertiary)', alignSelf: 'flex-end', marginBottom: 2 }}
        />

        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={label}>Corrected to</span>
          <span style={{ ...value, fontWeight: 600 }}>{c.newValue}{unit}</span>
        </span>
      </div>

      <blockquote style={reason}>“{c.reason}”</blockquote>

      <footer style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={meta}>{c.correctedBy} · {c.correctedAt}</span>
        {c.attachment && (
          <span style={{ ...meta, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Paperclip size={13} strokeWidth={2} aria-hidden />
            {c.attachment}
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0 }} />
        {/*  A correction reopens the stage and both people sign again.
            Until they have, the change is real and unsigned, and
            saying so is the difference between a record and a draft. */}
        <span style={{ ...signTag, ...(c.resigned ? signed : unsigned) }}>
          <PenLine size={13} strokeWidth={2} aria-hidden />
          {c.resigned ? 'Signed again by both' : 'Waiting to be signed again'}
        </span>
      </footer>
    </article>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10,
  padding: 14, borderRadius: 8, width: '100%', boxSizing: 'border-box',
  background: 'var(--nv-light-badge-waiting-bg)',
  border: '1px solid var(--nv-light-badge-waiting-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const values: CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap',
  padding: '10px 12px', borderRadius: 6,
  background: 'var(--nv-light-surface)',
};

const label: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--nv-light-text-tertiary)',
};

const value: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 16, lineHeight: '22px',
};

const original: CSSProperties = {
  textDecoration: 'line-through',
  color: 'var(--nv-light-text-secondary)',
};

const reason: CSSProperties = {
  margin: 0, fontSize: 13, lineHeight: '19px',
  color: 'var(--nv-light-text-secondary)',
};

const meta: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 10.5, lineHeight: '16px',
  color: 'var(--nv-light-text-tertiary)',
};

const signTag: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '2px 8px', borderRadius: 4,
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', whiteSpace: 'nowrap',
  borderWidth: 1, borderStyle: 'solid',
};

const signed: CSSProperties = {
  background: 'var(--nv-light-badge-done-bg)',
  borderColor: 'var(--nv-light-badge-done-border)',
  color: 'var(--nv-light-badge-done-text)',
};

const unsigned: CSSProperties = {
  background: 'var(--nv-light-state-overdue-bg)',
  borderColor: 'var(--nv-light-state-overdue-border)',
  color: 'var(--nv-light-state-overdue-text)',
};
