import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
    getAsset,
    type AIAsset,
    type AIAssetControl,
    listAssetControls,
} from '../../../lib/aiGovernance/aiAssetService';
import {
    BrainCircuit,
    ArrowLeft,
    Building2,
    Shield,
    Activity,
    Loader2,
    Trash2,
    Plus,
    ExternalLink,
    Clock,
    CheckCircle2,
    AlertCircle,
    Info,
    Calendar,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { logger } from '../../../lib/logger';

interface AIAssetDetailPageProps {
    assetId: string | null;
    onBack: () => void;
}

export default function AIAssetDetailPage({ assetId, onBack }: AIAssetDetailPageProps) {
    const { profile } = useAuth();

    const [loading, setLoading] = useState(true);
    const [asset, setAsset] = useState<AIAsset | null>(null);
    const [controls, setControls] = useState<AIAssetControl[]>([]);
    const [activeTab, setActiveTab] = useState<'overview' | 'controls' | 'history'>('overview');

    const loadData = useCallback(async () => {
        if (!assetId) return;
        setLoading(true);
        try {
            const [assetData, controlData] = await Promise.all([
                getAsset(assetId),
                listAssetControls(assetId)
            ]);
            setAsset(assetData);
            setControls(controlData);
        } catch (err) {
            logger.error('Failed to load asset details:', err);
        } finally {
            setLoading(false);
        }
    }, [assetId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (!assetId || (!loading && !asset)) {
        return (
            <div className="py-24 flex flex-col items-center justify-center gap-4">
                <AlertCircle className="w-12 h-12 text-[var(--color-danger)]" />
                <div className="text-center">
                    <h3 className="font-bold dash-text">Asset not found</h3>
                    <button onClick={onBack} className="mt-4 text-[var(--color-accent)] font-bold text-sm">Back to Inventory</button>
                </div>
            </div>
        );
    }

    const statusBadge = (status: string) => {
        const configs: any = {
            active: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle2 },
            in_review: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: Activity },
            deprecated: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: AlertCircle },
            retired: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: Clock },
        };
        const config = configs[status] || configs.active;
        const Icon = config.icon;
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: config.bg, color: config.color }}>
                <Icon size={12} />
                {status.replace('_', ' ')}
            </span>
        );
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            {/* Header */}
            <div>
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-sm dash-text-tertiary hover:dash-text mb-6 transition-colors group"
                >
                    <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    Back to Asset Inventory
                </button>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex items-start gap-6">
                        <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent)]/10 flex items-center justify-center text-[var(--color-accent)] shadow-inner">
                            <BrainCircuit size={32} />
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-3xl font-bold dash-text">{asset?.name}</h1>
                                {asset && statusBadge(asset.status)}
                            </div>
                            <div className="flex items-center gap-4 text-sm dash-text-tertiary">
                                <span className="px-2 py-0.5 rounded bg-[var(--color-surface-alt)] font-bold text-[10px] uppercase tracking-widest">{asset?.asset_type}</span>
                                <span className="flex items-center gap-1.5">
                                    <Clock size={14} />
                                    Updated {asset && new Date(asset.updated_at).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="px-4 py-2 rounded-xl border dash-border text-sm font-bold dash-text hover:dash-surface-alt transition-all">
                            Edit Metadata
                        </button>
                        <button className="px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all">
                            Run Assessment
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Tabs */}
            <div className="flex items-center gap-8 border-b dash-border overflow-x-auto scrollbar-hide">
                {[
                    { id: 'overview', label: 'Overview', icon: Info },
                    { id: 'controls', label: 'Control Mapping', icon: Shield },
                    { id: 'history', label: 'Audit History', icon: Activity },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 py-4 px-1 border-b-2 transition-all text-sm font-bold whitespace-nowrap ${activeTab === tab.id
                            ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                            : 'border-transparent dash-text-tertiary hover:dash-text'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                        {tab.id === 'controls' && controls.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[10px]">
                                {controls.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Views */}
            <div className="min-h-[400px]">
                {loading ? (
                    <div className="py-24 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
                        <p className="dash-text-tertiary text-sm">Loading details...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Main Info Column */}
                        <div className="lg:col-span-2 space-y-8">
                            {activeTab === 'overview' && (
                                <>
                                    <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                                        <h3 className="text-sm font-bold dash-text mb-4 uppercase tracking-widest text-left">Description</h3>
                                        <p className="dash-text leading-relaxed">
                                            {asset?.description || "No description provided for this asset."}
                                        </p>
                                    </div>

                                    <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                                        <h3 className="text-sm font-bold dash-text mb-4 uppercase tracking-widest text-left">Technical Metadata</h3>
                                        <div className="bg-[var(--color-surface-alt)] rounded-xl p-4 font-mono text-xs overflow-x-auto border dash-border">
                                            <pre className="dash-text">
                                                {JSON.stringify(asset?.metadata, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeTab === 'controls' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold dash-text uppercase tracking-widest">Linked GRC Controls</h3>
                                        <button className="flex items-center gap-2 text-xs font-bold text-[var(--color-accent)] hover:underline">
                                            <Plus size={14} />
                                            Map New Control
                                        </button>
                                    </div>

                                    {controls.length === 0 ? (
                                        <div className="dash-card border dash-border border-dashed rounded-2xl py-16 flex flex-col items-center justify-center gap-4 group hover:bg-[var(--color-surface-alt)] hover:border-[var(--color-accent)]/50 transition-all cursor-pointer">
                                            <div className="w-12 h-12 rounded-full bg-[var(--color-surface-alt)] flex items-center justify-center dash-text-tertiary group-hover:bg-[var(--color-accent)] group-hover:text-white transition-all">
                                                <Shield size={24} />
                                            </div>
                                            <div className="text-center">
                                                <p className="font-bold dash-text">No controls mapped</p>
                                                <p className="text-xs dash-text-tertiary mt-1">Map GRC controls to ensure AI compliance.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-4">
                                            {controls.map(link => (
                                                <div key={link.id} className="dash-card border dash-border rounded-2xl p-5 shadow-sm hover:dash-surface-alt transition-all group flex items-start justify-between">
                                                    <div className="flex items-start gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)]/5 flex items-center justify-center text-[var(--color-accent)] border dash-border">
                                                            <Shield size={20} />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20">
                                                                    {link.control?.reference_code}
                                                                </span>
                                                                <p className="font-bold dash-text text-sm">{link.control?.title}</p>
                                                            </div>
                                                            <div className="flex items-center gap-3 text-xs dash-text-tertiary">
                                                                <span className="flex items-center gap-1">
                                                                    <CheckCircle2 size={12} className="text-[#22c55e]" />
                                                                    Status: {link.status}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <Calendar size={12} />
                                                                    Linked {new Date(link.created_at).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button className="p-2 rounded-lg text-[var(--color-danger)] opacity-0 group-hover:opacity-100 hover:bg-[var(--color-danger-soft)] transition-all">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'history' && (
                                <div className="dash-card border dash-border rounded-2xl p-12 flex flex-col items-center justify-center gap-4 text-center grayscale opacity-50">
                                    <Clock size={32} className="dash-text-tertiary" />
                                    <div>
                                        <p className="font-bold dash-text">Audit logs coming soon</p>
                                        <p className="text-xs dash-text-tertiary mt-1">Lifecycle event tracking is being deployed.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sidebar Column */}
                        <div className="space-y-6">
                            {/* Ownership & Vendor */}
                            <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm space-y-6">
                                <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-3 text-left">Asset Owner</h4>
                                    {asset?.owner ? (
                                        <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-alt)] border dash-border">
                                            <div className="w-10 h-10 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white font-bold shadow-md">
                                                {asset.owner.full_name[0]}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold dash-text text-sm truncate">{asset.owner.full_name}</p>
                                                <p className="text-[10px] dash-text-tertiary uppercase tracking-widest font-bold font-sans">Compliance Lead</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <button className="w-full py-3 px-4 rounded-xl border dash-border border-dashed text-xs dash-text-tertiary hover:dash-surface-alt transition-all">
                                            + Assign Owner
                                        </button>
                                    )}
                                </div>

                                <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-3 text-left">Provider Link</h4>
                                    {asset?.provider ? (
                                        <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-surface-alt)] border dash-border group cursor-pointer hover:border-[var(--color-accent)]/50 transition-all">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-[var(--color-surface)] flex items-center justify-center text-dash-tertiary border dash-border shadow-sm">
                                                    <Building2 size={20} />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold dash-text text-sm truncate">{asset.provider.name}</p>
                                                    <p className="text-[10px] dash-text-tertiary flex items-center gap-1 font-bold font-sans uppercase">Verified Vendor</p>
                                                </div>
                                            </div>
                                            <ExternalLink size={14} className="dash-text-tertiary opacity-0 group-hover:opacity-100 transition-all" />
                                        </div>
                                    ) : (
                                        <button className="w-full py-3 px-4 rounded-xl border dash-border border-dashed text-xs dash-text-tertiary hover:dash-surface-alt transition-all">
                                            + Link Vendor
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Stats/Quick Info */}
                            <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm space-y-4 bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-alt)]">
                                <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary text-left">Internal Context</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-xs dash-text-tertiary">ID Reference</p>
                                        <p className="text-xs font-mono dash-text truncate" title={asset?.id}>{asset?.id.slice(0, 8)}</p>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <p className="text-xs dash-text-tertiary">Retention</p>
                                        <p className="text-xs font-bold dash-text">7 Years</p>
                                    </div>
                                </div>
                                <div className="pt-4 border-t dash-border">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="dash-text-tertiary">Compliance Confidence</span>
                                        <span className="font-bold text-[#22c55e]">94%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-[var(--color-surface-alt)] rounded-full mt-2 overflow-hidden border dash-border shadow-inner">
                                        <div className="h-full bg-[#22c55e] rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]" style={{ width: '94%' }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
