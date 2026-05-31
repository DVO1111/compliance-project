import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getTranslationJobs, createTranslationJob, updateJobStatus, getMarketRules,
    type TranslationJob, type TranslationStatus,
} from '../../lib/translationComplianceService';
import {
    Languages, AlertTriangle, CheckCircle2, Clock,
    ChevronRight, X, Globe, FileText, Search, Plus,
} from 'lucide-react';

const STATUS_BADGE: Record<TranslationStatus, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-[var(--color-surface-alt)]', text: 'text-[var(--color-text-secondary)]', label: 'Pending' },
    in_translation: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]', label: 'In Translation' },
    translated: { bg: 'bg-[var(--color-purple)]/10', text: 'text-[var(--color-purple)]', label: 'Translated' },
    re_review: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]', label: 'Re-Review' },
    approved: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]', label: 'Approved' },
    flagged: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]', label: 'Flagged' },
};

type Tab = 'jobs' | 'markets';

export default function TranslationCompliancePage() {
    const { user, profile } = useAuth();
    const companyId = profile?.company_id;
    const [tab, setTab] = useState<Tab>('jobs');
    const [jobs, setJobs] = useState<TranslationJob[]>([]);
    const [selectedJob, setSelectedJob] = useState<TranslationJob | null>(null);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ content_title: '', source_language: 'en-US', target_language: '', target_market: '', translator: '' });
    const [saving, setSaving] = useState(false);

    const markets = getMarketRules();

    const loadJobs = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const data = await getTranslationJobs(companyId);
        setJobs(data);
        setLoading(false);
    }, [companyId]);

    useEffect(() => { loadJobs(); }, [loadJobs]);

    const filtered = jobs.filter(j => !search || j.content_title.toLowerCase().includes(search.toLowerCase()) || j.target_market.toLowerCase().includes(search.toLowerCase()));

    async function handleCreate() {
        if (!companyId || !user || !form.content_title || !form.target_language || !form.target_market) return;
        setSaving(true);
        await createTranslationJob(companyId, user.id, form);
        setShowCreate(false);
        setForm({ content_title: '', source_language: 'en-US', target_language: '', target_market: '', translator: '' });
        setSaving(false);
        loadJobs();
    }

    async function handleStatusChange(jobId: string, status: TranslationStatus) {
        await updateJobStatus(jobId, status);
        loadJobs();
        setSelectedJob(null);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><Languages className="w-5 h-5 dash-accent" /></div>
                        <h2 className="text-2xl font-bold dash-text">Multi-Language Compliance</h2>
                    </div>
                    <p className="dash-text-secondary text-sm ml-12">Translation workflows with automatic local regulatory re-review</p>
                </div>
                <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 transition-opacity">
                    <Plus className="w-4 h-4" /> New Translation Job
                </button>
            </div>

            <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-alt)] w-fit">
                {([{ id: 'jobs' as Tab, label: 'Translation Jobs', icon: FileText }, { id: 'markets' as Tab, label: 'Market Rules', icon: Globe }]).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-[var(--color-surface)] dark:bg-[var(--color-surface)] shadow-sm dash-text' : 'dash-text-secondary hover:dash-text'}`}>
                        <t.icon className="w-4 h-4" />{t.label}
                    </button>
                ))}
            </div>

            {tab === 'jobs' ? (<>
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                    <input type="text" placeholder="Search by content or market..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
                </div>

                {loading ? (
                    <div className="dash-card rounded-2xl p-8 text-center"><Clock className="w-8 h-8 mx-auto mb-2 dash-text-tertiary animate-spin" /><p className="text-sm dash-text-secondary">Loading...</p></div>
                ) : filtered.length === 0 ? (
                    <div className="dash-card rounded-2xl p-8 text-center"><Languages className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No translation jobs yet. Click "New Translation Job" to create one.</p></div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(job => {
                            const badge = STATUS_BADGE[job.status];
                            const flags = job.compliance_flags || [];
                            return (
                                <button key={job.id} onClick={() => setSelectedJob(job)} className="w-full dash-card rounded-xl p-5 border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-all text-left group">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>{badge.label}</span>
                                                <span className="text-xs dash-text-tertiary">{job.target_market}</span>
                                                {flags.length > 0 && <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)] font-medium"><AlertTriangle className="w-3 h-3" /> {flags.length} flag{flags.length > 1 ? 's' : ''}</span>}
                                            </div>
                                            <h4 className="font-semibold dash-text text-sm">{job.content_title}</h4>
                                            <p className="text-xs dash-text-tertiary mt-0.5">{job.source_language} → {job.target_language} · {job.translator || 'Unassigned'}</p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 dash-text-tertiary group-hover:dash-accent transition-colors shrink-0" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </>) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {markets.map(m => (
                        <div key={m.market} className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                            <div className="flex items-center gap-2 mb-3"><span className="text-xl">{m.flag}</span><div><h4 className="font-semibold dash-text text-sm">{m.market}</h4><p className="text-xs dash-text-tertiary">{m.language}</p></div></div>
                            <ul className="space-y-1.5">{m.restrictions.map((r, i) => (<li key={i} className="flex items-start gap-2 text-xs dash-text-secondary"><AlertTriangle className="w-3 h-3 text-[var(--color-warning)] mt-0.5 shrink-0" />{r}</li>))}</ul>
                        </div>
                    ))}
                </div>
            )}

            {/* Detail Modal */}
            {selectedJob && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSelectedJob(null)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl">
                            <div><h3 className="font-bold dash-text text-lg">{selectedJob.content_title}</h3><p className="text-xs dash-text-secondary">{selectedJob.source_language} → {selectedJob.target_language} · {selectedJob.target_market}</p></div>
                            <button onClick={() => setSelectedJob(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex gap-2 flex-wrap">
                                {(['pending', 'in_translation', 'translated', 're_review', 'approved', 'flagged'] as TranslationStatus[]).map(s => {
                                    const b = STATUS_BADGE[s];
                                    return <button key={s} onClick={() => handleStatusChange(selectedJob.id, s)} className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-all ${selectedJob.status === s ? `${b.bg} ${b.text} border-current` : 'border-[var(--color-border)] dash-text-secondary hover:border-[var(--color-accent)]'}`}>{b.label}</button>;
                                })}
                            </div>
                            {(selectedJob.compliance_flags || []).length === 0 ? (
                                <div className="p-4 rounded-xl bg-[var(--color-success-soft)] border border-[var(--color-success)]/20 flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" /><p className="text-sm text-[var(--color-success)] font-medium">No compliance flags</p></div>
                            ) : (selectedJob.compliance_flags || []).map(f => (
                                <div key={f.id} className={`p-4 rounded-xl border ${f.severity === 'critical' ? 'bg-[var(--color-danger-soft)] border-[var(--color-danger)]/20' : f.severity === 'warning' ? 'bg-[var(--color-warning-soft)] border-[var(--color-warning)]/20' : 'bg-[var(--color-info-soft)] border-[var(--color-info)]/20'}`}>
                                    <div className="flex items-center gap-2 mb-2"><AlertTriangle className={`w-4 h-4 ${f.severity === 'critical' ? 'text-[var(--color-danger)]' : f.severity === 'warning' ? 'text-[var(--color-warning)]' : 'text-[var(--color-info)]'}`} /><span className="text-xs font-bold uppercase">{f.severity}</span></div>
                                    <div className="grid grid-cols-2 gap-3 mb-2">
                                        <div className="p-2 rounded-lg bg-white/60"><p className="text-xs dash-text-tertiary mb-0.5">Original</p><p className="text-sm dash-text font-medium">{f.original_claim}</p></div>
                                        <div className="p-2 rounded-lg bg-white/60"><p className="text-xs dash-text-tertiary mb-0.5">Translated</p><p className="text-sm dash-text font-medium">{f.translated_claim}</p></div>
                                    </div>
                                    <p className="text-sm font-medium" style={{ color: f.severity === 'critical' ? '#dc2626' : '#d97706' }}>{f.issue}</p>
                                    {f.rule && <p className="text-xs dash-text-tertiary mt-1">Rule: {f.rule}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCreate(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl">
                            <h3 className="font-bold dash-text text-lg">New Translation Job</h3>
                            <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Content Title *</label><input value={form.content_title} onChange={e => setForm({ ...form, content_title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. Cardio Drug Launch Campaign" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-medium dash-text-secondary block mb-1">Source Language</label><input value={form.source_language} onChange={e => setForm({ ...form, source_language: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div>
                                <div><label className="text-xs font-medium dash-text-secondary block mb-1">Target Language *</label>
                                    <select value={form.target_language} onChange={e => setForm({ ...form, target_language: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">
                                        <option value="">Select...</option>{markets.map(m => <option key={m.language} value={m.language}>{m.language} ({m.market})</option>)}
                                    </select>
                                </div>
                            </div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Target Market *</label>
                                <select value={form.target_market} onChange={e => setForm({ ...form, target_market: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">
                                    <option value="">Select...</option>{markets.map(m => <option key={m.market} value={m.market}>{m.market}</option>)}
                                </select>
                            </div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Translator / Agency</label><input value={form.translator} onChange={e => setForm({ ...form, translator: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="Optional" /></div>
                            <button onClick={handleCreate} disabled={saving || !form.content_title || !form.target_language || !form.target_market} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 transition-opacity disabled:opacity-50">
                                {saving ? 'Creating...' : 'Create Job'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
