// src/components/AIRisk/TrendAnalyticsDashboard.tsx
// Violation trend analytics dashboard with charts, top violations, and AI training recs.

import { useState, useEffect } from 'react';
import {
    TrendingUp, TrendingDown, Minus, Sparkles, BookOpen,
    BarChart3, AlertTriangle, GraduationCap, RefreshCw,
} from 'lucide-react';
import {
    getTrendSummary,
    type TrendSummary,
    type TrainingRecommendation,
    type TopViolation,
} from '../../lib/trendAnalyticsService';
import { logger } from '../../lib/logger';

interface TrendAnalyticsDashboardProps {
    companyId: string;
}

export default function TrendAnalyticsDashboard({ companyId }: TrendAnalyticsDashboardProps) {
    const [data, setData] = useState<TrendSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'trends' | 'recommendations'>('trends');

    useEffect(() => {
        loadData();
    }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadData = async () => {
        setLoading(true);
        try {
            const summary = await getTrendSummary(companyId);
            setData(summary);
        } catch (err) {
            logger.error('Failed to load trend data:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!data) return <p className="text-[var(--color-text-secondary)] text-center py-10">No trend data available.</p>;

    return (
        <div className="space-y-6">
            {/* Header KPIs */}
            <div className="grid grid-cols-3 gap-4">
                <KpiCard
                    label="Violations This Month"
                    value={data.totalViolationsThisMonth}
                    change={data.changeFromLastMonth}
                />
                <KpiCard
                    label="Top Categories"
                    value={data.topViolations.length}
                    subtitle="violation types"
                />
                <KpiCard
                    label="AI Recommendations"
                    value={data.recommendations.length}
                    subtitle="training areas"
                    icon={<Sparkles className="w-4 h-4 text-[var(--color-purple)]" />}
                />
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 bg-[var(--color-surface-alt)] p-1 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('trends')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'trends'
                            ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm'
                            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)]'
                        }`}
                >
                    <BarChart3 className="w-4 h-4 inline mr-1.5" />
                    Violation Trends
                </button>
                <button
                    onClick={() => setActiveTab('recommendations')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'recommendations'
                            ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm'
                            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-secondary)]'
                        }`}
                >
                    <GraduationCap className="w-4 h-4 inline mr-1.5" />
                    Training Recs
                </button>
                <button
                    onClick={loadData}
                    className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-purple)] hover:bg-[var(--color-surface-alt)] rounded-lg transition-colors"
                    title="Refresh"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Trends Tab */}
            {activeTab === 'trends' && (
                <div className="space-y-4">
                    {/* Visual Bar Chart */}
                    {data.trends.length > 0 ? (
                        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
                            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-[var(--color-purple)]" />
                                Violations by Month
                            </h3>
                            <div className="space-y-3">
                                {aggregateByMonth(data.trends).map(({ month, total, maxTotal }) => (
                                    <div key={month} className="flex items-center gap-3">
                                        <span className="text-xs text-[var(--color-text-secondary)] w-16 text-right font-mono">{month}</span>
                                        <div className="flex-1 h-6 bg-[var(--color-surface-alt)] rounded-lg overflow-hidden">
                                            <div
                                                className="h-full rounded-lg bg-gradient-to-r from-indigo-400 to-purple-500 transition-all duration-500 flex items-center justify-end pr-2"
                                                style={{ width: `${maxTotal > 0 ? (total / maxTotal) * 100 : 0}%`, minWidth: total > 0 ? '2rem' : '0' }}
                                            >
                                                {total > 0 && (
                                                    <span className="text-[10px] text-white font-bold">{total}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-[var(--color-text-tertiary)]">
                            <BarChart3 className="w-10 h-10 mx-auto mb-2 text-[var(--color-text-tertiary)]" />
                            <p className="text-sm">No violation data yet. Trends will appear after content is analyzed.</p>
                        </div>
                    )}

                    {/* Top Violation Types */}
                    {data.topViolations.length > 0 && (
                        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
                            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />
                                Top Violation Types This Month
                            </h3>
                            <div className="space-y-2">
                                {data.topViolations.map((v) => (
                                    <ViolationRow key={v.category} violation={v} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Recommendations Tab */}
            {activeTab === 'recommendations' && (
                <div className="space-y-3">
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-[var(--color-purple)]/20/50 p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="w-4 h-4 text-[var(--color-purple)]" />
                            <span className="text-sm font-semibold text-[var(--color-purple)]">AI-Powered Recommendations</span>
                        </div>
                        <p className="text-xs text-[var(--color-purple)]/70">
                            Based on your team's violation patterns, Gemini recommends these training focus areas.
                        </p>
                    </div>

                    {data.recommendations.map((rec, i) => (
                        <RecommendationCard key={i} rec={rec} index={i} />
                    ))}

                    {data.recommendations.length === 0 && (
                        <div className="text-center py-12 text-[var(--color-text-tertiary)]">
                            <BookOpen className="w-10 h-10 mx-auto mb-2 text-[var(--color-text-tertiary)]" />
                            <p className="text-sm">No recommendations yet. Analyze more content to generate insights.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Sub-Components ───────────────────────────────────────────────────────

function KpiCard({ label, value, change, subtitle, icon }: {
    label: string;
    value: number;
    change?: number;
    subtitle?: string;
    icon?: React.ReactNode;
}) {
    return (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[var(--color-text-secondary)] font-medium uppercase tracking-wider">{label}</span>
                {icon}
            </div>
            <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-[var(--color-text-primary)]">{value}</span>
                {change !== undefined && (
                    <span className={`flex items-center text-xs font-medium mb-0.5 ${change > 0 ? 'text-[var(--color-danger)]' : change < 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]'
                        }`}>
                        {change > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> :
                            change < 0 ? <TrendingDown className="w-3 h-3 mr-0.5" /> :
                                <Minus className="w-3 h-3 mr-0.5" />}
                        {Math.abs(change)}%
                    </span>
                )}
                {subtitle && <span className="text-xs text-[var(--color-text-tertiary)] mb-0.5">{subtitle}</span>}
            </div>
        </div>
    );
}

function ViolationRow({ violation }: { violation: TopViolation }) {
    const trendIcon = violation.trend === 'up'
        ? <TrendingUp className="w-3 h-3 text-[var(--color-danger)]" />
        : violation.trend === 'down'
            ? <TrendingDown className="w-3 h-3 text-[var(--color-success)]" />
            : <Minus className="w-3 h-3 text-[var(--color-text-tertiary)]" />;

    return (
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors">
            <span className="w-7 h-7 rounded-lg bg-[var(--color-warning-soft)] text-[var(--color-warning)] flex items-center justify-center text-xs font-bold">
                {violation.count}
            </span>
            <span className="text-sm text-[var(--color-text-secondary)] font-medium flex-1 capitalize">
                {violation.category.replace(/_/g, ' ')}
            </span>
            {trendIcon}
        </div>
    );
}

function RecommendationCard({ rec, index }: { rec: TrainingRecommendation; index: number }) {
    const priorityColors: Record<string, { bg: string; text: string }> = {
        high: { bg: 'bg-[var(--color-danger-soft)]', text: 'text-[var(--color-danger)]' },
        medium: { bg: 'bg-[var(--color-warning-soft)]', text: 'text-[var(--color-warning)]' },
        low: { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]' },
    };
    const pc = priorityColors[rec.priority] || priorityColors.medium;

    return (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--color-purple)] to-[var(--color-purple)] text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">{rec.title}</h4>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${pc.bg} ${pc.text} font-medium uppercase`}>
                            {rec.priority}
                        </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{rec.description}</p>
                    <p className="text-[10px] text-[var(--color-purple)] mt-1.5 font-medium">
                        Addresses: {rec.relatedViolation.replace(/_/g, ' ')}
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function aggregateByMonth(trends: TrendSummary['trends']): Array<{ month: string; total: number; maxTotal: number }> {
    const monthTotals: Record<string, number> = {};
    for (const t of trends) {
        monthTotals[t.month] = (monthTotals[t.month] || 0) + t.count;
    }

    const entries = Object.entries(monthTotals)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6);

    const maxTotal = Math.max(...entries.map(e => e[1]), 1);

    return entries.map(([month, total]) => ({ month, total, maxTotal }));
}
