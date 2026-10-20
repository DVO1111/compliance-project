/**
 * PM-04 · Person access — restrict or revoke (node 86:1180), and PM-M04.
 *
 * Step 5: "Later the admin can restrict, pause or revoke the grant,
 * and everything is logged."
 *
 * THREE SOURCES OF ACCESS, SHOWN SEPARATELY AND ON PURPOSE. A person's
 * standing is the sum of what their role gives them, what they were
 * granted on request, and what has been taken back from them — and the
 * sum is useless to an admin deciding what to change. The design
 * splits them because each is edited somewhere different: role access
 * on the Roles tab, extra access by restricting or revoking the grant,
 * a restriction by lifting it. A merged list would show one row and
 * three possible wrong places to go and fix it.
 *
 * WHY "ACT CAN'T BE GRANTED" IS A ROW AND NOT AN OMISSION. QC testing
 * and QA disposition appear on a storekeeper's record saying exactly
 * that. Leaving them out would be tidier and would mean an admin
 * looking for why somebody cannot record a result finds nothing at all.
 */

import { useState, type CSSProperties } from 'react';
import { Lock, History } from 'lucide-react';
import {
  SECTION_LABELS, ROLE_LABELS, checkConflict, MAX_GRANT_DAYS,
  type AccessSection, type AccessLevel, type WorkRole,
} from '../../lib/access/permissionRequests';
import AccessChip from './AccessChip';

export interface RoleAccessLine {
  section: AccessSection;
  /** Undefined where the role gives nothing. */
  level?: AccessLevel;
  /** Set when a restriction has lowered it below what the role allows. */
  restrictedFrom?: AccessLevel;
}

export interface ExtraGrant {
  id: string;
  section: AccessSection;
  level: AccessLevel;
  scope: string;
  until: string | null;
  /** "Granted with limits by K. Adewale · 8 Oct, 11:02 · REQ-0193". */
  provenance: string;
}

export interface Restriction {
  id: string;
  section: AccessSection;
  from: AccessLevel;
  to: AccessLevel;
  until: string | null;
  reason: string;
  /** "Set by K. Adewale · 5 Oct, 16:40". */
  setBy: string;
}

export interface HistoryEntry {
  /** "8 Oct 2026 · 11:02". */
  at: string;
  /** "Granted QC testing (View), with limits". */
  what: string;
  /** "Until 20 Oct; asked for 31 Oct · K. Adewale". */
  detail: string;
}

export interface PersonAccessPanelProps {
  person: {
    name: string;
    initials: string;
    role: WorkRole;
    /** "Storekeeper · Ikeja plant · joined March 2024". */
    standing: string;
    /** How many people hold the same role, for the warning. */
    peopleInRole: number;
  };
  roleAccess: RoleAccessLine[];
  extraGrants: ExtraGrant[];
  restrictions: Restriction[];
  history: HistoryEntry[];
  today?: Date;
  onOpenRole?: () => void;
  onChangeRole?: () => void;
  onRestrict: (grantId: string, change: { until: string | null; reason: string }) => void | Promise<void>;
  onRevoke: (grantId: string, reason: string) => void | Promise<void>;
  onLiftRestriction?: (restrictionId: string) => void;
  className?: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function human(isoDate: string | null): string {
  if (!isoDate) return 'no end date';
  const d = new Date(isoDate + 'T00:00:00Z');
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
}

export default function PersonAccessPanel({
  person, roleAccess, extraGrants, restrictions, history,
  today = new Date(), onOpenRole, onChangeRole,
  onRestrict, onRevoke, onLiftRestriction, className,
}: PersonAccessPanelProps) {
  //  One panel, two modes. Revoking needs a reason exactly as
  //  restricting does — the function refuses one without it — so it
  //  gets the same inline form rather than a browser prompt, which
  //  gives no room to write a sentence the person will actually read
  //  and no way to show what is being removed.
  const [panelFor, setPanelFor] = useState<{ id: string; mode: 'restrict' | 'revoke' } | null>(null);

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={avatar}>{person.initials}</span>
        <span style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 600, fontSize: 17, lineHeight: '24px' }}>{person.name}</span>
          <span style={{ fontSize: 12, color: 'var(--nv-light-text-tertiary)' }}>{person.standing}</span>
        </span>
        {onChangeRole && (
          <button type="button" style={ghostButton} onClick={onChangeRole}>Change role</button>
        )}
      </section>

      <section style={card}>
        <header style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 style={cardTitle}>Access from the {ROLE_LABELS[person.role]} role</h2>
            {/*  The warning before the mistake, not after it. An admin
                fixing one person's access on the Roles tab changes it
                for everybody holding the role. */}
            <p style={cardBlurb}>
              Changes here affect all {person.peopleInRole} {ROLE_LABELS[person.role]}s.
              Edit them on the Roles tab.
            </p>
          </span>
          {onOpenRole && (
            <button type="button" style={ghostButton} onClick={onOpenRole}>Open role</button>
          )}
        </header>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {roleAccess.map((line) => {
            const conflict = checkConflict(person.role, line.section, 'act');
            return (
              <div key={line.section} style={row}>
                <span style={{ flex: 1, minWidth: 160, fontWeight: 600, fontSize: 13 }}>
                  {SECTION_LABELS[line.section]}
                </span>
                {line.level
                  ? <AccessChip grade={line.level} />
                  : conflict.conflicts
                    //  Not an omission: the row exists so an admin
                    //  looking for why finds the answer rather than
                    //  nothing.
                    ? (
                      <span style={forbidden} title={`${conflict.reason} ${conflict.insteadAsk ?? ''}`.trim()}>
                        <Lock size={14} strokeWidth={1.5} aria-hidden />
                        Act can't be granted
                      </span>
                    )
                    : <span style={{ color: 'var(--nv-light-text-tertiary)', fontSize: 13 }}>—</span>}
                {line.restrictedFrom && (
                  <span style={restrictedTag}>Restricted from {line.restrictedFrom === 'act' ? 'Act' : 'View'}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section style={card}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 style={cardTitle}>Extra access</h2>
          <p style={cardBlurb}>Granted on request. Ends automatically on the date shown.</p>
        </header>

        {extraGrants.length === 0 ? (
          <p style={empty}>Nothing beyond the role.</p>
        ) : extraGrants.map((g) => (
          <div key={g.id} style={grantCard}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{SECTION_LABELS[g.section]}</span>
              <AccessChip grade={g.level} />
              <span style={{ flex: 1, minWidth: 0 }} />
              <button type="button" style={smallGhost}
                onClick={() => setPanelFor(
                  panelFor?.id === g.id && panelFor.mode === 'restrict'
                    ? null : { id: g.id, mode: 'restrict' })}>
                Restrict
              </button>
              <button type="button" style={smallDanger}
                onClick={() => setPanelFor(
                  panelFor?.id === g.id && panelFor.mode === 'revoke'
                    ? null : { id: g.id, mode: 'revoke' })}>
                Revoke
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--nv-light-text-secondary)' }}>
              {g.scope} · until {human(g.until)}
            </p>
            <p style={provenance}>{g.provenance}</p>

            {panelFor?.id === g.id && (
              <ChangePanel
                grant={g} mode={panelFor.mode}
                person={person.name.split(' ')[0]} today={today}
                onCancel={() => setPanelFor(null)}
                onSave={(change) => {
                  if (panelFor.mode === 'revoke') void onRevoke(g.id, change.reason);
                  else void onRestrict(g.id, change);
                  setPanelFor(null);
                }}
              />
            )}
          </div>
        ))}
      </section>

      {restrictions.length > 0 && (
        <section style={card}>
          <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 style={cardTitle}>Restrictions on role access</h2>
            <p style={cardBlurb}>
              Temporarily lowers what the role would normally allow for this person.
            </p>
          </header>
          {restrictions.map((r) => (
            <div key={r.id} style={grantCard}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{SECTION_LABELS[r.section]}</span>
                <span style={{ ...restrictedTag, textDecoration: 'line-through' }}>
                  {r.from === 'act' ? 'Act' : 'View'}
                </span>
                <AccessChip grade={r.to} />
                <span style={{ flex: 1, minWidth: 0 }} />
                {onLiftRestriction && (
                  <button type="button" style={smallGhost} onClick={() => onLiftRestriction(r.id)}>
                    Lift restriction
                  </button>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--nv-light-text-secondary)' }}>
                Until {human(r.until)} · “{r.reason}”
              </p>
              <p style={provenance}>{r.setBy}</p>
            </div>
          ))}
        </section>
      )}

      <section style={card}>
        <header style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h2 style={cardTitle}>Access history</h2>
          <span style={{ ...cardBlurb, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <History size={14} strokeWidth={1.5} aria-hidden />
            From the audit trail
          </span>
        </header>
        {/*  Read from the audit trail rather than kept alongside it.
            A second history would be the one somebody edits. */}
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
          {history.map((h, i) => (
            <li key={`${h.at}-${i}`} style={row}>
              <span style={{ ...provenance, flex: '0 0 150px' }}>{h.at}</span>
              <span style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{h.what}</span>
                <span style={{ fontSize: 12, color: 'var(--nv-light-text-tertiary)' }}>{h.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function ChangePanel({ grant, mode, person, today, onCancel, onSave }: {
  grant: ExtraGrant; mode: 'restrict' | 'revoke'; person: string; today: Date;
  onCancel: () => void;
  onSave: (change: { until: string | null; reason: string }) => void;
}) {
  const revoking = mode === 'revoke';
  //  Defaults to a week from today rather than to the grant's own end
  //  date: a restriction panel pre-filled with the current value makes
  //  "Save restriction" do nothing, which is the one outcome it should
  //  not have.
  const [until, setUntil] = useState(iso(new Date(today.getTime() + 7 * 86400000)));
  const [reason, setReason] = useState('');
  const max = iso(new Date(today.getTime() + MAX_GRANT_DAYS * 86400000));
  const ready = reason.trim().length > 0;

  return (
    <div style={panel}>
      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
        {revoking ? 'Remove' : 'Restrict'} {SECTION_LABELS[grant.section]} access
      </p>

      {revoking ? (
        //  Revoking takes the whole grant, so there is no date to set.
        //  Saying what will be gone is the part that matters.
        <p style={{ margin: 0, fontSize: 13, color: 'var(--nv-light-text-secondary)' }}>
          {person} loses {grant.level === 'act' ? 'Act' : 'View'} on{' '}
          {SECTION_LABELS[grant.section]} straight away. Their role access is unchanged.
        </p>
      ) : (
        <label style={field}>
          <span style={fieldLabel}>Shorten the end date</span>
          <input
            type="date" value={until} min={iso(today)} max={max}
            onChange={(e) => setUntil(e.target.value)} style={input}
          />
          <span style={provenance}>Currently {human(grant.until)}</span>
        </label>
      )}

      <label style={field}>
        <span style={fieldLabel}>Reason ({person} sees this)</span>
        <textarea
          value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
          placeholder="What changed, and what they should do if they still need it."
          style={{ ...input, resize: 'vertical' }}
        />
      </label>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 180, ...provenance }}>
          Takes effect now. Logged in the audit trail.
        </span>
        <button type="button" style={smallGhost} onClick={onCancel}>Cancel</button>
        <button
          type="button"
          style={{ ...(revoking ? smallDanger : smallPrimary), ...(ready ? null : disabled) }}
          disabled={!ready}
          onClick={() => onSave({ until: revoking ? null : until, reason: reason.trim() })}
        >
          {revoking ? 'Remove access' : 'Save restriction'}
        </button>
      </div>
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
  margin: 0, fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 18, lineHeight: '24px',
};

const cardBlurb: CSSProperties = {
  margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-tertiary)',
};

const avatar: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 44, height: 44, flexShrink: 0, borderRadius: 22,
  background: 'var(--nv-light-state-hold-bg)', color: 'var(--nv-light-state-hold-text)',
  fontWeight: 600, fontSize: 14,
};

const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  padding: '12px 0', borderTop: '1px solid var(--nv-light-border)',
};

const forbidden: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 12, color: 'var(--nv-light-text-tertiary)', cursor: 'help',
};

const restrictedTag: CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '2px 8px', borderRadius: 4,
  background: 'var(--nv-light-badge-waiting-bg)',
  border: '1px solid var(--nv-light-badge-waiting-border)',
  color: 'var(--nv-light-badge-waiting-text)',
  fontWeight: 600, fontSize: 11, lineHeight: '16px', whiteSpace: 'nowrap',
};

const grantCard: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6,
  padding: 14, borderRadius: 8,
  background: 'var(--nv-light-surface-sunken)',
};

const provenance: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-mono)', fontSize: 10.5, lineHeight: '16px',
  color: 'var(--nv-light-text-tertiary)',
};

const empty: CSSProperties = {
  margin: 0, fontSize: 13, color: 'var(--nv-light-text-tertiary)',
};

const panel: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
  marginTop: 6, padding: 14, borderRadius: 8,
  background: '#ffffff', border: '1.5px solid var(--nv-light-action-bg)',
};

const field: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
};

const fieldLabel: CSSProperties = { fontWeight: 600, fontSize: 13 };

const input: CSSProperties = {
  padding: '10px 12px', borderRadius: 8, width: '100%', boxSizing: 'border-box',
  background: '#ffffff', border: '1px solid var(--nv-light-outline-border)',
  fontFamily: 'var(--nv-font-body)', fontSize: 14,
  color: 'var(--nv-light-text-primary)',
};

const buttonBase: CSSProperties = {
  height: 36, padding: '0 14px', borderRadius: 8, flexShrink: 0,
  fontFamily: 'var(--nv-font-display)', fontWeight: 600, fontSize: 14, lineHeight: '18px',
  cursor: 'pointer',
};

const ghostButton: CSSProperties = {
  ...buttonBase, height: 40, padding: '0 18px', fontSize: 15, lineHeight: '20px',
  background: 'var(--nv-light-outline-bg)',
  border: '1px solid var(--nv-light-outline-border)',
  color: 'var(--nv-light-outline-text)',
};

const smallGhost: CSSProperties = {
  ...buttonBase,
  background: 'var(--nv-light-outline-bg)',
  border: '1px solid var(--nv-light-outline-border)',
  color: 'var(--nv-light-outline-text)',
};

const smallPrimary: CSSProperties = {
  ...buttonBase,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: 'var(--nv-light-action-text)',
};

//  Soft danger, not the solid red. Revoking is reversible by granting
//  again, and the solid red is reserved for rejecting a record.
const smallDanger: CSSProperties = {
  ...buttonBase,
  background: 'var(--nv-light-danger-soft-bg)',
  border: '1px solid var(--nv-light-danger-soft-bg)',
  color: 'var(--nv-light-danger-soft-text)',
};

const disabled: CSSProperties = {
  background: 'var(--nv-light-disabled-bg)',
  border: '1px solid var(--nv-light-disabled-border)',
  color: 'var(--nv-light-disabled-text)',
  cursor: 'not-allowed',
};
