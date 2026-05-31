// src/components/Governance/AI/AIReviewsPage.tsx
// AI Output Review Dashboard — Phase 6 Sprint 4
// Centralized HITL queue for safety, quality, and policy checks.

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { aiReviewService, type AIOutputReview, type AIReviewStatus } from '../../../lib/aiGovernance/aiReviewService';
import {
    ShieldCheck,
    AlertTriangle,
    Clock,
    CheckCircle2,
    XCircle,
    Search,
    Loader2,
    ChevronRight,
    Zap,
    Scale,
    Activity,
    User
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '../../../lib/logger';

export default function AIReviewsPage() {
    const { profile } = useAuth();
    const companyId = profile?.company_id;

    const [loading, setLoading] = useState(true);
    const [reviews, setReviews] = useState<AIOutputReview[]>([]);
    const [statusFilter, setStatusFilter] = useState<AIReviewStatus | 'all'>('pending');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedReview, setSelectedReview] = useState<AIOutputReview | null>(null);
    const [decisionNotes, setDecisionNotes] = useState('');

    const loadData = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const data = await aiReviewService.listOutputReviews(companyId, {
                status: statusFilter === 'all' ? undefined : statusFilter as any
            });
            setReviews(data);
        } catch (err) {
            logger.error('Failed to load reviews:', err);
        } finally {
            setLoading(false);
        }
    }, [companyId, statusFilter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleDecision = async (status: AIReviewStatus) => {
        if (!companyId || !profile?.id || !selectedReview) return;
        try {
            await aiReviewService.resolveOutputReview(selectedReview.id, companyId, profile.id, {
                status,
                notes: decisionNotes
            });
            setDecisionNotes('');
            setSelectedReview(null);
            loadData();
        } catch (err) {
            logger.error('Decision failed:', err);
        }
    };

    const statusBadge = (status: string) => {
        const configs: any = {
            pending: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: Clock },
            approved: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle2 },
            rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: XCircle },
            escalated: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: AlertTriangle }
        };
        const config = configs[status] || configs.pending;
        const Icon = config.icon;
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: config.bg, color: config.color }}>
                <Icon size={12} />
                {status}
            </span>
        );
    };

    const typeBadge = (type: string) => {
        const configs: any = {
            hitl: { label: 'Human-in-the-Loop', icon: User },
            policy_check: { label: 'Policy Alignment', icon: Scale },
            quality_check: { label: 'Quality Insight', icon: ShieldCheck },
            safety_check: { label: 'Safety Guard', icon: Activity }
        };
        const config = configs[type] || { label: type, icon: Activity };
        const Icon = config.icon;
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--color-surface-alt)] border dash-border text-[9px] font-bold dash-text-tertiary uppercase">
                <Icon size={10} />
                {config.label}
            </span>
        );
    };

    const filteredReviews = reviews.filter(rev =>
        rev.usage_log?.model_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rev.decision_notes?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const metrics = {
        pending: reviews.filter(r => r.status === 'pending').length,
        approvedTotal: reviews.filter(r => r.status === 'approved').length,
        rejectedTotal: reviews.filter(r => r.status === 'rejected').length
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold dash-text">AI Output Reviews</h1>
                <p className="dash-text-tertiary mt-2">Enforce safety, quality, and policy alignment through Human-in-the-Loop governance.</p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Awaiting Action', value: metrics.pending, icon: Clock, color: 'var(--color-accent)' },
                    { label: 'Approved Total', value: metrics.approvedTotal, icon: CheckCircle2, color: '#22c55e' },
                    { label: 'Rejected Total', value: metrics.rejectedTotal, icon: XCircle, color: '#ef4444' },
                    { label: 'SLA Status', value: 'Healthy', icon: Zap, color: '#f59e0b' }
                ].map((stat, i) => (
                    <div key={i} className="dash-card border dash-border rounded-2xl p-5 flex items-center gap-4 shadow-sm">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg" style={{ backgroundColor: stat.color }}>
                            <stat.icon size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-widest font-bold dash-text-tertiary mb-1">{stat.label}</p>
                            <p className="text-xl font-bold dash-text">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center justify-between gap-4 py-6 border-y dash-border">
                <div className="flex items-center gap-4 flex-1 min-w-[300px]">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dash-tertiary" size={16} />
                        <input
                            type="text"
                            placeholder="Search by model or notes..."
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
                        <option value="all">All Items</option>
                        <option value="pending">Awaiting Review</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="escalated">Escalated</option>
                    </select>
                </div>
            </div>

            {/* Queue Table */}
            <div className="dash-card border dash-border rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-[var(--color-surface-alt)] border-b dash-border">
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Review Type</th>
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Source Activity</th>
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest dash-text_tertiary">Status</th>
                                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Created</th>
                                <th className="px-6 py-4 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dash-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-24 text-center">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--color-accent)] mb-4" />
                                        <p className="dash-text-tertiary font-medium">Scanning review queue...</p>
                                    </td>
                                </tr>
                            ) : filteredReviews.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-24 text-center">
                                        <ShieldCheck className="w-12 h-12 mx-auto text-dash-tertiary mb-4 opacity-20" />
                                        <p className="dash-text font-bold">Queue Clear</p>
                                        <p className="dash-text-tertiary text-sm mt-1">No AI activities currently require human review.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredReviews.map(rev => (
                                    <tr key={rev.id} className="hover:bg-[var(--color-surface-alt)]/50 transition-colors group cursor-pointer" onClick={() => setSelectedReview(rev)}>
                                        <td className="px-6 py-4">
                                            {typeBadge(rev.review_type)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold dash-text">{rev.usage_log?.model_name || 'Direct API Call'}</span>
                                                <span className="text-[10px] dash-text-tertiary uppercase font-mono">{rev.usage_log?.provider_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {statusBadge(rev.status)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-xs font-bold dash-text">{new Date(rev.created_at).toLocaleDateString()}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <ChevronRight size={18} className="text-dash-tertiary group-hover:text-[var(--color-accent)] transition-all" />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Decision Modal */}
            <AnimatePresence>
                {selectedReview && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedReview(null)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
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
                                        <h2 className="text-2xl font-bold dash-text">Review Content Decision</h2>
                                        {statusBadge(selectedReview.status)}
                                    </div>
                                    <p className="text-xs font-bold dash-text-tertiary uppercase tracking-widest flex items-center gap-2">
                                        <Activity size={12} /> Log ID: {selectedReview.usage_log_id}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedReview(null)} className="p-2 rounded-xl hover:bg-[var(--color-surface-alt)] transition-colors">
                                    <XCircle size={24} className="text-dash-tertiary" />
                                </button>
                            </div>

                            <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8 scrollbar-hide">
                                {/* Activity Summary */}
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Input Captured</h4>
                                        <div className="p-5 rounded-2xl bg-[var(--color-surface-alt)] border dash-border text-sm dash-text font-mono whitespace-pre-wrap">
                                            {selectedReview.usage_log?.input_summary || 'No input summary available.'}
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Output Captured</h4>
                                        <div className="p-5 rounded-2xl bg-[var(--color-surface-alt)] border dash-border text-sm dash-text font-mono whitespace-pre-wrap">
                                            {selectedReview.usage_log?.output_summary || 'No output summary available.'}
                                        </div>
                                    </div>
                                </div>

                                {/* Decision Section */}
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Governance Decision & Notes</h4>
                                    <textarea
                                        value={decisionNotes}
                                        onChange={e => setDecisionNotes(e.target.value)}
                                        placeholder="Enter the rationale for this decision and any required remediations..."
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-2xl p-4 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all min-h-[120px]"
                                    />
                                </div>

                                <div className="p-6 rounded-2xl bg-[#ffedd5] border border-[#fed7aa] flex items-start gap-4">
                                    <AlertTriangle className="text-[#f59e0b] mt-0.5" size={20} />
                                    <div>
                                        <p className="text-sm font-bold text-[#b45309]">Regulatory Note</p>
                                        <p className="text-xs text-[#d97706] mt-1 leading-relaxed">
                                            Decisions made here are recorded in the immutable audit trail and may affect AI Asset access permissions or trigger incidents.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 bg-[var(--color-surface-alt)] border-t dash-border flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => handleDecision('approved')}
                                        className="px-6 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold shadow-lg hover:scale-[1.05] transition-all flex items-center gap-2"
                                    >
                                        <CheckCircle2 size={16} /> Approve Output
                                    </button>
                                    <button
                                        onClick={() => handleDecision('rejected')}
                                        className="px-6 py-2.5 rounded-xl bg-[#ef4444] text-white text-sm font-bold shadow-lg hover:scale-[1.05] transition-all flex items-center gap-2"
                                    >
                                        <XCircle size={16} /> Reject Output
                                    </button>
                                </div>
                                <button
                                    onClick={() => handleDecision('escalated')}
                                    className="px-5 py-2.5 rounded-xl border dash-border bg-[var(--color-surface)] dash-text text-sm font-bold hover:bg-[var(--color-surface-alt)] transition-all flex items-center gap-2"
                                >
                                    <AlertTriangle size={16} className="text-[#f59e0b]" /> Escalate
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
