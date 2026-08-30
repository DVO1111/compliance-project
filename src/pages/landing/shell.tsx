/**
 * Shared chrome for the marketing pages.
 *
 * Everything here is scoped to `.lp-root`, so the marketing site carries its
 * own identity without touching the app theme in index.css. The landing page
 * owned all of this until there was a second page to serve; it lives here now
 * so the palette, type scale and navigation stay in one place rather than
 * drifting apart across pages.
 *
 * Palette: a deep navy ground rather than black — dark enough for the product
 * screenshots to sit on, light enough to read comfortably for a full scroll.
 * Greys are blue-tinted so they belong to the navy instead of sitting on top
 * of it as neutral haze.
 */

import { motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';

/** The marketing pages, matching the copy deck's site map exactly. */
export type MarketingPage = 'home' | 'platform' | 'who' | 'about' | 'contact';

/* ── Framer Motion section wrapper ────────────── */
const sectionVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

export function MotionWrap({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Section wrapper ──────────────────────────────
   `tone="raised"` paints a slightly lighter band so the page reads as
   stacked surfaces rather than one flat slab of navy. */
export function Section({
  id, className = '', tone = 'base', children,
}: {
  id?: string;
  className?: string;
  tone?: 'base' | 'raised';
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`lp-section ${tone === 'raised' ? 'lp-section--raised' : ''} ${className}`}>
      <div className="lp-container">{children}</div>
    </section>
  );
}

/** Marketing pages swap by remounting, which leaves the window scrolled
 *  wherever the previous page was. */
export function useScrollToTopOnMount() {
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
}

/** Scroll to an anchor on the page you are already on. */
export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export interface NavLink {
  label: string;
  onClick: () => void;
  /** Marks the link for the page currently being viewed. */
  active?: boolean;
}

/* ── Brand ────────────────────────────────────────
   The supplied artwork, two cuts: the on-dark lockup for the site itself,
   and the light one for the paper surfaces (the batch record in the hero),
   where the navy wordmark is legible. Raster, as supplied — swap both for
   SVG when vector versions exist and nothing else needs to change. */
export const LOGO_ON_DARK = '/criateur-logo-ondark.png';
export const LOGO_LIGHT = '/criateur-logo-light.png';

export function BrandLockup({
  onClick, height = 40,
}: {
  onClick?: () => void;
  height?: number;
}) {
  const img = (
    <img
      src={LOGO_ON_DARK}
      alt="Criateur"
      style={{ height, width: 'auto', display: 'block' }}
    />
  );
  if (!onClick) return img;
  return (
    <button onClick={onClick} aria-label="Criateur home" style={{ display: 'block', flexShrink: 0 }}>
      {img}
    </button>
  );
}

/* ── Navigation ───────────────────────────────
   The design floats the links in their own bordered capsule between the
   mark and the CTA, so the nav reads as one control rather than a rule
   across the top. */
export function MarketingNav({
  links, onHome, onLogin, onSignup, onCta, ctaLabel,
}: {
  links: NavLink[];
  onHome: () => void;
  onLogin: () => void;
  /** Opens the account-creation form. Distinct from onLogin — the two used to
   *  share one button, so every "sign up" click landed on the sign-in form. */
  onSignup: () => void;
  onCta: () => void;
  ctaLabel: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = (fn: () => void) => () => { setMobileOpen(false); fn(); };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl"
      style={{ background: 'rgba(8, 19, 26, 0.86)', borderBottom: '1px solid var(--lp-line-soft)' }}
    >
      <div
        className="flex flex-wrap items-center"
        style={{ maxWidth: 1240, margin: '0 auto', padding: '14px clamp(20px,4vw,40px)', gap: '16px 24px' }}
      >
        <BrandLockup onClick={close(onHome)} height={36} />

        <span
          className="hidden md:flex flex-wrap items-center"
          style={{
            margin: '0 auto', gap: 4, padding: 5, borderRadius: 10,
            border: '1px solid var(--lp-line)', background: 'rgba(255,255,255,0.03)',
          }}
        >
          {links.map((l) => (
            <button
              key={l.label}
              onClick={close(l.onClick)}
              className="whitespace-nowrap shrink-0 transition"
              style={{
                fontSize: 14,
                padding: '8px 16px',
                borderRadius: 8,
                color: l.active ? 'var(--lp-paper)' : 'rgba(207,222,255,0.86)',
                background: l.active ? 'rgba(255,255,255,0.06)' : 'transparent',
              }}
              aria-current={l.active ? 'page' : undefined}
            >
              {l.label}
            </button>
          ))}
        </span>

        <span className="hidden md:flex items-center gap-3 shrink-0">
          <button onClick={close(onLogin)} style={{ fontSize: 14, color: 'rgba(207,222,255,0.86)' }} className="transition hover:opacity-80">
            Sign In
          </button>
          <button
            onClick={close(onSignup)}
            className="whitespace-nowrap shrink-0 transition hover:opacity-80"
            style={{
              border: '1px solid var(--lp-line-strong)', color: 'var(--lp-paper)',
              padding: '9px 18px', fontSize: 14, fontWeight: 600, borderRadius: 8,
            }}
          >
            Sign Up
          </button>
          <button
            onClick={close(onCta)}
            className="whitespace-nowrap shrink-0 inline-flex items-center transition"
            style={{
              background: 'var(--lp-green)', color: 'var(--lp-paper)',
              padding: '10px 20px', fontSize: 14, fontWeight: 600, borderRadius: 8,
            }}
          >
            {ctaLabel}
          </button>
        </span>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden ml-auto"
          style={{ color: 'var(--lp-t2)' }}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div
          className="md:hidden px-6 py-5 space-y-4"
          style={{ borderTop: '1px solid var(--lp-line)', background: 'rgba(8, 19, 26, 0.97)' }}
        >
          {links.map((l) => (
            <button
              key={l.label}
              onClick={close(l.onClick)}
              className="block w-full text-left text-[0.9375rem]"
              style={{ color: l.active ? 'var(--lp-paper)' : 'rgba(207,222,255,0.86)' }}
            >
              {l.label}
            </button>
          ))}
          <hr style={{ borderColor: 'var(--lp-line)' }} />
          <button onClick={close(onLogin)} className="block w-full text-left text-[0.9375rem]" style={{ color: 'rgba(207,222,255,0.86)' }}>Sign In</button>
          <button onClick={close(onSignup)} className="block w-full text-left text-[0.9375rem]" style={{ color: 'rgba(207,222,255,0.86)' }}>Sign Up</button>
          <button onClick={close(onCta)} className="lp-btn lp-btn--primary lp-btn--block">{ctaLabel}</button>
        </div>
      )}
    </nav>
  );
}

/* ── Footer ───────────────────────────────────── */
export function MarketingFooter({
  onNavigate, onCta, ctaLabel: _ctaLabel,
}: {
  onNavigate: (page: MarketingPage) => void;
  onCta: () => void;
  /** Accepted for call-site compatibility; the design's footer has no CTA. */
  ctaLabel?: string;
}) {
  const col = { fontFamily: 'var(--lp-font-mono)', fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'rgba(207,222,255,0.5)', marginBottom: 20 };
  const link = { color: 'rgba(207,222,255,0.86)', fontSize: 14.5 };

  return (
    <footer style={{ background: 'var(--lp-bg)', color: 'rgba(207,222,255,0.86)' }}>
      <div
        className="flex flex-wrap items-start"
        style={{ maxWidth: 1240, margin: '0 auto', padding: '88px clamp(20px,4vw,40px) 0', gap: '52px 40px' }}
      >
        <div style={{ flex: '0 1 330px', minWidth: 260 }}>
          <button onClick={() => onNavigate('home')} aria-label="Criateur home" style={{ display: 'block' }}>
            <img src={LOGO_ON_DARK} alt="Criateur" style={{ height: 80, width: 'auto', display: 'block', marginBottom: 24 }} />
          </button>
          <p style={{ fontSize: 15.5, lineHeight: 1.6, color: 'rgba(207,222,255,0.7)', margin: '0 0 8px', maxWidth: '32ch' }}>
            The operating system for regulated manufacturing.
          </p>
          <p style={{ fontFamily: 'var(--lp-font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(207,222,255,0.5)', margin: 0 }}>
            Nigeria.
          </p>
        </div>

        <div
          className="grid"
          style={{ flex: '1 1 400px', minWidth: 0, gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 28, alignItems: 'start' }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={col}>Product</div>
            <div className="flex flex-col gap-[13px]">
              <button onClick={() => onNavigate('platform')} style={link} className="text-left hover:text-white transition">Platform</button>
              <button onClick={() => onNavigate('who')} style={link} className="text-left hover:text-white transition">Who It&rsquo;s For</button>
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={col}>Company</div>
            <div className="flex flex-col gap-[13px]">
              <button onClick={() => onNavigate('about')} style={link} className="text-left hover:text-white transition">About</button>
              <button onClick={() => onNavigate('contact')} style={link} className="text-left hover:text-white transition">Contact</button>
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={col}>Legal</div>
            {/* No pages behind these yet, so they are text rather than links
                that go nowhere. */}
            <div className="flex flex-col gap-[13px]">
              <span style={{ ...link, color: 'rgba(207,222,255,0.5)' }}>Privacy Policy</span>
              <span style={{ ...link, color: 'rgba(207,222,255,0.5)' }}>Terms of Use</span>
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={col}>Contact</div>
            <div className="flex flex-col gap-[13px]">
              <a href="mailto:hello@criateur.com" style={link} className="hover:text-white transition">hello@criateur.com</a>
              <button onClick={onCta} style={link} className="text-left hover:text-white transition">Book a demo</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 clamp(20px,4vw,40px)' }}>
        <div
          style={{
            borderTop: '1px solid rgba(207,222,255,0.14)', marginTop: 60, padding: '24px 0 32px',
            fontFamily: 'var(--lp-font-mono)', fontSize: 11, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'rgba(207,222,255,0.45)',
          }}
        >
          &copy; {new Date().getFullYear()} Criateur. Nigeria.
        </div>
      </div>
    </footer>
  );
}


/* ── Design tokens ────────────────────────────── */
export function MarketingStyles() {
  return (
    <style>{`
      .lp-root {
        /* ── Ground ───────────────────────────────
           Firefly, the design's base. Near-black with a green cast rather
           than the previous navy, so the light product cards that sit on it
           read as lit panels instead of floating tiles. */
        --lp-bg: #08131A;              /* Craiteur/Firefly */
        --lp-bg-deep: #060F15;         /* one step down, for banded sections */
        --lp-surface: rgba(255, 255, 255, 0.03);
        --lp-surface-hi: rgba(255, 255, 255, 0.06);
        --lp-line: rgba(207, 222, 255, 0.14);
        --lp-line-strong: rgba(207, 222, 255, 0.16);

        /* ── Accent ───────────────────────────────
           Green carries the brand now. Two steps, as the dark ground needs:
           a light one that passes contrast as text, a saturated one for
           button fills where the label sits on top in paper white. */
        --lp-accent: #7EC48C;          /* Craiteur/De York — 8.4:1 on Firefly */
        --lp-accent-strong: #478D4B;   /* Craiteur/Hippie Green — button fills */
        --lp-accent-hover: #529C57;
        --lp-accent-soft: rgba(71, 141, 75, 0.15);
        --lp-accent-line: rgba(71, 141, 75, 0.28);
        --lp-mint: #7DE0A8;            /* Craiteur/Algae Green */
        --lp-coral: #FF8C7A;           /* Craiteur/Vivid Tangerine */
        --lp-gold: #F5A860;            /* Craiteur/Sandy Brown */
        --lp-indigo: #3F6AC9;          /* Craiteur/Indigo */
        --lp-tango: #F08128;           /* Craiteur/Tango */

        /* ── Paper ────────────────────────────────
           The light product cards invert the page. Kept as tokens so the
           mockups do not hard-code hexes. */
        --lp-paper: #FBF9F5;           /* Craiteur/Ecru White */
        --lp-paper-line: #E6E2DB;      /* Craiteur/Westar */
        --lp-paper-ink: #26262F;       /* Craiteur/Charade */
        --lp-paper-dim: #75747F;       /* Craiteur/Jumbo */

        /* ── Type colour ──────────────────────────
           Periwinkle at descending opacity, not grey: it keeps the text
           family to the ground instead of laying neutral haze over it. */
        --lp-t1: #FBF9F5;
        --lp-t2: rgba(207, 222, 255, 0.78);
        --lp-t3: rgba(207, 222, 255, 0.66);
        --lp-t4: rgba(207, 222, 255, 0.42);

        /* ── Design-file tokens ───────────────────
           Names and values taken verbatim from the landing-page design
           source, so a value can be traced back to it rather than guessed
           at. The --lp-accent/--lp-t* names above are kept because the
           other four marketing pages already build on them. */
        --lp-green: #478D4B;
        --lp-green-deep: #1E5620;
        --lp-green-glow: #7EC48C;
        --lp-blue: #183470;
        --lp-blue-tint: #CFDEFF;
        --lp-amber-tint: #FBECCC;
        --lp-verified: #12A05A;
        --lp-attention: #F08128;
        --lp-hold: #C62F1E;
        --lp-hold-lite: #FF8C7A;
        --lp-periwinkle: #9DB6EE;
        --lp-ink: #26262F;
        --lp-stone: #E6E2DB;
        --lp-slate: #75747F;
        /* Section grounds. The page alternates between a green-cast and a
           blue-cast band, each fading in and out of the base at the seams. */
        --lp-sec-green: #0B1D1B;
        --lp-sec-blue: #0A1727;
        --lp-seam: #0B1A21;
        --lp-line-soft: rgba(207, 222, 255, 0.09);
        --lp-dim: rgba(207, 222, 255, 0.66);

        /* ── Type families ────────────────────────
           Three, per the design. Loaded once in index.css; self-hosted so
           they satisfy the app's font-src 'self' CSP. (No backticks in this
           block — it lives inside a template literal.) */
        --lp-font-display: 'Bricolage Grotesque Variable', 'Bricolage Grotesque', Georgia, serif;
        --lp-font: 'Sora Variable', Sora, system-ui, sans-serif;
        --lp-font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

        background: var(--lp-bg);
        color: var(--lp-t1);
        font-family: var(--lp-font);
        font-size: 16px;
        line-height: 1.6;
        min-height: 100vh;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      .lp-root ::selection { background: rgba(126, 196, 140, 0.28); }

      /* ── Layout ─────────────────────────────── */
      .lp-container { max-width: 1200px; margin: 0 auto; }
      .lp-section {
        padding-left: 24px;
        padding-right: 24px;
      }
      @media (min-width: 768px) { .lp-section { padding-left: 40px; padding-right: 40px; } }
      @media (min-width: 1280px) { .lp-section { padding-left: 64px; padding-right: 64px; } }
      .lp-section--raised { background: var(--lp-bg-deep); }
      /* The nav is fixed at 72px — without this, jumping to #pricing parks the
         heading underneath it. */
      .lp-section[id] { scroll-margin-top: 88px; }

      /* ── Typography ─────────────────────────
         Three families with distinct jobs, per the landing-page design:
         Bricolage Grotesque sets every heading, Sora carries running text,
         and IBM Plex Mono is reserved for labels and machine-produced data
         (batch ids, spec limits, timestamps) so measured values read as
         measured rather than written. Sizes and tracking are the design's,
         converted from px to em where they need to scale. */
      .lp-display {                                  /* 64px */
        font-family: var(--lp-font-display);
        font-size: clamp(2.5rem, 4.6vw, 4rem);
        font-weight: 600;
        line-height: 1.0075;
        letter-spacing: -0.0213em;
        font-variation-settings: 'opsz' 14, 'wdth' 100;
        text-wrap: balance;
        color: var(--lp-t1);
      }
      /* The design sets the last sentence of a display heading in green —
         the claim the page is actually making. */
      .lp-display em { font-style: normal; color: var(--lp-accent); }

      .lp-h2 {                                       /* 40px */
        font-family: var(--lp-font-display);
        font-size: clamp(1.875rem, 3.1vw, 2.5rem);
        font-weight: 600;
        line-height: 1.134;
        letter-spacing: -0.0189em;
        font-variation-settings: 'opsz' 14, 'wdth' 100;
        text-wrap: balance;
        color: var(--lp-t1);
      }
      .lp-h2 em { font-style: normal; color: var(--lp-accent); }

      .lp-h2-sm {                                    /* 32px */
        font-family: var(--lp-font-display);
        font-size: clamp(1.625rem, 2.3vw, 2rem);
        font-weight: 600;
        line-height: 1.16;
        letter-spacing: -0.018em;
        font-variation-settings: 'opsz' 14, 'wdth' 100;
        text-wrap: balance;
        color: var(--lp-t1);
      }
      .lp-h3 {                                       /* 23px */
        font-family: var(--lp-font-display);
        font-size: 1.4375rem;
        line-height: 1.2;
        font-weight: 500;
        letter-spacing: -0.01em;
        color: var(--lp-t1);
      }
      .lp-lead {                                     /* 20px */
        font-size: 1.25rem;
        line-height: 1.3365;
        color: var(--lp-t2);
      }
      .lp-body {                                     /* 15px */
        font-size: 0.9375rem;
        line-height: 1.55;
        color: var(--lp-t2);
      }
      .lp-small { font-size: 0.875rem; line-height: 1.5; color: var(--lp-t3); }
      .lp-micro { font-size: 0.8125rem; line-height: 1.45; color: var(--lp-t4); }

      /* Mono label. Used for section eyebrows and, at --dim, for the data
         chrome inside the product mockups. */
      .lp-eyebrow,
      .lp-step-label {
        font-family: var(--lp-font-mono);
        font-size: 0.875rem;
        line-height: 1.21;
        font-weight: 400;
        letter-spacing: 0.1257em;
        text-transform: uppercase;
        color: var(--lp-accent);
      }
      .lp-mono {
        font-family: var(--lp-font-mono);
        font-size: 0.75rem;
        line-height: 1.45;
        letter-spacing: 0.06em;
      }
      .lp-mono-up {
        font-family: var(--lp-font-mono);
        font-size: 0.6875rem;
        line-height: 1.55;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }


      .lp-num { font-variant-numeric: tabular-nums; }

      /* ── Buttons ────────────────────────────── */
      .lp-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 24px;
        border-radius: 8px;
        font-family: var(--lp-font);
        font-size: 0.9375rem;
        line-height: 1.55;
        font-weight: 600;
        border: 1px solid transparent;
        cursor: pointer;
        white-space: nowrap;
        transition: background .18s ease, border-color .18s ease, transform .18s ease;
      }
      .lp-btn:focus-visible { outline: 2px solid var(--lp-accent); outline-offset: 3px; }
      .lp-btn:disabled { cursor: progress; }
      .lp-btn--primary {
        background: var(--lp-accent-strong);
        color: var(--lp-paper);
      }
      .lp-btn--primary:hover:not(:disabled) { background: var(--lp-accent-hover); transform: translateY(-1px); }
      /* The design's secondary is an outline in the same green as the fill,
         with the label in the lighter step so it stays legible on the ground. */
      .lp-btn--ghost {
        background: rgba(71, 141, 75, 0.02);
        border-color: var(--lp-accent-strong);
        color: var(--lp-accent);
      }
      .lp-btn--ghost:hover:not(:disabled) { background: var(--lp-accent-soft); }
      .lp-btn--block { width: 100%; }

      /* ── Surfaces ───────────────────────────── */
      .lp-card {
        background: var(--lp-surface);
        border: 1px solid var(--lp-line);
        border-radius: 12px;
      }
      .lp-card--hover { transition: border-color .18s ease, background .18s ease; }
      .lp-card--hover:hover {
        border-color: var(--lp-accent-line);
        background: var(--lp-surface-hi);
      }
      .lp-card--accent {
        background: var(--lp-accent-soft);
        border-color: var(--lp-accent-line);
      }

      /* Pill used for the hero badge and the framework anchors. */
      .lp-tag {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 24px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--lp-line-strong);
        font-family: var(--lp-font-mono);
        font-size: 0.875rem;
        line-height: 1.16;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--lp-t2);
        text-align: center;
        /* Not nowrap: at 390px the hero badge is wider than the viewport and
           was being clipped at both edges by the hero's overflow-hidden. */
        white-space: normal;
        max-width: 100%;
      }
      @media (max-width: 640px) {
        .lp-tag {
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          padding: 8px 16px;
        }
      }
      .lp-tag-dot {
        width: 10px; height: 10px; border-radius: 999px;
        background: var(--lp-accent); flex-shrink: 0;
      }

      /* ── Paper panel ─────────────────────────
         The product mockups invert the page: a light card on the dark
         ground. Everything inside reads against paper, so the tokens flip
         rather than each mockup restating them. */
      .lp-paper {
        background: var(--lp-paper);
        border-radius: 8px;
        color: var(--lp-paper-ink);
      }
      .lp-paper-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 13px 0;
        border-top: 1px solid var(--lp-paper-line);
      }


      .lp-input {
        width: 100%;
        font-family: var(--lp-font);
        font-size: 0.9375rem;
        color: var(--lp-t1);
        background: rgba(255,255,255,.05);
        border: 1px solid var(--lp-line-strong);
        border-radius: 10px;
        padding: 14px 16px 14px 42px;
        transition: border-color .18s ease, background .18s ease;
      }
      .lp-input::placeholder { color: var(--lp-t4); }
      .lp-input:focus {
        outline: none;
        border-color: var(--lp-accent);
        background: rgba(255,255,255,.07);
      }


      /* ── Form fields ────────────────────────
         Used by the contact form. .lp-input above is the icon-padded
         single-email variant; these are the plain ones. Both opt out of
         the global input override in index.css by class name.
         (No backticks in here — this block is inside a template literal.) */
      .lp-field {
        width: 100%;
        font-family: var(--lp-font);
        font-size: 0.9375rem;
        color: var(--lp-t1);
        background: rgba(255,255,255,.05);
        border: 1px solid var(--lp-line-strong);
        border-radius: 10px;
        padding: 12px 14px;
        transition: border-color .18s ease, background .18s ease;
      }
      .lp-field::placeholder { color: var(--lp-t4); }
      .lp-field:focus {
        outline: none;
        border-color: var(--lp-accent);
        background: rgba(255,255,255,.07);
      }
      .lp-field[aria-invalid="true"] { border-color: var(--lp-coral); }
      /* Native dropdowns ignore inherited colour in most browsers. The
         popup is painted by the OS with no page behind it, so this has to
         be an opaque colour — the translucent surface token rendered as
         near-white and the options disappeared. */
      select.lp-field option { background: #0E1D25; color: var(--lp-t1); }
      textarea.lp-field { resize: vertical; min-height: 96px; }

      /* Browsers force their own background on autofilled fields, and
         index.css pins that to the light app surface. Re-pin it inside
         .lp-root so an autofilled email does not come back white. */
      .lp-root input.lp-field:-webkit-autofill,
      .lp-root input.lp-field:-webkit-autofill:hover,
      .lp-root input.lp-field:-webkit-autofill:focus {
        -webkit-text-fill-color: var(--lp-t1) !important;
        -webkit-box-shadow: 0 0 0 1000px #101E26 inset !important;
        caret-color: var(--lp-t1);
      }

      .lp-field-label {
        display: block;
        font-size: var(--type-label-01-size);
        line-height: var(--type-label-01-lh);
        font-weight: 600;
        color: var(--lp-t2);
        margin-bottom: 6px;
      }
      .lp-field-error {
        font-size: var(--type-caption-01-size);
        line-height: var(--type-caption-01-lh);
        color: var(--lp-coral);
        margin-top: 6px;
      }
      .lp-req { color: var(--lp-coral); }

      /* ── Proof bar ─────────────────────────── */
      .lp-proofbar {
        background: var(--lp-surface);
        border-top: 1px solid var(--lp-line);
        border-bottom: 1px solid var(--lp-line);
      }

      /* ── Run / Control / Prove ─────────────── */
      .lp-step-label {
        font-size: var(--type-label-01-size);
        line-height: var(--type-label-01-lh);
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--lp-accent);
      }

      /* ── Framework chips ───────────────────── */
      .lp-chip {
        display: inline-flex;
        align-items: center;
        height: var(--control-height-md);
        padding: 0 18px;
        border-radius: 10px;
        border: 1px solid var(--lp-line-strong);
        background: var(--lp-surface);
        font-size: var(--type-heading-01-size);
        line-height: var(--type-heading-01-lh);
        font-weight: var(--type-heading-01-weight);
        color: var(--lp-t1);
        white-space: nowrap;
      }

      /* ── Capability bullet ─────────────────── */
      .lp-bullet { display: flex; gap: 10px; align-items: flex-start; }
      .lp-bullet-dot { flex-shrink: 0; margin-top: 7px; width: 5px; height: 5px; border-radius: 999px; background: var(--lp-accent); }

      /* ── Motion ───────────────────────────────
         The hero's batch record plays its assembly once: the rules draw,
         the results drop in, and the two live chips settle from their
         in-progress state to their final one. It is the product's own
         behaviour, not decoration, which is why it runs once and stops. */
      @keyframes recIn { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
      @keyframes ruleDraw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      @keyframes chipMidOut { 0%, 58% { opacity: 1; } 72%, 100% { opacity: 0; } }
      @keyframes chipFinalIn { 0%, 62% { opacity: 0; } 78%, 100% { opacity: 1; } }
      @keyframes stageTick { 0%, 58% { opacity: 1; } 66%, 100% { opacity: 0; } }
      @keyframes stageDone { 0%, 62% { opacity: 0; } 72%, 100% { opacity: 1; } }
      /* Under reduced motion the record shows its finished state immediately
         rather than animating to it. */
      @media (prefers-reduced-motion: reduce) {
        .lp-root [data-mid] { opacity: 0 !important; }
        .lp-root [data-final] { opacity: 1 !important; }
      }

      /* ── Motion ─────────────────────────────── */
      @keyframes orbFloat {
        0%, 100% { transform: translate(0, 0) scale(1); }
        33% { transform: translate(30px, -20px) scale(1.05); }
        66% { transform: translate(-20px, 15px) scale(0.95); }
      }
      @keyframes gaugeIn {
        from { stroke-dashoffset: 263.9; }
      }
      @media (prefers-reduced-motion: reduce) {
        .lp-root *, .lp-root *::before, .lp-root *::after {
          animation-duration: .001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: .001ms !important;
        }
      }
    `}</style>
  );
}
