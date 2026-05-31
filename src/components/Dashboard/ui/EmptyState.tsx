import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";

interface EmptyStateProps {
    icon?: LucideIcon;
    title?: string;
    message: string;
    action?: { label: string; onClick: () => void };
}

export function EmptyState({
    icon: Icon = Inbox,
    title,
    message,
    action,
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                style={{ background: "var(--color-accent-soft)" }}
            >
                <Icon className="w-6 h-6 dash-text-tertiary" />
            </div>
            {title && (
                <p className="text-sm font-semibold dash-text mb-1">{title}</p>
            )}
            <p className="text-xs dash-text-secondary max-w-xs">{message}</p>
            {action && (
                <button
                    onClick={action.onClick}
                    className="mt-4 px-4 py-1.5 rounded-lg text-xs font-medium dash-accent"
                    style={{ background: "var(--color-accent-soft)" }}
                >
                    {action.label}
                </button>
            )}
        </div>
    );
}

interface ErrorStateProps {
    message: string;
    onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--color-danger-soft)] flex items-center justify-center mb-3">
                <AlertTriangle className="w-5 h-5 text-[var(--color-danger)]" />
            </div>
            <p className="text-xs dash-text-secondary max-w-xs">{message}</p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="mt-3 px-4 py-1.5 rounded-lg text-xs font-medium text-[var(--color-danger)] bg-[var(--color-danger-soft)] hover:bg-[var(--color-danger-soft)]"
                >
                    Retry
                </button>
            )}
        </div>
    );
}
