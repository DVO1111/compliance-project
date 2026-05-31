import { useState, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

interface SignupPageProps {
  onToggleLogin: () => void;
  onBackToLanding?: () => void;
}

export default function SignupPage({ onToggleLogin, onBackToLanding }: SignupPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // If a pending invite token exists, pass it to signUp so the
      // company creation step is skipped (the invite RPC handles it).
      const pendingInvite = localStorage.getItem('pending_invite_token') || undefined;
      await signUp(email, password, fullName, organization, pendingInvite);
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4 py-12 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-behance-purple/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-behance-blue/10 blur-[120px] rounded-full pointer-events-none" />

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
            <ShieldCheck className="w-8 h-8 text-behance-blue" />
          </div>
          <h1 className="text-2xl font-bold dash-text">Create Account</h1>
          <p className="dash-text-secondary text-center mt-2">Join Criateur Compliance Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-[var(--color-danger)]/10 border border-red-500/20 text-[var(--color-danger)] px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

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

        <div className="mt-8 text-center">
          <p className="dash-text-secondary text-sm">
            Already have an account?{' '}
            <button
              onClick={onToggleLogin}
              className="text-behance-blue hover:text-behance-purple font-semibold transition-colors"
            >
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
