import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    fetchRegulatoryAlerts,
    findAffectedContent,
    getConsultationPeriods,
    type RegulatoryAlert,
    type AffectedContent,
    type ConsultationEntry,
} from '../../lib/horizonScanningService';
import {
    Radar, AlertTriangle, FileSearch, CalendarClock,
    Shield, Bell, ChevronRight, RefreshCw,
    Sparkles, ArrowRight, CheckCircle2, X
} from 'lucide-react';
import {
    fetchImpactAssessments,
    applyImpactRecommendation,
    type RegulatoryImpactAssessment
} from '../../lib/horizonScanningService';
import { logger } from '../../lib/logger';
type Tab = 'feed' | 'affected' | 'consultations';

const SEVERITY_BADGE: Record<string, string> = {
    critical: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    info: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
};

const TYPE_BADGE: Record<string, string> = {
    guidance_update: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
    enforcement_action: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
    warning_letter: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    consultation: 'bg-[var(--color-purple)]/10 text-[var(--color-purple)]',
    recall: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
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

    const load = useCallback(async () => {
        setLoading(true);
        if (tab === 'feed') {
            setAlerts(await fetchRegulatoryAlerts());
        } else if (tab === 'affected' && companyId) {
            const [aff, recs] = await Promise.all([
                findAffectedContent(companyId),
                fetchImpactAssessments(companyId)
            ]);
            setAffected(aff.map(a => {
                const rec = recs.find(r => r.contentId === a.contentId);
                return {
                    ...a,
                    recommendationId: rec?.id,
                    suggestedChange: rec?.suggestedChange,
                    impactLevel: rec?.impactLevel
                };
            }));
            setRecommendations(recs);
        } else if (tab === 'consultations') {
            setConsultations(getConsultationPeriods());
        }
        setLoading(false);
    }, [tab, companyId]);

    const handleApplyRecommendation = async (rec: RegulatoryImpactAssessment) => {
        setApplying(true);
        try {
            const success = await applyImpactRecommendation(rec.id, companyId, user?.id);
            if (success) {
                window.dispatchEvent(new CustomEvent('global-toast', {
                    detail: { message: 'AI suggestion applied and content updated successfully', type: 'success' }
                }));
                setSelectedRecommendation(null);
                load();
            }
        } catch (e) {
            logger.error(e);
            window.dispatchEvent(new CustomEvent('global-toast', {
                detail: { message: 'Failed to apply transformation', type: 'warning' }
            }));
        } finally {
            setApplying(false);
        }
    };

    useEffect(() => { load(); }, [load]);

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
                ]).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === t.id ? 'bg-[var(--color-surface)] dark:bg-[var(--color-surface)] shadow-sm dash-text' : 'dash-text-secondary hover:dash-text'}`}>
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
                    {alerts.map(alert => (
                        <div key={alert.id} className="dash-card rounded-xl p-5 border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors">
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
                                <div className="text-right shrink-0">
                                    {alert.affectedContentCount > 0 && (
                                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-[var(--color-danger-soft)] text-[var(--color-danger)] font-medium">
                                            <AlertTriangle className="w-3 h-3" />
                                            {alert.affectedContentCount} affected
                                        </span>
                                    )}
                                    <p className="text-xs dash-text-tertiary mt-1">
                                        {new Date(alert.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
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
                                        onClick={() => setSelectedRecommendation(recommendations.find(r => r.id === item.recommendationId) || null)}
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
                            {/* Analysis Card */}
                            <div className="p-5 rounded-2xl bg-[var(--color-warning-soft)]/20 border border-[var(--color-warning-soft)]">
                                <h4 className="flex items-center gap-2 font-bold dash-text text-sm mb-2">
                                    <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />
                                    Risk Impact Analysis
                                </h4>
                                <p className="text-sm dash-text-secondary leading-relaxed font-medium capitalize">
                                    {selectedRecommendation.reason}
                                </p>
                            </div>

                            {/* Comparison View */}
                            <div className="grid md:grid-cols-2 gap-6 relative">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden md:block">
                                    <div className="p-2 rounded-full bg-[var(--color-accent)] shadow-lg shadow-[var(--color-accent)]/20">
                                        <ArrowRight className="w-5 h-5 text-white" />
                                    </div>
                                </div>

                                {/* Original (Pre-AI) */}
                                <div className="space-y-3">
                                    <h5 className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Baseline Content</h5>
                                    <div className="dash-card rounded-2xl p-5 border dash-border h-48 overflow-y-auto text-sm dash-text-secondary line-through opacity-60 italic">
                                        [Existing approved content...]
                                    </div>
                                </div>

                                {/* AI Recommendation */}
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

                        {/* Footer */}
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
