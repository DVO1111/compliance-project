/**
 * The deviation as seen from the batch and the lot (DV-11, DV-12,
 * DV-M11, DV-M12).
 *
 * "Deviation and its effect visible from the batch and the lot."
 *
 * ═════════════════════════════════════════════════════════════════════
 * THE EFFECT IS READ, NOT RECOMPUTED
 * ═════════════════════════════════════════════════════════════════════
 * Whether an open deviation blocks a release or merely warns about it
 * is `deviation_open_for_batch` and the release gate's business, and
 * on this banner it arrives as `effect` already decided. There is no
 * branch here that maps impact to effect — which matters because
 * `undetermined` is W5·11 decision 1, held as a company setting: a
 * mapping written here would go on saying "blocks" after somebody
 * turned it off, on the one screen where a person decides whether to
 * release a batch.
 *
 * TWO BANNERS, ONE COMPONENT. A batch and a lot differ in what the
 * deviation does to them — 2.5: a lot with an open deviation WARNS on
 * the batches that used it, while a blocking deviation on the lot
 * blocks the lot's own release — and that difference is in the data,
 * not in two components that would drift.
 *
 * A CLOSED DEVIATION IS STILL SHOWN, and says it no longer blocks.
 * Hiding it would make the batch record look like nothing ever
 * happened, which is the opposite of what a batch record is for.
 */

import type { CSSProperties } from 'react';
import { ShieldAlert, Info, Check } from 'lucide-react';

export interface RecordDeviation {
  id: string;
  deviationNumber: string;
  title: string;
  severity: string;
  impact: string;
  stateKey: string;
  stateLabel: string;
  /** Decided by the gate, not by this component. */
  effect: 'blocks' | 'warns' | 'none';
  /** 'raised_against' when this record is its source; 'linked' when it
   *  reached here another way — a lot's deviation showing on a batch
   *  that used it. The two need different wording: one is about this
   *  record, the other is about something it depends on. */
  attachedAs: 'raised_against' | 'linked';
  /** Where it attached from, for a linked one. */
  viaLabel?: string | null;
}

export interface DeviationOnRecordProps {
  recordKind: 'batch' | 'lot';
  recordLabel: string;
  deviations: RecordDeviation[];
  onOpen: (d: RecordDeviation) => void;
  onRaise: () => void;
  className?: string;
}

export default function DeviationOnRecord(p: DeviationOnRecordProps) {
  const open = p.deviations.filter((d) => d.stateKey !== 'closed');
  const blocking = open.filter((d) => d.effect === 'blocks');
  const warning = open.filter((d) => d.effect === 'warns');
  const closed = p.deviations.filter((d) => d.stateKey === 'closed');

  const tone: Tone = blocking.length > 0 ? 'blocked'
    : warning.length > 0 ? 'flagged' : 'clear';

  return (
    <section className={p.className} style={wrap} aria-labelledby="dev-on-record">
      <div style={{ ...banner, ...TONE[tone] }}
           role={tone === 'blocked' ? 'alert' : 'status'}>
        <span style={{ ...mark, ...MARK[tone] }}>
          {tone === 'blocked' ? <ShieldAlert size={20} strokeWidth={2.5} aria-hidden />
            : tone === 'flagged' ? <Info size={20} strokeWidth={2.5} aria-hidden />
            : <Check size={20} strokeWidth={3} aria-hidden />}
        </span>

        <div style={{ flex: 1, minWidth: 200, display: 'flex',
                      flexDirection: 'column', gap: 4 }}>
          <h2 id="dev-on-record" style={headline}>
            {headlineFor(tone, p.recordKind, p.recordLabel, blocking.length, warning.length)}
          </h2>
          <span style={detail}>
            {detailFor(tone, p.recordKind, blocking.length, warning.length)}
          </span>
        </div>
      </div>

      {open.length > 0 && (
        <ul style={list}>
          {open.map((d) => (
            <li key={d.id}>
              <button type="button" style={row} onClick={() => p.onOpen(d)}>
                <span style={number}>{d.deviationNumber}</span>
                <span style={{ flex: 1, minWidth: 180, display: 'flex',
                               flexDirection: 'column', textAlign: 'left' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>
                    {d.title}
                  </span>
                  <span style={meta}>
                    {d.stateLabel}
                    {/*  A linked deviation says where it came from.
                        "Raised on lot ML-2610-028" is the difference
                        between a problem with this batch and a problem
                        with something it used. */}
                    {d.attachedAs === 'linked' && d.viaLabel && ` · raised on ${d.viaLabel}`}
                  </span>
                </span>
                <span style={{ ...effectChip, ...EFFECT[d.effect] }}>
                  {d.effect === 'blocks' ? 'blocks release'
                    : d.effect === 'warns' ? 'warning' : 'no effect'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*  Closed ones stay visible. A batch record that hid them would
          read as though nothing ever happened. */}
      {closed.length > 0 && (
        <details style={closedWrap}>
          <summary style={closedSummary}>
            {closed.length} closed deviation{closed.length === 1 ? '' : 's'} on this{' '}
            {p.recordKind}
          </summary>
          <ul style={{ ...list, marginTop: 8 }}>
            {closed.map((d) => (
              <li key={d.id}>
                <button type="button" style={{ ...row, opacity: 0.75 }}
                        onClick={() => p.onOpen(d)}>
                  <span style={number}>{d.deviationNumber}</span>
                  <span style={{ flex: 1, minWidth: 180, textAlign: 'left',
                                 fontSize: 14, lineHeight: '20px' }}>
                    {d.title}
                  </span>
                  <span style={{ ...effectChip, ...EFFECT.none }}>closed</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <button type="button" style={raise} onClick={p.onRaise}>
        Raise a deviation on this {p.recordKind}
      </button>
    </section>
  );
}

type Tone = 'blocked' | 'flagged' | 'clear';

function headlineFor(
  tone: Tone, kind: 'batch' | 'lot', label: string, blocking: number, warning: number,
): string {
  const noun = kind === 'batch' ? 'Batch' : 'Lot';
  if (tone === 'blocked') {
    return `${noun} ${label} cannot be released`;
  }
  if (tone === 'flagged') {
    return `${noun} ${label} has ${warning} open deviation${warning === 1 ? '' : 's'}`;
  }
  void blocking;
  return `No open deviation on ${noun.toLowerCase()} ${label}`;
}

function detailFor(
  tone: Tone, kind: 'batch' | 'lot', blocking: number, warning: number,
): string {
  if (tone === 'blocked') {
    const also = warning > 0
      ? ` ${warning} more carr${warning === 1 ? 'ies' : 'y'} a warning.`
      : '';
    return `${blocking} open deviation${blocking === 1 ? '' : 's'} `
      + `block${blocking === 1 ? 's' : ''} release until closed.${also}`;
  }
  if (tone === 'flagged') {
    return 'Release is not blocked. The warning stays on the record and whoever releases '
      + 'it sees it.';
  }
  return kind === 'batch'
    ? 'Nothing raised against this batch, or against anything it used.'
    : 'Nothing raised against this lot.';
}

// ── Styles ───────────────────────────────────────────────────────────

const wrap: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const banner: CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap',
  padding: 16, borderRadius: 12, boxSizing: 'border-box',
  borderWidth: 2, borderStyle: 'solid',
};

const TONE: Record<Tone, CSSProperties> = {
  blocked: {
    background: 'var(--nv-light-state-rejected-bg)',
    borderColor: 'var(--nv-light-state-rejected-bg)',
    color: 'var(--nv-light-state-rejected-text)',
  },
  flagged: {
    background: 'var(--nv-light-badge-waiting-bg)',
    borderColor: 'var(--nv-light-badge-waiting-border)',
    color: 'var(--nv-light-badge-waiting-text)',
  },
  clear: {
    background: 'var(--nv-light-badge-done-bg)',
    borderColor: 'var(--nv-light-badge-done-border)',
    color: 'var(--nv-light-badge-done-text)',
  },
};

const mark: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, flexShrink: 0, borderRadius: 17,
};

const MARK: Record<Tone, CSSProperties> = {
  blocked: { background: '#ffffff', color: 'var(--nv-light-state-rejected-bg)' },
  flagged: { background: 'var(--nv-light-badge-waiting-border)',
             color: 'var(--nv-light-badge-waiting-text)' },
  clear: { background: 'var(--nv-light-badge-done-border)', color: '#ffffff' },
};

const headline: CSSProperties = {
  margin: 0, fontWeight: 600, fontSize: 17, lineHeight: '24px', textWrap: 'balance',
};

const detail: CSSProperties = { fontSize: 14, lineHeight: '21px' };

const list: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8,
  margin: 0, padding: 0, listStyle: 'none',
};

const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  width: '100%', boxSizing: 'border-box',
  minHeight: 52, padding: '10px 14px', borderRadius: 10,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)', cursor: 'pointer',
};

const number: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 12, lineHeight: '18px',
  color: 'var(--nv-light-text-tertiary)', flexShrink: 0, minWidth: 92,
  textAlign: 'left',
};

const meta: CSSProperties = {
  fontSize: 12, lineHeight: '17px', color: 'var(--nv-light-text-secondary)',
};

const effectChip: CSSProperties = {
  padding: '3px 9px', borderRadius: 6, flexShrink: 0,
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
  whiteSpace: 'nowrap',
};

const EFFECT: Record<'blocks' | 'warns' | 'none', CSSProperties> = {
  blocks: { background: 'var(--nv-light-state-overdue-bg)',
            color: 'var(--nv-light-state-overdue-text)',
            border: '1px solid var(--nv-light-state-overdue-border)' },
  warns: { background: 'var(--nv-light-badge-waiting-bg)',
           color: 'var(--nv-light-badge-waiting-text)',
           border: '1px solid var(--nv-light-badge-waiting-border)' },
  none: { background: 'var(--nv-light-surface-sunken)',
          color: 'var(--nv-light-text-tertiary)',
          border: '1px solid var(--nv-light-border)' },
};

const closedWrap: CSSProperties = {
  padding: '10px 14px', borderRadius: 10,
  background: 'var(--nv-light-surface-sunken)',
  border: '1px solid var(--nv-light-border)',
};

const closedSummary: CSSProperties = {
  cursor: 'pointer', fontSize: 13, lineHeight: '20px',
  color: 'var(--nv-light-text-secondary)',
};

const raise: CSSProperties = {
  alignSelf: 'flex-start', minHeight: 48, padding: '0 18px', borderRadius: 10,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 14, lineHeight: '20px',
  cursor: 'pointer',
};
