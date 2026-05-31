import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getAdPlacements, addAdPlacement, updatePlacementStatus,
    getGuardrails, addGuardrail, toggleGuardrail,
    getCampaignSummaries, runAdScrutiny,
    type AdPlacement, type TargetingGuardrail, type AdCampaignSummary,
} from '../../lib/programmaticAdService';
import {
    MonitorDot, ShieldAlert, CheckCircle2, XCircle, Eye,
    AlertTriangle, ToggleLeft, ToggleRight, Plus, X, Clock,
    Zap, Microscope, Activity, BarChart3,
} from 'lucide-react';

const PLACEMENT_STATUS: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
    approved: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]', icon: CheckCircle2 },
    flagged: { bg: 'bg-behance-amber-100', text: 'text-behance-amber-700', icon: AlertTriangle },
    pulled: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]', icon: XCircle },
    monitoring: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]', icon: Eye },
};

type Tab = 'placements' | 'guardrails' | 'campaigns';

export default function ProgrammaticAdPage() {
    const { profile } = useAuth();
    const companyId = profile?.company_id;
    const [tab, setTab] = useState<Tab>('placements');
    const [placements, setPlacements] = useState<AdPlacement[]>([]);
    const [guardrails, setGuardrailsList] = useState<TargetingGuardrail[]>([]);
    const [campaigns, setCampaigns] = useState<AdCampaignSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddPlacement, setShowAddPlacement] = useState(false);
    const [showAddGuardrail, setShowAddGuardrail] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pForm, setPForm] = useState({ campaign_name: '', product: '', platform: 'Instagram', placement_url: '', context: '', audience_segment: '', impressions: '0' });
    const [gForm, setGForm] = useState({ name: '', description: '', guardrail_type: 'audience_exclusion' as 'audience_exclusion' | 'context_exclusion' | 'frequency_cap' | 'geo_restriction' });

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const [p, g, c] = await Promise.all([getAdPlacements(companyId), getGuardrails(companyId), getCampaignSummaries(companyId)]);
        setPlacements(p); setGuardrailsList(g); setCampaigns(c); setLoading(false);
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    async function handleAddPlacement() {
        if (!companyId || !pForm.campaign_name || !pForm.product) return;
        setSaving(true);
        await addAdPlacement(companyId, { ...pForm, impressions: parseInt(pForm.impressions) || 0 });
        setShowAddPlacement(false); setPForm({ campaign_name: '', product: '', platform: 'Instagram', placement_url: '', context: '', audience_segment: '', impressions: '0' }); setSaving(false);
        load();
    }

    async function handleAddGuardrail() {
        if (!companyId || !gForm.name) return;
        setSaving(true);
        await addGuardrail(companyId, gForm);
        setShowAddGuardrail(false); setGForm({ name: '', description: '', guardrail_type: 'audience_exclusion' }); setSaving(false);
        load();
    }

    async function handleToggle(id: string, active: boolean) {
        await toggleGuardrail(id, !active);
        load();
    }

    async function handlePull(id: string) {
        await updatePlacementStatus(id, 'pulled', 'Manually pulled for compliance review');
        load();
    }

    async function handleScrutiny(id: string) {
        setSaving(true);
        const res = await runAdScrutiny(id);
        if (res.success) {
            load();
        } else {
            alert('AI Scrutiny failed to analyze this placement.');
        }
        setSaving(false);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1"><div className="p-2 rounded-xl bg-[var(--color-accent-soft)]"><MonitorDot className="w-5 h-5 dash-accent" /></div><h2 className="text-2xl font-bold dash-text">Programmatic Ad Compliance</h2></div>
                    <p className="dash-text-secondary text-sm ml-12">Targeting guardrails, placement monitoring, and automatic ad pull</p>
                </div>
                <div className="flex gap-2">
                    {tab === 'placements' && <button onClick={() => setShowAddPlacement(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90"><Plus className="w-4 h-4" /> Add Placement</button>}
                    {tab === 'guardrails' && <button onClick={() => setShowAddGuardrail(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90"><Plus className="w-4 h-4" /> Add Guardrail</button>}
                </div>
            </div>

            {placements.filter(p => p.status === 'pulled').length > 0 && (
                <div className="p-3 rounded-xl bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/20 flex items-center gap-3"><ShieldAlert className="w-5 h-5 text-[var(--color-danger)]" /><p className="text-sm text-[var(--color-danger)] font-medium">{placements.filter(p => p.status === 'pulled').length} ad(s) pulled for compliance violations</p></div>
            )}

            <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-alt)] w-fit">
                {([{ id: 'placements' as Tab, label: 'Live Placements' }, { id: 'guardrails' as Tab, label: 'Guardrails' }, { id: 'campaigns' as Tab, label: 'Campaign Overview' }]).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'dash-card dark:dash-card shadow-sm dash-text' : 'dash-text-secondary hover:dash-text'}`}>{t.label}</button>
                ))}
            </div>

            {loading ? <div className="dash-card rounded-2xl p-8 text-center"><Clock className="w-8 h-8 mx-auto mb-2 dash-text-tertiary animate-spin" /></div>
                : tab === 'placements' ? (
                    placements.length === 0 ? <div className="dash-card rounded-2xl p-12 text-center border-2 border-dashed border-[var(--color-border)]"><div className="w-16 h-16 bg-[var(--color-surface-alt)] rounded-2xl flex items-center justify-center mx-auto mb-4"><MonitorDot className="w-8 h-8 dash-text-tertiary" /></div><p className="dash-text font-semibold">No Active Placements</p><p className="dash-text-secondary text-sm">Add your first programmatic ad placement to start monitoring.</p></div>
                        : <div className="space-y-3">{placements.map(p => {
                            const ps = PLACEMENT_STATUS[p.status]; const PIcon = ps.icon; return (
                                <div key={p.id} className={`dash-card rounded-xl p-5 border transition-all hover:shadow-lg ${p.status === 'pulled' ? 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)]/20' : 'border-[var(--color-border)]'}`}>
                                    <div className="flex items-start gap-4"><PIcon className={`w-5 h-5 mt-1 shrink-0 ${ps.text}`} />
                                        <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-2 flex-wrap"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${ps.bg} ${ps.text}`}>{p.status}</span><span className="text-xs font-semibold dash-text-secondary">{p.platform}</span><div className="w-1 h-1 rounded-full bg-[var(--color-border)]" /><span className="text-xs dash-text-tertiary">{p.audience_segment}</span></div>
                                            <h4 className="font-bold dash-text text-base mb-1">{p.campaign_name}</h4>
                                            <p className="text-sm dash-text-secondary flex items-center gap-2"><Eye className="w-3.5 h-3.5" /> {p.context}</p>
                                            <p className="text-xs dash-text-tertiary mt-2 font-mono truncate bg-[var(--color-surface-alt)] p-1.5 rounded border border-[var(--color-border)]">{p.placement_url}</p>
                                            {p.violation && (
                                                <div className="mt-4 p-3 rounded-xl bg-behance-amber-50 border border-behance-amber-200 flex items-start gap-3">
                                                    <ShieldAlert className="w-4 h-4 text-behance-amber-600 shrink-0 mt-0.5" />
                                                    <div><p className="text-xs font-bold text-behance-amber-800 uppercase tracking-tight">AI Compliance Insight</p><p className="text-xs text-behance-amber-700 leading-relaxed font-medium mt-0.5">{p.violation}</p></div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2 shrink-0">
                                            {p.status !== 'pulled' && (
                                                <>
                                                    <button
                                                        onClick={() => handleScrutiny(p.id)}
                                                        disabled={saving}
                                                        className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                                    >
                                                        <Microscope className="w-3.5 h-3.5" /> Run Scrutiny
                                                    </button>
                                                    <button onClick={() => handlePull(p.id)} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-[var(--color-danger)]/20 text-[var(--color-danger)] font-bold hover:bg-[var(--color-danger-soft)] transition-all">
                                                        <XCircle className="w-3.5 h-3.5" /> Pull Ad
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex items-center justify-between"><div className="flex items-center gap-4"><div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 dash-text-tertiary" /><span className="text-xs font-bold dash-text">{p.impressions.toLocaleString()} <span className="dash-text-tertiary font-medium">Impressions</span></span></div></div><div className="text-[10px] font-bold dash-text-tertiary uppercase tracking-widest">Detected {new Date(p.detected_at).toLocaleDateString()}</div></div>
                                </div>);
                        })}</div>
                ) : tab === 'guardrails' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-3">
                            {guardrails.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center border-2 border-dashed border-[var(--color-border)]"><ShieldAlert className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" /><p className="dash-text-secondary text-sm">No guardrails configured.</p></div>
                                : guardrails.map(g => (
                                    <div key={g.id} className="dash-card rounded-xl p-5 border border-[var(--color-border)] flex items-center gap-5 hover:border-[var(--color-accent)]/50 transition-all">
                                        <button onClick={() => handleToggle(g.id, g.active)} className="shrink-0 group">{g.active ? <ToggleRight className="w-8 h-8 text-[var(--color-success)] group-hover:opacity-80 transition-all" /> : <ToggleLeft className="w-8 h-8 dash-text-tertiary group-hover:dash-accent transition-all" />}</button>
                                        <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><h4 className="font-bold dash-text text-sm">{g.name}</h4><span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] font-bold dash-text-tertiary uppercase tracking-tight">{g.guardrail_type.replace(/_/g, ' ')}</span></div><p className="text-xs dash-text-secondary leading-relaxed">{g.description}</p></div>
                                        <div className="text-right shrink-0">{g.violations > 0 ? <div className="flex flex-col items-end gap-1"><span className="text-[10px] font-bold text-[var(--color-danger)] uppercase">Enforcement</span><span className="text-sm font-black dash-text">{g.violations} <span className="text-[var(--color-danger)]">Hits</span></span></div> : <span className="text-xs px-2 py-1 rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)] font-bold">Compliant</span>}</div>
                                    </div>))}
                        </div>
                        <div className="space-y-6">
                            <div className="dash-card rounded-2xl p-5 border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-alt)]">
                                <h4 className="text-xs font-bold uppercase tracking-widest dash-text mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 dash-accent" /> Violation Distribution</h4>
                                <div className="space-y-4">
                                    {['context_exclusion', 'audience_exclusion', 'geo_restriction'].map(type => {
                                        const count = guardrails.filter(g => g.guardrail_type === type).reduce((s, g) => s + g.violations, 0);
                                        const total = Math.max(1, guardrails.reduce((s, g) => s + g.violations, 0));
                                        const pct = Math.round((count / total) * 100);
                                        return (
                                            <div key={type} className="space-y-1.5">
                                                <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight"><span className="dash-text-secondary">{type.replace('_', ' ')}</span><span className="dash-text">{pct}%</span></div>
                                                <div className="h-2 rounded-full bg-[var(--color-border)] overflow-hidden"><div className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} /></div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="p-5 rounded-2xl bg-[var(--color-accent-soft)] border border-[var(--color-accent)]/20 shadow-sm"><div className="flex items-center gap-3 mb-3"><Zap className="w-5 h-5 dash-accent" /><h4 className="text-xs font-bold dash-text uppercase">AI Guardrail Insight</h4></div><p className="text-xs dash-text-secondary leading-relaxed font-medium">Your "Context Exclusion" guardrails are catching 70% of risky placements. AI analysis suggests tightening geolocation rules for highly regulated products.</p></div>
                        </div>
                    </div>
                ) : (
                    campaigns.length === 0 ? <div className="dash-card rounded-2xl p-8 text-center"><p className="dash-text-secondary text-sm">No campaign data yet.</p></div>
                        : <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--color-border)]"><th className="text-left py-2 px-3 font-medium dash-text-secondary">Campaign</th><th className="text-center py-2 px-3 font-medium dash-text-secondary">Total</th><th className="text-center py-2 px-3 font-medium dash-text-secondary">Compliant</th><th className="text-center py-2 px-3 font-medium dash-text-secondary">Flagged</th><th className="text-center py-2 px-3 font-medium dash-text-secondary">Pulled</th><th className="text-center py-2 px-3 font-medium dash-text-secondary">Rate</th></tr></thead>
                            <tbody>{campaigns.map(c => (<tr key={c.campaignName} className="border-b border-[var(--color-border)] last:border-behance-blue"><td className="py-2.5 px-3"><p className="dash-text font-medium">{c.campaignName}</p><p className="text-xs dash-text-tertiary">{c.product}</p></td><td className="py-2.5 px-3 text-center dash-text">{c.totalPlacements}</td><td className="py-2.5 px-3 text-center text-[var(--color-success)]">{c.compliantPlacements}</td><td className="py-2.5 px-3 text-center text-behance-amber-600">{c.flaggedPlacements}</td><td className="py-2.5 px-3 text-center text-[var(--color-danger)]">{c.pulledPlacements}</td><td className="py-2.5 px-3 text-center"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.complianceRate >= 95 ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : c.complianceRate >= 90 ? 'bg-behance-amber-100 text-behance-amber-700' : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'}`}>{c.complianceRate}%</span></td></tr>))}</tbody></table></div></div>
                )}

            {/* Add Placement Modal */}
            {showAddPlacement && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAddPlacement(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Add Ad Placement</h3><button onClick={() => setShowAddPlacement(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Campaign *</label><input value={pForm.campaign_name} onChange={e => setPForm({ ...pForm, campaign_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Product *</label><input value={pForm.product} onChange={e => setPForm({ ...pForm, product: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" /></div></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-medium dash-text-secondary block mb-1">Platform</label><select value={pForm.platform} onChange={e => setPForm({ ...pForm, platform: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm">{['Instagram', 'Facebook', 'X', 'LinkedIn', 'YouTube', 'Google Ads', 'TikTok'].map(p => <option key={p}>{p}</option>)}</select></div><div><label className="text-xs font-medium dash-text-secondary block mb-1">Audience</label><input value={pForm.audience_segment} onChange={e => setPForm({ ...pForm, audience_segment: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. HCPs 45-65" /></div></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Placement URL</label><input value={pForm.placement_url} onChange={e => setPForm({ ...pForm, placement_url: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="https://..." /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Context</label><input value={pForm.context} onChange={e => setPForm({ ...pForm, context: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. Health/Wellness section" /></div>
                            <button onClick={handleAddPlacement} disabled={saving || !pForm.campaign_name || !pForm.product} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Adding...' : 'Add Placement'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Guardrail Modal */}
            {showAddGuardrail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowAddGuardrail(false)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                        <div className="border-b border-[var(--color-border)] p-5 flex items-center justify-between rounded-t-2xl"><h3 className="font-bold dash-text text-lg">Add Guardrail</h3><button onClick={() => setShowAddGuardrail(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]"><X className="w-5 h-5 dash-text-secondary" /></button></div>
                        <div className="p-5 space-y-4">
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Name *</label><input value={gForm.name} onChange={e => setGForm({ ...gForm, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm" placeholder="e.g. Exclude Minors Under 18" /></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Type</label><select value={gForm.guardrail_type} onChange={e => setGForm({ ...gForm, guardrail_type: e.target.value as any })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm"><option value="audience_exclusion">Audience Exclusion</option><option value="context_exclusion">Context Exclusion</option><option value="frequency_cap">Frequency Cap</option><option value="geo_restriction">Geo Restriction</option></select></div>
                            <div><label className="text-xs font-medium dash-text-secondary block mb-1">Description</label><textarea value={gForm.description} onChange={e => setGForm({ ...gForm, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm resize-none" /></div>
                            <button onClick={handleAddGuardrail} disabled={saving || !gForm.name} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50">{saving ? 'Adding...' : 'Add Guardrail'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

