// src/components/Chat/RelayPicker.tsx
import { useState, useEffect } from 'react';
import { X, Search, ExternalLink, Hash, Lock } from 'lucide-react';
import type { RelayDestination } from '../../lib/chatService';
import { listRelayDestinations } from '../../lib/chatService';

interface RelayPickerProps {
    companyId: string;
    selected: RelayDestination[];
    onToggle: (dest: RelayDestination) => void;
    onClose: () => void;
}

export default function RelayPicker({ companyId, selected, onToggle, onClose }: RelayPickerProps) {
    const [destinations, setDestinations] = useState<RelayDestination[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        listRelayDestinations(companyId).then((d) => {
            setDestinations(d);
            setLoading(false);
        });
    }, [companyId]);

    const filtered = search
        ? destinations.filter(d => d.external_name.toLowerCase().includes(search.toLowerCase()))
        : destinations;

    const selectedIds = new Set(selected.map(s => s.id));

    const providerIcon = (provider: string) => {
        switch (provider) {
            case 'slack': return '💬';
            case 'teams': return '🟦';
            case 'discord': return '🎮';
            default: return '📡';
        }
    };

    return (
        <div
            className="absolute bottom-full mb-2 right-0 w-80 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl z-50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-gradient-to-r from-indigo-50 to-purple-50">
                <div className="flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-[var(--color-purple)]" />
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">Relay to External</span>
                </div>
                <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--color-surface-alt)] transition-colors">
                    <X className="w-4 h-4 text-[var(--color-text-secondary)]" />
                </button>
            </div>

            {/* Search */}
            <div className="p-2 border-b border-[var(--color-border)]">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
                    <input
                        type="text"
                        placeholder="Search channels…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                        autoFocus
                    />
                </div>
            </div>

            {/* Destination list */}
            <div className="max-h-56 overflow-y-auto">
                {loading ? (
                    <div className="p-4 text-center text-sm text-[var(--color-text-tertiary)]">Loading…</div>
                ) : filtered.length === 0 ? (
                    <div className="p-4 text-center text-sm text-[var(--color-text-tertiary)]">
                        {destinations.length === 0
                            ? 'No external destinations configured. Connect Slack in Integrations.'
                            : 'No matching channels'}
                    </div>
                ) : (
                    filtered.map((dest) => (
                        <button
                            key={dest.id}
                            onClick={() => onToggle(dest)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${selectedIds.has(dest.id)
                                    ? 'bg-[var(--color-purple)]/10 border-l-2 border-indigo-500'
                                    : 'hover:bg-[var(--color-surface-alt)] border-l-2 border-transparent'
                                }`}
                        >
                            <span className="text-lg">{providerIcon(dest.provider)}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    {dest.is_private ? (
                                        <Lock className="w-3 h-3 text-[var(--color-text-tertiary)]" />
                                    ) : (
                                        <Hash className="w-3 h-3 text-[var(--color-text-tertiary)]" />
                                    )}
                                    <span className="text-sm font-medium text-[var(--color-text-secondary)] truncate">
                                        {dest.external_name}
                                    </span>
                                </div>
                                <p className="text-[10px] text-[var(--color-text-tertiary)] capitalize">{dest.provider}</p>
                            </div>
                            {selectedIds.has(dest.id) && (
                                <span className="text-xs font-bold text-[var(--color-purple)]">✓</span>
                            )}
                        </button>
                    ))
                )}
            </div>

            {/* Footer */}
            {selected.length > 0 && (
                <div className="border-t border-[var(--color-border)] px-4 py-2 bg-[var(--color-purple)]/10/50">
                    <p className="text-xs text-[var(--color-purple)] font-medium">
                        {selected.length} destination{selected.length > 1 ? 's' : ''} selected
                    </p>
                </div>
            )}
        </div>
    );
}
