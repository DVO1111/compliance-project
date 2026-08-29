/**
 * Shared chrome for the sign-in and sign-up screens.
 *
 * These two pages are the seam between the marketing site and the product,
 * and they used to look like neither: a shield glyph instead of the mark,
 * and the old Behance blue instead of the brand green. They now sit inside
 * `.lp-root` and draw on the same tokens as the landing page, so someone who
 * clicks "Sign Up" in the nav lands somewhere that looks like where they
 * came from. No new colours are introduced here — every value below is a
 * token already defined in pages/landing/shell.tsx.
 */

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { MarketingStyles, LOGO_ON_DARK } from '../../pages/landing/shell';

export default function AuthShell({
  tagline, formTitle, onBackToLanding, children, footer,
}: {
  /** The line under the wordmark — what this product is, or what this step is. */
  tagline: string;
  /** Names the form itself, so the card is self-identifying. */
  formTitle: string;
  onBackToLanding?: () => void;
  children: ReactNode;
  /** The "already have an account?" line beneath the card. */
  footer?: ReactNode;
}) {
  return (
    <div className="lp-root min-h-screen relative overflow-hidden" style={{ background: 'var(--lp-bg)' }}>
      <MarketingStyles />

      {/* The landing hero's ambient glow, held still — an auth form is not a
          place to animate anything behind the fields. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          className="absolute -top-48 left-1/2 -translate-x-1/2 w-[720px] h-[720px] rounded-full"
          style={{
            filter: 'blur(150px)',
            background: 'radial-gradient(closest-side, rgba(71,141,75,0.30), transparent 72%)',
          }}
        />
      </div>

      {onBackToLanding && (
        <button
          onClick={onBackToLanding}
          className="absolute top-5 left-5 sm:top-6 sm:left-6 z-20 inline-flex items-center gap-2 text-sm sm:text-[0.9375rem] transition hover:opacity-80"
          style={{ color: 'var(--lp-t2)' }}
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          Back to home
        </button>
      )}

      {/* pt-20 keeps the brand block clear of the Back to home control on the
          short viewports where the two would otherwise collide. */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 pt-20 pb-12">
        <img
          src={LOGO_ON_DARK}
          alt="Criateur"
          className="h-11 sm:h-[52px] w-auto max-w-full block"
        />
        <p
          className="text-center lp-small"
          style={{ marginTop: 14, marginBottom: 26, maxWidth: '34ch' }}
        >
          {tagline}
        </p>

        <div
          className="w-full max-w-md rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--lp-line-strong)',
            padding: 'clamp(22px, 5vw, 34px)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.38)',
          }}
        >
          <h1 className="lp-h3" style={{ fontSize: '1.375rem', marginBottom: 22 }}>{formTitle}</h1>
          {children}
        </div>

        {footer && <div className="mt-7 text-center lp-small">{footer}</div>}
      </div>
    </div>
  );
}

/** The green text button used for the cross-links between the two pages. */
export function AuthLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="font-semibold transition hover:opacity-80"
      style={{ color: 'var(--lp-accent)' }}
    >
      {children}
    </button>
  );
}

/** A banner for the error and info states, tinted by role. */
export function AuthNotice({ tone, children }: { tone: 'error' | 'info'; children: ReactNode }) {
  const palette = tone === 'error'
    ? { background: 'rgba(255,140,122,0.10)', border: 'rgba(255,140,122,0.30)', color: 'var(--lp-coral)' }
    : { background: 'var(--lp-accent-soft)', border: 'var(--lp-accent-line)', color: 'var(--lp-accent)' };

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="px-4 py-3 rounded-lg text-sm mb-5"
      style={{ background: palette.background, border: `1px solid ${palette.border}`, color: palette.color }}
    >
      {children}
    </div>
  );
}
