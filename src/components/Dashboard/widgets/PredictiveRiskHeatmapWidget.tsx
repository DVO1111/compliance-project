import { useEffect, useState } from 'react';
import { Thermometer, Info } from 'lucide-react';
import DashboardCard from '../ui/DashboardCard';
import { SkeletonChart } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { getGlobalRiskHeatmap, type RiskHeatmapPoint } from '../../../lib/predictiveRiskService';

const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'X', 'Influencer', 'Website', 'TV', 'Print'];
const THERAPEUTIC_AREAS = ['Oncology', 'Cardiovascular', 'Mental Health', 'Diabetes', 'Dermatology', 'Pediatric'];

export default function PredictiveRiskHeatmapWidget({ companyId }: { companyId: string }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<RiskHeatmapPoint[]>([]);
    const [hoveredCell, setHoveredCell] = useState<{ platform: string, area: string } | null>(null);

    useEffect(() => {
        async function load() {
            if (!companyId) return;
            setLoading(true);
            const heatmap = await getGlobalRiskHeatmap(companyId);
            setData(heatmap);
            setLoading(false);
        }
        load();
    }, [companyId]);

    const getRiskFor = (platform: string, area: string) => {
        return data.find(d =>
            d.platform.toLowerCase() === platform.toLowerCase() &&
            d.therapeutic_area.toLowerCase() === area.toLowerCase()
        );
    };

    const getHeatColor = (risk: number | undefined) => {
        if (risk === undefined) return 'var(--color-surface-alt)';
        if (risk > 80) return 'rgba(220, 38, 38, 0.9)'; // Critical
        if (risk > 60) return 'rgba(239, 68, 68, 0.7)'; // High
        if (risk > 40) return 'rgba(245, 158, 11, 0.6)'; // Medium
        if (risk > 20) return 'rgba(245, 158, 11, 0.3)'; // Low
        return 'rgba(16, 185, 129, 0.2)'; // Safe
    };

    return (
        <DashboardCard className="h-[450px] flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-4 mb-6 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[var(--color-accent-soft)]">
                        <Thermometer className="w-5 h-5 dash-accent" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold dash-text">Predictive Risk Heatmap</h3>
                        <p className="text-xs dash-text-secondary">Cross-sectional forecasting (Platform × TA)</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--color-surface-alt)] border dash-border">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-bold dash-text uppercase">Live Predictions</span>
                </div>
            </div>

            {loading ? (
                <SkeletonChart className="flex-1" />
            ) : data.length === 0 ? (
                <EmptyState message="Run a risk prediction to populate this heatmap." />
            ) : (
                <div className="flex-1 min-h-0 relative">
                    <div className="h-full flex flex-col">
                        {/* Heatmap Grid */}
                        <div className="flex-1 grid grid-cols-[80px_1fr] gap-2">
                            {/* Y-Axis Labels (Platforms) */}
                            <div className="grid grid-rows-8 gap-1">
                                {PLATFORMS.map(p => (
                                    <div key={p} className="flex items-center justify-end pr-2">
                                        <span className="text-[9px] font-bold dash-text-tertiary truncate">{p}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Main Grid */}
                            <div className="grid grid-rows-8 gap-1">
                                {PLATFORMS.map(platform => (
                                    <div key={platform} className="grid grid-cols-6 gap-1">
                                        {THERAPEUTIC_AREAS.map(area => {
                                            const riskData = getRiskFor(platform, area);
                                            return (
                                                <div
                                                    key={area}
                                                    onMouseEnter={() => setHoveredCell({ platform, area })}
                                                    onMouseLeave={() => setHoveredCell(null)}
                                                    className="rounded-md transition-all cursor-pointer relative group"
                                                    style={{ backgroundColor: getHeatColor(riskData?.avg_risk) }}
                                                >
                                                    {riskData && riskData.avg_risk > 60 && (
                                                        <div className="absolute inset-0 flex items-center justify-center opacity-40">
                                                            <div className="w-1 h-1 rounded-full bg-white animate-ping" />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* X-Axis Labels (TAs) */}
                        <div className="grid grid-cols-[80px_1fr] gap-2 mt-2">
                            <div />
                            <div className="grid grid-cols-6 gap-1">
                                {THERAPEUTIC_AREAS.map(area => (
                                    <div key={area} className="text-center">
                                        <span className="text-[9px] font-bold dash-text-tertiary block rotate-[-15deg] whitespace-nowrap">{area}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Popover Detail */}
                    {hoveredCell && (
                        <div className="absolute bottom-4 right-4 dash-card border-[3px] border-[var(--color-accent)] rounded-2xl p-4 shadow-2xl w-56 animate-in slide-in-from-bottom-2 duration-200 z-10 bg-[var(--color-surface)]">
                            <div className="flex items-center gap-2 mb-3">
                                <Info className="w-4 h-4 dash-accent" />
                                <span className="text-[10px] font-bold uppercase tracking-widest dash-text">Quadrant Snapshot</span>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="dash-text-tertiary">Segment</span>
                                    <span className="font-bold dash-text">{hoveredCell.area}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="dash-text-tertiary">Channel</span>
                                    <span className="font-bold dash-text">{hoveredCell.platform}</span>
                                </div>
                                <div className="h-px bg-[var(--color-border)] my-2" />
                                {getRiskFor(hoveredCell.platform, hoveredCell.area) ? (
                                    <>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs dash-text-tertiary">Avg Risk</span>
                                            <span className={`text-sm font-black ${getRiskFor(hoveredCell.platform, hoveredCell.area)!.avg_risk > 70 ? 'text-[var(--color-danger)]' : 'dash-accent'}`}>
                                                {getRiskFor(hoveredCell.platform, hoveredCell.area)!.avg_risk}%
                                            </span>
                                        </div>
                                        <p className="text-[9px] dash-text-tertiary italic leading-tight mt-1">
                                            Based on {getRiskFor(hoveredCell.platform, hoveredCell.area)!.sample_size} historical data points.
                                        </p>
                                    </>
                                ) : (
                                    <span className="text-[10px] dash-text-tertiary italic">No prediction data available for this segment.</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </DashboardCard>
    );
}
