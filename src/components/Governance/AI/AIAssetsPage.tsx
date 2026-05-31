import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
    listAssets,
    type AIAsset,
    type AIAssetType,
    type AIAssetStatus,
} from '../../../lib/aiGovernance/aiAssetService';
import { getVendors, type Vendor } from '../../../lib/vendorService';
import { supabase } from '../../../lib/supabase';
import {
    BrainCircuit,
    Plus,
    Search,
    Filter,
    MoreVertical,
    Building2,
    User,
    Calendar,
    Shield,
    Activity,
    ExternalLink,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Clock,
    X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AIAssetModal from './AIAssetModal';
import { logger } from '../../../lib/logger';

export default function AIAssetsPage() {
    const { profile } = useAuth();
    const companyId = profile?.company_id;

    const [loading, setLoading] = useState(true);
    const [assets, setAssets] = useState<AIAsset[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [owners, setOwners] = useState<{ id: string; full_name: string }[]>([]);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<AIAssetType | ''>('');
    const [statusFilter, setStatusFilter] = useState<AIAssetStatus | ''>('');
    const [vendorFilter, setVendorFilter] = useState('');

    // Modals
    const [showModal, setShowModal] = useState(false);
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [assetData, vendorData] = await Promise.all([
                listAssets(companyId),
                getVendors(companyId)
            ]);
            setAssets(assetData);
            setVendors(vendorData);

            // Fetch members for owners list
            const { data: members } = await (supabase as any)
                .from('profiles')
                .select('id, full_name')
                .eq('company_id', companyId);
            setOwners(members ?? []);
        } catch (err) {
            logger.error('Failed to load AI assets:', err);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredAssets = assets.filter(a => {
        const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = !typeFilter || a.asset_type === typeFilter;
        const matchesStatus = !statusFilter || a.status === statusFilter;
        const matchesVendor = !vendorFilter || a.provider_vendor_id === vendorFilter;
        return matchesSearch && matchesType && matchesStatus && matchesVendor;
    });

    const statusBadge = (status: AIAssetStatus) => {
        const configs: Record<AIAssetStatus, { color: string; bg: string; icon: any }> = {
            active: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle2 },
            in_review: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: Activity },
            deprecated: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: AlertCircle },
            retired: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: Clock },
        };
        const config = configs[status] || configs.active;
        const Icon = config.icon;
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: config.bg, color: config.color }}>
                <Icon size={12} />
                {status.replace('_', ' ')}
            </span>
        );
    };

    const typeBadge = (type: AIAssetType) => (
        <span className="px-2 py-0.5 rounded-lg bg-[var(--color-surface-alt)] border dash-border text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">
            {type}
        </span>
    );

    const handleNavigate = (id: string) => {
        window.dispatchEvent(new CustomEvent('navigate-to', {
            detail: { page: 'ai-asset-detail', aiAssetId: id }
        }));
    };

    return (
        <div className="space-y-8 animate-in fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-xs font-bold mb-3">
                        <BrainCircuit size={14} />
                        AI Governance Layer
                    </div>
                    <h1 className="text-3xl font-bold dash-text">AI Asset Inventory</h1>
                    <p className="dash-text-tertiary mt-2">Manage and govern your organization&apos;s AI models, prompts, and agents.</p>
                </div>

                <button
                    onClick={() => { setSelectedAssetId(null); setShowModal(true); }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ background: 'var(--color-accent)' }}
                >
                    <Plus size={18} />
                    Add AI Asset
                </button>
            </div>

            {/* Filters */}
            <div className="dash-card border dash-border rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-4">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                    <input
                        type="text"
                        placeholder="Search assets..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2 text-sm dash-text focus:outline-none"
                    />
                </div>

                <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value as any)}
                    className="bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2 text-sm dash-text focus:outline-none"
                >
                    <option value="">All Types</option>
                    <option value="model">Model</option>
                    <option value="prompt_template">Prompt Template</option>
                    <option value="workflow">Workflow</option>
                    <option value="provider">Provider</option>
                    <option value="agent">Agent</option>
                </select>

                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as any)}
                    className="bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2 text-sm dash-text focus:outline-none"
                >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="in_review">In Review</option>
                    <option value="deprecated">Deprecated</option>
                    <option value="retired">Retired</option>
                </select>

                <select
                    value={vendorFilter}
                    onChange={e => setVendorFilter(e.target.value)}
                    className="bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2 text-sm dash-text focus:outline-none max-w-[160px]"
                >
                    <option value="">All Vendors</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
            </div>

            {/* Table */}
            <div className="dash-card border dash-border rounded-2xl shadow-sm overflow-hidden">
                {loading ? (
                    <div className="py-24 flex flex-col items-center justify-center gap-4 grayscale opacity-50">
                        <Loader2 className="w-10 h-10 animate-spin text-[var(--color-accent)]" />
                        <p className="text-sm dash-text-tertiary">Loading assets...</p>
                    </div>
                ) : filteredAssets.length === 0 ? (
                    <div className="py-32 flex flex-col items-center justify-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface-alt)] flex items-center justify-center dash-text-tertiary">
                            <BrainCircuit size={32} />
                        </div>
                        <div className="text-center">
                            <h3 className="font-bold dash-text">No assets found</h3>
                            <p className="text-sm dash-text-tertiary mt-1">
                                {searchTerm || typeFilter || statusFilter || vendorFilter
                                    ? "Try adjusting your filters."
                                    : "Start by cataloging your first AI model or tool."}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-[var(--color-surface-alt)] border-b dash-border">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Asset Name</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Type</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Status</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Vendor</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Owner</th>
                                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Last Updated</th>
                                    <th className="w-10 px-6 py-4"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y dash-border">
                                {filteredAssets.map(asset => (
                                    <tr
                                        key={asset.id}
                                        onClick={() => handleNavigate(asset.id)}
                                        className="group hover:bg-[var(--color-surface-alt)] transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)]/5 flex items-center justify-center text-[var(--color-accent)] group-hover:bg-[var(--color-accent)] group-hover:text-white transition-all">
                                                    <BrainCircuit size={20} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold dash-text truncate">{asset.name}</p>
                                                    <p className="text-xs dash-text-tertiary truncate">{asset.description || "No description"}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">{typeBadge(asset.asset_type)}</td>
                                        <td className="px-6 py-5">{statusBadge(asset.status)}</td>
                                        <td className="px-6 py-5">
                                            {asset.provider ? (
                                                <div className="flex items-center gap-2 dash-text text-sm">
                                                    <Building2 size={14} className="dash-text-tertiary" />
                                                    {asset.provider.name}
                                                </div>
                                            ) : <span className="text-xs dash-text-tertiary">—</span>}
                                        </td>
                                        <td className="px-6 py-5">
                                            {asset.owner ? (
                                                <div className="flex items-center gap-2 dash-text text-sm">
                                                    <User size={14} className="dash-text-tertiary" />
                                                    {asset.owner.full_name}
                                                </div>
                                            ) : <span className="text-xs dash-text-tertiary">—</span>}
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2 dash-text-tertiary text-xs">
                                                <Calendar size={13} />
                                                {new Date(asset.updated_at).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedAssetId(asset.id);
                                                    setShowModal(true);
                                                }}
                                                className="p-2 rounded-lg hover:bg-[var(--color-surface)] dash-text-tertiary hover:dash-text transition-colors"
                                            >
                                                <MoreVertical size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <AIAssetModal
                isOpen={showModal}
                assetId={selectedAssetId}
                onClose={() => setShowModal(false)}
                onSuccess={() => { setShowModal(false); loadData(); }}
                vendors={vendors}
                owners={owners}
            />
        </div>
    );
}
