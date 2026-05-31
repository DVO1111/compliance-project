import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { Search, X, Archive, FileText, Check } from 'lucide-react';

interface Submission {
    id: string;
    title: string;
    platform: string;
    status: string;
    created_at: string;
}

interface Props {
    onSelect: (submissionId: string) => void;
    onClose: () => void;
    excludeIds?: string[];
}

export default function ArchivePickerModal({ onSelect, onClose, excludeIds = [] }: Props) {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id;
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        if (!companyId) return;
        (async () => {
            setLoading(true);
            const { data, error } = await (supabase as any)
                .from('content_submissions')
                .select('id, title, platform, status, created_at')
                .eq('company_id', companyId)
                .order('created_at', { ascending: false })
                .limit(200);
            if (!error && data) {
                setSubmissions(data.filter((s: Submission) => !excludeIds.includes(s.id)));
            }
            setLoading(false);
        })();
    }, [companyId, excludeIds]);

    const filtered = submissions.filter(s =>
        !search || s.title?.toLowerCase().includes(search.toLowerCase()) ||
        s.platform?.toLowerCase().includes(search.toLowerCase())
    );

    const handleConfirm = () => {
        if (selectedId) onSelect(selectedId);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="dash-card border dash-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b dash-border">
                    <h2 className="text-lg font-bold dash-text flex items-center gap-2">
                        <Archive size={20} style={{ color: 'var(--color-accent)' }} />
                        Link from Archive
                    </h2>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors">
                        <X size={18} className="dash-text-tertiary" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b dash-border">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search archive submissions..."
                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1"
                            style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                            autoFocus
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2">
                    {loading ? (
                        <div className="p-8 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 mx-auto" style={{ borderColor: 'var(--color-accent)' }} />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-8 text-center">
                            <FileText size={32} className="mx-auto mb-2 dash-text-tertiary opacity-40" />
                            <p className="text-sm dash-text-tertiary">No matching submissions found</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filtered.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${s.id === selectedId
                                            ? 'ring-2 bg-[var(--color-surface-alt)]'
                                            : 'hover:bg-[var(--color-surface-alt)]'
                                        }`}
                                    style={s.id === selectedId ? { '--tw-ring-color': 'var(--color-accent)' } as any : undefined}
                                >
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${s.id === selectedId ? 'border-[var(--color-accent)] bg-[var(--color-accent)]' : 'dash-border'
                                        }`}>
                                        {s.id === selectedId && <Check size={12} className="text-white" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm dash-text truncate">{s.title || 'Untitled'}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs dash-text-tertiary capitalize">{s.platform}</span>
                                            <span className="text-xs dash-text-tertiary">·</span>
                                            <span className="text-xs dash-text-tertiary">
                                                {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t dash-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:bg-[var(--color-surface-alt)] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!selectedId}
                        className="px-6 py-2 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50 transition-all"
                        style={{ background: 'var(--color-accent)' }}
                    >
                        Link Evidence
                    </button>
                </div>
            </div>
        </div>
    );
}
