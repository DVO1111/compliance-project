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
import type { SetupState } from '../../../lib/onboarding/setupSteps';
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
      //  'company-details' and 'industry-region' are NOT here. They are
      //  ONB-01 and ONB-02, full screens of their own with their own
      //  step counters and footers, routed before this panel is ever
      //  reached (see SetupHubGate). Leaving stubs for them here would
      //  be a second, worse definition of the same two steps — which is
      //  exactly the duplication that put the old wizard in front of
      //  the new hub.
      //  'sites-departments' is not here either: ONB-03 is a full
      //  screen with its own four cards, and the panel that used to
      //  stand in for it could store a department name and nothing
      //  else — no site, no code, no categories.
      //  'modules' and 'invite-team' are not here either. ONB-04 and
      //  ONB-05 are full screens: step 4 filters the areas by industry
      //  and has three sections including one that is deliberately not
      //  switchable, and step 5 collects a role, sites and signing
      //  authority per person. The panel versions could store a module
      //  key and an email address, which is not the same step.
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
