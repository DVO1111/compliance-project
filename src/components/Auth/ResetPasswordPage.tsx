import { useState, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AuthShell, { AuthNotice, AuthField } from './AuthShell';
import { appUrl } from '../../lib/routing';

/**
 * Where the emailed reset link lands.
 *
 * Not one of the four states in the login design — the design covers
 * requesting a reset, not finishing one. It exists because without it the
 * design's "Forgot password?" link would send an email whose link opens the
 * app with a recovery session and no way to set a password, which is worse
 * than not offering the link at all.
 *
 * So the chrome is AuthShell and the copy follows the same voice, but the
 * wording here is mine rather than the designer's. Worth flagging if this
 * screen gets a design later.
 *
 * WHY IT IS A GATE, NOT A FORM
 * ----------------------------
 * A recovery link signs the user in. At this point they hold a real session
 * without having proved they know a password, so `isRecoveringPassword` in
 * AuthContext keeps the app on this screen until the password is saved or
 * they sign out. Rendering the product behind the form would hand out
 * access to anyone with one look at the mailbox.
 */
export default function ResetPasswordPage({ initialSetup = false }: { initialSetup?: boolean }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoverySending, setRecoverySending] = useState(false);
  const { completePasswordReset, requestPasswordReset, signOut, user } = useAuth();

  //  Supabase's own default minimum. Checked here so the failure is
  //  immediate and next to the field, rather than a round trip.
  const MIN_LENGTH = 6;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } = await completePasswordReset(password);
    setLoading(false);

    if (error) {
      //  The commonest real failure is an expired link: the session the
      //  email opened has already lapsed, so updateUser is rejected.
      setError(
        /session|jwt|expired|token/i.test(error.message)
          ? 'That reset link has expired. Request a new one from the sign-in page.'
          : error.message
      );
    } else if (initialSetup) {
      window.location.replace(appUrl('/portal'));
    }
    //  On success the flag clears in the context and the app renders
    //  normally — there is nothing to navigate to.
  };

  const handleSendRecovery = async (e: FormEvent) => {
    e.preventDefault();
    setRecoverySending(true);
    setError('');
    const { error: recoveryError } = await requestPasswordReset(recoveryEmail.trim());
    setRecoverySending(false);
    if (recoveryError) {
      setError('We could not send a password link. Please try again or contact your administrator.');
      return;
    }
    setRecoverySent(true);
  };

  return (
    <AuthShell
      kicker={initialSetup ? 'Account setup' : 'Reset password'}
      heading={initialSetup ? 'Choose your password.' : 'Choose a new password.'}
      description={initialSetup
        ? 'Set a password to finish creating your account. You will continue to workspace setup next.'
        : 'You followed a reset link, so set a password to finish signing in.'}
    >
      {!user ? (
        <>
          <AuthNotice tone="error">{initialSetup
            ? 'This invitation link has already been used or did not establish a session. Request a fresh password link below.'
            : 'This password link did not establish a session. Request a fresh link below.'}</AuthNotice>
          {recoverySent ? (
            <AuthNotice tone="info">If that address has an account, a password link is on its way. Check your inbox and spam folder.</AuthNotice>
          ) : (
            <form onSubmit={handleSendRecovery} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <AuthField id="setup-recovery-email" label="Email address used for the invitation">
                <input
                  type="email"
                  id="setup-recovery-email"
                  value={recoveryEmail}
                  onChange={(event) => setRecoveryEmail(event.target.value)}
                  className="lp-field lp-field--sunken"
                  autoComplete="email"
                  required
                />
              </AuthField>
              <button type="submit" disabled={recoverySending} className="lp-btn lp-btn--primary lp-btn--block" style={{ minHeight: 50 }}>
                {recoverySending ? 'Sending…' : 'Email me a password link'}
              </button>
            </form>
          )}
        </>
      ) : null}
      {error && <AuthNotice tone="error">{error}</AuthNotice>}

      {user && <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <AuthField id="new-password" label="New password">
          <span style={{ position: 'relative', display: 'block' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              id="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="lp-field lp-field--sunken"
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              required
              style={{ paddingRight: 70 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--lp-t3)',
                fontFamily: 'var(--lp-font-mono)',
                fontSize: 10.5,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </span>
        </AuthField>

        <AuthField id="confirm-password" label="Confirm new password">
          <input
            //  Always masked: the point of the second field is to catch a
            //  typo in the first, which it cannot do if both are revealed
            //  by the same control.
            type="password"
            id="confirm-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="lp-field lp-field--sunken"
            placeholder="••••••••"
            autoComplete="new-password"
            required
          />
        </AuthField>

        <button
          type="submit"
          disabled={loading}
          className="lp-btn lp-btn--primary lp-btn--block"
          style={{ marginTop: 6, minHeight: 50, ...(loading ? { opacity: 0.7 } : null) }}
        >
          {loading ? 'Saving…' : initialSetup ? 'Set password and continue' : 'Save password and continue'}
        </button>
      </form>}

      {/*  The only way out that does not set a password. Signing out drops
          the recovery session, which is the correct exit — leaving it open
          would leave the account reachable from the mailbox. */}
      {user && <button
        type="button"
        onClick={() => void signOut()}
        className="transition hover:opacity-80"
        style={{
          marginTop: 22,
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: 'var(--lp-accent)',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        ← Cancel and sign out
      </button>}
    </AuthShell>
  );
}
