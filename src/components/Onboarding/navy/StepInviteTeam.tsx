/**
 * ONB-05 · Invite your team.
 *
 * Two cards: the people, and what the roles mean.
 *
 * WHAT THE NOTES PIN DOWN
 *
 *   "The step is optional: 'Skip for now' moves on without sending
 *    anything."
 *    → a third footer action that calls onDone directly. It does not
 *      save a draft, because a half-filled row that silently became an
 *      invitation later would be worse than losing it.
 *
 *   "Release authority is a step permission (2.5, C8.6). The copy says
 *    QC cannot release, so nobody expects the action and then finds it
 *    missing."
 *    → "What the roles mean" is not decoration. It is the only place
 *      the product says, before anyone hits it, that a QC Analyst
 *      cannot release a batch.
 *
 *   "'Signs applications' maintains the authorised signatory register
 *    (A3.1, A3.3). Changes are logged."
 *    → the SIGNS toggle writes to authorised_signatories, whose every
 *      insert and update lands in the hash-chained audit log. Removing
 *      someone closes their row rather than deleting it.
 *
 *   "Users are assigned to one or more sites (H1.4)."
 *    → the SITES column lists the sites from step 3. "All sites" is
 *      stored as an EMPTY list, not as every current id, so a site
 *      added next month is visible to them without an edit.
 *
 * EACH INVITATION IS SENT AND REPORTED SEPARATELY. One bad address does
 * not discard the rest, and a row that has gone is marked sent so that
 * pressing the button again after fixing a failure does not invite the
 * same person twice.
 */

import { useState } from 'react';
import {
  TEAM_ROLES, ROLE_TITLES, roleByTitle, permissionRoleFor,
  SIGNATORY_NOTE, ALL_SITES_LABEL,
} from '../../../lib/onboarding/teamRoles';
import {
  sendTeamInvites, saveOwnTeamRow,
  type TeamInviteResult,
} from '../../../lib/onboarding/setupSteps';
import { ICONS, iconProps } from '../../../lib/design/icons';
import OnboardingShell, { OnboardingCard } from './OnboardingShell';
import NavyButton from './NavyButton';

export interface SiteOption { id: string; name: string }

export interface StepInviteTeamProps {
  companyId: string;
  userId: string;
  /** The admin's own row — "Ada Okafor (you) · admin". */
  me: { email: string; fullName: string; jobTitle: string };
  sites: SiteOption[];
  /** From step 4, so invitees get the same areas the workspace uses. */
  moduleKeys: string[];
  onBack: () => void;
  onDone: () => void;
}

interface PersonRow {
  key: number;
  email: string;
  jobTitle: string;
  /** Empty = all sites. */
  siteIds: string[];
  signs: boolean;
  sent: boolean;
  error: string | null;
}

let nextKey = 1;
const blankRow = (): PersonRow => ({
  key: nextKey++, email: '', jobTitle: '', siteIds: [], signs: false, sent: false, error: null,
});

export default function StepInviteTeam({
  companyId, userId, me, sites, moduleKeys, onBack, onDone,
}: StepInviteTeamProps) {
  const [rows, setRows] = useState<PersonRow[]>(() => [blankRow()]);
  //  The admin usually signs — they are the one filling this in — but it
  //  is a toggle, not an assumption, because the register is a control.
  const [iSign, setISign] = useState(true);
  const [mySiteIds, setMySiteIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentLinks, setSentLinks] = useState<TeamInviteResult[]>([]);

  const patch = (key: number, change: Partial<PersonRow>) =>
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...change, error: null } : r)));

  const addRow = () => setRows((cur) => [...cur, blankRow()]);

  const send = async () => {
    const pending = rows.filter((r) => !r.sent && r.email.trim().length > 0);

    if (pending.length === 0) {
      //  Nothing to send, but the admin's own sites and signing
      //  authority are still a decision they just made on this screen.
      setBusy(true);
      const own = await saveOwnTeamRow(
        companyId, userId, me.email, me.fullName, me.jobTitle, mySiteIds, iSign);
      setBusy(false);
      if (!own.ok) { setError(own.message); return; }
      onDone();
      return;
    }

    setBusy(true);
    setError(null);

    const own = await saveOwnTeamRow(
      companyId, userId, me.email, me.fullName, me.jobTitle, mySiteIds, iSign);
    if (!own.ok) { setBusy(false); setError(own.message); return; }

    const results = await sendTeamInvites(
      companyId,
      pending.map((r) => ({
        email: r.email,
        jobTitle: r.jobTitle,
        siteIds: r.siteIds,
        signsApplications: r.signs,
      })),
      moduleKeys,
      permissionRoleFor,
    );
    setBusy(false);

    const byEmail = new Map(results.map((r) => [r.email, r]));
    setRows((cur) => cur.map((r) => {
      const result = byEmail.get(r.email.trim().toLowerCase());
      if (!result) return r;
      return { ...r, sent: result.ok, error: result.ok ? null : (result.message ?? 'Failed.') };
    }));

    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      setError(
        failures.length === results.length
          ? 'None of the invitations could be sent. The reason is beside each person.'
          : `${results.length - failures.length} sent. The rest are marked below — fix them and press the button again.`,
      );
      //  The ones that worked are kept on screen with their links, so a
      //  workspace with no mail configured still has a way to pass the
      //  invitation on.
      setSentLinks(results.filter((r) => r.ok && r.link));
      return;
    }

    setSentLinks(results.filter((r) => r.link));
    onDone();
  };

  return (
    <OnboardingShell
      step={5}
      stepLabel="Your team"
      title="Invite your team"
      subtitle="Add the people who do the work. Their role decides what they can approve, sign and release; their site decides which records they see."
      backLabel="Back"
      onBack={onBack}
      onContinue={send}
      continueLabel="Send invites and continue"
      continueBusy={busy}
      secondaryLabel="Skip for now"
      onSecondary={onDone}
    >
      <OnboardingCard
        title="People"
        description="Invitations are sent by email when you continue. People who haven’t accepted yet show as pending on the dashboard."
      >
        <div className="onb-people-row onb-people-head" aria-hidden="true">
          <span style={head}>EMAIL</span>
          <span style={head}>ROLE</span>
          <span style={head}>SITES</span>
          <span style={head}>SIGNS</span>
        </div>

        {/* ── The admin's own row ──────────────────────────────────── */}
        <div className="onb-people-row">
          <span style={{ fontWeight: 600, fontSize: 14, lineHeight: '20px', color: 'var(--nv-text-primary)' }}>
            {me.fullName || me.email} (you) · admin
          </span>
          <span style={{ fontSize: 13, lineHeight: '19px', color: 'var(--nv-text-primary)', fontWeight: 600 }}>
            {me.jobTitle || 'Admin'}
          </span>
          <SitePicker
            label={`Sites for ${me.fullName || 'you'}`}
            sites={sites}
            value={mySiteIds}
            onChange={setMySiteIds}
          />
          <SignsToggle
            label={`${me.fullName || 'You'} signs applications`}
            on={iSign}
            onToggle={() => setISign((v) => !v)}
          />
        </div>

        {/* ── Everyone else ────────────────────────────────────────── */}
        {rows.map((row) => (
          <div key={row.key} style={{ display: 'grid', gap: 6 }}>
            <div className="onb-people-row">
              <input
                className="nv-field"
                type="email"
                value={row.email}
                readOnly={row.sent}
                placeholder="name@company.com"
                aria-label="Email address"
                onChange={(e) => patch(row.key, { email: e.target.value })}
                style={{
                  ...control,
                  border: row.error ? '1px solid #e2725b' : '1px solid var(--nv-field-border)',
                  opacity: row.sent ? 0.6 : 1,
                }}
              />

              <select
                className="nv-field"
                value={row.jobTitle}
                disabled={row.sent}
                aria-label="Role"
                onChange={(e) => {
                  const role = roleByTitle(e.target.value);
                  patch(row.key, {
                    jobTitle: e.target.value,
                    //  The toggle follows the role until someone moves
                    //  it, which is why it is set here and not derived
                    //  on every render.
                    signs: role?.usuallySigns ?? false,
                  });
                }}
                style={{ ...control, border: '1px solid var(--nv-field-border)' }}
              >
                <option value="">Choose a role</option>
                {ROLE_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>

              <SitePicker
                label={`Sites for ${row.email || 'this person'}`}
                sites={sites}
                value={row.siteIds}
                disabled={row.sent}
                onChange={(ids) => patch(row.key, { siteIds: ids })}
              />

              <SignsToggle
                label={`${row.email || 'This person'} signs applications`}
                on={row.signs}
                disabled={row.sent}
                onToggle={() => patch(row.key, { signs: !row.signs })}
              />
            </div>

            {row.error && (
              <p role="alert" style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: '#ffb4a6' }}>
                {row.error}
              </p>
            )}
            {row.sent && (
              <p style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--nv-action-primary-bg)' }}>
                Invitation sent.
              </p>
            )}
          </div>
        ))}

        <div>
          <NavyButton variant="ghost" onClick={addRow} style={{ padding: 0 }}>
            Add another person
          </NavyButton>
        </div>

        {sentLinks.length > 0 && (
          //  Shown only when the RPC handed a link back. On a workspace
          //  with no mail configured it is the only way the invitation
          //  reaches anybody, and losing it means starting again.
          <div style={well}>
            <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: '19px', color: 'var(--nv-text-secondary)' }}>
              Copy these links in case the emails don’t arrive. Each one expires in 72 hours.
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
              {sentLinks.map((r) => (
                <li key={r.email} style={{ fontSize: 12, lineHeight: '18px', wordBreak: 'break-all' }}>
                  <span style={{ color: 'var(--nv-text-primary)' }}>{r.email}</span>{' '}
                  <span style={{ fontFamily: 'var(--nv-font-mono)', color: 'var(--nv-text-tertiary)' }}>
                    {r.link}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </OnboardingCard>

      <OnboardingCard
        title="What the roles mean"
        description="Roles come with sensible permissions. Fine-tune them later in Role Management."
      >
        <dl style={{ margin: 0, display: 'grid', gap: 14 }}>
          {TEAM_ROLES.map((r) => (
            <div key={r.id} style={{
              display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 16,
            }}>
              <dt style={{ fontWeight: 600, fontSize: 13, lineHeight: '19px', color: 'var(--nv-text-primary)' }}>
                {r.title}
              </dt>
              <dd style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--nv-text-secondary)' }}>
                {r.meaning}
              </dd>
            </div>
          ))}
        </dl>

        <div style={{ ...well, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span aria-hidden="true" style={{ color: 'var(--nv-text-tertiary)', marginTop: 1 }}>
            {(() => { const Pen = ICONS['lifecycle/signature']; return <Pen {...iconProps('sm')} />; })()}
          </span>
          <p style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--nv-text-secondary)' }}>
            {SIGNATORY_NOTE}
          </p>
        </div>
      </OnboardingCard>

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: '#ffb4a6' }}>
          {error}
        </p>
      )}
    </OnboardingShell>
  );
}

/**
 * The SITES cell.
 *
 * A native multi-select would be the smallest thing to write and the
 * worst to use on a phone, so this is a plain select whose first option
 * is "All sites" — the common case — plus one option per site. Someone
 * who needs a person on two of five sites sets it in Role Management;
 * the screen's job here is the first pass.
 *
 * "All sites" stores an EMPTY list rather than every current id, so a
 * site added next month is visible to them without an edit.
 */
function SitePicker({ label, sites, value, onChange, disabled }: {
  label: string;
  sites: SiteOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const current = value.length === 0 ? '' : value[0];
  return (
    <select
      className="nv-field"
      aria-label={label}
      value={current}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
      style={{ ...control, border: '1px solid var(--nv-field-border)' }}
    >
      <option value="">{sites.length === 0 ? 'Choose sites' : ALL_SITES_LABEL}</option>
      {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

/**
 * The SIGNS cell.
 *
 * A real checkbox underneath, drawn as a switch. It decides whether
 * someone goes on the authorised signatory register, which is a control
 * and not a preference — so it is labelled per row, by name, rather
 * than relying on the column head that disappears at phone width.
 */
function SignsToggle({ label, on, onToggle, disabled }: {
  label: string; on: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    }}>
      <input
        type="checkbox"
        className="sr-only"
        checked={on}
        disabled={disabled}
        onChange={onToggle}
        aria-label={label}
      />
      <span aria-hidden="true" style={{
        width: 36, height: 20, flex: 'none', borderRadius: 10, position: 'relative',
        background: on ? 'var(--nv-action-primary-bg)' : 'var(--nv-surface-hover)',
        border: on ? 'none' : '1px solid var(--nv-border-strong)',
        transition: 'background 160ms ease',
      }}>
        <span style={{
          position: 'absolute', top: on ? 3 : 2, left: on ? 19 : 2,
          width: 14, height: 14, borderRadius: 7,
          background: on ? 'var(--nv-action-primary-text)' : 'var(--nv-text-tertiary)',
          transition: 'left 160ms ease',
        }} />
      </span>
      {/*  Visible only when the row has stacked and the column head is
          gone — otherwise the switch would be unlabelled on a phone.  */}
      <span className="onb-signs-text" style={{
        fontSize: 12, lineHeight: '18px', color: 'var(--nv-text-tertiary)',
      }}>
        Signs applications
      </span>
    </label>
  );
}

const head: React.CSSProperties = {
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 11, lineHeight: '16px', letterSpacing: '0.06em',
  color: 'var(--nv-text-tertiary)',
};

const control: React.CSSProperties = {
  width: '100%',
  height: 'var(--nv-control-height)',
  padding: '0 12px',
  boxSizing: 'border-box',
  borderRadius: 'var(--nv-radius-control)',
  background: 'var(--nv-field-bg)',
  color: 'var(--nv-text-primary)',
  fontFamily: 'var(--nv-font-body)',
  fontSize: 14,
};

const well: React.CSSProperties = {
  padding: 14, borderRadius: 10,
  background: 'var(--nv-surface-recessed)',
  border: '1px solid var(--nv-border-default)',
};
