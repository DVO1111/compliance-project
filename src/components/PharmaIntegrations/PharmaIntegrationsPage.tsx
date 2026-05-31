import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { listConnections, createConnection, updateConnection, deleteConnection, recordHealthCheck } from '../../integrations/connectionStore';
import { providerRegistry } from '../../integrations/providers/providerRegistry';
import '../../integrations/providers/init';
import type { IntegrationConnection, ProviderManifest } from '../../integrations/types';
import { Plug, CheckCircle2, XCircle, Clock, RefreshCw, Trash2, Plus, X, ChevronRight, Zap, ArrowUpDown, FileWarning, HeartPulse } from 'lucide-react';

const PHARMA_PROVIDER_IDS = ['veeva_promomats', 'adobe_aem', 'veeva_rim', 'pharmacovigilance', 'healthcare_lms'] as const;
type PharmaProviderId = typeof PHARMA_PROVIDER_IDS[number];

type SyncEvent = { id: string; provider_id: string; direction: string; event_type: string; entity_type: string; status: string; error_message: string | null; created_at: string; completed_at: string | null };
type AeReport = { id: string; source_channel: string; product_name: string; event_description: string; seriousness: string; status: string; pv_case_id: string | null; forwarded_to_pv: boolean; created_at: string };
type LabelChange = { id: string; product_name: string; label_version: string | null; change_type: string; change_summary: string; affected_content_count: number; re_review_triggered: boolean; status: string; received_at: string };

const STATUS_ICON: Record<string, { color: string; Icon: any }> = {
    active: { color: 'text-[var(--color-success)]', Icon: CheckCircle2 },
    pending: { color: 'text-behance-amber-500', Icon: Clock },
    error: { color: 'text-[var(--color-danger)]', Icon: XCircle },
    disabled: { color: 'dash-text-tertiary', Icon: XCircle },
};

const PROVIDER_ICON: Record<string, { emoji: string; color: string }> = {
    veeva_promomats: { emoji: '📦', color: 'bg-[var(--color-warning-soft)]' },
    adobe_aem: { emoji: '🎨', color: 'bg-[var(--color-danger-soft)]' },
    veeva_rim: { emoji: '📋', color: 'bg-[var(--color-info-soft)]' },
    pharmacovigilance: { emoji: '🛡️', color: 'bg-behance-purple/10' },
    healthcare_lms: { emoji: '🎓', color: 'bg-cyan-100' },
};

type Tab = 'integrations' | 'sync_log' | 'ae_queue' | 'label_changes';

export default function PharmaIntegrationsPage() {
    const { user, profile } = useAuth();
    const companyId = profile?.company_id;
    const [tab, setTab] = useState<Tab>('integrations');
    const [connections, setConnections] = useState<IntegrationConnection[]>([]);
    const [syncEvents, setSyncEvents] = useState<SyncEvent[]>([]);
    const [aeReports, setAeReports] = useState<AeReport[]>([]);
    const [labelChanges, setLabelChanges] = useState<LabelChange[]>([]);
    const [loading, setLoading] = useState(true);
    const [showConnect, setShowConnect] = useState<PharmaProviderId | null>(null);
    const [showDetail, setShowDetail] = useState<IntegrationConnection | null>(null);
    const [saving, setSaving] = useState(false);
    const [configForm, setConfigForm] = useState<Record<string, unknown>>({});
    const [showAeForm, setShowAeForm] = useState(false);
    const [aeForm, setAeForm] = useState({ source_channel: 'social_media', product_name: '', event_description: '', seriousness: 'non_serious', patient_initials: '', meddra_pt: '' });
    const [showLabelForm, setShowLabelForm] = useState(false);
    const [labelForm, setLabelForm] = useState({ product_name: '', change_type: 'general_update', change_summary: '', label_version: '' });

    const pharmaManifests = providerRegistry.getAllManifests().filter(m => PHARMA_PROVIDER_IDS.includes(m.id as PharmaProviderId));

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const conns = await listConnections(companyId);
            setConnections(conns.filter(c => PHARMA_PROVIDER_IDS.includes(c.provider_id as PharmaProviderId)));

            const { data: se } = await supabase.from('pharma_sync_events' as any).select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50);
            setSyncEvents((se || []) as any);

            const { data: ae } = await supabase.from('pharma_ae_reports' as any).select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50);
            setAeReports((ae || []) as any);

            const { data: lc } = await supabase.from('pharma_label_changes' as any).select('*').eq('company_id', companyId).order('received_at', { ascending: false }).limit(50);
            setLabelChanges((lc || []) as any);
        } catch { /* ignore */ }
        setLoading(false);
    }, [companyId]);
    useEffect(() => { load(); }, [load]);

    function getManifest(id: string): ProviderManifest | undefined { return pharmaManifests.find(m => m.id === id); }
    function getConn(providerId: string): IntegrationConnection | undefined { return connections.find(c => c.provider_id === providerId); }

    async function handleConnect() {
        if (!showConnect || !companyId || !user) return;
        setSaving(true);
        const manifest = getManifest(showConnect);
        await createConnection({ company_id: companyId, provider_id: showConnect as any, display_name: manifest?.name || showConnect, status: 'active', credentials_encrypted: null, config: configForm, created_by: user.id });
        setShowConnect(null); setConfigForm({}); setSaving(false); load();
    }

    async function handleTestConnection(conn: IntegrationConnection) {
        const provider = providerRegistry.get(conn.provider_id);
        if (!provider) return;
        const result = await provider.healthCheck(conn);
        await recordHealthCheck(conn.id, result.healthy, result.error);
        load();
    }

    async function handleToggle(conn: IntegrationConnection) {
        const newStatus = conn.status === 'active' ? 'disabled' : 'active';
        await updateConnection(conn.id, { status: newStatus });
        load();
    }

    async function handleDelete(conn: IntegrationConnection) {
        if (!confirm(`Disconnect ${conn.display_name}?`)) return;
        await deleteConnection(conn.id);
        load();
    }

    async function handleReportAe() {
        if (!companyId || !user || !aeForm.product_name || !aeForm.event_description) return;
        setSaving(true);
        await supabase.from('pharma_ae_reports' as any).insert({ company_id: companyId, source_channel: aeForm.source_channel, product_name: aeForm.product_name, event_description: aeForm.event_description, seriousness: aeForm.seriousness, patient_initials: aeForm.patient_initials || null, meddra_pt: aeForm.meddra_pt || null, created_by: user.id } as any);
        setShowAeForm(false); setAeForm({ source_channel: 'social_media', product_name: '', event_description: '', seriousness: 'non_serious', patient_initials: '', meddra_pt: '' }); setSaving(false); load();
    }

    async function handleForwardAe(id: string) {
        const pvConn = connections.find(c => c.provider_id === 'pharmacovigilance' && c.status === 'active');
        if (!pvConn) { alert('No active PV connection'); return; }
        await supabase.from('pharma_ae_reports' as any).update({ forwarded_to_pv: true, forwarded_at: new Date().toISOString(), status: 'forwarded' } as any).eq('id', id);
        load();
    }

    async function handleLogLabelChange() {
        if (!companyId || !labelForm.product_name || !labelForm.change_summary) return;
        setSaving(true);
        await supabase.from('pharma_label_changes' as any).insert({ company_id: companyId, product_name: labelForm.product_name, change_type: labelForm.change_type, change_summary: labelForm.change_summary, label_version: labelForm.label_version || null, source_system: 'manual' } as any);
        setShowLabelForm(false); setLabelForm({ product_name: '', change_type: 'general_update', change_summary: '', label_version: '' }); setSaving(false); load();
    }

    async function handleTriggerReReview(id: string) {
        await supabase.from('pharma_label_changes' as any).update({ re_review_triggered: true, status: 'reviewing' } as any).eq('id', id);
        load();
    }

    const activeCount = connections.filter(c => c.status === 'active').length;
    const pendingAe = aeReports.filter(r => r.status === 'pending').length;
    const pendingLabels = labelChanges.filter(l => l.status === 'pending').length;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div><div className="flex items-center gap-3 mb-1"><div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><Plug className="w-5 h-5 dash-accent" /></div><h2 className="text-2xl font-bold dash-text">Pharma Integrations</h2></div><p className="dash-text-secondary text-sm ml-12">Enterprise connections for Veeva, AEM, pharmacovigilance, and LMS platforms</p></div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[{ l: 'Connected', v: activeCount, icon: CheckCircle2, c: 'text-[var(--color-success)]' }, { l: 'Sync Events (24h)', v: syncEvents.filter(s => new Date(s.created_at) > new Date(Date.now() - 86400000)).length, icon: ArrowUpDown, c: 'dash-accent' }, { l: 'Pending AEs', v: pendingAe, icon: HeartPulse, c: pendingAe > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]' }, { l: 'Label Changes', v: pendingLabels, icon: FileWarning, c: pendingLabels > 0 ? 'text-behance-amber-500' : 'text-[var(--color-success)]' }].map(m => (
                    <div key={m.l} className="dash-card rounded-xl p-4 border border-[var(--color-border)]"><div className="flex items-center gap-2 mb-1"><m.icon className={`w-4 h-4 ${m.c}`} /><p className="text-2xl font-bold dash-text">{m.v}</p></div><p className="text-xs dash-text-tertiary">{m.l}</p></div>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-alt)] w-fit">
                {([{ id: 'integrations' as Tab, label: 'Integrations', icon: Plug }, { id: 'sync_log' as Tab, label: 'Sync Log', icon: ArrowUpDown }, { id: 'ae_queue' as Tab, label: 'AE Queue', icon: HeartPulse }, { id: 'label_changes' as Tab, label: 'Label Changes', icon: FileWarning }]).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'dash-card dark:dash-card shadow-sm dash-text' : 'dash-text-secondary hover:dash-text'}`}><t.icon className="w-4 h-4" />{t.label}{t.id === 'ae_queue' && pendingAe > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)]">{pendingAe}</span>}{t.id === 'label_changes' && pendingLabels > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-behance-amber-100 text-behance-amber-700">{pendingLabels}</span>}</button>
                ))}
            </div>

            {loading && <div className="dash-card rounded-2xl p-8 text-center"><Clock className="w-8 h-8 mx-auto mb-2 dash-text-tertiary animate-spin" /></div>}

            {/* ═══ INTEGRATIONS TAB ═══ */}
            {!loading && tab === 'integrations' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {PHARMA_PROVIDER_IDS.map(pid => {
                        const manifest = getManifest(pid);
                        const conn = getConn(pid);
                        const pi = PROVIDER_ICON[pid];
                        const si = conn ? STATUS_ICON[conn.status] || STATUS_ICON.pending : null;
                        return (
                            <div key={pid} className={`dash-card rounded-2xl border transition-all ${conn?.status === 'active' ? 'border-[var(--color-success)]/20' : conn ? 'border-behance-amber-200' : 'border-[var(--color-border)]'}`}>
                                <div className="p-5">
                                    <div className="flex items-start gap-3 mb-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${pi.color}`}>{pi.emoji}</div>
                                        <div className="flex-1 min-w-0"><h3 className="font-semibold dash-text text-sm">{manifest?.name || pid}</h3><p className="text-xs dash-text-tertiary mt-0.5 line-clamp-2">{manifest?.description}</p></div>
                                        {si && <si.Icon className={`w-5 h-5 shrink-0 ${si.color}`} />}
                                    </div>
                                    {conn ? (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-xs"><span className={`px-2 py-0.5 rounded-full font-medium ${conn.status === 'active' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : conn.status === 'error' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'dash-surface-alt dash-text'}`}>{conn.status}</span>{conn.last_synced_at && <span className="dash-text-tertiary">Last sync: {new Date(conn.last_synced_at).toLocaleDateString()}</span>}</div>
                                            {conn.last_error && <div className="p-2 rounded-lg bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20"><p className="text-xs text-[var(--color-danger)] truncate">{conn.last_error}</p></div>}
                                            <div className="flex gap-2 pt-1">
                                                <button onClick={() => handleTestConnection(conn)} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-surface-alt)] dash-text-secondary hover:dash-text flex items-center gap-1"><RefreshCw className="w-3 h-3" />Test</button>
                                                <button onClick={() => handleToggle(conn)} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-surface-alt)] dash-text-secondary hover:dash-text">{conn.status === 'active' ? 'Disable' : 'Enable'}</button>
                                                <button onClick={() => setShowDetail(conn)} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-accent-soft)] dash-accent flex items-center gap-1"><ChevronRight className="w-3 h-3" />Config</button>
                                                <button onClick={() => handleDelete(conn)} className="text-xs px-2 py-1.5 rounded-lg bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] ml-auto"><Trash2 className="w-3 h-3" /></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={() => { setShowConnect(pid); setConfigForm({}); }} className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Connect</button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══ SYNC LOG TAB ═══ */}
            {!loading && tab === 'sync_log' && (
                syncEvents.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><ArrowUpDown className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No sync events yet. Connect an integration to start.</p></div>
                    : <div className="space-y-2">{syncEvents.map(e => (
                        <div key={e.id} className="dash-card rounded-xl p-4 border border-[var(--color-border)]">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${e.direction === 'inbound' ? 'bg-[var(--color-info-soft)] text-[var(--color-info)]' : 'bg-[var(--color-success-soft)] text-[var(--color-success)]'}`}>{e.direction === 'inbound' ? '↓' : '↑'}</div>
                                <div className="flex-1 min-w-0"><p className="text-sm font-medium dash-text">{e.event_type}</p><p className="text-xs dash-text-tertiary">{e.provider_id} · {e.entity_type || 'unknown'} · {new Date(e.created_at).toLocaleString()}</p></div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.status === 'completed' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : e.status === 'failed' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-behance-amber-100 text-behance-amber-700'}`}>{e.status}</span>
                            </div>
                            {e.error_message && <p className="text-xs text-[var(--color-danger)] mt-1 ml-11 truncate">{e.error_message}</p>}
                        </div>
                    ))}</div>
            )}

            {/* ═══ AE QUEUE TAB ═══ */}
            {!loading && tab === 'ae_queue' && (<>
                <div className="flex justify-end"><button onClick={() => setShowAeForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90"><Plus className="w-4 h-4" />Report AE</button></div>
                {aeReports.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><HeartPulse className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No adverse event reports. Monitor marketing channels for AE signals.</p></div>
                    : <div className="space-y-2">{aeReports.map(r => (
                        <div key={r.id} className={`dash-card rounded-xl p-4 border ${r.seriousness === 'serious' || r.seriousness === 'fatal' ? 'border-[var(--color-danger)]/20' : 'border-[var(--color-border)]'}`}>
                            <div className="flex items-start gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${r.seriousness === 'fatal' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : r.seriousness === 'serious' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-behance-amber-100 text-behance-amber-700'}`}><HeartPulse className="w-4 h-4" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1"><span className="font-semibold text-sm dash-text">{r.product_name}</span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.seriousness === 'fatal' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : r.seriousness === 'serious' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-behance-amber-100 text-behance-amber-700'}`}>{r.seriousness}</span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'forwarded' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : r.status === 'pending' ? 'dash-surface-alt dash-text' : 'bg-[var(--color-info-soft)] text-[var(--color-info)]'}`}>{r.status}</span></div>
                                    <p className="text-sm dash-text-secondary line-clamp-2">{r.event_description}</p>
                                    <p className="text-xs dash-text-tertiary mt-0.5">Source: {r.source_channel.replace(/_/g, ' ')} · {new Date(r.created_at).toLocaleString()}{r.pv_case_id ? ` · PV Case: ${r.pv_case_id}` : ''}</p>
                                </div>
                                {r.status === 'pending' && <button onClick={() => handleForwardAe(r.id)} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-accent-soft)] dash-accent font-medium hover:opacity-80 shrink-0 flex items-center gap-1"><Zap className="w-3 h-3" />Forward to PV</button>}
                            </div>
                        </div>
                    ))}</div>}
            </>)}

            {/* ═══ LABEL CHANGES TAB ═══ */}
            {!loading && tab === 'label_changes' && (<>
                <div className="flex justify-end"><button onClick={() => setShowLabelForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90"><Plus className="w-4 h-4" />Log Label Change</button></div>
                {labelChanges.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><FileWarning className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No label changes received. Connect Veeva RIM for automatic notifications.</p></div>
                    : <div className="space-y-2">{labelChanges.map(l => (
                        <div key={l.id} className={`dash-card rounded-xl p-4 border ${l.change_type === 'black_box' || l.change_type === 'contraindication' ? 'border-[var(--color-danger)]/20' : l.change_type === 'safety_update' ? 'border-behance-amber-200' : 'border-[var(--color-border)]'}`}>
                            <div className="flex items-start gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${l.change_type === 'black_box' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : l.change_type === 'safety_update' ? 'bg-behance-amber-100 text-behance-amber-700' : 'bg-[var(--color-info-soft)] text-[var(--color-info)]'}`}><FileWarning className="w-4 h-4" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1"><span className="font-semibold text-sm dash-text">{l.product_name}</span>{l.label_version && <span className="text-xs dash-text-tertiary">v{l.label_version}</span>}<span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.change_type === 'black_box' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : l.change_type === 'safety_update' || l.change_type === 'contraindication' ? 'bg-behance-amber-100 text-behance-amber-700' : 'bg-[var(--color-info-soft)] text-[var(--color-info)]'}`}>{l.change_type.replace(/_/g, ' ')}</span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.status === 'completed' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : l.status === 'reviewing' ? 'bg-[var(--color-info-soft)] text-[var(--color-info)]' : 'dash-surface-alt dash-text'}`}>{l.status}</span>{l.re_review_triggered && <span className="text-xs px-1.5 py-0.5 rounded bg-behance-purple/10 text-behance-purple flex items-center gap-0.5"><RefreshCw className="w-2.5 h-2.5" />Re-review</span>}</div>
                                    <p className="text-sm dash-text-secondary">{l.change_summary}</p>
                                    <p className="text-xs dash-text-tertiary mt-0.5">{l.affected_content_count} affected material(s) · {new Date(l.received_at).toLocaleString()}</p>
                                </div>
                                {l.status === 'pending' && !l.re_review_triggered && <button onClick={() => handleTriggerReReview(l.id)} className="text-xs px-3 py-1.5 rounded-lg bg-behance-purple/10 text-behance-purple font-medium hover:bg-[var(--color-purple)]/10 shrink-0 flex items-center gap-1"><RefreshCw className="w-3 h-3" />Trigger Re-Review</button>}
                            </div>
                        </div>
                    ))}</div>}
            </>)}

            {/* ═══ CONNECT MODAL ═══ */}
            {showConnect && (() => {
                const manifest = getManifest(showConnect);
                if (!manifest) return null;
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowConnect(null)}>
                        <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><div className="flex items-center gap-3"><span className="text-lg">{PROVIDER_ICON[showConnect].emoji}</span><h3 className="font-bold dash-text text-lg">Connect {manifest.name}</h3></div><button onClick={() => setShowConnect(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                            <div className="p-5 space-y-4">
                                <p className="text-sm dash-text-secondary">{manifest.description}</p>
                                {manifest.configSchema.map(field => (
                                    <div key={field.key}>
                                        <label className="text-xs font-medium dash-text-secondary block mb-1">{field.label}{field.required && ' *'}</label>
                                        {field.type === 'toggle' ? (
                                            <button onClick={() => setConfigForm({ ...configForm, [field.key]: !configForm[field.key] })} className={`w-12 h-6 rounded-full transition-colors ${configForm[field.key] ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'} relative`}><span className={`absolute top-0.5 w-5 h-5 rounded-full dash-card shadow transition-transform ${configForm[field.key] ? 'left-[26px]' : 'left-0.5'}`} /></button>
                                        ) : field.type === 'select' ? (
                                            <select value={configForm[field.key] as string || ''} onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                                        ) : (
                                            <input type={field.type === 'url' ? 'url' : 'text'} value={configForm[field.key] as string || ''} onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder={field.placeholder} />
                                        )}
                                        {field.helpText && <p className="text-xs dash-text-tertiary mt-0.5">{field.helpText}</p>}
                                    </div>
                                ))}
                                <button onClick={handleConnect} disabled={saving} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Connecting...' : 'Connect Integration'}</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ═══ CONFIG DETAIL MODAL ═══ */}
            {showDetail && (() => {
                const manifest = getManifest(showDetail.provider_id);
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowDetail(null)}>
                        <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">{showDetail.display_name} — Config</h3><button onClick={() => setShowDetail(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                            <div className="p-5 space-y-3">
                                <div className="p-3 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]"><div className="grid grid-cols-2 gap-2 text-xs"><div><span className="dash-text-tertiary">Status</span><p className="dash-text font-medium capitalize">{showDetail.status}</p></div><div><span className="dash-text-tertiary">Created</span><p className="dash-text font-medium">{new Date(showDetail.created_at).toLocaleDateString()}</p></div>{showDetail.last_health_check_at && <div><span className="dash-text-tertiary">Last Health Check</span><p className="dash-text font-medium">{new Date(showDetail.last_health_check_at).toLocaleString()}</p></div>}{showDetail.last_synced_at && <div><span className="dash-text-tertiary">Last Sync</span><p className="dash-text font-medium">{new Date(showDetail.last_synced_at).toLocaleString()}</p></div>}</div></div>
                                <h4 className="font-semibold text-sm dash-text">Configuration</h4>
                                {manifest?.configSchema.map(field => {
                                    const val = showDetail.config[field.key];
                                    return <div key={field.key} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-behance-blue"><span className="text-xs dash-text-secondary">{field.label}</span><span className="text-xs dash-text font-medium">{field.type === 'toggle' ? (val ? '✅ Enabled' : '❌ Disabled') : (val as string) || '—'}</span></div>;
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ═══ REPORT AE MODAL ═══ */}
            {showAeForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAeForm(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg flex items-center gap-2"><HeartPulse className="w-5 h-5 text-[var(--color-danger)]" />Report Adverse Event</h3><button onClick={() => setShowAeForm(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Source Channel *</label><select value={aeForm.source_channel} onChange={e => setAeForm({ ...aeForm, source_channel: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['social_media', 'patient_support', 'field_report', 'digital_channel', 'hcp_interaction', 'call_center'].map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Seriousness *</label><select value={aeForm.seriousness} onChange={e => setAeForm({ ...aeForm, seriousness: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm"><option value="non_serious">Non-Serious</option><option value="serious">Serious</option><option value="fatal">Fatal</option></select></div></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Product Name *</label><input value={aeForm.product_name} onChange={e => setAeForm({ ...aeForm, product_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Event Description *</label><textarea value={aeForm.event_description} onChange={e => setAeForm({ ...aeForm, event_description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" /></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Patient Initials</label><input value={aeForm.patient_initials} onChange={e => setAeForm({ ...aeForm, patient_initials: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. J.D." /></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">MedDRA Preferred Term</label><input value={aeForm.meddra_pt} onChange={e => setAeForm({ ...aeForm, meddra_pt: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. Headache" /></div></div>
                            <button onClick={handleReportAe} disabled={saving || !aeForm.product_name || !aeForm.event_description} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-danger)] hover:opacity-90 disabled:opacity-50">{saving ? 'Reporting...' : 'Report Adverse Event'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ LOG LABEL CHANGE MODAL ═══ */}
            {showLabelForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowLabelForm(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg flex items-center gap-2"><FileWarning className="w-5 h-5 text-behance-amber-500" />Log Label Change</h3><button onClick={() => setShowLabelForm(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Product *</label><input value={labelForm.product_name} onChange={e => setLabelForm({ ...labelForm, product_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Label Version</label><input value={labelForm.label_version} onChange={e => setLabelForm({ ...labelForm, label_version: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. 4.2" /></div></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Change Type *</label><select value={labelForm.change_type} onChange={e => setLabelForm({ ...labelForm, change_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['new_indication', 'safety_update', 'dosage_change', 'contraindication', 'black_box', 'general_update'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Change Summary *</label><textarea value={labelForm.change_summary} onChange={e => setLabelForm({ ...labelForm, change_summary: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" placeholder="Describe what changed in the label..." /></div>
                            <button onClick={handleLogLabelChange} disabled={saving || !labelForm.product_name || !labelForm.change_summary} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Logging...' : 'Log Label Change'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

