/**
 * Reading entry with the live zone (IP-02, IP-03, IP-05, IP-M02,
 * IP-M03).
 *
 * The design's DONE MEANS: "Reading entry with the zone shown as the
 * value is typed", and its NOT DONE IF: "zone shown only after saving ·
 * no (live)".
 *
 * SO THE ZONE IS A FUNCTION OF THE FIELD, NOT OF THE RECORD. The chip
 * beside the big number re-renders on every keystroke, from
 * `inprocess_reading_conditions` and the classifier — both of which are
 * STABLE and write nothing, so asking them about a value nobody has
 * committed to costs a read and commits nothing. An operator sees
 * "2U · adjust, reduce fill depth" while the digit is still under their
 * thumb, which is the whole difference between a control and a report.
 *
 * ═════════════════════════════════════════════════════════════════════
 * THE KEYPAD STAYS ACTIVE. ALWAYS. THERE IS NO PROP THAT DISABLES IT.
 * ═════════════════════════════════════════════════════════════════════
 * "IP-03 · Out of specification (3U): amber 'Flagged · you can
 *  continue' panel, acknowledgement, correct / save and escalate /
 *  save only. Keypad stays active."
 *
 * Item 11's first NOT DONE IF is "an OOS reading blocks entry", and
 * Damilola was explicit and repeated on it. The reason is worth having
 * next to the markup: a system that refuses to accept a measurement it
 * does not like does not get better measurements, it gets measurements
 * written on paper — and then the record lives in a notebook while the
 * database holds a tidy fiction.
 *
 * This component therefore has:
 *   - no `disabled` prop on the keypad
 *   - no branch that greys the save button
 *   - no early return that replaces the field with a warning
 *
 * What an out-of-specification reading gets is the acknowledgement
 * checkbox and the three buttons the design names. The notices come
 * from `FloorNotice`, which is W4·18's component, because "flagged =
 * amber, info icon, 'you can continue with…'" is the same rule on the
 * same floor and two implementations of it would diverge.
 *
 * IP-05's RED NOTICE IS A PROPOSAL, AND IS LABELLED ONE. The backend
 * cannot produce a blocked condition here — `inprocess_reading_conditions`
 * has no branch for it and a deploy assertion fails if one appears,
 * because the machine-setting interlock is undecided (W4·19 decision 2).
 * A caller may pass a proposed condition through `proposal` to show the
 * demo comparison; it renders with a visible "PROPOSAL · NOT BUILT"
 * marker, so nobody on the Saturday demo mistakes it for behaviour.
 */

import type { CSSProperties } from 'react';
import { Delete } from 'lucide-react';
import ZoneChip from './ZoneChip';
import ZoneGauge from './ZoneGauge';
import FloorNotice from '../Floor/FloorNotice';
import type { FloorCondition } from '../../lib/floor/floorConditions';
import {
  ACTION_LABEL, progressLabel, runningAverage, type ZoneBand, type ZoneOrNone,
} from '../../lib/inprocess/zones';
import type { ZoneAction } from '../../lib/pharma/inprocessModel';
import { TOUCH } from '../../lib/batch/stageStrip';

export interface RecordedReading {
  readingId: string;
  sequenceNo: number;
  value: number;
  zone: ZoneOrNone;
}

export interface ReadingEntryProps {
  parameter: string;
  unit: string;
  /** "20 tablets · target 605 mg · limits per this product's master
   *  formula" — the subtitle, assembled by the caller from the formula. */
  subtitle: string;
  requiredCount: number;
  recorded: RecordedReading[];

  /** What is in the field, exactly as typed. */
  text: string;
  value: number | null;
  /** The classifier's answer for `value`, live. */
  zone: ZoneOrNone;
  zoneAction: ZoneAction | null;
  /** What the product says to do about this zone, in its own words
   *  ("Adjust · reduce fill depth"). Null when there is nothing to
   *  say. */
  actionDetail: string | null;

  /** From inprocess_reading_conditions. Every row flagged. */
  conditions: FloorCondition[];
  /**
   * A PROPOSED condition, for IP-05's demo only. Rendered with a
   * visible proposal marker. The live gate cannot produce one.
   */
  proposal?: { condition: FloorCondition; note: string };

  /** The acknowledgement the database requires for an out-of-
   *  specification reading. A confirmation, not a refusal. */
  needsAcknowledgement: boolean;
  acknowledged: boolean;
  onAcknowledge: (next: boolean) => void;

  bands: ZoneBand[];

  onKey: (key: string) => void;
  onSave: () => void;
  onSaveAndEscalate: () => void;
  /** The third of the design's three buttons: clear the field and type
   *  it again. Named "correct" in the design. */
  onCorrect: () => void;

  /** Other tests in the same visit to the press. */
  alsoInCheck?: Array<{ key: string; parameter: string; detail: string }>;
  className?: string;
}

export default function ReadingEntry(p: ReadingEntryProps) {
  const avg = runningAverage(p.recorded.map((r) => r.value));
  //  The acknowledgement gates SAVING, which the database requires —
  //  not typing, which nothing does. The distinction is the section.
  const canSave = !p.needsAcknowledgement || p.acknowledged;

  return (
    <div className={p.className} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column' }}>
          <h2 style={title}>{p.parameter}</h2>
          <span style={subtitleStyle}>{p.subtitle}</span>
        </div>
        <span style={counter}>{progressLabel(p.recorded.length, p.requiredCount)}</span>
      </header>

      {/*  Recorded so far, four to a row on a tablet and wrapping on a
          phone. Each carries its own zone chip: the point of twenty
          weights is the SPREAD, and twenty numbers without their zones
          is a column an operator has to classify in their head. */}
      <section style={grid} aria-label={`${p.parameter} recorded so far`}>
        {p.recorded.length === 0 ? (
          <p style={gridEmpty}>Nothing recorded yet for this check.</p>
        ) : p.recorded.map((r) => (
          <div key={r.readingId} style={gridCell}>
            <span style={gridIndex}>#{r.sequenceNo}</span>
            <span style={gridValue}>{r.value} {p.unit}</span>
            <ZoneChip zone={r.zone} />
          </div>
        ))}
      </section>

      {/*  THE LIVE PANEL. The big number, and the zone beside it. */}
      <section style={livePanel} aria-live="polite">
        <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={typingLabel}>
            TABLET #{p.recorded.length + 1} · {p.text.trim() === '' ? 'WAITING' : 'TYPING'}
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={bigValue}>{p.text.trim() === '' ? '—' : p.text}</span>
            <span style={bigUnit}>{p.unit}</span>
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <ZoneChip zone={p.zone} size="focus" />
          {/*  The action, in the product's words. Shown beside the zone
              rather than inside the chip: the chip is the
              classification and this is the instruction, and an
              operator reads them at different moments. */}
          <span style={actionText}>
            {p.actionDetail
              ?? (p.zoneAction ? ACTION_LABEL[p.zoneAction] : '')}
          </span>
        </div>
      </section>

      <ZoneGauge bands={p.bands} value={p.value} unit={p.unit} />

      <p style={gaugeNote}>
        The zone updates with each digit, before anything is saved. A reading outside
        specification is never refused — it is flagged, acknowledged and recorded.
      </p>

      {/*  The notices. W4·18's component, because the flagged treatment
          is the same rule on the same floor. */}
      {p.conditions.map((c) => (
        <FloorNotice key={c.key} condition={c} />
      ))}

      {p.proposal && (
        <div style={proposalWrap}>
          <span style={proposalTag}>PROPOSAL · NOT BUILT</span>
          <FloorNotice condition={p.proposal.condition} />
          <span style={proposalNote}>{p.proposal.note}</span>
        </div>
      )}

      {p.needsAcknowledgement && (
        <label style={ackRow}>
          <input
            type="checkbox"
            checked={p.acknowledged}
            onChange={(e) => p.onAcknowledge(e.target.checked)}
            style={{ width: 24, height: 24, flexShrink: 0, accentColor: 'var(--nv-light-action-bg)' }}
          />
          <span style={{ flex: 1, minWidth: 200, fontSize: 14, lineHeight: '20px' }}>
            I have seen that this reading is outside specification. Recording it is
            correct — the flag stays on the record.
          </span>
        </label>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {/*  THE KEYPAD. No `disabled`. See the header. */}
        <Keypad onKey={p.onKey} />

        <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button" style={{ ...primary, ...(canSave ? {} : pending) }}
            onClick={p.onSave}
            //  Pressing it without the acknowledgement is not an error
            //  to swallow: the checkbox is right above, and the LABEL
            //  itself says what is missing. The button is never
            //  removed and never greyed — see the file header.
          >
            {canSave ? 'Save and next tablet' : 'Acknowledge the flag to save'}
          </button>

          <button type="button" style={secondary} onClick={p.onSaveAndEscalate}>
            Save and escalate to a supervisor
          </button>

          <button type="button" style={secondary} onClick={p.onCorrect}>
            Correct the value
          </button>

          <div style={averageRow}>
            <span style={{ flex: 1, minWidth: 120, fontSize: 14, lineHeight: '20px' }}>
              Average so far
            </span>
            <span style={{ fontFamily: 'var(--nv-font-mono)', fontSize: 15 }}>
              {avg === null ? '—' : `${avg} ${p.unit}`}
            </span>
          </div>
        </div>
      </div>

      {p.alsoInCheck && p.alsoInCheck.length > 0 && (
        <section style={alsoCard} aria-label="Also in this check">
          <span style={{ fontWeight: 600, fontSize: 14, lineHeight: '20px',
                         minWidth: 120 }}>
            Also in this check
          </span>
          {p.alsoInCheck.map((a) => (
            <span key={a.key} style={{ display: 'flex', flexDirection: 'column',
                                       minWidth: 150 }}>
              <span style={{ fontWeight: 600, fontSize: 13, lineHeight: '18px' }}>
                {a.parameter}
              </span>
              <span style={{ fontSize: 12, lineHeight: '16px',
                             color: 'var(--nv-light-text-secondary)' }}>
                {a.detail}
              </span>
            </span>
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * The numeric keypad.
 *
 * 64 px keys, three across, as the design draws them — above the 56 px
 * floor minimum because this is the control somebody uses twenty times
 * per check with gloves on.
 *
 * NO `disabled` PROP, by construction. See the file header.
 */
export function Keypad({ onKey }: { onKey: (key: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
  return (
    <div style={keypad} role="group" aria-label="Numeric keypad">
      {keys.map((k) => (
        <button
          key={k} type="button" style={key}
          onClick={() => onKey(k)}
          aria-label={k === '⌫' ? 'Delete the last digit' : k}
        >
          {k === '⌫'
            ? <Delete size={22} strokeWidth={1.75} aria-hidden />
            : k}
        </button>
      ))}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const title: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 22, lineHeight: '30px', color: 'var(--nv-light-text-primary)',
};

const subtitleStyle: CSSProperties = {
  fontSize: 13, lineHeight: '17px', color: 'var(--nv-light-text-secondary)',
};

const counter: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 11, lineHeight: '16px', letterSpacing: '0.04em',
  color: 'var(--nv-light-text-tertiary)',
};

const grid: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 8,
  padding: 13, borderRadius: 12,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
};

const gridEmpty: CSSProperties = {
  margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--nv-light-text-secondary)',
};

const gridCell: CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center',
  //  A fixed floor so the twenty cells line up in columns and the eye
  //  can run down them; wrapping rather than a grid so a phone gets
  //  two per row without a second layout.
  flex: '1 1 150px', minWidth: 150, boxSizing: 'border-box',
  height: 52, padding: '0 11px', borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
};

const gridIndex: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '12px',
  color: 'var(--nv-light-text-tertiary)', flexShrink: 0, width: 26,
};

const gridValue: CSSProperties = {
  flex: 1,
  fontFamily: 'var(--nv-font-mono)', fontSize: 15, lineHeight: '20px',
  color: 'var(--nv-light-text-primary)',
  //  NOT `minWidth: 0`. A zone 2 or 3 chip is wider than the zone 1
  //  circle, so in a row of equal cells the one holding the flagged
  //  reading has least room for its number — and that is the cell
  //  whose number matters most. Left to wrap, "623 mg" breaks over two
  //  lines inside a 52 px cell and reads as cramped junk. Holding its
  //  width instead makes the row fit one fewer cell, which is the
  //  cheaper loss.
  whiteSpace: 'nowrap',
};

const livePanel: CSSProperties = {
  display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
  padding: '14px 17px', borderRadius: 12,
  background: 'var(--nv-light-surface)',
  border: '2px solid var(--nv-light-ink-bg)',
};

const typingLabel: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 11, lineHeight: '14px', letterSpacing: '0.06em',
  color: 'var(--nv-light-text-tertiary)',
};

const bigValue: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 40, lineHeight: '44px', color: 'var(--nv-light-text-primary)',
  fontVariantNumeric: 'tabular-nums',
};

const bigUnit: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 16, lineHeight: '20px',
  color: 'var(--nv-light-text-secondary)',
};

const actionText: CSSProperties = {
  fontSize: 13, lineHeight: '18px', color: 'var(--nv-light-text-secondary)',
  textAlign: 'right', maxWidth: 200,
};

const gaugeNote: CSSProperties = {
  margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--nv-light-text-secondary)',
};

const proposalWrap: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
  padding: 12, borderRadius: 10,
  border: '2px dashed var(--nv-light-border)',
  background: 'var(--nv-light-surface-sunken)',
};

const proposalTag: CSSProperties = {
  alignSelf: 'flex-start',
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.08em',
  padding: '2px 8px', borderRadius: 4,
  background: 'var(--nv-light-badge-optional-bg)',
  color: 'var(--nv-light-badge-optional-text)',
};

const proposalNote: CSSProperties = {
  fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-secondary)',
};

const ackRow: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap',
  minHeight: TOUCH.target, padding: '12px 14px', borderRadius: 10,
  background: 'var(--nv-light-badge-waiting-bg)',
  border: '1px solid var(--nv-light-badge-waiting-border)',
  color: 'var(--nv-light-text-primary)', cursor: 'pointer',
};

const keypad: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, minmax(72px, 1fr))',
  gap: 8, flex: '1 1 260px', minWidth: 240,
};

const key: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  //  64 px, above the 56 px floor minimum: twenty presses per check.
  height: 64, borderRadius: 10,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-mono)', fontSize: 22, lineHeight: '28px',
  cursor: 'pointer',
};

const primary: CSSProperties = {
  minHeight: TOUCH.target, padding: '0 20px', borderRadius: 10,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: '#ffffff',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 16, lineHeight: '22px',
  cursor: 'pointer',
};

//  The waiting treatment, NOT a disabled one. The button still works;
//  what it says changes, because the acknowledgement is one tap away
//  and a greyed button would make the operator hunt for why.
const pending: CSSProperties = {
  background: 'var(--nv-light-badge-waiting-bg)',
  borderColor: 'var(--nv-light-badge-waiting-border)',
  color: 'var(--nv-light-badge-waiting-text)',
};

const secondary: CSSProperties = {
  minHeight: TOUCH.target, padding: '0 20px', borderRadius: 10,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 15, lineHeight: '22px',
  cursor: 'pointer',
};

const averageRow: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
  minHeight: 48, padding: '0 12px', borderRadius: 10,
  background: 'var(--nv-light-surface-sunken)',
};

const alsoCard: CSSProperties = {
  display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
  padding: '12px 15px', borderRadius: 12,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)', fontFamily: 'var(--nv-font-body)',
};
