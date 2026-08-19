import { useState, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, ArrowLeft, MailCheck } from 'lucide-react';
import {
  INDUSTRY_OPTIONS,
  JURISDICTION_LABELS,
  getRegulatorOptions,
  toJurisdictionId,
} from '../../lib/regulatoryProfile';
import { useMemo } from 'react';

interface SignupPageProps {
  onToggleLogin: () => void;
  onBackToLanding?: () => void;
}

export default function SignupPage({ onToggleLogin, onBackToLanding }: SignupPageProps) {
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [industryType, setIndustryType] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');

  // Regulators depend on the industry — a pharmaceutical manufacturer picks
  // between NAFDAC, FDA, EMA and AMA; a logistics operator sees Customs, CBP…
  const regulatorOptions = useMemo(
    () => (industryType ? getRegulatorOptions(industryType) : []),
    [industryType]
  );
  const selectedRegulator = useMemo(
    () => regulatorOptions.find(o => o.jurisdiction === toJurisdictionId(jurisdiction)) ?? null,
    [regulatorOptions, jurisdiction]
  );
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp, verifySignupCode, resendSignupCode } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // If a pending invite token exists, pass it to signUp so the
      // company creation step is skipped (the invite RPC handles it).
      const pendingInvite = localStorage.getItem('pending_invite_token') || undefined;
      const { needsVerification } = await signUp(email, password, fullName, organization, pendingInvite, industryType, jurisdiction);
      if (needsVerification) {
        // A code was emailed. Move to the verify step; the profile/company are
        // created once the code is confirmed.
        setInfo(`We sent a 6-digit verification code to ${email}.`);
        setStep('verify');
      }
      // Otherwise the user is already signed in and provisioned — the app will
      // re-render into the authenticated view automatically.
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // On success the AuthContext signs the user in and provisions their
      // profile — the app will re-render into the authenticated view.
      await verifySignupCode(email, code);
    } catch (err: any) {
      setError(err.message || 'That code is invalid or has expired. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    setLoading(true);

    try {
      await resendSignupCode(email);
      setInfo(`A new code has been sent to ${email}.`);
    } catch (err: any) {
      setError(err.message || 'Could not resend the code. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4 py-12 relative overflow-hidden">
      {/* Ambient background glows */}

      {onBackToLanding && (
        <button
          onClick={onBackToLanding}
          className="absolute top-6 left-6 flex items-center space-x-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors z-10"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Home</span>
        </button>
      )}

      <div className="max-w-md w-full dash-card shadow-2xl p-8 relative z-10 border border-[var(--color-border)]">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-behance-blue/10 p-4 rounded-2xl mb-4 border border-behance-blue/20">
            {step === 'details' ? (
              <ShieldCheck className="w-8 h-8 text-behance-blue" />
            ) : (
              <MailCheck className="w-8 h-8 text-behance-blue" />
            )}
          </div>
          <h1 className="text-2xl font-bold dash-text">
            {step === 'details' ? 'Create Account' : 'Verify Your Email'}
          </h1>
          <p className="dash-text-secondary text-center mt-2">
            {step === 'details'
              ? 'Join Criateur Compliance Platform'
              : 'Enter the code we emailed you to confirm your identity'}
          </p>
        </div>

        {error && (
          <div className="bg-[var(--color-danger)]/10 border border-red-500/20 text-[var(--color-danger)] px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="bg-behance-blue/10 border border-behance-blue/20 text-behance-blue px-4 py-3 rounded-lg text-sm mb-4">
            {info}
          </div>
        )}

        {step === 'details' && (
        <form onSubmit={handleSubmit} className="space-y-5">

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium dash-text mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue dash-text placeholder-[var(--color-text-tertiary)] transition-colors"
              placeholder="Jane Doe"
              required
            />
          </div>

          <div>
            <label htmlFor="organization" className="block text-sm font-medium dash-text mb-1.5">
              Organization
            </label>
            <input
              type="text"
              id="organization"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue dash-text placeholder-[var(--color-text-tertiary)] transition-colors"
              placeholder="Acme Therapeutics"
              required
            />
          </div>

          <div>
            <label htmlFor="industryType" className="block text-sm font-medium dash-text mb-1.5">
              Industry
            </label>
            <select
              id="industryType"
              value={industryType}
              onChange={(e) => { setIndustryType(e.target.value); setJurisdiction(''); }}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-accent)]/50 focus:border-[var(--color-accent)] dash-text transition-colors"
              required
            >
              <option value="" disabled>Select your industry</option>
              {INDUSTRY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="jurisdiction" className="block text-sm font-medium dash-text mb-1.5">
              Regulatory body
            </label>
            <select
              id="jurisdiction"
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              disabled={!industryType}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-accent)]/50 focus:border-[var(--color-accent)] dash-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              required
            >
              <option value="" disabled>
                {industryType ? 'Select your regulator' : 'Choose an industry first'}
              </option>
              {regulatorOptions.map(o => (
                <option key={o.jurisdiction} value={o.jurisdiction}>
                  {o.short} — {JURISDICTION_LABELS[o.jurisdiction]}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs dash-text-tertiary">
              {selectedRegulator
                ? selectedRegulator.description
                : 'This sets the rules your content and records are checked against. It cannot be changed later from inside the app.'}
            </p>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium dash-text mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue dash-text placeholder-[var(--color-text-tertiary)] transition-colors"
              placeholder="jane@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium dash-text mb-1.5">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue dash-text placeholder-[var(--color-text-tertiary)] transition-colors"
              placeholder="••••••••"
              minLength={6}
              required
            />
            <p className="text-xs dash-text-tertiary mt-2">Minimum 6 characters</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-behance-blue hover:opacity-90 py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium mt-6 text-white shadow-lg shadow-behance-blue/20"
          >
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>
        )}

        {step === 'verify' && (
        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label htmlFor="code" className="block text-sm font-medium dash-text mb-1.5">
              Verification Code
            </label>
            <input
              type="text"
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-full px-4 py-2.5 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue dash-text placeholder-[var(--color-text-tertiary)] transition-colors text-center text-2xl tracking-[0.5em]"
              placeholder="000000"
              required
              autoFocus
            />
            <p className="text-xs dash-text-tertiary mt-2">Enter the 6-digit code from your email</p>
          </div>

          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="w-full bg-behance-blue hover:opacity-90 py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium mt-6 text-white shadow-lg shadow-behance-blue/20"
          >
            {loading ? 'Verifying...' : 'Verify & Continue'}
          </button>

          <div className="flex items-center justify-between text-sm pt-2">
            <button
              type="button"
              onClick={() => { setStep('details'); setError(''); setInfo(''); setCode(''); }}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              Change details
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              className="text-behance-blue hover:text-[var(--color-accent-hover)] font-semibold transition-colors disabled:opacity-50"
            >
              Resend code
            </button>
          </div>
        </form>
        )}

        {step === 'details' && (
        <div className="mt-8 text-center">
          <p className="dash-text-secondary text-sm">
            Already have an account?{' '}
            <button
              onClick={onToggleLogin}
              className="text-behance-blue hover:text-[var(--color-accent-hover)] font-semibold transition-colors"
            >
              Sign In
            </button>
          </p>
        </div>
        )}
      </div>
    </div>
  );
}
