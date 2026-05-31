import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getMonitoredPages, addMonitoredPage, resolvePageAlert, removeMonitoredPage, ALERT_LABELS, type MonitoredPage, type PageAlert } from '../../lib/websiteMonitoringService';
import { Globe, AlertTriangle, CheckCircle2, Clock, X, Plus, ExternalLink, Trash2 } from 'lucide-react';

const ALERT_SEV: Record<string, { bg: string; text: string }> = { low: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]' }, medium: { bg: 'bg-behance-amber-100', text: 'text-behance-amber-700' }, high: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' }, critical: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' } };

export default function WebsiteMonitoringPage() {
    const { profile } = useAuth();
    const companyId = profile?.company_id;
    const [pages, setPages] = useState<MonitoredPage[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ page_url: '', page_title: '', crawl_frequency: 'daily' });
    const [selected, setSelected] = useState<MonitoredPage | null>(null);

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const data = await getMonitoredPages(companyId);
        setPages(data); setLoading(false);
    }, [companyId]);
    useEffect(() => { load(); }, [load]);

    const totalAlerts = pages.reduce((s, p) => s + ((p.alerts || []).filter(a => !a.resolved).length), 0);

    async function handleAdd() {
        if (!companyId || !form.page_url || !form.page_title) return;
        setSaving(true);
        await addMonitoredPage(companyId, form);
        setShowAdd(false); setForm({ page_url: '', page_title: '', crawl_frequency: 'daily' }); setSaving(false); load();
    }

    async function handleResolve(alertId: string) { await resolvePageAlert(alertId); load(); if (selected) setSelected(pages.find(p => p.id === selected.id) || null); }
    async function handleRemove(pageId: string) { await removeMonitoredPage(pageId); load(); setSelected(null); }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div><div className="flex items-center gap-3 mb-1"><div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><Globe className="w-5 h-5 dash-accent" /></div><h2 className="text-2xl font-bold dash-text">Website Monitoring</h2></div><p className="dash-text-secondary text-sm ml-12">Continuous compliance monitoring for digital properties</p></div>
                <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90"><Plus className="w-4 h-4" /> Add Page</button>
            </div>

            {totalAlerts > 0 && <div className="p-3 rounded-xl bg-behance-amber-50 border border-behance-amber-200 flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-behance-amber-600" /><p className="text-sm text-behance-amber-700 font-medium">{totalAlerts} unresolved compliance alert(s) across your digital properties</p></div>}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[{ l: 'Monitored Pages', v: pages.length }, { l: 'Active Alerts', v: totalAlerts }, { l: 'Compliant Pages', v: pages.filter(p => (p.alerts || []).filter(a => !a.resolved).length === 0).length }, { l: 'Last Crawl', v: pages[0]?.last_crawled_at ? new Date(pages[0].last_crawled_at).toLocaleDateString() : 'N/A' }].map(m => (
                    <div key={m.l} className="dash-card rounded-xl p-4 border border-[var(--color-border)]"><p className="text-2xl font-bold dash-text">{m.v}</p><p className="text-xs dash-text-tertiary">{m.l}</p></div>))}
            </div>

            {loading ? <div className="dash-card rounded-2xl p-8 text-center"><Clock className="w-8 h-8 mx-auto mb-2 dash-text-tertiary animate-spin" /></div>
                : pages.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><Globe className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No pages monitored yet. Add your first page.</p></div>
                    : <div className="space-y-3">{pages.map(p => {
                        const openAlerts = (p.alerts || []).filter(a => !a.resolved); const isClean = openAlerts.length === 0; return (
                            <button key={p.id} onClick={() => setSelected(p)} className={`w-full dash-card rounded-xl p-4 border transition-all text-left group ${!isClean ? 'border-behance-amber-200' : 'border-[var(--color-border)] hover:border-[var(--color-accent)]'}`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {isClean ? <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" /> : <AlertTriangle className="w-4 h-4 text-behance-amber-500" />}
                                            <h4 className="font-semibold dash-text text-sm">{p.page_title}</h4>
                                            {!isClean && <span className="text-xs px-2 py-0.5 rounded-full bg-behance-amber-100 text-behance-amber-700 font-medium">{openAlerts.length} alert(s)</span>}
                                        </div>
                                        <p className="text-xs dash-text-tertiary flex items-center gap-1"><ExternalLink className="w-3 h-3" />{p.page_url}</p>
                                        <p className="text-xs dash-text-tertiary mt-0.5">Crawl: {p.crawl_frequency} · Status: {p.status}</p>
                                    </div>
                                </div>
                            </button>);
                    })}</div>}

            {/* Detail Modal */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-start justify-between rounded-t-2xl">
                            <div><h3 className="font-bold dash-text text-lg">{selected.page_title}</h3><p className="text-xs dash-text-tertiary">{selected.page_url}</p></div>
                            <div className="flex gap-2"><button onClick={() => handleRemove(selected.id)} className="p-1.5 rounded-lg hover:bg-[var(--color-danger-soft)] text-[var(--color-danger)]"><Trash2 className="w-4 h-4" /></button><button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        </div>
                        <div className="p-5 space-y-3">
                            {(selected.alerts || []).length === 0 ? <div className="p-4 rounded-xl bg-[var(--color-success-soft)] border border-[var(--color-success)]/20 flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" /><p className="text-sm text-[var(--color-success)] font-medium">Page is fully compliant — no alerts</p></div>
                                : (selected.alerts || []).map(a => {
                                    const sv = ALERT_SEV[a.severity]; return (
                                        <div key={a.id} className={`p-4 rounded-xl border ${a.resolved ? 'dash-surface-alt dash-border opacity-60' : `${sv.bg} border-current`}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div><div className="flex items-center gap-2 mb-1"><span className={`text-xs font-bold uppercase ${sv.text}`}>{a.severity}</span><span className="text-xs px-2 py-0.5 rounded dash-card/60 dash-text-tertiary">{ALERT_LABELS[a.alert_type as keyof typeof ALERT_LABELS] || a.alert_type}</span>{a.resolved && <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-success-soft)] text-[var(--color-success)]">Resolved</span>}</div>
                                                    <p className="text-sm font-medium dash-text">{a.description}</p>
                                                    <p className="text-xs dash-text-tertiary mt-0.5">{new Date(a.detected_at).toLocaleString()}</p></div>
                                                {!a.resolved && <button onClick={() => handleResolve(a.id)} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-success-soft)] text-[var(--color-success)] font-medium hover:bg-[var(--color-success-soft)] shrink-0">Resolve</button>}
                                            </div>
                                        </div>);
                                })}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Page Modal */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAdd(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Add Monitored Page</h3><button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Page Title *</label><input value={form.page_title} onChange={e => setForm({ ...form, page_title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. CardioMax Product Page" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Page URL *</label><input value={form.page_url} onChange={e => setForm({ ...form, page_url: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="https://..." /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Crawl Frequency</label><select value={form.crawl_frequency} onChange={e => setForm({ ...form, crawl_frequency: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm"><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></div>
                            <button onClick={handleAdd} disabled={saving || !form.page_url || !form.page_title} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Adding...' : 'Add Page'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

