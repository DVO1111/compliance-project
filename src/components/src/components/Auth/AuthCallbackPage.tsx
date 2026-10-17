import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AuthShell, { AuthNotice } from './AuthShell';

type CallbackStatus = 'loading' | 'error';

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [message, setMessage] = useState('Verifying your link…');

  useEffect(() => {
    let cancelled = false;

    async function verifyCallback() {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const type = params.get('type');

      if (
        !tokenHash ||
        (type !== 'invite' && type !== 'recovery')
      ) {
        setStatus('error');
        setMessage(
          'This link is invalid or incomplete. Request a fresh password link.'
        );
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (cancelled) return;

      if (error) {
        setStatus('error');
        setMessage(
          'This link may have expired or already been used. Request a fresh link and try again.'
        );
        return;
      }

      // Remove the one-time token from the browser address bar.
      // The verified session is now managed by Supabase.
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      window.location.replace(
        type === 'invite' ? '/?setup=1' : '/?recovery=1'
      );
    }

    void verifyCallback().catch(() => {
      if (cancelled) return;

      setStatus('error');
      setMessage(
        'We could not verify this link. Please request a fresh one.'
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthShell
      kicker="Account security"
      heading={status === 'loading' ? 'Verifying your link.' : 'Link verification failed.'}
      description={
        status === 'loading'
          ? 'Please wait while we securely verify your email link.'
          : 'You can return to the sign-in page and request another link.'
      }
    >
      {status === 'loading' ? (
        <p role="status">{message}</p>
      ) : (
        <>
          <AuthNotice tone="error">{message}</AuthNotice>
          <a href="/portal">Return to sign in</a>
        </>
      )}
    </AuthShell>
  );
}
