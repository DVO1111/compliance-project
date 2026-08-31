import { useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Mail } from 'lucide-react';
import {
  MarketingStyles, MarketingNav, MarketingFooter, MotionWrap, Section,
  scrollToId, useScrollToTopOnMount, type MarketingPage,
} from './landing/shell';
import { useWaitlistSubmit } from './landing/useWaitlistSubmit';

/* ── Block 2: the sector grid ─────────────────── */
const SECTORS = [
  {
    title: 'Pharmaceutical Manufacturers',
    tagline: 'Execute end-to-end GMP compliance on the plant floor.',
    body: 'Built around how pharmaceutical quality operations run. Manage GMP inspections, electronic Batch Manufacturing Records (eBMR), NAFDAC product registrations, and PCN obligations without relying on rigid, generic ERPs.',
  },
  {
    title: 'Food & Beverage Manufacturers',
    tagline: 'Control quality and safety across every production line.',
    body: 'Streamline NAFDAC food registration, SON MANCAP, and NIS compliance requirements. Enforce HACCP critical control points, allergen declarations, and supplier audits across multi-site manufacturing plants.',
  },
  {
    title: 'Importers & Distributors',
    tagline: 'Master every license, permit, and supply chain obligation.',
    body: 'Maintain complete control over the compliance lifecycle for every product you import and distribute. Track product registrations, import permits, SONCAP clearance, and post-market surveillance inside one centralized platform.',
  },
] as const;

/* ── Block 3: the personas ────────────────────────
   Four roles, each with the same shape. The deck stacks them; the page
   presents them as a chooser instead — on a page whose whole question is
   "which of these are you?", making the reader pick is the point, and it
   keeps four near-identical blocks from reading as one long scroll. */
const PERSONAS = [
  {
    tab: 'Quality Assurance',
    label: 'For Quality Assurance',
    heading: 'See the state of quality. Stop reconstructing it.',
    body: 'Know your audit readiness long before you schedule an auditor. Criateur gives QA leaders complete, real-time visibility into active operations.',
    points: [
      { title: 'Surface Bottlenecks', detail: 'View the exact status of every batch, deviation, and CAPA in one centralized dashboard.' },
      { title: 'Enforce Line Discipline', detail: 'Prevent unauthorized overrides or premature quality event sign-offs through strict step-level role gating.' },
      { title: 'Prove Compliance Instantly', detail: 'Assemble sealed, inspect-ready audit packages for NAFDAC inspections without manually retrieving physical files.' },
    ],
  },
  {
    tab: 'Regulatory Affairs',
    label: 'For Regulatory Affairs',
    heading: 'Know what is due before it becomes urgent.',
    body: "Stop relying on static spreadsheets to protect your company's commercial licenses. Track every dossier, permit, and submission from a single platform.",
    points: [
      { title: 'Complete Submissions', detail: 'Keep CTD dossiers structured and visible while automatically blocking incomplete applications.' },
      { title: 'Track NAPAMS in Real Time', detail: 'Know exactly where an application sits, what documentation it is waiting on, and when a compliance directive arrives.' },
      { title: 'Never Miss Renewals', detail: 'Trigger automated renewal workflows 12 months out, aligning with actual NAFDAC processing timelines.' },
    ],
  },
  {
    tab: 'Production',
    label: 'For Production Managers',
    heading: 'Unblock the factory floor. Capture work in real time.',
    body: 'Eliminate production bottlenecks by capturing floor data as work happens. Operators execute checks directly at their workstations without waiting for manual QA sign-offs.',
    points: [
      { title: 'Digitize the eBMR', detail: 'Execute batch manufacturing records and line clearances directly from the workstation floor.' },
      { title: 'Instant In-Process Checks', detail: 'Surface out-of-specification results immediately on the line instead of discovering them at the end of the shift.' },
      { title: 'Reduce Admin Overhead', detail: 'Eliminate end-of-shift paperwork backlogs and reconstruct batch history with total accuracy.' },
    ],
  },
  {
    tab: 'Managing Directors',
    label: 'For Managing Directors',
    heading: 'Understand your exposure without asking for a report.',
    body: "Gain an accurate view of your facility's regulatory posture without waiting for compiled manual reports.",
    points: [
      { title: 'Executive Visibility', detail: 'Spot overdue CAPAs, expiring licenses, and failed batches across all plant locations in real time.' },
      { title: 'Standardize Operations', detail: 'Ensure every facility operates on the same governed SOPs and strict approval hierarchies.' },
      { title: 'Protect Revenue & Reputation', detail: 'Prevent costly product recalls, regulatory fines, and batch rejections by catching root causes early.' },
    ],
  },
] as const;

interface WhoItsForPageProps {
  onNavigateToLogin: () => void;
  onRequestInfo: () => void;
  onNavigateToPage: (page: MarketingPage) => void;
}

/** Page 3 of the marketing deck — Who It's For. */
export default function WhoItsForPage({ onNavigateToLogin, onRequestInfo, onNavigateToPage }: WhoItsForPageProps) {
  useScrollToTopOnMount();
  const reduceMotion = useReducedMotion();

  const [persona, setPersona] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [email, setEmail] = useState('');
  const { send, submitted, sending, error: submitError } = useWaitlistSubmit('who-its-for');
  const [intent, setIntent] = useState<'waitlist' | 'team'>('waitlist');
  const emailRef = useRef<HTMLInputElement>(null);

  const INTENT_LABEL: Record<typeof intent, string> = {
    waitlist: 'Join the Waitlist',
    team: 'Speak with Our Team',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || !email.trim()) return;
    await send({ intent, email });
  };

  const requestAccess = (next: typeof intent) => {
    setIntent(next);
    scrollToId('cta');
    window.setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 600);
  };

  /* A tablist is arrow-navigable, not tab-navigable, between tabs. */
  const onTabKeyDown = (e: React.KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + PERSONAS.length) % PERSONAS.length;
    setPersona(next);
    tabRefs.current[next]?.focus();
  };

  const active = PERSONAS[persona];

  return (
    <div className="lp-root">
      <MarketingStyles />

      <MarketingNav
        onHome={() => onNavigateToPage('home')}
        onLogin={onNavigateToLogin}
        onRequestInfo={onRequestInfo}
        onCta={() => requestAccess('waitlist')}
        ctaLabel="Join the Waitlist"
        links={[
          { label: 'Home', onClick: () => onNavigateToPage('home') },
          { label: 'Platform', onClick: () => onNavigateToPage('platform') },
          { label: "Who it's for", onClick: () => scrollToId('sectors'), active: true },
          { label: 'About', onClick: () => onNavigateToPage('about') },
          { label: 'Contact', onClick: () => onNavigateToPage('contact') },
        ]}
      />

      {/* ════════════════════════════════════════════════
          BLOCK 1 — HERO
         ════════════════════════════════════════════════ */}
      <Section className="pt-[132px] pb-14 md:pt-[164px] md:pb-16 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            className="absolute -top-40 left-1/3 w-[560px] h-[560px] rounded-full blur-[140px] animate-[orbFloat_9s_ease-in-out_infinite]"
            style={{ background: 'radial-gradient(closest-side, rgba(71,141,75,0.28), transparent 74%)' }}
          />
        </div>

        <MotionWrap className="relative z-10">
          <h1 className="lp-display max-w-[47rem]">
            Built for the teams carrying <em>the regulatory risk.</em>
          </h1>
          <p className="lp-lead mt-7 max-w-2xl">
            Criateur replaces fragile paper records with strict, automated compliance
            workflows. Designed specifically for QA leads, regulatory officers, and plant
            managers.
          </p>
          <div className="mt-10">
            <button onClick={() => requestAccess('waitlist')} className="lp-btn lp-btn--primary">
              Join the Waitlist
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          BLOCK 2 — BY INDUSTRY
         ════════════════════════════════════════════════ */}
      <Section id="sectors" tone="raised" className="py-20 md:py-24">
        <MotionWrap>
          <h2 className="lp-h2 max-w-3xl">Three distinct operations. One compliance engine.</h2>
          <p className="lp-lead mt-5">Built for three distinct regulated sectors.</p>
        </MotionWrap>

        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {SECTORS.map((s, i) => (
            <MotionWrap key={s.title} delay={i * 0.08}>
              <div className="lp-card lp-card--hover h-full p-7 flex flex-col">
                <h3 className="lp-h3">{s.title}</h3>
                <p className="lp-body mt-3" style={{ color: 'var(--lp-accent)' }}>{s.tagline}</p>
                <p className="lp-body mt-4">{s.body}</p>
              </div>
            </MotionWrap>
          ))}
        </div>
      </Section>

      {/* ════════════════════════════════════════════════
          BLOCK 3 — THE PERSONAS
         ════════════════════════════════════════════════ */}
      <Section id="roles" className="py-24 md:py-28">
        <MotionWrap>
          <p className="lp-step-label">By role</p>
          <h2 className="lp-h2 mt-4 max-w-3xl">What the platform does for your desk.</h2>

          <div
            role="tablist"
            aria-label="Choose a role"
            className="mt-10 flex flex-wrap gap-2"
          >
            {PERSONAS.map((p, i) => (
              <button
                key={p.tab}
                ref={(el) => { tabRefs.current[i] = el; }}
                role="tab"
                id={`persona-tab-${i}`}
                aria-selected={persona === i}
                aria-controls={`persona-panel-${i}`}
                tabIndex={persona === i ? 0 : -1}
                onClick={() => setPersona(i)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
                className="lp-btn"
                style={
                  persona === i
                    ? { background: 'var(--lp-accent-soft)', border: '1px solid var(--lp-accent)', color: 'var(--lp-t1)' }
                    : { background: 'transparent', border: '1px solid var(--lp-line-strong)', color: 'var(--lp-t3)' }
                }
              >
                {p.tab}
              </button>
            ))}
          </div>

          {/* min-height holds the section still while panels swap, so the
              page below does not jump when a shorter role is selected. */}
          <div className="mt-10 min-h-[320px] md:min-h-[260px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.tab}
                id={`persona-panel-${persona}`}
                role="tabpanel"
                aria-labelledby={`persona-tab-${persona}`}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
                  <div>
                    <p className="lp-step-label">{active.label}</p>
                    <h3 className="lp-h2-sm mt-4">{active.heading}</h3>
                    <p className="lp-lead mt-5">{active.body}</p>
                  </div>

                  <div className="lp-card p-7 md:p-8 space-y-5">
                    {active.points.map((p) => (
                      <div key={p.title} className="lp-bullet">
                        <span className="lp-bullet-dot" aria-hidden="true" />
                        <p className="lp-body">
                          <span style={{ color: 'var(--lp-t1)', fontWeight: 600 }}>{p.title}:</span>{' '}
                          {p.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          BLOCK 4 — THE SCALE ARGUMENT
         ════════════════════════════════════════════════ */}
      <Section tone="raised" className="py-20 md:py-24">
        <MotionWrap>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            <h2 className="lp-h2">From a single line to a multi-site group.</h2>
            <p className="lp-lead">
              Whether you run a single facility or a conglomerate operating multiple plants
              across different states, Criateur scales with your operations. Local site teams
              get location-specific workflows, while executive leadership gets a consolidated
              view across the entire group.
            </p>
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          BLOCK 5 — BOTTOM OF FUNNEL
         ════════════════════════════════════════════════ */}
      <Section id="cta" className="py-24 md:py-32">
        <MotionWrap>
          <div className="max-w-2xl">
            <h2 className="lp-h2">Ready to eliminate compliance friction?</h2>
            <p className="lp-lead mt-5">
              Join the food and pharma operators using Criateur to automate regulatory
              workflows across their plants.
            </p>

            {!submitted ? (
              <form onSubmit={handleSubmit} className="mt-10">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What would you like to do?">
                  {(['waitlist', 'team'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={intent === v}
                      onClick={() => setIntent(v)}
                      className="lp-btn"
                      style={
                        intent === v
                          ? { background: 'var(--lp-accent-soft)', border: '1px solid var(--lp-accent)', color: 'var(--lp-t1)' }
                          : { background: 'transparent', border: '1px solid var(--lp-line-strong)', color: 'var(--lp-t3)' }
                      }
                    >
                      {INTENT_LABEL[v]}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex flex-col sm:flex-row gap-3 max-w-md">
                  <div className="relative flex-1">
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
                    className="lp-btn lp-btn--primary whitespace-nowrap"
                    disabled={sending}
                    style={sending ? { opacity: 0.7, cursor: 'progress' } : undefined}
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>

                {submitError && (
                  <p className="lp-field-error mt-3" role="alert">{submitError}</p>
                )}
              </form>
            ) : (
              <div
                className="mt-10 p-5 rounded-xl max-w-md"
                style={{ background: 'rgba(59,183,94,.12)', border: '1px solid rgba(59,183,94,.3)' }}
              >
                <CheckCircle2 className="w-6 h-6 mb-2" style={{ color: 'var(--lp-mint)' }} />
                <p className="font-semibold" style={{ color: 'var(--lp-mint)' }}>Thanks — we have your details.</p>
                <p className="lp-small mt-1">
                  We&rsquo;ll reach out to {email} about {INTENT_LABEL[intent].toLowerCase()}.
                </p>
              </div>
            )}
          </div>
        </MotionWrap>
      </Section>

      <MarketingFooter
        onNavigate={onNavigateToPage}
        onCta={() => requestAccess('waitlist')}
        ctaLabel="Join the Waitlist"
      />
    </div>
  );
}
