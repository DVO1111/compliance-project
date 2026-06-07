import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getCrisisEvents, createCrisisEvent, updateCrisisStatus,
    getAffectedMaterials, withdrawMaterial,
    activateAutomatedProtocol, quarantineAllMaterials, sendEmergencyBroadcast,
    type CrisisEvent, type CrisisLevel, type CrisisStatus, type AffectedMaterial,
} from '../../lib/crisisResponseService';
import {
    Siren, AlertTriangle, CheckCircle2, Clock, Shield,
    ChevronRight, X, FileText, Plus, Zap, Megaphone, Activity,
} from 'lucide-react';

const LEVEL_BADGE: Record<string, { bg: string; text: string }> = { watch: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]' }, alert: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' }, critical: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' }, recall: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' } };
const STATUS_BADGE: Record<string, { bg: string; text: string }> = { active: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' }, contained: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' }, resolved: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' }, closed: { bg: 'bg-[var(--color-surface-alt)]', text: 'text-[var(--color-text-secondary)]' } };
const MAT_STATUS: Record<string, { icon: typeof Shield; color: string; label: string }> = { live: { icon: AlertTriangle, color: 'text-[var(--color-danger)]', label: 'Still Live' }, withdrawn: { icon: CheckCircle2, color: 'text-[var(--color-success)]', label: 'Withdrawn' }, under_review: { icon: Clock, color: 'text-[var(--color-warning)]', label: 'Under Review' } };

export default function CrisisResponsePage() {
    const { user, profile } = useAuth();
    const companyId = profile?.company_id;
    const [crises, setCrises] = useState<CrisisEvent[]>([]);
    const [selectedCrisis, setSelectedCrisis] = useState<CrisisEvent | null>(null);
    const [materials, setMaterials] = useState<AffectedMaterial[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ title: '', description: '', level: 'alert' as CrisisLevel, product: '', affected_channels: '' });

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const data = await getCrisisEvents(companyId);
        setCrises(data);
        setLoading(false);
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    async function openCrisis(crisis: CrisisEvent) {
        setSelectedCrisis(crisis);
        const mats = await getAffectedMaterials(crisis.id);
        setMaterials(mats);
    }

    async function handleCreate() {
        if (!companyId || !user || !form.title || !form.product) return;
        setSaving(true);
        const crisis = await createCrisisEvent(companyId, user.id, {
            title: form.title,
            description: form.description,
            level: form.level,
            product: form.product,
            affected_channels: form.affected_channels.split(',').map(s => s.trim()).filter(Boolean)
        });

        if (crisis && (form.level === 'critical' || form.level === 'recall')) {
            // Auto-activate protocol for high severity
            await activateAutomatedProtocol(crisis.id, form.product);
        }

        setShowCreate(false);
        setForm({ title: '', description: '', level: 'alert', product: '', affected_channels: '' });
        setSaving(false);
        load();
    }

    async function handleGlobalQuarantine() {
        if (!selectedCrisis || !companyId || !user) return;
        setSaving(true);
        await quarantineAllMaterials(selectedCrisis.id, companyId, user.id);
        const mats = await getAffectedMaterials(selectedCrisis.id);
        setMaterials(mats);
        setSaving(false);
        load();
    }

    async function handleBroadcast() {
        if (!selectedCrisis || !user) return;
        const msg = window.prompt('Enter emergency broadcast message:');
        if (msg) {
            await sendEmergencyBroadcast(selectedCrisis.id, msg, profile?.full_name || user.email || 'Admin');
            load();
            // Reload details to show in timeline
            const updated = crises.find(c => c.id === selectedCrisis.id);
            if (updated) setSelectedCrisis(updated);
        }
    }

    async function handleStatusChange(crisisId: string, status: CrisisStatus) {
        if (!companyId || !user) return;
        await updateCrisisStatus(crisisId, status, companyId, user.id);
        load();
        setSelectedCrisis(null);
    }

    async function handleWithdraw(materialId: string) {
        await withdrawMaterial(materialId);
        if (selectedCrisis) {
            const mats = await getAffectedMaterials(selectedCrisis.id);
            setMaterials(mats);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1"><div className="p-2 rounded-xl bg-[var(--color-danger-soft)]"><Siren className="w-5 h-5 text-[var(--color-danger)]" /></div><h2 className="text-2xl font-bold dash-text">Crisis Response</h2></div>
                    <p className="dash-text-secondary text-sm ml-12">Rapid response protocol for safety signals, label changes, and recalls</p>
                </div>
                <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-danger)] hover:opacity-90 transition-colors"><Plus className="w-4 h-4" /> Trigger Crisis</button>
            </div>

            {crises.filter(c => c.status === 'active' && (c.level === 'critical' || c.level === 'recall')).length > 0 && (
                <div className="p-4 rounded-xl bg-[var(--color-danger-soft)] border-2 border-[var(--color-danger)]/30 flex items-center gap-3 animate-pulse"><Siren className="w-6 h-6 text-[var(--color-danger)]" /><div className="flex-1"><p className="font-bold text-[var(--color-danger)] text-sm">Active Crisis — Immediate Attention Required</p></div></div>
            )}

            {loading ? (
                <div className="dash-card rounded-2xl p-8 text-center"><Clock className="w-8 h-8 mx-auto mb-2 dash-text-tertiary animate-spin" /><p className="text-sm dash-text-secondary">Loading...</p></div>
            ) : crises.length === 0 ? (
                <div className="dash-card rounded-2xl p-8 text-center"><Shield className="w-10 h-10 mx-auto mb-3 text-[var(--color-success)]" /><p className="dash-text-secondary text-sm">No crisis events. Your compliance posture is strong.</p></div>
            ) : (
                <div className="space-y-3">{crises.map(crisis => {
                    const lb = LEVEL_BADGE[crisis.level]; const sb = STATUS_BADGE[crisis.status];
                    const pct = crisis.affected_content_count > 0 ? Math.round((crisis.withdrawn_count / crisis.affected_content_count) * 100) : 0;
                    return (
                        <button key={crisis.id} onClick={() => openCrisis(crisis)} className={`w-full dash-card rounded-xl p-5 border transition-all text-left group ${crisis.level === 'critical' && crisis.status === 'active' ? 'border-[var(--color-danger)]/30 hover:border-red-500' : 'border-[var(--color-border)] hover:border-[var(--color-accent)]'}`}>
                            <div className="flex items-start justify-between gap-4"><div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap"><span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${lb.bg} ${lb.text}`}>{crisis.level}</span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sb.bg} ${sb.text}`}>{crisis.status}</span><span className="text-xs dash-text-tertiary">{crisis.product}</span></div>
                                <h4 className="font-semibold dash-text text-sm">{crisis.title}</h4>
                                {crisis.affected_content_count > 0 && <div className="flex items-center gap-3 mt-3"><div className="flex-1 h-2 rounded-full bg-[var(--color-border)] overflow-hidden"><div className={`h-full rounded-full ${pct === 100 ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]'}`} style={{ width: `${pct}%` }} /></div><span className="text-xs font-semibold dash-text shrink-0">{crisis.withdrawn_count}/{crisis.affected_content_count}</span></div>}
                            </div><ChevronRight className="w-4 h-4 dash-text-tertiary group-hover:dash-accent shrink-0 mt-1" /></div>
                        </button>
                    );
                })}</div>
            )}

            {/* Detail Modal */}
            {selectedCrisis && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSelectedCrisis(null)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-start justify-between rounded-t-2xl">
                            <div><div className="flex items-center gap-2 mb-1"><span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${LEVEL_BADGE[selectedCrisis.level].bg} ${LEVEL_BADGE[selectedCrisis.level].text}`}>{selectedCrisis.level}</span></div><h3 className="font-bold dash-text text-lg">{selectedCrisis.title}</h3><p className="text-xs dash-text-secondary mt-0.5">{selectedCrisis.product}</p></div>
                            <button onClick={() => setSelectedCrisis(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] shrink-0"><X className="w-5 h-5 dash-text-secondary" /></button>
                        </div>
                        <div className="p-5 space-y-6">
                            {/* War Room Actions */}
                            <div className="p-4 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
                                <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-3 flex items-center gap-2">
                                    <Activity className="w-3 h-3" /> War Room Command
                                </h4>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleGlobalQuarantine}
                                        disabled={saving || !materials.some(m => m.status === 'live')}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-danger)] text-white text-xs font-bold shadow-lg shadow-[var(--color-danger)]/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                    >
                                        <Zap className="w-4 h-4" /> Execute Global Quarantine
                                    </button>
                                    <button
                                        onClick={handleBroadcast}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-xs font-bold shadow-lg shadow-[var(--color-accent)]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                    >
                                        <Megaphone className="w-4 h-4" /> Send Broadcast
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-2 flex-wrap">
                                {(['active', 'contained', 'resolved', 'closed'] as CrisisStatus[]).map(s => {
                                    const b = STATUS_BADGE[s];
                                    return <button key={s} onClick={() => handleStatusChange(selectedCrisis.id, s)} className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-all ${selectedCrisis.status === s ? `${b.bg} ${b.text} border-current` : 'border-[var(--color-border)] dash-text-secondary hover:border-[var(--color-accent)]'}`}>{s}</button>;
                                })}
                            </div>

                            {(selectedCrisis.timeline || []).length > 0 && (
                                <div><h4 className="font-semibold dash-text text-sm mb-3 flex items-center gap-2"><Clock className="w-4 h-4 dash-accent" /> Timeline</h4>
                                    <div className="space-y-0">{(selectedCrisis.timeline || []).map((entry, i) => (
                                        <div key={entry.id} className="flex gap-3"><div className="flex flex-col items-center"><div className={`w-3 h-3 rounded-full border-2 ${entry.automated ? 'bg-[var(--color-info)] border-blue-500' : 'bg-[var(--color-warning)] border-amber-500'}`} />{i < (selectedCrisis.timeline || []).length - 1 && <div className="w-0.5 h-full bg-[var(--color-border)]" />}</div>
                                            <div className="pb-4 flex-1"><div className="flex items-center gap-2"><span className="text-xs font-semibold dash-text">{entry.action}</span>{entry.automated && <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-info-soft)] text-[var(--color-info)]">Auto</span>}</div><p className="text-xs dash-text-secondary mt-0.5">{entry.details}</p><p className="text-xs dash-text-tertiary mt-0.5">{new Date(entry.created_at).toLocaleString()} — {entry.performer}</p></div></div>
                                    ))}</div></div>
                            )}

                            {materials.length > 0 && (
                                <div><h4 className="font-semibold dash-text text-sm mb-3 flex items-center gap-2"><FileText className="w-4 h-4 dash-accent" /> Affected Materials</h4>
                                    <div className="space-y-2">{materials.map(mat => {
                                        const ms = MAT_STATUS[mat.status]; const MIcon = ms.icon; return (
                                            <div key={mat.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
                                                <div className="flex-1 min-w-0"><p className="text-sm font-medium dash-text">{mat.title}</p><p className="text-xs dash-text-tertiary">{mat.channel}</p></div>
                                                <div className="flex items-center gap-2"><MIcon className={`w-4 h-4 ${ms.color}`} /><span className="text-xs font-medium dash-text">{ms.label}</span>
                                                    {mat.status === 'live' && <button onClick={() => handleWithdraw(mat.id)} className="text-xs px-2 py-1 rounded-lg bg-[var(--color-danger-soft)] text-[var(--color-danger)] font-medium hover:bg-[var(--color-danger-soft)]">Withdraw</button>}
                                                </div>
                                            </div>
                                        );
                                    })}</div></div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCreate(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Trigger Crisis Event</h3><button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Title *</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. Safety Signal — CardioMax" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Product *</label><input value={form.product} onChange={e => setForm({ ...form, product: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="Product name" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Severity Level</label>
                                <select value={form.level} onChange={e => setForm({ ...form, level: e.target.value as CrisisLevel })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">
                                    <option value="watch">Watch</option><option value="alert">Alert</option><option value="critical">Critical</option><option value="recall">Recall</option>
                                </select></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Description</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Affected Channels (comma-separated)</label><input value={form.affected_channels} onChange={e => setForm({ ...form, affected_channels: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="Website, Social Media, Email" /></div>
                            <button onClick={handleCreate} disabled={saving || !form.title || !form.product} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-danger)] hover:opacity-90 disabled:opacity-50">{saving ? 'Triggering...' : 'Trigger Crisis'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
