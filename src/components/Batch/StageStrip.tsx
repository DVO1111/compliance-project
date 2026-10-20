/**
 * The stage strip (BR-02, BR-03 … BR-06, BR-M03).
 *
 * The design puts it across the top of every tablet screen and names
 * what it must not do: "Locked stage greyed with no explanation: no.
 * Every locked stage says what it waits for."
 *
 * SO A LOCKED STAGE IS NOT GREYED OUT. It carries its reason under the
 * name, at the same size as everything else. Greying a thing and then
 * writing the reason in small print beside it is the same failure
 * dressed up — the eye skips both.
 *
 * Targets are 56px and gaps 12px because the strip is operated with
 * gloves at a workstation. Those numbers come from lib/batch/stageStrip
 * so that replacing them when the floor-use rules land is one edit.
 */

import type { CSSProperties } from 'react';
import { Check, Lock, PenLine } from 'lucide-react';
import {
  TOUCH, waitingReason, signOffState,
  type StripStage, type StageState,
} from '../../lib/batch/stageStrip';

export interface StageStripProps {
  stages: StripStage[];
  /** The stage being worked on, highlighted. */
  activeStageId?: string;
  onOpen?: (stage: StripStage) => void;
  className?: string;
}

export default function StageStrip({
  stages, activeStageId, onOpen, className,
}: StageStripProps) {
  return (
    <ol className={className} style={strip} aria-label="Stages">
      {stages.map((s) => {
        const reason = waitingReason(s);
        const sign = signOffState(s);
        const active = s.stageId === activeStageId;
        //  A locked stage is still readable and still openable — you
        //  can look at a stage you cannot work on. Only its actions
        //  are unavailable, and those live on the stage itself.
        const openable = onOpen != null;

        return (
          <li
            key={s.stageId}
            style={{
              ...item, ...TONE[s.state],
              ...(active ? activeOutline : null),
              cursor: openable ? 'pointer' : 'default',
            }}
            onClick={openable ? () => onOpen(s) : undefined}
            aria-current={active ? 'step' : undefined}
          >
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ ...badge, ...BADGE_TONE[s.state] }}>
                {s.state === 'done' ? <Check size={16} strokeWidth={2.5} aria-hidden />
                  : s.state === 'locked' || s.state === 'closed'
                    ? <Lock size={14} strokeWidth={2} aria-hidden />
                    : s.sequenceNo}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15, lineHeight: '20px' }}>
                {s.name}
              </span>
              {/*  BR-04's in-between state, visible on the strip and
                  not only on the stage: somebody walking up to the
                  workstation should see that a second signature is
                  what this is waiting on. */}
              {sign === 'operator' && (
                <span style={signTag}>
                  <PenLine size={13} strokeWidth={2} aria-hidden />
                  1 of 2
                </span>
              )}
              {sign === 'both' && (
                <span style={{ ...signTag, ...signTagDone }}>
                  <PenLine size={13} strokeWidth={2} aria-hidden />
                  2 of 2
                </span>
              )}
            </span>

            {/*  The reason, at full size. Not a tooltip and not small
                print: it is the answer to the only question somebody
                has about a stage they cannot start. */}
            {reason && <span style={waiting}>{reason}</span>}

            {s.readingsTotal > 0 && s.state !== 'locked' && (
              <span style={counts}>
                {s.readingsRecorded} of {s.readingsTotal} readings
                {s.readingsOutOfSpec > 0 && ` · ${s.readingsOutOfSpec} out of specification`}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const strip: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: TOUCH.gap,
  margin: 0, padding: 0, listStyle: 'none',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const item: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  //  Wide enough for a stage name and a sentence under it, and wraps
  //  to a column on a phone rather than shrinking below readable.
  flex: '1 1 260px', minWidth: 240, minHeight: TOUCH.target,
  padding: '12px 14px', borderRadius: 10, boxSizing: 'border-box',
  borderWidth: 1, borderStyle: 'solid',
};

const TONE: Record<StageState, CSSProperties> = {
  done: {
    background: 'var(--nv-light-badge-done-bg)',
    borderColor: 'var(--nv-light-badge-done-border)',
  },
  current: {
    background: 'var(--nv-light-surface)',
    borderColor: 'var(--nv-light-action-bg)',
  },
  //  Sunken, not greyed-out text. The words stay at full contrast
  //  because the words are the point.
  locked: {
    background: 'var(--nv-light-surface-sunken)',
    borderColor: 'var(--nv-light-border)',
  },
  closed: {
    background: 'var(--nv-light-surface-sunken)',
    borderColor: 'var(--nv-light-border-strong)',
  },
};

const activeOutline: CSSProperties = {
  outline: '2px solid var(--nv-light-focus-ring)', outlineOffset: 1,
};

const badge: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, flexShrink: 0, borderRadius: 14,
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500, fontSize: 13,
};

const BADGE_TONE: Record<StageState, CSSProperties> = {
  done:    { background: 'var(--nv-light-badge-done-text)',  color: '#ffffff' },
  current: { background: 'var(--nv-light-action-bg)',        color: '#ffffff' },
  locked:  { background: 'var(--nv-light-border-strong)',    color: 'var(--nv-light-text-secondary)' },
  closed:  { background: 'var(--nv-light-state-quarantine-bg)', color: '#ffffff' },
};

const waiting: CSSProperties = {
  fontSize: 13, lineHeight: '19px',
  color: 'var(--nv-light-text-secondary)',
};

const counts: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 10.5, lineHeight: '15px',
  color: 'var(--nv-light-text-tertiary)',
};

const signTag: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
  padding: '2px 8px', borderRadius: 4,
  background: 'var(--nv-light-badge-waiting-bg)',
  border: '1px solid var(--nv-light-badge-waiting-border)',
  color: 'var(--nv-light-badge-waiting-text)',
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', whiteSpace: 'nowrap',
};

const signTagDone: CSSProperties = {
  background: 'var(--nv-light-badge-done-bg)',
  borderColor: 'var(--nv-light-badge-done-border)',
  color: 'var(--nv-light-badge-done-text)',
};
