import { useEffect, useState } from 'react';
import { ShieldAlert, Zap, ArrowRight, ExternalLink, AlertTriangle } from 'lucide-react';
import DashboardCard from '../ui/DashboardCard';
import { SkeletonChart } from '../ui/Skeleton';
import { getEarlyWarningAlerts, type RiskVelocityAlert } from '../../../lib/predictiveRiskService';

export default function EarlyWarningSystemWidget({ companyId }: { companyId: string }) {
    const [loading, setLoading] = useState(true);
    const [alerts, setAlerts] = useState<RiskVelocityAlert[]>([]);

    useEffect(() => {
        async function load() {
            if (!companyId) return;
            setLoading(true);
            const data = await getEarlyWarningAlerts(companyId);
            setAlerts(data);
            setLoading(false);
        }
        load();
    }, [companyId]);

    return (
        <DashboardCard className="h-[450px] flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-4 mb-6 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[var(--color-danger-soft)]">
                        <Zap className="w-5 h-5 text-[var(--color-danger)]" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold dash-text">Early Warning System</h3>
                        <p className="text-xs dash-text-secondary">AI-detected risk velocity & clusters</p>
                    </div>
                </div>
                <div className="px-2 py-0.5 rounded-full bg-[var(--color-danger)] text-white text-[9px] font-black uppercase tracking-widest animate-pulse">
                    Proactive
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0">
                {loading ? (
                    <div className="space-y-3">
                        <SkeletonChart className="h-20" />
                        <SkeletonChart className="h-20" />
                    </div>
                ) : alerts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <div className="w-12 h-12 rounded-full bg-[var(--color-success-soft)] flex items-center justify-center mb-3">
                            <ShieldAlert className="w-6 h-6 text-[var(--color-success)]" />
                        </div>
                        <h4 className="text-sm font-bold dash-text">System Normal</h4>
                        <p className="text-xs dash-text-tertiary mt-1">No anomalous risk velocity or high-density clusters detected in the current cycle.</p>
                    </div>
                ) : (
                    alerts.map((alert: RiskVelocityAlert, idx: number) => (
                        <div key={idx} className="group relative p-4 rounded-2xl border-2 border-transparent bg-[var(--color-surface-alt)]/50 hover:bg-[var(--color-surface-alt)] hover:border-[var(--color-danger-soft)] transition-all cursor-pointer">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)] shrink-0">
                                    <AlertTriangle className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-[var(--color-danger)]">
                                            {alert.alert_type.replace(/_/g, ' ')}
                                        </h4>
                                        <span className="text-[10px] dash-text-tertiary">Just Now</span>
                                    </div>
                                    <p className="text-xs font-bold dash-text mt-1">
                                        {alert.therapeutic_area} × {alert.platform}
                                    </p>
                                    <p className="text-[11px] dash-text-secondary mt-1 leading-relaxed">
                                        {alert.message}
                                    </p>
                                    <div className="flex items-center gap-4 mt-3">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-bold dash-text-tertiary">Incident Count:</span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-danger-soft)] text-[var(--color-danger)] text-[10px] font-black">
                                                {alert.count}
                                            </span>
                                        </div>
                                        <button className="flex items-center gap-1 text-[10px] font-bold dash-accent hover:underline ml-auto">
                                            Investigate <ArrowRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Decorative accent */}
                            <div className="absolute top-0 left-0 w-1 h-full bg-[var(--color-danger)] rounded-l-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    ))
                )}
            </div>

            <div className="mt-4 pt-4 border-t dash-border shrink-0">
                <button className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[var(--color-surface-alt)] border dash-border dash-text-tertiary hover:dash-text-secondary text-xs font-bold transition-all">
                    View Full Security Narrative <ExternalLink className="w-3 h-3" />
                </button>
            </div>
        </DashboardCard>
    );
}
