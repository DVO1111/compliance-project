/**
 * PM-03 · Roles — what each role can open (node 84:1077), and PM-M03.
 *
 * One grid: roles down, sections across, Act / View / — / locked in
 * the cells. Beside it the two things the grid cannot say — which
 * steps are permissions in their own right, and which combinations are
 * forbidden outright.
 *
 * WHY A LOCK IS NOT A DASH. The design draws two different empty
 * cells, and the difference is the whole point of the screen. A dash
 * means this role simply has not been given that section — an admin
 * can change it here, and somebody can request it. A lock means the
 * duties rule forbids it, and no amount of granting will produce it.
 * Showing both as blank would make an admin try, fail, and conclude
 * the product is broken.
 *
 * The locks are not listed in this file. They come from
 * permissionRequests.checkConflict, the same function the request
 * dialog and the review drawer use, so a cell cannot show a lock the
 * drawer would grant or show a dash the drawer would refuse.
 */

import type { CSSProperties } from 'react';
import { Lock } from 'lucide-react';
import {
  SECTION_LABELS, ROLE_LABELS, segregationSummary, checkConflict, canBeRequested,
  type AccessSection, type AccessGrade, type WorkRole,
} from '../../lib/access/permissionRequests';
import { icon } from '../../lib/design/icons';
import AccessChip from './AccessChip';

//  Through the registry, not a direct lucide import: the toolkit pins
//  lucide-react 0.344.0, which has no `Signature`, and the registry
//  already resolves `lifecycle/signature` to the glyph the design
//  system means. A direct import would have shipped the wrong icon or
//  none at all.
const SignatureIcon = icon('lifecycle/signature');

/** What a role holds on a section, before any individual grant. */
export type RoleAccess = Partial<Record<AccessSection, 'act' | 'view'>>;

export interface RoleRow {
  role: WorkRole;
  /** "6 people". Counted, not estimated. */
  peopleCount: number;
  access: RoleAccess;
}

export interface StepPermission {
  /** "Release a batch". */
  step: string;
  /** "QA Manager (QA release role)". */
  whoCanDoIt: string;
  /** "E-signature", "Logged", or nothing. */
  needs?: 'signature' | 'logged';
}

export interface RolesMatrixProps {
  roles: RoleRow[];
  /** Which sections to show as columns, in order. */
  sections: AccessSection[];
  steps: StepPermission[];
  onOpenApprovalRules?: () => void;
  className?: string;
}

export default function RolesMatrix({
  roles, sections, steps, onOpenApprovalRules, className,
}: RolesMatrixProps) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section style={card}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 style={cardTitle}>What each role can open</h2>
          <p style={cardBlurb}>
            A lock means segregation of duties forbids it — it cannot be granted or requested.
            A dash means the role simply does not have it yet.
          </p>
        </header>

        {/*  The one place on these screens that may scroll sideways.
            Twelve sections will not fit a phone at a readable size,
            and squeezing them would make every cell a guess. */}
        <div style={scroller}>
          <div role="table" aria-label="What each role can open" style={grid(sections.length)}>
            <div role="row" style={{ display: 'contents' }}>
              <span role="columnheader" style={{ ...head, ...roleCol }}>Role</span>
              {sections.map((s) => (
                <span key={s} role="columnheader" style={head}>{SECTION_LABELS[s]}</span>
              ))}
            </div>

            {roles.map((r) => (
              <div key={r.role} role="row" style={{ display: 'contents' }}>
                <span role="rowheader" style={{ ...cell, ...roleCol, alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{ROLE_LABELS[r.role]}</span>
                  <span style={meta}>
                    {r.peopleCount} {r.peopleCount === 1 ? 'person' : 'people'}
                  </span>
                </span>

                {sections.map((s) => {
                  const held = r.access[s];
                  //  Act forbidden by the duties rule, or a section
                  //  nobody can be granted at all — both are locks.
                  const locked = checkConflict(r.role, s, 'act').conflicts || !canBeRequested(s);
                  return (
                    <span key={s} role="cell" style={cell}>
                      <Cell held={held} locked={locked && !held} role={r.role} section={s} />
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <p style={footnote}>
          Changes here apply to everybody holding the role. One person's exception is set on
          their own record, not here.
        </p>
      </section>

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <section style={{ ...card, flex: '2 1 420px' }}>
          <header style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <h2 style={cardTitle}>Step permissions</h2>
              <p style={cardBlurb}>
                Set in Approval rules, not here. They can't be requested or granted from this page.
              </p>
            </span>
            {onOpenApprovalRules && (
              <button type="button" style={ghostButton} onClick={onOpenApprovalRules}>
                Open approval rules
              </button>
            )}
          </header>

          <div role="table" aria-label="Step permissions" style={{ display: 'flex', flexDirection: 'column' }}>
            <div role="row" style={{ ...stepRow, ...head, borderTop: 'none', paddingTop: 0 }}>
              <span role="columnheader" style={stepName}>Step</span>
              <span role="columnheader" style={stepWho}>Who can do it</span>
              <span role="columnheader" style={stepNeeds}>Needs</span>
            </div>
            {steps.map((s) => (
              <div key={s.step} role="row" style={stepRow}>
                <span role="cell" style={{ ...stepName, fontWeight: 600, fontSize: 13 }}>{s.step}</span>
                <span role="cell" style={{ ...stepWho, fontSize: 13, color: 'var(--nv-light-text-secondary)' }}>
                  {s.whoCanDoIt}
                </span>
                <span role="cell" style={{ ...stepNeeds, fontSize: 12, color: 'var(--nv-light-text-secondary)' }}>
                  {s.needs === 'signature' ? (
                    <>
                      <SignatureIcon size={16} strokeWidth={1.5} aria-hidden />
                      E-signature
                    </>
                  ) : s.needs === 'logged' ? 'Logged' : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...card, flex: '1 1 340px' }}>
          <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 style={cardTitle}>Segregation of duties</h2>
            {/*  "Including admins" is the claim this card makes, and
                the Compliance admin's own line below is what makes it
                true rather than reassuring. */}
            <p style={cardBlurb}>Enforced for everyone, including admins</p>
          </header>
          {segregationSummary().map(({ role, line }) => (
            <p key={role} style={ruleLine}>
              <Lock size={16} strokeWidth={1.5} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{line}</span>
            </p>
          ))}
        </section>
      </div>
    </div>
  );
}

function Cell({ held, locked, role, section }: {
  held?: 'act' | 'view'; locked: boolean; role: WorkRole; section: AccessSection;
}) {
  if (held) return <AccessChip grade={held as AccessGrade} />;

  if (locked) {
    const conflict = checkConflict(role, section, 'act');
    return (
      <span
        style={lockedCell}
        //  The reason is on the cell rather than in a legend. An admin
        //  looking at one lock should not have to work out which of
        //  nine rules put it there.
        title={conflict.conflicts
          ? `${conflict.reason} ${conflict.insteadAsk ?? ''}`.trim()
          : 'This is a step permission, set in Approval rules.'}
      >
        <span aria-hidden>—</span>
        <Lock size={14} strokeWidth={1.5} aria-hidden />
        <span style={srOnly}>
          Locked. {conflict.conflicts ? conflict.reason : 'Set in Approval rules.'}
        </span>
      </span>
    );
  }

  return <span style={{ color: 'var(--nv-light-text-tertiary)' }} aria-label="No access">—</span>;
}

// ── Styles ───────────────────────────────────────────────────────────

const card: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 16,
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

const scroller: CSSProperties = {
  overflowX: 'auto', maxWidth: '100%',
};

const grid = (columns: number): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: `minmax(160px, 1.4fr) repeat(${columns}, minmax(88px, 1fr))`,
  gap: '0 8px',
  minWidth: 160 + columns * 96,
});

const head: CSSProperties = {
  display: 'flex', alignItems: 'flex-end', minWidth: 0,
  padding: '0 0 8px',
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 10, lineHeight: '14px', letterSpacing: '0.04em',
  textTransform: 'uppercase', color: 'var(--nv-light-text-tertiary)',
  borderBottom: '1px solid var(--nv-light-border)',
};

const roleCol: CSSProperties = { position: 'sticky', left: 0, background: 'var(--nv-light-surface)' };

const cell: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center',
  minWidth: 0, padding: '12px 0',
  borderBottom: '1px solid var(--nv-light-border)',
};

const meta: CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontSize: 10.5, lineHeight: '15px',
  color: 'var(--nv-light-text-tertiary)',
};

const lockedCell: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  color: 'var(--nv-light-text-tertiary)', cursor: 'help',
};

const srOnly: CSSProperties = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
};

const footnote: CSSProperties = {
  margin: 0, fontSize: 11.5, lineHeight: '16px', color: 'var(--nv-light-text-tertiary)',
};

const stepRow: CSSProperties = {
  display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
  padding: '12px 0', borderTop: '1px solid var(--nv-light-border)',
};

const stepName:  CSSProperties = { flex: '1.8 1 0', minWidth: 160 };
const stepWho:   CSSProperties = { flex: '2 1 0',   minWidth: 180 };
const stepNeeds: CSSProperties = {
  flex: '0 0 120px', display: 'flex', alignItems: 'center', gap: 6,
};

const ruleLine: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start', margin: 0,
  fontSize: 13, lineHeight: '20px', color: 'var(--nv-light-text-secondary)',
};

const ghostButton: CSSProperties = {
  height: 40, padding: '0 18px', borderRadius: 8, flexShrink: 0,
  background: 'var(--nv-light-outline-bg)',
  border: '1px solid var(--nv-light-outline-border)',
  color: 'var(--nv-light-outline-text)',
  fontFamily: 'var(--nv-font-display)', fontWeight: 600, fontSize: 15, lineHeight: '20px',
  cursor: 'pointer',
};
