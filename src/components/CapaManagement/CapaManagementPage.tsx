import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getCapas, createCapa, updateCapaStatus, addCapaAction, completeCapaAction, CAPA_SOURCES, type CapaRecord, type CapaSource, type CapaType, type CapaStatus } from '../../lib/capaService';
import { ClipboardList, CheckCircle2, Clock, ChevronRight, X, Plus, Target } from 'lucide-react';

const STATUS_BADGE: Record<string, { bg: string; text: string }> = { open: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]' }, investigating: { bg: 'bg-[var(--color-purple)]/10', text: 'text-[var(--color-purple)]' }, action_planned: { bg: 'bg-[var(--color-purple)]/10', text: 'text-[var(--color-purple)]' }, in_progress: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' }, verification: { bg: 'bg-cyan-100', text: 'text-cyan-700' }, closed: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' }, overdue: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' } };
const PRIORITY_BADGE: Record<string, { bg: string; text: string }> = { low: { bg: 'bg-[var(--color-surface-alt)]', text: 'text-[var(--color-text-secondary)]' }, medium: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]' }, high: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' }, critical: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' } };

export default function CapaManagementPage() {
    const { user, profile } = useAuth();
    const companyId = profile?.company_id;
    const [capas, setCapas] = useState<CapaRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [selected, setSelected] = useState<CapaRecord | null>(null);
    const [showAction, setShowAction] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ title: '', description: '', source: 'audit_finding' as CapaSource, capa_type: 'corrective' as CapaType, priority: 'medium', due_date: '', owner_name: '', root_cause: '' });
    const [aForm, setAForm] = useState({ action_type: 'corrective_action', description: '', assigned_to: '', due_date: '' });

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const data = await getCapas(companyId);
        setCapas(data); setLoading(false);
    }, [companyId]);
    useEffect(() => { load(); }, [load]);

    const openCount = capas.filter(c => c.status !== 'closed').length;

    async function handleCreate() {
        if (!companyId || !user || !form.title || !form.description) return;
        setSaving(true);
        await createCapa(companyId, user.id, form);
        setShowCreate(false); setForm({ title: '', description: '', source: 'audit_finding', capa_type: 'corrective', priority: 'medium', due_date: '', owner_name: '', root_cause: '' }); setSaving(false); load();
    }

    async function handleStatusChange(id: string, status: CapaStatus) { if (!companyId || !user) return; await updateCapaStatus(id, status, companyId, user.id); load(); setSelected(null); }

    async function handleAddAction() {
        if (!selected || !aForm.description || !companyId || !user) return;
        setSaving(true);
        await addCapaAction(selected.id, { action_type: aForm.action_type, description: aForm.description, assigned_to: aForm.assigned_to || undefined, due_date: aForm.due_date || undefined }, companyId, user.id);
        setShowAction(false); setAForm({ action_type: 'corrective_action', description: '', assigned_to: '', due_date: '' }); setSaving(false); load();
    }

    async function handleCompleteAction(actionId: string) { if (!companyId || !user) return; await completeCapaAction(actionId, companyId, user.id); load(); }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div><div className="flex items-center gap-3 mb-1"><div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><ClipboardList className="w-5 h-5 dash-accent" /></div><h2 className="text-2xl font-bold dash-text">CAPA Management</h2></div><p className="dash-text-secondary text-sm ml-12">Corrective and preventive actions with root cause tracking</p></div>
                <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90"><Plus className="w-4 h-4" /> New CAPA</button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[{ l: 'Total CAPAs', v: capas.length }, { l: 'Open', v: openCount }, { l: 'Closed', v: capas.filter(c => c.status === 'closed').length }, { l: 'Overdue', v: capas.filter(c => c.due_date && new Date(c.due_date) < new Date() && c.status !== 'closed').length }].map(m => (
                    <div key={m.l} className="dash-card rounded-xl p-4 border border-[var(--color-border)]"><p className="text-2xl font-bold dash-text">{m.v}</p><p className="text-xs dash-text-tertiary">{m.l}</p></div>))}
            </div>

            {loading ? <div className="dash-card rounded-2xl p-8 text-center"><Clock className="w-8 h-8 mx-auto mb-2 dash-text-tertiary animate-spin" /></div>
                : capas.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><ClipboardList className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No CAPAs recorded yet.</p></div>
                    : <div className="space-y-3">{capas.map(c => {
                        const sb = STATUS_BADGE[c.status]; const pb = PRIORITY_BADGE[c.priority]; const isOverdue = c.due_date && new Date(c.due_date) < new Date() && c.status !== 'closed'; return (
                            <button key={c.id} onClick={() => setSelected(c)} className={`w-full dash-card rounded-xl p-5 border transition-all text-left group ${isOverdue ? 'border-[var(--color-danger)]/20' : 'border-[var(--color-border)] hover:border-[var(--color-accent)]'}`}>
                                <div className="flex items-center justify-between gap-3"><div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-xs font-mono dash-text-tertiary">{c.capa_number}</span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sb.bg} ${sb.text}`}>{c.status.replace(/_/g, ' ')}</span><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pb.bg} ${pb.text}`}>{c.priority}</span><span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] dash-text-tertiary capitalize">{c.capa_type}</span>{isOverdue && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)] font-medium">OVERDUE</span>}</div>
                                    <h4 className="font-semibold dash-text text-sm">{c.title}</h4>
                                    <p className="text-xs dash-text-tertiary mt-0.5">{CAPA_SOURCES.find(s => s.id === c.source)?.label} · {c.owner_name || 'Unassigned'}{c.due_date ? ` · Due ${new Date(c.due_date).toLocaleDateString()}` : ''}</p>
                                </div><ChevronRight className="w-4 h-4 dash-text-tertiary group-hover:dash-accent shrink-0" /></div>
                            </button>);
                    })}</div>}

            {/* Detail Modal */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-start justify-between rounded-t-2xl">
                            <div><p className="text-xs font-mono dash-text-tertiary mb-1">{selected.capa_number}</p><h3 className="font-bold dash-text text-lg">{selected.title}</h3></div>
                            <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex gap-2 flex-wrap">{(['open', 'investigating', 'action_planned', 'in_progress', 'verification', 'closed'] as CapaStatus[]).map(s => { const b = STATUS_BADGE[s]; return <button key={s} onClick={() => handleStatusChange(selected.id, s)} className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-all ${selected.status === s ? `${b.bg} ${b.text} border-current` : 'border-[var(--color-border)] dash-text-secondary'}`}>{s.replace(/_/g, ' ')}</button>; })}</div>
                            <div className="p-4 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]"><h4 className="font-semibold dash-text text-sm mb-1">Description</h4><p className="text-sm dash-text-secondary">{selected.description}</p></div>
                            {selected.root_cause && <div className="p-4 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]"><h4 className="font-semibold dash-text text-sm mb-1">Root Cause</h4><p className="text-sm dash-text-secondary">{selected.root_cause}</p></div>}
                            <div className="flex items-center justify-between"><h4 className="font-semibold dash-text text-sm flex items-center gap-2"><Target className="w-4 h-4 dash-accent" /> Actions</h4><button onClick={() => setShowAction(true)} className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-accent-soft)] dash-accent font-medium hover:opacity-80"><Plus className="w-3 h-3 inline" /> Add Action</button></div>
                            {(selected.actions || []).length === 0 ? <p className="text-sm dash-text-secondary">No actions yet.</p>
                                : <div className="space-y-2">{(selected.actions || []).map(a => (
                                    <div key={a.id} className={`p-3 rounded-lg border ${a.status === 'completed' ? 'bg-[var(--color-success-soft)] border-[var(--color-success)]/20' : 'bg-[var(--color-surface-alt)] border-[var(--color-border)]'}`}>
                                        <div className="flex items-start justify-between gap-2"><div className="flex-1"><div className="flex items-center gap-2 mb-0.5"><span className="text-xs font-medium dash-text capitalize">{a.action_type.replace(/_/g, ' ')}</span>{a.status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" /> : <Clock className="w-3.5 h-3.5 dash-text-tertiary" />}</div><p className="text-sm dash-text-secondary">{a.description}</p><p className="text-xs dash-text-tertiary mt-0.5">{a.assigned_to || 'Unassigned'}{a.due_date ? ` · Due ${new Date(a.due_date).toLocaleDateString()}` : ''}</p></div>
                                            {a.status !== 'completed' && <button onClick={() => handleCompleteAction(a.id)} className="text-xs px-2 py-1 rounded-lg bg-[var(--color-success-soft)] text-[var(--color-success)] font-medium shrink-0">Complete</button>}
                                        </div>
                                    </div>))}</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* New CAPA */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCreate(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">New CAPA</h3><button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Title *</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Description *</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" /></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Source</label><select value={form.source} onChange={e => setForm({ ...form, source: e.target.value as CapaSource })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{CAPA_SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Type</label><select value={form.capa_type} onChange={e => setForm({ ...form, capa_type: e.target.value as CapaType })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm"><option value="corrective">Corrective</option><option value="preventive">Preventive</option><option value="both">Both</option></select></div></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Priority</label><select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['low', 'medium', 'high', 'critical'].map(p => <option key={p}>{p}</option>)}</select></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Due Date</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Owner</label><input value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Root Cause (if known)</label><textarea value={form.root_cause} onChange={e => setForm({ ...form, root_cause: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" /></div>
                            <button onClick={handleCreate} disabled={saving || !form.title || !form.description} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Creating...' : 'Create CAPA'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Action */}
            {showAction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAction(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Add Action</h3><button onClick={() => setShowAction(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Action Type</label><select value={aForm.action_type} onChange={e => setAForm({ ...aForm, action_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['investigation', 'corrective_action', 'preventive_action', 'verification', 'closure'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Description *</label><textarea value={aForm.description} onChange={e => setAForm({ ...aForm, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" /></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Assigned To</label><input value={aForm.assigned_to} onChange={e => setAForm({ ...aForm, assigned_to: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Due Date</label><input type="date" value={aForm.due_date} onChange={e => setAForm({ ...aForm, due_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div></div>
                            <button onClick={handleAddAction} disabled={saving || !aForm.description} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Adding...' : 'Add Action'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
