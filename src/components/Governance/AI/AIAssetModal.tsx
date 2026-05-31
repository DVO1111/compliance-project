import { useState, useEffect } from 'react';
import {
    createAsset,
    updateAsset,
    getAsset,
    type AIAsset,
    type AIAssetType,
    type AIAssetStatus
} from '../../../lib/aiGovernance/aiAssetService';
import { type Vendor } from '../../../lib/vendorService';
import {
    X,
    BrainCircuit,
    Loader2,
    Save,
    Info,
    Building2,
    User,
    Tag,
    Database,
    CheckCircle2,
    Activity,
    AlertCircle,
    Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '../../../lib/logger';

interface AIAssetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    assetId: string | null;
    vendors: Vendor[];
    owners: { id: string; full_name: string }[];
}

export default function AIAssetModal({ isOpen, onClose, onSuccess, assetId, vendors, owners }: AIAssetModalProps) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<Partial<AIAsset>>({
        name: '',
        asset_type: 'model',
        description: '',
        status: 'active',
        provider_vendor_id: null,
        owner_id: null,
        metadata: {}
    });

    const [metadataStr, setMetadataStr] = useState('{}');

    useEffect(() => {
        if (isOpen && assetId) {
            loadAsset(assetId);
        } else if (isOpen) {
            setFormData({
                name: '',
                asset_type: 'model',
                description: '',
                status: 'active',
                provider_vendor_id: null,
                owner_id: null,
                metadata: {}
            });
            setMetadataStr('{}');
        }
    }, [isOpen, assetId]);

    async function loadAsset(id: string) {
        setLoading(true);
        const asset = await getAsset(id);
        if (asset) {
            setFormData(asset);
            setMetadataStr(JSON.stringify(asset.metadata, null, 2));
        }
        setLoading(false);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        try {
            let parsedMetadata = {};
            try {
                parsedMetadata = JSON.parse(metadataStr);
            } catch (err) {
                alert('Invalid JSON in metadata field');
                setSaving(false);
                return;
            }

            const payload = {
                ...formData,
                metadata: parsedMetadata
            } as any;

            if (assetId) {
                await updateAsset(formData.company_id!, 'current-user-id', assetId, payload);
            } else {
                const { user } = await import('../../../lib/supabase').then(m => m.supabase.auth.getUser().then(res => res.data));
                if (user && formData.company_id) {
                    await createAsset(formData.company_id, user.id, payload);
                }
            }
            onSuccess();
        } catch (err) {
            logger.error('Save failed:', err);
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-[var(--color-bg)] w-full max-w-2xl rounded-2xl shadow-2xl border dash-border overflow-hidden"
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b dash-border flex items-center justify-between bg-[var(--color-surface)]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)]/10 flex items-center justify-center text-[var(--color-accent)] font-bold">
                                <BrainCircuit size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold dash-text">{assetId ? 'Edit AI Asset' : 'New AI Asset'}</h2>
                                <p className="text-xs dash-text-tertiary">Inventory and Governance Metadata</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--color-surface-alt)] dash-text-tertiary transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {loading ? (
                        <div className="p-24 flex flex-col items-center justify-center gap-4">
                            <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent)]" />
                            <p className="dash-text-tertiary text-sm">Fetching asset details...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hide">
                            {/* Basic Info */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary ml-1">Asset Name</label>
                                    <div className="relative">
                                        <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                                        <input
                                            required
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                                            placeholder="e.g. GPT-4o Production"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary ml-1">Asset Type</label>
                                    <div className="relative">
                                        <BrainCircuit className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                                        <select
                                            value={formData.asset_type}
                                            onChange={e => setFormData({ ...formData, asset_type: e.target.value as AIAssetType })}
                                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] appearance-none transition-all"
                                        >
                                            <option value="model">Model</option>
                                            <option value="prompt_template">Prompt Template</option>
                                            <option value="workflow">Workflow</option>
                                            <option value="provider">Provider</option>
                                            <option value="agent">Agent</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Links */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary ml-1">Provider (Vendor)</label>
                                    <div className="relative">
                                        <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                                        <select
                                            value={formData.provider_vendor_id || ''}
                                            onChange={e => setFormData({ ...formData, provider_vendor_id: e.target.value || null })}
                                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text focus:outline-none appearance-none transition-all"
                                        >
                                            <option value="">No Provider Linked</option>
                                            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary ml-1">Asset Owner</label>
                                    <div className="relative">
                                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                                        <select
                                            value={formData.owner_id || ''}
                                            onChange={e => setFormData({ ...formData, owner_id: e.target.value || null })}
                                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text focus:outline-none appearance-none transition-all"
                                        >
                                            <option value="">No Owner Assigned</option>
                                            {owners.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary ml-1">Status</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {[
                                        { id: 'active', icon: CheckCircle2, color: '#22c55e' },
                                        { id: 'in_review', icon: Activity, color: '#3b82f6' },
                                        { id: 'deprecated', icon: AlertCircle, color: '#f59e0b' },
                                        { id: 'retired', icon: Clock, color: '#ef4444' }
                                    ].map(s => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, status: s.id as AIAssetStatus })}
                                            className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all ${formData.status === s.id
                                                ? 'bg-[var(--color-surface)] border-[var(--color-accent)] text-[var(--color-accent)] shadow-sm'
                                                : 'bg-[var(--color-surface-alt)] border-transparent dash-text-tertiary hover:dash-border'
                                                }`}
                                        >
                                            <s.icon size={12} style={formData.status === s.id ? { color: s.color } : {}} />
                                            {s.id.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary ml-1">Description</label>
                                <textarea
                                    value={formData.description || ''}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-3 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all resize-none"
                                    placeholder="Describe the purpose, usage, and any governance requirements for this AI asset..."
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between ml-1">
                                    <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Metadata (JSON)</label>
                                    <div className="flex items-center gap-1 dash-text-tertiary text-[10px]">
                                        <Info size={10} />
                                        Advanced Configuration
                                    </div>
                                </div>
                                <div className="relative group">
                                    <Database className="absolute left-3.5 top-3.5 w-4 h-4 dash-text-tertiary" />
                                    <textarea
                                        value={metadataStr}
                                        onChange={e => setMetadataStr(e.target.value)}
                                        rows={4}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-3 text-xs font-mono dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                                        placeholder={`{ "version": "1.0", "engine": "gpt-4" }`}
                                    />
                                </div>
                            </div>
                        </form>
                    )}

                    {/* Footer */}
                    <div className="p-6 bg-[var(--color-surface)] border-t dash-border flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold dash-text-tertiary hover:dash-surface-alt hover:dash-text transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={saving || loading}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:grayscale"
                            style={{ background: 'var(--color-accent)' }}
                        >
                            {saving ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save size={18} />
                                    {assetId ? 'Update Asset' : 'Catalog Asset'}
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
