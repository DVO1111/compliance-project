import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getAIInsights,
    type AIInsightsData,
    type SmartAlert,
} from '../../lib/aiInsightsService';
import {
    Sparkles, AlertTriangle, AlertCircle, Info,
    RefreshCw, Brain, TrendingUp, FileWarning,
    ShieldAlert, ChevronRight, FlaskConical, BookMarked,
    GitMerge, CheckCircle2, Lightbulb,
} from 'lucide-react';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function alertIcon(severity: SmartAlert['severity']) {
    if (severity === 'critical') return <AlertTriangle size={16} className="text-[var(--color-danger)] flex-shrink-0" />;
    if (severity === 'warning')  return <AlertCircle  size={16} className="text-[var(--color-warning)] flex-shrink-0" />;
    return <Info size={16} className="text-[var(--color-info)] flex-shrink-0" />;
}

function alertBg(severity: SmartAlert['severity']) {
    if (severity === 'critical') return 'bg-[var(--color-danger-soft)]  border-[var(--color-danger)]/30';
    if (severity === 'warning')  return 'bg-[var(--color-warning-soft)] border-[var(--color-warning)]/30';
    return 'bg-[var(--color-info-soft)] border-[var(--color-info)]/30';
}

function gradeColor(grade: string) {
    if (grade === 'A') return 'text-[var(--color-success)]';
    if (grade === 'B') return 'text-[var(--color-info)]';
    if (grade === 'C') return 'text-[var(--color-warning)]';
    return 'text-[var(--color-danger)]';
}

const DOMAIN_ICONS: Record<string, React.ElementType> = {
    'Batch Release':     FlaskConical,
    'Change Control':    GitMerge,
    'Document Control':  BookMarked,
    'CAPA & Deviations': AlertTriangle,
    'GRC Controls':      ShieldAlert,
    'Content Review':    TrendingUp,
};

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function AIInsightsPage() {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id ?? '';

    const [data, setData] = useState<AIInsightsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [generatingNarrative, setGeneratingNarrative] = useState(false);

    const load = useCallback(async (withNarrative = false) => {
        if (!companyId) return;
        setLoading(true);
        const result = await getAIInsights(companyId, withNarrative);
        setData(result);
        setLoading(false);
    }, [companyId]);

    const refreshNarrative = async () => {
        if (!companyId || !data) return;
        setGeneratingNarrative(true);
        const result = await getAIInsights(companyId, true);
        setData(result);
        setGeneratingNarrative(false);
    };

    useEffect(() => { load(false); }, [load]);

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-72 rounded-lg bg-[var(--color-surface-alt)] animate-pulse" />
                <div className="h-32 rounded-2xl bg-[var(--color-surface-alt)] animate-pulse" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-48 rounded-2xl bg-[var(--color-surface-alt)] animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (!data) return null;

    const criticalCount  = data.smartAlerts.filter(a => a.severity === 'critical').length;
    const warningCount   = data.smartAlerts.filter(a => a.severity === 'warning').length;

    return (
        <div className="space-y-8">

            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <Sparkles size={20} className="text-[var(--color-accent)]" />
                        </div>
                        <h2 className="text-2xl font-bold dash-text">AI Insights</h2>
                    </div>
                    <p className="text-sm dash-text-secondary ml-12">
                        AI-detected patterns, anomalies, and forward-looking compliance signals
                    </p>
                </div>
                <button onClick={() => load(false)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border dash-border dash-card hover:border-[var(--color-accent)] transition-colors">
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* ── AI Narrative ─────────────────────────────────────────── */}
            <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                            <Brain size={18} className="text-purple-600" />
                        </div>
                        <div>
                            <h3 className="font-bold dash-text">Compliance Intelligence Summary</h3>
                            <p className="text-xs dash-text-tertiary">AI-generated interpretation of your current compliance state</p>
                        </div>
                    </div>
                    <button
                        onClick={refreshNarrative}
                        disabled={generatingNarrative}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border dash-border hover:border-[var(--color-accent)] transition-colors disabled:opacity-50"
                    >
                        <Sparkles size={12} className={generatingNarrative ? 'animate-spin' : ''} />
                        {generatingNarrative ? 'Generating…' : 'Regenerate with AI'}
                    </button>
                </div>
                <p className="text-sm dash-text leading-relaxed">{data.narrativeSummary}</p>

                {/* Alert summary pills */}
                <div className="flex gap-3 mt-4 flex-wrap">
                    {criticalCount > 0 && (
                        <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger)]/30">
                            <AlertTriangle size={11} /> {criticalCount} Critical
                        </span>
                    )}
                    {warningCount > 0 && (
                        <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)]/30">
                            <AlertCircle size={11} /> {warningCount} Warning
                        </span>
                    )}
                    {criticalCount === 0 && warningCount === 0 && (
                        <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)] border border-[var(--color-success)]/30">
                            <CheckCircle2 size={11} /> All Clear
                        </span>
                    )}
                </div>
            </div>

            {/* ── Smart Alerts ─────────────────────────────────────────── */}
            <div>
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                        <Lightbulb size={16} className="text-[var(--color-accent)]" />
                    </div>
                    <div>
                        <h3 className="font-bold dash-text">Smart Alerts</h3>
                        <p className="text-xs dash-text-tertiary">AI-derived anomalies and actionable signals from your compliance data</p>
                    </div>
                </div>
                <div className="space-y-3">
                    {data.smartAlerts.map(alert => {
                        const DomainIcon = DOMAIN_ICONS[alert.domain] ?? ShieldAlert;
                        return (
                            <div key={alert.id} className={`flex items-start gap-3 p-4 rounded-2xl border ${alertBg(alert.severity)}`}>
                                {alertIcon(alert.severity)}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <DomainIcon size={12} className="dash-text-tertiary" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">{alert.domain}</span>
                                    </div>
                                    <p className="text-sm font-semibold dash-text">{alert.headline}</p>
                                    <p className="text-xs dash-text-secondary mt-0.5 leading-relaxed">{alert.detail}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Pattern Analysis ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Content rejection patterns */}
                <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <FileWarning size={16} className="text-[var(--color-accent)]" />
                        </div>
                        <div>
                            <h3 className="font-bold dash-text">Content Rejection Patterns</h3>
                            <p className="text-xs dash-text-tertiary">Most common reasons across rejected submissions</p>
                        </div>
                    </div>
                    {data.topRejectionPatterns.length === 0 ? (
                        <p className="text-sm dash-text-tertiary text-center py-6">
                            No rejection data yet — or all submissions are approved.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {data.topRejectionPatterns.map((p, i) => (
                                <div key={i}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm dash-text truncate flex-1 pr-2">{p.label}</span>
                                        <span className="text-xs font-bold dash-text-tertiary flex-shrink-0">{p.count}× ({p.pct}%)</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-[var(--color-danger)]"
                                            style={{ width: `${p.pct}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* CAPA root causes */}
                <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <AlertTriangle size={16} className="text-[var(--color-accent)]" />
                        </div>
                        <div>
                            <h3 className="font-bold dash-text">CAPA Root Cause Patterns</h3>
                            <p className="text-xs dash-text-tertiary">Recurring root causes across your CAPA records</p>
                        </div>
                    </div>
                    {data.capaRootCauses.length === 0 ? (
                        <p className="text-sm dash-text-tertiary text-center py-6">
                            No CAPA root causes recorded yet.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {data.capaRootCauses.map((c, i) => (
                                <div key={i} className="flex items-start justify-between gap-3 py-2 border-b dash-border last:border-0">
                                    <p className="text-sm dash-text flex-1 leading-relaxed">{c.cause}</p>
                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--color-warning-soft)] text-[var(--color-warning)] flex-shrink-0">
                                        {c.count}×
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Domain Health Snapshot ───────────────────────────────── */}
            <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                        <TrendingUp size={16} className="text-[var(--color-accent)]" />
                    </div>
                    <div>
                        <h3 className="font-bold dash-text">Domain Health Snapshot</h3>
                        <p className="text-xs dash-text-tertiary">AI-scored compliance strength across all modules — see Compliance Report for full breakdown</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {data.report.domainScores.map(d => {
                        const Icon = DOMAIN_ICONS[d.domain] ?? ShieldAlert;
                        const barColor = d.score >= 75 ? 'bg-[var(--color-success)]'
                            : d.score >= 50 ? 'bg-[var(--color-warning)]'
                            : 'bg-[var(--color-danger)]';
                        const scoreCol = d.score >= 75 ? 'text-[var(--color-success)]'
                            : d.score >= 50 ? 'text-[var(--color-warning)]'
                            : 'text-[var(--color-danger)]';
                        return (
                            <div key={d.domain} className="p-3 rounded-xl bg-[var(--color-surface-alt)] border dash-border">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <Icon size={13} className="dash-text-secondary" />
                                        <span className="text-xs font-semibold dash-text">{d.domain}</span>
                                    </div>
                                    <span className={`text-sm font-black ${scoreCol}`}>{d.score}</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${d.score}%` }} />
                                </div>
                                {d.issues.length > 0 && (
                                    <p className="text-[10px] dash-text-tertiary mt-1.5 flex items-center gap-1">
                                        <ChevronRight size={9} />
                                        {d.issues[0]}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Recent AI Assessments ────────────────────────────────── */}
            {data.recentAssessments.length > 0 && (
                <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <Brain size={16} className="text-[var(--color-accent)]" />
                        </div>
                        <div>
                            <h3 className="font-bold dash-text">Recent AI Risk Assessments</h3>
                            <p className="text-xs dash-text-tertiary">Latest AI-analysed content submissions</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {data.recentAssessments.map(a => (
                            <div key={a.id} className="flex items-start gap-4 p-3 rounded-xl bg-[var(--color-surface-alt)] border dash-border">
                                <div className={`text-xl font-black w-8 flex-shrink-0 text-center ${gradeColor(a.risk_grade)}`}>
                                    {a.risk_grade}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold dash-text">{a.title}</p>
                                        <span className="text-xs dash-text-tertiary">{a.risk_score}/100</span>
                                    </div>
                                    <p className="text-xs dash-text-secondary mt-0.5 line-clamp-2">{a.summary}</p>
                                </div>
                                <span className="text-[10px] dash-text-tertiary flex-shrink-0">
                                    {new Date(a.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
}
