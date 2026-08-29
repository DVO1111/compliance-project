import { useRef, useState } from 'react';
import { CheckCircle2, Mail } from 'lucide-react';
import {
  MarketingStyles, MarketingNav, MarketingFooter, MotionWrap, Section,
  scrollToId, useScrollToTopOnMount, type MarketingPage,
} from './landing/shell';
import { useWaitlistSubmit } from './landing/useWaitlistSubmit';

/* ── The core modules ─────────────────────────────
   Block 2 of the Platform & Features deck, verbatim. Five modules with the
   same shape, so they are data rather than five hand-written sections.

   Note the overlap with the home page: four of these five also appear there
   in condensed form. That is deliberate in the deck — the home page makes the
   argument, this page proves it — so the layout here is deliberately different
   (numbered, full-width, three columns of detail) to avoid reading as a
   repeat of the same section. */
const moduleId = (i: number) => `module-${i + 1}`;

const MODULES = [
  {
    name: 'Batch Execution (eBMR)', short: 'Batch Execution',
    heading: "Enforce the batch record. Don't just log it.",
    body: 'Map your exact manufacturing stages into the system. Operators execute workflows at floor workstations, ensuring every operational condition is met before the batch advances.',
    points: [
      { title: 'Line Clearance Checklists', detail: 'Require documented removal and inspection of previous materials before a new production run begins.' },
      { title: 'Dual Sign-Off Controls', detail: 'Mandate verified signatures from both the line operator and QA supervisor before closing critical processing steps.' },
      { title: 'In-Process Control Prompts', detail: 'Trigger automated sampling schedules and flag out-of-specification results immediately on the line.' },
    ],
  },
  {
    name: 'Quality Events (QMS)', short: 'Quality Events',
    heading: 'Resolve quality events at the root.',
    body: 'Connect the entire chain from floor deviation to full investigation. Criateur ensures corrective actions are systematically verified and closed — never left pending.',
    points: [
      { title: 'Deviation Triage', detail: 'Raise quality events directly against active batch records and automatically halt release for critical deviations.' },
      { title: 'Structured CAPA Workflows', detail: 'Enforce 5-Why root cause analysis and schedule automated effectiveness checks on risk-based 30, 60, or 90-day cycles.' },
      { title: 'Change Control Governance', detail: 'Isolate quality impacts from regulatory impacts and route approvals strictly by user role and change severity.' },
    ],
  },
  {
    name: 'Materials & Suppliers', short: 'Materials & Suppliers',
    heading: 'Intercept material risk at the receiving dock.',
    body: 'Track every API, excipient, and packaging material from intake through quality testing to final production release.',
    points: [
      { title: 'Automated Quarantine Gates', detail: 'Hold incoming raw materials automatically until supplier Certificates of Analysis (CoAs) are verified and lab testing passes.' },
      { title: 'Bidirectional Lot Traceability', detail: 'Trace raw material lots forward into every finished batch, or backward to the exact shift and equipment used.' },
      { title: 'Dynamic Vendor Scoring', detail: 'Automatically update supplier risk profiles based on live receiving defect rates and factory floor batch rejections.' },
    ],
  },
  {
    name: 'Regulatory Affairs', short: 'Regulatory Affairs',
    heading: "Manage dossiers on the regulator's timeline.",
    body: 'Eliminate formatting errors, incomplete filings, and missed deadlines that delay product registrations and license renewals.',
    points: [
      { title: 'CTD Submission Gating', detail: 'Automatically block submission attempts if mandatory dossier sections or files are missing, to prevent outright agency rejection.' },
      { title: 'NAPAMS Clock Tracking', detail: 'Pause application timers when a compliance directive arrives, allowing teams to resume precisely where the query was raised.' },
      { title: '12-Month Renewal Escalations', detail: 'Trigger licence renewal workflows 12 months in advance to accommodate realistic regulatory processing lead times.' },
    ],
  },
  {
    name: 'Audit & Recall', short: 'Audit & Recall',
    heading: 'Assemble audit evidence before the inspector asks.',
    body: 'Turn high-stress regulatory audits into streamlined, single-click data exports. Prove the integrity of your operation instantly.',
    points: [
      { title: '60-Second Mock Recalls', detail: 'Instantly map affected units across the distribution chain and generate NAFDAC-ready recall notification packages.' },
      { title: 'Unalterable Audit Trails', detail: 'Log every operator action chronologically and export sealed evidence packages backed by integrity manifests.' },
      { title: 'Verifiable CoAs', detail: 'Automatically generate Certificates of Analysis featuring embedded QR validation and SHA-256 cryptographic security seals.' },
    ],
  },
] as const;

/* ── Block 3: the technical wedge ─────────────── */
const FOUNDATIONS = [
  { title: 'Step-Level Role Gating', detail: 'Control exactly who can execute a specific task, not just who can log into the system. Prevent unauthorized personnel from closing CAPAs or signing off on batch releases.' },
  { title: 'Training-Gated Execution', detail: "Automatically suspend an operator's ability to sign off on a production step if their SOP training certification has expired." },
  { title: 'Calibration Lockouts', detail: 'Prevent operators from initiating production steps on equipment with expired calibration or maintenance certificates.' },
  { title: 'Pre-Configured Regulatory Templates', detail: 'Onboard fast with NAFDAC GMP, SON MANCAP, and HACCP frameworks pre-populated for your industry.' },
] as const;

interface PlatformPageProps {
  onNavigateToLogin: () => void;
  onNavigateToPage: (page: MarketingPage) => void;
}

/**
 * Page 2 of the marketing deck — Platform & Features.
 *
 * The deck names three different calls to action on this page ("Book a
 * Technical Walkthrough" in the hero, then "Join the Waitlist" and "Contact
 * the Team" at the foot). All three collect an email address and none has a
 * booking system or a contact page behind it yet, so they share one form and
 * differ only in the intent recorded against the address.
 */
export default function PlatformPage({ onNavigateToLogin, onNavigateToPage }: PlatformPageProps) {
  useScrollToTopOnMount();
  const [email, setEmail] = useState('');
  const { send, submitted, sending, error: submitError } = useWaitlistSubmit('platform');
  const [intent, setIntent] = useState<'walkthrough' | 'waitlist' | 'contact'>('walkthrough');
  const emailRef = useRef<HTMLInputElement>(null);

  const INTENT_LABEL: Record<typeof intent, string> = {
    walkthrough: 'Book a Technical Walkthrough',
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
        onCta={() => requestAccess('walkthrough')}
        ctaLabel="Book a Walkthrough"
        links={[
          { label: 'Home', onClick: () => onNavigateToPage('home') },
          { label: 'Platform', onClick: () => scrollToId('modules'), active: true },
          { label: "Who it's for", onClick: () => onNavigateToPage('who') },
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
            className="absolute -top-52 right-0 w-[820px] h-[560px] blur-[150px]"
            style={{ background: 'radial-gradient(closest-side, rgba(63,106,201,0.20), transparent 74%)' }}
          />
        </div>

        <MotionWrap className="relative z-10">
          <h1 className="lp-display max-w-[47rem]">
            One operating platform for <em>factory compliance.</em>
          </h1>
          <p className="lp-lead mt-6 max-w-[40rem]">
            Every module in Criateur enforces regulatory controls at the exact point of
            production. Explore the engine built for high-consequence manufacturing
            environments.
          </p>
          <div className="mt-9">
            <button onClick={() => requestAccess('walkthrough')} className="lp-btn lp-btn--primary">
              Book a Factory Demo
            </button>
          </div>

          {/* The design closes the hero with the five modules as jump links,
              so the page announces its own contents before you scroll. */}
          <div className="mt-12 pt-8" style={{ borderTop: '1px solid var(--lp-line)' }}>
            <div className="flex flex-wrap gap-2.5">
              {MODULES.map((m, i) => (
                <button
                  key={m.name}
                  onClick={() => scrollToId(moduleId(i))}
                  className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg transition"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--lp-line-strong)' }}
                >
                  <span className="lp-mono" style={{ color: 'var(--lp-t4)' }}>{`0${i + 1}`}</span>
                  <span className="text-[0.9375rem]" style={{ color: 'var(--lp-t2)' }}>{m.short}</span>
                </button>
              ))}
            </div>
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          BLOCK 2 — THE CORE MODULES
         ════════════════════════════════════════════════ */}
      <div id="modules">
        {MODULES.map((mod, i) => (
          <Section
            key={mod.name}
            id={moduleId(i)}
            className="py-14 md:py-16"
          >
            <MotionWrap>
              {/* Header runs in two columns: the claim on the left, the
                  explanation on the right, so the heading is not competing
                  with a paragraph directly beneath it. */}
              <div className="grid lg:grid-cols-2 gap-6 lg:gap-16 items-start">
                <div>
                  <div className="flex items-baseline gap-3">
                    <span
                      className="lp-mono"
                      style={{ fontSize: '1.75rem', color: 'var(--lp-t3)', letterSpacing: 0 }}
                    >
                      {`0${i + 1}`}
                    </span>
                    {/* No uppercase transform: it would render "(eBMR)" as
                        "(EBMR)" and lose the product's own casing. */}
                    <span
                      className="lp-eyebrow"
                      style={{ textTransform: 'none', letterSpacing: '0.04em', color: 'var(--lp-t3)' }}
                    >
                      {mod.name}
                    </span>
                  </div>
                  <h2 className="lp-h2-sm mt-3">{mod.heading}</h2>
                </div>

                <p className="lp-body lg:pt-12">{mod.body}</p>
              </div>

              <div className="mt-9 grid md:grid-cols-3 gap-4">
                {mod.points.map((p) => (
                  <div
                    key={p.title}
                    className="rounded-xl p-5"
                    style={{ background: 'rgba(63,106,201,0.10)', border: '1px solid rgba(63,106,201,0.26)' }}
                  >
                    <p className="text-[0.9375rem] font-semibold" style={{ color: 'var(--lp-t1)' }}>{p.title}</p>
                    <p className="lp-body mt-2">{p.detail}</p>
                  </div>
                ))}
              </div>
            </MotionWrap>
          </Section>
        ))}
      </div>

      {/* ════════════════════════════════════════════════
          BLOCK 3 — THE LOGIC & FOUNDATIONS
         ════════════════════════════════════════════════ */}
      <Section id="foundations" className="py-24 md:py-28">
        <MotionWrap>
          <h2 className="lp-h2 max-w-3xl">Configured for your floor, not forced onto it.</h2>
          <p className="lp-lead mt-5 max-w-3xl">
            A compliance system is only as effective as its operational controls. Criateur
            goes beyond basic web page permissions to enforce strict, step-level floor
            governance.
          </p>

          <div className="mt-12 grid md:grid-cols-2 gap-5">
            {FOUNDATIONS.map((f) => (
              <div key={f.title} className="lp-card p-7">
                <p className="lp-h3" style={{ fontSize: '1.0625rem' }}>{f.title}</p>
                <p className="lp-body mt-3">{f.detail}</p>
              </div>
            ))}
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          BLOCK 4 — BOTTOM OF FUNNEL
         ════════════════════════════════════════════════ */}
      <Section id="cta" tone="raised" className="py-24 md:py-32">
        <MotionWrap>
          <div className="max-w-2xl">
            <h2 className="lp-h2">See the engine in action.</h2>
            <p className="lp-lead mt-5">
              Schedule a technical walk-through with our team and see how Criateur automates
              compliance enforcement across your plant, built specifically for African
              regulatory environments.
            </p>

            {!submitted ? (
              <form onSubmit={handleSubmit} className="mt-10">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What would you like to do?">
                  {(['walkthrough', 'waitlist', 'contact'] as const).map((v) => (
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

      <MarketingFooter onNavigate={onNavigateToPage} onCta={() => requestAccess('walkthrough')} ctaLabel="Book a Technical Walkthrough" />
    </div>
  );
}
