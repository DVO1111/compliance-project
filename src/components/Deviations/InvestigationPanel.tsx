/**
 * The investigation, its closure checklist and the closed state
 * (DV-04, DV-07, DV-08, DV-M04, DV-M07, DV-M08).
 *
 * ═════════════════════════════════════════════════════════════════════
 * THE CHECKLIST REPORTS; IT DOES NOT DECIDE
 * ═════════════════════════════════════════════════════════════════════
 * W5·11 decision 4 is open: "'Send for QA closure' needs a root cause
 * plus a CAPA linked, or 'CAPA not needed' with a reason. Confirm the
 * rule."
 *
 * So `deviation_closure_readiness` marks each condition with whether
 * it actually stops closure today, the CAPA one comes back advisory,
 * and `assessReadiness` counts only the blocking ones. An advisory
 * condition counted on the button would make it refuse something the
 * database will accept — the slower half of the same lie as a button
 * that accepts what will be refused.
 *
 * The advisory ones are still SHOWN, and shown as outstanding work.
 * Hiding them until the rule is confirmed would mean nobody discovers
 * the question exists.
 *
 * ═════════════════════════════════════════════════════════════════════
 * ONLY QA SEES THE SIGN BUTTON, AND IT IS NOT RENDERED FOR ANYBODY ELSE
 * ═════════════════════════════════════════════════════════════════════
 * "Only QA roles see the sign button" (DV-07). Not disabled for
 * others: absent. A disabled control is a promise that pressing it
 * would do something, and the database refuses a closure signature
 * from a non-QA caller anyway — so a greyed button would be an
 * invitation to an error somebody cannot act on. What a non-QA viewer
 * gets instead is a line saying whose job it is.
 *
 * THE OWNER AND THE DUE DATE ARE REPORTED, NOT DEMANDED. Decision 2 is
 * open — who sets them, and when. `triageMessage` names the gap and
 * says the design's assumption (QA, at triage) without enforcing it.
 */

import type { CSSProperties, ReactNode } from 'react';
import { Check, X, Clock, ShieldCheck, Lock, Info } from 'lucide-react';
import {
  assessReadiness, signButtonLabel, dueLabel, triageMessage,
  type Investigation, type ReadinessCondition,
} from '../../lib/deviations/investigation';

export interface LinkedRecord {
  key: string;
  kind: 'capa' | 'change_control' | 'batch' | 'material_lot';
  label: string;
  detail: string;
}

export interface ClosureSignature {
  signedByName: string;
  signedAt: string;
  /** One of the meanings 3J.2 allows. The design changed this from
   *  "Closed" to "Approved" when it was checked against the PRD. */
  meaning: string;
}

export interface InvestigationPanelProps {
  investigation: Investigation;
  /** From deviation_closure_readiness. */
  conditions: ReadinessCondition[];
  linked: LinkedRecord[];
  /** Whether this viewer holds a QA role. Governs whether the sign
   *  button exists at all. */
  isQa: boolean;
  /** Set once closed. Locks the record and shows the signature block. */
  signature?: ClosureSignature;
  onSign: () => void;
  onRaiseCapa: () => void;
  className?: string;
}

export default function InvestigationPanel(p: InvestigationPanelProps) {
  const i = p.investigation;
  const r = assessReadiness(p.conditions);
  const closed = p.signature !== undefined;
  const triage = triageMessage(i);

  return (
    <div className={p.className} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/*  DV-08's lock banner. First, because it changes what every
          control below it means. */}
      {closed && (
        <section style={lockBanner} role="status">
          <span style={{ ...lockMark }}>
            <Lock size={18} strokeWidth={2.5} aria-hidden />
          </span>
          <div style={{ flex: 1, minWidth: 200, display: 'flex',
                        flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 16, lineHeight: '22px' }}>
              Closed and locked
            </span>
            <span style={{ fontSize: 14, lineHeight: '21px' }}>
              {p.signature!.signedByName} signed this as <strong>{p.signature!.meaning}</strong>
              {' '}on {p.signature!.signedAt}. The record cannot be edited, and it no longer
              blocks release.
            </span>
          </div>
        </section>
      )}

      <section style={card} aria-labelledby="inv-heading">
        <header style={{ display: 'flex', gap: 12, alignItems: 'flex-start',
                         flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <span style={number}>{i.deviationNumber}</span>
            <h2 id="inv-heading" style={title}>{i.title}</h2>
          </div>
          <span style={stateChip}>{i.stateLabel}</span>
        </header>

        {/*  Owner and due date. The overdue case is the design's own
            state for DV-04, so it is the one drawn loudest. */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Fact label="Owner" value={i.ownerName ?? 'Not assigned'} />
          <Fact
            label="Investigation due"
            value={dueLabel(i)}
            tone={i.isOverdue ? 'overdue' : 'plain'}
            icon={i.isOverdue ? <Clock size={15} strokeWidth={2.5} aria-hidden /> : undefined}
          />
        </div>

        {/*  Decision 2 is open: this names the gap and the design's
            assumption without enforcing either. */}
        {triage && !closed && (
          <p style={note}>
            <Info size={15} strokeWidth={2.25} aria-hidden style={{ flexShrink: 0 }} />
            {triage}
          </p>
        )}

        {(i.immediateAction || i.containment) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {i.immediateAction && (
              <Para label="Immediate action" body={i.immediateAction} />
            )}
            {i.containment && <Para label="Containment" body={i.containment} />}
          </div>
        )}
      </section>

      {/*  LINKED RECORDS. Change control is here because the design's
          PRD check added it: deviation_links carries capa,
          change_control and batch. */}
      <section style={card} aria-labelledby="linked-heading">
        <h3 id="linked-heading" style={subTitle}>Linked records</h3>
        {p.linked.length === 0 ? (
          <p style={emptyText}>
            Nothing linked yet. A CAPA raised from this deviation appears here, with the
            batch it affects and any change control that follows.
          </p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8,
                       margin: 0, padding: 0, listStyle: 'none' }}>
            {p.linked.map((l) => (
              <li key={l.key} style={linkRow}>
                <span style={linkKind}>{LINK_LABEL[l.kind]}</span>
                <span style={{ flex: 1, minWidth: 160, display: 'flex',
                               flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>
                    {l.label}
                  </span>
                  <span style={meta}>{l.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {!closed && (
          <button type="button" style={secondary} onClick={p.onRaiseCapa}>
            Raise a CAPA from this deviation
          </button>
        )}
      </section>

      {/*  DV-07's readiness checklist. */}
      {!closed && (
        <section style={card} aria-labelledby="readiness-heading">
          <header style={{ display: 'flex', gap: 12, alignItems: 'baseline',
                           flexWrap: 'wrap' }}>
            <h3 id="readiness-heading" style={subTitle}>Before QA can close this</h3>
            <span style={{ flex: 1 }} />
            <span style={meta}>
              {r.canSign
                ? 'Ready'
                : `${r.outstanding.length} outstanding`}
              {r.advisory.length > 0 && ` · ${r.advisory.length} to consider`}
            </span>
          </header>

          <ul style={{ display: 'flex', flexDirection: 'column', gap: 8,
                       margin: 0, padding: 0, listStyle: 'none' }}>
            {r.conditions.map((c) => (
              <li key={c.key} style={condRow}>
                <span style={{ ...condMark, ...(c.met ? condMet
                  : c.blocking ? condUnmet : condAdvisory) }}>
                  {c.met
                    ? <Check size={15} strokeWidth={3} aria-hidden />
                    : c.blocking
                      ? <X size={15} strokeWidth={3} aria-hidden />
                      : <Info size={15} strokeWidth={2.5} aria-hidden />}
                </span>
                <span style={{ flex: 1, minWidth: 200, display: 'flex',
                               flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>
                    {c.title}
                  </span>
                  <span style={meta}>{c.detail}</span>
                  {/*  An advisory condition says so, rather than
                      looking like one that was simply not done. */}
                  {!c.met && !c.blocking && (
                    <span style={advisoryTag}>
                      Not enforced yet — the rule is still being confirmed
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {/*  ABSENT for a non-QA viewer, not disabled. */}
          {p.isQa ? (
            <button
              type="button"
              style={{ ...sign, ...(r.canSign ? {} : signWaiting) }}
              onClick={p.onSign}
            >
              <ShieldCheck size={18} strokeWidth={2.25} aria-hidden
                           style={{ flexShrink: 0 }} />
              {signButtonLabel(r, true)}
            </button>
          ) : (
            <p style={note}>
              <Info size={15} strokeWidth={2.25} aria-hidden style={{ flexShrink: 0 }} />
              {signButtonLabel(r, false)}. Closure needs a QA role and a password, and the
              signature is recorded against the deviation.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Fact({ label, value, tone = 'plain', icon }: {
  label: string; value: string; tone?: 'plain' | 'overdue'; icon?: ReactNode;
}) {
  return (
    <div style={{ ...fact, ...(tone === 'overdue' ? factOverdue : null) }}>
      <span style={factLabel}>{label}</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center',
                     fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>
        {icon}{value}
      </span>
    </div>
  );
}

function Para({ label, body }: { label: string; body: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={factLabel}>{label}</span>
      <span style={{ fontSize: 14, lineHeight: '21px' }}>{body}</span>
    </div>
  );
}

const LINK_LABEL: Record<LinkedRecord['kind'], string> = {
  capa: 'CAPA',
  change_control: 'CHANGE',
  batch: 'BATCH',
  material_lot: 'LOT',
};

// ── Styles ───────────────────────────────────────────────────────────

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
  padding: 18, borderRadius: 12,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const lockBanner: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap',
  padding: 16, borderRadius: 12,
  background: 'var(--nv-light-badge-done-bg)',
  border: '2px solid var(--nv-light-badge-done-border)',
  color: 'var(--nv-light-badge-done-text)',
  fontFamily: 'var(--nv-font-body)',
};

const lockMark: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, flexShrink: 0, borderRadius: 16,
  background: 'var(--nv-light-badge-done-border)', color: '#ffffff',
};

const number: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 12, lineHeight: '16px',
  letterSpacing: '0.04em', color: 'var(--nv-light-text-tertiary)',
};

const title: CSSProperties = {
  margin: '2px 0 0', fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 21, lineHeight: '28px', textWrap: 'balance',
};

const subTitle: CSSProperties = {
  margin: 0, fontWeight: 600, fontSize: 16, lineHeight: '22px',
};

const stateChip: CSSProperties = {
  padding: '4px 10px', borderRadius: 6, flexShrink: 0,
  background: 'var(--nv-light-surface-sunken)',
  border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
  letterSpacing: '0.04em', color: 'var(--nv-light-text-secondary)',
};

const meta: CSSProperties = {
  fontSize: 13, lineHeight: '18px', color: 'var(--nv-light-text-secondary)',
};

const fact: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2,
  flex: '1 1 200px', minWidth: 180, boxSizing: 'border-box',
  padding: '10px 12px', borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
};

const factOverdue: CSSProperties = {
  background: 'var(--nv-light-state-overdue-bg)',
  color: 'var(--nv-light-state-overdue-text)',
};

const factLabel: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 10, lineHeight: '14px',
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--nv-light-text-tertiary)',
};

const note: CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'flex-start', margin: 0,
  padding: '10px 12px', borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
  fontSize: 13, lineHeight: '19px', color: 'var(--nv-light-text-secondary)',
};

const emptyText: CSSProperties = {
  margin: 0, padding: '12px 14px', borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
  fontSize: 13, lineHeight: '20px', color: 'var(--nv-light-text-secondary)',
};

const linkRow: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
  padding: '10px 12px', borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
};

const linkKind: CSSProperties = {
  padding: '2px 8px', borderRadius: 4, flexShrink: 0,
  background: 'var(--nv-light-ink-bg)', color: '#ffffff',
  fontFamily: 'var(--nv-font-mono)', fontSize: 10, lineHeight: '15px',
  letterSpacing: '0.06em',
};

const condRow: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap',
};

const condMark: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, flexShrink: 0, borderRadius: 12, marginTop: 1,
};

const condMet: CSSProperties = {
  background: 'var(--nv-light-badge-done-bg)', color: 'var(--nv-light-badge-done-text)',
  border: '1px solid var(--nv-light-badge-done-border)',
};

const condUnmet: CSSProperties = {
  background: 'var(--nv-light-state-rejected-bg)', color: '#ffffff',
};

//  Visibly different from both: an advisory condition is not done and
//  is not in the way, and drawing it as either would be wrong.
const condAdvisory: CSSProperties = {
  background: 'var(--nv-light-badge-waiting-bg)',
  color: 'var(--nv-light-badge-waiting-text)',
  border: '1px solid var(--nv-light-badge-waiting-border)',
};

const advisoryTag: CSSProperties = {
  alignSelf: 'flex-start',
  fontFamily: 'var(--nv-font-mono)', fontSize: 10, lineHeight: '15px',
  letterSpacing: '0.04em', padding: '1px 7px', borderRadius: 4,
  background: 'var(--nv-light-badge-optional-bg)',
  color: 'var(--nv-light-badge-optional-text)',
};

const secondary: CSSProperties = {
  alignSelf: 'flex-start', minHeight: 48, padding: '0 16px', borderRadius: 10,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  color: 'var(--nv-light-text-primary)',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 14, lineHeight: '20px',
  cursor: 'pointer',
};

const sign: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center',
  minHeight: 56, padding: '0 20px', borderRadius: 10,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: '#ffffff',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 16, lineHeight: '22px',
  cursor: 'pointer',
};

const signWaiting: CSSProperties = {
  background: 'var(--nv-light-surface-sunken)',
  borderColor: 'var(--nv-light-border)',
  color: 'var(--nv-light-text-secondary)',
};
