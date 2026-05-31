import { useState, useEffect, useCallback } from 'react';
import {
    Plus,
    Search,
    Filter,
    ChevronRight,
    User,
    ExternalLink,
    ShieldCheck,
    Clock,
    Globe,
    Scale,
    Activity
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { listObligations, createObligation, RegulatoryObligation } from '../../../lib/governance/obligationService';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../lib/logger';

export default function ObligationListPage() {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id;

    const [obligations, setObligations] = useState<RegulatoryObligation[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [regulations, setRegulations] = useState<any[]>([]);

    const loadData = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const data = await listObligations(companyId, {
                status: statusFilter === 'all' ? undefined : statusFilter
            });
            setObligations(data || []);

            const { data: regs } = await supabase.from('regulations').select('id, title');
            setRegulations(regs || []);
        } catch (err) {
            logger.error('Failed to load obligations:', err);
        } finally {
            setLoading(false);
        }
    }, [companyId, statusFilter]);

    useEffect(() => { loadData(); }, [loadData]);

    const filtered = obligations.filter(o =>
        o.title.toLowerCase().includes(search.toLowerCase()) ||
        o.regulation?.title?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold dash-text flex items-center gap-3">
                        <div className="p-2 rounded-xl shadow-lg" style={{ background: 'var(--color-accent)' }}>
                            <Scale size={22} className="text-white" />
                        </div>
                        Regulatory Obligations
                    </h1>
                    <p className="text-sm dash-text-secondary mt-1">Operationalize regulatory requirements into trackable compliance tasks</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md active:scale-95"
                >
                    <Plus size={18} /> Add Obligation
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-center bg-[var(--color-surface)] p-2 rounded-2xl border dash-border shadow-sm">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 dash-text-tertiary group-focus-within:text-blue-500 transition-colors" size={18} />
                    <input
                        type="text"
                        placeholder="Search obligations or regulations..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-transparent border-none focus:ring-0 pl-11 pr-4 py-2.5 text-sm dash-text"
                    />
                </div>
                <div className="flex items-center gap-2 px-2 border-l dash-border">
                    <Filter size={16} className="dash-text-tertiary" />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-sm font-medium dash-text cursor-pointer"
                    >
                        <option value="all">All Statuses</option>
                        <option value="identified">Identified</option>
                        <option value="implemented">Implemented</option>
                        <option value="monitored">Monitored</option>
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="bg-[var(--color-surface)] rounded-2xl border dash-border shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[var(--color-surface-alt)]/50 border-b dash-border">
                            <th className="px-6 py-4 text-[11px] font-bold dash-text-tertiary uppercase tracking-widest text-center w-12">#</th>
                            <th className="px-6 py-4 text-[11px] font-bold dash-text-tertiary uppercase tracking-widest">Obligation</th>
                            <th className="px-6 py-4 text-[11px] font-bold dash-text-tertiary uppercase tracking-widest">Regulation</th>
                            <th className="px-6 py-4 text-[11px] font-bold dash-text-tertiary uppercase tracking-widest">Jurisdiction</th>
                            <th className="px-6 py-4 text-[11px] font-bold dash-text-tertiary uppercase tracking-widest text-center">Status</th>
                            <th className="px-6 py-4 text-[11px] font-bold dash-text-tertiary uppercase tracking-widest">Owner</th>
                            <th className="px-6 py-4 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y dash-border">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td colSpan={7} className="px-6 py-8 h-16 bg-[var(--color-surface-alt)]/10" />
                                </tr>
                            ))
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center dash-text-tertiary">
                                    <Scale size={48} className="mx-auto mb-4 opacity-10" />
                                    <p className="text-lg font-medium">No obligations found</p>
                                    <p className="text-sm">Identify a requirement from a regulation to get started.</p>
                                </td>
                            </tr>
                        ) : filtered.map((o, idx) => (
                            <tr
                                key={o.id}
                                className="hover:bg-[var(--color-surface-alt)]/50 transition-colors cursor-pointer group"
                                onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'obligation-detail', obligationId: o.id } }))}
                            >
                                <td className="px-6 py-4 text-xs font-bold dash-text-tertiary text-center w-12">{idx + 1}</td>
                                <td className="px-6 py-4">
                                    <p className="text-sm font-bold dash-text group-hover:text-blue-500 transition-colors">{o.title}</p>
                                    <p className="text-xs dash-text-tertiary truncate max-w-xs mt-0.5">{o.description}</p>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <ExternalLink size={12} className="dash-text-tertiary" />
                                        <span className="text-xs font-semibold dash-text">{o.regulation?.title || 'Direct Obligation'}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <Globe size={12} className="dash-text-tertiary" />
                                        <span className="text-xs font-medium dash-text-secondary uppercase">{o.jurisdiction}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex justify-center">
                                        <StatusBadge status={o.status} />
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600">
                                            {o.owner?.full_name?.charAt(0) || <User size={12} />}
                                        </div>
                                        <span className="text-xs font-medium dash-text-secondary">{o.owner?.full_name?.split(' ')[0] || 'Unassigned'}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <ChevronRight size={16} className="dash-text-tertiary group-hover:translate-x-1 transition-transform" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showCreateModal && (
                <CreateModal
                    onClose={() => setShowCreateModal(false)}
                    regulations={regulations}
                    onCreated={loadData}
                    companyId={companyId}
                />
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        identified: 'bg-blue-100 text-blue-700 border-blue-200',
        implemented: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        monitored: 'bg-amber-100 text-amber-700 border-amber-200'
    };

    const icons: Record<string, any> = {
        identified: Activity,
        implemented: ShieldCheck,
        monitored: Clock
    };

    const Icon = icons[status] || Activity;

    return (
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border flex items-center gap-1.5 w-fit ${styles[status]}`}>
            <Icon size={12} />
            {status}
        </span>
    );
}

function CreateModal({ onClose, regulations, onCreated, companyId }: any) {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        regulation_id: '',
        jurisdiction: 'nigeria',
        category: 'compliance',
        status: 'identified'
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await createObligation(companyId, profile!.id, {
                ...formData,
                regulation_id: formData.regulation_id || null,
                owner_id: profile!.id,
                status: formData.status as any
            });
            onCreated();
            onClose();
        } catch (err) {
            logger.error('Failed to create obligation:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--color-bg)] w-full max-w-lg rounded-2xl shadow-2xl border dash-border overflow-hidden">
                <div className="px-6 py-4 border-b dash-border bg-[var(--color-surface)] flex items-center justify-between">
                    <h2 className="text-lg font-bold dash-text">Identify New Obligation</h2>
                    <button onClick={onClose} className="dash-text-tertiary hover:dash-text">×</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase dash-text-tertiary ml-1">Title</label>
                        <input
                            required
                            className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:ring-2 focus:ring-blue-500 transition-all"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Requirement title (e.g. Mandatory FDA Disclaimer)"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase dash-text-tertiary ml-1">Regulation</label>
                            <select
                                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:ring-2 focus:ring-blue-500 transition-all"
                                value={formData.regulation_id}
                                onChange={(e) => setFormData({ ...formData, regulation_id: e.target.value })}
                            >
                                <option value="">No parent regulation</option>
                                {regulations.map((r: any) => (
                                    <option key={r.id} value={r.id}>{r.title}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase dash-text-tertiary ml-1">Jurisdiction</label>
                            <select
                                className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:ring-2 focus:ring-blue-500 transition-all"
                                value={formData.jurisdiction}
                                onChange={(e) => setFormData({ ...formData, jurisdiction: e.target.value })}
                            >
                                <option value="nigeria">Nigeria</option>
                                <option value="usa">USA (FDA)</option>
                                <option value="europe">Europe (EMA)</option>
                                <option value="all">Global</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase dash-text-tertiary ml-1">Description</label>
                        <textarea
                            required
                            rows={4}
                            className="w-full bg-[var(--color-surface)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:ring-2 focus:ring-blue-500 transition-all"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Describe the specific obligation text and impact..."
                        />
                    </div>

                    <div className="flex items-center gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border dash-border dash-text hover:bg-[var(--color-surface-alt)] transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50"
                        >
                            {loading ? 'Creating...' : 'Create Obligation'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
