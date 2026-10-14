/**
 * The form behind a step.
 *
 * Opening a step used to leave the hub and drop the person on a settings
 * screen to find the right field themselves. This keeps them where they
 * are: the step opens, they type, it saves, the row ticks. That is the
 * difference between a checklist and onboarding.
 *
 * Every field here writes to a column that exists today, so everything
 * entered shows up in the product immediately — the company name on
 * every screen, the industry and region in what the compliance engine
 * loads, the departments in document numbering, the modules in what the
 * navigation shows.
 */

import { useState } from 'react';
import { INDUSTRY_OPTIONS, JURISDICTION_IDS, JURISDICTION_LABELS } from '../../../lib/regulatoryProfile';
import { MODULE_DEFINITIONS } from '../../../lib/moduleAccess';
import {
  addDepartment, removeDepartment, saveCompanyName, saveIndustryRegion, saveModules,
  inviteTeammate, INVITE_ROLES, type SetupState,
} from '../../../lib/onboarding/setupSteps';
import NavyButton from './NavyButton';

const field: React.CSSProperties = {
  width: '100%',
  height: 'var(--nv-control-height)',
  padding: '0 12px',
  borderRadius: 'var(--nv-radius-control)',
  background: 'var(--nv-field-bg)',
  border: '1px solid var(--nv-field-border)',
  color: 'var(--nv-text-primary)',
  fontFamily: 'var(--nv-font-body)',
  fontSize: 14,
  boxSizing: 'border-box',
};

const label: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
  fontSize: 11, lineHeight: '16px', letterSpacing: '0.04em',
  color: 'var(--nv-text-tertiary)',
  textTransform: 'uppercase',
};

export interface StepPanelProps {
  stepId: string;
  state: SetupState;
  companyId: string;
  userId: string;
  /** Called after a successful save so the hub can re-read progress. */
  onSaved: () => void;
  onClose: () => void;
  /** Steps whose home is an existing screen rather than a form here. */
  onNavigate: (page: string) => void;
}

export default function StepPanel(props: StepPanelProps) {
  const { stepId, state, companyId, userId, onSaved, onClose, onNavigate } = props;

  const [companyName, setCompanyName] = useState(state.companyName);
  const [industry, setIndustry] = useState(state.industryType ?? '');
  const [jurisdiction, setJurisdiction] = useState(state.jurisdiction ?? '');
  const [deptName, setDeptName] = useState('');
  const [modules, setModules] = useState<string[]>(state.modules);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('viewer');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (save: () => Promise<{ ok: boolean; message?: string }>, close = true) => {
    setBusy(true);
    setError(null);
    const r = await save();
    setBusy(false);
    if (!r.ok) {
      setError(r.message ?? 'Something went wrong.');
      return;
    }
    onSaved();
    if (close) onClose();
  };

  const body = () => {
    switch (stepId) {
      case 'company-details':
        return (
          <>
            <p style={help}>
              This is the name that appears on certificates of analysis and regulatory
              applications.
            </p>
            <label style={label} htmlFor="onb-company">Legal company name</label>
            <input
              id="onb-company"
              style={field}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Criateur Pharmaceuticals Limited"
              autoFocus
            />
            {/*  Said plainly rather than offered and discarded: there is
                nowhere to store either field yet.  */}
            <p style={{ ...help, marginTop: 12 }}>
              CAC registration number and head office are not stored yet — the company
              record holds a name only. They arrive with the schema change that adds them.
            </p>
            <Actions
              busy={busy}
              onSave={() => run(() => saveCompanyName(companyId, companyName))}
              onClose={onClose}
            />
          </>
        );

      case 'industry-region':
        return (
          <>
            <p style={help}>
              We pre-load the regulators, obligations, policies and risks that apply to
              this choice.
            </p>
            <label style={label} htmlFor="onb-industry">Industry</label>
            <select id="onb-industry" style={field} value={industry}
                    onChange={(e) => setIndustry(e.target.value)}>
              <option value="">Choose an industry…</option>
              {INDUSTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <div style={{ height: 16 }} />
            <label style={label} htmlFor="onb-region">Where you operate</label>
            <select id="onb-region" style={field} value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}>
              <option value="">Choose a region…</option>
              {JURISDICTION_IDS.map((j) => (
                <option key={j} value={j}>{JURISDICTION_LABELS[j]}</option>
              ))}
            </select>

            <Actions
              busy={busy}
              onSave={() => run(() => saveIndustryRegion(userId, industry, jurisdiction))}
              onClose={onClose}
            />
          </>
        );

      case 'sites-departments':
        return (
          <>
            <p style={help}>
              Departments raise records and drive document numbering. Add the ones that
              will use Criateur.
            </p>

            {state.departments.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, display: 'grid', gap: 8 }}>
                {state.departments.map((d) => (
                  <li key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 8,
                    background: 'var(--nv-surface-recessed)',
                    border: '1px solid var(--nv-border-default)',
                    color: 'var(--nv-text-primary)', fontSize: 14,
                  }}>
                    <span style={{ flex: '1 1 0' }}>{d.name}</span>
                    <button
                      type="button"
                      onClick={() => run(() => removeDepartment(d.id), false)}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        color: 'var(--nv-text-tertiary)', fontSize: 13,
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <label style={label} htmlFor="onb-dept">Add a department</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="onb-dept"
                style={field}
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="Quality Control"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && deptName.trim()) {
                    run(() => addDepartment(companyId, deptName), false).then(() => setDeptName(''));
                  }
                }}
                autoFocus
              />
              <NavyButton
                variant="outline"
                loading={busy}
                onClick={() => run(() => addDepartment(companyId, deptName), false).then(() => setDeptName(''))}
              >
                Add
              </NavyButton>
            </div>

            <p style={{ ...help, marginTop: 12 }}>
              Sites are not stored separately yet — there is no site record in the
              database. Departments carry the structure until there is.
            </p>

            <Actions busy={busy} onClose={onClose} doneLabel="Done" onSave={onClose} />
          </>
        );

      case 'modules':
        return (
          <>
            <p style={help}>
              Switch on only the parts you need. You can change this later in Company
              Settings.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {MODULE_DEFINITIONS.map((m) => {
                const on = modules.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setModules((cur) =>
                      cur.includes(m.key) ? cur.filter((k) => k !== m.key) : [...cur, m.key])}
                    style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left',
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      background: on ? 'var(--nv-surface-hover)' : 'var(--nv-surface-recessed)',
                      border: on
                        ? '1.5px solid var(--nv-action-primary-bg)'
                        : '1px solid var(--nv-border-default)',
                      color: 'var(--nv-text-primary)',
                      fontFamily: 'var(--nv-font-body)',
                    }}
                  >
                    <span aria-hidden="true" style={{
                      marginTop: 2, width: 18, height: 18, borderRadius: 5, flex: 'none',
                      display: 'grid', placeItems: 'center',
                      background: on ? 'var(--nv-action-primary-bg)' : 'transparent',
                      border: on ? 'none' : '1px solid var(--nv-border-strong)',
                      color: 'var(--nv-action-primary-text)', fontSize: 12, fontWeight: 700,
                    }}>{on ? '✓' : ''}</span>
                    <span>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{m.name}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--nv-text-secondary)' }}>
                        {m.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Actions
              busy={busy}
              onSave={() => run(() => saveModules(companyId, userId, modules))}
              onClose={onClose}
            />
          </>
        );

      case 'invite-team':
        //  Invites are issued HERE rather than by sending the person to
        //  the team screen. Bouncing out of onboarding into another
        //  part of the product, mid-flow, is how a setup gets abandoned
        //  — and the screen it landed on is the old design, which makes
        //  the new one look like a shell over it.
        return (
          <>
            <p style={help}>
              Add a colleague. Their role decides what they can approve, sign and release;
              the modules decide what they see. Both can be changed later.
            </p>

            <label style={label} htmlFor="onb-invite-email">Work email</label>
            <input
              id="onb-invite-email"
              type="email"
              style={field}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              autoFocus
            />

            <div style={{ height: 16 }} />
            <label style={label} htmlFor="onb-invite-role">Role</label>
            <select id="onb-invite-role" style={field} value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}>
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>
              ))}
            </select>

            <div style={{ height: 16 }} />
            <p style={{ ...label, marginBottom: 8 }}>What they can see</p>
            <div style={{ display: 'grid', gap: 6 }}>
              {MODULE_DEFINITIONS.map((m) => {
                const on = modules.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setModules((cur) =>
                      cur.includes(m.key) ? cur.filter((k) => k !== m.key) : [...cur, m.key])}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left',
                      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                      background: on ? 'var(--nv-surface-hover)' : 'var(--nv-surface-recessed)',
                      border: on
                        ? '1.5px solid var(--nv-action-primary-bg)'
                        : '1px solid var(--nv-border-default)',
                      color: 'var(--nv-text-primary)',
                      fontFamily: 'var(--nv-font-body)', fontSize: 13,
                    }}
                  >
                    <span aria-hidden="true" style={{
                      width: 16, height: 16, borderRadius: 4, flex: 'none',
                      display: 'grid', placeItems: 'center',
                      background: on ? 'var(--nv-action-primary-bg)' : 'transparent',
                      border: on ? 'none' : '1px solid var(--nv-border-strong)',
                      color: 'var(--nv-action-primary-text)', fontSize: 11, fontWeight: 700,
                    }}>{on ? '✓' : ''}</span>
                    {m.name}
                  </button>
                );
              })}
            </div>

            {/*  The link is shown because a workspace with no mail set up
                has no other way to deliver the invitation.  */}
            {inviteLink && (
              <div style={{ marginTop: 16 }}>
                <p style={{ ...help, margin: '0 0 6px' }}>
                  Invitation created. Send them this link — it expires in 72 hours.
                </p>
                <input
                  readOnly
                  value={inviteLink}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ ...field, fontFamily: 'var(--nv-font-mono)', fontSize: 12 }}
                />
              </div>
            )}

            <Actions
              busy={busy}
              doneLabel="Send invitation"
              onSave={() => {
                setBusy(true);
                setError(null);
                inviteTeammate(companyId, inviteEmail, inviteRole, modules).then((r) => {
                  setBusy(false);
                  if (!r.ok) { setError(r.message); return; }
                  setInviteLink(r.link ?? null);
                  setInviteEmail('');
                  onSaved();
                });
              }}
              onClose={onClose}
            />
          </>
        );

      case 'review-records':
        return (
          <>
            <p style={help}>
              Your industry and region pre-loaded a set of obligations, licences, policies
              and risks. Check them, and keep, edit or remove each one.
            </p>
            <Actions
              busy={busy}
              doneLabel="Review the records"
              onSave={() => onNavigate('obligations')}
              onClose={onClose}
            />
          </>
        );

      default:
        return <p style={help}>This step has nothing to fill in yet.</p>;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'grid', placeItems: 'center',
        padding: 16,
        background: 'rgba(8, 14, 32, 0.72)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto',
        padding: 24, borderRadius: 'var(--nv-radius-card)',
        background: 'var(--nv-surface-raised)',
        border: '1px solid var(--nv-border-strong)',
        fontFamily: 'var(--nv-font-body)',
      }}>
        {body()}
        {error && (
          <p role="alert" style={{
            margin: '14px 0 0', fontSize: 13, lineHeight: '19px', color: '#ffb4a6',
          }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

const help: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: 14, lineHeight: '21px',
  color: 'var(--nv-text-secondary)',
};

function Actions({
  busy, onSave, onClose, doneLabel = 'Save and continue',
}: {
  busy: boolean; onSave?: () => void; onClose: () => void; doneLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 24 }}>
      {onSave && (
        <NavyButton loading={busy} onClick={onSave}>{doneLabel}</NavyButton>
      )}
      <NavyButton variant="ghost" onClick={onClose}>Close</NavyButton>
    </div>
  );
}
