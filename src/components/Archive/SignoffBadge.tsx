import { FileEdit, BarChart3, Scale, CheckCircle2, Eye, RotateCcw, Ban, Send } from 'lucide-react';

interface SignoffBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const config: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  draft: { label: 'Draft', bg: 'dash-surface-alt', text: 'dash-text', icon: FileEdit },
  analyzed: { label: 'Analyzed', bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]', icon: BarChart3 },

  awaiting_legal: { label: 'Awaiting Legal', bg: 'bg-behance-amber-50', text: 'text-behance-amber-700', icon: Scale },
  in_review: { label: 'In Review', bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]', icon: Eye },

  amend_requested: { label: 'Amend Requested', bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]', icon: RotateCcw },
  rejected: { label: 'Rejected', bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]', icon: Ban },

  signed_off: { label: 'Signed Off', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]', icon: CheckCircle2 },
  published: { label: 'Published', bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]', icon: Send },
};

export default function SignoffBadge({ status, size = 'sm' }: SignoffBadgeProps) {
  const c = config[status] || config.draft;
  const Icon = c.icon;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${c.bg} ${c.text} ${sizeClasses}`}>
      <Icon className={iconSize} />
      {c.label}
    </span>
  );
}

