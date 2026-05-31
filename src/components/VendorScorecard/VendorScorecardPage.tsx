import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getVendors, addVendor, addAudit, updateVendorStatus, VENDOR_TYPES, type VendorProfile, type VendorType, type RiskTier } from '../../lib/vendorScorecardService';
import { Building2, ShieldCheck, AlertTriangle, CheckCircle2, Clock, X, Plus, Star, ChevronRight } from 'lucide-react';

const RISK_BADGE: Record<string, { bg: string; text: string }> = { low: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' }, medium: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' }, high: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' }, critical: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' } };

export default function VendorScorecardPage() {
    const { profile } = useAuth();
    const companyId = profile?.company_id;
    const [vendors, setVendors] = useState<VendorProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [showAudit, setShowAudit] = useState<string | null>(null);
    const [selected, setSelected] = useState<VendorProfile | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ vendor_name: '', vendor_type: 'agency' as VendorType, contact_email: '', compliance_certified: false, risk_tier: 'medium' as RiskTier });
    const [aForm, setAForm] = useState({ audit_type: 'periodic', findings: '', score: '80', auditor: '' });

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const data = await getVendors(companyId);
        setVendors(data); setLoading(false);
    }, [companyId]);
    useEffect(() => { load(); }, [load]);

    async function handleAdd() {
        if (!companyId || !form.vendor_name) return;
        setSaving(true);
        await addVendor(companyId, form);
        setShowAdd(false); setForm({ vendor_name: '', vendor_type: 'agency', contact_email: '', compliance_certified: false, risk_tier: 'medium' }); setSaving(false); load();
    }

    async function handleAudit() {
        if (!showAudit || !aForm.auditor) return;
        setSaving(true);
        await addAudit(showAudit, { audit_type: aForm.audit_type, findings: aForm.findings || undefined, score: parseInt(aForm.score) || 0, auditor: aForm.auditor });
        setShowAudit(null); setAForm({ audit_type: 'periodic', findings: '', score: '80', auditor: '' }); setSaving(false); load();
    }

    function scoreColor(s: number) { return s >= 80 ? 'text-[var(--color-success)]' : s >= 60 ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]'; }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div><div className="flex items-center gap-3 mb-1"><div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><Building2 className="w-5 h-5 dash-accent" /></div><h2 className="text-2xl font-bold dash-text">Vendor Scorecard</h2></div><p className="dash-text-secondary text-sm ml-12">Third-party risk assessment, audits, and compliance scoring</p></div>
                <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90"><Plus className="w-4 h-4" /> Add Vendor</button>
            </div>

            {vendors.filter(v => v.risk_tier === 'critical' || v.risk_tier === 'high').length > 0 && <div className="p-3 rounded-xl bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/20 flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" /><p className="text-sm text-[var(--color-warning)] font-medium">{vendors.filter(v => v.risk_tier === 'critical' || v.risk_tier === 'high').length} vendor(s) flagged as high/critical risk</p></div>}

            {loading ? <div className="dash-card rounded-2xl p-8 text-center"><Clock className="w-8 h-8 mx-auto mb-2 dash-text-tertiary animate-spin" /></div>
                : vendors.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><Building2 className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No vendors yet. Add your first vendor.</p></div>
                    : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{vendors.map(v => {
                        const rb = RISK_BADGE[v.risk_tier]; return (
                            <button key={v.id} onClick={() => setSelected(v)} className="dash-card rounded-xl p-5 border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-all text-left group">
                                <div className="flex items-start justify-between mb-3">
                                    <div><h4 className="font-semibold dash-text text-sm">{v.vendor_name}</h4><p className="text-xs dash-text-tertiary capitalize">{v.vendor_type}</p></div>
                                    <div className="text-right"><p className={`text-2xl font-black ${scoreColor(v.overall_score)}`}>{v.overall_score}</p><p className="text-xs dash-text-tertiary">Score</p></div>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rb.bg} ${rb.text}`}>{v.risk_tier} risk</span>
                                    {v.compliance_certified ? <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)] flex items-center gap-1"><ShieldCheck className="w-3 h-3" />Certified</span> : <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]">Not Certified</span>}
                                    <span className="text-xs dash-text-tertiary">{(v.audits || []).length} audit(s)</span>
                                </div>
                            </button>);
                    })}</div>}

            {/* Detail Modal */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-start justify-between rounded-t-2xl">
                            <div><h3 className="font-bold dash-text text-lg">{selected.vendor_name}</h3><p className="text-xs dash-text-secondary capitalize">{selected.vendor_type}{selected.contact_email ? ` · ${selected.contact_email}` : ''}</p></div>
                            <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex gap-3">
                                <div className="dash-card rounded-xl p-4 border border-[var(--color-border)] flex-1 text-center"><p className={`text-3xl font-black ${scoreColor(selected.overall_score)}`}>{selected.overall_score}</p><p className="text-xs dash-text-tertiary">Overall Score</p></div>
                                <div className="dash-card rounded-xl p-4 border border-[var(--color-border)] flex-1 text-center"><p className="text-3xl font-black dash-text">{(selected.audits || []).length}</p><p className="text-xs dash-text-tertiary">Audits</p></div>
                            </div>
                            <div className="flex gap-2"><button onClick={() => { setShowAudit(selected.id); setSelected(null); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[var(--color-accent-soft)] dash-accent"><Star className="w-4 h-4" /> Record Audit</button>
                                {selected.status === 'active' && <button onClick={() => { updateVendorStatus(selected.id, 'suspended').then(() => { load(); setSelected(null); }); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[var(--color-danger-soft)] text-[var(--color-danger)]">Suspend</button>}
                                {selected.status === 'suspended' && <button onClick={() => { updateVendorStatus(selected.id, 'active').then(() => { load(); setSelected(null); }); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[var(--color-success-soft)] text-[var(--color-success)]">Reactivate</button>}
                            </div>
                            {(selected.audits || []).length > 0 && <div><h4 className="font-semibold dash-text text-sm mb-3">Audit History</h4><div className="space-y-2">{(selected.audits || []).sort((a, b) => new Date(b.audit_date).getTime() - new Date(a.audit_date).getTime()).map(a => (
                                <div key={a.id} className="p-3 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
                                    <div className="flex items-center justify-between mb-1"><span className="text-xs font-medium dash-text capitalize">{a.audit_type.replace(/_/g, ' ')}</span><span className={`text-sm font-bold ${scoreColor(a.score)}`}>{a.score}/100</span></div>
                                    {a.findings && <p className="text-xs dash-text-secondary">{a.findings}</p>}
                                    <p className="text-xs dash-text-tertiary mt-1">{a.auditor} · {new Date(a.audit_date).toLocaleDateString()}</p>
                                </div>))}</div></div>}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Vendor */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAdd(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Add Vendor</h3><button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Vendor Name *</label><input value={form.vendor_name} onChange={e => setForm({ ...form, vendor_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Type</label><select value={form.vendor_type} onChange={e => setForm({ ...form, vendor_type: e.target.value as VendorType })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{VENDOR_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Risk Tier</label><select value={form.risk_tier} onChange={e => setForm({ ...form, risk_tier: e.target.value as RiskTier })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['low', 'medium', 'high', 'critical'].map(t => <option key={t}>{t}</option>)}</select></div></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Contact Email</label><input value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div>
                            <label className="flex items-center gap-2 text-sm dash-text cursor-pointer"><input type="checkbox" checked={form.compliance_certified} onChange={e => setForm({ ...form, compliance_certified: e.target.checked })} className="rounded" /> Compliance Certified</label>
                            <button onClick={handleAdd} disabled={saving || !form.vendor_name} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Adding...' : 'Add Vendor'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Record Audit */}
            {showAudit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAudit(null)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Record Audit</h3><button onClick={() => setShowAudit(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Audit Type</label><select value={aForm.audit_type} onChange={e => setAForm({ ...aForm, audit_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['initial', 'periodic', 'for_cause', 'follow_up'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Score (0-100)</label><input type="number" min="0" max="100" value={aForm.score} onChange={e => setAForm({ ...aForm, score: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Auditor *</label><input value={aForm.auditor} onChange={e => setAForm({ ...aForm, auditor: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Findings</label><textarea value={aForm.findings} onChange={e => setAForm({ ...aForm, findings: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" /></div>
                            <button onClick={handleAudit} disabled={saving || !aForm.auditor} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Recording...' : 'Record Audit'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
