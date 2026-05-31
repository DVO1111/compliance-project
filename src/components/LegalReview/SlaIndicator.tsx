// src/components/LegalReview/SlaIndicator.tsx
// Compact SLA countdown badge with urgency-based coloring
import { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface SlaIndicatorProps {
    deadlineAt: string | null | undefined;
    size?: 'sm' | 'md';
}

function getTimeRemaining(deadline: string): {
    total: number;
    hours: number;
    minutes: number;
    label: string;
    urgency: 'safe' | 'warning' | 'danger' | 'overdue';
} {
    const now = Date.now();
    const end = new Date(deadline).getTime();
    const total = end - now;

    if (total <= 0) {
        const overdue = Math.abs(total);
        const hrs = Math.floor(overdue / 3600000);
        return { total, hours: hrs, minutes: Math.floor((overdue % 3600000) / 60000), label: `${hrs}h overdue`, urgency: 'overdue' };
    }

    const hours = Math.floor(total / 3600000);
    const minutes = Math.floor((total % 3600000) / 60000);

    // urgency thresholds
    const totalHours = total / 3600000;
    let urgency: 'safe' | 'warning' | 'danger' | 'overdue' = 'safe';
    if (totalHours < 6) urgency = 'danger';
    else if (totalHours < 24) urgency = 'warning';

    const label = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return { total, hours, minutes, label, urgency };
}

export default function SlaIndicator({ deadlineAt, size = 'sm' }: SlaIndicatorProps) {
    const [remaining, setRemaining] = useState<ReturnType<typeof getTimeRemaining> | null>(null);

    useEffect(() => {
        if (!deadlineAt) return;
        const update = () => setRemaining(getTimeRemaining(deadlineAt));
        update();
        const interval = setInterval(update, 60_000); // update every minute
        return () => clearInterval(interval);
    }, [deadlineAt]);

    if (!deadlineAt || !remaining) return null;

    const sizeClasses = size === 'md'
        ? 'px-3 py-1.5 text-sm gap-2'
        : 'px-2 py-0.5 text-xs gap-1.5';

    const colorMap = {
        safe: 'bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]/20',
        warning: 'bg-behance-amber-50 text-behance-amber-700 border-behance-amber-200',
        danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/20',
        overdue: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/30',
    };

    return (
        <span
            className={`inline-flex items-center font-medium rounded-full border ${sizeClasses} ${colorMap[remaining.urgency]} ${remaining.urgency === 'overdue' ? 'animate-pulse' : ''
                }`}
            title={`SLA deadline: ${new Date(deadlineAt).toLocaleString()}`}
        >
            {remaining.urgency === 'overdue' ? (
                <AlertTriangle className={size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
            ) : (
                <Clock className={size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
            )}
            {remaining.label}
        </span>
    );
}

