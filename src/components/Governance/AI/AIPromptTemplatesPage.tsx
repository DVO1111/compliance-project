// src/components/Governance/AI/AIPromptTemplatesPage.tsx
// AI Prompt Template Registry — Phase 6 Sprint 4
// Versioned prompts with lifecycle states (Draft -> In Review -> Approved).

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { aiReviewService, type AIPromptTemplate, type AIPromptStatus } from '../../../lib/aiGovernance/aiReviewService';
import { listAssets, type AIAsset } from '../../../lib/aiGovernance/aiAssetService';
import {
    Plus,
    FileText,
    Clock,
    CheckCircle2,
    XCircle,
    Search,
    Loader2,
    ChevronRight,
    Edit3,
    Trash2,
    Send,
    Terminal,
    History,
    Shield,
    DraftingCompass,
    User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '../../../lib/logger';

export default function AIPromptTemplatesPage() {
    const { profile } = useAuth();
    const companyId = profile?.company_id;

    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState<AIPromptTemplate[]>([]);
    const [assets, setAssets] = useState<AIAsset[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<AIPromptStatus | 'all'>('all');
    const [selectedTemplate, setSelectedTemplate] = useState<AIPromptTemplate | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        prompt_text: '',
        ai_asset_id: ''
    });

    const loadData = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [templatesData, assetsData] = await Promise.all([
                aiReviewService.listPromptTemplates(companyId, {
                    status: statusFilter === 'all' ? undefined : statusFilter as any
                }),
                listAssets(companyId)
            ]);
            setTemplates(templatesData);
            setAssets(assetsData);
        } catch (err) {
            logger.error('Failed to load templates:', err);
        } finally {
            setLoading(false);
        }
    }, [companyId, statusFilter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreate = async () => {
        if (!companyId || !profile?.id) return;
        try {
            await aiReviewService.createPromptTemplate({
                ...formData,
                company_id: companyId,
                created_by: profile.id,
                owner_id: profile.id,
                version: 1
            });
            setIsCreateModalOpen(false);
            setFormData({ name: '', description: '', prompt_text: '', ai_asset_id: '' });
            loadData();
        } catch (err) {
            logger.error('Creation failed:', err);
        }
    };

    const handleAction = async (id: string, action: 'submit' | 'approve' | 'reject') => {
        if (!companyId || !profile?.id) return;
        try {
            if (action === 'submit') await aiReviewService.submitForReview(id, companyId, profile.id);
            if (action === 'approve') await aiReviewService.approvePromptTemplate(id, companyId, profile.id);
            if (action === 'reject') await aiReviewService.rejectPromptTemplate(id, companyId, profile.id, 'Standard governance rejection.');
            loadData();
            setSelectedTemplate(null);
        } catch (err) {
            logger.error('Lifecycle action failed:', err);
        }
    };

    const statusBadge = (status: string) => {
        const configs: any = {
            draft: { color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: DraftingCompass },
            in_review: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: Clock },
            approved: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle2 },
            rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: XCircle },
            retired: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: History }
        };
        const config = configs[status] || configs.draft;
        const Icon = config.icon;
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: config.bg, color: config.color }}>
                <Icon size={12} />
                {status.replace('_', ' ')}
            </span>
        );
    };

    const filteredTemplates = templates.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold dash-text">AI Prompt Templates</h1>
                    <p className="dash-text-tertiary mt-2">Manage version-controlled, governed prompts across your AI ecosystem.</p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold shadow-lg hover:scale-[1.05] transition-all"
                >
                    <Plus size={18} /> New Template
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center justify-between gap-4 py-6 border-y dash-border">
                <div className="flex items-center gap-4 flex-1 min-w-[300px]">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dash-tertiary" size={16} />
                        <input
                            type="text"
                            placeholder="Filter by name or description..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as any)}
                        className="bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm font-bold dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
                    >
                        <option value="all">All Status</option>
                        <option value="draft">Drafts</option>
                        <option value="in_review">In Review</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>
            </div>

            {/* Template List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full py-24 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--color-accent)] mb-4" />
                        <p className="dash-text-tertiary font-medium">Indexing templates...</p>
                    </div>
                ) : filteredTemplates.length === 0 ? (
                    <div className="col-span-full py-24 text-center dash-card border dash-border rounded-3xl">
                        <FileText className="w-12 h-12 mx-auto text-dash-tertiary mb-4 opacity-20" />
                        <p className="dash-text font-bold">No templates found</p>
                        <p className="dash-text-tertiary text-sm mt-1">Start by creating a new version-controlled prompt.</p>
                    </div>
                ) : (
                    filteredTemplates.map(template => (
                        <motion.div
                            key={template.id}
                            layoutId={template.id}
                            onClick={() => setSelectedTemplate(template)}
                            className="dash-card border dash-border rounded-3xl p-6 hover:shadow-xl transition-all group cursor-pointer relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[var(--color-accent)]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)]/10 flex items-center justify-center text-[var(--color-accent)]">
                                        <Terminal size={20} />
                                    </div>
                                    {statusBadge(template.status)}
                                </div>

                                <div>
                                    <h3 className="text-lg font-bold dash-text group-hover:text-[var(--color-accent)] transition-colors line-clamp-1">{template.name}</h3>
                                    <p className="text-xs dash-text-tertiary mt-1 line-clamp-2">{template.description || 'No description provided.'}</p>
                                </div>

                                <div className="pt-4 border-t dash-border flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold dash-text-tertiary uppercase tracking-widest">Version</span>
                                        <span className="text-sm font-mono font-bold dash-text">v{template.version}.0</span>
                                    </div>
                                    <ChevronRight size={18} className="text-dash-tertiary group-hover:translate-x-1 transition-all" />
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Detail Modal */}
            <AnimatePresence>
                {selectedTemplate && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedTemplate(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-4xl bg-[var(--color-surface)] border dash-border rounded-3xl shadow-2xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-8 border-b dash-border flex items-start justify-between bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-alt)]">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-2xl font-bold dash-text">{selectedTemplate.name}</h2>
                                        {statusBadge(selectedTemplate.status)}
                                    </div>
                                    <p className="text-xs font-bold dash-text-tertiary uppercase tracking-widest flex items-center gap-2">
                                        <Terminal size={12} /> Version v{selectedTemplate.version}.0 — Created {new Date(selectedTemplate.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedTemplate(null)} className="p-2 rounded-xl hover:bg-[var(--color-surface-alt)] transition-colors">
                                    <XCircle size={24} className="text-dash-tertiary" />
                                </button>
                            </div>

                            <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8 scrollbar-hide">
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Prompt Text</h4>
                                    <div className="p-6 rounded-2xl bg-[var(--color-surface-alt)] border dash-border font-mono text-sm leading-relaxed dash-text whitespace-pre-wrap relative group">
                                        {selectedTemplate.prompt_text}
                                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Shield size={16} className="text-[var(--color-accent)]" />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Ownership</h4>
                                        <div className="flex items-center gap-3 p-4 rounded-xl border dash-border bg-[var(--color-surface-alt)]">
                                            <div className="w-8 h-8 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center text-[var(--color-accent)]">
                                                <User size={14} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold dash-text">Created By</span>
                                                <span className="text-[10px] dash-text-tertiary">Authorised User ID: {selectedTemplate.created_by?.slice(0, 8)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Asset Link</h4>
                                        <div className="flex items-center gap-3 p-4 rounded-xl border dash-border bg-[var(--color-surface-alt)]">
                                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                                                <Shield size={14} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold dash-text">Associated AI Asset</span>
                                                <span className="text-[10px] dash-text-tertiary">{selectedTemplate.ai_asset_id ? 'Linked to Production Asset' : 'Stand-alone Template'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 bg-[var(--color-surface-alt)] border-t dash-border flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {selectedTemplate.status === 'draft' && (
                                        <button
                                            onClick={() => handleAction(selectedTemplate.id, 'submit')}
                                            className="px-6 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold shadow-lg hover:scale-[1.05] transition-all flex items-center gap-2"
                                        >
                                            <Send size={16} /> Submit for Review
                                        </button>
                                    )}
                                    {selectedTemplate.status === 'in_review' && (
                                        <>
                                            <button
                                                onClick={() => handleAction(selectedTemplate.id, 'approve')}
                                                className="px-6 py-2.5 rounded-xl bg-[#22c55e] text-white text-sm font-bold shadow-lg hover:scale-[1.05] transition-all flex items-center gap-2"
                                            >
                                                <CheckCircle2 size={16} /> Approve Template
                                            </button>
                                            <button
                                                onClick={() => handleAction(selectedTemplate.id, 'reject')}
                                                className="px-6 py-2.5 rounded-xl bg-[#ef4444] text-white text-sm font-bold shadow-lg hover:scale-[1.05] transition-all flex items-center gap-2"
                                            >
                                                <XCircle size={16} /> Reject Template
                                            </button>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button className="p-2.5 rounded-xl border dash-border bg-[var(--color-surface)] dash-text hover:dash-surface transition-all">
                                        <Edit3 size={18} />
                                    </button>
                                    <button className="p-2.5 rounded-xl border dash-border bg-[var(--color-surface)] text-red-500 hover:bg-red-50 transition-all">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Create Modal */}
            <AnimatePresence>
                {isCreateModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCreateModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl bg-[var(--color-surface)] border dash-border rounded-3xl shadow-2xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-8 border-b dash-border flex items-center justify-between">
                                <h2 className="text-2xl font-bold dash-text text-gradient">Create Governed Template</h2>
                                <button onClick={() => setIsCreateModalOpen(false)} className="p-2 rounded-xl hover:bg-[var(--color-surface-alt)] transition-colors">
                                    <XCircle size={24} className="text-dash-tertiary" />
                                </button>
                            </div>

                            <div className="p-8 space-y-6">
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Template Name</label>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="e.g. Pharma Compliance Agent V1"
                                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Linked AI Asset</label>
                                            <select
                                                value={formData.ai_asset_id}
                                                onChange={e => setFormData({ ...formData, ai_asset_id: e.target.value })}
                                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
                                            >
                                                <option value="">No Active Asset Association</option>
                                                {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">System Prompt / Instructions</label>
                                        <textarea
                                            value={formData.prompt_text}
                                            onChange={e => setFormData({ ...formData, prompt_text: e.target.value })}
                                            placeholder="Enter the strictly governed prompt text here..."
                                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-2xl p-4 text-sm dash-text font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all min-h-[200px]"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 bg-[var(--color-surface-alt)] border-t dash-border flex justify-end gap-3">
                                <button
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="px-6 py-2.5 rounded-xl border dash-border bg-[var(--color-surface)] dash-text text-sm font-bold hover:bg-[var(--color-surface-alt)] transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={!formData.name || !formData.prompt_text}
                                    className="px-6 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold shadow-lg hover:scale-[1.05] transition-all disabled:opacity-50 disabled:hover:scale-100"
                                >
                                    Save as Draft
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
