import { useState, useEffect, useMemo } from 'react';
import { X, Search, Check, FileText, Link2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Submission = {
    id: string;
    title: string;
    platform: string;
    status: string;
    created_at: string;
};

interface EvidencePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLink: (submissionIds: string[]) => Promise<void>;
    companyId: string;
    excludeIds: string[];
}

export default function EvidencePickerModal({
    isOpen, onClose, onLink, companyId, excludeIds,
}: EvidencePickerModalProps) {
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [platformFilter, setPlatformFilter] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [linking, setLinking] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setSelected(new Set());
        setSearch('');
        setPlatformFilter('');
        loadSubmissions();
    }, [isOpen, companyId]);

    const loadSubmissions = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('content_submissions')
            .select('id,title,platform,status,created_at')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (!error && data) {
            setSubmissions(data as Submission[]);
        }
        setLoading(false);
    };

    const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

    const filtered = useMemo(() => {
        let list = submissions.filter(s => !excludeSet.has(s.id));
        if (search) {
            const term = search.toLowerCase();
            list = list.filter(s => s.title?.toLowerCase().includes(term));
        }
        if (platformFilter) {
            list = list.filter(s => s.platform === platformFilter);
        }
        return list;
    }, [submissions, search, platformFilter, excludeSet]);

    const platforms = useMemo(() => {
        return Array.from(new Set(submissions.map(s => s.platform).filter(Boolean)));
    }, [submissions]);

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleLink = async () => {
        setLinking(true);
        try {
            await onLink(Array.from(selected));
            onClose();
        } catch { /* parent handles */ } finally {
            setLinking(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)] shrink-0">
                    <div>
                        <h3 className="text-lg font-bold dash-text flex items-center gap-2">
                            <Link2 className="w-5 h-5 dash-accent" /> Link Evidence from Archive
                        </h3>
                        <p className="text-xs dash-text-tertiary mt-0.5">Select documents to link as evidence for this control</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]">
                        <X className="w-5 h-5 dash-text-secondary" />
                    </button>
                </div>

                {/* Search + Filter bar */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border)] shrink-0">
                    <div className="flex-1 relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 dash-text-tertiary" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by title…"
                            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--color-border)] text-sm bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                        />
                    </div>
                    <select
                        value={platformFilter}
                        onChange={e => setPlatformFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-[var(--color-border)] text-sm bg-[var(--color-surface)] dash-text focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                    >
                        <option value="">All Platforms</option>
                        {platforms.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto px-5 py-3">
                    {loading ? (
                        <div className="space-y-2">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="h-14 rounded-xl bg-[var(--color-surface-alt)] animate-pulse" />
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="w-8 h-8 dash-text-tertiary mx-auto mb-2" />
                            <p className="text-sm dash-text-secondary">
                                {submissions.length === 0 ? 'No archive documents found' : 'No matching documents (or all are already linked)'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {filtered.map(sub => {
                                const isSelected = selected.has(sub.id);
                                return (
                                    <button
                                        key={sub.id}
                                        onClick={() => toggle(sub.id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isSelected
                                                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] ring-1 ring-[var(--color-accent)]/30'
                                                : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-surface-alt)]/50'
                                            }`}
                                    >
                                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-[var(--color-accent)] border-[var(--color-accent)]' : 'border-[var(--color-border)]'
                                            }`}>
                                            {isSelected && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium dash-text truncate">{sub.title || 'Untitled'}</div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-xs dash-text-tertiary">{sub.platform}</span>
                                                <span className="text-[10px] dash-text-tertiary">•</span>
                                                <span className="text-xs dash-text-tertiary">{new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                            </div>
                                        </div>
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${sub.status === 'compliant' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                                                : sub.status === 'flagged' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                                                    : 'bg-[var(--color-surface-alt)] dash-text-tertiary'
                                            }`}>{sub.status}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--color-border)] shrink-0">
                    <span className="text-xs dash-text-tertiary">
                        {filtered.length} available · {selected.size} selected
                    </span>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary border border-[var(--color-border)] hover:bg-[var(--color-surface-alt)]">Cancel</button>
                        <button
                            onClick={handleLink}
                            disabled={selected.size === 0 || linking}
                            className="px-5 py-2 rounded-xl text-sm font-medium text-white shadow-md disabled:opacity-50"
                            style={{ background: 'var(--color-accent)' }}
                        >
                            {linking ? 'Linking…' : `Link ${selected.size} Selected`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
