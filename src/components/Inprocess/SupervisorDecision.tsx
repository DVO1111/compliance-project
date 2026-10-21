/**
 * The supervisor's decision on an escalated reading (IP-04, IP-M04).
 *
 * "Continue or stop, reason, signature; recorded against the reading,
 *  no deviation created."
 *
 * ═════════════════════════════════════════════════════════════════════
 * "NO DEVIATION CREATED" IS THE PART THIS COMPONENT HAS TO GET RIGHT
 * ═════════════════════════════════════════════════════════════════════
 * Item 11's second NOT DONE IF is "an OOS reading creates a deviation
 * automatically", and by Week 5 the deviation tables exist — so this is
 * now a live temptation rather than a theoretical one. A supervisor
 * stopping a line looks exactly like the moment to raise one.
 *
 * It is not, and the reason is about who decides: a deviation is an
 * investigation somebody owns, with a CAPA behind it. Raising one from
 * a screen means the system decided there was a deviation, and the
 * effect in practice is a queue of auto-raised deviations nobody wrote
 * and nobody closes — after which a real deviation looks like noise.
 *
 * So this component does not raise one, and it SAYS it does not, in
 * the footnote under the buttons. A supervisor who wants a deviation
 * raises one deliberately, and the panel says where.
 *
 * THE PERSON WHO RAISED IT MAY NOT DECIDE IT. `canDecide` in
 * inprocessModel is the predicate, the database refuses it too, and
 * this component does not render the decision controls when it is
 * false — showing them would produce an error the operator cannot act
 * on. It says whose decision it is instead.
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ShieldCheck, PauseOctagon } from 'lucide-react';
import ZoneChip from './ZoneChip';
import type { ZoneOrNone } from '../../lib/inprocess/zones';
import type { OosDecision } from '../../lib/pharma/inprocessModel';
import { TOUCH } from '../../lib/batch/stageStrip';

export interface SupervisorDecisionProps {
  /** What is being decided. */
  reading: {
    parameter: string;
    value: number;
    unit: string;
    sequenceNo: number;
    zone: ZoneOrNone;
    inSpecification: boolean | null;
    recordedBy: string;
    recordedAt: string;
  };
  raisedBy: string;
  raisedNote: string | null;
  /** False when this viewer raised the escalation, or when it is
   *  already decided. The controls are then not rendered. */
  canDecide: boolean;
  /** Set once the escalation has been answered. */
  decided?: {
    decision: OosDecision;
    reason: string;
    decidedBy: string;
    decidedAt: string;
  };
  /** The supervisor's two routes, in the design's words. `decision` is
   *  the vocabulary `inprocess_decide_escalation` accepts. */
  onDecide: (decision: OosDecision, reason: string) => void;
  /** Where a deviation is raised, if the supervisor judges one is
   *  warranted. A link, not an automatic act. */
  onRaiseDeviation?: () => void;
  className?: string;
}

/**
 * Continue and stop, in the design's words, mapped to the vocabulary
 * the database accepts.
 *
 * `inprocess_decide_escalation` takes accept / adjust / resample /
 * reject / investigate. "Continue" and "stop" are what a supervisor
 * means; the mapping is here, once, rather than in a call site.
 */
const CHOICES: Array<{
  decision: OosDecision; label: string; detail: string; tone: 'go' | 'stop';
}> = [
  { decision: 'accept', label: 'Continue the run',
    detail: 'The reading stands and production carries on. Recorded against the reading '
      + 'with your name and reason.',
    tone: 'go' },
  { decision: 'adjust', label: 'Continue after adjusting',
    detail: 'The operator adjusts the press before the next sample. The run is not '
      + 'stopped.',
    tone: 'go' },
  { decision: 'resample', label: 'Take another sample first',
    detail: 'Nothing is decided until a fresh sample is taken. Use this when one reading '
      + 'may not be representative.',
    tone: 'go' },
  { decision: 'reject', label: 'Stop and reject',
    detail: 'Stops the run and rejects the material produced since the last good check. '
      + 'The heaviest of the five.',
    tone: 'stop' },
];

export default function SupervisorDecision({
  reading, raisedBy, raisedNote, canDecide, decided, onDecide, onRaiseDeviation, className,
}: SupervisorDecisionProps) {
  const [choice, setChoice] = useState<OosDecision | null>(null);
  const [reason, setReason] = useState('');
  //  A REASON IS REQUIRED. "Continue or stop, reason, signature" — a
  //  decision with no reason is a signature on nothing, and it is the
  //  line an inspector reads first.
  const ready = choice !== null && reason.trim().length > 0;

  return (
    <section className={className} style={panel} aria-labelledby="sup-decision">
      <header style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 id="sup-decision" style={title}>Supervisor decision</h2>
          <span style={meta}>
            Raised by {raisedBy} · reading #{reading.sequenceNo} recorded by{' '}
            {reading.recordedBy} at {reading.recordedAt}
          </span>
        </div>
        <ZoneChip zone={reading.zone} size="focus" />
      </header>

      <div style={readingRow}>
        <span style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600, fontSize: 15, lineHeight: '22px' }}>
            {reading.parameter}
          </span>
          <span style={meta}>
            {reading.inSpecification === false
              ? 'Outside specification'
              : reading.inSpecification === true
                ? 'Inside specification'
                : 'No specification set'}
          </span>
        </span>
        <span style={{ fontFamily: 'var(--nv-font-mono)', fontSize: 24, lineHeight: '30px' }}>
          {reading.value} {reading.unit}
        </span>
      </div>

      {raisedNote && (
        <p style={noteBox}>
          <strong style={{ fontWeight: 600 }}>What the operator said:</strong> {raisedNote}
        </p>
      )}

      {decided ? (
        <div style={decidedBox}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {decided.decision === 'reject'
              ? <PauseOctagon size={20} strokeWidth={2} aria-hidden />
              : <ShieldCheck size={20} strokeWidth={2} aria-hidden />}
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {CHOICES.find((c) => c.decision === decided.decision)?.label
                ?? decided.decision}
            </span>
          </span>
          <span style={{ fontSize: 14, lineHeight: '20px' }}>{decided.reason}</span>
          <span style={meta}>{decided.decidedBy} · {decided.decidedAt}</span>
        </div>
      ) : !canDecide ? (
        //  Not a greyed form. The controls are absent, and the reason
        //  is stated — a supervisor who raised the escalation needs to
        //  know they must hand it on, not that a button is dim.
        <p style={noteBox}>
          This escalation is waiting on somebody other than {raisedBy}. Whoever raised a
          reading cannot also decide it, so a second person reviews it — the database
          refuses it too, not only this screen.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CHOICES.map((c) => {
              const picked = choice === c.decision;
              return (
                <button
                  key={c.decision} type="button"
                  style={{
                    ...choiceRow,
                    borderColor: picked
                      ? (c.tone === 'stop'
                          ? 'var(--nv-light-state-rejected-bg)'
                          : 'var(--nv-light-action-bg)')
                      : 'var(--nv-light-border)',
                    background: picked
                      ? 'var(--nv-light-select-fill)'
                      : 'var(--nv-light-surface)',
                  }}
                  onClick={() => setChoice(c.decision)}
                  aria-pressed={picked}
                >
                  <span style={{ flex: 1, minWidth: 190, display: 'flex',
                                 flexDirection: 'column', textAlign: 'left' }}>
                    <span style={{ fontWeight: 600, fontSize: 15, lineHeight: '22px' }}>
                      {c.label}
                    </span>
                    <span style={{ fontSize: 13, lineHeight: '18px',
                                   color: 'var(--nv-light-text-secondary)' }}>
                      {c.detail}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              Why — recorded against the reading
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="What you looked at, and why this is the right call."
              style={textarea}
            />
          </label>

          <button
            type="button"
            style={{ ...sign, ...(ready ? {} : signWaiting) }}
            onClick={() => { if (ready && choice) onDecide(choice, reason.trim()); }}
          >
            {choice === null
              ? 'Choose a decision'
              : reason.trim().length === 0
                ? 'Add a reason to sign'
                : 'Sign and record this decision'}
          </button>
        </>
      )}

      {/*  The footnote the section turns on. */}
      <p style={footnote}>
        This decision is recorded against the reading. It does not raise a deviation —
        a deviation is an investigation somebody owns, so it is raised deliberately
        rather than by a screen.
        {onRaiseDeviation && (
          <>
            {' '}
            <button type="button" style={linkButton} onClick={onRaiseDeviation}>
              Raise one for this reading
            </button>
            {' if you judge one is warranted.'}
          </>
        )}
      </p>
    </section>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const panel: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
  padding: 20, borderRadius: 12,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const title: CSSProperties = {
  margin: '0 0 2px', fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 20, lineHeight: '26px',
};

const meta: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
  color: 'var(--nv-light-text-tertiary)',
};

const readingRow: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  padding: '12px 14px', borderRadius: 10,
  background: 'var(--nv-light-surface-sunken)',
};

const noteBox: CSSProperties = {
  margin: 0, padding: '12px 14px', borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
  fontSize: 14, lineHeight: '21px', color: 'var(--nv-light-text-primary)',
};

const decidedBox: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
  padding: '14px 16px', borderRadius: 10,
  background: 'var(--nv-light-badge-done-bg)',
  border: '1px solid var(--nv-light-badge-done-border)',
  color: 'var(--nv-light-badge-done-text)',
};

const choiceRow: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  width: '100%', boxSizing: 'border-box',
  minHeight: TOUCH.target, padding: '12px 14px', borderRadius: 10,
  borderWidth: 2, borderStyle: 'solid', cursor: 'pointer',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const textarea: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  borderRadius: 8, border: '1px solid var(--nv-light-border)',
  background: 'var(--nv-light-surface)', color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontSize: 15, lineHeight: '22px',
  resize: 'vertical',
};

const sign: CSSProperties = {
  minHeight: TOUCH.target, padding: '0 20px', borderRadius: 10,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: '#ffffff',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 16, lineHeight: '22px',
  cursor: 'pointer',
};

//  Says what is missing rather than going dim. Same reasoning as the
//  save button in ReadingEntry.
const signWaiting: CSSProperties = {
  background: 'var(--nv-light-surface-sunken)',
  borderColor: 'var(--nv-light-border)',
  color: 'var(--nv-light-text-secondary)',
};

const footnote: CSSProperties = {
  margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-tertiary)',
};

const linkButton: CSSProperties = {
  background: 'none', border: 'none', padding: 0,
  color: 'var(--nv-light-action-bg)', font: 'inherit',
  textDecoration: 'underline', cursor: 'pointer',
};
