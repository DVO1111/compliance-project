import { useState, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-behance-purple/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-behance-blue/10 blur-[120px] rounded-full pointer-events-none" />

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
          <h1 className="text-2xl font-bold dash-text">Criateur Compliance</h1>
          <p className="dash-text-secondary text-center mt-2">Healthcare Marketing Compliance Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 text-[var(--color-danger)] px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium dash-text mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue dash-text placeholder-[var(--color-text-tertiary)] transition-colors"
              placeholder="you@company.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium dash-text mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-behance-blue/50 focus:border-behance-blue dash-text placeholder-[var(--color-text-tertiary)] transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-behance-blue hover:opacity-90 py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium text-white shadow-lg shadow-behance-blue/20"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="dash-text-secondary text-sm">
            Don't have an account?{' '}
            <button
              onClick={onToggleSignup}
              className="text-behance-blue hover:text-behance-purple font-semibold transition-colors"
            >
              Sign Up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
