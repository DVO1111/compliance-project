import { useState, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AuthShell, {
  AuthLink,
  AuthNotice,
  AuthBackButton,
  AuthField,
} from './AuthShell';

interface LoginPageProps {
  /** Kept for the invite flow and for when self-serve signup opens; the
   *  public sign-in screen no longer offers it. */
  onToggleSignup: () => void;
  /** Sends someone who has no account to the waitlist form instead. */
  onRequestAccess: () => void;
  onBackToLanding?: () => void;
}

/**
 * Sign-in, built from the Criateur Login design.
 *
 * THE DESIGN HAS FOUR STATES; THIS BUILDS THREE
 * ---------------------------------------------
 * Sign in, Reset password and Check your inbox are all here. The fourth —
 * "Step 2 of 2 / Confirm it's you / Enter the 6-digit code from your
 * authenticator app" — is deliberately absent, because the product cannot
 * do it. `supabase/config.toml` has
 *
 *     [auth.mfa.totp]
 *     enroll_enabled = false
 *     verify_enabled = false
 *
 * nothing in the codebase enrols a factor, and no challenge is ever
 * issued. A second-factor screen on a compliance product that does not
 * actually hold a second factor would assert a control that is not there,
 * which is the one thing this repository's own stated principles rule out.
 * Turning it on is real work — enrolment, recovery codes, an enforcement
 * policy and a migration — not a screen.
 *
 * The design's "Sign in with company SSO" button is likewise left out: it
 * sits behind the design's own `showSso` flag, and no SSO or OAuth provider
 * is wired. An outlined button that cannot sign anybody in is worse than
 * no button.
 *
 * No "create an account" link while the product is in pilot. Accounts are
 * provisioned by invitation, and an invited user reaches the signup form by
 * their own invite route, so closing this one strands nobody.
 */
type Mode = 'signin' | 'forgot' | 'sent';

export default function LoginPage({ onRequestAccess, onBackToLanding }: LoginPageProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, requestPasswordReset } = useAuth();

  /** Moving between states must not carry an error or a spinner with it. */
  const go = (next: Mode) => {
    setError('');
    setLoading(false);
    setMode(next);
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);
    if (error) setError(error.message);

    setLoading(false);
  };

  const handleSendReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await requestPasswordReset(email);
    setLoading(false);

    //  Only a transport failure stops us; an address with no account still
    //  advances, and the next screen's wording is written not to confirm
    //  either way.
    if (error) {
      setError('We could not send the reset email just now. Please try again.');
      return;
    }
    go('sent');
  };

  // ── Reset requested ───────────────────────────────────────────────
  if (mode === 'sent') {
    return (
      <AuthShell
        //  No kicker here: the design's confirmation state opens with the
        //  envelope rather than a label, so `media` carries it above the
        //  heading and the mono line is absent by design.
        media={
          <span
            aria-hidden="true"
            style={{
              width: 46,
              height: 46,
              borderRadius: 10,
              background: 'rgba(18,160,90,0.18)',
              border: '1px solid rgba(18,160,90,0.42)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 22,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--lp-mint)" strokeWidth="1.8">
              <rect x="2.5" y="5" width="19" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
          </span>
        }
        heading="Check your inbox."
        //  Deliberately says nothing about whether the address exists. The
        //  form would otherwise answer "does this person work here?" to
        //  anyone who asked.
        description="If that email has a Criateur account, a reset link is on its way. It expires in 30 minutes."
        onBackToLanding={onBackToLanding}
      >
        <button
          type="button"
          onClick={() => go('signin')}
          className="lp-btn lp-btn--ghost lp-btn--block"
          style={{ minHeight: 50 }}
        >
          Back to sign in
        </button>
      </AuthShell>
    );
  }

  // ── Request a reset ───────────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <AuthShell
        kicker="Reset password"
        heading="Reset your password."
        description="Enter your work email and we'll send you a reset link."
        onBackToLanding={onBackToLanding}
      >
        {error && <AuthNotice tone="error">{error}</AuthNotice>}

        <form onSubmit={handleSendReset} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <AuthField id="reset-email" label="Work email">
            <input
              type="email"
              id="reset-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="lp-field lp-field--sunken"
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </AuthField>

          <button
            type="submit"
            disabled={loading}
            className="lp-btn lp-btn--primary lp-btn--block"
            style={{ marginTop: 6, minHeight: 50, ...(loading ? { opacity: 0.7 } : null) }}
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <AuthBackButton onClick={() => go('signin')}>← Back to sign in</AuthBackButton>
      </AuthShell>
    );
  }

  // ── Sign in ───────────────────────────────────────────────────────
  return (
    <AuthShell
      kicker="Sign in"
      heading="Welcome back."
      description="Sign in to your facility's workspace."
      onBackToLanding={onBackToLanding}
      footer={
        <>
          Not on Criateur yet?{' '}
          <AuthLink onClick={onRequestAccess}>Join the Waitlist</AuthLink>
        </>
      }
    >
      {error && <AuthNotice tone="error">{error}</AuthNotice>}

      <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <AuthField id="email" label="Work email">
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="lp-field lp-field--sunken"
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </AuthField>

        <AuthField
          id="password"
          label="Password"
          trailing={
            <button
              type="button"
              onClick={() => go('forgot')}
              className="transition hover:opacity-80"
              style={{
                fontSize: 13,
                color: 'var(--lp-accent)',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Forgot password?
            </button>
          }
        >
          <span style={{ position: 'relative', display: 'block' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="lp-field lp-field--sunken"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              //  Room for the reveal control, which sits inside the field.
              style={{ paddingRight: 70 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              //  The control's own label has to say what it does, not what
              //  the field currently shows, or a screen reader announces the
              //  opposite of the action.
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

        <button
          type="submit"
          disabled={loading}
          className="lp-btn lp-btn--primary lp-btn--block"
          style={{
            marginTop: 6,
            minHeight: 50,
            //  The design's lift under the primary action.
            boxShadow: '0 0 0 5px rgba(71,141,75,0.14), 0 16px 34px -16px rgba(71,141,75,0.6)',
            ...(loading ? { opacity: 0.7 } : null),
          }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
