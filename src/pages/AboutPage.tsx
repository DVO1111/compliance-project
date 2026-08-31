import { useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Mail } from 'lucide-react';
import {
  MarketingStyles, MarketingNav, MarketingFooter, MotionWrap, Section,
  scrollToId, useScrollToTopOnMount, type MarketingPage,
} from './landing/shell';
import { useWaitlistSubmit } from './landing/useWaitlistSubmit';

/* ── Block 3: the wedge ───────────────────────── */
const WEDGE = [
  { title: 'True NAFDAC Timelines', detail: 'Licence renewal alerts trigger 12 months out, aligning with actual regulatory processing times.' },
  { title: 'NAPAMS Clock Logic', detail: 'Compliance directives pause your application timer rather than resetting your process to step one.' },
  { title: 'Batch Release Gating', detail: 'Strict role-based permissions ensure product releases cannot be authorized by unauthorized operators.' },
] as const;

/* ── Block 4: engineering principles ──────────────
   The deck punctuates these three titles inconsistently (a colon on the
   first, a full stop on the third). The layout supplies the separation, so
   the titles are set without trailing punctuation; the wording is unchanged. */
const PRINCIPLES = [
  {
    title: 'Honest about state',
    detail: "We state exactly what is built, what is in progress, and what isn't.",
  },
  {
    title: 'Verifiable integrity',
    detail: 'A compliance platform is only as good as its audit trail. Every action, sign-off, and document edit on Criateur is logged, timestamped, and tamper-evident.',
  },
  {
    title: 'Local by design',
    detail: 'NAFDAC, SON, PCN, and NDPR are not an afterthought or a configuration layer. They form the underlying data structure of our entire platform.',
  },
] as const;

interface AboutPageProps {
  onNavigateToLogin: () => void;
  onRequestInfo: () => void;
  onNavigateToPage: (page: MarketingPage) => void;
}

/**
 * Page 4 of the marketing deck — About.
 *
 * This page argues rather than demonstrates, so it is set as an editorial
 * page: wide measure, statement headings, no product cards. The horizon
 * section names other regulators (Ghana FDA, SAHPRA, PPB, AMA) as prose
 * rather than as framework chips — chips would read as shipped coverage,
 * and the copy is explicit that this is what the engine is *built to
 * support*, not what it supports today.
 */
export default function AboutPage({ onNavigateToLogin, onRequestInfo, onNavigateToPage }: AboutPageProps) {
  useScrollToTopOnMount();

  const [email, setEmail] = useState('');
  const { send, submitted, sending, error: submitError } = useWaitlistSubmit('about');
  const [intent, setIntent] = useState<'waitlist' | 'contact'>('waitlist');
  const emailRef = useRef<HTMLInputElement>(null);

  const INTENT_LABEL: Record<typeof intent, string> = {
    waitlist: 'Join the Waitlist',
    contact: 'Contact the Team',
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
          { label: "Who it's for", onClick: () => onNavigateToPage('who') },
          { label: 'About', onClick: () => scrollToId('story'), active: true },
          { label: 'Contact', onClick: () => onNavigateToPage('contact') },
        ]}
      />

      {/* ════════════════════════════════════════════════
          BLOCK 1 — HERO
         ════════════════════════════════════════════════ */}
      <Section className="pt-[132px] pb-14 md:pt-[164px] md:pb-16 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div
            className="absolute -top-40 left-1/4 w-[560px] h-[560px] rounded-full blur-[140px] animate-[orbFloat_9s_ease-in-out_infinite]"
            style={{ background: 'radial-gradient(closest-side, rgba(71,141,75,0.28), transparent 74%)' }}
          />
        </div>

        <MotionWrap className="relative z-10">
          <h1 className="lp-display max-w-[47rem]">
            Built for <em>African manufacturing.</em>
          </h1>
          <p className="lp-lead mt-7 max-w-2xl">
            Global compliance software is built for foreign regulators and priced for Western
            budgets. Criateur provides the localized digital infrastructure Nigerian factories
            need to pass audits without operational friction.
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
          BLOCK 2 — THE PROBLEM
         ════════════════════════════════════════════════ */}
      <Section id="story" tone="raised" className="py-20 md:py-28">
        <MotionWrap>
          <h2 className="lp-h2 max-w-3xl">Enterprise-grade standards. Purpose-built local software.</h2>

          {/* An editorial measure, not a two-column grid: this section is an
              argument to be read, not a set of features to be scanned. */}
          <div className="mt-8 max-w-3xl space-y-6">
            <p className="lp-lead">
              Criateur is not a foreign system adapted for Nigeria. It is built here,
              exclusively around the exact regulatory workflows your operations team answers
              to every day.
            </p>
            <p className="lp-lead">
              Nigerian manufacturers operate under continuous regulatory scrutiny: NAFDAC
              inspections, SON certifications, multinational client audits. But from our
              experience, we discovered that most compliance workflows still rely on
              fragmented spreadsheets, loose physical files, and institutional memory, which
              is not sustainable.
            </p>
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          BLOCK 3 — THE WEDGE
         ════════════════════════════════════════════════ */}
      <Section className="py-20 md:py-24">
        <MotionWrap>
          <h2 className="lp-h2 max-w-3xl">Built with practitioners, not just for them.</h2>
          <p className="lp-lead mt-5 max-w-3xl">
            Every module in Criateur is specified and field-tested by QA directors, regulatory
            affairs leads, and audit specialists inside Nigerian food and pharma plants.
          </p>

          {/* Rows with a left rule rather than columns or cards — three
              specifics supporting the claim above, read in order. */}
          <div className="mt-12 space-y-px">
            {WEDGE.map((w) => (
              <div
                key={w.title}
                className="grid md:grid-cols-[minmax(0,18rem)_1fr] gap-2 md:gap-10 py-6"
                style={{ borderTop: '1px solid var(--lp-line-strong)' }}
              >
                <p className="lp-h3" style={{ fontSize: '1.0625rem' }}>{w.title}</p>
                <p className="lp-lead">{w.detail}</p>
              </div>
            ))}
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          BLOCK 4 — CORE PRINCIPLES
         ════════════════════════════════════════════════ */}
      <Section tone="raised" className="py-20 md:py-24">
        <MotionWrap>
          <h2 className="lp-h2 max-w-3xl">Our engineering principles.</h2>
        </MotionWrap>

        <div className="mt-12 grid md:grid-cols-3 gap-10 md:gap-12">
          {PRINCIPLES.map((p, i) => (
            <MotionWrap key={p.title} delay={i * 0.08}>
              <div style={{ borderTop: '1px solid var(--lp-line-strong)' }} className="pt-6">
                <p className="lp-step-label lp-num">{`0${i + 1}`}</p>
                <h3 className="lp-h3 mt-3">{p.title}</h3>
                <p className="lp-body mt-3">{p.detail}</p>
              </div>
            </MotionWrap>
          ))}
        </div>
      </Section>

      {/* ════════════════════════════════════════════════
          BLOCK 5 — THE HORIZON
         ════════════════════════════════════════════════ */}
      <Section className="py-20 md:py-24">
        <MotionWrap>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            <h2 className="lp-h2">Nigeria first. Then the continent.</h2>
            <p className="lp-lead">
              We are starting with Nigerian pharmaceutical and food manufacturers, who face
              high regulatory standards and enforcement pressures. But the exact same problem
              exists across the continent. Criateur&rsquo;s core engine is built to support
              multi-country compliance: preparing your operations for the Ghana FDA, SAHPRA,
              PPB, and regional harmonization through the African Medicines Agency (AMA),
              building for cross-border operations from the start.
            </p>
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          BLOCK 6 — BOTTOM OF FUNNEL
         ════════════════════════════════════════════════ */}
      <Section id="cta" tone="raised" className="py-24 md:py-32">
        <MotionWrap>
          <div className="max-w-2xl">
            <h2 className="lp-h2">Be part of the first cohort.</h2>
            <p className="lp-lead mt-5">
              Secure an onboarding slot for your facility and deploy the operating system
              built specifically for Nigerian regulated manufacturing.
            </p>

            {!submitted ? (
              <form onSubmit={handleSubmit} className="mt-10">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What would you like to do?">
                  {(['waitlist', 'contact'] as const).map((v) => (
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
