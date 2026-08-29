import { useRef, useState } from 'react';
import { CheckCircle2, MapPin } from 'lucide-react';
import {
  MarketingStyles, MarketingNav, MarketingFooter, MotionWrap, Section,
  scrollToId, useScrollToTopOnMount, type MarketingPage,
} from './landing/shell';
import { useWaitlistSubmit } from './landing/useWaitlistSubmit';

/* ── Direct channels ──────────────────────────────
   The copy deck left both addresses as "[email address]". The general one is
   now known — the landing-page design and the in-app support form both use
   it — so it is filled in. No address has been confirmed for partnerships, so
   that one stays null and the page says so rather than guessing. */
const CHANNELS: { label: string; email: string | null }[] = [
  { label: 'General enquiries', email: 'hello@criateur.com' },
  { label: 'Partnerships & pilots', email: null },
];

const INDUSTRIES = [
  'Pharmaceutical manufacturing',
  'Food & beverage manufacturing',
  'Importer or distributor',
  'Other',
] as const;

type FieldName = 'name' | 'email' | 'company' | 'role' | 'industry';

const REQUIRED: { name: FieldName; label: string; type?: string; autoComplete?: string }[] = [
  { name: 'name', label: 'Full name', autoComplete: 'name' },
  { name: 'email', label: 'Work email', type: 'email', autoComplete: 'email' },
  { name: 'company', label: 'Company', autoComplete: 'organization' },
  { name: 'role', label: 'Your role', autoComplete: 'organization-title' },
];

interface ContactPageProps {
  onNavigateToLogin: () => void;
  onNavigateToSignup: () => void;
  onNavigateToPage: (page: MarketingPage) => void;
}

/**
 * Page 5 of the marketing deck — Contact.
 *
 * The deck numbers its blocks 1, 2, then 4; there is no block 3. Nothing
 * appears to be missing from the copy, so this is read as a numbering slip
 * and the page follows the three blocks that exist.
 *
 * Submissions are written to public.waitlist_signups. The success state is
 * shown only after the insert actually succeeds, so nobody is told they are
 * on the list when the row never landed.
 */
export default function ContactPage({ onNavigateToLogin, onNavigateToSignup, onNavigateToPage }: ContactPageProps) {
  useScrollToTopOnMount();

  const [values, setValues] = useState<Record<FieldName | 'notes', string>>({
    name: '', email: '', company: '', role: '', industry: '', notes: '',
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const { send, submitted, sending, error: submitError } = useWaitlistSubmit('contact');

  const set = (field: FieldName | 'notes') => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    // Clear a field's error as soon as the person starts fixing it, rather
    // than making them submit again to find out.
    if (field !== 'notes' && errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = () => {
    const next: Partial<Record<FieldName, string>> = {};
    for (const f of REQUIRED) {
      if (!values[f.name].trim()) next[f.name] = `${f.label} is required.`;
    }
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (!values.industry) next.industry = 'Industry is required.';
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Send focus to the first problem so the error is not just announced
      // somewhere off screen.
      const first = Object.keys(found)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }

    await send({
      intent: 'waitlist',
      email: values.email,
      fullName: values.name,
      company: values.company,
      role: values.role,
      industry: values.industry,
      notes: values.notes,
    });
  };

  return (
    <div className="lp-root">
      <MarketingStyles />

      <MarketingNav
        onHome={() => onNavigateToPage('home')}
        onLogin={onNavigateToLogin}
        onSignup={onNavigateToSignup}
        onCta={() => onNavigateToPage('contact')}
        ctaLabel="Join the Waitlist"
        links={[
          { label: 'Home', onClick: () => onNavigateToPage('home') },
          { label: 'Platform', onClick: () => onNavigateToPage('platform') },
          { label: "Who it's for", onClick: () => onNavigateToPage('who') },
          { label: 'About', onClick: () => onNavigateToPage('about') },
          { label: 'Contact', onClick: () => scrollToId('waitlist'), active: true },
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
            Direct access to Africa&rsquo;s <em>manufacturing compliance team.</em>
          </h1>
          <p className="lp-lead mt-7 max-w-2xl">
            Book a live walk-through, discuss custom facility integration, or explore how
            Criateur automates regulatory workflows for your plant.
          </p>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          BLOCK 2 — THE WAITLIST (+ BLOCK 4 channels alongside)
         ════════════════════════════════════════════════ */}
      <Section id="waitlist" tone="raised" className="py-16 md:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          {/* Left — the ask, and the direct channels */}
          <MotionWrap>
            <h2 className="lp-h2">Join the first cohort.</h2>
            <p className="lp-lead mt-5">
              We are onboarding a selected group of Nigerian pharmaceutical and food
              manufacturers directly into active factory operations. Share a few details
              about your facility, and our deployment team will reach out.
            </p>

            <div className="mt-12 space-y-7">
              {CHANNELS.map((c) => (
                <div key={c.label} style={{ borderTop: '1px solid var(--lp-line-strong)' }} className="pt-5">
                  <p className="lp-step-label">{c.label}</p>
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="lp-h3 mt-2 inline-block hover:underline"
                      style={{ fontSize: '1rem', color: 'var(--lp-accent)' }}
                    >
                      {c.email}
                    </a>
                  ) : (
                    <p className="lp-body mt-2">Via the form</p>
                  )}
                </div>
              ))}

              <div style={{ borderTop: '1px solid var(--lp-line-strong)' }} className="pt-5">
                <p className="lp-step-label">Location</p>
                <p className="lp-body mt-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 shrink-0" style={{ color: 'var(--lp-accent)' }} />
                  Lagos, Nigeria
                </p>
              </div>

              {CHANNELS.every((c) => !c.email) && (
                <p className="lp-micro">
                  Dedicated email addresses are not published yet.
                </p>
              )}
            </div>
          </MotionWrap>

          {/* Right — the form */}
          <MotionWrap delay={0.1}>
            <div className="lp-card p-7 md:p-9">
              {!submitted ? (
                <form ref={formRef} onSubmit={handleSubmit} noValidate>
                  <div className="space-y-5">
                    {REQUIRED.map((f) => (
                      <div key={f.name}>
                        <label className="lp-field-label" htmlFor={`f-${f.name}`}>
                          {f.label} <span className="lp-req" aria-hidden="true">*</span>
                        </label>
                        <input
                          id={`f-${f.name}`}
                          name={f.name}
                          type={f.type ?? 'text'}
                          autoComplete={f.autoComplete}
                          className="lp-field"
                          value={values[f.name]}
                          onChange={set(f.name)}
                          aria-required="true"
                          aria-invalid={errors[f.name] ? 'true' : undefined}
                          aria-describedby={errors[f.name] ? `err-${f.name}` : undefined}
                        />
                        {errors[f.name] && (
                          <p className="lp-field-error" id={`err-${f.name}`}>{errors[f.name]}</p>
                        )}
                      </div>
                    ))}

                    <div>
                      <label className="lp-field-label" htmlFor="f-industry">
                        Industry <span className="lp-req" aria-hidden="true">*</span>
                      </label>
                      <select
                        id="f-industry"
                        name="industry"
                        className="lp-field"
                        style={values.industry ? undefined : { color: 'var(--lp-t4)' }}
                        value={values.industry}
                        onChange={set('industry')}
                        aria-required="true"
                        aria-invalid={errors.industry ? 'true' : undefined}
                        aria-describedby={errors.industry ? 'err-industry' : undefined}
                      >
                        <option value="">Select an industry</option>
                        {INDUSTRIES.map((i) => (
                          <option key={i} value={i}>{i}</option>
                        ))}
                      </select>
                      {errors.industry && (
                        <p className="lp-field-error" id="err-industry">{errors.industry}</p>
                      )}
                    </div>

                    <div>
                      <label className="lp-field-label" htmlFor="f-notes">
                        Anything you would like us to know
                      </label>
                      <textarea
                        id="f-notes"
                        name="notes"
                        className="lp-field"
                        value={values.notes}
                        onChange={set('notes')}
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="lp-btn lp-btn--primary lp-btn--block mt-7"
                    disabled={sending}
                    style={sending ? { opacity: 0.7, cursor: 'progress' } : undefined}
                  >
                    {sending ? 'Sending…' : 'Join the Waitlist'}
                  </button>

                  {submitError && (
                    <p className="lp-field-error mt-3" role="alert">{submitError}</p>
                  )}

                  <p className="lp-micro mt-4">
                    Fields marked <span className="lp-req">*</span> are required.
                  </p>
                </form>
              ) : (
                <div role="status">
                  <CheckCircle2 className="w-8 h-8 mb-4" style={{ color: 'var(--lp-mint)' }} />
                  <h3 className="lp-h3" style={{ color: 'var(--lp-mint)' }}>You&rsquo;re on the list.</h3>
                  <p className="lp-body mt-3">
                    We&rsquo;ve received your facility&rsquo;s information. To help us prepare
                    for your onboarding, look out for our confirmation email — you can reply
                    to it directly with your current factory setup, or use the link inside to
                    book a brief introductory call with our product leads.
                  </p>
                </div>
              )}
            </div>
          </MotionWrap>
        </div>
      </Section>

      <MarketingFooter
        onNavigate={onNavigateToPage}
        onCta={() => onNavigateToPage('contact')}
        ctaLabel="Join the Waitlist"
      />
    </div>
  );
}
