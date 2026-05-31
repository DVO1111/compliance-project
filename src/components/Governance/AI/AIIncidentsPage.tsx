// src/components/Governance/AI/AIIncidentsPage.tsx
// AI Incident Management Hub — Phase 6 Sprint 3
// Provides a centralized dashboard for detecting, escalating, and resolving AI-specific failures.

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { aiIncidentService, type AIIncident, type AIIncidentMetrics } from '../../../lib/aiGovernance/aiIncidentService';
import {
    ShieldAlert,
    AlertTriangle,
    Clock,
    CheckCircle2,
    XCircle,
    Search,
    ArrowUpRight,
    Loader2,
    ChevronRight,
    MessageSquare,
    User,
    Calendar,
    Flag,
    Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '../../../lib/logger';

export default function AIIncidentsPage() {
    const { profile } = useAuth();
    const companyId = profile?.company_id;

    const [loading, setLoading] = useState(true);
    const [incidents, setIncidents] = useState<AIIncident[]>([]);
    const [metrics, setMetrics] = useState<AIIncidentMetrics | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [selectedIncident, setSelectedIncident] = useState<AIIncident | null>(null);

    const loadData = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [params, metricsData] = await Promise.all([
                aiIncidentService.listIncidents(companyId, {
                    status: statusFilter === 'all' ? undefined : statusFilter as any
                }),
                aiIncidentService.getMetrics(companyId)
            ]);
            setIncidents(params as any);
            setMetrics(metricsData as any);
        } catch (err) {
            logger.error('Failed to load incidents:', err);
        } finally {
            setLoading(false);
        }
    }, [companyId, statusFilter]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleUpdateStatus = async (incidentId: string, status: AIIncident['status']) => {
        if (!companyId) return;
        try {
            await aiIncidentService.updateIncident(incidentId, companyId, { status });
            loadData();
            if (selectedIncident?.id === incidentId) {
                setSelectedIncident(prev => prev ? { ...prev, status } : null);
            }
        } catch (err) {
            logger.error('Failed to update incident status:', err);
        }
    };

    const severityBadge = (severity: string) => {
        const configs: any = {
            critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: ShieldAlert },
            high: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: AlertTriangle },
            medium: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: Flag },
            low: { color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: Flag }
        };
        const config = configs[severity] || configs.low;
        const Icon = config.icon;
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: config.bg, color: config.color }}>
                <Icon size={12} />
                {severity}
            </span>
        );
    };

    const statusBadge = (status: string) => {
        const configs: any = {
            open: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: Clock },
            escalated: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: Zap },
            resolved: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: CheckCircle2 },
            closed: { color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: XCircle }
        };
        const config = configs[status] || configs.open;
        const Icon = config.icon;
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                style={{ backgroundColor: config.bg, color: config.color, borderColor: config.color + '33' }}>
                <Icon size={12} />
                {status}
            </span>
        );
    };

    const filteredIncidents = incidents.filter(inc =>
        inc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.incident_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inc.description?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold dash-text">AI Incidents & Escalations</h1>
                    <p className="dash-text-tertiary mt-2">Formal registry and response workflow for AI failures and policy breaches.</p>
                </div>

                <div className="flex items-center gap-3">
                    <button className="px-5 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold shadow-lg hover:scale-[1.02] transition-all">
                        Report Manual Incident
                    </button>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Open', value: metrics?.openIncidents || 0, icon: Clock, color: 'var(--color-accent)' },
                    { label: 'Escalated', value: metrics?.escalatedIncidents || 0, icon: Zap, color: '#f59e0b' },
                    { label: 'Critical / High', value: metrics?.criticalIncidents || 0, icon: ShieldAlert, color: '#ef4444' },
                    { label: 'Avg Resolution', value: `${metrics?.avgResolutionTimeHours?.toFixed(1) || 0}h`, icon: Calendar, color: '#22c55e' }
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
                            placeholder="Filter by title, type, or description..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2.5 text-sm dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm font-bold dash-text focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
                    >
                        <option value="all">All Status</option>
                        <option value="open">Open</option>
                        <option value="escalated">Escalated</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>
            </div>

            {/* Content */}
            <div className="dash-card border dash-border rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-[var(--color-surface-alt)] border-b dash-border">
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Incident</th>
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Severity / Status</th>
                                <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Source / Asset</th>
                                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Reported</th>
                                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest dash-text-tertiary"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dash-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-24 text-center">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--color-accent)] mb-4" />
                                        <p className="dash-text-tertiary font-medium">Loading incidents...</p>
                                    </td>
                                </tr>
                            ) : filteredIncidents.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-24 text-center">
                                        <ShieldAlert className="w-12 h-12 mx-auto text-dash-tertiary mb-4 opacity-20" />
                                        <p className="dash-text font-bold">No incidents detected</p>
                                        <p className="dash-text-tertiary text-sm mt-1">AI activity appears to be within policy bounds.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredIncidents.map(inc => (
                                    <tr key={inc.id} className="hover:bg-[var(--color-surface-alt)]/50 transition-colors group cursor-pointer" onClick={() => setSelectedIncident(inc)}>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold dash-text">{inc.title}</span>
                                                <span className="text-[10px] dash-text-tertiary uppercase tracking-wider">{inc.incident_type.replace('_', ' ')}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {severityBadge(inc.severity)}
                                                {statusBadge(inc.status)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold dash-text capitalize">{inc.source.replace('_', ' ')}</span>
                                                <span className="text-[10px] dash-text-tertiary truncate max-w-[150px]">Asset: {inc.ai_asset?.name || 'Direct call'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs font-bold dash-text">{new Date(inc.created_at).toLocaleDateString()}</span>
                                                <span className="text-[10px] dash-text-tertiary font-mono uppercase">{inc.id.slice(0, 8)}</span>
                                            </div>
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

            {/* Incident Detail Draw / Modal */}
            <AnimatePresence>
                {selectedIncident && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedIncident(null)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-3xl bg-[var(--color-surface)] border dash-border rounded-3xl shadow-2xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-8 border-b dash-border flex items-start justify-between bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-alt)]">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-2xl font-bold dash-text">{selectedIncident.title}</h2>
                                        {statusBadge(selectedIncident.status)}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs font-bold dash-text-tertiary uppercase tracking-widest">
                                        <span className="flex items-center gap-1.5"><Calendar size={14} /> Reported {new Date(selectedIncident.created_at).toLocaleString()}</span>
                                        <span className="flex items-center gap-1.5 text-[var(--color-accent)]"><ShieldAlert size={14} /> {selectedIncident.incident_type.replace('_', ' ')}</span>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedIncident(null)} className="p-2 rounded-xl hover:bg-[var(--color-surface-alt)] transition-colors">
                                    <XCircle size={24} className="text-dash-tertiary" />
                                </button>
                            </div>

                            <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8 scrollbar-hide">
                                {/* Description */}
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-2">Technical Summary</h4>
                                    <div className="p-6 rounded-2xl bg-[var(--color-surface-alt)] border dash-border">
                                        <p className="text-sm leading-relaxed dash-text">{selectedIncident.description}</p>
                                    </div>
                                </div>

                                {/* Link Details */}
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Incident Metadata</h4>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="dash-text-tertiary">Initial Severity</span>
                                                {severityBadge(selectedIncident.severity)}
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="dash-text-tertiary">Reporter</span>
                                                <span className="flex items-center gap-2 font-bold dash-text">
                                                    <User size={12} className="text-[var(--color-accent)]" />
                                                    {selectedIncident.reporter?.full_name || 'System Auto-Detect'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="dash-text-tertiary">Assigned To</span>
                                                <span className="font-bold dash-text">{selectedIncident.assignee?.full_name || 'Unassigned'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Governance Links</h4>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="dash-text-tertiary">Related Risk</span>
                                                <span className="font-bold text-[var(--color-accent)] truncate max-w-[150px]">{selectedIncident.risk?.title || 'None'}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="dash-text-tertiary">Policy Version</span>
                                                <span className="font-mono text-[10px] uppercase font-bold dash-text">{selectedIncident.linked_policy_id?.slice(0, 8) || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="dash-text-tertiary">Audit Trail</span>
                                                <span className="flex items-center gap-1 text-[var(--color-accent)] font-bold cursor-pointer hover:underline">
                                                    View Logs <ArrowUpRight size={12} />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Escalation Status */}
                                {selectedIncident.status === 'escalated' && (
                                    <div className="p-6 rounded-2xl bg-[#f59e0b]/10 border border-[#f59e0b]/20 flex items-start gap-4">
                                        <Zap className="text-[#f59e0b] mt-0.5" size={20} />
                                        <div>
                                            <p className="text-sm font-bold text-[#f59e0b]">Active Escalation</p>
                                            <p className="text-xs text-[#f59e0b]/80 mt-1 leading-relaxed">
                                                Compliance administrators have been notified. This incident is marked for high-priority review due to its critical nature.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-8 bg-[var(--color-surface-alt)] border-t dash-border flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {selectedIncident.status !== 'resolved' && (
                                        <button
                                            onClick={() => handleUpdateStatus(selectedIncident.id, 'resolved')}
                                            className="px-6 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold shadow-lg hover:scale-[1.05] transition-all"
                                        >
                                            Mark as Resolved
                                        </button>
                                    )}
                                    <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl border dash-border bg-[var(--color-surface)] dash-text text-sm font-bold hover:dash-surface transition-all">
                                        <MessageSquare size={16} />
                                        Add Note
                                    </button>
                                </div>
                                <button className="px-5 py-2.5 rounded-xl border dash-border dash-text text-sm font-bold hover:bg-[var(--color-surface-alt)] transition-colors">
                                    Assign Investigator
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
