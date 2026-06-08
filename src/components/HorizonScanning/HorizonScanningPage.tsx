import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    fetchRegulatoryAlerts,
    findAffectedContent,
    getConsultationPeriods,
    fetchImpactAssessments,
    applyImpactRecommendation,
    flagAffectedControls,
    getControlFlags,
    resolveControlFlag,
    type RegulatoryAlert,
    type AffectedContent,
    type ConsultationEntry,
    type RegulatoryImpactAssessment,
    type ControlFlag,
} from '../../lib/horizonScanningService';
import {
    Radar, AlertTriangle, FileSearch, CalendarClock,
    Shield, Bell, ChevronRight, ChevronDown, RefreshCw,
    Sparkles, ArrowRight, CheckCircle2, X,
    ShieldAlert, Check,
} from 'lucide-react';
import { logger } from '../../lib/logger';

type Tab = 'feed' | 'affected' | 'consultations';

const SEVERITY_BADGE: Record<string, string> = {
    critical: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    warning:  'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    info:     'bg-[var(--color-info-soft)] text-[var(--color-info)]',
};

const TYPE_BADGE: Record<string, string> = {
    guidance_update:   'bg-[var(--color-info-soft)] text-[var(--color-info)]',
    enforcement_action:'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    warning_letter:    'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    consultation:      'bg-[var(--color-purple)]/10 text-[var(--color-purple)]',
    recall:            'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
};

const FLAG_SEVERITY_CHIP: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    warning:  'bg-amber-100 text-amber-700',
    info:     'bg-blue-100 text-blue-700',
};

export default function HorizonScanningPage() {
    const { profile, user } = useAuth();
    const companyId = (profile as any)?.company_id;

    const [tab, setTab] = useState<Tab>('feed');
    const [alerts, setAlerts] = useState<RegulatoryAlert[]>([]);
    const [affected, setAffected] = useState<AffectedContent[]>([]);
    const [consultations, setConsultations] = useState<ConsultationEntry[]>([]);
    const [recommendations, setRecommendations] = useState<RegulatoryImpactAssessment[]>([]);
    const [selectedRecommendation, setSelectedRecommendation] = useState<RegulatoryImpactAssessment | null>(null);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);

    // GRC control flag state
    const [controlFlags, setControlFlags] = useState<Record<string, ControlFlag[]>>({});
    const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
    const [flagging, setFlagging] = useState<string | null>(null);
    const [resolving, setResolving] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        if (tab === 'feed') {
            const fetchedAlerts = await fetchRegulatoryAlerts();
            setAlerts(fetchedAlerts);
            // Fetch existing control flags for all alerts in parallel
            if (companyId) {
                const flagResults = await Promise.all(
                    fetchedAlerts.map(a => getControlFlags(a.id, companyId))
                );
                const map: Record<string, ControlFlag[]> = {};
                fetchedAlerts.forEach((a, i) => { map[a.id] = flagResults[i]; });
                setControlFlags(map);
            }
        } else if (tab === 'affected' && companyId) {
            const [aff, recs] = await Promise.all([
                findAffectedContent(companyId),
                fetchImpactAssessments(companyId),
            ]);
            setAffected(aff.map(a => {
                const rec = recs.find(r => r.contentId === a.contentId);
                return { ...a, recommendationId: rec?.id, suggestedChange: rec?.suggestedChange, impactLevel: rec?.impactLevel };
            }));
            setRecommendations(recs);
        } else if (tab === 'consultations') {
            setConsultations(getConsultationPeriods());
        }
        setLoading(false);
    }, [tab, companyId]);

    useEffect(() => { load(); }, [load]);

    const handleApplyRecommendation = async (rec: RegulatoryImpactAssessment) => {
        setApplying(true);
        try {
            const success = await applyImpactRecommendation(rec.id, companyId, user?.id);
            if (success) {
                window.dispatchEvent(new CustomEvent('global-toast', {
                    detail: { message: 'AI suggestion applied and content updated successfully', type: 'success' },
                }));
                setSelectedRecommendation(null);
                load();
            }
        } catch (e) {
            logger.error(e);
            window.dispatchEvent(new CustomEvent('global-toast', {
                detail: { message: 'Failed to apply transformation', type: 'warning' },
            }));
        } finally {
            setApplying(false);
        }
    };

    const handleFlagControls = async (alert: RegulatoryAlert) => {
        if (!companyId) return;
        setFlagging(alert.id);
        try {
            const flags = await flagAffectedControls(alert.id, alert, companyId, user?.id);
            setControlFlags(prev => ({ ...prev, [alert.id]: flags }));
            setExpandedAlert(alert.id);
            window.dispatchEvent(new CustomEvent('global-toast', {
                detail: {
                    message: flags.length
                        ? `${flags.length} GRC control${flags.length !== 1 ? 's' : ''} flagged for review`
                        : 'No matching GRC controls found for this alert',
                    type: flags.length ? 'success' : 'info',
                },
            }));
        } catch (e) {
            logger.error(e);
        } finally {
            setFlagging(null);
        }
    };

    const handleResolveFlag = async (flagId: string, alertId: string) => {
        if (!companyId) return;
        setResolving(flagId);
        try {
            await resolveControlFlag(flagId, companyId, user?.id);
            setControlFlags(prev => ({
                ...prev,
                [alertId]: (prev[alertId] ?? []).map(f =>
                    f.id === flagId ? { ...f, status: 'resolved' as const } : f
                ),
            }));
        } catch (e) {
            logger.error(e);
        } finally {
            setResolving(null);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <Radar className="w-5 h-5 dash-accent" />
                        </div>
                        <h2 className="text-2xl font-bold dash-text">Horizon Scanning</h2>
                    </div>
                    <p className="dash-text-secondary text-sm ml-12">
                        Proactive regulatory intelligence and content impact analysis
                    </p>
                </div>
                <button onClick={load}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-[var(--color-border)] dash-card hover:border-[var(--color-accent)] transition-colors">
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-alt)] w-fit">
                {([
                    { id: 'feed' as Tab, label: 'Live Feed', icon: Bell, count: alerts.length },
                    { id: 'affected' as Tab, label: 'Affected Content', icon: FileSearch, count: affected.length },
                    { id: 'consultations' as Tab, label: 'Consultation Tracker', icon: CalendarClock, count: consultations.filter(c => c.status !== 'closed').length },
                ] as const).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === t.id ? 'bg-[var(--color-surface)] shadow-sm dash-text' : 'dash-text-secondary hover:dash-text'}`}>
                        <t.icon className="w-4 h-4" />
                        {t.label}
                        {t.count > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--color-accent-soft)] dash-accent font-semibold">{t.count}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-24 rounded-xl bg-[var(--color-surface-alt)] animate-pulse" />
                    ))}
                </div>
            ) : tab === 'feed' ? (
                /* ═══ Live Feed ═══ */
                <div className="space-y-3">
                    {alerts.map(alert => {
                        const flags = controlFlags[alert.id] ?? [];
                        const activeFlags = flags.filter(f => f.status !== 'resolved');
                        const isExpanded = expandedAlert === alert.id;
                        const isFlagging = flagging === alert.id;

                        return (
                            <div key={alert.id} className="dash-card rounded-xl border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors overflow-hidden">
                                {/* Alert main row */}
                                <div className="p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_BADGE[alert.severity]}`}>
                                                    {alert.severity}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[alert.alertType]}`}>
                                                    {alert.alertType.replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-xs font-semibold dash-accent">{alert.source}</span>
                                            </div>
                                            <h4 className="font-semibold dash-text text-sm">{alert.title}</h4>
                                            <p className="text-xs dash-text-secondary mt-1 line-clamp-2">{alert.body}</p>
                                        </div>

                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            {alert.affectedContentCount > 0 && (
                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-[var(--color-danger-soft)] text-[var(--color-danger)] font-medium">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    {alert.affectedContentCount} affected
                                                </span>
                                            )}
                                            <p className="text-xs dash-text-tertiary">
                                                {new Date(alert.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </p>
                                        </div>
                                    </div>

                                    {/* GRC action row */}
                                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--color-border)]">
                                        {activeFlags.length > 0 ? (
                                            <button
                                                onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}
                                                className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-100 transition-colors">
                                                <ShieldAlert className="w-3.5 h-3.5" />
                                                {activeFlags.length} GRC control{activeFlags.length !== 1 ? 's' : ''} flagged
                                                {isExpanded
                                                    ? <ChevronDown className="w-3 h-3" />
                                                    : <ChevronRight className="w-3 h-3" />}
                                            </button>
                                        ) : flags.length > 0 ? (
                                            <span className="flex items-center gap-1.5 text-xs text-[var(--color-success)] font-medium">
                                                <Check className="w-3.5 h-3.5" />
                                                All controls resolved
                                            </span>
                                        ) : null}

                                        <button
                                            onClick={() => handleFlagControls(alert)}
                                            disabled={isFlagging}
                                            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border border-[var(--color-border)] dash-text-secondary hover:border-[var(--color-accent)] hover:dash-accent transition-colors disabled:opacity-50">
                                            {isFlagging
                                                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Scanning…</>
                                                : <><ShieldAlert className="w-3 h-3" /> {flags.length > 0 ? 'Re-scan GRC Controls' : 'Flag GRC Controls'}</>}
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded control flags panel */}
                                {isExpanded && flags.length > 0 && (
                                    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-alt)]/40 px-5 py-4 space-y-2">
                                        <p className="text-xs font-semibold dash-text-secondary uppercase tracking-wide mb-3">
                                            Affected GRC Controls
                                        </p>
                                        {flags.map(flag => (
                                            <div key={flag.id}
                                                className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 border transition-all
                                                    ${flag.status === 'resolved'
                                                        ? 'border-[var(--color-border)] opacity-50 bg-[var(--color-surface-alt)]'
                                                        : 'border-amber-200 bg-amber-50/60'}`}>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs font-mono font-bold dash-text">{flag.controlCode}</span>
                                                        {flag.frameworkName && (
                                                            <span className="text-xs text-gray-500">{flag.frameworkName}</span>
                                                        )}
                                                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${FLAG_SEVERITY_CHIP[flag.severity]}`}>
                                                            {flag.severity}
                                                        </span>
                                                        {flag.status === 'resolved' && (
                                                            <span className="text-xs text-[var(--color-success)] font-medium flex items-center gap-0.5">
                                                                <Check className="w-3 h-3" /> Resolved
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs dash-text font-medium mt-0.5 truncate">{flag.controlTitle}</p>
                                                    <p className="text-xs dash-text-tertiary mt-0.5">{flag.reason}</p>
                                                </div>
                                                {flag.status !== 'resolved' && (
                                                    <button
                                                        onClick={() => handleResolveFlag(flag.id, alert.id)}
                                                        disabled={resolving === flag.id}
                                                        className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
                                                        {resolving === flag.id
                                                            ? <RefreshCw className="w-3 h-3 animate-spin" />
                                                            : <Check className="w-3 h-3" />}
                                                        Resolve
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : tab === 'affected' ? (
                /* ═══ Affected Content ═══ */
                <div className="space-y-3">
                    {affected.length === 0 ? (
                        <div className="dash-card rounded-2xl p-8 text-center">
                            <Shield className="w-10 h-10 mx-auto mb-3 text-[var(--color-success)]" />
                            <p className="dash-text-secondary text-sm">No content flagged for re-review</p>
                        </div>
                    ) : affected.map(item => (
                        <div key={item.contentId} className="dash-card rounded-xl p-4 border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-all group">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold dash-text text-sm">{item.title}</h4>
                                    <p className="text-xs dash-text-tertiary mt-0.5">{item.reason}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.impactLevel === 'critical' ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'}`}>
                                            {item.matchedRegulation}
                                        </span>
                                        <span className="text-xs dash-text-tertiary capitalize">{item.status.replace(/_/g, ' ')}</span>
                                    </div>
                                </div>
                                {item.recommendationId ? (
                                    <button
                                        onClick={() => setSelectedRecommendation(recommendations.find(r => r.id === item.recommendationId) ?? null)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-accent-soft)] dash-accent text-xs font-bold hover:bg-[var(--color-accent)] hover:text-white transition-all shadow-sm">
                                        <Sparkles className="w-3.5 h-3.5" />
                                        Review AI Suggestion
                                    </button>
                                ) : (
                                    <ChevronRight className="w-4 h-4 dash-text-tertiary shrink-0 group-hover:dash-accent transition-colors" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* ═══ Consultations ═══ */
                <div className="space-y-3">
                    {consultations.map(c => (
                        <div key={c.id} className={`dash-card rounded-xl p-5 border transition-colors
              ${c.status === 'closing_soon' ? 'border-amber-300 bg-[var(--color-warning-soft)]/30' :
                                c.status === 'closed' ? 'border-[var(--color-border)] opacity-60' : 'border-[var(--color-border)]'}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                    <h4 className="font-semibold dash-text text-sm">{c.title}</h4>
                                    <p className="text-xs dash-text-secondary mt-1">{c.body}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${c.status === 'open' ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' :
                                            c.status === 'closing_soon' ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]' :
                                                'bg-[var(--color-surface-alt)] text-[var(--color-text-primary)]'}`}>
                                        {c.status === 'closing_soon' ? `${c.daysRemaining}d left` :
                                            c.status === 'closed' ? 'Closed' : `${c.daysRemaining}d remaining`}
                                    </span>
                                    <p className="text-xs dash-text-tertiary mt-1">
                                        {new Date(c.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Recommendation Modal */}
            {selectedRecommendation && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-in fade-in duration-300"
                    onClick={() => setSelectedRecommendation(null)}>
                    <div className="bg-[var(--color-surface)] rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col scale-in-center"
                        onClick={e => e.stopPropagation()}>

                        {/* Header */}
                        <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface-alt)]/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-[var(--color-accent-soft)]">
                                    <Sparkles className="w-5 h-5 dash-accent" />
                                </div>
                                <div>
                                    <h3 className="font-bold dash-text text-xl">AI Compliance Mapping</h3>
                                    <p className="text-xs dash-text-tertiary">Proactive transformation draft for regulatory alignment</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedRecommendation(null)}
                                className="p-2 rounded-xl hover:bg-[var(--color-surface-alt)] transition-colors hover:rotate-90 duration-200">
                                <X className="w-6 h-6 dash-text-tertiary" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="p-5 rounded-2xl bg-[var(--color-warning-soft)]/20 border border-[var(--color-warning-soft)]">
                                <h4 className="flex items-center gap-2 font-bold dash-text text-sm mb-2">
                                    <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />
                                    Risk Impact Analysis
                                </h4>
                                <p className="text-sm dash-text-secondary leading-relaxed font-medium capitalize">
                                    {selectedRecommendation.reason}
                                </p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6 relative">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden md:block">
                                    <div className="p-2 rounded-full bg-[var(--color-accent)] shadow-lg shadow-[var(--color-accent)]/20">
                                        <ArrowRight className="w-5 h-5 text-white" />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <h5 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Baseline Content</h5>
                                    <div className="dash-card rounded-2xl p-5 border dash-border h-48 overflow-y-auto text-sm dash-text-secondary line-through opacity-60 italic">
                                        [Existing approved content...]
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <h5 className="text-[10px] font-bold uppercase tracking-widest dash-accent">AI Drafting Recommendation</h5>
                                    <div className="dash-card rounded-2xl p-5 border-2 border-[var(--color-accent)] h-48 overflow-y-auto text-sm dash-text bg-[var(--color-accent-soft)]/10 font-medium">
                                        {selectedRecommendation.suggestedChange}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl bg-slate-900 text-slate-100 p-5 shadow-inner">
                                <div className="flex items-center gap-2 mb-3">
                                    <Shield className="w-4 h-4 text-emerald-400" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Compliance Safeguards</span>
                                </div>
                                <ul className="space-y-2 text-xs text-slate-300 list-disc ml-4">
                                    <li>Automated re-queueing for Human-in-the-Loop review</li>
                                    <li>Draft matches 2026 guidelines for character-limited formats</li>
                                    <li>Embedded mandatory safety disclaimers detected</li>
                                </ul>
                            </div>
                        </div>

                        <div className="p-6 border-t border-[var(--color-border)] bg-[var(--color-surface-alt)]/30 flex items-center justify-end gap-3">
                            <button onClick={() => setSelectedRecommendation(null)}
                                className="px-5 py-2.5 rounded-xl text-sm font-semibold dash-text-secondary hover:dash-surface-alt transition-all">
                                Dismiss Recommendation
                            </button>
                            <button
                                onClick={() => handleApplyRecommendation(selectedRecommendation)}
                                disabled={applying}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-bold shadow-lg shadow-[var(--color-accent)]/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50">
                                {applying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Apply AI Transformation
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
