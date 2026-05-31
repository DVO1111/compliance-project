import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

interface PageErrorFallbackProps {
  /** The error that was caught, if available */
  error?: Error;
  /** Called when user clicks "Try again" */
  onReset?: () => void;
}

/**
 * Shown when a page-level React error boundary catches an unhandled error.
 * Gives the user two recovery paths: reload the current page, or go to dashboard.
 */
export default function PageErrorFallback({ error, onReset }: PageErrorFallbackProps) {
  const handleReload = () => {
    if (onReset) {
      onReset();
    } else {
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'dashboard' } }));
    // If onReset is provided the boundary will remount cleanly
    onReset?.();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-danger-soft)] flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-[var(--color-danger)]" />
      </div>

      <h2 className="text-lg font-bold dash-text mb-2">Something went wrong</h2>
      <p className="text-sm dash-text-secondary max-w-sm mb-1">
        An unexpected error occurred on this page. Your data has not been affected.
      </p>

      {error?.message && (
        <p className="text-xs font-mono text-[var(--color-danger)] bg-[var(--color-danger-soft)] rounded-lg px-3 py-2 max-w-sm mb-4 break-all">
          {error.message}
        </p>
      )}

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleReload}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-behance-blue)] text-white text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
        <button
          onClick={handleGoHome}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border dash-border dash-card text-sm font-medium dash-text hover:dash-surface-alt transition-colors"
        >
          <LayoutDashboard className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
