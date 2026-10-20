/**
 * Flagged and blocked, on the floor (LC-02, DS-02, DS-03, and their
 * phone versions).
 *
 * The design defines both treatments in one sentence:
 *
 *   "flagged = amber, info icon, 'you can continue with…'; blocked =
 *    solid red, ✕, 'can't', no way past it on screen."
 *
 * ONE COMPONENT FOR BOTH, DELIBERATELY. Two components would be two
 * places for the rule to live, and the second one written would drift
 * — that is how a system ends up with an amber notice saying "cannot"
 * and a red one offering a way past. Here the two treatments sit in
 * the same file, eight lines apart, and a change to one is visibly a
 * change to the pair.
 *
 * THE BLOCKED VARIANT HAS NO ACTION SLOT. Not "an optional action that
 * screens should not pass" — no slot at all. "No way past it on
 * screen" is a property of the component, not a convention somebody
 * has to remember at the seventh call site. Blocked notices take
 * `nextSteps`, which are things to go and do elsewhere; flagged
 * notices take an action, because for them there is one.
 */

import type { CSSProperties, ReactNode } from 'react';
import { X, Info } from 'lucide-react';
import {
  effectiveSeverity, type FloorCondition, type Severity,
} from '../../lib/floor/floorConditions';
import { TOUCH } from '../../lib/batch/stageStrip';

export interface FloorNoticeProps {
  condition: FloorCondition;
  /**
   * What to do about a FLAGGED condition — getting the authorisation.
   * Ignored when the condition is blocked, because a blocked notice
   * has no way past it.
   */
  action?: { label: string; onAct: () => void };
  /**
   * Where to go about a BLOCKED one. DS-03 shows two: "switch to
   * BAL-03" and "notify the owner". They are not ways past the block;
   * they are the work that removes it.
   */
  nextSteps?: ReactNode;
  className?: string;
}

export default function FloorNotice({
  condition, action, nextSteps, className,
}: FloorNoticeProps) {
  //  A malformed flagged condition renders as blocked rather than as a
  //  promise with nothing after it. See isWellFormed.
  const severity = effectiveSeverity(condition);
  const blocked = severity === 'blocked';

  return (
    <section
      className={className}
      style={{ ...notice, ...TONE[severity] }}
      role={blocked ? 'alert' : 'status'}
    >
      <span style={{ ...mark, ...MARK_TONE[severity] }}>
        {blocked
          ? <X size={20} strokeWidth={3} aria-hidden />
          : <Info size={20} strokeWidth={2.5} aria-hidden />}
      </span>

      <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ ...title, color: TONE[severity].color }}>
          {/*  The design's word, not a synonym. "Can't" is shorter and
              blunter than "unable to", and bluntness is the point of a
              red notice on a factory floor. */}
          {blocked ? "Can't · " : ''}{condition.title}
        </span>

        <span style={detail}>{condition.detail}</span>

        {/*  "you can continue with…" — only ever on a flagged notice,
            and only ever with something after it. */}
        {!blocked && condition.continueWith && (
          <span style={continueWith}>
            <strong style={{ fontWeight: 600 }}>You can continue with:</strong>{' '}
            {condition.continueWith}
          </span>
        )}

        {blocked && nextSteps && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={stepsLabel}>What removes this</span>
            {nextSteps}
          </div>
        )}
      </div>

      {/*  The action exists on the flagged branch only. There is no
          `blocked && action` case to forget. */}
      {!blocked && action && (
        <button type="button" style={actionButton} onClick={action.onAct}>
          {action.label}
        </button>
      )}
    </section>
  );
}

/**
 * A list of floor conditions, blocked first.
 *
 * Amber above red would invite somebody to clear the amber and find
 * the red afterwards — the one-at-a-time failure this whole section
 * is written against.
 */
export function FloorNoticeList({ conditions, className }: {
  conditions: FloorCondition[]; className?: string;
}) {
  if (conditions.length === 0) return null;
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {conditions.map((c) => <FloorNotice key={c.key} condition={c} />)}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const notice: CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap',
  padding: 16, borderRadius: 10, width: '100%', boxSizing: 'border-box',
  borderWidth: 2, borderStyle: 'solid',
  fontFamily: 'var(--nv-font-body)',
};

const TONE: Record<Severity, CSSProperties & { color: string }> = {
  //  Solid red fill, white type. The only notice in the system that
  //  inverts, which is how it reads as a stop rather than a warning.
  blocked: {
    background: 'var(--nv-light-state-rejected-bg)',
    borderColor: 'var(--nv-light-state-rejected-bg)',
    color: 'var(--nv-light-state-rejected-text)',
  },
  //  Amber tint with an amber edge. Legible, insistent, and clearly
  //  not the red one at a glance across a room.
  flagged: {
    background: 'var(--nv-light-badge-waiting-bg)',
    borderColor: 'var(--nv-light-badge-waiting-border)',
    color: 'var(--nv-light-badge-waiting-text)',
  },
};

const mark: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36, flexShrink: 0, borderRadius: 18,
};

const MARK_TONE: Record<Severity, CSSProperties> = {
  blocked: { background: '#ffffff', color: 'var(--nv-light-state-rejected-bg)' },
  flagged: { background: 'var(--nv-light-badge-waiting-border)',
             color: 'var(--nv-light-badge-waiting-text)' },
};

const title: CSSProperties = {
  fontWeight: 600, fontSize: 17, lineHeight: '24px',
};

//  Detail and the continue line sit on a panel inside the notice, so
//  they stay readable on the solid red fill without a second colour
//  rule per variant.
const detail: CSSProperties = {
  padding: '10px 12px', borderRadius: 6,
  background: 'var(--nv-light-surface)',
  color: 'var(--nv-light-text-primary)',
  fontSize: 14, lineHeight: '21px',
};

const continueWith: CSSProperties = {
  padding: '10px 12px', borderRadius: 6,
  background: 'var(--nv-light-surface)',
  color: 'var(--nv-light-text-primary)',
  fontSize: 14, lineHeight: '21px',
};

const stepsLabel: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.06em',
  textTransform: 'uppercase', color: '#ffffff', opacity: 0.85,
};

const actionButton: CSSProperties = {
  //  56px, for gloved hands at a workstation.
  height: TOUCH.target, padding: '0 20px', borderRadius: 8, flexShrink: 0,
  background: 'var(--nv-light-ink-bg)', border: '1px solid var(--nv-light-ink-bg)',
  color: 'var(--nv-light-ink-text)',
  fontFamily: 'var(--nv-font-display)', fontWeight: 600, fontSize: 16, lineHeight: '20px',
  cursor: 'pointer',
};
