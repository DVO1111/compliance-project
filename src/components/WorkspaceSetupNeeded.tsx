/**
 * Signed in, but the product has no record of you.
 *
 * WHAT THIS REPLACES. A spinner, the sentence "Setting up your account…
 * If this doesn't finish, your sign-up may not have been verified", and
 * a sign-out link. Nothing was being set up: the profile row did not
 * exist and nothing in the application could create one. The spinner
 * turned forever and the only exit was leaving.
 *
 * The one screen that might have helped — OnboardingCompany — called an
 * RPC named create_company_and_set_owner that exists in no migration, so
 * it failed too, and it was only reachable for someone who already had a
 * profile.
 *
 * So this asks the one question that is actually needed and does the
 * work: create the company, provision the profile, land on onboarding.
 * It also shows the real reason when the profile failed to load for some
 * other cause, because "your sign-up may not have been verified" was a
 * guess, and a guess on a dead end is worse than silence.
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { appUrl } from '../lib/routing';
import NavyButton from './Onboarding/navy/NavyButton';

export default function WorkspaceSetupNeeded() {
  const { user, profileLoadError, provisionWorkspace, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  //  NO_PROFILE is this app's own marker for "the query worked and there
  //  is no row". Anything else is a real database error and belongs on
  //  screen verbatim.
  const missingProfile = profileLoadError === 'NO_PROFILE' || profileLoadError === null;
  const databaseError = profileLoadError && profileLoadError !== 'NO_PROFILE'
    ? profileLoadError
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await provisionWorkspace(name);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    await refreshProfile();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--onboarding-glow)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      fontFamily: 'var(--nv-font-body)',
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <img src={appUrl("/criateur-logo-ondark.svg")} alt="Criateur"
             style={{ width: 132, height: 'auto', marginBottom: 28 }} />

        <h1 style={{
          margin: '0 0 10px',
          fontFamily: 'var(--nv-font-display)', fontWeight: 600,
          fontSize: 24, lineHeight: '30px',
          color: 'var(--nv-text-primary)',
        }}>
          Let’s create your workspace
        </h1>

        <p style={{
          margin: '0 0 24px',
          fontSize: 14, lineHeight: '21px',
          color: 'var(--nv-text-secondary)',
        }}>
          {user?.email ? <>You’re signed in as <strong>{user.email}</strong>. </> : null}
          {databaseError
            ? 'Your workspace could not be opened. The reason is below.'
            : 'There is no workspace on this account yet. Name your company and we’ll set it up — you’ll be its owner.'}
        </p>

        {databaseError && (
          <pre style={{
            margin: '0 0 20px', padding: '12px 14px', borderRadius: 8,
            background: 'var(--nv-surface-raised)',
            border: '1px solid var(--nv-border-strong)',
            color: 'var(--nv-text-tertiary)',
            fontFamily: 'var(--nv-font-mono)', fontSize: 12, lineHeight: '18px',
            whiteSpace: 'pre-wrap', overflowX: 'auto',
          }}>
            {databaseError}
          </pre>
        )}

        {missingProfile && (
          <form onSubmit={submit}>
            <label
              htmlFor="ws-name"
              style={{
                display: 'block', marginBottom: 6,
                fontFamily: 'var(--nv-font-mono)', fontWeight: 500,
                fontSize: 11, lineHeight: '16px', letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--nv-text-tertiary)',
              }}
            >
              Company name
            </label>
            <input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Criateur Pharmaceuticals Limited"
              autoFocus
              style={{
                width: '100%', height: 'var(--nv-control-height)',
                padding: '0 12px', boxSizing: 'border-box',
                borderRadius: 'var(--nv-radius-control)',
                background: 'var(--nv-field-bg)',
                border: '1px solid var(--nv-field-border)',
                color: 'var(--nv-text-primary)',
                fontFamily: 'var(--nv-font-body)', fontSize: 14,
              }}
            />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
              <NavyButton type="submit" loading={busy}>Create workspace</NavyButton>
              <NavyButton variant="ghost" type="button" onClick={() => refreshProfile()}>
                Try again
              </NavyButton>
            </div>
          </form>
        )}

        {!missingProfile && (
          <NavyButton onClick={() => refreshProfile()}>Try again</NavyButton>
        )}

        {error && (
          <p role="alert" style={{
            margin: '16px 0 0', fontSize: 13, lineHeight: '19px', color: '#ffb4a6',
          }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => signOut()}
          style={{
            marginTop: 28, background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', font: 'inherit', fontSize: 13,
            color: 'var(--nv-text-tertiary)', textDecoration: 'underline',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
