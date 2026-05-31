import { useEffect } from 'react';
import { CheckCircle, X, AlertTriangle } from 'lucide-react';

interface ToastProps {
  message: string;
  onClose: () => void;
  duration?: number;
  type?: 'success' | 'warning';
}

export default function Toast({ message, onClose, duration = 3000, type = 'success' }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in">
      <div className="dash-card rounded-lg shadow-lg border dash-border p-4 flex items-center space-x-3 min-w-[320px]">
        <div className="flex-shrink-0">
          {type === 'warning' ? (
            <AlertTriangle className="w-6 h-6 text-behance-amber-500" />
          ) : (
            <CheckCircle className="w-6 h-6 text-[var(--color-success)]" />
          )}
        </div>
        <p className="flex-1 text-sm font-medium dash-text">{message}</p>
        <button
          onClick={onClose}
          className="flex-shrink-0 dash-text-tertiary hover:dash-text-secondary transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

