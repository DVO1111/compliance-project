import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getVendors,
    addVendor,
    type Vendor,
    type VendorCategory,
    type VendorRiskLevel,
    VENDOR_CATEGORIES,
    LOGISTICS_VENDOR_CATEGORIES,
    RISK_LEVELS,
} from '../../lib/vendorService';
import {
    Building2,
    Plus,
    X,
    Search,
    ExternalLink,
    Shield,
    Calendar,
    ChevronRight,
    AlertTriangle,
    RefreshCw,
} from 'lucide-react';
import { SkeletonLine } from '../Dashboard/ui/Skeleton';

export default function VendorsPage() {
    const { profile, user } = useAuth();
    const companyId = (profile as any)?.company_id;
    const industryType = (profile as any)?.industry_type as string | undefined;
    const isLogisticsProfile = industryType?.trim().toLowerCase() === 'logistics & courier';
    const categories = isLogisticsProfile ? LOGISTICS_VENDOR_CATEGORIES : VENDOR_CATEGORIES;

    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState<VendorCategory | ''>('');
    const [filterRisk, setFilterRisk] = useState<VendorRiskLevel | ''>('');
    const [showAdd, setShowAdd] = useState(false);

    // Add form
    const [formName, setFormName] = useState('');
    const [formCategory, setFormCategory] = useState<VendorCategory>('cloud');
    const [formRisk, setFormRisk] = useState<VendorRiskLevel>('medium');
    const [formWebsite, setFormWebsite] = useState('');
    const [formContact, setFormContact] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const data = await getVendors(companyId);
            setVendors(data);
        } catch (err: any) {
            setLoadError(err?.message || 'Failed to load vendors');
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const handleAdd = async () => {
        if (!companyId || !formName.trim()) return;
        setSaving(true);
        const v = await addVendor(companyId, user?.id || '', {
            name: formName.trim(),
            category: formCategory,
            risk_level: formRisk,
            website: formWebsite.trim() || undefined,
            primary_contact: formContact.trim() || undefined,
        });
        if (v) {
            setShowAdd(false);
            setFormName(''); setFormWebsite(''); setFormContact('');
            await load();
        }
        setSaving(false);
    };

    const openDetail = (vendor: Vendor) => {
        window.dispatchEvent(new CustomEvent('navigate-to', {
            detail: { page: 'vendor-detail', vendorId: vendor.id },
        }));
    };

    const riskColor = (level: VendorRiskLevel) =>
        RISK_LEVELS.find(r => r.id === level)?.color ?? '#888';

    const reviewStatus = (v: Vendor) =>
        v.risk_profile?.security_review_status ?? 'pending';

    const lastReview = (v: Vendor) =>
        v.risk_profile?.last_review_date
            ? new Date(v.risk_profile.last_review_date).toLocaleDateString()
            : '—';

    const filtered = vendors.filter(v => {
        if (search && !v.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterCategory && v.category !== filterCategory) return false;
        if (filterRisk && v.risk_level !== filterRisk) return false;
        return true;
    });

    const reviewBadge = (status: string) => {
        const colors: Record<string, string> = {
            pending: 'rgba(245,158,11,0.15)',
            in_progress: 'rgba(59,130,246,0.15)',
            completed: 'rgba(34,197,94,0.15)',
            overdue: 'rgba(239,68,68,0.15)',
        };
        const textColors: Record<string, string> = {
            pending: '#f59e0b', in_progress: '#3b82f6', completed: '#22c55e', overdue: '#ef4444',
        };
        return (
            <span
                className="px-2.5 py-1 rounded-full text-xs font-semibold capitalize"
                style={{ background: colors[status] || colors.pending, color: textColors[status] || textColors.pending }}
            >
                {status.replace('_', ' ')}
            </span>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold dash-text flex items-center gap-3">
                        <div className="p-2 rounded-xl shadow-md" style={{ background: 'var(--color-accent)' }}>
                            <Building2 size={22} className="text-white" />
                        </div>
                        Vendor Management
                    </h1>
                    <p className="text-sm dash-text-tertiary mt-1">Manage third-party vendors and assess risk</p>
                </div>
                <button
                    onClick={() => setShowAdd(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                    style={{ background: 'var(--color-accent)' }}
                >
                    <Plus size={16} />
                    Add Vendor
                </button>
            </div>

            {/* Filters */}
            <div className="dash-card border dash-border rounded-2xl p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                        <input
                            type="text"
                            placeholder="Search vendors..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2 text-sm dash-text placeholder:dash-text-tertiary focus:outline-none focus:ring-1"
                            style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                        />
                    </div>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value as VendorCategory | '')}
                        className="bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none"
                    >
                        <option value="">All Categories</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <select
                        value={filterRisk}
                        onChange={(e) => setFilterRisk(e.target.value as VendorRiskLevel | '')}
                        className="bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2 text-sm dash-text focus:outline-none"
                    >
                        <option value="">All Risk Levels</option>
                        {RISK_LEVELS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="dash-card border dash-border rounded-2xl shadow-sm overflow-x-auto">
                {loading ? (
                    <div className="p-4 space-y-2 min-w-[600px]">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4 px-1 py-2">
                                <div className="flex items-center gap-3 flex-[2]">
                                    <SkeletonLine className="w-9 h-9 rounded-lg shrink-0" />
                                    <SkeletonLine className="h-4 flex-1" />
                                </div>
                                <SkeletonLine className="h-5 w-20 rounded-full flex-1" />
                                <SkeletonLine className="h-5 w-16 rounded-full flex-1" />
                                <SkeletonLine className="h-5 w-20 rounded-full flex-1" />
                                <SkeletonLine className="h-4 w-20 flex-1" />
                            </div>
                        ))}
                    </div>
                ) : loadError ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
                        <div className="w-10 h-10 rounded-full bg-[var(--color-danger-soft)] flex items-center justify-center">
                            <AlertTriangle size={20} className="text-[var(--color-danger)]" />
                        </div>
                        <p className="font-semibold dash-text">Failed to load vendors</p>
                        <p className="text-sm dash-text-tertiary">{loadError}</p>
                        <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border dash-border hover:bg-[var(--color-surface-alt)] transition-colors">
                            <RefreshCw size={14} /> Retry
                        </button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 px-4 text-center">
                        <div className="w-12 h-12 rounded-full bg-[var(--color-surface-alt)] flex items-center justify-center">
                            <Building2 size={24} className="dash-text-tertiary" />
                        </div>
                        <p className="font-semibold dash-text">{search || filterCategory || filterRisk ? 'No vendors match your filters' : 'No vendors added yet'}</p>
                        <p className="text-sm dash-text-tertiary">{search || filterCategory || filterRisk ? 'Try adjusting your search or filters.' : 'Add your first third-party vendor to start tracking risk.'}</p>
                        {!search && !filterCategory && !filterRisk && (
                            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md" style={{ background: 'var(--color-accent)' }}>
                                <Plus size={16} /> Add Vendor
                            </button>
                        )}
                    </div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b dash-border">
                                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider dash-text-tertiary">Vendor Name</th>
                                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider dash-text-tertiary">Category</th>
                                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider dash-text-tertiary">Risk Level</th>
                                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider dash-text-tertiary">Security Review</th>
                                <th className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider dash-text-tertiary">Last Review</th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(v => (
                                <tr
                                    key={v.id}
                                    onClick={() => openDetail(v)}
                                    className="border-b dash-border hover:bg-[var(--color-surface-alt)] transition-colors cursor-pointer group"
                                >
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-sm" style={{ background: riskColor(v.risk_level) }}>
                                                {v.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold dash-text">{v.name}</p>
                                                {v.website && (
                                                    <p className="text-xs dash-text-tertiary flex items-center gap-1 mt-0.5">
                                                        <ExternalLink size={10} /> {v.website}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold capitalize bg-[var(--color-surface-alt)] dash-text">
                                            {v.category}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span
                                            className="px-2.5 py-1 rounded-full text-xs font-bold capitalize"
                                            style={{ background: `${riskColor(v.risk_level)}20`, color: riskColor(v.risk_level) }}
                                        >
                                            <Shield size={10} className="inline mr-1" style={{ verticalAlign: '-1px' }} />
                                            {v.risk_level}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">{reviewBadge(reviewStatus(v))}</td>
                                    <td className="px-5 py-4">
                                        <span className="text-xs dash-text-secondary flex items-center gap-1">
                                            <Calendar size={12} className="dash-text-tertiary" />
                                            {lastReview(v)}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <ChevronRight size={16} className="dash-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ─── Add Vendor Modal ───────────────────────────────────────────── */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-[var(--color-surface)] border dash-border rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 animate-in zoom-in-95">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold dash-text">Add Vendor</h2>
                            <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors">
                                <X size={18} className="dash-text-tertiary" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Vendor Name *</label>
                                <input
                                    value={formName} onChange={e => setFormName(e.target.value)}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                                    placeholder="e.g. AWS, Stripe, HubSpot"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Category</label>
                                    <select
                                        value={formCategory} onChange={e => setFormCategory(e.target.value as VendorCategory)}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none"
                                    >
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Risk Level</label>
                                    <select
                                        value={formRisk} onChange={e => setFormRisk(e.target.value as VendorRiskLevel)}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none"
                                    >
                                        {RISK_LEVELS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Website</label>
                                <input
                                    value={formWebsite} onChange={e => setFormWebsite(e.target.value)}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                                    placeholder="https://example.com"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Primary Contact</label>
                                <input
                                    value={formContact} onChange={e => setFormContact(e.target.value)}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                                    placeholder="contact@example.com"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:bg-[var(--color-surface-alt)] transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleAdd}
                                disabled={saving || !formName.trim()}
                                className="px-5 py-2 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50 transition-all"
                                style={{ background: 'var(--color-accent)' }}
                            >
                                {saving ? 'Adding…' : 'Add Vendor'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
