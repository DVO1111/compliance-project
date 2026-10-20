/**
 * The deviation register (DV-09, DV-10, DV-M09, DV-M10).
 *
 * OVERDUE FIRST, AND SEVERITY BELOW IT. A minor deviation three weeks
 * past its date says more about the system than a critical one raised
 * this morning, and the register is read to find what has been
 * forgotten. `sortRegister` applies the database's own order again on
 * the client, because a list whose order depends on the transport is
 * one that will eventually put the thing three weeks late at the
 * bottom.
 *
 * "OVERDUE" IS NEVER A STORED FLAG. It arrives derived from the due
 * date and today's date, and the row prints the number of days —
 * "11 days overdue" is a fact somebody has to answer for, where
 * "overdue" alone is just a colour.
 *
 * THE EMPTY STATE SAYS WHICH KIND OF EMPTY IT IS (DV-10). "No open
 * deviations" and "none have ever been raised" are different facts
 * with different next steps, and an empty table with no words leaves
 * somebody unable to tell either from a broken filter.
 */

import type { CSSProperties } from 'react';
import { Clock, ShieldAlert } from 'lucide-react';
import {
  summariseRegister, emptyRegisterMessage, type RegisterRow,
} from '../../lib/deviations/investigation';
import type { FloorLayout } from '../../lib/inprocess/floorLayout';

export interface DeviationRegisterProps {
  rows: RegisterRow[];
  includingClosed: boolean;
  onOpen: (row: RegisterRow) => void;
  onToggleClosed: () => void;
  layout?: FloorLayout;
  className?: string;
}

export default function DeviationRegister(p: DeviationRegisterProps) {
  const s = summariseRegister(p.rows);
  const phone = p.layout === 'phone';

  return (
    <section className={p.className} style={wrap} aria-labelledby="register-heading">
      <header style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 id="register-heading" style={title}>Deviations</h2>
          <span style={meta}>
            {s.total === 0
              ? 'Nothing to show'
              : `${s.total} ${p.includingClosed ? 'in total' : 'open'}`}
            {s.overdue > 0 && ` · ${s.overdue} overdue`}
            {s.blockingRelease > 0 && ` · ${s.blockingRelease} blocking release`}
          </span>
        </div>
        <button type="button" style={toggle} onClick={p.onToggleClosed}>
          {p.includingClosed ? 'Hide closed' : 'Show closed'}
        </button>
      </header>

      {s.rows.length === 0 ? (
        <p style={empty}>{emptyRegisterMessage(p.includingClosed)}</p>
      ) : (
        <ul style={list}>
          {s.rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                style={{ ...row, ...(r.isOverdue ? rowOverdue : null) }}
                onClick={() => p.onOpen(r)}
              >
                {/*  The number and the state, in a column that stays
                    the same width down the list so the eye can run
                    along it. */}
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2,
                               minWidth: 112, flexShrink: 0, textAlign: 'left' }}>
                  <span style={number}>{r.deviationNumber}</span>
                  <span style={state}>{r.stateLabel}</span>
                </span>

                <span style={{ flex: 1, minWidth: 180, display: 'flex',
                               flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                  <span style={rowTitle}>{r.title}</span>
                  <span style={meta}>
                    {r.sourceLabel ?? r.sourceType}
                    {r.linkedCapaCount > 0
                      && ` · ${r.linkedCapaCount} CAPA${r.linkedCapaCount === 1 ? '' : 's'}`}
                  </span>
                </span>

                <span style={{ display: 'flex', gap: 8, alignItems: 'center',
                               flexWrap: 'wrap' }}>
                  <SeverityChip severity={r.severity} />
                  <ImpactChip impact={r.impact} />
                </span>

                {/*  THE DAYS, not a colour. */}
                {r.isOverdue && r.daysOverdue !== null && (
                  <span style={overdueChip}>
                    <Clock size={14} strokeWidth={2.5} aria-hidden />
                    {r.daysOverdue} day{r.daysOverdue === 1 ? '' : 's'} overdue
                  </span>
                )}
                {!r.isOverdue && r.dueDate && !phone && (
                  <span style={dueChip}>Due {r.dueDate}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Severity, as a word rather than only a colour — the register is
 *  read in a hurry and printed in black and white for inspections. */
function SeverityChip({ severity }: { severity: string }) {
  return (
    <span style={{ ...chip, ...SEV_TONE[severity] }}>{severity}</span>
  );
}

/** Impact, which is the field that gates release — so it says what it
 *  does, not just what it is. `undetermined` is deliberately not
 *  labelled "blocks": whether it does is a company setting (W5·11
 *  decision 1), and the deviation's own screen states it from there. */
function ImpactChip({ impact }: { impact: string }) {
  const label = impact === 'yes' ? 'blocks release'
    : impact === 'no' ? 'warns'
    : 'impact undetermined';
  return (
    <span style={{ ...chip, ...IMPACT_TONE[impact] }}>
      {impact === 'yes' && <ShieldAlert size={13} strokeWidth={2.5} aria-hidden />}
      {label}
    </span>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const wrap: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const title: CSSProperties = {
  margin: '0 0 2px', fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 22, lineHeight: '30px',
};

const meta: CSSProperties = {
  fontSize: 13, lineHeight: '18px', color: 'var(--nv-light-text-secondary)',
};

const toggle: CSSProperties = {
  minHeight: 44, padding: '0 14px', borderRadius: 10,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 14, lineHeight: '20px',
  cursor: 'pointer',
};

const list: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8,
  margin: 0, padding: 0, listStyle: 'none',
};

const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  width: '100%', boxSizing: 'border-box',
  minHeight: 56, padding: '10px 14px', borderRadius: 10,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)', cursor: 'pointer',
};

//  An overdue row carries a left edge rather than a fill: a tinted row
//  competes with the chips inside it, and the edge survives both a
//  greyscale print and somebody scanning the list from a metre away.
const rowOverdue: CSSProperties = {
  borderLeft: '4px solid var(--nv-light-state-rejected-bg)',
  paddingLeft: 11,
};

const number: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500, fontSize: 13, lineHeight: '18px',
};

const state: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 10, lineHeight: '14px',
  letterSpacing: '0.04em', textTransform: 'uppercase',
  color: 'var(--nv-light-text-tertiary)',
};

const rowTitle: CSSProperties = { fontWeight: 600, fontSize: 15, lineHeight: '21px' };

const chip: CSSProperties = {
  display: 'inline-flex', gap: 4, alignItems: 'center',
  padding: '3px 9px', borderRadius: 6, flexShrink: 0,
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
  letterSpacing: '0.02em', whiteSpace: 'nowrap',
};

const SEV_TONE: Record<string, CSSProperties> = {
  critical: { background: 'var(--nv-light-state-rejected-bg)', color: '#ffffff' },
  major: { background: 'var(--nv-light-badge-waiting-bg)',
           color: 'var(--nv-light-badge-waiting-text)',
           border: '1px solid var(--nv-light-badge-waiting-border)' },
  minor: { background: 'var(--nv-light-surface-sunken)',
           color: 'var(--nv-light-text-secondary)',
           border: '1px solid var(--nv-light-border)' },
};

const IMPACT_TONE: Record<string, CSSProperties> = {
  yes: { background: 'var(--nv-light-state-overdue-bg)',
         color: 'var(--nv-light-state-overdue-text)',
         border: '1px solid var(--nv-light-state-overdue-border)' },
  no: { background: 'var(--nv-light-surface-sunken)',
        color: 'var(--nv-light-text-secondary)',
        border: '1px solid var(--nv-light-border)' },
  undetermined: { background: 'var(--nv-light-badge-waiting-bg)',
                  color: 'var(--nv-light-badge-waiting-text)',
                  border: '1px solid var(--nv-light-badge-waiting-border)' },
};

const overdueChip: CSSProperties = {
  ...chip,
  background: 'var(--nv-light-state-rejected-bg)', color: '#ffffff',
  fontWeight: 500,
};

const dueChip: CSSProperties = {
  ...chip,
  background: 'var(--nv-light-surface-sunken)',
  color: 'var(--nv-light-text-tertiary)',
};

const empty: CSSProperties = {
  margin: 0, padding: '16px 18px', borderRadius: 10,
  background: 'var(--nv-light-surface-sunken)',
  border: '1px dashed var(--nv-light-border)',
  fontSize: 14, lineHeight: '21px', color: 'var(--nv-light-text-secondary)',
};
