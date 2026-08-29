import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import LiveDashboardPreview from './landing/LiveDashboardPreview';
import {
  ShieldCheck, Zap, Globe2, FileCheck2, BarChart3, Lock, CheckCircle2,
  ArrowRight, ChevronRight, Users, Eye, Brain, Scale, Server,
  Clock, Award, Mail, ExternalLink, Menu, X,
} from 'lucide-react';

/* ── Framer Motion section wrapper ────────────── */
const sectionVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};
function MotionWrap({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
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

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToSignup: () => void;
}

/* ── Animated Counter ─────────────────────────── */
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let start = 0;
          const duration = 1600;
          const step = Math.max(1, Math.floor(target / (duration / 16)));
          const timer = setInterval(() => {
            start += step;
            if (start >= target) {
              setCount(target);
              clearInterval(timer);
            } else {
              setCount(start);
            }
          }, 16);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{count}{suffix}</span>;
}

/* ── Section Wrapper ─────────────────────────────
   `tone="raised"` paints a slightly lighter band so the page reads as
   stacked surfaces rather than one flat slab of navy. */
function Section({
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

/* ── Main Component ───────────────────────────── */
export default function LandingPage({ onNavigateToLogin, onNavigateToSignup }: LandingPageProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) setSubmitted(true);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };

  return (
    <div className="lp-root">
      {/*
        Landing-page design tokens. Everything below is scoped to `.lp-root`,
        so the marketing page can carry its own identity without touching the
        app's theme variables in index.css.

        Palette: a deep navy ground rather than black — dark enough for the
        product screenshots to sit on, light enough to read comfortably for a
        full scroll. Greys are blue-tinted so they belong to the navy instead
        of sitting on top of it as neutral haze.
      */}
      <style>{`
        .lp-root {
          /* ground */
          --lp-bg: #0A2540;
          --lp-bg-deep: #071C31;
          --lp-surface: #0E2E4E;
          --lp-surface-hi: #133A60;
          --lp-line: rgba(255, 255, 255, 0.09);
          --lp-line-strong: rgba(255, 255, 255, 0.18);

          /* accents — drawn from the Figma primary ramp rather than invented.
             The ramp gives exactly what a dark ground needs: a light step for
             text (300) and a saturated step for fills (500). */
          --lp-accent: var(--primary-300);        /* #7ca1f3 — 6.1:1 on the navy, for text and links */
          --lp-accent-strong: var(--primary-500);  /* #2563eb — button fills, 5.1:1 against white */
          --lp-accent-hover: var(--primary-400);   /* #5182ef */
          --lp-accent-soft: var(--primary-alpha-10);
          --lp-mint: #3BB75E;
          --lp-coral: var(--red-100);              /* #fb3748 */
          --lp-gold: #F5B944;

          /* type */
          --lp-t1: #FFFFFF;
          --lp-t2: #B2C7DB;
          --lp-t3: #86A0BA;
          --lp-t4: #5F7B98;

          /* Mulish, per the Figma style guide. Loaded once in index.css. */
          --lp-font: var(--font-sans);

          background: var(--lp-bg);
          color: var(--lp-t1);
          font-family: var(--lp-font);
          font-size: 16px;
          line-height: 1.6;
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        .lp-root ::selection { background: rgba(78, 159, 212, 0.3); }

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

        /* ── Typography ─────────────────────────── */
        /* All type below maps to a Figma token. Letter-spacing is 0 and
           heading weight is 500 (Medium) throughout, as specified — the scale
           tops out at heading-07 (54px), so the hero no longer runs to 72px. */
        .lp-display {                                  /* heading-05 → heading-07 */
          font-size: clamp(var(--type-heading-05-size), 4.6vw, var(--type-heading-07-size));
          font-weight: var(--type-heading-07-weight);
          line-height: 1.185;
          text-wrap: balance;
          margin: 0;
        }
        .lp-h2 {                                       /* heading-05 → heading-06 */
          font-size: clamp(var(--type-heading-05-size), 3.2vw, var(--type-heading-06-size));
          font-weight: var(--type-heading-06-weight);
          line-height: 1.19;
          text-wrap: balance;
          margin: 0;
        }
        .lp-h3 {                                       /* heading-03 */
          font-size: var(--type-heading-03-size);
          line-height: var(--type-heading-03-lh);
          font-weight: var(--type-heading-03-weight);
          margin: 0;
        }
        .lp-lead {                                     /* body-long-02 */
          font-size: var(--type-body-long-02-size);
          line-height: var(--type-body-long-02-lh);
          color: var(--lp-t2);
          margin: 0;
        }
        .lp-body {                                     /* body-long-01 */
          font-size: var(--type-body-long-01-size);
          line-height: var(--type-body-long-01-lh);
          color: var(--lp-t2);
          margin: 0;
        }
        .lp-small { font-size: var(--type-body-short-01-size); line-height: var(--type-body-short-01-lh); color: var(--lp-t3); margin: 0; }
        .lp-micro { font-size: var(--type-caption-01-size); line-height: var(--type-caption-01-lh); color: var(--lp-t4); margin: 0; }
        .lp-eyebrow {                                  /* heading-01 */
          display: inline-block;
          font-size: var(--type-heading-01-size);
          line-height: var(--type-heading-01-lh);
          font-weight: var(--type-heading-01-weight);
          color: var(--lp-accent);
          margin: 0 0 14px;
        }
        .lp-num { font-variant-numeric: tabular-nums; }

        /* ── Buttons ────────────────────────────── */
        .lp-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: var(--lp-font);
          /* heading-01 (14/18, 600) at the sheet's 48px default height */
          font-size: var(--type-heading-01-size);
          line-height: var(--type-heading-01-lh);
          font-weight: var(--type-heading-01-weight);
          min-height: var(--control-height-default);
          padding: 0 26px;
          border-radius: 10px;
          border: 1px solid transparent;
          cursor: pointer;
          transition: background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
        }
        .lp-btn:focus-visible { outline: 2px solid var(--lp-accent); outline-offset: 3px; }
        .lp-btn--primary {
          background: var(--lp-accent-strong);
          color: #FFFFFF;
        }
        .lp-btn--primary:hover { background: var(--lp-accent-hover); transform: translateY(-1px); }
        .lp-btn--ghost {
          background: transparent;
          border-color: var(--lp-line-strong);
          color: var(--lp-t1);
        }
        .lp-btn--ghost:hover { border-color: rgba(255,255,255,.4); background: rgba(255,255,255,.04); }
        .lp-btn--block { width: 100%; }

        /* ── Cards ──────────────────────────────── */
        .lp-card {
          background: var(--lp-surface);
          border: 1px solid var(--lp-line);
          border-radius: 16px;
          padding: 32px;
          transition: border-color .2s ease, background .2s ease, transform .2s ease;
        }
        .lp-card--hover:hover {
          background: var(--lp-surface-hi);
          border-color: var(--lp-line-strong);
          transform: translateY(-2px);
        }
        .lp-card--accent {
          border-color: rgba(78, 159, 212, 0.4);
          background: linear-gradient(180deg, rgba(78, 159, 212,.10) 0%, var(--lp-surface) 60%);
        }
        /* Icons sit inline at a light stroke weight. The tinted rounded tile
           they used to sit in is the single most template-looking device in
           this kind of layout, and it added nothing the icon didn't say. */
        .lp-icon { color: var(--lp-accent); }
        .lp-tag {
          font-size: 0.6875rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: var(--lp-accent);
          border: 1px solid rgba(78, 159, 212, 0.3);
          border-radius: 999px;
          padding: 3px 10px;
          white-space: nowrap;
        }

        /* ── Live product preview (hero) ────────── */
        .lp-preview {
          border: 1px solid var(--lp-line-strong);
          background: rgba(14, 46, 78, 0.85);
        }
        .lp-risk-row {
          cursor: pointer;
          background: transparent;
          border: 1px solid transparent;
          transition: background .16s ease, border-color .16s ease;
        }
        .lp-risk-row:hover { background: rgba(255, 255, 255, 0.05); }
        .lp-risk-row[data-active] {
          background: rgba(255, 255, 255, 0.07);
          border-color: var(--lp-line-strong);
        }
        .lp-risk-row:focus-visible { outline: 2px solid var(--lp-accent); outline-offset: 2px; }

        /* ── Inputs ─────────────────────────────── */
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

      {/* ════════════════════════════════════════════════
          NAVIGATION
         ════════════════════════════════════════════════ */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl"
        style={{ background: 'rgba(7, 28, 49, 0.82)', borderBottom: '1px solid var(--lp-line)' }}
      >
        <div className="lp-container lp-section flex items-center justify-between h-[72px]">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7" style={{ color: 'var(--lp-accent)' }} />
            <span className="text-[1.0625rem] font-bold tracking-[-0.02em]">
              Criateur <span style={{ color: 'var(--lp-accent)' }}>OS</span>
            </span>
          </div>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-9 text-[0.9375rem] font-medium" style={{ color: 'var(--lp-t2)' }}>
            <button onClick={() => scrollTo('features')} className="hover:text-white transition">Features</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-white transition">Pricing</button>
            <button onClick={() => scrollTo('security')} className="hover:text-white transition">Security</button>
            <button onClick={() => scrollTo('cta')} className="hover:text-white transition">Contact</button>
          </div>

          <div className="hidden md:flex items-center gap-5">
            <button
              onClick={onNavigateToLogin}
              className="text-[0.9375rem] font-medium hover:text-white transition"
              style={{ color: 'var(--lp-t2)' }}
            >
              Sign In
            </button>
            <button onClick={() => scrollTo('cta')} className="lp-btn lp-btn--primary !py-2.5 !px-5">
              Request Demo
            </button>
          </div>

          {/* Mobile Toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden"
            style={{ color: 'var(--lp-t2)' }}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div
            className="md:hidden px-6 py-5 space-y-4"
            style={{ borderTop: '1px solid var(--lp-line)', background: 'rgba(7, 28, 49, 0.97)' }}
          >
            <button onClick={() => scrollTo('features')} className="block w-full text-left text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>Features</button>
            <button onClick={() => scrollTo('pricing')} className="block w-full text-left text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>Pricing</button>
            <button onClick={() => scrollTo('security')} className="block w-full text-left text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>Security</button>
            <button onClick={() => scrollTo('cta')} className="block w-full text-left text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>Contact</button>
            <hr style={{ borderColor: 'var(--lp-line)' }} />
            <button onClick={onNavigateToLogin} className="block w-full text-left text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>Sign In</button>
            <button onClick={() => scrollTo('cta')} className="block w-full text-left text-[0.9375rem] font-semibold" style={{ color: 'var(--lp-accent)' }}>Request Demo</button>
          </div>
        )}
      </nav>

      {/* ════════════════════════════════════════════════
          HERO
         ════════════════════════════════════════════════ */}
      <Section className="pt-36 pb-24 md:pt-48 md:pb-32 relative overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-[130px] animate-[orbFloat_8s_ease-in-out_infinite]"
            style={{ background: 'rgba(78, 159, 212, 0.13)' }}
          />
          <div
            className="absolute top-20 -right-40 w-[420px] h-[420px] rounded-full blur-[110px] animate-[orbFloat_10s_ease-in-out_2s_infinite_reverse]"
            style={{ background: 'rgba(59, 183, 94, 0.12)' }}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center relative z-10">
          {/* Left — copy */}
          <MotionWrap>
            <div
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[0.8125rem] font-semibold mb-9"
              style={{ border: '1px solid rgba(78, 159, 212,.3)', background: 'var(--lp-accent-soft)', color: 'var(--lp-accent)' }}
            >
              <Zap className="w-3.5 h-3.5" />
              Now in early access — join the waitlist
            </div>

            <h1 className="lp-display">
              The Compliance<br />Operating System<br />for Regulated Industries
            </h1>

            <p className="lp-lead mt-7 max-w-xl">
              AI-powered compliance, immutable audit trails, and multi-jurisdiction regulatory management — built for pharmaceutical and healthcare companies that cannot afford to fail an audit.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-3.5">
              <button onClick={() => scrollTo('cta')} className="lp-btn lp-btn--primary">
                Request Demo <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => scrollTo('features')} className="lp-btn lp-btn--ghost">
                View Features <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Invite redeem link */}
            <div className="mt-6">
              <button
                onClick={onNavigateToLogin}
                className="text-sm font-medium inline-flex items-center gap-1.5 transition hover:opacity-80"
                style={{ color: 'var(--lp-accent)' }}
                title="If you received an invite token, sign in or sign up to redeem it"
              >
                <Users className="w-3.5 h-3.5" />
                Have an invite? Redeem it here →
              </button>
            </div>

            {/* Trust Badges */}
            <div className="mt-14 flex flex-wrap gap-x-7 gap-y-3.5 text-[0.8125rem] font-medium" style={{ color: 'var(--lp-t3)' }}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" style={{ color: 'var(--lp-mint)' }} />
                <span>SOC 2 Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--lp-mint)' }} />
                <span>NAFDAC Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe2 className="w-4 h-4" style={{ color: 'var(--lp-mint)' }} />
                <span>FDA / EMA Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4" style={{ color: 'var(--lp-mint)' }} />
                <span>GDPR Compliant</span>
              </div>
            </div>
          </MotionWrap>

          {/* Right — live product preview (own component; drives itself) */}
          <MotionWrap delay={0.2}>
            <LiveDashboardPreview />
          </MotionWrap>
        </div>
      </Section>

      {/* ════════════════════════════════════════════════
          PROBLEM
         ════════════════════════════════════════════════ */}
      <Section tone="raised" className="py-24 md:py-32">
        <MotionWrap>
          <div className="mb-16 max-w-2xl">
            <p className="lp-eyebrow">The Problem</p>
            <h2 className="lp-h2">Compliance in pharma is broken</h2>
            <p className="lp-lead mt-5">
              Most pharmaceutical companies still manage compliance with spreadsheets, email chains, and hope. The cost of failure is measured in millions.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: FileCheck2,
                title: 'Manual compliance tracking',
                desc: 'Teams waste hundreds of hours per quarter manually reviewing promotional materials against regulations that change monthly. Errors are inevitable.',
                stat: '73%',
                statLabel: 'of pharma companies still use manual review processes',
              },
              {
                icon: Scale,
                title: 'Audit failures & penalties',
                desc: 'Without immutable evidence trails, companies face regulatory penalties averaging $2.4M per violation. Reconstructing audit history after the fact is nearly impossible.',
                stat: '$2.4M',
                statLabel: 'average penalty per compliance violation',
              },
              {
                icon: Globe2,
                title: 'Regulatory change management',
                desc: 'Operating across Nigeria, USA, Europe, and Africa means tracking dozens of regulatory bodies simultaneously. Missing a single update can invalidate entire campaigns.',
                stat: '340+',
                statLabel: 'regulatory changes per year across jurisdictions',
              },
            ].map((item, i) => (
              <div key={i} className="lp-card lp-card--hover">
                <item.icon className="w-9 h-9 mb-6" strokeWidth={1.5} style={{ color: 'var(--lp-coral)' }} />
                <h3 className="lp-h3 mb-3">{item.title}</h3>
                <p className="lp-body mb-7">{item.desc}</p>
                <div className="pt-5" style={{ borderTop: '1px solid var(--lp-line)' }}>
                  <p className="text-[1.75rem] font-bold lp-num tracking-[-0.03em]" style={{ color: 'var(--lp-coral)' }}>{item.stat}</p>
                  <p className="lp-micro mt-1">{item.statLabel}</p>
                </div>
              </div>
            ))}
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          FEATURES
         ════════════════════════════════════════════════ */}
      <Section id="features" className="py-24 md:py-32">
        <MotionWrap>
          <div className="mb-16 max-w-2xl">
            <p className="lp-eyebrow">Platform Features</p>
            <h2 className="lp-h2">Everything you need to stay compliant</h2>
            <p className="lp-lead mt-5">
              Six pillars of compliance automation that replace spreadsheets, reduce risk, and make audits effortless.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: 'AI-Powered Compliance Engine',
                desc: 'Deterministic rule scanning plus LLM-powered intent analysis detects violations that keyword matching misses. Supports Gemini, OpenAI, and Anthropic with automatic fallback.',
                badge: 'AI-Enhanced',
              },
              {
                icon: Lock,
                title: 'Immutable Audit Trail',
                desc: 'SHA-256 hash-chained audit logs with evidence snapshots. Every action is cryptographically linked to the previous entry — tamper-evident by design.',
                badge: 'Blockchain-Light',
              },
              {
                icon: Globe2,
                title: 'Multi-Jurisdiction Library',
                desc: 'Pre-built rule sets for NAFDAC, FDA, EMA, WHO, and Pan-African regulations. Automated horizon scanning detects regulatory changes before they impact your campaigns.',
                badge: '4 Jurisdictions',
              },
              {
                icon: BarChart3,
                title: 'Risk Register & Predictive Analytics',
                desc: 'Quantified risk scoring with audience multipliers, platform strictness levels, and trend analysis. Know your compliance posture before regulators do.',
                badge: 'Predictive',
              },
              {
                icon: Scale,
                title: 'Legal Review Workflow',
                desc: 'Multi-step approval pipelines with reviewer assignment, SLA tracking, escalation paths, and signoff management. Full visibility into review bottlenecks.',
                badge: 'Workflow',
              },
              {
                icon: Eye,
                title: 'AI Governance & Usage Tracking',
                desc: 'Track every AI model, prompt, and output used in your organization. Manage AI risk assessments, incidents, and compliance with emerging AI regulations.',
                badge: 'AI Governance',
              },
            ].map((item, i) => (
              <div key={i} className="lp-card lp-card--hover">
                <div className="flex items-start justify-between mb-6">
                  <item.icon className="w-6 h-6 lp-icon" strokeWidth={1.5} />
                  <span className="lp-tag">{item.badge}</span>
                </div>
                <h3 className="lp-h3 mb-3">{item.title}</h3>
                <p className="lp-body">{item.desc}</p>
              </div>
            ))}
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          SOCIAL PROOF
         ════════════════════════════════════════════════ */}
      <Section tone="raised" className="py-24 md:py-32">
        <MotionWrap>
          <div className="mb-16 max-w-2xl">
            <p className="lp-eyebrow">What Leaders Say</p>
            <h2 className="lp-h2">Trusted by compliance teams worldwide</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: 'During our last NAFDAC GMP inspection, the auditors asked for two years of promotional review records. With Criateur OS we pulled every approval, rejection, and revision — with hash-verified timestamps — in under four minutes. Our previous system would have taken the team three days to compile the same evidence.',
                name: 'Dr. Adaeze Okonkwo',
                role: 'Director of Regulatory Compliance',
                company: 'Zenith PharmaCare Ltd, Lagos',
              },
              {
                quote: 'We cut our pre-submission review cycle from 14 business days to 36 hours. The multi-jurisdiction engine flags NAFDAC Ad-Pharma guideline violations and FDA fair-balance issues in the same scan, so our regulatory affairs team in Abuja and our US counsel review one unified report instead of chasing separate spreadsheets.',
                name: 'Chukwuemeka Ifeanyi',
                role: 'VP Regulatory Affairs',
                company: 'Kairos Life Sciences, Abuja',
              },
              {
                quote: 'Last quarter the AI flagged an implied superiority claim buried in a patient leaflet that three rounds of manual review had missed — the kind of violation that carries a minimum N5 million NAFDAC penalty. Criateur OS paid for a full year of licensing with that single catch. Our audit-readiness score went from 62% to 97% in the first 90 days.',
                name: 'Dr. Ngozi Amadi',
                role: 'Head of Pharmacovigilance & Quality',
                company: 'Equinox Biosciences, Port Harcourt',
              },
            ].map((t, i) => (
              <div key={i} className="lp-card flex flex-col">
                <div className="flex gap-1 mb-6">
                  {[...Array(5)].map((_, j) => (
                    <svg key={j} className="w-4 h-4" style={{ color: 'var(--lp-gold)' }} fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="lp-body flex-1" style={{ color: 'var(--lp-t2)' }}>"{t.quote}"</p>
                <div className="mt-7 pt-5" style={{ borderTop: '1px solid var(--lp-line)' }}>
                  <p className="text-[0.9375rem] font-semibold">{t.name}</p>
                  <p className="lp-micro mt-0.5">{t.role}, {t.company}</p>
                </div>
              </div>
            ))}
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          PRICING
         ════════════════════════════════════════════════ */}
      <Section id="pricing" className="py-24 md:py-32">
        <MotionWrap>
          <div className="mb-16 max-w-2xl">
            <p className="lp-eyebrow">Pricing</p>
            <h2 className="lp-h2">Plans that scale with your compliance needs</h2>
            <p className="lp-lead mt-5">No hidden fees. Cancel anytime. All plans include security hardening.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {/* Starter */}
            <div className="lp-card flex flex-col">
              <p className="text-[0.9375rem] font-semibold" style={{ color: 'var(--lp-t2)' }}>Starter</p>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-[2.75rem] font-bold lp-num tracking-[-0.035em] leading-none">$299</span>
                <span className="lp-small">/month</span>
              </div>
              <p className="lp-small mt-3">For teams getting started with compliance automation</p>
              <hr className="my-7" style={{ borderColor: 'var(--lp-line)' }} />
              <ul className="space-y-3.5 text-[0.9375rem] flex-1" style={{ color: 'var(--lp-t2)' }}>
                {['Up to 5 users', '1 brand', 'Core compliance engine', 'NAFDAC rule set', 'Basic audit trail', 'Email support'].map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--lp-mint)' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => scrollTo('cta')} className="lp-btn lp-btn--ghost lp-btn--block mt-9">
                Get Started
              </button>
            </div>

            {/* Growth — Highlighted */}
            <div className="lp-card lp-card--accent relative flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span
                  className="px-3 py-1 text-xs font-semibold rounded-full"
                  style={{ background: 'var(--lp-accent)', color: '#04202F' }}
                >
                  Most Popular
                </span>
              </div>
              <p className="text-[0.9375rem] font-semibold" style={{ color: 'var(--lp-accent)' }}>Growth</p>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-[2.75rem] font-bold lp-num tracking-[-0.035em] leading-none">$799</span>
                <span className="lp-small">/month</span>
              </div>
              <p className="lp-small mt-3">For scaling teams that need the full platform</p>
              <hr className="my-7" style={{ borderColor: 'var(--lp-line)' }} />
              <ul className="space-y-3.5 text-[0.9375rem] flex-1" style={{ color: 'var(--lp-t2)' }}>
                {[
                  'Unlimited users', 'Multiple brands', 'Full compliance engine', 'All jurisdictions (NAFDAC, FDA, EMA, WHO)',
                  'AI-powered analysis', 'Immutable audit trail + export', 'Legal review workflows', 'GRC framework management',
                  'Priority support',
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--lp-accent)' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => scrollTo('cta')} className="lp-btn lp-btn--primary lp-btn--block mt-9">
                Get Started
              </button>
            </div>

            {/* Enterprise */}
            <div className="lp-card flex flex-col">
              <p className="text-[0.9375rem] font-semibold" style={{ color: 'var(--lp-t2)' }}>Enterprise</p>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-[2.75rem] font-bold tracking-[-0.035em] leading-none">Custom</span>
              </div>
              <p className="lp-small mt-3">For organizations with advanced compliance requirements</p>
              <hr className="my-7" style={{ borderColor: 'var(--lp-line)' }} />
              <ul className="space-y-3.5 text-[0.9375rem] flex-1" style={{ color: 'var(--lp-t2)' }}>
                {[
                  'Everything in Growth', 'On-premise deployment option', 'Dedicated Customer Success Manager',
                  'Custom SLA guarantee', 'SSO / SAML integration', 'Custom integrations', 'Regulatory advisory hours',
                  '24/7 phone support',
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-1 shrink-0" style={{ color: 'var(--lp-mint)' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => scrollTo('cta')} className="lp-btn lp-btn--ghost lp-btn--block mt-9">
                Contact Sales
              </button>
            </div>
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          SECURITY
         ════════════════════════════════════════════════ */}
      <Section id="security" tone="raised" className="py-24 md:py-32">
        <MotionWrap>
          <div className="mb-16 max-w-2xl">
            <p className="lp-eyebrow">Security &amp; Compliance</p>
            <h2 className="lp-h2">Enterprise-grade security by default</h2>
            <p className="lp-lead mt-5">
              Every layer of Criateur OS is built with security-first principles mapped to SOC 2 Trust Service Criteria.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            {[
              { icon: ShieldCheck, title: 'SOC 2 Ready', desc: 'Controls mapped to CC6–CC9, A1, C1, PI1' },
              { icon: Lock, title: 'Immutable Audit Trail', desc: 'SHA-256 hash-chained with evidence snapshots' },
              { icon: Server, title: 'End-to-End Encryption', desc: 'TLS 1.3 in transit, AES-256 at rest' },
              { icon: Users, title: 'Role-Based Access', desc: '76 granular permissions across 5 system roles' },
              { icon: Globe2, title: 'GDPR Compliant', desc: 'Data retention, right to erasure, consent management' },
              { icon: Clock, title: '99.9% Uptime SLA', desc: 'Enterprise-tier with 24/7 monitoring' },
            ].map((item, i) => (
              <div key={i} className="lp-card lp-card--hover !p-6">
                <item.icon
                  className="w-6 h-6 mb-4"
                  strokeWidth={1.5}
                  style={{ color: 'var(--lp-mint)' }}
                />
                {/* heading-01 */}
                <h3 className="type-heading-01 mb-1.5">{item.title}</h3>
                <p className="lp-micro">{item.desc}</p>
              </div>
            ))}
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          CTA — Waitlist / Demo Request
         ════════════════════════════════════════════════ */}
      <Section id="cta" className="py-24 md:py-32">
        <MotionWrap>
          <div className="max-w-2xl">
            <div
              className="p-10 md:p-14 rounded-3xl"
              style={{
                border: '1px solid rgba(78, 159, 212,.3)',
                background: 'linear-gradient(180deg, rgba(78, 159, 212,.12) 0%, rgba(14,46,78,.6) 70%)',
              }}
            >
              <Award className="w-10 h-10 mb-6" strokeWidth={1.5} style={{ color: 'var(--lp-accent)' }} />
              <h2 className="lp-h2">Ready to automate compliance?</h2>
              <p className="lp-lead mt-5">
                Join leading pharmaceutical companies that trust Criateur OS. Request a demo or join our early access waitlist.
              </p>

              {!submitted ? (
                <form onSubmit={handleWaitlist} className="mt-9 flex flex-col sm:flex-row gap-3 max-w-md">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lp-t4)' }} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="work@company.com"
                      className="lp-input"
                    />
                  </div>
                  <button type="submit" className="lp-btn lp-btn--primary whitespace-nowrap">
                    Request Demo
                  </button>
                </form>
              ) : (
                <div
                  className="mt-9 p-5 rounded-xl"
                  style={{ background: 'rgba(59,183,94,.12)', border: '1px solid rgba(59,183,94,.3)' }}
                >
                  <CheckCircle2 className="w-6 h-6 mb-2" style={{ color: 'var(--lp-mint)' }} />
                  <p className="font-semibold" style={{ color: 'var(--lp-mint)' }}>You're on the list!</p>
                  <p className="lp-small mt-1">We'll reach out within 24 hours to schedule your demo.</p>
                </div>
              )}

              <p className="lp-micro mt-6">No credit card required. Free 14-day trial on all plans.</p>
            </div>
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          STATS COUNTER
         ════════════════════════════════════════════════ */}
      <Section
        className="py-20 md:py-24"
        // hairline band top and bottom, so the numbers read as a ledger strip
      >
        <div style={{ borderTop: '1px solid var(--lp-line)', borderBottom: '1px solid var(--lp-line)' }} className="py-16">
          <MotionWrap>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
              {[
                { target: 140, suffix: '+', label: 'Database Tables' },
                { target: 60, suffix: '+', label: 'Modules' },
                { target: 19, suffix: '', label: 'Edge Functions' },
                { target: 39, suffix: '', label: 'Tests Passing' },
              ].map((s, i) => (
                <div key={i}>
                  <p
                    className="text-[2.5rem] md:text-[3.25rem] font-bold lp-num tracking-[-0.035em] leading-none"
                    style={{ color: 'var(--lp-accent)' }}
                  >
                    <AnimatedCounter target={s.target} suffix={s.suffix} />
                  </p>
                  <p className="lp-small mt-3">{s.label}</p>
                </div>
              ))}
            </div>
          </MotionWrap>
        </div>
      </Section>

      {/* ════════════════════════════════════════════════
          FOOTER
         ════════════════════════════════════════════════ */}
      <footer style={{ background: 'var(--lp-bg-deep)', borderTop: '1px solid var(--lp-line)' }}>
        <div className="lp-container lp-section py-16">
          <div className="grid md:grid-cols-4 gap-10">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <ShieldCheck className="w-6 h-6" style={{ color: 'var(--lp-accent)' }} />
                <span className="font-bold tracking-[-0.02em]">
                  Criateur <span style={{ color: 'var(--lp-accent)' }}>OS</span>
                </span>
              </div>
              <p className="lp-small">
                The Compliance Operating System for regulated industries. Built for pharmaceutical and healthcare companies worldwide.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] mb-5" style={{ color: 'var(--lp-t4)' }}>Product</p>
              <ul className="space-y-3 text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>
                <li><button onClick={() => scrollTo('features')} className="hover:text-white transition">Features</button></li>
                <li><button onClick={() => scrollTo('pricing')} className="hover:text-white transition">Pricing</button></li>
                <li><button onClick={() => scrollTo('security')} className="hover:text-white transition">Security</button></li>
                <li><button onClick={() => scrollTo('cta')} className="hover:text-white transition">Request Demo</button></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] mb-5" style={{ color: 'var(--lp-t4)' }}>Company</p>
              <ul className="space-y-3 text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>
                <li><span className="hover:text-white transition cursor-pointer">About</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Careers</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Blog</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Contact</span></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] mb-5" style={{ color: 'var(--lp-t4)' }}>Legal</p>
              <ul className="space-y-3 text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>
                <li><span className="hover:text-white transition cursor-pointer">Privacy Policy</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Terms of Service</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Security Policy</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Cookie Policy</span></li>
              </ul>
            </div>
          </div>

          <hr className="my-11" style={{ borderColor: 'var(--lp-line)' }} />

          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="lp-micro">&copy; {new Date().getFullYear()} Criateur. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <span className="lp-micro flex items-center gap-1.5">
                <ExternalLink className="w-3 h-3" />
                <a
                  href="https://github.com/CreativeCriateur/Compliance-Governance-OS"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition"
                >
                  GitHub
                </a>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
