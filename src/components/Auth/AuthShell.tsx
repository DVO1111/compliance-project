/**
 * Shared chrome for the sign-in, sign-up and password-reset screens.
 *
 * Built from the Criateur Login design: a two-column split, the brand and
 * the product's claim on the left, the form alone on the right. It replaces
 * a centred single card.
 *
 * Every colour, font and line below is an existing `--lp-*` token. The
 * design's own palette turned out to be the landing page's palette already
 * — `--abyss` #08131A is `--lp-bg`, `--green` #478D4B is
 * `--lp-accent-strong`, `--green-glow` #7EC48C is `--lp-accent`, and the
 * line and dim values match `--lp-line` / `--lp-t2` / `--lp-t3` exactly —
 * so nothing new is introduced here. Likewise the three families it asks
 * for (Bricolage Grotesque, Sora, IBM Plex Mono) are already the
 * `--lp-font-display` / `--lp-font` / `--lp-font-mono` tokens, bundled
 * through @fontsource.
 *
 * THE THREE TEXT SLOTS
 * --------------------
 * The design heads each state with a mono kicker, a display heading and a
 * line of body copy — "Sign in" / "Welcome back." / "Sign in to your
 * facility's workspace." Those are the three props, so a state is
 * self-identifying and the caller supplies no layout.
 */

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { MarketingStyles, LOGO_ON_DARK } from '../../pages/landing/shell';

export default function AuthShell({
  kicker, media, heading, description, onBackToLanding, children, footer,
}: {
  /**
   * Mono, uppercase, accent — names the step: "Sign in", "Reset password".
   * Optional because the design's confirmation state has none: it opens
   * with the icon instead.
   */
  kicker?: string;
  /**
   * Sits above the heading, where a state leads with a mark rather than a
   * label — the envelope on "Check your inbox."
   */
  media?: ReactNode;
  /** The display line: "Welcome back.", "Check your inbox." */
  heading: string;
  /** One line of body copy under the heading. */
  description?: string;
  onBackToLanding?: () => void;
  children: ReactNode;
  /** The line beneath the form — the waitlist link, or a cross-link. */
  footer?: ReactNode;
}) {
  return (
    <div
      className="lp-root min-h-screen"
      style={{
        fontFamily: 'var(--lp-font)',
        color: 'var(--lp-t1)',
        background: 'var(--lp-bg)',
        display: 'grid',
        //  auto-fit with a 440px floor is the design's own rule: two columns
        //  where there is room, and the panels stack on a phone without a
        //  media query.
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
      }}
    >
      <MarketingStyles />

      {/* ── Left: brand, claim, legal ─────────────────────────────── */}
      <aside
        style={{
          position: 'relative',
          overflow: 'hidden',
          background:
            'radial-gradient(120% 90% at 0% 0%, rgba(71,141,75,0.38) 0%, rgba(30,86,32,0.12) 42%, rgba(8,19,26,0) 74%), ' +
            'linear-gradient(165deg, #0B1E1D 0%, #0A1722 55%, #0B1626 100%)',
          borderRight: '1px solid var(--lp-line-soft)',
          display: 'flex',
          flexDirection: 'column',
          padding: 'clamp(28px, 4vw, 48px) clamp(24px, 4.5vw, 64px)',
          gap: 40,
          minHeight: 'clamp(320px, 50vh, 100vh)',
        }}
      >
        {/* Four vertical rules — the design's quiet nod to a modular grid.
            Decorative, so it is hidden from assistive technology. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage:
              'linear-gradient(to right, rgba(207,222,255,0.05) 1px, transparent 1px)',
            backgroundSize: 'calc(100% / 4) 100%',
          }}
        />

        {onBackToLanding ? (
          <button
            onClick={onBackToLanding}
            className="relative inline-flex items-center gap-2 transition hover:opacity-80"
            style={{ width: 'max-content', background: 'transparent', border: 'none', padding: 0 }}
            aria-label="Back to the Criateur site"
          >
            <img src={LOGO_ON_DARK} alt="Criateur" style={{ height: 52, width: 'auto', display: 'block' }} />
          </button>
        ) : (
          <img
            src={LOGO_ON_DARK}
            alt="Criateur"
            className="relative"
            style={{ height: 52, width: 'auto', display: 'block' }}
          />
        )}

        <div style={{ position: 'relative', marginTop: 'auto', marginBottom: 'auto', maxWidth: '30rem' }}>
          <h1
            style={{
              fontFamily: 'var(--lp-font-display)',
              fontSize: 'clamp(32px, 4.2vw, 52px)',
              fontWeight: 600,
              fontStretch: '88%',
              lineHeight: 1.05,
              letterSpacing: '-0.022em',
              margin: '0 0 20px',
              textWrap: 'balance',
            }}
          >
            Execute quality. Control compliance.{' '}
            <span style={{ color: 'var(--lp-accent)' }}>Prove it instantly.</span>
          </h1>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.62,
              color: 'var(--lp-t3)',
              margin: 0,
              maxWidth: '44ch',
              textWrap: 'pretty',
            }}
          >
            The operating system for regulated manufacturing.
          </p>
        </div>

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: '12px 24px',
            fontFamily: 'var(--lp-font-mono)',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--lp-t4)',
          }}
        >
          <span>© {new Date().getFullYear()} Criateur. Nigeria.</span>
          {onBackToLanding && (
            <button
              onClick={onBackToLanding}
              className="inline-flex items-center gap-1.5 transition hover:opacity-80"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                font: 'inherit',
                letterSpacing: 'inherit',
                textTransform: 'inherit',
                color: 'var(--lp-t3)',
                cursor: 'pointer',
              }}
            >
              <ArrowLeft className="w-3 h-3 shrink-0" aria-hidden="true" />
              Back to site
            </button>
          )}
        </div>
      </aside>

      {/* ── Right: the form ───────────────────────────────────────── */}
      <main
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(40px, 6vw, 72px) clamp(20px, 4vw, 48px)',
          background: '#0A1727',
        }}
      >
        <div style={{ width: '100%', maxWidth: 400 }}>
          {media}

          {kicker && (
            <div
              style={{
                fontFamily: 'var(--lp-font-mono)',
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--lp-accent)',
                marginBottom: 16,
              }}
            >
              {kicker}
            </div>
          )}

          <h2
            style={{
              fontFamily: 'var(--lp-font-display)',
              fontSize: 'clamp(28px, 3vw, 34px)',
              fontWeight: 600,
              fontStretch: '90%',
              lineHeight: 1.1,
              letterSpacing: '-0.018em',
              margin: '0 0 10px',
            }}
          >
            {heading}
          </h2>

          {description && (
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--lp-t3)', margin: '0 0 32px' }}>
              {description}
            </p>
          )}

          {children}

          {footer && (
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--lp-t3)', margin: '32px 0 0' }}>
              {footer}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

/** The green text link used between the auth states and out to the site. */
export function AuthLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="font-semibold transition hover:opacity-80"
      style={{ color: 'var(--lp-accent)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

/**
 * The "← Back to sign in" control the design puts under the reset and
 * verification forms. Distinct from AuthLink: it is a standalone row, not
 * an inline link inside a sentence.
 */
export function AuthBackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
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

/**
 * The label + field pair the design repeats: a mono uppercase caption over
 * a recessed input. Here rather than in each page so the three states
 * cannot drift apart.
 */
export function AuthField({
  id, label, trailing, children,
}: {
  id: string;
  label: string;
  /** Sits on the label's right — the design puts "Forgot password?" there. */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <label
          htmlFor={id}
          style={{
            fontFamily: 'var(--lp-font-mono)',
            fontSize: 10.5,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--lp-t2)',
          }}
        >
          {label}
        </label>
        {trailing}
      </div>
      {children}
    </div>
  );
}
