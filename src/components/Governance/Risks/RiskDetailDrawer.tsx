import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
    ShieldAlert,
    Link2,
    Trash2,
    Plus,
    ArrowLeft,
    Calendar,
    User,
    ExternalLink,
    Shield,
    FileText,
    Building2,
    ClipboardList,
    Activity,
} from 'lucide-react';
import {
    Risk,
    RiskLink,
    getRiskDetail,
    listRiskLinks,
    addRiskLink,
    removeRiskLink,
    updateRisk,
    RISK_LEVELS,
    RISK_CATEGORIES,
    RISK_STATUSES,
} from '../../../lib/governance/riskRegisterService';

interface RiskDetailProps {
    riskId: string | null;
    onBack: () => void;
}

export default function RiskDetailDrawer({ riskId, onBack }: RiskDetailProps) {
    const { user, profile } = useAuth();
    const companyId = (profile as any)?.company_id;

    const [risk, setRisk] = useState<Risk | null>(null);
    const [links, setLinks] = useState<RiskLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddLink, setShowAddLink] = useState(false);

    const loadData = useCallback(async () => {
        if (!riskId) return;
        setLoading(true);
        const [r, l] = await Promise.all([
            getRiskDetail(riskId),
            listRiskLinks(riskId),
        ]);
        setRisk(r);
        setLinks(l);
        setLoading(false);
    }, [riskId]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleUpdate = async (updates: Partial<Risk>) => {
        if (!riskId || !user || !companyId) return;
        const success = await updateRisk(companyId, user.id, riskId, updates);
        if (success) loadData();
    };

    const handleAddLink = async (type: any, entityId: string) => {
        if (!riskId || !user || !companyId || !entityId) return;
        const success = await addRiskLink(companyId, user.id, riskId, type, entityId);
        if (success) {
            setShowAddLink(false);
            loadData();
        }
    };

    const handleRemoveLink = async (id: string) => {
        if (!user || !companyId) return;
        const success = await removeRiskLink(id, user.id, companyId);
        if (success) loadData();
    };

    if (!riskId) return null;

    return (
        <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between pb-6 border-b dash-border">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-xl hover:bg-[var(--color-surface-alt)] transition-colors"
                    >
                        <ArrowLeft size={18} className="dash-text-secondary" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold dash-text">{risk?.title ?? 'Loading Risk...'}</h1>
                        <div className="flex items-center gap-4 mt-1">
                            <span className="text-xs dash-text-tertiary flex items-center gap-1">
                                <Calendar size={12} /> {risk ? new Date(risk.created_at).toLocaleDateString() : '...'}
                            </span>
                            <span className="text-xs dash-text-tertiary flex items-center gap-1 font-bold">
                                ID: {riskId.slice(0, 8)}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button className="px-4 py-2 text-sm font-semibold rounded-xl border dash-border hover:bg-red-50 text-red-600 transition-all flex items-center gap-2">
                        <Trash2 size={16} /> Delete
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="p-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: 'var(--color-accent)' }} />
                </div>
            ) : risk && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="dash-card border dash-border rounded-2xl p-6 bg-[var(--color-surface-alt)]/30">
                            <h3 className="text-[11px] font-bold dash-text-tertiary uppercase tracking-widest mb-3 flex items-center gap-2">
                                <FileText size={14} /> Description
                            </h3>
                            <p className="text-sm dash-text leading-relaxed">
                                {risk.description || 'No detailed description provided for this risk.'}
                            </p>
                        </div>

                        <div className="dash-card border dash-border rounded-2xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[11px] font-bold dash-text-tertiary uppercase tracking-widest flex items-center gap-2">
                                    <Link2 size={14} /> Linked Signals ({links.length})
                                </h3>
                                <button
                                    onClick={() => setShowAddLink(true)}
                                    className="text-xs font-bold text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-shadow shadow-lg shadow-blue-500/20"
                                    style={{ background: 'var(--color-accent)' }}
                                >
                                    <Plus size={14} /> Traceability link
                                </button>
                            </div>

                            {links.length === 0 ? (
                                <div className="text-center py-10 border-2 border-dashed dash-border rounded-xl">
                                    <Link2 size={32} className="mx-auto mb-2 opacity-10" />
                                    <p className="text-xs dash-text-tertiary">No entities linked yet for traceability.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {links.map(l => (
                                        <div key={l.id} className="flex items-center justify-between p-3 rounded-xl border dash-border bg-[var(--color-surface-alt)]/20 hover:bg-[var(--color-surface-alt)] transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="p-1.5 rounded-lg bg-[var(--color-bg)]">
                                                    {l.link_type === 'control' && <Shield size={14} className="text-blue-500" />}
                                                    {l.link_type === 'policy' && <FileText size={14} className="text-emerald-500" />}
                                                    {l.link_type === 'vendor' && <Building2 size={14} className="text-purple-500" />}
                                                    {l.link_type === 'audit_request' && <ClipboardList size={14} className="text-amber-500" />}
                                                    {l.link_type === 'automation_test' && <Activity size={14} className="text-indigo-500" />}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold capitalize dash-text">{l.link_type.replace('_', ' ')}</p>
                                                    <p className="text-[10px] dash-text-tertiary font-mono">{l.linked_entity_id}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveLink(l.id)}
                                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 opacity-50 hover:opacity-100 transition-all"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar / Controls */}
                    <div className="space-y-6">
                        <div className="dash-card border dash-border rounded-2xl p-6 bg-[var(--color-surface-alt)]/50">
                            <h3 className="text-[11px] font-bold dash-text-tertiary uppercase mb-4 tracking-tighter">Properties</h3>

                            <div className="space-y-5">
                                <div>
                                    <label className="block text-[10px] font-bold dash-text-tertiary uppercase mb-1.5">Severity Level</label>
                                    <select
                                        value={risk.risk_level}
                                        onChange={e => handleUpdate({ risk_level: e.target.value as any })}
                                        className="w-full bg-[var(--color-bg)] border dash-border rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none"
                                        style={{ color: RISK_LEVELS.find(l => l.id === risk.risk_level)?.color }}
                                    >
                                        {RISK_LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold dash-text-tertiary uppercase mb-1.5">Status</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {RISK_STATUSES.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => handleUpdate({ status: s.id as any })}
                                                className={`text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-all ${risk.status === s.id
                                                        ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                                                        : 'dash-border dash-text-secondary hover:bg-[var(--color-bg)]'
                                                    }`}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold dash-text-tertiary uppercase mb-1.5">Category</label>
                                    <select
                                        value={risk.risk_category}
                                        onChange={e => handleUpdate({ risk_category: e.target.value as any })}
                                        className="w-full bg-[var(--color-bg)] border dash-border rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                                    >
                                        {RISK_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>

                                <div className="pt-2 border-t dash-border">
                                    <label className="block text-[10px] font-bold dash-text-tertiary uppercase mb-2">Owner</label>
                                    <div className="flex items-center gap-3 p-2.5 rounded-xl border dash-border bg-[var(--color-bg)]">
                                        <div className="w-8 h-8 rounded-full bg-[var(--color-surface-alt)] flex items-center justify-center font-bold text-xs text-blue-500">
                                            {risk.owner?.full_name[0] ?? <User size={14} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold dash-text truncate">{risk.owner?.full_name ?? 'Unassigned'}</p>
                                            <p className="text-[10px] dash-text-tertiary truncate">Risk Custodian</p>
                                        </div>
                                        <button className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)]">
                                            <ExternalLink size={12} className="dash-text-tertiary" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                            <div className="flex gap-3">
                                <div className="shrink-0 p-1.5 rounded-xl bg-amber-500/10">
                                    <ShieldAlert size={16} className="text-amber-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-amber-900 leading-tight">Post-Mitigation Monitoring</p>
                                    <p className="text-[10px] text-amber-800/70 mt-1 leading-relaxed">
                                        Ensure that all linked controls are verified as compliant to reduce risk score effectively.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Link Modal Stub (Quick-entry for Sprint 1) */}
            {showAddLink && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="dash-card border dash-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                        <h2 className="text-lg font-bold dash-text mb-4">Add Signal Link</h2>
                        <p className="text-xs dash-text-secondary mb-4">Enter the UUID of the entity to link for traceability.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold dash-text-tertiary uppercase mb-1">Entity Type</label>
                                <select id="linkType" className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-lg px-3 py-2 text-sm focus:outline-none">
                                    <option value="control">GRC Control</option>
                                    <option value="policy">Policy Version</option>
                                    <option value="vendor">Vendor</option>
                                    <option value="audit_request">Audit Request</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold dash-text-tertiary uppercase mb-1">Entity UUID</label>
                                <input id="entityId" className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none" placeholder="00000000-0000-0000-0000-000000000000" />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowAddLink(false)} className="px-4 py-2 text-sm font-medium dash-text-secondary">Cancel</button>
                            <button
                                onClick={() => handleAddLink(
                                    (document.getElementById('linkType') as HTMLSelectElement).value,
                                    (document.getElementById('entityId') as HTMLInputElement).value
                                )}
                                className="px-6 py-2 rounded-xl text-sm font-bold text-white"
                                style={{ background: 'var(--color-accent)' }}
                            >
                                Establish Link
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
