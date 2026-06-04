import { Construction } from 'lucide-react';

interface Props {
  title: string;
  description?: string;
}

export default function ComingSoonPage({ title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="p-4 rounded-2xl bg-[var(--color-accent-soft)] mb-6">
        <Construction size={40} className="text-[var(--color-accent)]" />
      </div>
      <h1 className="text-2xl font-bold dash-text mb-2">{title}</h1>
      {description && (
        <p className="text-sm dash-text-secondary max-w-md leading-relaxed">{description}</p>
      )}
      <p className="mt-6 text-xs dash-text-tertiary uppercase tracking-widest font-bold">Module In Development</p>
    </div>
  );
}
