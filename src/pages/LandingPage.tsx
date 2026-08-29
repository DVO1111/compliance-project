import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CheckCircle2, Mail } from 'lucide-react';
import {
  MarketingStyles, MarketingNav, MarketingFooter, Section,
  scrollToId, useScrollToTopOnMount, type MarketingPage,
} from './landing/shell';
import { useWaitlistSubmit } from './landing/useWaitlistSubmit';
import {
  BatchRecordCard, InProcessCheck, QualityLifecycle, CtdDossier, RecallTrace,
} from './landing/mockups';

/**
 * Page 1 — Home.
 *
 * Ported from the landing-page design source, value for value: type sizes,
 * tracking, the alternating section grounds, and the hero's gradient stack.
 *
 * One deliberate departure. The design's calls to action are anchors to a
 * #demo section that is purely a closing statement — there is no form behind
 * them. The waitlist is real and writes to Supabase, so the closing section
 * keeps the design's two buttons and uses them as the intent choice, with the
 * email field directly beneath. Nothing else changes.
 */

const mono = (size: number, tracking: number): CSSProperties => ({
  fontFamily: 'var(--lp-font-mono)',
  fontSize: size,
  letterSpacing: `${tracking}em`,
});

/** Section eyebrow: mono, uppercase, in the band's own accent. */
function Eyebrow({ tone = 'green', children }: { tone?: 'green' | 'blue'; children: ReactNode }) {
  return (
    <div
      style={{
        ...mono(11, 0.16),
        textTransform: 'uppercase',
        color: tone === 'green' ? 'var(--lp-green-glow)' : 'var(--lp-periwinkle)',
        marginBottom: 18,
      }}
    >
      {children}
    </div>
  );
}

/* The page alternates between a green-cast and a blue-cast band, each fading
   in and out of the seam colour at its edges rather than butting up hard. */
const band = (tone: 'green' | 'blue' | 'base'): CSSProperties => {
  const mid = tone === 'green' ? 'var(--lp-sec-green)' : tone === 'blue' ? 'var(--lp-sec-blue)' : 'var(--lp-bg)';
  return {
    background: `linear-gradient(180deg, var(--lp-seam) 0%, ${mid} 26%, ${mid} 74%, var(--lp-seam) 100%)`,
  };
};

const SECTION_PAD = 'clamp(64px,7vw,86px) clamp(20px,4vw,40px)';
const CONTAINER: CSSProperties = { maxWidth: 1240, margin: '0 auto' };

const H2: CSSProperties = {
  fontFamily: 'var(--lp-font-display)',
  fontSize: 'clamp(27px,3.2vw,37px)',
  fontWeight: 600,
  fontStretch: '90%',
  lineHeight: 1.1,
  letterSpacing: '-0.018em',
  margin: '0 0 16px',
  maxWidth: '22ch',
  textWrap: 'balance' as CSSProperties['textWrap'],
};

const LEAD: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.62,
  color: 'var(--lp-dim)',
  margin: 0,
  maxWidth: '46ch',
};

/* ── How it works ───────────────────────────────── */
const STEPS = [
  {
    n: '01', title: 'Run', num: 'var(--lp-green-glow)',
    fill: 'rgba(71,141,75,0.15)', line: 'rgba(71,141,75,0.28)',
    body: 'Capture production and quality workflows at the point of work. Operators execute batch records and line clearances directly on the factory floor without waiting for end-of-shift paperwork.',
  },
  {
    n: '02', title: 'Control', num: '#9DB6EE',
    fill: 'rgba(63,106,201,0.15)', line: 'rgba(63,106,201,0.3)',
    body: 'Automatically connect deviations to root causes and CAPA workflows. Enforce strict, role-based approval hierarchies so critical data never sits in isolated spreadsheets.',
  },
  {
    n: '03', title: 'Prove', num: '#F5A860',
    fill: 'rgba(240,129,40,0.15)', line: 'rgba(240,129,40,0.32)',
    body: 'Assemble sealed inspection packages and NAFDAC dossiers in minutes. Never scramble to reconstruct evidence for an auditor again.',
  },
] as const;

/* ── The four capabilities ──────────────────────── */
const CAPABILITIES: {
  id: string;
  tone: 'green' | 'blue';
  label: string;
  heading: ReactNode;
  body: string;
  points: { title: string; detail: string }[];
  mockup: ReactNode;
  /** Mockup on the left, copy on the right. */
  flip?: boolean;
}[] = [
  {
    id: 'manufacturing', tone: 'green', label: 'Manufacturing',
    heading: 'Digitize batch manufacturing records without sacrificing line control.',
    body: 'Operators log production steps and in-process quality checks directly at their floor workstations. If a parameter strays out of specification, the system flags it immediately.',
    points: [
      { title: 'Enforced Line Clearance', detail: 'Mandate verified area line clearances before a new production run begins.' },
      { title: 'Dual Sign-Off Controls', detail: 'Require QA supervisor authorization to close critical processing steps.' },
      { title: 'Instant Yield Reconciliation', detail: 'Detect material variances immediately before a batch advances.' },
    ],
    mockup: <InProcessCheck />,
  },
  {
    id: 'quality', tone: 'blue', label: 'Quality events', flip: true,
    heading: 'Connect deviations directly to root-cause investigations.',
    body: 'Criateur links the complete quality lifecycle—from initial issue to formal investigation to corrective action—governed by strict role-based access.',
    points: [
      { title: 'Structured Root Cause Analysis', detail: 'Enforce standardized 5-Why methodologies instead of unstructured text entries.' },
      { title: 'Automated Effectiveness Verification', detail: 'Schedule risk-based follow-up audits automatically upon CAPA closure.' },
      { title: 'Strict Role Gating', detail: 'Prevent unauthorized personnel from closing or overriding open quality events.' },
    ],
    mockup: <QualityLifecycle />,
  },
  {
    id: 'regulatory', tone: 'green', label: 'Regulatory affairs',
    heading: <>Manage submission dossiers on NAFDAC&rsquo;s exact terms.</>,
    body: 'Criateur mirrors the true review sequences of Nigerian regulatory agencies, ensuring filings and renewals are never delayed by formatting errors.',
    points: [
      { title: 'CTD Dossiers', detail: 'Structure regulatory documentation exactly to agency submission standards.' },
      { title: 'NAPAMS Clock Tracking', detail: 'Pause application timers during compliance directives rather than restarting the process.' },
      { title: '12-Month Renewal Alerts', detail: 'Trigger automated preparation workflows 12 months in advance of license expiration.' },
    ],
    mockup: <CtdDossier />,
  },
  {
    id: 'audit', tone: 'blue', label: 'Audit & recall', flip: true,
    heading: 'Generate NAFDAC-ready mock recall reports in 60 seconds.',
    body: 'Transform high-stress regulatory drills into a single-click export. Trace forward from a raw material lot to every finished batch, and backward to the exact equipment and shift used.',
    points: [
      { title: 'Bidirectional Traceability', detail: 'Map raw material lots directly to distributed finished units in real time.' },
      { title: 'Mock Recall Engine', detail: 'Compile complete recall dossiers, distribution logs, and contact lists instantly.' },
      { title: 'Cryptographic CoAs', detail: 'Automatically issue Certificates of Analysis with embedded QR verification.' },
    ],
    mockup: <RecallTrace />,
  },
];

const ANCHORS = ['NAFDAC GMP', 'SON MANCAP & NIS', 'ISO 22000', 'PCN Regulations', 'HACCP'];

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToSignup: () => void;
  onNavigateToPage: (page: MarketingPage) => void;
}

export default function LandingPage({ onNavigateToLogin, onNavigateToPage }: LandingPageProps) {
  useScrollToTopOnMount();
  const [email, setEmail] = useState('');
  const { send, submitted, sending, error: submitError } = useWaitlistSubmit('home');
  const [intent, setIntent] = useState<'demo' | 'waitlist'>('demo');
  const emailRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || !email.trim()) return;
    await send({ intent, email });
  };

  const requestAccess = (next: 'demo' | 'waitlist') => {
    setIntent(next);
    scrollToId('demo');
    window.setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 600);
  };

  return (
    <div className="lp-root">
      <MarketingStyles />

      <MarketingNav
        onHome={() => scrollToId('top')}
        onLogin={onNavigateToLogin}
        onCta={() => requestAccess('demo')}
        ctaLabel="Book a Factory Demo"
        links={[
          { label: 'Platform', onClick: () => onNavigateToPage('platform') },
          { label: "Who it's for", onClick: () => onNavigateToPage('who') },
          { label: 'About', onClick: () => onNavigateToPage('about') },
          { label: 'Contact', onClick: () => onNavigateToPage('contact') },
        ]}
      />

      <div id="top" />

      {/* ════════════════════════════════════════════════
          HERO
         ════════════════════════════════════════════════ */}
      <header
        style={{
          background:
            'radial-gradient(110% 130% at 88% 4%, rgba(71,141,75,0.34) 0%, rgba(30,86,32,0.12) 40%, rgba(8,19,26,0) 74%), linear-gradient(158deg, #0B1E1D 0%, #0A1722 52%, #0B1A21 100%)',
          color: 'var(--lp-paper)',
          paddingTop: 64,
        }}
      >
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Six vertical rules, like a plant drawing's column grid. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: 'linear-gradient(to right, rgba(207,222,255,0.055) 1px, transparent 1px)',
              backgroundSize: 'calc(100% / 6) 100%',
              backgroundPosition: 'center top',
            }}
          />
          {/* The horizon: a lit arc the hero content sits above. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', left: '50%', bottom: -190, width: 'min(1180px,140%)', height: 420,
              transform: 'translateX(-50%)', pointerEvents: 'none', borderRadius: '50%',
              borderTop: '1px solid rgba(126,196,140,0.55)',
              background: 'radial-gradient(60% 90% at 50% 0%, rgba(71,141,75,0.30) 0%, rgba(71,141,75,0.05) 45%, transparent 72%)',
              filter: 'blur(0.2px)',
            }}
          />

          <div
            style={{
              ...CONTAINER, position: 'relative',
              padding: 'clamp(56px,7vw,92px) clamp(20px,4vw,40px) clamp(64px,7vw,96px)',
              textAlign: 'center',
            }}
          >
            <div
              className="inline-flex items-center"
              style={{
                gap: 10, ...mono(10.5, 0.16), textTransform: 'uppercase',
                color: 'rgba(207,222,255,0.78)', border: '1px solid rgba(207,222,255,0.16)',
                background: 'rgba(255,255,255,0.03)', padding: '7px 14px', borderRadius: 999,
                marginBottom: 30,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--lp-green-glow)', flexShrink: 0 }} />
              Regulated manufacturing · NAFDAC &amp; SON
            </div>

            <h1
              style={{
                fontFamily: 'var(--lp-font-display)',
                fontSize: 'clamp(34px,5.4vw,62px)', fontWeight: 600, fontStretch: '88%',
                lineHeight: 1.04, letterSpacing: '-0.022em',
                margin: '0 auto 22px', maxWidth: '24ch',
                textWrap: 'balance' as CSSProperties['textWrap'],
              }}
            >
              Execute quality. Control compliance.{' '}
              <span style={{ color: 'var(--lp-green-glow)' }}>Prove it instantly.</span>
            </h1>

            <p
              style={{
                fontSize: 16.5, lineHeight: 1.62, color: 'rgba(207,222,255,0.74)',
                maxWidth: '58ch', margin: '0 auto 34px',
                textWrap: 'pretty' as CSSProperties['textWrap'],
              }}
            >
              The operating system for regulated manufacturing. The fastest way to achieve
              NAFDAC, GMP, and SON compliance without slowing down your production lines.
            </p>

            <div
              className="flex flex-wrap items-center justify-center"
              style={{ gap: 12, marginBottom: 'clamp(44px,5vw,60px)' }}
            >
              <button
                onClick={() => requestAccess('waitlist')}
                className="whitespace-nowrap shrink-0 inline-flex items-center transition"
                style={{
                  border: '1px solid var(--lp-green)', background: 'rgba(71,141,75,0.1)',
                  color: 'var(--lp-green-glow)', padding: '13px 24px',
                  fontSize: 15, fontWeight: 600, borderRadius: 8,
                }}
              >
                Join the Waitlist
              </button>
              <button
                onClick={() => requestAccess('demo')}
                className="whitespace-nowrap shrink-0 inline-flex items-center transition"
                style={{
                  background: 'var(--lp-green)', color: 'var(--lp-paper)', padding: '13px 26px',
                  fontSize: 15, fontWeight: 600, borderRadius: 8,
                  boxShadow: '0 0 0 5px rgba(71,141,75,0.14), 0 16px 34px -16px rgba(71,141,75,0.6)',
                }}
              >
                Book a Factory Demo
              </button>
            </div>

            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <BatchRecordCard />
            </div>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════
          PROOF BAR
         ════════════════════════════════════════════════ */}
      <section
        style={{ background: 'linear-gradient(180deg,var(--lp-seam) 0%,var(--lp-bg) 30%,var(--lp-bg) 70%,var(--lp-seam) 100%)' }}
      >
        <div
          className="flex flex-wrap items-center justify-center"
          style={{ maxWidth: 1000, margin: '0 auto', padding: '34px clamp(20px,4vw,40px)', gap: '14px 22px', textAlign: 'center' }}
        >
          <span style={{ ...mono(10.5, 0.16), textTransform: 'uppercase', color: 'var(--lp-green-glow)', whiteSpace: 'nowrap' }}>
            Built with practitioners
          </span>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--lp-t2)', margin: 0, maxWidth: '70ch' }}>
            Built in partnership with quality and regulatory practitioners from Nigeria&rsquo;s
            leading pharmaceutical and food manufacturers.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          HOW IT WORKS
         ════════════════════════════════════════════════ */}
      <section id="how" style={band('blue')}>
        <div style={{ ...CONTAINER, padding: 'clamp(72px,8vw,92px) clamp(20px,4vw,40px)' }}>
          <div style={{ ...mono(11, 0.16), textTransform: 'uppercase', color: 'var(--lp-green-glow)', marginBottom: 20 }}>
            How it works
          </div>
          <h2
            style={{
              fontFamily: 'var(--lp-font-display)', fontSize: 'clamp(29px,3.6vw,42px)',
              fontWeight: 600, fontStretch: '90%', lineHeight: 1.08, letterSpacing: '-0.018em',
              margin: '0 0 46px', maxWidth: '30ch',
              textWrap: 'balance' as CSSProperties['textWrap'],
            }}
          >
            Turn compliance from a high-stress drill into a daily operational discipline.
          </h2>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(272px,1fr))', gap: 20 }}>
            {STEPS.map((s) => (
              <div
                key={s.title}
                style={{ background: s.fill, border: `1px solid ${s.line}`, borderRadius: 12, padding: '28px 26px 30px' }}
              >
                <div className="flex items-baseline" style={{ gap: 12, marginBottom: 12 }}>
                  <span style={{ ...mono(11, 0.14), color: s.num }}>{s.n}</span>
                  <h3 style={{ fontFamily: 'var(--lp-font-display)', fontSize: 25, fontWeight: 600, fontStretch: '94%', margin: 0, lineHeight: 1.2 }}>
                    {s.title}
                  </h3>
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--lp-t2)', margin: 0 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          THE FOUR CAPABILITIES
         ════════════════════════════════════════════════ */}
      {CAPABILITIES.map((cap) => (
        <section key={cap.id} id={cap.id} style={band(cap.tone)}>
          <div style={{ ...CONTAINER, padding: SECTION_PAD }}>
            <div
              className="grid items-center"
              style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 'clamp(36px,4vw,56px)' }}
            >
              <div style={cap.flip ? { order: 2 } : undefined}>
                <Eyebrow tone={cap.tone}>{cap.label}</Eyebrow>
                <h2 style={H2}>{cap.heading}</h2>
                <p style={LEAD}>{cap.body}</p>

                <div className="flex flex-col" style={{ gap: 15, marginTop: 26 }}>
                  {cap.points.map((p) => (
                    <div key={p.title} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 13, alignItems: 'start' }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 5, height: 5, borderRadius: 1, marginTop: 8, flexShrink: 0,
                          background: cap.tone === 'green' ? 'var(--lp-green-glow)' : 'var(--lp-periwinkle)',
                        }}
                      />
                      <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0, color: 'var(--lp-t2)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--lp-paper)' }}>{p.title}:</span> {p.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={cap.flip ? { order: 1 } : undefined}>{cap.mockup}</div>
            </div>
          </div>
        </section>
      ))}

      {/* ════════════════════════════════════════════════
          COMPLIANCE ANCHORS
         ════════════════════════════════════════════════ */}
      <section id="frameworks" style={band('green')}>
        <div style={{ ...CONTAINER, padding: 'clamp(64px,7vw,84px) clamp(20px,4vw,40px)', textAlign: 'center' }}>
          <div style={{ ...mono(11, 0.16), textTransform: 'uppercase', color: 'var(--lp-green-glow)', marginBottom: 20 }}>
            Compliance anchors
          </div>
          <h2
            style={{
              fontFamily: 'var(--lp-font-display)', fontSize: 'clamp(28px,3.4vw,40px)',
              fontWeight: 600, fontStretch: '90%', lineHeight: 1.08, letterSpacing: '-0.018em',
              margin: '0 auto 40px', maxWidth: '26ch',
              textWrap: 'balance' as CSSProperties['textWrap'],
            }}
          >
            Built specifically for the regulatory frameworks you answer to.
          </h2>

          <div className="flex flex-wrap justify-center" style={{ gap: 12 }}>
            {ANCHORS.map((a) => (
              <span
                key={a}
                className="inline-flex items-center whitespace-nowrap"
                style={{
                  gap: 10, border: '1px solid rgba(126,196,140,0.3)', background: 'rgba(71,141,75,0.12)',
                  borderRadius: 8, padding: '13px 20px', ...mono(12.5, 0.1),
                  textTransform: 'uppercase', color: 'rgba(207,222,255,0.92)',
                }}
              >
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 1, background: 'var(--lp-green-glow)', flexShrink: 0 }} />
                {a}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════
          CLOSING CTA
          The design's two buttons become the intent choice; the email field
          under them is what actually reaches the waitlist.
         ════════════════════════════════════════════════ */}
      <section
        id="demo"
        style={{ background: 'linear-gradient(180deg,var(--lp-seam) 0%,var(--lp-bg) 34%,var(--lp-bg) 100%)', color: 'var(--lp-paper)' }}
      >
        <div style={{ ...CONTAINER, padding: '80px clamp(20px,4vw,40px) 0' }}>
          <div
            style={{
              position: 'relative', overflow: 'hidden', borderRadius: 20,
              border: '1px solid rgba(126,196,140,0.18)',
              background:
                'radial-gradient(120% 150% at 8% 0%, rgba(71,141,75,0.42) 0%, rgba(30,86,32,0.16) 38%, rgba(12,26,34,0) 72%), linear-gradient(160deg, #10241F 0%, #0C1A22 58%, #0B1A21 100%)',
              padding: 'clamp(48px,7vw,96px) clamp(24px,5vw,72px)',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--lp-font-display)', fontSize: 'clamp(32px,4.6vw,52px)',
                fontWeight: 600, fontStretch: '90%', lineHeight: 1.06, letterSpacing: '-0.02em',
                margin: '0 auto 20px', maxWidth: '22ch',
                textWrap: 'balance' as CSSProperties['textWrap'],
              }}
            >
              Stop preparing for compliance.{' '}
              <span style={{ color: 'var(--lp-green-glow)' }}>Start operating with it.</span>
            </h2>
            <p style={{ fontSize: 16.5, lineHeight: 1.62, color: 'rgba(207,222,255,0.72)', margin: '0 auto 34px', maxWidth: '52ch' }}>
              Join the limited first cohort of Nigerian manufacturers using the future of
              African quality assurance.
            </p>

            {!submitted ? (
              <form onSubmit={handleSubmit}>
                <div
                  className="flex flex-wrap items-center justify-center"
                  style={{ gap: 14 }}
                  role="radiogroup"
                  aria-label="What would you like to do?"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={intent === 'demo'}
                    onClick={() => setIntent('demo')}
                    className="inline-flex items-center whitespace-nowrap transition"
                    style={{
                      gap: 12, background: 'var(--lp-green)', color: 'var(--lp-paper)',
                      padding: '8px 24px 8px 8px', fontSize: 16, fontWeight: 600, borderRadius: 8,
                      boxShadow: intent === 'demo'
                        ? '0 0 0 6px rgba(71,141,75,0.16), 0 18px 40px -18px rgba(71,141,75,0.7)'
                        : 'none',
                      opacity: intent === 'demo' ? 1 : 0.72,
                    }}
                  >
                    <span
                      style={{
                        width: 34, height: 34, borderRadius: 6, background: 'var(--lp-bg)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7EC48C" strokeWidth="1.8" aria-hidden="true">
                        <path d="M5 12h13M12 5l7 7-7 7" />
                      </svg>
                    </span>
                    Book a Factory Demo
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={intent === 'waitlist'}
                    onClick={() => setIntent('waitlist')}
                    className="inline-flex items-center whitespace-nowrap transition"
                    style={{
                      border: '1px solid var(--lp-green)', background: 'rgba(71,141,75,0.1)',
                      color: 'var(--lp-green-glow)', padding: '0 26px', minHeight: 50,
                      fontSize: 16, fontWeight: 600, borderRadius: 8,
                      opacity: intent === 'waitlist' ? 1 : 0.72,
                    }}
                  >
                    Join the Waitlist
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row" style={{ gap: 12, maxWidth: 440, margin: '20px auto 0' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lp-t4)' }} />
                    <input
                      ref={emailRef}
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="work@company.com"
                      aria-label="Work email"
                      className="lp-input"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={sending}
                    className="whitespace-nowrap inline-flex items-center justify-center transition"
                    style={{
                      background: 'var(--lp-green)', color: 'var(--lp-paper)', padding: '0 24px',
                      minHeight: 48, fontSize: 15, fontWeight: 600, borderRadius: 8,
                      opacity: sending ? 0.7 : 1, cursor: sending ? 'progress' : 'pointer',
                    }}
                  >
                    {sending ? 'Sending…' : intent === 'demo' ? 'Book demo' : 'Join waitlist'}
                  </button>
                </div>

                {submitError && (
                  <p className="lp-field-error" role="alert" style={{ marginTop: 12 }}>{submitError}</p>
                )}
              </form>
            ) : (
              <div
                style={{
                  maxWidth: 440, margin: '0 auto', padding: 20, borderRadius: 12, textAlign: 'left',
                  background: 'rgba(125,224,168,.10)', border: '1px solid rgba(125,224,168,.30)',
                }}
              >
                <CheckCircle2 className="w-6 h-6 mb-2" style={{ color: 'var(--lp-mint)' }} />
                <p style={{ fontWeight: 600, color: 'var(--lp-mint)' }}>
                  {intent === 'demo' ? "You're booked in." : "You're on the list."}
                </p>
                <p className="lp-small" style={{ marginTop: 4 }}>
                  We&rsquo;ll reach out to {email} to arrange the next step.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <MarketingFooter onNavigate={onNavigateToPage} onCta={() => requestAccess('demo')} />
    </div>
  );
}

/* `Section` is re-exported by the shell for the other pages; this one lays
   its sections out directly so the design's per-band gradients survive. */
void Section;
