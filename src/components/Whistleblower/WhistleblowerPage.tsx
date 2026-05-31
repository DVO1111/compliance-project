import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getReports, submitReport, getReportingStats, updateReportStatus, addCaseUpdate,
    runWhistleblowerTriage,
    REPORT_CATEGORIES, type WhistleblowerReport, type ReportCategory, type ReportStatus, type ReportingStats,
} from '../../lib/whistleblowerService';
import {
    ShieldAlert, CheckCircle2, Clock, Search, ChevronRight, X, Lock, Eye,
    BarChart3, Plus, Zap, AlertCircle, Info, TrendingUp
} from 'lucide-react';

const STATUS_BADGE: Record<string, { bg: string; text: string }> = { submitted: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]' }, under_investigation: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' }, escalated: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' }, resolved: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' }, dismissed: { bg: 'bg-[var(--color-surface-alt)]', text: 'text-[var(--color-text-secondary)]' } };
const PRIORITY_BADGE: Record<string, { bg: string; text: string }> = { low: { bg: 'bg-[var(--color-surface-alt)]', text: 'text-[var(--color-text-secondary)]' }, medium: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]' }, high: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' }, critical: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' } };

type Tab = 'cases' | 'stats';

export default function WhistleblowerPage() {
    const { user, profile } = useAuth();
    const companyId = profile?.company_id;
    const [tab, setTab] = useState<Tab>('cases');
    const [reports, setReports] = useState<WhistleblowerReport[]>([]);
    const [stats, setStats] = useState<ReportingStats | null>(null);
    const [selectedReport, setSelectedReport] = useState<WhistleblowerReport | null>(null);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ category: 'other' as ReportCategory, subject: '', description: '', priority: 'medium' as 'low' | 'medium' | 'high' | 'critical', anonymous: true });

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const [r, s] = await Promise.all([getReports(companyId), getReportingStats(companyId)]);
        setReports(r); setStats(s); setLoading(false);
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const filtered = reports.filter(r => !search || r.subject.toLowerCase().includes(search.toLowerCase()) || r.case_number.toLowerCase().includes(search.toLowerCase()));

    async function handleSubmit() {
        if (!companyId || !form.subject || !form.description) return;
        setSaving(true);
        const report = await submitReport(companyId, user?.id || null, form);
        if (report) {
            // Trigger AI Triage immediately after submission
            await runWhistleblowerTriage(report.id);
        }
        setShowCreate(false); setForm({ category: 'other', subject: '', description: '', priority: 'medium', anonymous: true }); setSaving(false);
        load();
    }

    async function handleStatusChange(reportId: string, status: ReportStatus) {
        await updateReportStatus(reportId, status);
        load(); setSelectedReport(null);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1"><div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><ShieldAlert className="w-5 h-5 dash-accent" /></div><h2 className="text-2xl font-bold dash-text">Internal Reporting</h2></div>
                    <p className="dash-text-secondary text-sm ml-12">Secure, anonymized compliance concern reporting with case management</p>
                </div>
                <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90"><Plus className="w-4 h-4" /> Submit Report</button>
            </div>

            <div className="p-3 rounded-xl bg-[var(--color-success-soft)] border border-[var(--color-success)]/20 flex items-center gap-3"><Lock className="w-5 h-5 text-[var(--color-success)]" /><p className="text-sm text-[var(--color-success)]">Reports are encrypted end-to-end. Anonymous reporters cannot be identified.</p></div>

            <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-alt)] w-fit">
                {([{ id: 'cases' as Tab, label: 'Cases', icon: Eye }, { id: 'stats' as Tab, label: 'Statistics', icon: BarChart3 }]).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-[var(--color-surface)] dark:bg-[var(--color-surface)] shadow-sm dash-text' : 'dash-text-secondary hover:dash-text'}`}><t.icon className="w-4 h-4" />{t.label}</button>
                ))}
            </div>

            {tab === 'cases' ? (<>
                <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" /><input type="text" placeholder="Search by case number or subject..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" /></div>
                {loading ? <div className="dash-card rounded-2xl p-8 text-center"><Clock className="w-8 h-8 mx-auto mb-2 dash-text-tertiary animate-spin" /></div>
                    : filtered.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><ShieldAlert className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No reports yet.</p></div>
                        : <div className="space-y-3">{filtered.map(r => {
                            const sb = STATUS_BADGE[r.status]; const pb = PRIORITY_BADGE[r.priority];
                            const isCritical = r.priority === 'critical';
                            return (
                                <button key={r.id} onClick={() => setSelectedReport(r)} className={`w-full dash-card rounded-xl p-5 border transition-all text-left group hover:shadow-lg ${isCritical ? 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]/10' : 'border-[var(--color-border)] hover:border-[var(--color-accent)]'}`}>
                                    <div className="flex items-center justify-between gap-3"><div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <span className="text-[10px] font-mono dash-text-tertiary bg-[var(--color-surface-alt)] px-1.5 py-0.5 rounded">{r.case_number}</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${sb.bg} ${sb.text}`}>{r.status.replace(/_/g, ' ')}</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${pb.bg} ${pb.text}`}>{r.priority}</span>
                                            {isCritical && <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-danger)] text-white font-bold animate-pulse"><AlertCircle className="w-3 h-3" /> ACTION REQ</span>}
                                            {r.anonymous && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)] font-bold flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> ANON</span>}
                                        </div>
                                        <h4 className={`font-bold dash-text text-base ${isCritical ? 'text-[var(--color-danger)]' : ''}`}>{r.subject}</h4>
                                        <div className="flex items-center gap-3 mt-1.5">
                                            <p className="text-xs dash-text-secondary font-medium">{REPORT_CATEGORIES.find(c => c.id === r.category)?.label}</p>
                                            <div className="w-1 h-1 rounded-full bg-[var(--color-border)]" />
                                            <p className="text-xs dash-text-tertiary">Submitted {new Date(r.submitted_at).toLocaleDateString()}</p>
                                        </div>
                                    </div><ChevronRight className="w-5 h-5 dash-text-tertiary group-hover:dash-accent shrink-0 transition-transform group-hover:translate-x-1" /></div>
                                </button>);
                        })}</div>}
            </>) : stats && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[{ l: 'Total Reports', v: stats.totalReports, I: ShieldAlert, c: 'dash-accent' }, { l: 'Open Cases', v: stats.openCases, I: Clock, c: 'text-[var(--color-warning)]' }, { l: 'Resolved', v: stats.resolvedCases, I: CheckCircle2, c: 'text-[var(--color-success)]' }, { l: 'Avg Resolution', v: `${stats.avgResolutionDays}d`, I: TrendingUp, c: 'text-[var(--color-info)]' }].map(m => (
                            <div key={m.l} className="dash-card rounded-2xl p-5 border border-[var(--color-border)] hover:border-[var(--color-accent)]/30 transition-all">
                                <m.I className={`w-5 h-5 ${m.c} mb-3`} />
                                <p className="text-3xl font-black dash-text tracking-tight">{m.v}</p>
                                <p className="text-xs font-bold dash-text-tertiary uppercase tracking-widest mt-1">{m.l}</p>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {stats.byCategory.length > 0 && (
                            <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                                <div className="flex items-center gap-2 mb-6">
                                    <BarChart3 className="w-5 h-5 dash-accent" />
                                    <h4 className="font-bold dash-text uppercase tracking-widest text-xs">Reports by Category</h4>
                                </div>
                                <div className="space-y-5">
                                    {stats.byCategory.map(c => (
                                        <div key={c.category} className="space-y-1.5">
                                            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-tight">
                                                <span className="dash-text-secondary">{c.category}</span>
                                                <span className="dash-text">{c.count}</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-[var(--color-surface-alt)] overflow-hidden shadow-inner">
                                                <div className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-info)] transition-all duration-1000" style={{ width: `${(c.count / stats.totalReports) * 100}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)] flex flex-col justify-center bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-alt)]">
                            <div className="flex items-center gap-2 mb-6">
                                <Zap className="w-5 h-5 dash-accent" />
                                <h4 className="font-bold dash-text uppercase tracking-widest text-xs">Priority Distribution</h4>
                            </div>
                            <div className="space-y-6">
                                {(['critical', 'high', 'medium', 'low'] as const).map(p => {
                                    const count = reports.filter(r => r.priority === p).length;
                                    const pct = Math.round((count / Math.max(1, reports.length)) * 100);
                                    const badge = PRIORITY_BADGE[p];
                                    return (
                                        <div key={p} className="flex items-center gap-4">
                                            <div className={`w-24 text-[10px] font-black uppercase text-center py-1 rounded bg-opacity-20 ${badge.bg} ${badge.text}`}>
                                                {p}
                                            </div>
                                            <div className="flex-1 h-3 rounded-full bg-[var(--color-border)] overflow-hidden">
                                                <div className={`h-full transition-all duration-1000 ${badge.bg}`} style={{ width: `${pct}%` }} />
                                            </div>
                                            <div className="w-8 text-right text-xs font-bold dash-text">{pct}%</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {selectedReport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSelectedReport(null)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-start justify-between rounded-t-2xl">
                            <div><p className="text-xs font-mono dash-text-tertiary mb-1">{selectedReport.case_number}</p><h3 className="font-bold dash-text text-lg">{selectedReport.subject}</h3></div>
                            <button onClick={() => setSelectedReport(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button>
                        </div>
                        <div className="p-5 space-y-5">
                            <div className="flex gap-2 flex-wrap pb-2 border-b border-[var(--color-border)]">{(['submitted', 'under_investigation', 'escalated', 'resolved', 'dismissed'] as ReportStatus[]).map(s => { const b = STATUS_BADGE[s]; return <button key={s} onClick={() => handleStatusChange(selectedReport.id, s)} className={`text-[10px] px-3 py-1.5 rounded-full font-bold uppercase tracking-wider border transition-all ${selectedReport.status === s ? `${b.bg} ${b.text} border-current shadow-sm` : 'border-[var(--color-border)] dash-text-secondary hover:bg-[var(--color-surface-alt)]'}`}>{s.replace(/_/g, ' ')}</button>; })}</div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <div className="md:col-span-2 space-y-5">
                                    <div className="p-5 rounded-2xl bg-[var(--color-surface-alt)] border border-[var(--color-border)] shadow-inner">
                                        <h4 className="font-bold dash-text text-sm mb-2 flex items-center gap-2"><Info className="w-4 h-4 dash-accent" /> Description</h4>
                                        <p className="text-sm dash-text-secondary leading-relaxed font-medium">{selectedReport.description}</p>
                                    </div>

                                    {(selectedReport.updates || []).length > 0 && (
                                        <div className="space-y-4">
                                            <h4 className="font-bold dash-text text-sm flex items-center gap-2"><Clock className="w-4 h-4 dash-accent" /> Case Timeline</h4>
                                            <div className="space-y-0 ml-2 border-l-2 border-[var(--color-border)]">
                                                {(selectedReport.updates || []).map((u, i) => {
                                                    const isAI = u.performed_by.includes('AI');
                                                    return (
                                                        <div key={u.id} className="relative pl-6 pb-6 last:pb-2">
                                                            <div className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 ${isAI ? 'bg-[var(--color-accent)] border-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]' : 'bg-[var(--color-surface)] border-[var(--color-border)]'}`} />
                                                            <div className={`p-4 rounded-xl border transition-all ${isAI ? 'bg-[var(--color-accent-soft)] border-[var(--color-accent)]/20 shadow-sm' : 'bg-[var(--color-surface)] border-[var(--color-border)]'}`}>
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="text-xs font-bold dash-text uppercase tracking-tight">{u.action}</span>
                                                                    <span className="text-[10px] font-bold dash-text-tertiary uppercase">{new Date(u.created_at).toLocaleDateString()}</span>
                                                                </div>
                                                                <p className={`text-xs leading-relaxed ${isAI ? 'dash-text font-medium italic' : 'dash-text-secondary'}`}>{u.note}</p>
                                                                <p className="text-[10px] font-bold dash-text-tertiary mt-2 uppercase tracking-widest">— {u.performed_by}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-5">
                                    <div className="p-5 rounded-2xl bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-alt)] border border-[var(--color-border)] shadow-sm">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Zap className="w-4 h-4 dash-accent" />
                                            <h4 className="text-[10px] font-extrabold dash-text uppercase tracking-widest">AI Triage Profile</h4>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] font-bold dash-text-tertiary uppercase">Risk Priority</p>
                                                <div className={`px-2 py-1 rounded bg-opacity-10 text-center font-black text-xs uppercase ${PRIORITY_BADGE[selectedReport.priority].bg} ${PRIORITY_BADGE[selectedReport.priority].text}`}>
                                                    {selectedReport.priority}
                                                </div>
                                            </div>
                                            <div className="space-y-1.5 pt-2 border-t border-[var(--color-border)]">
                                                <p className="text-[10px] font-bold dash-text-tertiary uppercase">Compliance Sector</p>
                                                <p className="text-xs font-bold dash-text">{REPORT_CATEGORIES.find(c => c.id === selectedReport.category)?.label}</p>
                                            </div>
                                            <div className="p-3 rounded-lg bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/10">
                                                <p className="text-[9px] font-bold dash-text uppercase mb-1">Investigation Tip</p>
                                                <p className="text-[10px] dash-text-secondary leading-tight italic">AI suggests cross-referencing with Vendor Audit #412.</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                                        <h4 className="text-[10px] font-bold dash-text-tertiary uppercase tracking-widest mb-3">Case Metadata</h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center"><span className="text-xs dash-text-tertiary">Anonymity</span><span className="text-xs font-bold dash-text">{selectedReport.anonymous ? 'Full' : 'None'}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-xs dash-text-tertiary">Submission</span><span className="text-xs font-bold dash-text">{new Date(selectedReport.submitted_at).toLocaleDateString()}</span></div>
                                            <div className="flex justify-between items-center"><span className="text-xs dash-text-tertiary">Last Activity</span><span className="text-xs font-bold dash-text">{new Date(selectedReport.last_updated_at).toLocaleDateString()}</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Submit Report Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCreate(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Submit Compliance Report</h3><button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-success-soft)] border border-[var(--color-success)]/20"><Lock className="w-4 h-4 text-[var(--color-success)]" /><label className="flex items-center gap-2 text-sm text-[var(--color-success)] cursor-pointer"><input type="checkbox" checked={form.anonymous} onChange={e => setForm({ ...form, anonymous: e.target.checked })} className="rounded" /> Submit anonymously</label></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Category *</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as ReportCategory })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{REPORT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Subject *</label><input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="Brief summary of the concern" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Description *</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" placeholder="Provide details about the compliance concern..." /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Priority</label><select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as any })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
                            <button onClick={handleSubmit} disabled={saving || !form.subject || !form.description} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Submitting...' : 'Submit Report'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
