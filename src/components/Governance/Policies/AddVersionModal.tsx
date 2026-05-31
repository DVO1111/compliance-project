import React, { useState, useEffect } from 'react';
import { X, FileUp, List, Info, Search, FileText, CheckCircle2 } from 'lucide-react';
import { policyService } from '../../../lib/governance/policyService';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';

interface AddVersionModalProps {
    policyId: string;
    onClose: () => void;
    onSuccess: () => void;
}

export default function AddVersionModal({ policyId, onClose, onSuccess }: AddVersionModalProps) {
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<'upload' | 'select'>('select');
    const [archiveItems, setArchiveItems] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
    const [versionLabel, setVersionLabel] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (mode === 'select') {
            fetchArchive();
        }
    }, [mode]);

    const fetchArchive = async () => {
        try {
            const { data, error } = await supabase
                .from('content_submissions')
                .select('*')
                .eq('status', 'approved')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setArchiveItems(data || []);
        } catch (err) {
            logger.error('Archive fetch failed:', err);
        }
    };

    const filteredArchive = archiveItems.filter(item =>
        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.original_filename?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSubmissionId || !versionLabel || !user) return;

        try {
            setLoading(true);
            setError(null);
            await policyService.createVersion(
                (profile as any)?.company_id || '',
                user.id,
                policyId,
                selectedSubmissionId,
                versionLabel
            );
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Failed to link version');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="dash-card border dash-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b dash-border shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                            <FileUp size={20} />
                        </div>
                        <h2 className="text-xl font-bold dash-text">Add Policy Version</h2>
                    </div>
                    <button onClick={onClose} className="dash-text-tertiary hover:dash-text-primary transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    {error && (
                        <div className="p-3 rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)] text-sm border border-[var(--color-danger-border)]">
                            {error}
                        </div>
                    )}

                    <div className="flex bg-[var(--color-surface-alt)] p-1 rounded-xl border dash-border">
                        <button
                            onClick={() => setMode('select')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${mode === 'select' ? 'bg-[var(--color-surface)] shadow-sm dash-text font-bold' : 'dash-text-tertiary hover:dash-text-secondary'}`}
                        >
                            <List size={16} />
                            Select from Archive
                        </button>
                        <button
                            onClick={() => setMode('upload')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${mode === 'upload' ? 'bg-[var(--color-surface)] shadow-sm dash-text font-bold' : 'dash-text-tertiary hover:dash-text-secondary'}`}
                        >
                            <FileUp size={16} />
                            New Upload
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary px-1">Version Label</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. 1.0 Initial Draft, 2.1 2024 Update"
                                value={versionLabel}
                                onChange={(e) => setVersionLabel(e.target.value)}
                                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                            />
                        </div>

                        {mode === 'select' ? (
                            <div className="space-y-4">
                                <div className="relative group">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                                    <input
                                        type="text"
                                        placeholder="Search archive..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-[var(--color-surface)] border dash-border rounded-xl pl-10 pr-4 py-2 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto pr-2 scrollbar-thin">
                                    {filteredArchive.length > 0 ? (
                                        filteredArchive.map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => setSelectedSubmissionId(item.id)}
                                                className={`text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${selectedSubmissionId === item.id ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'dash-border bg-[var(--color-surface)] hover:dash-surface-alt'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <FileText size={18} className={selectedSubmissionId === item.id ? 'text-[var(--color-accent)]' : 'dash-text-tertiary'} />
                                                    <div>
                                                        <div className={`text-sm font-semibold ${selectedSubmissionId === item.id ? 'text-[var(--color-accent)]' : 'dash-text'}`}>{item.title || item.original_filename}</div>
                                                        <div className="text-[10px] dash-text-tertiary">Approved {new Date(item.created_at).toLocaleDateString()}</div>
                                                    </div>
                                                </div>
                                                {selectedSubmissionId === item.id && <CheckCircle2 size={16} className="text-[var(--color-accent)]" />}
                                            </button>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-sm dash-text-tertiary italic">
                                            No approved documents found in archive.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="p-8 border-2 border-dashed dash-border rounded-2xl flex flex-col items-center justify-center gap-4 bg-[var(--color-surface-alt)]/50">
                                <div className="p-4 rounded-full bg-[var(--color-surface)] shadow-inner">
                                    <FileUp size={32} className="dash-text-tertiary" />
                                </div>
                                <div className="text-center">
                                    <p className="dash-text font-semibold">Ready to upload</p>
                                    <p className="text-xs dash-text-tertiary mt-1">Please use the main Upload module to add new documents to the archive with the 'governance' tag, then select them here.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'upload' } }))}
                                    className="px-6 py-2 rounded-xl bg-[var(--color-surface)] border dash-border dash-text text-sm font-bold hover:dash-surface-alt transition-colors"
                                >
                                    Go to Upload Module
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="p-4 rounded-xl bg-blue-500/5 flex gap-3 text-xs text-blue-600 border border-blue-500/20">
                        <Info size={16} className="shrink-0" />
                        <p>Linking a document from the archive creates a <strong>Draft</strong> version. You must manually publish the version to make it visible to employees.</p>
                    </div>
                </div>

                <div className="p-6 border-t dash-border bg-[var(--color-surface-alt)] flex gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl border dash-border dash-text font-semibold hover:dash-surface-alt transition-colors bg-[var(--color-surface)]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !selectedSubmissionId || !versionLabel}
                        className="flex-1 bg-[var(--color-accent)] text-white px-4 py-2.5 rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-[var(--color-accent)]/20"
                    >
                        {loading ? 'Linking...' : 'Create Draft Version'}
                    </button>
                </div>
            </div>
        </div>
    );
}
