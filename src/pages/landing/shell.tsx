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
import { Mail, MapPin, Linkedin, Menu, X } from 'lucide-react';
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

/* ── Brand mark ───────────────────────────────────
   NOTE: the design exports the logo as a PNG from Figma's asset host, and
   this environment's egress proxy blocks that host — so the mark could not
   be downloaded. This is a stand-in built to the same geometry (radiating
   strokes, De York green) so the page is not shipped logo-less. Replace it
   with the real export: drop the file in and swap this component's body. */
function CriateurMark({ className = '' }: { className?: string }) {
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      {rays.map((deg, i) => (
        <rect
          key={deg}
          x="15.1"
          y={i % 2 === 0 ? 1.5 : 3.5}
          width="1.8"
          height={i % 2 === 0 ? 6 : 4}
          rx="0.9"
          fill="var(--lp-accent)"
          opacity={i % 3 === 0 ? 1 : 0.65}
          transform={`rotate(${deg} 16 16)`}
        />
      ))}
      <circle cx="16" cy="16" r="4.4" fill="var(--lp-accent-strong)" />
    </svg>
  );
}

export function BrandLockup({ onClick }: { onClick?: () => void }) {
  const inner = (
    <>
      <CriateurMark className="w-8 h-8 shrink-0" />
      <span
        className="text-[1.375rem] font-semibold tracking-[-0.02em]"
        style={{ fontFamily: 'var(--lp-font-display)', color: 'var(--lp-t1)' }}
      >
        Criateur
      </span>
    </>
  );
  if (!onClick) return <span className="flex items-center gap-2">{inner}</span>;
  return (
    <button onClick={onClick} className="flex items-center gap-2" aria-label="Criateur home">
      {inner}
    </button>
  );
}

/* ── Navigation ───────────────────────────────
   The design floats the links in their own bordered capsule, centred, with
   the mark and the CTA on the outside — so the nav reads as one control
   rather than a rule across the top. */
export function MarketingNav({
  links, onHome, onLogin, onCta, ctaLabel,
}: {
  links: NavLink[];
  onHome: () => void;
  onLogin: () => void;
  onCta: () => void;
  ctaLabel: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = (fn: () => void) => () => { setMobileOpen(false); fn(); };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl"
      style={{ background: 'rgba(8, 19, 26, 0.82)', borderBottom: '1px solid var(--lp-line)' }}
    >
      <div className="lp-container lp-section flex items-center justify-between h-[90px] gap-4">
        <BrandLockup onClick={close(onHome)} />

        <div
          className="hidden md:flex items-center gap-1 px-2 py-1 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--lp-line)' }}
        >
          {links.map((l) => (
            <button
              key={l.label}
              onClick={close(l.onClick)}
              className="px-4 py-2 rounded-lg text-[0.9375rem] transition"
              style={{
                color: l.active ? 'var(--lp-t1)' : 'var(--lp-t2)',
                background: l.active ? 'rgba(255,255,255,0.05)' : 'transparent',
              }}
              aria-current={l.active ? 'page' : undefined}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          <button
            onClick={onLogin}
            className="text-[0.9375rem] transition hover:opacity-80"
            style={{ color: 'var(--lp-t2)' }}
          >
            Sign In
          </button>
          <button onClick={close(onCta)} className="lp-btn lp-btn--primary !py-2.5 !px-5 !text-[0.875rem]">
            {ctaLabel}
          </button>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden"
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
              style={{ color: l.active ? 'var(--lp-t1)' : 'var(--lp-t2)' }}
            >
              {l.label}
            </button>
          ))}
          <hr style={{ borderColor: 'var(--lp-line)' }} />
          <button onClick={close(onLogin)} className="block w-full text-left text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>Sign In</button>
          <button onClick={close(onCta)} className="lp-btn lp-btn--primary lp-btn--block">{ctaLabel}</button>
        </div>
      )}
    </nav>
  );
}

/* ── Footer ───────────────────────────────────── */
export function MarketingFooter({
  onNavigate, onCta, ctaLabel,
}: {
  onNavigate: (page: MarketingPage) => void;
  onCta: () => void;
  ctaLabel: string;
}) {
  /* The design's Product column names capabilities rather than pages. They
     all live on Platform & Features, so that is where they point — better
     than four dead links or four spans that look clickable. */
  const productLinks = ['CoA Generator', 'Audit trail', 'Tenant isolation', 'Built for NAFDAC'];

  return (
    <footer style={{ borderTop: '1px solid var(--lp-line)' }}>
      <div className="lp-container lp-section py-16">
        <div className="grid md:grid-cols-4 gap-10 lg:gap-16">
          <div className="md:col-span-1">
            <div className="mb-5"><BrandLockup /></div>
            <p className="lp-small" style={{ maxWidth: '20rem' }}>
              Criateur is the compliance system for regulated manufacturers &mdash;
              certificates, batch records and the trail that proves them.
            </p>
            <div className="flex items-center gap-2 mt-7">
              <a
                href="https://www.linkedin.com/company/criateur"
                target="_blank"
                rel="noreferrer"
                aria-label="Criateur on LinkedIn"
                className="w-9 h-9 rounded-lg flex items-center justify-center transition"
                style={{ border: '1px solid var(--lp-line-strong)', color: 'var(--lp-accent)' }}
              >
                <Linkedin className="w-4 h-4" />
              </a>
              <a
                href="mailto:hello@criateur.com"
                aria-label="Email Criateur"
                className="w-9 h-9 rounded-lg flex items-center justify-center transition"
                style={{ border: '1px solid var(--lp-line-strong)', color: 'var(--lp-accent)' }}
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div>
            <p className="lp-mono-up mb-5" style={{ color: 'var(--lp-t4)' }}>Product</p>
            <ul className="space-y-3 text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>
              {productLinks.map((label) => (
                <li key={label}>
                  <button onClick={() => onNavigate('platform')} className="transition hover:text-white">{label}</button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="lp-mono-up mb-5" style={{ color: 'var(--lp-t4)' }}>Company</p>
            <ul className="space-y-3 text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>
              <li><button onClick={onCta} className="transition hover:text-white">{ctaLabel}</button></li>
              <li><button onClick={() => onNavigate('who')} className="transition hover:text-white">Who it&rsquo;s for</button></li>
              <li><button onClick={() => onNavigate('about')} className="transition hover:text-white">About</button></li>
              <li><button onClick={() => onNavigate('contact')} className="transition hover:text-white">Contact</button></li>
            </ul>
          </div>

          <div>
            <p className="lp-mono-up mb-5" style={{ color: 'var(--lp-t4)' }}>Contact</p>
            <div className="space-y-4">
              <a href="mailto:hello@criateur.com" className="flex items-start gap-2.5 text-[0.9375rem] transition hover:text-white" style={{ color: 'var(--lp-t2)' }}>
                <Mail className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--lp-accent)' }} />
                hello@criateur.com
              </a>
              <p className="flex items-start gap-2.5 text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>
                <MapPin className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--lp-accent)' }} />
                Lagos, Nigeria
              </p>
            </div>
            {/* The design carries "TODO: phone, office address" and "TODO:
                docs, legal" as visible placeholder text. Those are notes to
                the designer, not copy, so they are not rendered. */}
          </div>
        </div>

        <div
          className="mt-14 pt-7 flex flex-col md:flex-row items-center justify-between gap-4"
          style={{ borderTop: '1px solid var(--lp-line)' }}
        >
          <p className="lp-mono-up" style={{ color: 'var(--lp-t4)' }}>
            &copy; Criateur {new Date().getFullYear()}. All rights reserved.
          </p>
          <div className="flex items-center gap-7">
            <span className="lp-mono-up" style={{ color: 'var(--lp-t4)' }}>Privacy Policy</span>
            <span className="lp-mono-up" style={{ color: 'var(--lp-t4)' }}>Terms &amp; Conditions</span>
          </div>
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
        --lp-line: rgba(207, 222, 255, 0.10);
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
        --lp-t3: rgba(207, 222, 255, 0.62);
        --lp-t4: rgba(207, 222, 255, 0.42);

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
      /* Native dropdowns ignore inherited colour in most browsers. */
      select.lp-field option { background: var(--lp-surface); color: var(--lp-t1); }
      textarea.lp-field { resize: vertical; min-height: 96px; }

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
