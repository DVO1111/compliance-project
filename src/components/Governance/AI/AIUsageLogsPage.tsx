// src/components/Governance/AI/AIUsageLogsPage.tsx
// AI Usage Logs Hub — Phase 6 Sprint 2 & 3
// Provides oversight, review, and incident escalation capabilities for AI activity.

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { aiUsageLogService, type AIUsageLog, type UsageMetrics } from '../../../lib/aiGovernance/aiUsageLogService';
import { aiIncidentService } from '../../../lib/aiGovernance/aiIncidentService';
import { aiReviewService } from '../../../lib/aiGovernance/aiReviewService';
import {
    Activity,
    Search,
    Filter,
    Clock,
    Shield,
    AlertCircle,
    CheckCircle2,
    XCircle,
    ChevronRight,
    Loader2,
    ArrowUpRight,
    DollarSign,
    Zap,
    Cpu,
    Scale
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '../../../lib/logger';

export default function AIUsageLogsPage() {
    const { profile } = useAuth();
    const companyId = profile?.company_id;

    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<AIUsageLog[]>([]);
    const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [selectedLog, setSelectedLog] = useState<AIUsageLog | null>(null);

    // Incident Creation State
    const [showIncidentModal, setShowIncidentModal] = useState(false);
    const [submittingIncident, setSubmittingIncident] = useState(false);
    const [incidentData, setIncidentData] = useState({
        type: 'hallucination' as any,
        severity: 'medium' as any,
        description: ''
    });

    const loadData = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [logsData, metricsData] = await Promise.all([
                aiUsageLogService.listUsageLogs(companyId, {
                    reviewStatus: statusFilter === 'all' ? undefined : statusFilter,
                    limit: 100
                }),
                aiUsageLogService.getUsageMetrics(companyId)
            ]);
            setLogs(logsData || []);
            setMetrics(metricsData);
        } catch (err) {
            logger.error('Failed to load usage logs:', err);
        } finally {
            setLoading(false);
        }
    }, [companyId, statusFilter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleUpdateStatus = async (logId: string, status: 'approved' | 'rejected' | 'flagged') => {
        if (!companyId || !profile?.id) return;
        try {
            await aiUsageLogService.updateReviewStatus(companyId, profile.id, logId, status);
            loadData();
            if (selectedLog?.id === logId) {
                setSelectedLog(prev => prev ? { ...prev, review_status: status } : null);
            }
        } catch (err) {
            logger.error('Failed to update status:', err);
        }
    };

    const handleCreateIncident = async () => {
        if (!companyId || !profile?.id || !selectedLog) return;
        setSubmittingIncident(true);
        try {
            const incident = await aiIncidentService.createIncident(profile.id, companyId, {
                ai_asset_id: selectedLog.ai_asset_id,
                usage_log_id: selectedLog.id,
                incident_type: incidentData.type,
                severity: incidentData.severity,
                title: `Incident from Usage ${selectedLog.id.slice(0, 8)}`,
                description: incidentData.description || `Automated incident created from usage log ${selectedLog.id}. Sanitized summary: ${selectedLog.input_summary}`,
                source: 'usage_review',
                metadata: {
                    provider: selectedLog.provider_name,
                    model: selectedLog.model_name,
                    risk_flags: selectedLog.risk_flags
                }
            });

            if (incident) {
                await handleUpdateStatus(selectedLog.id, 'flagged');
                setShowIncidentModal(false);
                setIncidentData({ type: 'hallucination', severity: 'medium', description: '' });
                setSelectedLog(null);
            }
        } catch (err) {
            logger.error('Failed to create incident:', err);
        } finally {
            setSubmittingIncident(false);
        }
    };

    const handleRequestReview = async () => {
        if (!companyId || !profile?.id || !selectedLog) return;
        try {
            await aiReviewService.createOutputReview({
                company_id: companyId,
                usage_log_id: selectedLog.id,
                ai_asset_id: selectedLog.ai_asset_id,
                review_type: 'hitl',
                status: 'pending',
                created_by: profile.id,
                decision_notes: 'Manual review requested from usage log viewer.'
            });
            await handleUpdateStatus(selectedLog.id, 'flagged');
            setSelectedLog(null);
            loadData();
        } catch (err) {
            logger.error('Failed to request review:', err);
        }
    };

    const filteredLogs = logs.filter(log =>
        log.provider_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.model_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.input_summary?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const statusBadge = (status: string) => {
        const configs: any = {
            approved: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle2 },
            flagged: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: AlertCircle },
            rejected: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: XCircle },
            not_reviewed: { color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: Clock }
        };
        const config = configs[status] || configs.not_reviewed;
        const Icon = config.icon;
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: config.bg, color: config.color }}>
                <Icon size={12} />
                {status.replace('_', ' ')}
            </span>
        );
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            {/* Header & Metrics */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold dash-text">AI Usage Oversight</h1>
                    <p className="dash-text-tertiary mt-2">Operational audit trail and governance telemetry for AI activity.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex -space-x-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="w-8 h-8 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-surface-alt)] flex items-center justify-center dash-text-tertiary text-[10px] font-bold">
                                {String.fromCharCode(64 + i)}
                            </div>
                        ))}
                    </div>
                    <span className="text-xs dash-text-tertiary font-bold tracking-widest uppercase">Live Activity</span>
                </div>
            </div>

            {/* Metrics Strip */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Invocations', value: metrics?.totalInvocations || 0, icon: Activity, color: 'var(--color-accent)' },
                    { label: 'Flagged / Risks', value: metrics?.flaggedCount || 0, icon: AlertCircle, color: '#f59e0b' },
                    { label: 'Avg Latency', value: `${metrics?.avgLatency || 0}ms`, icon: Zap, color: '#3b82f6' },
                    { label: 'Estimated Cost', value: `$${metrics?.estimatedTotalCost?.toFixed(4) || '0.00'}`, icon: DollarSign, color: '#22c55e' }
                ].map((stat, i) => (
                    <div key={i} className="dash-card border dash-border rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:scale-[1.02] transition-transform">
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
                            placeholder="Filter logs by provider, model, or content..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter size={16} className="text-dash-tertiary" />
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm font-bold dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
                        >
                            <option value="all">All Status</option>
                            <option value="not_reviewed">Pending Review</option>
                            <option value="flagged">Flagged</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={loadData} className="p-2.5 rounded-xl border dash-border hover:bg-[var(--color-surface-alt)] transition-colors text-dash-tertiary">
                        <Clock size={18} />
                    </button>
                    <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-surface-alt)] border dash-border dash-text text-sm font-bold hover:dash-surface transition-all">
                        <ArrowUpRight size={16} />
                        Export Logs
                    </button>
                </div>
            </div>

            {/* Logs Table */}
            <div className="dash-card border dash-border rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-[var(--color-surface-alt)] border-b dash-border">
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Timestamp</th>
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Provider / Model</th>
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Payload Summary</th>
                                <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Status</th>
                                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Performance</th>
                                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest dash-text-tertiary"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dash-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-24 text-center">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--color-accent)] mb-4" />
                                        <p className="dash-text-tertiary font-medium">Crunching usage data...</p>
                                    </td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-24 text-center">
                                        <Activity className="w-12 h-12 mx-auto text-dash-tertiary mb-4 opacity-20" />
                                        <p className="dash-text font-bold">No usage logs found</p>
                                        <p className="dash-text-tertiary text-sm mt-1">Try adjusting your filters or check back later.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map(log => (
                                    <tr key={log.id} className="hover:bg-[var(--color-surface-alt)]/50 transition-colors group cursor-pointer" onClick={() => setSelectedLog(log)}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold dash-text">{new Date(log.created_at).toLocaleTimeString()}</span>
                                                <span className="text-[10px] dash-text-tertiary">{new Date(log.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5">
                                                    <Cpu size={12} className="text-dash-tertiary" />
                                                    <span className="text-sm font-bold dash-text capitalize">{log.provider_name}</span>
                                                </div>
                                                <span className="text-xs dash-text-tertiary">{log.model_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="max-w-md">
                                                <p className="text-sm dash-text truncate">{log.input_summary}</p>
                                                {log.risk_flags.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                        {log.risk_flags.map((flag, idx) => (
                                                            <span key={idx} className="px-1.5 py-0.5 rounded bg-[#f59e0b]/10 text-[#f59e0b] text-[8px] font-bold uppercase">
                                                                {flag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {statusBadge(log.review_status)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs font-bold dash-text">{log.performance.latency_ms}ms</span>
                                                <span className="text-[10px] dash-text-tertiary">${log.performance.estimated_cost?.toFixed(4)}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <ChevronRight size={18} className="text-dash-tertiary group-hover:text-[var(--color-accent)] group-hover:translate-x-1 transition-all" />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Log Detail Modal */}
            <AnimatePresence>
                {selectedLog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedLog(null)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl bg-[var(--color-surface)] border dash-border rounded-3xl shadow-2xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-8 border-b dash-border flex items-start justify-between bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-alt)]">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <h2 className="text-2xl font-bold dash-text">Usage Log Details</h2>
                                        {statusBadge(selectedLog.review_status)}
                                    </div>
                                    <p className="text-sm dash-text-tertiary">Resource ID: <span className="font-mono text-[10px] uppercase font-bold">{selectedLog.id}</span></p>
                                </div>
                                <button onClick={() => setSelectedLog(null)} className="p-2 rounded-xl hover:bg-[var(--color-surface-alt)] transition-colors">
                                    <XCircle size={24} className="text-dash-tertiary" />
                                </button>
                            </div>

                            <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8 scrollbar-hide">
                                {/* Core Info */}
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-2">Actor</h4>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-xs font-bold">
                                                    U
                                                </div>
                                                <span className="text-sm font-bold dash-text">User {selectedLog.user_id?.slice(0, 8)}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-2">AI Asset</h4>
                                            <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-accent)]">
                                                <Shield size={16} />
                                                <span>{selectedLog.ai_asset_id ? "Linked Asset" : "Direct Gateway Call"}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-2">Timestamp</h4>
                                            <div className="flex items-center gap-2 text-sm dash-text">
                                                <Clock size={16} className="text-dash-tertiary" />
                                                {new Date(selectedLog.created_at).toLocaleString()}
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-2">Engine</h4>
                                            <div className="flex items-center gap-2 text-sm dash-text">
                                                <Cpu size={16} className="text-dash-tertiary" />
                                                <span className="capitalize">{selectedLog.provider_name}</span> / {selectedLog.model_name}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Summaries */}
                                <div className="space-y-6">
                                    <div className="dash-card bg-[var(--color-surface-alt)] border dash-border rounded-2xl p-6">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-3 flex items-center gap-2">
                                            <Search size={14} />
                                            Input Summary (Sanitized)
                                        </h4>
                                        <p className="text-sm leading-relaxed dash-text italic">
                                            "{selectedLog.input_summary}"
                                        </p>
                                    </div>
                                    <div className="dash-card bg-[var(--color-surface-alt)] border dash-border rounded-2xl p-6">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-3 flex items-center gap-2">
                                            <ArrowUpRight size={14} />
                                            Output Summary (Sanitized)
                                        </h4>
                                        <p className="text-sm leading-relaxed dash-text italic">
                                            "{selectedLog.output_summary}"
                                        </p>
                                    </div>
                                </div>

                                {/* Telemery */}
                                <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-4">Governance Telemetry</h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="p-4 rounded-xl border dash-border bg-[var(--color-surface-alt)]">
                                            <p className="text-[8px] uppercase tracking-widest dash-text-tertiary mb-1">Latency</p>
                                            <p className="text-lg font-bold dash-text">{selectedLog.performance.latency_ms}ms</p>
                                        </div>
                                        <div className="p-4 rounded-xl border dash-border bg-[var(--color-surface-alt)]">
                                            <p className="text-[8px] uppercase tracking-widest dash-text-tertiary mb-1">Tokens</p>
                                            <p className="text-lg font-bold dash-text">{(selectedLog.performance.tokens_in || 0) + (selectedLog.performance.tokens_out || 0)}</p>
                                        </div>
                                        <div className="p-4 rounded-xl border dash-border bg-[var(--color-surface-alt)]">
                                            <p className="text-[8px] uppercase tracking-widest dash-text-tertiary mb-1">Requests</p>
                                            <p className="text-lg font-bold dash-text">1 Call</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 bg-[var(--color-surface-alt)] border-t dash-border flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleUpdateStatus(selectedLog.id, 'approved')}
                                        className="px-5 py-2.5 rounded-xl bg-[#22c55e] text-white text-sm font-bold shadow-lg hover:scale-[1.05] transition-all"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => handleUpdateStatus(selectedLog.id, 'rejected')}
                                        className="px-5 py-2.5 rounded-xl bg-[#ef4444] text-white text-sm font-bold shadow-lg hover:scale-[1.05] transition-all"
                                    >
                                        Reject
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleRequestReview}
                                        className="px-5 py-2.5 rounded-xl border dash-border bg-[var(--color-surface)] dash-text text-sm font-bold hover:bg-[var(--color-surface-alt)] transition-all flex items-center gap-2"
                                    >
                                        <Scale size={16} className="text-[var(--color-accent)]" />
                                        Request Governance Review
                                    </button>
                                    <button
                                        onClick={() => setShowIncidentModal(true)}
                                        className="px-5 py-2.5 rounded-xl border dash-border bg-[var(--color-surface)] dash-text text-sm font-bold hover:bg-[var(--color-surface-alt)] transition-all"
                                    >
                                        Flag for Incident
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Create Incident Modal */}
            <AnimatePresence>
                {showIncidentModal && selectedLog && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowIncidentModal(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative w-full max-w-lg bg-[var(--color-surface)] border dash-border rounded-3xl shadow-2xl p-8 space-y-6"
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className="text-xl font-bold dash-text">Create AI Incident</h3>
                            <p className="text-sm dash-text-tertiary">Escalate this usage log to a formal incident for investigation.</p>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-1.5 block">Incident Type</label>
                                    <select
                                        value={incidentData.type}
                                        onChange={e => setIncidentData({ ...incidentData, type: e.target.value as any })}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                                    >
                                        <option value="hallucination">Hallucination</option>
                                        <option value="bias">Bias / Discrimination</option>
                                        <option value="privacy_leak">Privacy / Data Leak</option>
                                        <option value="forbidden_output">Forbidden Output</option>
                                        <option value="policy_violation">Policy Violation</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-1.5 block">Severity</label>
                                    <select
                                        value={incidentData.severity}
                                        onChange={e => setIncidentData({ ...incidentData, severity: e.target.value as any })}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="critical">Critical</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-1.5 block">Detailed Context</label>
                                    <textarea
                                        rows={3}
                                        value={incidentData.description}
                                        onChange={e => setIncidentData({ ...incidentData, description: e.target.value })}
                                        placeholder="Describe the nature of the failure..."
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-none"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 pt-4">
                                <button
                                    onClick={handleCreateIncident}
                                    disabled={submittingIncident}
                                    className="flex-1 py-3 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                    {submittingIncident ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Create Incident & Escalate'}
                                </button>
                                <button
                                    onClick={() => setShowIncidentModal(false)}
                                    className="px-6 py-3 rounded-xl border dash-border dash-text text-sm font-bold hover:bg-[var(--color-surface-alt)] transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
