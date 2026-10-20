/**
 * "Release readiness" (node 127:1168) — MT-06 and MT-03.
 *
 * The card that leads both the release screen and the lot detail, and
 * the reason this section exists:
 *
 *   "Blocking conditions only after clicking: no. They lead the release
 *    screen and the lot detail."
 *
 * WHY MET CONDITIONS ARE DRAWN AT ALL. A list of only the problems
 * would be shorter and would answer a different question. Somebody
 * about to sign a release is certifying that the lot meets its
 * specification, and "six of seven tests passed, sampling recorded,
 * supplier qualified to June 2027" is the evidence they are signing
 * against. The blockers tell them they cannot; the met conditions tell
 * them what they would be saying if they could.
 *
 * The card takes a Readiness and renders it. It computes nothing: the
 * conditions come from material_lot_release_conditions, which is the
 * same source the release gate reads, so this card cannot show a green
 * list for a lot the database will refuse.
 */

import type { CSSProperties } from 'react';
import { Check, X, ShieldAlert } from 'lucide-react';
import {
  readinessHeadline, readinessSummary, actionFor,
  type Readiness, type ReleaseCondition, type ConditionAction,
} from '../../lib/materials/releaseReadiness';

export interface ReleaseReadinessCardProps {
  readiness: Readiness;
  /** Where a condition's button goes. Null disables the buttons. */
  onAct?: (action: ConditionAction, condition: ReleaseCondition) => void;
  className?: string;
}

export default function ReleaseReadinessCard({
  readiness, onAct, className,
}: ReleaseReadinessCardProps) {
  const summary = readinessSummary(readiness);
  const ready = readiness.canRelease;

  return (
    <section className={className} style={card} aria-labelledby="release-readiness">
      <header style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 id="release-readiness" style={cardTitle}>Release readiness</h2>
        <span style={{ flex: 1, minWidth: 0 }} />
        <span style={{ ...headline, color: ready ? 'var(--nv-light-badge-done-text)' : 'var(--nv-light-state-overdue-text)' }}>
          {readinessHeadline(readiness)}
        </span>
      </header>

      {/*  The verdict before the list, so somebody who reads one line
          reads the right one. */}
      <div style={{ ...verdict, ...(ready ? verdictReady : verdictBlocked) }}>
        <ShieldAlert
          size={20} strokeWidth={1.75} aria-hidden
          style={{ flexShrink: 0, marginTop: 1,
                   color: ready ? 'var(--nv-light-badge-done-text)' : 'var(--nv-light-state-overdue-text)' }}
        />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 600, fontSize: 14, lineHeight: '20px',
                         color: ready ? 'var(--nv-light-badge-done-text)' : 'var(--nv-light-state-overdue-text)' }}>
            {summary.title}
          </span>
          <span style={{ fontSize: 12, lineHeight: '17px', color: 'var(--nv-light-text-secondary)' }}>
            {summary.detail}
          </span>
        </span>
      </div>

      {readiness.blocking.length > 0 && (
        <>
          <p style={{ ...groupLabel, color: 'var(--nv-light-state-overdue-text)' }}>Blocking</p>
          {readiness.blocking.map((c) => (
            <ConditionRow key={c.key} condition={c} onAct={onAct} />
          ))}
        </>
      )}

      {/*  Unmet but not gating. Kept out of the Blocking group on
          purpose: counting a missing sampling record against release
          would make a releasable lot look un-releasable, and the whole
          card's credibility rests on the count being right. */}
      {readiness.outstanding.length > 0 && (
        <>
          <p style={{ ...groupLabel, color: 'var(--nv-light-badge-waiting-text)' }}>
            Outstanding · does not stop release
          </p>
          {readiness.outstanding.map((c) => (
            <ConditionRow key={c.key} condition={c} onAct={onAct} tone="outstanding" />
          ))}
        </>
      )}

      {readiness.met.length > 0 && (
        <>
          <p style={{ ...groupLabel, color: 'var(--nv-light-badge-done-text)' }}>Met</p>
          {readiness.met.map((c) => (
            <ConditionRow key={c.key} condition={c} onAct={onAct} tone="met" />
          ))}
        </>
      )}
    </section>
  );
}

function ConditionRow({ condition, onAct, tone = 'blocking' }: {
  condition: ReleaseCondition;
  onAct?: (a: ConditionAction, c: ReleaseCondition) => void;
  tone?: 'blocking' | 'outstanding' | 'met';
}) {
  const action = actionFor(condition);

  return (
    <div style={{ ...row, ...ROW_TONE[tone] }}>
      <span style={{ ...marker, ...MARKER_TONE[tone] }}>
        {tone === 'met'
          ? <Check size={16} strokeWidth={2} aria-hidden />
          : <X size={16} strokeWidth={2} aria-hidden />}
      </span>

      {/*  minWidth, not 0. With 0 the action button held its 40px-tall,
          ~160px-wide self and the condition's text wrapped to one word
          per line — on the card whose entire job is being readable
          before anybody clicks anything. A floor wraps the button
          below instead. */}
      <span style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 14, lineHeight: '20px',
                       color: tone === 'blocking' ? 'var(--nv-light-state-overdue-text)'
                         : 'var(--nv-light-text-primary)' }}>
          {condition.title}
        </span>
        <span style={{ fontSize: 12, lineHeight: '17px', color: 'var(--nv-light-text-secondary)' }}>
          {condition.detail}
        </span>
        {/*  Whose move it is. A blocker with no owner is a blocker
            nobody picks up. */}
        {condition.waitingOn && <span style={meta}>{condition.waitingOn}</span>}
      </span>

      {condition.met ? (
        <span style={{ ...meta, marginLeft: 'auto', color: 'var(--nv-light-badge-done-text)' }}>MET</span>
      ) : action && onAct ? (
        <button
          type="button"
          style={{ ...button, marginLeft: 'auto',
                   ...(action.primary ? inkButton : outlineButton) }}
          onClick={() => onAct(action, condition)}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
  padding: 20, borderRadius: 12, minWidth: 0,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const cardTitle: CSSProperties = {
  margin: 0, fontWeight: 600, fontSize: 15, lineHeight: '22px',
};

const headline: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 11, lineHeight: '16px', letterSpacing: '0.04em',
};

const verdict: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start',
  padding: '12px 14px', borderRadius: 8, width: '100%', boxSizing: 'border-box',
  borderWidth: 1, borderStyle: 'solid',
};

const verdictBlocked: CSSProperties = {
  background: 'var(--nv-light-state-overdue-bg)',
  borderColor: 'var(--nv-light-state-overdue-border)',
};

const verdictReady: CSSProperties = {
  background: 'var(--nv-light-badge-done-bg)',
  borderColor: 'var(--nv-light-badge-done-border)',
};

const groupLabel: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 11, lineHeight: '16px', letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  padding: 12, borderRadius: 8, width: '100%', boxSizing: 'border-box',
  borderWidth: 1, borderStyle: 'solid',
};

const ROW_TONE: Record<'blocking' | 'outstanding' | 'met', CSSProperties> = {
  //  A tinted panel with a red edge. The blockers are the only rows on
  //  the card that are allowed to shout.
  blocking:    { background: '#fbedea', borderColor: 'var(--nv-light-state-overdue-border)' },
  outstanding: { background: 'var(--nv-light-badge-waiting-bg)',
                 borderColor: 'var(--nv-light-badge-waiting-border)' },
  met:         { background: 'var(--nv-light-surface)', borderColor: 'var(--nv-light-border)' },
};

const marker: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, flexShrink: 0, borderRadius: 16,
};

const MARKER_TONE: Record<'blocking' | 'outstanding' | 'met', CSSProperties> = {
  blocking:    { background: 'var(--nv-light-state-rejected-bg)', color: '#ffffff' },
  outstanding: { background: 'var(--nv-light-badge-waiting-border)',
                 color: 'var(--nv-light-badge-waiting-text)' },
  met:         { background: 'var(--nv-light-badge-done-bg)',
                 color: 'var(--nv-light-badge-done-text)' },
};

const meta: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.04em',
  color: 'var(--nv-light-text-tertiary)', whiteSpace: 'nowrap',
};

const button: CSSProperties = {
  height: 40, padding: '0 18px', borderRadius: 8, flexShrink: 0,
  fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 15, lineHeight: '20px', cursor: 'pointer',
};

const outlineButton: CSSProperties = {
  background: 'var(--nv-light-outline-bg)',
  border: '1px solid var(--nv-light-outline-border)',
  color: 'var(--nv-light-outline-text)',
};

//  The ink button marks the one thing the reader can clear themselves.
//  Everything else is somebody else's move, and an equally loud button
//  on all of them would hide that.
const inkButton: CSSProperties = {
  background: 'var(--nv-light-ink-bg)',
  border: '1px solid var(--nv-light-ink-bg)',
  color: 'var(--nv-light-ink-text)',
};
