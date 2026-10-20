/**
 * The sample due prompt (IP-01, IP-M01).
 *
 * The design's DONE MEANS: "A sample due prompt an operator will
 * notice → largest element on screen, overdue count, repeat
 * chime/vibration."
 *
 * ALL THREE OF THOSE ARE PROPERTIES OF THIS COMPONENT, not advice to
 * whoever assembles the screen.
 *
 *   largest element — the band is full width, 72 px of circle, 72 px
 *     of button, and the headline is the display face at 26 px. It
 *     cannot be made small from outside: there is no `size` prop.
 *   overdue count — `promptStatusLine` puts the minutes in the label,
 *     because "a sample is due" is a notification an operator learns
 *     to dismiss, and because the gap between due and taken is the
 *     number an inspector asks about.
 *   repeat chime — `useSampleChime` below, driven by how overdue the
 *     prompt is rather than by a timer this component owns.
 *
 * WHY THE CHIME IS DERIVED FROM THE MINUTE RATHER THAN SET ON AN
 * INTERVAL. A component that owned an interval would keep chiming
 * after the sample was taken if it unmounted in the wrong order, and a
 * workstation that chimes at nothing is a workstation somebody turns
 * the volume down on — after which no prompt is ever heard again. So
 * the rule is `shouldChime(minutesOverdue, lastChimed)`: a pure
 * function of state, which cannot fire for a prompt that is no longer
 * on screen.
 *
 * IT CHIMES, IT DOES NOT BLOCK. Nothing here prevents the operator
 * doing something else first. A prompt that took over the screen would
 * be dismissed by habit within a week.
 */

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Clock } from 'lucide-react';
import {
  promptStatusLine, promptDetailLine, shouldChime, type SamplePrompt,
} from '../../lib/inprocess/zones';
import { TOUCH } from '../../lib/batch/stageStrip';

export interface SampleDuePromptProps {
  prompt: SamplePrompt;
  /** What the check is called on the band — "Weight check #14 · take
   *  20 tablets from the press". Passed in rather than assembled here,
   *  because the sample size is the formula's and the instruction is
   *  the company's. */
  headline: string;
  onTakeSample: () => void;
  /** Called once per overdue minute. The caller plays the sound and
   *  vibrates; this component decides WHEN, because the rule is the
   *  design's and the device API is the host's. */
  onChime?: () => void;
  className?: string;
}

export default function SampleDuePrompt({
  prompt, headline, onTakeSample, onChime, className,
}: SampleDuePromptProps) {
  useSampleChime(prompt.minutesOverdue, onChime);
  const overdue = prompt.minutesOverdue >= 0;

  return (
    <section
      className={className}
      style={band}
      //  'alert' when overdue, 'status' while counting down. A prompt
      //  that announced itself assertively before it was due would
      //  teach a screen-reader user to ignore the one that matters.
      role={overdue ? 'alert' : 'status'}
      aria-labelledby="sample-due-headline"
    >
      <span style={dial} aria-hidden>
        <Clock size={28} strokeWidth={2.25} />
      </span>

      <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={statusLine}>{promptStatusLine(prompt)}</span>
        <span id="sample-due-headline" style={headlineStyle}>{headline}</span>
        <span style={detailLine}>{promptDetailLine(prompt)}</span>
      </div>

      <button type="button" style={takeButton} onClick={onTakeSample}>
        Take sample
      </button>
    </section>
  );
}

/**
 * Chimes once per overdue minute, and never for a prompt that is not
 * yet due.
 *
 * The last minute chimed is a ref rather than state: it must not cause
 * a render, and it must survive one. Reset when the prompt stops being
 * overdue, so a taken sample that falls due again chimes afresh rather
 * than staying silent because its minute counter is still high.
 */
export function useSampleChime(minutesOverdue: number, onChime?: () => void) {
  const lastChimed = useRef<number | null>(null);

  useEffect(() => {
    if (minutesOverdue < 0) {
      lastChimed.current = null;
      return;
    }
    if (shouldChime(minutesOverdue, lastChimed.current)) {
      lastChimed.current = Math.floor(minutesOverdue);
      onChime?.();
    }
  }, [minutesOverdue, onChime]);
}

/**
 * What is coming up after this one (IP-01's lower-left card).
 *
 * Listed because an operator who knows friability is due at 11:30 can
 * take it with the 11:00 weight check and walk to the press once. The
 * prompt is about not missing a sample; this is about not making four
 * trips.
 */
export function ComingUpCard({ items, className }: {
  items: Array<{ key: string; parameter: string; when: string }>;
  className?: string;
}) {
  return (
    <section className={className} style={card} aria-labelledby="coming-up">
      <h2 id="coming-up" style={cardTitle}>Coming up</h2>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, lineHeight: '20px',
                    color: 'var(--nv-light-text-secondary)' }}>
          Nothing else is scheduled on this stage.
        </p>
      ) : items.map((it) => (
        <div key={it.key} style={comingRow}>
          <Clock size={16} strokeWidth={1.75} aria-hidden
                 style={{ flexShrink: 0, color: 'var(--nv-light-text-tertiary)' }} />
          <span style={{ flex: 1, minWidth: 120, fontWeight: 600, fontSize: 14,
                         lineHeight: '20px' }}>
            {it.parameter}
          </span>
          <span style={{ fontSize: 13, lineHeight: '18px',
                         color: 'var(--nv-light-text-secondary)' }}>
            {it.when}
          </span>
        </div>
      ))}
    </section>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const band: CSSProperties = {
  display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap',
  width: '100%', boxSizing: 'border-box',
  padding: '18px 20px', borderRadius: 16,
  background: 'var(--nv-light-ink-bg)',
  //  4 px of amber. The band is navy like the workstation bar above
  //  it, and the border is what separates "the chrome" from "the thing
  //  asking you for something".
  border: '4px solid var(--nv-light-badge-waiting-border)',
  fontFamily: 'var(--nv-font-body)',
};

const dial: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 72, height: 72, flexShrink: 0, borderRadius: 36,
  background: 'var(--nv-light-badge-waiting-border)',
  color: 'var(--nv-light-ink-bg)',
};

const statusLine: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 13, lineHeight: '16px',
  color: 'var(--nv-light-badge-waiting-border)',
};

const headlineStyle: CSSProperties = {
  fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 26, lineHeight: '32px', color: '#ffffff',
  textWrap: 'balance',
};

const detailLine: CSSProperties = {
  fontSize: 13, lineHeight: '18px',
  color: 'var(--nv-light-state-quarantine-body)',
};

const takeButton: CSSProperties = {
  //  72 px, not the 56 px floor minimum. This is the one button on the
  //  screen somebody reaches for without looking at it.
  height: 72, minWidth: 180, padding: '0 24px', borderRadius: 12, flexShrink: 0,
  background: 'var(--nv-light-badge-waiting-border)', border: 'none',
  color: 'var(--nv-light-ink-bg)',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 20, lineHeight: '26px',
  cursor: 'pointer',
};

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8,
  padding: 14, borderRadius: 12, minWidth: 0,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const cardTitle: CSSProperties = {
  margin: 0, fontWeight: 600, fontSize: 15, lineHeight: '22px',
};

const comingRow: CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
  minHeight: TOUCH.gap * 2,
};
