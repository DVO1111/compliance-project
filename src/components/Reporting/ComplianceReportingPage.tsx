import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    calculateHealthScore,
    getTherapeuticBreakdown,
    getTopRejectionCauses,
    getBottleneckAnalysis,
    type HealthScore,
    type TherapeuticBreakdown,
    type ClaimRejection,
    type BottleneckEntry,
} from '../../lib/complianceHealthService';
import {
    Activity, TrendingUp, TrendingDown, Minus, AlertTriangle,
    BarChart3, Download, Shield, Clock, XCircle, FileText,
} from 'lucide-react';

const GRADE_COLORS: Record<string, string> = {
    A: 'text-[var(--color-success)] bg-[var(--color-success-soft)] border-[var(--color-success)]/20',
    B: 'text-[var(--color-info)] bg-[var(--color-info-soft)] border-[var(--color-info)]/20',
    C: 'text-[var(--color-warning)] bg-[var(--color-warning-soft)] border-[var(--color-warning)]/20',
    D: 'text-[var(--color-warning)] bg-[var(--color-warning-soft)] border-[var(--color-warning)]/20',
    F: 'text-[var(--color-danger)] bg-[var(--color-danger-soft)] border-[var(--color-danger)]/20',
};

const RISK_COLORS: Record<string, string> = {
    low: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
    medium: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    high: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
};

export default function ComplianceReportingPage() {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id;

    const [health, setHealth] = useState<HealthScore | null>(null);
    const [therapeutic, setTherapeutic] = useState<TherapeuticBreakdown[]>([]);
    const [rejections, setRejections] = useState<ClaimRejection[]>([]);
    const [bottlenecks, setBottlenecks] = useState<BottleneckEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const [h, t, r, b] = await Promise.all([
            calculateHealthScore(companyId),
            getTherapeuticBreakdown(companyId),
            getTopRejectionCauses(companyId),
            getBottleneckAnalysis(companyId),
        ]);
        setHealth(h);
        setTherapeutic(t);
        setRejections(r);
        setBottlenecks(b);
        setLoading(false);
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const TrendIcon = health?.rejectionTrend === 'improving' ? TrendingDown
        : health?.rejectionTrend === 'worsening' ? TrendingUp : Minus;

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-64 rounded-lg bg-[var(--color-surface-alt)] animate-pulse" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-48 rounded-2xl bg-[var(--color-surface-alt)] animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <Activity className="w-5 h-5 dash-accent" />
                        </div>
                        <h2 className="text-2xl font-bold dash-text">Compliance Reporting</h2>
                    </div>
                    <p className="dash-text-secondary text-sm ml-12">
                        Executive compliance health overview and analytics
                    </p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-[var(--color-border)] dash-card hover:border-[var(--color-accent)] transition-colors">
                    <Download className="w-4 h-4" />
                    Export Report
                </button>
            </div>

            {/* Health Score + Key Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Health Score Gauge */}
                <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)] text-center">
                    <p className="text-xs font-medium dash-text-secondary uppercase tracking-wider mb-3">Compliance Health</p>
                    <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full border-behance-blue ${GRADE_COLORS[health?.grade || 'C']} mb-3`}>
                        <span className="text-3xl font-black">{health?.grade || '—'}</span>
                    </div>
                    <p className="text-2xl font-bold dash-text">{health?.overall ?? 0}<span className="text-sm font-normal">/100</span></p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                        <TrendIcon className={`w-3.5 h-3.5 ${health?.rejectionTrend === 'improving' ? 'text-[var(--color-success)]' : health?.rejectionTrend === 'worsening' ? 'text-[var(--color-danger)]' : 'dash-text-tertiary'}`} />
                        <span className="text-xs dash-text-secondary capitalize">{health?.rejectionTrend || 'stable'}</span>
                    </div>
                </div>

                {/* Key metric cards */}
                {[
                    { label: 'Approval Rate', value: `${Math.round((health?.approvalRate || 0) * 100)}%`, icon: Shield, color: 'text-[var(--color-success)]' },
                    { label: 'Avg Turnaround', value: `${(health?.avgTurnaroundHrs || 0).toFixed(1)}h`, icon: Clock, color: 'text-[var(--color-info)]' },
                    { label: 'Pending Queue', value: String(health?.pendingQueueDepth || 0), icon: FileText, color: 'text-behance-amber-500' },
                ].map(m => (
                    <div key={m.label} className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                        <div className="flex items-center gap-2 mb-3">
                            <m.icon className={`w-4 h-4 ${m.color}`} />
                            <span className="text-xs font-medium dash-text-secondary">{m.label}</span>
                        </div>
                        <p className="text-3xl font-bold dash-text">{m.value}</p>
                    </div>
                ))}
            </div>

            {/* Therapeutic Area Breakdown */}
            <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                <h3 className="font-semibold dash-text mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 dash-accent" />
                    Therapeutic Area Breakdown
                </h3>
                {therapeutic.length === 0 ? (
                    <p className="text-sm dash-text-tertiary text-center py-4">No data available</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--color-border)]">
                                    <th className="text-left py-2 px-3 font-medium dash-text-secondary">Topic</th>
                                    <th className="text-center py-2 px-3 font-medium dash-text-secondary">Submissions</th>
                                    <th className="text-center py-2 px-3 font-medium dash-text-secondary">Approved</th>
                                    <th className="text-center py-2 px-3 font-medium dash-text-secondary">Rejected</th>
                                    <th className="text-center py-2 px-3 font-medium dash-text-secondary">Avg Cycles</th>
                                    <th className="text-center py-2 px-3 font-medium dash-text-secondary">Risk</th>
                                </tr>
                            </thead>
                            <tbody>
                                {therapeutic.slice(0, 10).map(t => (
                                    <tr key={t.topic} className="border-b border-[var(--color-border)] last:border-behance-blue">
                                        <td className="py-2.5 px-3 dash-text font-medium">{t.topic}</td>
                                        <td className="py-2.5 px-3 text-center dash-text">{t.submissions}</td>
                                        <td className="py-2.5 px-3 text-center text-[var(--color-success)]">{t.approved}</td>
                                        <td className="py-2.5 px-3 text-center text-[var(--color-danger)]">{t.rejected}</td>
                                        <td className="py-2.5 px-3 text-center dash-text">{t.avgCycles}</td>
                                        <td className="py-2.5 px-3 text-center">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLORS[t.riskLevel]}`}>
                                                {t.riskLevel}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Rejection Causes */}
                <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                    <h3 className="font-semibold dash-text mb-4 flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-[var(--color-danger)]" />
                        Top Rejection Causes
                    </h3>
                    {rejections.length === 0 ? (
                        <p className="text-sm dash-text-tertiary text-center py-4">No rejections recorded</p>
                    ) : (
                        <div className="space-y-2">
                            {rejections.slice(0, 8).map((r, i) => (
                                <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-[var(--color-border)] last:border-behance-blue">
                                    <p className="text-sm dash-text truncate flex-1">{r.phrase}</p>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)] shrink-0">
                                        {r.count}×
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Bottleneck Analysis */}
                <div className="dash-card rounded-2xl p-6 border border-[var(--color-border)]">
                    <h3 className="font-semibold dash-text mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-behance-amber-500" />
                        Bottleneck Analysis
                    </h3>
                    {bottlenecks.length === 0 ? (
                        <p className="text-sm dash-text-tertiary text-center py-4">No bottlenecks detected</p>
                    ) : (
                        <div className="space-y-3">
                            {bottlenecks.map((b, i) => (
                                <div key={i} className="p-3 rounded-xl bg-[var(--color-surface-alt)]">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium dash-text capitalize">{b.stage}</span>
                                        <span className="text-xs dash-text-secondary">{b.itemCount} items</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-2 rounded-full bg-[var(--color-border)] overflow-hidden">
                                            <div className={`h-full rounded-full ${b.avgDaysStuck > 5 ? 'bg-[var(--color-danger)]' : b.avgDaysStuck > 2 ? 'bg-behance-amber-500' : 'bg-[var(--color-success)]'}`}
                                                style={{ width: `${Math.min(b.avgDaysStuck / 10 * 100, 100)}%` }} />
                                        </div>
                                        <span className="text-xs font-semibold dash-text shrink-0">{b.avgDaysStuck}d avg</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

