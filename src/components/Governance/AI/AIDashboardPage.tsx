import { useState, useEffect, useCallback } from 'react';
import {
    BrainCircuit,
    Activity,
    ShieldAlert,
    ShieldCheck,
    FileEdit,
    AlertTriangle,
    ChevronRight,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    Zap,
    LayoutDashboard,
    ArrowUpRight,
    BarChart3,
    PieChart as PieChartIcon
} from 'lucide-react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
import {
    aiDashboardService,
    AIDashboardSummary,
    AIUsageTrend,
    AIProviderBreakdown,
    AIStatusMetric
} from '../../../lib/aiGovernance/aiDashboardService';
import DashboardCard from '../../Dashboard/ui/DashboardCard';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '../../../lib/logger';

/* ─── helpers ──────────────────────────────────────────────── */

const COLORS = ['var(--color-accent)', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

/* ─── component ────────────────────────────────────────────── */

export default function AIDashboardPage() {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id;

    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<AIDashboardSummary | null>(null);
    const [trends, setTrends] = useState<AIUsageTrend[]>([]);
    const [providers, setProviders] = useState<AIProviderBreakdown[]>([]);
    const [incidents, setIncidents] = useState<AIStatusMetric[]>([]);
    const [reviews, setReviews] = useState<AIStatusMetric[]>([]);
    const [coverage, setCoverage] = useState<{ covered: number; total: number }>({ covered: 0, total: 0 });

    const loadData = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [s, t, p, i, r, c] = await Promise.all([
                aiDashboardService.getSummary(companyId, {}),
                aiDashboardService.getUsageTrends(companyId, {}),
                aiDashboardService.getProviderBreakdown(companyId),
                aiDashboardService.getIncidentMetrics(companyId),
                aiDashboardService.getReviewMetrics(companyId),
                aiDashboardService.getAssetCoverage(companyId)
            ]);
            setSummary(s);
            setTrends(t);
            setProviders(p);
            setIncidents(i);
            setReviews(r);
            setCoverage(c);
        } catch (err) {
            logger.error('Failed to load AI dashboard:', err);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { loadData(); }, [loadData]);

    if (!companyId) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold dash-text flex items-center gap-3">
                        <div className="p-2 rounded-xl shadow-lg bg-gradient-to-br from-indigo-600 to-blue-500">
                            <BrainCircuit size={22} className="text-white" />
                        </div>
                        AI Governance Dashboard
                    </h1>
                    <p className="text-sm dash-text-secondary mt-1">Real-time oversight of enterprise AI usage, risk, and compliance</p>
                </div>
                <button
                    onClick={loadData}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border dash-border hover:bg-[var(--color-surface-alt)] shadow-sm transition-all bg-[var(--color-surface)]"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <MetricCard
                    label="AI Assets"
                    value={summary?.totalAssets ?? 0}
                    sub="Managed Repository"
                    icon={<BrainCircuit size={20} className="text-blue-500" />}
                    loading={loading}
                />
                <MetricCard
                    label="Invocations"
                    value={summary?.totalUsage ?? 0}
                    sub="Total Activity"
                    icon={<Activity size={20} className="text-emerald-500" />}
                    loading={loading}
                />
                <MetricCard
                    label="Flagged Events"
                    value={summary?.flaggedEvents ?? 0}
                    sub="Risk Threshold Hit"
                    icon={<Zap size={20} className="text-amber-500" />}
                    trend={summary?.flaggedEvents && summary.flaggedEvents > 0 ? 'up' : undefined}
                    loading={loading}
                    color={summary?.flaggedEvents && summary.flaggedEvents > 0 ? '#f59e0b' : undefined}
                />
                <MetricCard
                    label="Open Incidents"
                    value={summary?.openIncidents ?? 0}
                    sub="Active Breaches"
                    icon={<ShieldAlert size={20} className="text-rose-500" />}
                    loading={loading}
                    color={summary?.openIncidents && summary.openIncidents > 0 ? '#ef4444' : undefined}
                />
                <MetricCard
                    label="Pending Reviews"
                    value={summary?.pendingReviews ?? 0}
                    sub="HITL Queue"
                    icon={<ShieldCheck size={20} className="text-purple-500" />}
                    loading={loading}
                />
                <MetricCard
                    label="Prompt Reviews"
                    value={summary?.pendingPrompts ?? 0}
                    sub="Awaiting Approval"
                    icon={<FileEdit size={20} className="text-indigo-500" />}
                    loading={loading}
                />
            </div>

            {/* Analytics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Usage Trend */}
                <DashboardCard className="min-h-[400px]">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary">Usage & Risk Trends</h3>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <span className="text-[10px] font-bold dash-text-tertiary uppercase">Invocations</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-amber-500" />
                                <span className="text-[10px] font-bold dash-text-tertiary uppercase">Flagged</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={trends}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 9 }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                />
                                <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border)', fontSize: '11px' }}
                                />
                                <Line type="monotone" dataKey="total" stroke="var(--color-accent)" strokeWidth={3} dot={false} />
                                <Line type="monotone" dataKey="flagged" stroke="#f59e0b" strokeWidth={3} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </DashboardCard>

                {/* Provider Breakdown */}
                <DashboardCard className="min-h-[400px]">
                    <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-6">Provider & Model Composition</h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={providers} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--color-border)" opacity={0.3} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="model" type="category" tick={{ fontSize: 9, width: 80 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border)', fontSize: '11px' }}
                                />
                                <Bar dataKey="invocations" name="Invocations" fill="var(--color-accent)" radius={[0, 4, 4, 0]} barSize={12} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                        {providers.slice(0, 4).map((p, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-surface-alt)]">
                                <span className="text-[10px] font-bold dash-text truncate mr-2">{p.model}</span>
                                <span className="text-[10px] font-bold text-blue-600">{Math.round(p.avgLatency)}ms</span>
                            </div>
                        ))}
                    </div>
                </DashboardCard>

                {/* Incident Severity */}
                <DashboardCard>
                    <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-6">Incident Severity Distribution</h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={incidents}
                                    dataKey="count"
                                    nameKey="status"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                >
                                    {incidents.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap justify-center gap-4 mt-2">
                        {incidents.map((i, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} />
                                <span className="text-[9px] font-bold dash-text-tertiary uppercase">{i.status}: {i.count}</span>
                            </div>
                        ))}
                    </div>
                </DashboardCard>

                {/* Control Coverage */}
                <DashboardCard>
                    <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-6">AI Asset Control Coverage</h3>
                    <div className="flex flex-col items-center justify-center pt-8">
                        <div className="relative w-40 h-40">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={[
                                            { name: 'Covered', value: coverage.covered },
                                            { name: 'Missing Controls', value: coverage.total - coverage.covered }
                                        ]}
                                        innerRadius={60}
                                        outerRadius={80}
                                        startAngle={90}
                                        endAngle={450}
                                        dataKey="value"
                                    >
                                        <Cell fill="#10b981" />
                                        <Cell fill="#f1f5f9" />
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-black dash-text">
                                    {coverage.total > 0 ? Math.round((coverage.covered / coverage.total) * 100) : 0}%
                                </span>
                                <span className="text-[9px] font-bold uppercase dash-text-tertiary">Coverage</span>
                            </div>
                        </div>
                        <div className="mt-8 text-center">
                            <p className="text-sm font-bold dash-text">{coverage.covered} of {coverage.total} assets secured</p>
                            <p className="text-[10px] dash-text-tertiary uppercase mt-1">Mapped to governance controls</p>
                        </div>
                    </div>
                </DashboardCard>
            </div>

            {/* Highest Risk Assets table placeholder context */}
            <DashboardCard>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary">Operational Priority Focus</h3>
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'ai-assets' } }))}
                        className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                    >
                        View All Assets <ChevronRight size={12} />
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b dash-border">
                                <th className="text-left py-3 text-[10px] font-bold dash-text-tertiary uppercase">Type</th>
                                <th className="text-left py-3 text-[10px] font-bold dash-text-tertiary uppercase">Context / Focus</th>
                                <th className="text-right py-3 text-[10px] font-bold dash-text-tertiary uppercase">Count</th>
                                <th className="text-right py-3 text-[10px] font-bold dash-text-tertiary uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dash-border">
                            <tr>
                                <td className="py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-red-50 text-red-600">
                                            <ShieldAlert size={14} />
                                        </div>
                                        <span className="text-xs font-bold dash-text">Active Incidents</span>
                                    </div>
                                </td>
                                <td className="py-4 text-xs dash-text-secondary">AI-specific failure and policy breaches</td>
                                <td className="py-4 text-right font-bold dash-text">{summary?.openIncidents}</td>
                                <td className="py-4 text-right">
                                    <button
                                        onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'ai-incidents' } }))}
                                        className="p-1.5 hover:bg-[var(--color-surface-alt)] rounded-lg transition-all"
                                    >
                                        <ChevronRight size={14} className="dash-text-tertiary" />
                                    </button>
                                </td>
                            </tr>
                            <tr>
                                <td className="py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                                            <Activity size={14} />
                                        </div>
                                        <span className="text-xs font-bold dash-text">Pending Reviews</span>
                                    </div>
                                </td>
                                <td className="py-4 text-xs dash-text-secondary">Human-in-the-loop governance queue</td>
                                <td className="py-4 text-right font-bold dash-text">{summary?.pendingReviews}</td>
                                <td className="py-4 text-right">
                                    <button
                                        onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'ai-reviews' } }))}
                                        className="p-1.5 hover:bg-[var(--color-surface-alt)] rounded-lg transition-all"
                                    >
                                        <ChevronRight size={14} className="dash-text-tertiary" />
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </DashboardCard>
        </div>
    );
}

function MetricCard({
    label,
    value,
    sub,
    icon,
    trend,
    loading,
    color
}: {
    label: string;
    value: string | number;
    sub: string;
    icon: React.ReactNode;
    trend?: 'up' | 'down';
    loading: boolean;
    color?: string;
}) {
    return (
        <div className="dash-card border dash-border rounded-2xl p-4 shadow-sm bg-[var(--color-surface)] relative overflow-hidden group">
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold dash-text-tertiary uppercase tracking-widest mb-1 truncate">{label}</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-black dash-text" style={color ? { color } : {}}>
                            {loading ? '...' : value}
                        </p>
                        {trend && (
                            <span className={`flex items-center text-[10px] font-bold ${trend === 'up' ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {trend === 'up' ? <ArrowUpRight size={12} /> : <TrendingDown size={12} />}
                            </span>
                        )}
                    </div>
                    <p className="text-[9px] dash-text-tertiary font-bold uppercase mt-1 truncate">{sub}</p>
                </div>
                <div className="p-2 rounded-xl bg-[var(--color-surface-alt)] shrink-0 group-hover:scale-110 transition-transform">
                    {icon}
                </div>
            </div>
        </div>
    );
}
