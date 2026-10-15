/**
 * The full-screen state the app shows before it can show anything else:
 * while the session is being restored, while a profile is provisioning,
 * and behind the invite flow.
 *
 * IT IS DRAWN IN THE BRAND'S OWN COLOURS, which is the whole point of
 * it being one component. The three screens that needed this each
 * carried their own `bg-gradient-to-br from-[#002D62] to-[#00A86B]` — a
 * navy and a green that appear nowhere in the brand asset:
 *
 *     public/criateur-logo-ondark.svg   mark   #478d4b → #1e5620
 *                                       word   #fbf9f5
 *     public/criateur-logo-light.svg    ground #0d1933
 *
 * #00A86B is 20° around the wheel from the mark's #478d4b and far more
 * saturated; #002D62 is a different navy from the asset's #0d1933. So
 * the first screen of the product was the one place it did not look like
 * itself. The spinner is the mark's own green.
 *
 * THE GROUND IS THE SIGN-IN SCREEN'S, not the onboarding one. This is
 * what shows while the session is restored, and the screen it hands
 * over to is almost always sign-in — so carrying the navy onboarding
 * glow meant the product opened in one palette and switched to another
 * the moment the form drew. Both now read --auth-glow.
 *
 * `tone` exists for the one case where that is wrong: the holds BETWEEN
 * onboarding steps, which sit navy-to-navy. Flashing green in the
 * middle of the flow would be the same mismatch in reverse.
 *
 * The logo is rendered at 140 px with its intrinsic ratio, above the
 * Primary Logo minimum of 76 px.
 */

import type { ReactNode } from 'react';
import { appUrl } from '../lib/routing';

export interface BrandSplashProps {
  /** Shown under the spinner. Omitted on the plain loading state, where
   *  a line of text would only flash. */
  message?: ReactNode;
  /** An escape hatch, e.g. "Sign out and try again". */
  action?: ReactNode;
  /** 'auth' (the default) for the way in; 'onboarding' for a hold
   *  between two onboarding steps, which are navy on both sides. */
  tone?: 'auth' | 'onboarding';
}

export default function BrandSplash({ message, action, tone = 'auth' }: BrandSplashProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: tone === 'onboarding' ? 'var(--onboarding-glow)' : 'var(--auth-glow)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        paddingLeft: 'var(--nv-gutter-mobile)',
        paddingRight: 'var(--nv-gutter-mobile)',
        textAlign: 'center',
        fontFamily: 'var(--nv-font-body)',
      }}
    >
      <img
        src={appUrl("/criateur-logo-ondark.svg")}
        alt="Criateur"
        style={{ width: 140, height: 'auto' }}
      />

      {/*  A 270° arc in the mark's green, matching the button spinner
          rather than inventing a second one. role=status so a screen
          reader is told the app is working instead of silence.  */}
      <svg
        width="32" height="32" viewBox="0 0 32 32"
        className="navy-btn-spinner"
        role="status"
        aria-label="Loading"
        style={{ color: '#478d4b' }}
      >
        <circle
          cx="16" cy="16" r="13" fill="none"
          stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          /*  2πr ≈ 81.68; 270° is three quarters of it.  */
          strokeDasharray="61.26 20.42"
        />
      </svg>

      {message && (
        <p style={{
          margin: 0, maxWidth: 420,
          fontSize: 14, lineHeight: '20px',
          color: 'var(--nv-text-secondary)',
        }}>
          {message}
        </p>
      )}

      {action}
    </div>
  );
}
