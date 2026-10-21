/**
 * PM-02 · Review request drawer (node 83:1245), and PM-M02, the same
 * thing as a bottom sheet.
 *
 * Step 4: "The admin grants as asked, grants with limits (shorter time,
 * fewer records, with a note) or declines with a reason."
 *
 * WHY THE THREE OPTIONS ARE RADIOS AND NOT THREE BUTTONS. A row of
 * Grant / Limit / Decline buttons makes the decision a click, and a
 * click is the wrong shape for this: granting with limits needs four
 * more inputs, and declining needs a reason. Radios make the admin
 * choose the KIND of answer first and then fill in what that kind
 * requires, which is why the footer button takes the selected option's
 * own words rather than saying "Save".
 *
 * WHY CHECKS IS A LIST. See reviewChecks in lib/access/permissionRequests:
 * three separate facts, three separate sentences, so a failure says
 * which one failed.
 *
 * Nothing here grants anything. checkDecision says whether the decision
 * MAY be recorded; the grant is written by the database, which re-checks
 * the duties rule server-side. This drawer runs in a browser, and a
 * browser is not a security boundary.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { X, Check, Lock, Calendar, AlertTriangle } from 'lucide-react';
import {
  SECTION_LABELS, DECISION_OPTIONS, decisionButtonLabel,
  checkConflict, checkDecision, reviewChecks, MAX_GRANT_DAYS,
  type AccessLevel, type AccessRequestInput, type WorkRole,
  type Decision, type ReviewContext,
} from '../../lib/access/permissionRequests';
import AccessChip from './AccessChip';

export interface PendingRequest {
  /** "REQ-0193". */
  reference: string;
  /** "Requested 2 hours ago". */
  askedAgo: string;
  person: {
    name: string;
    initials: string;
    /** "Storekeeper · Ikeja plant · since March 2024". */
    standing: string;
    role: WorkRole;
    /** "Storekeeper" — used in the checks' sentences. */
    roleLabel: string;
  };
  request: AccessRequestInput;
  /** The two scope choices the admin may narrow to, narrowest first. */
  scopeOptions: [string, string];
  context?: ReviewContext;
}

export interface ReviewRequestDrawerProps {
  pending: PendingRequest;
  today?: Date;
  onClose: () => void;
  onDecide: (decision: Decision) => void | Promise<void>;
  saving?: boolean;
  variant?: 'drawer' | 'sheet';
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function human(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
}

/** "until 31 Oct 2026" or "no end date" — never "until no end date". */
function howLong(isoDate: string | null): string {
  return isoDate ? `until ${human(isoDate)}` : 'no end date';
}

export default function ReviewRequestDrawer({
  pending, today = new Date(), onClose, onDecide, saving = false, variant = 'drawer',
}: ReviewRequestDrawerProps) {
  const { person, request, scopeOptions, context } = pending;

  //  A request with a duties conflict cannot be granted as asked, so
  //  opening on that option would put the drawer in an error state
  //  before the admin has done anything. It opens on "grant with
  //  limits" instead, which is where narrowing an Act request down to
  //  View happens — the one thing that CAN be done with it short of a
  //  decline.
  const [kind, setKind] = useState<Decision['kind']>(
    checkDecision({ kind: 'grant_as_asked' }, request, person.role, today).ok
      ? 'grant_as_asked' : 'grant_with_limits',
  );
  //  The limits start as the request itself, so narrowing is a change
  //  from what was asked rather than a blank form. checkDecision then
  //  refuses a "limited" grant that narrowed nothing, which is what
  //  makes the starting state safe: the admin cannot send it unchanged.
  const [level, setLevel] = useState<AccessLevel>(
    //  …except the level, which drops to View when Act is the thing
    //  the duties rule forbids. Starting on the forbidden value would
    //  mean the admin's first click is undoing a default.
    checkConflict(person.role, request.section, request.level).conflicts ? 'view' : request.level,
  );
  const [scope, setScope] = useState(request.scope);
  const [until, setUntil] = useState<string | null>(request.until);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  const actConflict = useMemo(
    () => checkConflict(person.role, request.section, 'act'),
    [person.role, request.section],
  );
  const checks = useMemo(
    () => reviewChecks(request, person.role, person.roleLabel, context),
    [request, person.role, person.roleLabel, context],
  );

  const decision: Decision =
    kind === 'decline' ? { kind: 'decline', reason }
      : kind === 'grant_with_limits' ? { kind: 'grant_with_limits', level, scope, until, note }
        : { kind: 'grant_as_asked' };

  const verdict = checkDecision(decision, request, person.role, today);
  const maxDate = iso(new Date(today.getTime() + MAX_GRANT_DAYS * 86400000));

  //  The request's own terms, with the scope exactly as the asker
  //  wrote it. Lower-casing it read as "all lots at ikeja plant".
  const asked = `${request.level === 'act' ? 'Act' : 'View'} · ${request.scope} · ${howLong(request.until)}`;

  return (
    <aside
      style={variant === 'sheet' ? sheet : drawer}
      role="dialog" aria-modal="true" aria-labelledby="review-request-title"
    >
      <header style={header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="review-request-title" style={title}>Review request</h2>
          <p style={reference}>{pending.askedAgo} · {pending.reference}</p>
        </div>
        <button type="button" onClick={onClose} style={closeButton} aria-label="Close">
          <X size={20} strokeWidth={1.75} aria-hidden />
        </button>
      </header>
      <div style={rule} />

      <div style={body}>
        <div style={personCard}>
          <span style={avatar}>{person.initials}</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 15, lineHeight: '22px' }}>{person.name}</span>
            <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-tertiary)' }}>
              {person.standing}
            </span>
          </span>
        </div>

        <section style={block}>
          <h3 style={blockLabel}>Asking for</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{SECTION_LABELS[request.section]}</span>
            <AccessChip grade={request.level} />
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--nv-light-text-secondary)' }}>
            {request.scope} · {howLong(request.until)}
          </p>
          {/*  Their words, quoted, not summarised. The dialog promised
              "the admin sees this exactly as you write it". */}
          <blockquote style={quote}>“{request.reason}”</blockquote>
        </section>

        <section style={block}>
          <h3 style={blockLabel}>Checks</h3>
          {checks.map((c) => (
            <p key={c.note} style={{ ...checkRow, color: c.passed ? 'var(--nv-light-text-secondary)' : 'var(--nv-light-state-overdue-text)' }}>
              {c.passed
                ? <Check size={16} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                : <AlertTriangle size={16} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />}
              <span>{c.note}</span>
            </p>
          ))}
        </section>

        <section style={{ ...block, gap: 10 }}>
          <h3 style={blockLabel}>Your decision</h3>

          {DECISION_OPTIONS.map((o) => {
            const on = kind === o.kind;
            return (
              <div key={o.kind} style={{ ...optionCard, ...(on ? optionSelected : optionPlain) }}>
                <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="radio" name="decision" checked={on}
                    onChange={() => setKind(o.kind)} style={radio}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, lineHeight: '20px' }}>{o.title}</span>
                    <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-tertiary)' }}>
                      {/*  "Grant as asked" shows the request's own terms
                          instead of a blurb, so the admin never has to
                          scroll back up to see what they are agreeing to. */}
                      {o.kind === 'grant_as_asked' ? asked : o.blurb}
                    </span>
                  </span>
                </label>

                {on && o.kind === 'grant_with_limits' && (
                  <div style={limits}>
                    <div style={limitRow}>
                      <span style={limitLabel}>Level</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button" onClick={() => setLevel('view')}
                          style={{ ...levelButton, ...(level === 'view' ? levelOn : levelOff) }}
                          aria-pressed={level === 'view'}
                        >
                          View
                        </button>
                        {/*  Act is offered only where the duties rule
                            permits it. checkDecision refuses it anyway,
                            but a button that can only produce an error
                            is not a choice. */}
                        {actConflict.conflicts ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--nv-light-text-tertiary)' }}>
                            <Lock size={16} strokeWidth={1.5} aria-hidden />
                            Act isn't allowed for this role
                          </span>
                        ) : (
                          <button
                            type="button" onClick={() => setLevel('act')}
                            style={{ ...levelButton, ...(level === 'act' ? levelOn : levelOff) }}
                            aria-pressed={level === 'act'}
                            //  Widening View to Act is not a limit. The
                            //  module refuses it; this stops it being
                            //  offered in the first place.
                            disabled={request.level === 'view'}
                            title={request.level === 'view' ? 'Act has to be requested, not added.' : undefined}
                          >
                            Act
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={limitRow}>
                      <span style={limitLabel}>Records</span>
                      <div style={segmented}>
                        {scopeOptions.map((s) => (
                          <button
                            key={s} type="button" onClick={() => setScope(s)}
                            style={{ ...segment, ...(scope === s ? segmentOn : segmentOff) }}
                            aria-pressed={scope === s}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={limitRow}>
                      <span style={limitLabel}>Until</span>
                      <label style={dateBox}>
                        <Calendar size={16} strokeWidth={1.5} aria-hidden />
                        <input
                          type="date" value={until ?? ''} max={maxDate} min={iso(today)}
                          onChange={(e) => setUntil(e.target.value || null)}
                          style={dateInput} aria-label="Grant until"
                        />
                      </label>
                      {/*  "Asked for 31 Oct" — the comparison, so the
                          admin can see they are shortening it. */}
                      <span style={{ fontSize: 12, color: 'var(--nv-light-text-tertiary)' }}>
                        Asked for {howLong(request.until)}
                      </span>
                    </div>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        Note to {person.name.split(' ')[0]} (required when you change the request)
                      </span>
                      <textarea
                        value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                        placeholder="What you changed, and what they should do if they still need more."
                        style={textarea}
                      />
                    </label>
                  </div>
                )}

                {on && o.kind === 'decline' && (
                  <div style={limits}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>Reason (required)</span>
                      <textarea
                        value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                        placeholder="Why not, and who to ask instead."
                        style={textarea}
                      />
                      {/*  A decline that names the right person is a
                          redirection; one that does not is a wall. */}
                      {actConflict.conflicts && actConflict.insteadAsk && (
                        <button
                          type="button" style={suggestion}
                          onClick={() => setReason(`${actConflict.reason} ${actConflict.insteadAsk}`)}
                        >
                          Use the conflict reason: “{actConflict.reason} {actConflict.insteadAsk}”
                        </button>
                      )}
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>

      <div style={rule} />
      <footer style={footer}>
        <p style={{ flex: 1, minWidth: 180, margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-tertiary)' }}>
          {verdict.ok
            ? 'Recorded in the audit trail with your name, the time and your note.'
            //  The refusal is shown where the button is, not as a toast
            //  after a failed click.
            : verdict.message}
        </p>
        <button type="button" style={ghostButton} onClick={onClose}>Cancel</button>
        <button
          type="button"
          style={{
            ...primaryButton,
            ...(kind === 'decline' ? dangerButton : null),
            ...(verdict.ok && !saving ? null : disabledButton),
          }}
          disabled={!verdict.ok || saving}
          aria-busy={saving}
          onClick={() => { if (verdict.ok) void onDecide(decision); }}
        >
          {saving ? 'Recording…' : decisionButtonLabel(kind)}
        </button>
      </footer>
    </aside>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const drawer: CSSProperties = {
  display: 'flex', flexDirection: 'column',
  width: 'min(560px, 100vw)', height: '100%',
  background: '#ffffff',
  boxShadow: '-8px 0 32px rgba(13, 26, 51, 0.18)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const sheet: CSSProperties = {
  ...drawer,
  width: '100%', height: 'auto', maxHeight: '92vh',
  borderRadius: '16px 16px 0 0',
  boxShadow: '0 -8px 32px rgba(13, 26, 51, 0.18)',
};

const header: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center',
  padding: '20px 24px 16px', flexShrink: 0,
};

const title: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 22, lineHeight: '28px',
};

const reference: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-mono)', fontSize: 11, lineHeight: '16px',
  color: 'var(--nv-light-text-tertiary)',
};

const closeButton: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, flexShrink: 0,
  border: 'none', background: 'none', borderRadius: 6, cursor: 'pointer',
  color: 'var(--nv-light-text-secondary)',
};

const rule: CSSProperties = {
  height: 1, flexShrink: 0, background: 'var(--nv-light-border)',
};

const body: CSSProperties = {
  flex: 1, minHeight: 0, overflowY: 'auto',
  display: 'flex', flexDirection: 'column', gap: 20, padding: 24,
};

const personCard: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center',
  padding: 14, borderRadius: 8,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
};

const avatar: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 40, height: 40, flexShrink: 0, borderRadius: 20,
  background: 'var(--nv-light-state-hold-bg)', color: 'var(--nv-light-state-hold-text)',
  fontWeight: 600, fontSize: 13,
};

const block: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, width: '100%',
};

const blockLabel: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--nv-light-text-tertiary)',
};

const quote: CSSProperties = {
  margin: 0, padding: '10px 12px', borderRadius: 6,
  background: 'var(--nv-light-surface-sunken)',
  fontSize: 13, lineHeight: '20px', color: 'var(--nv-light-text-secondary)',
};

const checkRow: CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'flex-start', margin: 0,
  fontSize: 13, lineHeight: '20px',
};

const optionCard: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
  padding: 14, borderRadius: 8, width: '100%',
};

const optionSelected: CSSProperties = {
  background: 'var(--nv-light-select-fill)',
  border: '1.5px solid var(--nv-light-action-bg)',
};

const optionPlain: CSSProperties = {
  background: '#ffffff', border: '1.5px solid var(--nv-light-border)',
};

const radio: CSSProperties = {
  width: 18, height: 18, flexShrink: 0, marginTop: 1,
  accentColor: 'var(--nv-light-action-bg)',
};

const limits: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
  paddingLeft: 30, width: '100%', boxSizing: 'border-box',
};

const limitRow: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
};

const limitLabel: CSSProperties = {
  width: 90, flexShrink: 0, fontWeight: 600, fontSize: 13,
};

const levelButton: CSSProperties = {
  padding: '2px 10px', borderRadius: 4, borderWidth: 1, borderStyle: 'solid',
  fontFamily: 'var(--nv-font-body)', fontWeight: 600, fontSize: 11, lineHeight: '20px',
  cursor: 'pointer',
};

const levelOn: CSSProperties = {
  background: 'var(--nv-light-badge-done-bg)',
  borderColor: 'var(--nv-light-badge-done-border)',
  color: 'var(--nv-light-badge-done-text)',
};

const levelOff: CSSProperties = {
  background: '#ffffff',
  borderColor: 'var(--nv-light-outline-border)',
  color: 'var(--nv-light-text-secondary)',
};

const segmented: CSSProperties = {
  display: 'flex', gap: 4, padding: 4, borderRadius: 8, flex: 1, minWidth: 200,
  background: 'var(--nv-light-surface-sunken)',
};

const segment: CSSProperties = {
  flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 6,
  fontFamily: 'var(--nv-font-body)', fontSize: 13, lineHeight: '18px', cursor: 'pointer',
};

const segmentOn: CSSProperties = {
  background: '#ffffff', border: '1px solid var(--nv-light-outline-border)',
  fontWeight: 600, color: 'var(--nv-light-text-primary)',
};

const segmentOff: CSSProperties = {
  background: 'none', border: '1px solid transparent',
  fontWeight: 400, color: 'var(--nv-light-text-secondary)',
};

const dateBox: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  height: 40, padding: '0 12px', borderRadius: 8,
  background: '#ffffff', border: '1.5px solid var(--nv-light-action-bg)',
};

const dateInput: CSSProperties = {
  width: 112, border: 'none', background: 'none', outline: 'none',
  fontFamily: 'var(--nv-font-body)', fontSize: 14,
  color: 'var(--nv-light-text-primary)',
};

const textarea: CSSProperties = {
  width: '100%', padding: 12, borderRadius: 8, resize: 'vertical',
  background: '#ffffff', border: '1px solid var(--nv-light-outline-border)',
  fontFamily: 'var(--nv-font-body)', fontSize: 13, lineHeight: '20px',
  color: 'var(--nv-light-text-primary)', boxSizing: 'border-box',
};

const suggestion: CSSProperties = {
  textAlign: 'left', padding: '8px 10px', borderRadius: 6,
  background: 'var(--nv-light-surface-sunken)',
  border: '1px dashed var(--nv-light-border-strong)',
  fontFamily: 'var(--nv-font-body)', fontSize: 12, lineHeight: '18px',
  color: 'var(--nv-light-text-secondary)', cursor: 'pointer',
};

const footer: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  padding: '16px 24px 20px', flexShrink: 0,
};

const buttonBase: CSSProperties = {
  height: 40, padding: '0 18px', borderRadius: 8,
  fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 15, lineHeight: '20px', cursor: 'pointer',
};

const ghostButton: CSSProperties = {
  ...buttonBase,
  background: 'var(--nv-light-outline-bg)',
  border: '1px solid var(--nv-light-outline-border)',
  color: 'var(--nv-light-outline-text)',
};

const primaryButton: CSSProperties = {
  ...buttonBase,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: 'var(--nv-light-action-text)',
};

//  A decline is not destructive — "they keep their current access" — so
//  it is not the danger red. It is the ink button: deliberate, and
//  visibly not the green one.
const dangerButton: CSSProperties = {
  background: 'var(--nv-light-ink-bg)', border: '1px solid var(--nv-light-ink-bg)',
  color: 'var(--nv-light-ink-text)',
};

const disabledButton: CSSProperties = {
  background: 'var(--nv-light-disabled-bg)',
  border: '1px solid var(--nv-light-disabled-border)',
  color: 'var(--nv-light-disabled-text)',
  cursor: 'not-allowed',
};
