// src/components/AIRisk/ImpactReportViewer.tsx
// Regulation change impact report viewer: "What will break?" display.
// Lists affected content with severity, narrative summary, and actions.

import { useState, useEffect } from 'react';
import {
    FileWarning, Shield, Eye, XCircle,
    ChevronDown, ChevronRight, RefreshCw, Sparkles,
} from 'lucide-react';
import {
    listImpactReports, dismissImpactReport,
    type ImpactReport, type AffectedItem,
} from '../../lib/impactAnalysisService';
import { logger } from '../../lib/logger';

interface ImpactReportViewerProps {
    companyId: string;
    onViewSubmission?: (submissionId: string) => void;
}

export default function ImpactReportViewer({ companyId, onViewSubmission }: ImpactReportViewerProps) {
    const [reports, setReports] = useState<ImpactReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        loadReports();
    }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadReports = async () => {
        setLoading(true);
        try {
            const data = await listImpactReports(companyId);
            setReports(data);
        } catch (err) {
            logger.error('Failed to load impact reports:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDismiss = async (reportId: string) => {
        await dismissImpactReport(reportId);
        setReports(reports.map(r => r.id === reportId ? { ...r, status: 'dismissed' } : r));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    const activeReports = reports.filter(r => r.status !== 'dismissed');
    const dismissedReports = reports.filter(r => r.status === 'dismissed');

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                        <FileWarning className="w-5 h-5 text-[var(--color-warning)]" />
                        Regulation Impact Reports
                    </h2>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        AI-generated "What will break?" analysis when regulations change
                    </p>
                </div>
                <button
                    onClick={loadReports}
                    className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-purple)] hover:bg-[var(--color-surface-alt)] rounded-lg transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {activeReports.length === 0 && dismissedReports.length === 0 && (
                <div className="text-center py-16 text-[var(--color-text-tertiary)]">
                    <Shield className="w-12 h-12 mx-auto mb-3 text-[var(--color-text-tertiary)]" />
                    <p className="text-sm font-medium">No impact reports yet</p>
                    <p className="text-xs mt-1">Reports are generated automatically when new regulations are synced.</p>
                </div>
            )}

            {/* Active Reports */}
            {activeReports.map((report) => (
                <ReportCard
                    key={report.id}
                    report={report}
                    isExpanded={expandedId === report.id}
                    onToggle={() => setExpandedId(expandedId === report.id ? null : report.id)}
                    onDismiss={() => handleDismiss(report.id)}
                    onViewSubmission={onViewSubmission}
                />
            ))}

            {/* Dismissed */}
            {dismissedReports.length > 0 && (
                <details className="mt-4">
                    <summary className="text-xs text-[var(--color-text-tertiary)] cursor-pointer hover:text-[var(--color-text-secondary)]">
                        {dismissedReports.length} dismissed report{dismissedReports.length > 1 ? 's' : ''}
                    </summary>
                    <div className="mt-2 space-y-2 opacity-60">
                        {dismissedReports.map((r) => (
                            <div key={r.id} className="bg-[var(--color-surface-alt)] rounded-lg p-3 text-xs text-[var(--color-text-secondary)]">
                                <span className="font-medium">{r.regulation_title}</span>
                                <span className="text-[var(--color-text-tertiary)] ml-2">— {r.affected_count} affected</span>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}

// ── ReportCard ───────────────────────────────────────────────────────────

function ReportCard({ report, isExpanded, onToggle, onDismiss, onViewSubmission }: {
    report: ImpactReport;
    isExpanded: boolean;
    onToggle: () => void;
    onDismiss: () => void;
    onViewSubmission?: (id: string) => void;
}) {
    const severityColors: Record<string, string> = {
        critical: 'bg-[var(--color-danger)]',
        high: 'bg-red-300',
        medium: 'bg-amber-300',
        low: 'bg-emerald-300',
    };

    return (
        <div className={`bg-[var(--color-surface)] rounded-xl border shadow-sm overflow-hidden transition-all ${report.affected_count > 10 ? 'border-[var(--color-danger)]/20' :
            report.affected_count > 0 ? 'border-[var(--color-warning)]/20' :
                'border-[var(--color-border)]'
            }`}>
            {/* Header */}
            <button
                onClick={onToggle}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--color-surface-alt)] transition-colors"
            >
                {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                    : <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                }

                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{report.regulation_title}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">
                            {new Date(report.created_at).toLocaleDateString()}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${report.affected_count > 0
                            ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
                            : 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                            }`}>
                            {report.affected_count} affected
                        </span>
                    </div>
                </div>

                {/* Risk distribution mini-bar */}
                <div className="flex gap-0.5 h-4">
                    {Object.entries(report.risk_distribution).map(([sev, count]) => (
                        <div
                            key={sev}
                            className={`w-3 rounded-sm ${severityColors[sev] || 'bg-[var(--color-surface-alt)]'}`}
                            title={`${sev}: ${count}`}
                            style={{ height: `${Math.min(100, (count as number) * 25)}%` }}
                        />
                    ))}
                </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="px-4 pb-4 border-t border-[var(--color-border)]">
                    {/* Narrative */}
                    <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Sparkles className="w-3.5 h-3.5 text-[var(--color-purple)]" />
                            <span className="text-[10px] font-semibold text-[var(--color-purple)]">AI Assessment</span>
                        </div>
                        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{report.summary_narrative}</p>
                    </div>

                    {/* Affected Items */}
                    {report.affected_items.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                            <p className="text-[10px] text-[var(--color-text-secondary)] font-medium uppercase tracking-wider">Affected Content</p>
                            {report.affected_items.map((item: AffectedItem) => (
                                <div key={item.submission_id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-[var(--color-surface-alt)]">
                                    <SeverityDot severity={item.severity} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-[var(--color-text-primary)] font-medium truncate">{item.title}</p>
                                        <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{item.reason}</p>
                                    </div>
                                    {onViewSubmission && (
                                        <button
                                            onClick={() => onViewSubmission(item.submission_id)}
                                            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-purple)] hover:bg-[var(--color-purple)]/10 rounded"
                                            title="View submission"
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="mt-3 flex gap-2 justify-end">
                        <button
                            onClick={onDismiss}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] rounded-lg transition-colors"
                        >
                            <XCircle className="w-3.5 h-3.5" /> Dismiss
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function SeverityDot({ severity }: { severity: string }) {
    const colors: Record<string, string> = {
        critical: 'bg-[var(--color-danger)]',
        high: 'bg-[var(--color-danger)]',
        medium: 'bg-[var(--color-warning)]',
        low: 'bg-[var(--color-success)]',
    };
    return (
        <div className="mt-1.5 shrink-0">
            <div className={`w-2 h-2 rounded-full ${colors[severity] || 'bg-[var(--color-border)]'}`} />
        </div>
    );
}
