import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3, Shield, AlertTriangle, CheckCircle, HelpCircle,
    ArrowUpRight, Download, RefreshCw, FileText, Link2, ExternalLink
} from 'lucide-react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { getFrameworks, type GrcFramework } from '../../lib/grc/grcFrameworkService';
import {
    getFrameworkPosture,
    exportPostureToCSV,
    type FrameworkPosture
} from '../../lib/grc/grcDashboardService';
import DashboardCard from '../Dashboard/ui/DashboardCard';
import { SkeletonChart } from '../Dashboard/ui/Skeleton';
import { logger } from '../../lib/logger';

export default function GrcDashboardPage() {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id;

    const [frameworks, setFrameworks] = useState<GrcFramework[]>([]);
    const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>('');
    const [posture, setPosture] = useState<FrameworkPosture | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        if (companyId) loadInitialData();
    }, [companyId]);

    const loadInitialData = async () => {
        try {
            const fds = await getFrameworks(companyId);
            setFrameworks(fds);
            if (fds.length > 0) {
                setSelectedFrameworkId(fds[0].id);
            } else {
                setLoading(false);
            }
        } catch (err) {
            logger.error('Failed to load frameworks:', err);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedFrameworkId && companyId) {
            loadPosture();
        }
    }, [selectedFrameworkId, companyId]);

    const loadPosture = async () => {
        setLoading(true);
        try {
            const data = await getFrameworkPosture(selectedFrameworkId, companyId);
            setPosture(data);
        } catch (err) {
            logger.error('Failed to load posture:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        if (!selectedFrameworkId || !companyId || !posture) return;
        const fw = frameworks.find(f => f.id === selectedFrameworkId);
        if (!fw) return;

        setExporting(true);
        try {
            await exportPostureToCSV(selectedFrameworkId, companyId, fw.name);
        } catch (err) {
            logger.error('Export failed:', err);
        } finally {
            setExporting(false);
        }
    };

    const selectedFrameworkName = useMemo(() =>
        frameworks.find(f => f.id === selectedFrameworkId)?.name || 'Select Framework',
        [frameworks, selectedFrameworkId]);

    if (frameworks.length === 0 && !loading) {
        return (
            <div className="flex flex-col items-center justify-center h-96 p-8 dash-card rounded-2xl border dash-border shadow-sm ring-1 ring-black/5">
                <Shield className="w-16 h-16 dash-text-tertiary mb-4 opacity-20" />
                <h3 className="text-xl font-bold dash-text">No Frameworks Found</h3>
                <p className="dash-text-secondary mt-2 text-center max-w-md">
                    You need to add a compliance framework and link controls before you can see your posture dashboard.
                </p>
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'grc-frameworks' } }))}
                    className="mt-6 px-6 py-2.5 bg-behance-blue text-white rounded-xl font-semibold shadow-lg hover:bg-blue-600 transition-all active:scale-95"
                >
                    Manage Frameworks
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header & Filter */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold dash-text flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 dash-accent" /> GRC Posture Dashboard
                    </h2>
                    <p className="text-sm dash-text-secondary mt-1">
                        Real-time compliance status for <span className="font-semibold dash-text">{selectedFrameworkName}</span>
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <select
                            value={selectedFrameworkId}
                            onChange={(e) => setSelectedFrameworkId(e.target.value)}
                            className="pl-4 pr-10 py-2.5 rounded-xl border dash-border bg-[var(--color-surface)] dash-text text-sm font-medium focus:ring-2 focus:ring-behance-blue outline-none transition-all cursor-pointer shadow-sm hover:border-behance-blue"
                        >
                            {frameworks.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={handleExport}
                        disabled={exporting || loading}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border dash-border dash-text text-sm font-semibold hover:bg-[var(--color-surface-alt)] transition-all disabled:opacity-50 shadow-sm"
                    >
                        {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {exporting ? 'Exporting...' : 'Export Posture'}
                    </button>
                </div>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <KpiCard
                    label="Total Controls"
                    value={posture?.metrics.totalControls ?? 0}
                    icon={<Shield className="w-5 h-5" />}
                    loading={loading}
                />
                <KpiCard
                    label="Compliant"
                    value={posture?.metrics.compliantCount ?? 0}
                    icon={<CheckCircle className="w-5 h-5 text-emerald-500" />}
                    loading={loading}
                    color="emerald"
                />
                <KpiCard
                    label="Non-Compliant"
                    value={posture?.metrics.nonCompliantCount ?? 0}
                    icon={<AlertTriangle className="w-5 h-5 text-rose-500" />}
                    loading={loading}
                    color="rose"
                />
                <KpiCard
                    label="Missing Evidence"
                    value={posture?.metrics.missingEvidenceCount ?? 0}
                    icon={<HelpCircle className="w-5 h-5 text-amber-500" />}
                    loading={loading}
                    color="amber"
                />
                <KpiCard
                    label="Coverage %"
                    value={`${posture?.metrics.evidenceCoveragePercent ?? 0}%`}
                    icon={<ArrowUpRight className="w-5 h-5 text-behance-blue" />}
                    loading={loading}
                    color="blue"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DashboardCard className="h-[400px]">
                    <h3 className="text-sm font-bold uppercase tracking-widest dash-text-tertiary mb-6">Snapshot Status Distribution</h3>
                    {loading ? <SkeletonChart className="h-full" /> : (
                        <div className="h-full flex flex-col sm:flex-row items-center">
                            <div className="flex-1 w-full h-[250px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={posture?.snapshotDistribution || []}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="count"
                                            nameKey="status"
                                        >
                                            {posture?.snapshotDistribution.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip
                                            contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px' }}
                                            itemStyle={{ color: 'var(--color-text-primary)', fontSize: '12px' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex flex-col gap-3 px-4 py-2 min-w-[200px]">
                                {posture?.snapshotDistribution.map((s, i) => (
                                    <div key={i} className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                                            <span className="text-xs dash-text-secondary">{s.status}</span>
                                        </div>
                                        <span className="text-xs font-bold dash-text">{s.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </DashboardCard>

                <DashboardCard className="h-[400px]">
                    <h3 className="text-sm font-bold uppercase tracking-widest dash-text-tertiary mb-6">Evidence Coverage</h3>
                    {loading ? <SkeletonChart className="h-full" /> : (
                        <div className="h-full">
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={posture?.evidenceDistribution || []}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} />
                                    <YAxis hide />
                                    <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px' }} />
                                    <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={40}>
                                        {posture?.evidenceDistribution.map((entry, index) => (
                                            <Cell key={index} fill={index === 0 ? '#2943D6' : '#9CA3AF'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                            <div className="mt-4 flex justify-center gap-8">
                                <div className="text-center">
                                    <p className="text-2xl font-bold dash-text">{posture?.metrics.evidenceCoveragePercent}%</p>
                                    <p className="text-[10px] uppercase tracking-wider dash-text-tertiary">Current Coverage</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-bold dash-text">{posture?.metrics.totalControls}</p>
                                    <p className="text-[10px] uppercase tracking-wider dash-text-tertiary">Total Controls</p>
                                </div>
                            </div>
                        </div>
                    )}
                </DashboardCard>
            </div>

            {/* Tables Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Top Risk Controls */}
                <DashboardCard className="lg:col-span-2 min-h-[500px]">
                    <h3 className="text-sm font-bold uppercase tracking-widest dash-text-tertiary mb-4 flex items-center justify-between">
                        Top Risk Controls
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'grc-controls' } }))}
                            className="text-[10px] font-bold text-behance-blue hover:underline underline-offset-2 flex items-center gap-1"
                        >
                            View All <ArrowUpRight className="w-3 h-3" />
                        </button>
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b dash-border">
                                    <th className="py-3 px-2 text-[10px] uppercase tracking-wider dash-text-tertiary font-bold">Control</th>
                                    <th className="py-3 px-2 text-[10px] uppercase tracking-wider dash-text-tertiary font-bold">Owner</th>
                                    <th className="py-3 px-2 text-[10px] uppercase tracking-wider dash-text-tertiary font-bold">Snapshot</th>
                                    <th className="py-3 px-2 text-[10px] uppercase tracking-wider dash-text-tertiary font-bold">Evidence</th>
                                    <th className="py-3 px-2"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y dash-border">
                                {loading ? (
                                    [1, 2, 3, 4, 5].map(i => <tr key={i}><td colSpan={5} className="py-4"><div className="h-8 bg-[var(--color-surface-alt)] animate-pulse rounded-lg" /></td></tr>)
                                ) : posture?.topRiskControls.map(c => (
                                    <tr key={c.id} className="group hover:bg-[var(--color-surface-alt)]/50 transition-colors">
                                        <td className="py-3 px-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-alt)] dash-text-secondary border dash-border">{c.reference_code}</span>
                                                <span className="text-sm font-medium dash-text truncate max-w-[180px]">{c.title}</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-2 text-xs dash-text-secondary">{c.owner_name || 'Unassigned'}</td>
                                        <td className="py-3 px-2">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${c.snapshot_status === 'compliant' ? 'bg-emerald-500/10 text-emerald-500' :
                                                    c.snapshot_status === 'non_compliant' ? 'bg-rose-500/10 text-rose-500' :
                                                        c.snapshot_status === 'partial' ? 'bg-amber-500/10 text-amber-500' :
                                                            'bg-gray-500/10 text-gray-500'
                                                }`}>
                                                {c.snapshot_status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="py-3 px-2">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${c.evidence_status === 'ok' ? 'bg-emerald-500/10 text-emerald-500' :
                                                    c.evidence_status === 'missing' ? 'bg-rose-500/10 text-rose-500' :
                                                        c.evidence_status === 'expired' ? 'bg-amber-500/10 text-amber-500' :
                                                            'bg-gray-500/10 text-gray-400'
                                                }`}>
                                                {c.evidence_status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-2 text-right">
                                            <button
                                                onClick={() => {
                                                    localStorage.setItem('grc_open_control_id', c.id);
                                                    window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'grc-controls' } }));
                                                }}
                                                className="p-1.5 rounded-lg hover:bg-behance-blue/10 text-behance-blue opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </DashboardCard>

                {/* Recent Activity */}
                <DashboardCard className="min-h-[500px]">
                    <h3 className="text-sm font-bold uppercase tracking-widest dash-text-tertiary mb-4 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" /> Recent Activity
                    </h3>
                    <div className="space-y-4">
                        {loading ? (
                            [1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-[var(--color-surface-alt)] animate-pulse rounded-xl" />)
                        ) : posture?.recentActivity.length === 0 ? (
                            <div className="text-center py-20 opacity-40">
                                <FileText className="w-8 h-8 mx-auto mb-2" />
                                <p className="text-sm">No recent activity</p>
                            </div>
                        ) : posture?.recentActivity.map(act => (
                            <div key={act.id} className="relative pl-4 border-l-2 border-behance-blue/20 py-1">
                                <div className="flex items-start justify-between">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold dash-text truncate">{act.submission_title}</p>
                                        <p className="text-[10px] dash-text-secondary mt-0.5 flex items-center gap-1">
                                            <Link2 className="w-3 h-3" /> linked to <span className="font-medium">{act.control_ref || act.control_title}</span>
                                        </p>
                                        <p className="text-[9px] dash-text-tertiary mt-1 uppercase font-bold">{new Date(act.linked_at).toLocaleDateString()} by {act.linked_by_name}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </DashboardCard>
            </div>
        </div>
    );
}

function KpiCard({ label, value, icon, loading, color }: { label: string; value: string | number; icon: React.ReactNode; loading: boolean; color?: string }) {
    const colorMap: any = {
        emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        rose: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
        amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
        blue: 'bg-blue-500/10 text-behance-blue border-blue-500/20',
        default: 'bg-[var(--color-surface-alt)] dash-text-tertiary border-transparent'
    };

    return (
        <div className={`p-4 dash-card rounded-2xl border ${loading ? 'bg-[var(--color-surface-alt)] animate-pulse border-transparent' : 'bg-[var(--color-surface)] dash-border'} shadow-sm flex flex-col items-center text-center transition-all hover:shadow-md h-full ring-1 ring-black/5`}>
            <div className={`p-2.5 rounded-xl mb-3 shrink-0 ${color ? colorMap[color] : colorMap.default}`}>
                {icon}
            </div>
            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary mb-1">{label}</p>
                <p className="text-xl font-black dash-text truncate w-full">{loading ? '...' : value}</p>
            </div>
        </div>
    );
}
