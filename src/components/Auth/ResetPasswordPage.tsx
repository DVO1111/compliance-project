import { useState, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AuthShell, { AuthNotice, AuthField } from './AuthShell';

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
export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { completePasswordReset, signOut } = useAuth();

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
    }
    //  On success the flag clears in the context and the app renders
    //  normally — there is nothing to navigate to.
  };

  return (
    <AuthShell
      kicker="Reset password"
      heading="Choose a new password."
      description="You followed a reset link, so set a password to finish signing in."
    >
      {error && <AuthNotice tone="error">{error}</AuthNotice>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
          {loading ? 'Saving…' : 'Save password and continue'}
        </button>
      </form>

      {/*  The only way out that does not set a password. Signing out drops
          the recovery session, which is the correct exit — leaving it open
          would leave the account reachable from the mailbox. */}
      <button
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
      </button>
    </AuthShell>
  );
}
