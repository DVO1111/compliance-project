// src/components/AIRisk/BenchmarkScorecard.tsx
// Anonymized compliance benchmark scorecard.
// Shows percentile ranking, gauge, and per-category comparison bars.

import { useState, useEffect } from 'react';
import {
    Trophy, BarChart3, RefreshCw, Globe,
} from 'lucide-react';
import {
    getPercentileRank, getIndustryAverages,
    type BenchmarkScore, type IndustryAverage,
} from '../../lib/benchmarkService';
import { logger } from '../../lib/logger';

interface BenchmarkScorecardProps {
    companyId: string;
}

export default function BenchmarkScorecard({ companyId }: BenchmarkScorecardProps) {
    const [score, setScore] = useState<BenchmarkScore | null>(null);
    const [industryAvgs, setIndustryAvgs] = useState<IndustryAverage[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadData = async () => {
        setLoading(true);
        try {
            const [s, avgs] = await Promise.all([
                getPercentileRank(companyId),
                getIndustryAverages(),
            ]);
            setScore(s);
            setIndustryAvgs(avgs);
        } catch (err) {
            logger.error('Failed to load benchmark:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!score) return <p className="text-[var(--color-text-secondary)] text-center py-10">No benchmark data available.</p>;

    const percentile = Math.round(score.overall);
    const isTop = percentile >= 75;
    const isGood = percentile >= 50;

    return (
        <div className="space-y-6">
            {/* Headline Card */}
            <div className={`rounded-2xl p-6 text-center relative overflow-hidden ${isTop ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                isGood ? 'bg-gradient-to-br from-[var(--color-purple)] to-[var(--color-purple)]' :
                    'bg-gradient-to-br from-amber-500 to-orange-600'
                }`}>
                {/* Decorative circles */}
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10" />
                <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/10" />

                <div className="relative z-10">
                    <Trophy className="w-8 h-8 text-white/80 mx-auto mb-3" />
                    <p className="text-white/70 text-sm font-medium mb-1">Compliance Performance</p>
                    <div className="flex items-end justify-center gap-1">
                        <span className="text-5xl font-bold text-white">{percentile}</span>
                        <span className="text-white/70 text-lg font-medium mb-1">th</span>
                    </div>
                    <p className="text-white/80 text-sm mt-1">percentile across all tenants</p>

                    {/* Gauge */}
                    <div className="mt-4 w-48 mx-auto">
                        <div className="w-full h-2.5 bg-white/20 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full bg-[var(--color-surface)] transition-all duration-700"
                                style={{ width: `${percentile}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[9px] text-white/50 mt-1">
                            <span>0</span>
                            <span>50</span>
                            <span>100</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3">
                <StatCard label="Total Submissions" value={score.totalSubmissions} />
                <StatCard label="Compliant Rate" value={`${score.compliantRate}%`} />
                <StatCard label="Avg Risk Score" value={score.avgRiskScore.toFixed(1)} />
            </div>

            {/* Category Scores */}
            {Object.keys(score.categoryScores).length > 0 && (
                <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-[var(--color-purple)]" />
                        Category Performance
                    </h3>
                    <div className="space-y-3">
                        {Object.entries(score.categoryScores)
                            .sort((a, b) => b[1] - a[1])
                            .map(([category, catScore]) => (
                                <div key={category}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-[var(--color-text-secondary)] capitalize">
                                            {category.replace(/_/g, ' ')}
                                        </span>
                                        <span className={`text-xs font-semibold ${catScore >= 80 ? 'text-[var(--color-success)]' :
                                            catScore >= 50 ? 'text-[var(--color-warning)]' :
                                                'text-[var(--color-danger)]'
                                            }`}>
                                            {catScore}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-[var(--color-surface-alt)] rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${catScore >= 80 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
                                                catScore >= 50 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                                    'bg-gradient-to-r from-red-400 to-red-500'
                                                }`}
                                            style={{ width: `${catScore}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* Industry Averages */}
            {industryAvgs.length > 0 && (
                <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-[var(--color-purple)]" />
                        Industry Averages (anonymized)
                    </h3>
                    <div className="space-y-2">
                        {industryAvgs.map((avg) => (
                            <div key={avg.industry} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--color-surface-alt)]">
                                <span className="text-xs text-[var(--color-text-secondary)] capitalize flex-1 font-medium">
                                    {avg.industry.replace(/_/g, ' ')}
                                </span>
                                <span className="text-[10px] text-[var(--color-text-tertiary)]">{avg.companyCount} co.</span>
                                <span className={`text-xs font-semibold ${avg.compliantRate >= 80 ? 'text-[var(--color-success)]' :
                                    avg.compliantRate >= 50 ? 'text-[var(--color-warning)]' :
                                        'text-[var(--color-danger)]'
                                    }`}>
                                    {avg.compliantRate}% compliant
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Refresh */}
            <div className="flex justify-center">
                <button
                    onClick={loadData}
                    className="flex items-center gap-2 px-4 py-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-purple)] hover:bg-[var(--color-purple)]/10 rounded-lg transition-colors"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Recalculate benchmark
                </button>
            </div>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3 text-center">
            <p className="text-[10px] text-[var(--color-text-secondary)] font-medium uppercase tracking-wider">{label}</p>
            <p className="text-lg font-bold text-[var(--color-text-primary)] mt-0.5">{value}</p>
        </div>
    );
}
