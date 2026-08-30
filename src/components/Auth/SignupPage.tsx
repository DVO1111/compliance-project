import { useState, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AuthShell, { AuthLink, AuthNotice } from './AuthShell';
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
    <AuthShell
      tagline={
        step === 'details'
          ? 'Create your account to get started.'
          : 'Enter the code we emailed you to confirm your identity.'
      }
      formTitle={step === 'details' ? 'Create your account' : 'Verify your email'}
      onBackToLanding={onBackToLanding}
      footer={
        step === 'details' ? (
          <>
            Already have an account?{' '}
            <AuthLink onClick={onToggleLogin}>Sign in</AuthLink>
          </>
        ) : undefined
      }
    >
      {error && <AuthNotice tone="error">{error}</AuthNotice>}
      {info && !error && <AuthNotice tone="info">{info}</AuthNotice>}

      {step === 'details' && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="fullName" className="lp-field-label">Full name</label>
            <input
              type="text"
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="lp-field"
              placeholder="Jane Doe"
              autoComplete="name"
              required
            />
          </div>

          <div>
            <label htmlFor="organization" className="lp-field-label">Organization</label>
            <input
              type="text"
              id="organization"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="lp-field"
              placeholder="Acme Therapeutics"
              autoComplete="organization"
              required
            />
          </div>

          <div>
            <label htmlFor="industryType" className="lp-field-label">Industry</label>
            <select
              id="industryType"
              value={industryType}
              onChange={(e) => { setIndustryType(e.target.value); setJurisdiction(''); }}
              className="lp-field"
              required
            >
              <option value="" disabled>Select your industry</option>
              {INDUSTRY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="jurisdiction" className="lp-field-label">Regulatory body</label>
            <select
              id="jurisdiction"
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              disabled={!industryType}
              className="lp-field disabled:opacity-50 disabled:cursor-not-allowed"
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
            <p className="lp-micro" style={{ marginTop: 6 }}>
              {selectedRegulator
                ? selectedRegulator.description
                : 'This sets the rules your content and records are checked against. It cannot be changed later from inside the app.'}
            </p>
          </div>

          <div>
            <label htmlFor="email" className="lp-field-label">Work email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="lp-field"
              placeholder="jane@company.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="lp-field-label">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="lp-field"
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={6}
              required
            />
            <p className="lp-micro" style={{ marginTop: 6 }}>Minimum 6 characters</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="lp-btn lp-btn--primary lp-btn--block"
            style={loading ? { opacity: 0.7 } : undefined}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      )}

      {step === 'verify' && (
        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label htmlFor="code" className="lp-field-label">Verification code</label>
            <input
              type="text"
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="lp-field text-center"
              style={{ fontFamily: 'var(--lp-font-mono)', fontSize: '1.5rem', letterSpacing: '0.4em' }}
              placeholder="000000"
              required
              autoFocus
            />
            <p className="lp-micro" style={{ marginTop: 6 }}>Enter the 6-digit code from your email</p>
          </div>

          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="lp-btn lp-btn--primary lp-btn--block"
            style={loading || code.length < 6 ? { opacity: 0.6 } : undefined}
          >
            {loading ? 'Verifying…' : 'Verify & continue'}
          </button>

          <div className="flex items-center justify-between text-sm pt-1">
            <button
              type="button"
              onClick={() => { setStep('details'); setError(''); setInfo(''); setCode(''); }}
              className="transition hover:opacity-80"
              style={{ color: 'var(--lp-t3)' }}
            >
              Change details
            </button>
            <AuthLink onClick={handleResend}>Resend code</AuthLink>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
