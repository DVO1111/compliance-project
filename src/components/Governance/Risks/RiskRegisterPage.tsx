import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
    ShieldAlert,
    Plus,
    Search,
    Filter,
    AlertTriangle,
    ChevronRight,
    User,
    ExternalLink,
    Target,
    BarChart3,
    CheckCircle2,
    TrendingDown,
    TrendingUp,
    RefreshCw,
} from 'lucide-react';
import { SkeletonLine } from '../../Dashboard/ui/Skeleton';
import {
    Risk,
    RISK_CATEGORIES,
    RISK_LEVELS,
    RISK_STATUSES,
    listRisks,
    createRisk,
} from '../../../lib/governance/riskRegisterService';
import {
    getCompanyRiskPosture,
    recomputeCompanyRiskPosture,
    CompanyRiskPosture,
} from '../../../lib/governance/riskScoringService';

/* ─── helpers ──────────────────────────────────────────────── */

function levelBadge(level: string) {
    const cfg = RISK_LEVELS.find(l => l.id === level) ?? { label: level, color: '#94a3b8' };
    return (
        <span
            className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm"
            style={{ background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}44` }}
        >
            {cfg.label}
        </span>
    );
}

function categoryLabel(cat: string) {
    return RISK_CATEGORIES.find(c => c.id === cat)?.label ?? cat;
}

/* ─── component ────────────────────────────────────────────── */

export default function RiskRegisterPage() {
    const { user, profile } = useAuth();
    const companyId = (profile as any)?.company_id;

    const [risks, setRisks] = useState<Risk[]>([]);
    const [posture, setPosture] = useState<CompanyRiskPosture | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [search, setSearch] = useState('');
    const [filterLevel, setFilterLevel] = useState('all');

    // Create form
    const [form, setForm] = useState<Partial<Risk>>({
        title: '',
        risk_category: 'security',
        risk_level: 'medium',
        status: 'identified',
    });
    const [creating, setCreating] = useState(false);

    const loadData = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const [r, p] = await Promise.all([
                listRisks(companyId),
                getCompanyRiskPosture(companyId),
            ]);
            setRisks(r);
            setPosture(p);
        } catch (err: any) {
            setLoadError(err?.message || 'Failed to load risk register');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleCreate = async () => {
        if (!form.title || !companyId || !user) return;
        setCreating(true);
        const res = await createRisk(companyId, user.id, form);
        if (res) {
            setShowCreate(false);
            setForm({ title: '', risk_category: 'security', risk_level: 'medium', status: 'identified' });
            await loadData();
        }
        setCreating(false);
    };

    const handleRefreshPosture = async () => {
        if (!companyId) return;
        await recomputeCompanyRiskPosture(companyId);
        await loadData();
    };

    const filtered = risks.filter(r => {
        if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterLevel !== 'all' && r.risk_level !== filterLevel) return false;
        return true;
    });

    const openRisk = (id: string) => {
        window.dispatchEvent(new CustomEvent('navigate', {
            detail: { page: 'risk-detail', riskId: id },
        }));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold dash-text flex items-center gap-3">
                        <div className="p-2 rounded-xl shadow-lg" style={{ background: 'var(--color-accent)' }}>
                            <ShieldAlert size={22} className="text-white" />
                        </div>
                        Risk Register
                    </h1>
                    <p className="text-sm dash-text-secondary mt-1">Centralized risk management and scoring engine</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRefreshPosture}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border dash-border hover:bg-[var(--color-surface-alt)] shadow-sm transition-all"
                    >
                        <BarChart3 size={16} /> Refresh Score
                    </button>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-xl hover:shadow-2xl transition-all"
                        style={{ background: 'var(--color-accent)' }}
                    >
                        <Plus size={18} /> New Risk
                    </button>
                </div>
            </div>

            {/* Posture Summary Card */}
            {posture && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="dash-card border dash-border rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                            <Target size={60} />
                        </div>
                        <p className="text-[11px] font-bold dash-text-tertiary uppercase tracking-wider mb-1">Company Risk Score</p>
                        <div className="flex items-end gap-2">
                            <p className="text-4xl font-black dash-text">{posture.posture_score}</p>
                            <p className="text-xs dash-text-tertiary mb-1.5">/ 100</p>
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-500 font-semibold bg-emerald-500/10 px-2 py-1 rounded-lg w-max">
                            <CheckCircle2 size={12} /> Live Posture
                        </div>
                    </div>

                    <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm">
                        <p className="text-[11px] font-bold dash-text-tertiary uppercase tracking-wider mb-1">Highest Risk Level</p>
                        <p className="text-2xl font-bold dash-text uppercase tracking-tight" style={{ color: RISK_LEVELS.find(l => l.id === posture.highest_risk_level)?.color }}>
                            {posture.highest_risk_level}
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                            <div className="h-1.5 flex-1 bg-[var(--color-surface-alt)] rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-red-500"
                                    style={{ width: `${(posture.posture_score / 100) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm">
                        <p className="text-[11px] font-bold dash-text-tertiary uppercase tracking-wider mb-1">Open Risks</p>
                        <p className="text-3xl font-bold dash-text">{posture.open_risks_count}</p>
                        <p className="text-xs dash-text-tertiary mt-1">Requires mitigation attention</p>
                    </div>

                    <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm bg-[var(--color-surface-alt)]">
                        <p className="text-[11px] font-bold dash-text-tertiary uppercase tracking-wider mb-2">Signal Breakdown</p>
                        <div className="space-y-1.5">
                            <MetricRow label="Controls" value={posture.control_signal_score} weight={35} />
                            <MetricRow label="Vendors" value={posture.vendor_signal_score} weight={25} />
                            <MetricRow label="Policy" value={posture.policy_signal_score} weight={20} />
                        </div>
                    </div>
                </div>
            )}

            {/* Table & Filters */}
            <div className="dash-card border dash-border rounded-2xl overflow-x-auto shadow-sm">
                <div className="p-4 border-b dash-border flex items-center gap-4 bg-[var(--color-surface-alt)]/50">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search risk register..."
                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter size={14} className="dash-text-tertiary" />
                        <select
                            value={filterLevel}
                            onChange={e => setFilterLevel(e.target.value)}
                            className="bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2 text-sm focus:outline-none"
                        >
                            <option value="all">Levels: All</option>
                            {RISK_LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="p-4 space-y-2">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4 px-1 py-2">
                                <SkeletonLine className="h-4 flex-[2]" />
                                <SkeletonLine className="h-4 flex-1" />
                                <SkeletonLine className="h-5 w-16 rounded-full" />
                                <SkeletonLine className="h-5 w-20 rounded-lg" />
                                <SkeletonLine className="h-4 w-24" />
                                <SkeletonLine className="h-5 w-8 rounded-lg" />
                                <SkeletonLine className="h-4 w-20" />
                            </div>
                        ))}
                    </div>
                ) : loadError ? (
                    <div className="p-12 text-center">
                        <div className="w-10 h-10 rounded-full bg-[var(--color-danger-soft)] flex items-center justify-center mx-auto mb-3">
                            <AlertTriangle size={20} className="text-[var(--color-danger)]" />
                        </div>
                        <p className="font-semibold dash-text mb-1">Failed to load risks</p>
                        <p className="text-sm dash-text-tertiary mb-4">{loadError}</p>
                        <button onClick={loadData} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border dash-border hover:bg-[var(--color-surface-alt)] transition-colors">
                            <RefreshCw size={14} /> Retry
                        </button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-16 text-center">
                        <div className="w-12 h-12 rounded-full bg-[var(--color-surface-alt)] flex items-center justify-center mx-auto mb-4">
                            <ShieldAlert size={24} className="dash-text-tertiary" />
                        </div>
                        <p className="font-bold dash-text mb-1">{search || filterLevel !== 'all' ? 'No risks match your filters' : 'No risks documented yet'}</p>
                        <p className="text-sm dash-text-tertiary mb-5">{search || filterLevel !== 'all' ? 'Try adjusting your search or filter.' : 'Start by documenting your first organizational risk.'}</p>
                        {!search && filterLevel === 'all' && (
                            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md" style={{ background: 'var(--color-accent)' }}>
                                <Plus size={16} /> New Risk
                            </button>
                        )}
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b dash-border text-xs uppercase font-bold dash-text-tertiary tracking-wider">
                                <th className="text-left px-5 py-3">Risk Title</th>
                                <th className="text-left px-5 py-3">Category</th>
                                <th className="text-left px-5 py-3">Inherent Level</th>
                                <th className="text-left px-5 py-3">Status</th>
                                <th className="text-left px-5 py-3">Owner</th>
                                <th className="text-center px-5 py-3">Links</th>
                                <th className="text-right px-5 py-3">Updated</th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(r => (
                                <tr
                                    key={r.id}
                                    className="border-b dash-border hover:bg-[var(--color-surface-alt)] transition-colors cursor-pointer"
                                    onClick={() => openRisk(r.id)}
                                >
                                    <td className="px-5 py-4 font-semibold dash-text">{r.title}</td>
                                    <td className="px-5 py-4 dash-text-secondary">{categoryLabel(r.risk_category)}</td>
                                    <td className="px-5 py-4">{levelBadge(r.risk_level)}</td>
                                    <td className="px-5 py-4">
                                        <span className="capitalize text-xs font-medium px-2 py-0.5 rounded-lg bg-[var(--color-bg)] dash-text-secondary border dash-border">
                                            {r.status}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-[var(--color-surface-alt)] flex items-center justify-center text-[10px] font-bold">
                                                {r.owner?.full_name[0] ?? <User size={12} />}
                                            </div>
                                            <span className="text-xs">{r.owner?.full_name ?? 'Unassigned'}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <span className="bg-[var(--color-bg)] px-2 py-0.5 rounded-lg text-xs font-mono font-bold dash-text-tertiary border dash-border">
                                            {r.links_count ?? 0}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-right text-xs dash-text-tertiary">
                                        {new Date(r.updated_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <ChevronRight size={16} className="dash-text-tertiary inline" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="dash-card border dash-border rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
                        <h2 className="text-lg font-bold dash-text flex items-center gap-2">
                            <Plus size={20} style={{ color: 'var(--color-accent)' }} />
                            Document New Risk
                        </h2>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold dash-text-tertiary uppercase mb-1.5">Risk Title *</label>
                                <input
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                    placeholder="e.g. Credential stuffing on login endpoint"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2 text-sm focus:outline-none ring-offset-0 focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold dash-text-tertiary uppercase mb-1.5">Category</label>
                                    <select
                                        value={form.risk_category}
                                        onChange={e => setForm({ ...form, risk_category: e.target.value as any })}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2 text-sm focus:outline-none"
                                    >
                                        {RISK_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold dash-text-tertiary uppercase mb-1.5">Severity</label>
                                    <select
                                        value={form.risk_level}
                                        onChange={e => setForm({ ...form, risk_level: e.target.value as any })}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2 text-sm focus:outline-none"
                                    >
                                        {RISK_LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold dash-text-tertiary uppercase mb-1.5">Description</label>
                                <textarea
                                    value={form.description || ''}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2 text-sm focus:outline-none h-20 resize-none"
                                    placeholder="Inherent impact and vulnerability details..."
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium dash-text-secondary">Cancel</button>
                            <button
                                onClick={handleCreate}
                                disabled={!form.title || creating}
                                className="px-6 py-2 rounded-xl text-sm font-bold text-white shadow-lg shadow-blue-500/20 disabled:opacity-50"
                                style={{ background: 'var(--color-accent)' }}
                            >
                                {creating ? 'Saving...' : 'Create Risk'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function MetricRow({ label, value, weight }: { label: string; value: number; weight: number }) {
    const isHigh = value > 60;
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
                <span className="text-[10px] dash-text-secondary font-medium w-14">{label}</span>
                <div className="h-1 w-12 bg-black/5 rounded-full overflow-hidden">
                    <div className={`h-full ${isHigh ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${value}%` }} />
                </div>
            </div>
            <div className="flex items-center gap-1">
                {isHigh ? <TrendingUp size={10} className="text-red-500" /> : <TrendingDown size={10} className="text-emerald-500" />}
                <span className={`text-[10px] font-bold ${isHigh ? 'text-red-500' : 'text-emerald-500'}`}>{Math.round(value)}%</span>
            </div>
        </div>
    );
}
