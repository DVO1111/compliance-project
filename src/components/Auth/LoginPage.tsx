import { useState, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AuthShell, { AuthLink, AuthNotice } from './AuthShell';

interface LoginPageProps {
  onToggleSignup: () => void;
  onBackToLanding?: () => void;
}

export default function LoginPage({ onToggleSignup, onBackToLanding }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  return (
    <AuthShell
      tagline="The operating system for regulated manufacturing."
      formTitle="Sign in"
      onBackToLanding={onBackToLanding}
      footer={
        <>
          Don&rsquo;t have an account?{' '}
          <AuthLink onClick={onToggleSignup}>Sign up</AuthLink>
        </>
      }
    >
      {error && <AuthNotice tone="error">{error}</AuthNotice>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="lp-field-label">Work email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="lp-field"
            placeholder="you@company.com"
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
            autoComplete="current-password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="lp-btn lp-btn--primary lp-btn--block"
          style={loading ? { opacity: 0.7 } : undefined}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
