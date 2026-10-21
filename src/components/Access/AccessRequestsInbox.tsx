/**
 * PM-01 · Roles & permissions — access requests (node 81:885), and
 * PM-M01, which is the same two lists as stacked cards.
 *
 * Step 3: "The request goes to the Compliance admin with an automatic
 * conflict check."
 *
 * TWO LISTS, NOT ONE WITH A FILTER. "Waiting for a decision" is work;
 * "Decided recently" is a record. A single list with a status column
 * would make the admin's queue grow by one every time they cleared
 * something, and the number at the top of the page — "3 waiting" —
 * would stop meaning anything.
 *
 * THE CHECK COLUMN IS NOT A VERDICT. It shows the conflict check's
 * answer so the admin knows before opening the drawer, and a conflict
 * carries its one-line reason underneath. It does not decide anything:
 * a request with a conflict is still reviewed, because the admin may
 * narrow it to View, and the drawer is where that happens.
 */

import type { CSSProperties } from 'react';
import {
  SECTION_LABELS, checkConflict, describeDecision,
  type AccessSection, type AccessLevel, type WorkRole, type Decision,
} from '../../lib/access/permissionRequests';
import StateBadge from '../Common/StateBadge';
import AccessChip from './AccessChip';

export interface WaitingRequest {
  id: string;
  person: { name: string; initials: string; standing: string; role: WorkRole };
  /** "2 hours ago". */
  askedAgo: string;
  section: AccessSection;
  level: AccessLevel;
  /** "Lots they received". */
  scope: string;
  /** "Until 31 Oct 2026" / "No end date". */
  duration: string;
  reason: string;
}

export interface DecidedRequest {
  id: string;
  person: { name: string; initials: string; standing: string };
  section: AccessSection;
  level: AccessLevel;
  decision: Decision;
  /** "K. Adewale · 7 Oct". */
  by: string;
}

export interface AccessRequestsInboxProps {
  waiting: WaitingRequest[];
  decided: DecidedRequest[];
  /** "Oldest: 2 hours". */
  oldest?: string;
  onReview: (id: string) => void;
  /** Opens the grant for a decided request, to restrict or revoke it. */
  onOpenDecided?: (id: string) => void;
  className?: string;
}

export default function AccessRequestsInbox({
  waiting, decided, oldest, onReview, onOpenDecided, className,
}: AccessRequestsInboxProps) {
  //  Counted here rather than passed in, so the summary line and the
  //  CHECK column cannot disagree about how many conflicts there are.
  const conflicts = waiting.filter(
    (r) => checkConflict(r.person.role, r.section, r.level).conflicts,
  ).length;

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={summary}>
        <StateBadge state="pending">
          {waiting.length} waiting
        </StateBadge>
        {oldest && <span style={summaryItem}>Oldest: {oldest}</span>}
        {/*  Shown only when there is one. A standing "0 conflicts" line
            trains the eye to skip the place a conflict would appear. */}
        {conflicts > 0 && (
          <StateBadge state="overdue">
            {conflicts === 1
              ? '1 conflict with segregation of duties'
              : `${conflicts} conflicts with segregation of duties`}
          </StateBadge>
        )}
      </div>

      <section style={card}>
        <header style={cardHeader}>
          <h2 style={cardTitle}>Waiting for a decision</h2>
          <p style={cardBlurb}>Oldest first. Nothing changes for the person until you decide.</p>
        </header>

        {waiting.length === 0 ? (
          <p style={empty}>Nothing waiting. New requests appear here and in your notifications.</p>
        ) : (
          <div role="table" aria-label="Access requests waiting for a decision" style={table}>
            <div role="row" style={{ ...row, ...headRow }}>
              <span role="columnheader" style={{ ...cell, ...colPerson }}>Person</span>
              <span role="columnheader" style={{ ...cell, ...colAsking }}>Asking for</span>
              <span role="columnheader" style={{ ...cell, ...colReason }}>Reason</span>
              <span role="columnheader" style={{ ...cell, ...colCheck }}>Check</span>
              <span role="columnheader" style={{ ...cell, ...colAction }} />
            </div>

            {waiting.map((r) => {
              const conflict = checkConflict(r.person.role, r.section, r.level);
              return (
                <div key={r.id} role="row" style={row}>
                  <span role="cell" style={{ ...cell, ...colPerson }}>
                    <Person {...r.person} meta={r.askedAgo} />
                  </span>

                  <span role="cell" style={{ ...cell, ...colAsking, gap: 4 }}>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{SECTION_LABELS[r.section]}</span>
                      <AccessChip grade={r.level} />
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--nv-light-text-secondary)' }}>{r.scope}</span>
                    <span style={mono}>{r.duration}</span>
                  </span>

                  <span role="cell" style={{ ...cell, ...colReason }}>
                    {/*  Quoted, and not shortened. The request dialog
                        promised the admin would see it exactly as
                        written; an ellipsis here breaks that. */}
                    <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-secondary)' }}>
                      “{r.reason}”
                    </span>
                  </span>

                  <span role="cell" style={{ ...cell, ...colCheck, gap: 4 }}>
                    {conflict.conflicts
                      ? <StateBadge state="overdue">Conflict</StateBadge>
                      : <StateBadge state="released">No conflict</StateBadge>}
                    {conflict.conflicts && (
                      <span style={{ fontSize: 11.5, lineHeight: '16px', color: 'var(--nv-light-text-tertiary)' }}>
                        {conflict.insteadAsk}
                      </span>
                    )}
                  </span>

                  <span role="cell" style={{ ...cell, ...colAction }}>
                    <button type="button" style={primaryButton} onClick={() => onReview(r.id)}>
                      Review
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={card}>
        <header style={cardHeader}>
          <h2 style={cardTitle}>Decided recently</h2>
          <p style={cardBlurb}>Grants with an end date are removed automatically when they expire.</p>
        </header>

        {decided.length === 0 ? (
          <p style={empty}>No decisions yet.</p>
        ) : (
          <div role="table" aria-label="Access requests decided recently" style={table}>
            <div role="row" style={{ ...row, ...headRow }}>
              <span role="columnheader" style={{ ...cell, ...colDecidedPerson }}>Person</span>
              <span role="columnheader" style={{ ...cell, ...colAsking }}>Access</span>
              <span role="columnheader" style={{ ...cell, ...colCheck }}>Decision</span>
              <span role="columnheader" style={{ ...cell, ...colReason }}>Note</span>
              <span role="columnheader" style={{ ...cell, ...colBy }}>By</span>
              <span role="columnheader" style={{ ...cell, ...colOpen }} />
            </div>

            {decided.map((d) => (
              <div key={d.id} role="row" style={row}>
                <span role="cell" style={{ ...cell, ...colDecidedPerson }}>
                  <Person {...d.person} />
                </span>

                <span role="cell" style={{ ...cell, ...colAsking }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{SECTION_LABELS[d.section]}</span>
                    <AccessChip grade={d.level} />
                  </span>
                </span>

                <span role="cell" style={{ ...cell, ...colCheck }}>
                  {d.decision.kind === 'decline'
                    ? <StateBadge state="on_hold">Declined</StateBadge>
                    : <StateBadge state="released">{describeDecision(d.decision)}</StateBadge>}
                </span>

                <span role="cell" style={{ ...cell, ...colReason }}>
                  <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-secondary)' }}>
                    {d.decision.kind === 'decline' ? d.decision.reason
                      : d.decision.kind === 'grant_with_limits' ? d.decision.note
                        : '—'}
                  </span>
                </span>

                <span role="cell" style={{ ...cell, ...colBy }}>
                  <span style={mono}>{d.by}</span>
                </span>

                <span role="cell" style={{ ...cell, ...colOpen }}>
                  {/*  "Restrict or revoke" is PM-04's job, so this is a
                      way in rather than a second set of controls. */}
                  {onOpenDecided && (
                    <button type="button" style={ghostButton} onClick={() => onOpenDecided(d.id)}>
                      Open
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Person({ name, initials, standing, meta }: {
  name: string; initials: string; standing: string; meta?: string;
}) {
  return (
    <span style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
      <span style={avatar}>{initials}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
        <span style={{ fontSize: 12, color: 'var(--nv-light-text-tertiary)' }}>{standing}</span>
        {meta && <span style={mono}>{meta}</span>}
      </span>
    </span>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const summary: CSSProperties = {
  display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
  fontFamily: 'var(--nv-font-body)',
};

const summaryItem: CSSProperties = {
  fontSize: 13, color: 'var(--nv-light-text-secondary)',
};

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 16,
  padding: 20, borderRadius: 12,
  background: 'var(--nv-light-surface)', border: '1px solid var(--nv-light-border)',
  fontFamily: 'var(--nv-font-body)', color: 'var(--nv-light-text-primary)',
};

const cardHeader: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2,
};

const cardTitle: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 18, lineHeight: '24px',
};

const cardBlurb: CSSProperties = {
  margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--nv-light-text-tertiary)',
};

const table: CSSProperties = {
  display: 'flex', flexDirection: 'column',
};

//  Wraps to a stack on a phone rather than scrolling sideways: PM-M01
//  draws the same rows as cards, and a row that wraps IS that card.
const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap',
  padding: '14px 0', borderTop: '1px solid var(--nv-light-border)',
};

const headRow: CSSProperties = {
  borderTop: 'none', paddingTop: 0, paddingBottom: 8,
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--nv-light-text-tertiary)',
};

const cell: CSSProperties = {
  display: 'flex', flexDirection: 'column', minWidth: 0,
};

/*  The design's widths are 220 / 230 / flex / 170 / 120, drawn on a
    1440 frame with a 260 rail — about 1100 of content. The real page
    has less than that on a 1280 laptop, and fixed widths made every row
    wrap onto two lines with the button under the name.

    So the proportions are kept and the pixels are not: each column is a
    flex ratio with a floor, and the row shrinks evenly instead of
    wrapping. The floors add up to less than the narrowest desktop,
    which is what keeps a row one line there, and more than a phone,
    which is what makes it stack into PM-M01's card. */
const colPerson: CSSProperties = { flex: '1.8 1 0', minWidth: 160 };
const colAsking: CSSProperties = { flex: '1.7 1 0', minWidth: 150 };
const colReason: CSSProperties = { flex: '2.4 1 0', minWidth: 180 };
const colCheck:  CSSProperties = { flex: '1.4 1 0', minWidth: 132 };
const colAction: CSSProperties = { flex: '0 0 104px', alignItems: 'flex-start' };

/*  "Decided recently" carries six columns where "Waiting" carries five,
    so it gets its own, tighter floors. It can afford them: its person
    cell has no "2 hours ago" line, and its last column is a secondary
    Open rather than the primary Review. */
const colDecidedPerson: CSSProperties = { flex: '1.5 1 0', minWidth: 140 };
const colBy:           CSSProperties = { flex: '1 1 0',   minWidth: 96 };
const colOpen:         CSSProperties = { flex: '0 0 84px', alignItems: 'flex-start' };

const avatar: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, flexShrink: 0, borderRadius: 16,
  background: 'var(--nv-light-state-hold-bg)', color: 'var(--nv-light-state-hold-text)',
  fontWeight: 600, fontSize: 11,
};

const mono: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 10.5, lineHeight: '15px',
  color: 'var(--nv-light-text-tertiary)',
};

const empty: CSSProperties = {
  margin: 0, padding: '12px 0', fontSize: 13, color: 'var(--nv-light-text-tertiary)',
};

const buttonBase: CSSProperties = {
  height: 40, padding: '0 18px', borderRadius: 8,
  fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 15, lineHeight: '20px', cursor: 'pointer',
};

const primaryButton: CSSProperties = {
  ...buttonBase,
  background: 'var(--nv-light-action-bg)', border: '1px solid var(--nv-light-action-bg)',
  color: 'var(--nv-light-action-text)',
};

const ghostButton: CSSProperties = {
  ...buttonBase,
  background: 'var(--nv-light-outline-bg)',
  border: '1px solid var(--nv-light-outline-border)',
  color: 'var(--nv-light-outline-text)',
};
