import { FileText, Loader2 } from 'lucide-react';

interface ExtractionSpinnerProps {
  progress: { current: number; total: number } | null;
  currentFileName?: string;
}

export default function ExtractionSpinner({ progress, currentFileName }: ExtractionSpinnerProps) {
  const percentage = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="dash-card rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full bg-[var(--color-info-soft)] flex items-center justify-center">
              <FileText className="w-8 h-8 text-[var(--color-behance-blue)]" />
            </div>
            <div className="absolute -top-1 -right-1">
              <Loader2 className="w-8 h-8 text-[var(--color-behance-blue)] animate-spin" />
            </div>
          </div>

          <h3 className="text-lg font-semibold dash-text mb-1">
            Extracting Document Content
          </h3>

          {currentFileName && (
            <p className="text-sm dash-text-secondary mb-4 truncate max-w-full">
              {currentFileName}
            </p>
          )}

          {progress && (
            <div className="w-full mb-3">
              <div className="flex justify-between text-xs dash-text-secondary mb-1.5">
                <span>File {progress.current} of {progress.total}</span>
                <span>{percentage}%</span>
              </div>
              <div className="w-full h-2 dash-surface-alt rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[var(--color-behance-blue)] to-[#00A86B] rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )}

          <p className="text-xs dash-text-tertiary mt-2">
            Parsing headings, body text, and lists...
          </p>
        </div>
      </div>
    </div>
  );
}

