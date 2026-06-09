import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    getOSComplianceReport,
    type OSComplianceReport,
    type DomainScore,
} from '../../lib/complianceOSReportService';
import {
    Activity, AlertTriangle, CheckCircle2, Clock, XCircle,
    FlaskConical, GitMerge, BookMarked, ShieldCheck, FileText,
    TrendingUp, RefreshCw, ChevronRight,
} from 'lucide-react';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function scoreColor(score: number) {
    if (score >= 75) return 'text-[var(--color-success)]';
    if (score >= 50) return 'text-[var(--color-warning)]';
    return 'text-[var(--color-danger)]';
}

function scoreBg(score: number) {
    if (score >= 75) return 'bg-[var(--color-success-soft)] border-[var(--color-success)]/30';
    if (score >= 50) return 'bg-[var(--color-warning-soft)] border-[var(--color-warning)]/30';
    return 'bg-[var(--color-danger-soft)] border-[var(--color-danger)]/30';
}

function scoreBar(score: number) {
    if (score >= 75) return 'bg-[var(--color-success)]';
    if (score >= 50) return 'bg-[var(--color-warning)]';
    return 'bg-[var(--color-danger)]';
}

function statusDot(status: DomainScore['status']) {
    if (status === 'good')     return 'bg-[var(--color-success)]';
    if (status === 'warning')  return 'bg-[var(--color-warning)]';
    return 'bg-[var(--color-danger)]';
}

const DOMAIN_ICONS: Record<string, React.ElementType> = {
    'Batch Release':     FlaskConical,
    'Change Control':    GitMerge,
    'Document Control':  BookMarked,
    'CAPA & Deviations': AlertTriangle,
    'GRC Controls':      ShieldCheck,
    'Content Review':    FileText,
};

/* ── Sub-components ──────────────────────────────────────────────────────── */

function StatCard({ label, value, sub, icon: Icon, color }: {
    label: string; value: string | number; sub?: string;
    icon: React.ElementType; color: string;
}) {
    return (
        <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
                <Icon size={16} className={color} />
                <span className="text-xs font-bold uppercase tracking-widest dash-text-tertiary">{label}</span>
            </div>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs dash-text-secondary mt-1">{sub}</p>}
        </div>
    );
}

function DomainCard({ d }: { d: DomainScore }) {
    const Icon = DOMAIN_ICONS[d.domain] ?? Activity;
    return (
        <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${statusDot(d.status)}`} />
                    <Icon size={15} className="dash-text-secondary" />
                    <span className="text-sm font-semibold dash-text">{d.domain}</span>
                </div>
                <span className={`text-xl font-black ${scoreColor(d.score)}`}>{d.score}</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-border)] overflow-hidden mb-3">
                <div className={`h-full rounded-full transition-all ${scoreBar(d.score)}`} style={{ width: `${d.score}%` }} />
            </div>
            {d.issues.length > 0 ? (
                <ul className="space-y-1">
                    {d.issues.map((iss, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs dash-text-secondary">
                            <ChevronRight size={11} className="mt-0.5 flex-shrink-0 text-[var(--color-warning)]" />
                            {iss}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-xs text-[var(--color-success)] flex items-center gap-1">
                    <CheckCircle2 size={11} /> No issues detected
                </p>
            )}
        </div>
    );
}

function SectionHeading({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
    return (
        <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                <Icon size={16} className="text-[var(--color-accent)]" />
            </div>
            <div>
                <h3 className="font-bold dash-text">{title}</h3>
                {sub && <p className="text-xs dash-text-secondary">{sub}</p>}
            </div>
        </div>
    );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="flex items-center justify-between py-2 border-b dash-border last:border-0">
            <span className="text-sm dash-text-secondary">{label}</span>
            <span className={`text-sm font-bold ${color}`}>{value}</span>
        </div>
    );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function ComplianceReportingPage() {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id ?? '';

    const [report, setReport] = useState<OSComplianceReport | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        const r = await getOSComplianceReport(companyId);
        setReport(r);
        setLoading(false);
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-64 rounded-lg bg-[var(--color-surface-alt)] animate-pulse" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-32 rounded-2xl bg-[var(--color-surface-alt)] animate-pulse" />
                    ))}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-40 rounded-2xl bg-[var(--color-surface-alt)] animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (!report) return null;

    const { batch, changeControl, sop, capa, grc, content } = report;

    const totalChangeControl = changeControl.draft + changeControl.pendingApproval + changeControl.approved + changeControl.implementing + changeControl.closed + changeControl.rejected;
    const hasSopData = sop.effective + sop.inReview + sop.draft + sop.overdueReview > 0;

    // Only show domain cards for modules this company actually uses
    const visibleDomains = report.domainScores.filter(d => {
        if (d.domain === 'Batch Release')     return batch.total > 0;
        if (d.domain === 'Change Control')    return totalChangeControl > 0;
        if (d.domain === 'Document Control')  return hasSopData;
        if (d.domain === 'CAPA & Deviations') return capa.total > 0;
        if (d.domain === 'Content Review')    return content.total > 0;
        return true; // GRC Controls and any custom domains always shown
    });

    const grade =
        report.overallScore >= 90 ? 'A' :
        report.overallScore >= 75 ? 'B' :
        report.overallScore >= 60 ? 'C' :
        report.overallScore >= 45 ? 'D' : 'F';

    return (
        <div className="space-y-8">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                            <Activity size={20} className="text-[var(--color-accent)]" />
                        </div>
                        <h2 className="text-2xl font-bold dash-text">Compliance OS Report</h2>
                    </div>
                    <p className="text-sm dash-text-secondary ml-12">
                        Organisation-wide compliance health across all modules
                    </p>
                </div>
                <button onClick={load}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border dash-border dash-card hover:border-[var(--color-accent)] transition-colors">
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* ── Overall score + KPIs ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

                {/* Score gauge */}
                <div className={`dash-card border rounded-2xl p-6 text-center shadow-sm col-span-2 lg:col-span-1 ${scoreBg(report.overallScore)}`}>
                    <p className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-3">Overall Score</p>
                    <p className={`text-6xl font-black ${scoreColor(report.overallScore)}`}>{grade}</p>
                    <p className={`text-2xl font-bold mt-1 ${scoreColor(report.overallScore)}`}>
                        {report.overallScore}<span className="text-sm font-normal">/100</span>
                    </p>
                    <p className="text-xs dash-text-tertiary mt-2">
                        Last updated {new Date(report.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>

                <StatCard label="Critical Issues" value={report.criticalIssues}
                    sub="Held batches, overdue CAPAs, overdue SOPs"
                    icon={AlertTriangle}
                    color={report.criticalIssues > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'} />

                <StatCard label="Open Actions" value={report.openActions}
                    sub="Pending approvals, open CAPAs, batches in QC"
                    icon={Clock}
                    color={report.openActions > 5 ? 'text-[var(--color-warning)]' : 'text-[var(--color-info)]'} />

                <StatCard label="GRC Compliance" value={`${grc.complianceRate}%`}
                    sub={`${grc.implemented} of ${grc.total} controls implemented`}
                    icon={ShieldCheck}
                    color={scoreColor(grc.complianceRate)} />
            </div>

            {/* ── Domain score cards ───────────────────────────────────────── */}
            <div>
                <SectionHeading icon={TrendingUp} title="Compliance by Domain" sub="Score 0–100 per module; issues requiring attention listed below each score" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleDomains.length > 0
                        ? visibleDomains.map(d => <DomainCard key={d.domain} d={d} />)
                        : <p className="text-sm dash-text-tertiary col-span-full text-center py-4">No module data yet — start using modules to see domain scores.</p>
                    }
                </div>
            </div>

            {/* ── Manufacturing & Quality — only shown when this company has batch or change data ── */}
            {(batch.total > 0 || totalChangeControl > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {batch.total > 0 && (
                        <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                            <SectionHeading icon={FlaskConical} title="Batch Release" sub="Production batch QC and release status" />
                            <div className="space-y-1">
                                <Pill label="Released" value={batch.released} color="text-[var(--color-success)]" />
                                <Pill label="QC In Progress" value={batch.qcInProgress} color="text-[var(--color-info)]" />
                                <Pill label="QC Pending" value={batch.qcPending} color="text-[var(--color-warning)]" />
                                <Pill label="On Hold" value={batch.onHold} color="text-[var(--color-danger)]" />
                                <Pill label="Rejected" value={batch.rejected} color="text-[var(--color-danger)]" />
                            </div>
                            <div className="mt-4 pt-4 border-t dash-border grid grid-cols-2 gap-3 text-center">
                                <div>
                                    <p className="text-xs dash-text-tertiary uppercase tracking-widest">Release Rate</p>
                                    <p className={`text-xl font-bold mt-0.5 ${scoreColor(batch.releaseRate)}`}>{batch.releaseRate}%</p>
                                </div>
                                <div>
                                    <p className="text-xs dash-text-tertiary uppercase tracking-widest">Hold Rate</p>
                                    <p className={`text-xl font-bold mt-0.5 ${batch.holdRate > 10 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>{batch.holdRate}%</p>
                                </div>
                            </div>
                        </div>
                    )}
                    {totalChangeControl > 0 && (
                        <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                            <SectionHeading icon={GitMerge} title="Change Control" sub="Formal change approval workflow status" />
                            <div className="space-y-1">
                                <Pill label="Draft" value={changeControl.draft} color="dash-text-secondary" />
                                <Pill label="Pending Approval" value={changeControl.pendingApproval} color="text-[var(--color-warning)]" />
                                <Pill label="Approved" value={changeControl.approved} color="text-[var(--color-info)]" />
                                <Pill label="Implementing" value={changeControl.implementing} color="text-[var(--color-accent)]" />
                                <Pill label="Closed" value={changeControl.closed} color="text-[var(--color-success)]" />
                                <Pill label="Rejected" value={changeControl.rejected} color="text-[var(--color-danger)]" />
                            </div>
                            {changeControl.avgDaysOpen > 0 && (
                                <div className="mt-4 pt-4 border-t dash-border text-center">
                                    <p className="text-xs dash-text-tertiary uppercase tracking-widest">Avg Days to Close</p>
                                    <p className={`text-xl font-bold mt-0.5 ${changeControl.avgDaysOpen > 30 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}`}>
                                        {changeControl.avgDaysOpen}d
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Document Control & CAPA — only shown when data exists ────── */}
            {(hasSopData || capa.total > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {hasSopData && (
                        <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                            <SectionHeading icon={BookMarked} title="Document Control (SOPs)" sub="SOP lifecycle and review currency" />
                            <div className="space-y-1">
                                <Pill label="Effective" value={sop.effective} color="text-[var(--color-success)]" />
                                <Pill label="In Review" value={sop.inReview} color="text-[var(--color-info)]" />
                                <Pill label="Draft" value={sop.draft} color="dash-text-secondary" />
                            </div>
                            <div className="mt-4 pt-4 border-t dash-border grid grid-cols-2 gap-3 text-center">
                                <div>
                                    <p className="text-xs dash-text-tertiary uppercase tracking-widest">Overdue Review</p>
                                    <p className={`text-xl font-bold mt-0.5 ${sop.overdueReview > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                                        {sop.overdueReview}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs dash-text-tertiary uppercase tracking-widest">Due in 30 Days</p>
                                    <p className={`text-xl font-bold mt-0.5 ${sop.expiringIn30 > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}`}>
                                        {sop.expiringIn30}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    {capa.total > 0 && (
                        <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                            <SectionHeading icon={AlertTriangle} title="CAPA & Deviations" sub="Corrective and preventive action tracking" />
                            <div className="space-y-1">
                                <Pill label="Open" value={capa.open} color="text-[var(--color-warning)]" />
                                <Pill label="Under Investigation" value={capa.investigating} color="text-[var(--color-info)]" />
                                <Pill label="In Progress" value={capa.inProgress} color="text-[var(--color-accent)]" />
                                <Pill label="Overdue" value={capa.overdue} color="text-[var(--color-danger)]" />
                                <Pill label="Closed" value={capa.closed} color="text-[var(--color-success)]" />
                            </div>
                            <div className="mt-4 pt-4 border-t dash-border grid grid-cols-2 gap-3 text-center">
                                <div>
                                    <p className="text-xs dash-text-tertiary uppercase tracking-widest">Overdue Rate</p>
                                    <p className={`text-xl font-bold mt-0.5 ${capa.overdueRate > 10 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                                        {capa.overdueRate}%
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs dash-text-tertiary uppercase tracking-widest">Avg Days to Close</p>
                                    <p className={`text-xl font-bold mt-0.5 ${capa.avgDaysToClose > 30 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}`}>
                                        {capa.avgDaysToClose > 0 ? `${capa.avgDaysToClose}d` : '—'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── GRC + Content ────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* GRC Controls */}
                <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                    <SectionHeading icon={ShieldCheck} title="GRC Controls" sub="Framework control implementation status" />
                    {grc.total === 0 ? (
                        <p className="text-sm dash-text-tertiary text-center py-4">No controls configured</p>
                    ) : (
                        <>
                            <div className="space-y-1">
                                <Pill label="Implemented" value={grc.implemented} color="text-[var(--color-success)]" />
                                <Pill label="Partially Implemented" value={grc.partial} color="text-[var(--color-warning)]" />
                                <Pill label="Active (not yet impl.)" value={grc.active} color="text-[var(--color-info)]" />
                                <Pill label="Not Implemented" value={grc.notImplemented} color="text-[var(--color-danger)]" />
                            </div>
                            <div className="mt-4 pt-4 border-t dash-border">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs dash-text-tertiary uppercase tracking-widest">Implementation Rate</p>
                                    <p className={`text-sm font-bold ${scoreColor(grc.complianceRate)}`}>{grc.complianceRate}%</p>
                                </div>
                                <div className="h-2.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                                    <div className={`h-full rounded-full ${scoreBar(grc.complianceRate)}`} style={{ width: `${grc.complianceRate}%` }} />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Content Review */}
                <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                    <SectionHeading icon={FileText} title="Content & Marketing Review" sub="Promotional content compliance review pipeline" />
                    {content.total === 0 ? (
                        <p className="text-sm dash-text-tertiary text-center py-4">No submissions yet</p>
                    ) : (
                        <>
                            <div className="space-y-1">
                                <Pill label="Approved" value={content.approved} color="text-[var(--color-success)]" />
                                <Pill label="Pending Review" value={content.pending} color="text-[var(--color-warning)]" />
                                <Pill label="Rejected" value={content.rejected} color="text-[var(--color-danger)]" />
                            </div>
                            <div className="mt-4 pt-4 border-t dash-border grid grid-cols-2 gap-3 text-center">
                                <div>
                                    <p className="text-xs dash-text-tertiary uppercase tracking-widest">Approval Rate</p>
                                    <p className={`text-xl font-bold mt-0.5 ${scoreColor(content.approvalRate)}`}>{content.approvalRate}%</p>
                                </div>
                                <div>
                                    <p className="text-xs dash-text-tertiary uppercase tracking-widest">Avg Turnaround</p>
                                    <p className="text-xl font-bold mt-0.5 text-[var(--color-info)]">
                                        {content.avgTurnaroundHrs > 0 ? `${content.avgTurnaroundHrs}h` : '—'}
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Issues summary ───────────────────────────────────────────── */}
            {visibleDomains.some(d => d.issues.length > 0) && (
                <div className="dash-card border dash-border rounded-2xl p-6 shadow-sm">
                    <SectionHeading icon={XCircle} title="Issues Requiring Attention"
                        sub="All open compliance issues across domains" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                        {visibleDomains.flatMap(d =>
                            d.issues.map((iss, i) => (
                                <div key={`${d.domain}-${i}`} className="flex items-start gap-2 py-2 border-b dash-border last:border-0">
                                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${statusDot(d.status)}`} />
                                    <div>
                                        <span className="text-xs font-bold dash-text-tertiary">{d.domain} — </span>
                                        <span className="text-sm dash-text">{iss}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}
