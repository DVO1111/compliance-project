import { useState, useEffect, useCallback } from 'react';
import {
    ShieldAlert,
    Activity,
    ClipboardList,
    Scale,
    Target,
    AlertTriangle,
    TrendingDown,
    TrendingUp,
    LayoutDashboard,
    RefreshCw,
    ChevronRight,
    Zap,
    ShieldCheck,
    Clock,
    BrainCircuit,
    ClipboardCheck,
    ArrowRight,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
    ResponsiveContainer,
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    BarChart,
    Bar,
} from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
import {
    getDashboardMetrics,
    getRiskHeatmap,
    getVendorPulse,
    getPolicyCompliance,
    getAutomationHealth,
    getAuditVelocity,
    getTopRisks,
    getRegulatoryExposure,
    getCorrelationEvents,
    triggerCorrelationEvaluation,
    DashboardMetrics,
    RiskHeatmapData,
    VendorPulseData,
    AutomationHealthData,
} from '../../../lib/governance/commandCenterService';
import { Risk, RISK_LEVELS, RISK_CATEGORIES } from '../../../lib/governance/riskRegisterService';
import DashboardCard from '../../Dashboard/ui/DashboardCard';
import { logger } from '../../../lib/logger';

/* ─── helpers ──────────────────────────────────────────────── */

function levelColor(level: string) {
    return RISK_LEVELS.find(l => l.id === level)?.color || '#94a3b8';
}

/* ─── component ────────────────────────────────────────────── */

export default function CommandCenterPage() {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id;

    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [heatmap, setHeatmap] = useState<RiskHeatmapData[]>([]);
    const [vendorPulse, setVendorPulse] = useState<VendorPulseData[]>([]);
    const [policyRate, setPolicyRate] = useState<{ acknowledged: number; total: number; rate: number } | null>(null);
    const [automationData, setAutomationData] = useState<AutomationHealthData[]>([]);
    const [auditVelocity, setAuditVelocity] = useState<any[]>([]);
    const [topRisks, setTopRisks] = useState<Risk[]>([]);
    const [regulatoryExposure, setRegulatoryExposure] = useState<{ total: number; implemented: number; pending: number; highRisk: number; rate: number } | null>(null);
    const [insights, setInsights] = useState<any[]>([]);

    const loadData = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [m, h, v, p, a, v2, tr, re, ins] = await Promise.all([
                getDashboardMetrics(companyId),
                getRiskHeatmap(companyId),
                getVendorPulse(companyId),
                getPolicyCompliance(companyId),
                getAutomationHealth(companyId),
                getAuditVelocity(companyId),
                getTopRisks(companyId),
                getRegulatoryExposure(companyId),
                getCorrelationEvents(companyId),
            ]);
            setMetrics(m);
            setHeatmap(h);
            setVendorPulse(v);
            setPolicyRate(p);
            setAutomationData(a);
            setAuditVelocity(v2);
            setTopRisks(tr);
            setRegulatoryExposure(re);
            setInsights(ins);
        } catch (err) {
            logger.error('Failed to load dashboard:', err);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    const handleRunCorrelation = async () => {
        if (!companyId || !profile?.id) return;
        setLoading(true);
        try {
            await triggerCorrelationEvaluation(companyId, profile.id);
            await loadData();
        } catch (err) {
            logger.error('Failed to run correlation:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [loadData]);

    if (!companyId) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold dash-text flex items-center gap-3">
                        <div className="p-2 rounded-xl shadow-lg" style={{ background: 'var(--color-accent)' }}>
                            <LayoutDashboard size={22} className="text-white" />
                        </div>
                        Governance Command Center
                    </h1>
                    <p className="text-sm dash-text-secondary mt-1">Unified executive oversight and risk intelligence</p>
                </div>
                <button
                    onClick={loadData}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border dash-border hover:bg-[var(--color-surface-alt)] shadow-sm transition-all bg-[var(--color-surface)]"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh All
                </button>
            </div>

            {/* Top Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    label="Risk Posture Score"
                    value={metrics?.posture?.posture_score ?? 0}
                    sub="out of 100"
                    icon={<Target size={20} className="text-blue-500" />}
                    trend={metrics?.posture?.posture_score && metrics.posture.posture_score > 70 ? 'up' : 'down'}
                    loading={loading}
                />
                <MetricCard
                    label="Maximum Risk Level"
                    value={metrics?.posture?.highest_risk_level?.toUpperCase() || 'LOW'}
                    sub="Inherent Maximum"
                    icon={<ShieldAlert size={20} className="text-rose-500" />}
                    loading={loading}
                    color={levelColor(metrics?.posture?.highest_risk_level || 'low')}
                />
                <MetricCard
                    label="Open Risk Items"
                    value={metrics?.posture?.open_risks_count ?? 0}
                    sub="Requires Mitigation"
                    icon={<AlertTriangle size={20} className="text-amber-500" />}
                    loading={loading}
                />
                <MetricCard
                    label="Overdue Audits"
                    value={metrics?.overdueAuditsCount ?? 0}
                    sub="Past requested date"
                    icon={<ClipboardList size={20} className="text-purple-500" />}
                    loading={loading}
                    color={metrics?.overdueAuditsCount && metrics.overdueAuditsCount > 0 ? '#ef4444' : undefined}
                />
            </div>

            {/* Hardened Signal Flow — failed tests auto-raise CAPAs and shift risk posture */}
            <SignalFlowCard companyId={companyId} postureScore={metrics?.posture?.posture_score ?? null} />

            {/* Main Insights Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Risk Distribution Heatmap */}
                <DashboardCard className="min-h-[400px]">
                    <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-6 flex items-center justify-between">
                        Risk Distribution Matrix
                        <span className="text-[10px] lowercase font-normal italic opacity-60">Level vs Category</span>
                    </h3>
                    <div className="relative overflow-x-auto">
                        <table className="w-full text-center border-separate border-spacing-1.5">
                            <thead>
                                <tr>
                                    <th />
                                    {RISK_CATEGORIES.map(c => (
                                        <th key={c.id} className="text-[10px] font-bold dash-text-tertiary uppercase py-2 min-w-[60px]">{c.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {RISK_LEVELS.slice().reverse().map(l => (
                                    <tr key={l.id}>
                                        <td className="text-[10px] font-bold dash-text-tertiary uppercase text-right pr-4 whitespace-nowrap">{l.label}</td>
                                        {RISK_CATEGORIES.map(c => {
                                            const count = heatmap.find(h => h.row === l.id && h.col === c.id)?.count || 0;
                                            const bgColor = count > 0 ? (l.id === 'critical' ? 'bg-red-500' : l.id === 'high' ? 'bg-orange-500' : l.id === 'medium' ? 'bg-amber-500' : 'bg-blue-500') : 'bg-[var(--color-surface-alt)]';
                                            return (
                                                <td
                                                    key={`${l.id}-${c.id}`}
                                                    className={`h-12 rounded-lg transition-transform hover:scale-105 cursor-default flex items-center justify-center text-xs font-bold ${count > 0 ? 'text-white shadow-lg' : 'dash-text-tertiary opacity-30'} ${bgColor}`}
                                                >
                                                    {count}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </DashboardCard>

                {/* Vendor Risk Pulse */}
                <DashboardCard className="min-h-[400px]">
                    <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-6">Vendor Risk Exposure</h3>
                    {loading ? <div className="h-64 animate-pulse bg-[var(--color-surface-alt)] rounded-xl" /> : (
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={vendorPulse}>
                                    <PolarGrid stroke="var(--color-border)" />
                                    <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8 }} />
                                    <Radar
                                        name="Risk Score"
                                        dataKey="score"
                                        stroke="#2943D6"
                                        fill="#2943D6"
                                        fillOpacity={0.4}
                                    />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border)', fontSize: '12px' }}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>
                            <div className="mt-4 flex justify-center gap-6">
                                {vendorPulse.map(v => (
                                    <div key={v.category} className="text-center">
                                        <p className="text-lg font-bold dash-text">{v.score}</p>
                                        <p className="text-[9px] uppercase font-bold dash-text-tertiary">{v.category}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </DashboardCard>
            </div>

            {/* AI Governance Pulse */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <DashboardCard className="md:col-span-3">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                <BrainCircuit size={18} />
                            </div>
                            <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary">AI Governance Pulse</h3>
                        </div>
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'ai-dashboard' } }))}
                            className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                        >
                            Executive AI Control Tower <ChevronRight size={12} />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-4 rounded-xl border dash-border bg-[var(--color-surface-alt)] hover:shadow-md transition-all">
                            <p className="text-[10px] font-bold dash-text-tertiary uppercase mb-1">Pending AI Reviews</p>
                            <p className="text-2xl font-black dash-text text-purple-600">{metrics?.aiGovernance?.pendingReviews ?? 0}</p>
                            <p className="text-[9px] dash-text-tertiary font-bold uppercase mt-1">HITL Queue</p>
                        </div>
                        <div className="p-4 rounded-xl border dash-border bg-[var(--color-surface-alt)] hover:shadow-md transition-all">
                            <p className="text-[10px] font-bold dash-text-tertiary uppercase mb-1">Open AI Incidents</p>
                            <p className="text-2xl font-black dash-text text-rose-600">{metrics?.aiGovernance?.openIncidents ?? 0}</p>
                            <p className="text-[9px] dash-text-tertiary font-bold uppercase mt-1">Active Breaches</p>
                        </div>
                        <div className="p-4 rounded-xl border dash-border bg-[var(--color-surface-alt)] hover:shadow-md transition-all">
                            <p className="text-[10px] font-bold dash-text-tertiary uppercase mb-1">Flagged AI Usage</p>
                            <p className="text-2xl font-black dash-text text-amber-600">{metrics?.aiGovernance?.flaggedUsage ?? 0}</p>
                            <p className="text-[9px] dash-text-tertiary font-bold uppercase mt-1">Risk Thresholds Traversed</p>
                        </div>
                    </div>
                </DashboardCard>
            </div>

            {/* Regulatory Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <DashboardCard className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary">Regulatory Exposure Coverage</h3>
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'obligations' } }))}
                            className="text-[10px] font-bold text-blue-500 hover:underline flex items-center gap-1"
                        >
                            Management Matrix <ChevronRight size={12} />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <RegMiniCard label="Total Obligations" value={regulatoryExposure?.total ?? 0} icon={<Scale size={14} />} color="blue" />
                        <RegMiniCard label="Implemented" value={regulatoryExposure?.implemented ?? 0} icon={<ShieldCheck size={14} />} color="emerald" />
                        <RegMiniCard label="Pending Identify" value={regulatoryExposure?.pending ?? 0} icon={<Clock size={14} />} color="amber" />
                        <RegMiniCard label="High Exposure" value={regulatoryExposure?.highRisk ?? 0} icon={<AlertTriangle size={14} />} color="rose" />
                    </div>
                    <div className="mt-8">
                        <div className="flex justify-between items-end mb-2">
                            <div>
                                <p className="text-[10px] font-bold dash-text-tertiary uppercase mb-1">Overall Regulatory Confidence</p>
                                <p className="text-2xl font-black dash-text">{regulatoryExposure?.rate}%</p>
                            </div>
                            <p className="text-[10px] dash-text-tertiary font-bold uppercase">{regulatoryExposure?.implemented} of {regulatoryExposure?.total} Obligations mapped to Controls</p>
                        </div>
                        <div className="w-full h-3 bg-[var(--color-surface-alt)] rounded-full overflow-hidden flex">
                            <div
                                className="h-full bg-emerald-500 transition-all duration-1000"
                                style={{ width: `${regulatoryExposure?.rate}%` }}
                            />
                        </div>
                    </div>
                </DashboardCard>

                <DashboardCard>
                    <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-6">Obligation Status</h3>
                    <div className="h-48 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={[
                                        { name: 'Implemented', value: regulatoryExposure?.implemented || 0 },
                                        { name: 'Pending', value: (regulatoryExposure?.total || 0) - (regulatoryExposure?.implemented || 0) }
                                    ]}
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    <Cell fill="#10b981" />
                                    <Cell fill="#f1f5f9" />
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-[9px] font-bold dash-text-tertiary uppercase">Mapped</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-slate-200" />
                            <span className="text-[9px] font-bold dash-text-tertiary uppercase">Identified</span>
                        </div>
                    </div>
                </DashboardCard>
            </div>

            {/* Health Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Policy Compliance */}
                <DashboardCard>
                    <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-6">Policy Compliance</h3>
                    <div className="h-48 flex flex-col items-center justify-center">
                        <div className="relative">
                            <ResponsiveContainer width={160} height={160}>
                                <PieChart>
                                    <Pie
                                        data={[
                                            { name: 'Acknowledged', value: policyRate?.rate || 0 },
                                            { name: 'Pending', value: 100 - (policyRate?.rate || 0) }
                                        ]}
                                        innerRadius={50}
                                        outerRadius={70}
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
                                <span className="text-2xl font-black dash-text">{policyRate?.rate}%</span>
                                <span className="text-[9px] font-bold uppercase dash-text-tertiary">Global Rate</span>
                            </div>
                        </div>
                        <p className="text-xs dash-text-secondary mt-4">
                            {policyRate?.acknowledged} of {policyRate?.total} acknowledgements complete
                        </p>
                    </div>
                </DashboardCard>

                {/* Automation Health */}
                <DashboardCard className="lg:col-span-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-6">Automation Health (30d)</h3>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={automationData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.5} />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 9 }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                />
                                <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border)', fontSize: '10px' }}
                                />
                                <Line type="monotone" dataKey="passed" stroke="#10b981" strokeWidth={3} dot={false} />
                                <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={3} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 flex gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-[10px] font-bold dash-text-secondary uppercase">Tests Passed</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <span className="text-[10px] font-bold dash-text-secondary uppercase">Tests Failed</span>
                        </div>
                    </div>
                </DashboardCard>
            </div>

            {/* Footer Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-12">
                {/* Governance Insights Feed */}
                <DashboardCard className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                <Zap size={18} />
                            </div>
                            <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary">Governance Insights Engine</h3>
                        </div>
                        <button
                            onClick={handleRunCorrelation}
                            disabled={loading}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 flex items-center gap-1.5 transition-all active:scale-95"
                        >
                            <Activity size={12} className={loading ? 'animate-spin' : ''} /> Run Analysis
                        </button>
                    </div>

                    <div className="space-y-4">
                        {insights.map(event => (
                            <div key={event.id} className="p-4 rounded-xl border dash-border bg-[var(--color-bg)] hover:shadow-md transition-all group">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex gap-4">
                                        <div className={`mt-1 p-2 rounded-lg ${event.severity === 'critical' ? 'bg-red-50 text-red-600' :
                                            event.severity === 'high' ? 'bg-orange-50 text-orange-600' :
                                                'bg-blue-50 text-blue-600'
                                            }`}>
                                            {event.severity === 'critical' ? <ShieldAlert size={16} /> : <Zap size={16} />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <h4 className="text-sm font-bold dash-text">{event.rule?.rule_name || 'System Insight'}</h4>
                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${event.severity === 'critical' ? 'bg-red-100 text-red-700' :
                                                    event.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                                                        'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {event.severity}
                                                </span>
                                            </div>
                                            <p className="text-xs dash-text-secondary leading-relaxed mb-3">
                                                {event.description}
                                            </p>
                                            <div className="flex items-center gap-4">
                                                <span className="text-[10px] dash-text-tertiary flex items-center gap-1">
                                                    <Clock size={12} /> {new Date(event.triggered_at).toLocaleString()}
                                                </span>
                                                <span className="text-[10px] dash-text-tertiary flex items-center gap-1">
                                                    <Target size={12} /> {event.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button className="opacity-0 group-hover:opacity-100 p-2 hover:bg-[var(--color-surface-alt)] rounded-lg transition-all">
                                        <ChevronRight size={16} className="dash-text-tertiary" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {insights.length === 0 && !loading && (
                            <div className="py-12 text-center border-2 border-dashed dash-border rounded-2xl">
                                <ShieldCheck size={40} className="mx-auto text-emerald-500/20 mb-3" />
                                <p className="text-sm font-medium dash-text-secondary">No governance signals requiring attention</p>
                                <p className="text-[10px] dash-text-tertiary mt-1">Cross-system correlation engine is monitoring for anomalies</p>
                            </div>
                        )}
                    </div>
                </DashboardCard>

                {/* Audit Velocity */}
                <DashboardCard>
                    <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-6">Audit Response Velocity</h3>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={auditVelocity} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="var(--color-border)" opacity={0.3} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" tick={{ fontSize: 9, width: 80 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ borderRadius: '12px', border: '1px solid var(--color-border)', fontSize: '11px' }}
                                />
                                <Bar dataKey="created" name="Requests" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={12} />
                                <Bar dataKey="fulfilled" name="Fulfilled" fill="#2943D6" radius={[0, 4, 4, 0]} barSize={12} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-8">
                        <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary mb-6">Priority Hazard Map</h3>
                        <div className="space-y-3">
                            {topRisks.slice(0, 3).map(r => (
                                <div key={r.id} className="flex items-center justify-between p-2 rounded-lg border border-transparent hover:border-[var(--color-border)] transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-6 rounded-full" style={{ background: levelColor(r.risk_level) }} />
                                        <span className="text-xs font-bold dash-text uppercase tracking-tighter truncate max-w-[120px]">{r.title}</span>
                                    </div>
                                    <span className="text-[9px] font-black dash-text-tertiary bg-[var(--color-surface-alt)] px-1.5 py-0.5 rounded uppercase">{r.status}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </DashboardCard>
            </div>

        </div>
    );
}

function SignalFlowCard({ companyId, postureScore }: { companyId: string; postureScore: number | null }) {
    const [failedTests, setFailedTests] = useState<number | null>(null);
    const [autoCapas, setAutoCapas] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const [testsRes, capaRes] = await Promise.all([
                (supabase as any)
                    .from('grc_test_runs')
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('result', 'fail')
                    .gte('executed_at', since),
                (supabase as any)
                    .from('capa_records')
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('source', 'compliance_failure')
                    .neq('status', 'closed'),
            ]);
            if (cancelled) return;
            setFailedTests(testsRes?.count ?? 0);
            setAutoCapas(capaRes?.count ?? 0);
        })();
        return () => { cancelled = true; };
    }, [companyId]);

    const node = (icon: React.ReactNode, value: string | number, label: string, tone: string) => (
        <div className="flex-1 min-w-[120px] p-4 rounded-xl border dash-border bg-[var(--color-surface-alt)] text-center">
            <div className={`inline-flex p-2 rounded-lg mb-2 ${tone}`}>{icon}</div>
            <p className="text-2xl font-black dash-text">{value}</p>
            <p className="text-[9px] font-bold uppercase tracking-widest dash-text-tertiary mt-1">{label}</p>
        </div>
    );

    return (
        <DashboardCard>
            <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600"><Zap size={16} /></div>
                <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest dash-text-tertiary">Automated Signal Flow</h3>
                    <p className="text-[10px] dash-text-tertiary">Failed control tests auto-raise CAPAs, which feed the risk posture score.</p>
                </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
                {node(<AlertTriangle size={18} className="text-red-500" />, failedTests ?? '…', 'Failed Tests (30d)', 'bg-red-50')}
                <ArrowRight size={18} className="dash-text-tertiary shrink-0" />
                {node(<ClipboardCheck size={18} className="text-amber-500" />, autoCapas ?? '…', 'Auto-Raised CAPAs', 'bg-amber-50')}
                <ArrowRight size={18} className="dash-text-tertiary shrink-0" />
                {node(<Target size={18} className="text-blue-500" />, postureScore ?? '…', 'Risk Posture Score', 'bg-blue-50')}
            </div>
        </DashboardCard>
    );
}

function RegMiniCard({ label, value, icon, color }: any) {
    const colorMap: any = {
        blue: 'text-blue-600 bg-blue-50 border-blue-100',
        emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
        amber: 'text-amber-600 bg-amber-50 border-amber-100',
        rose: 'text-rose-600 bg-rose-50 border-rose-100'
    };
    return (
        <div className={`p-4 rounded-xl border ${colorMap[color]} group transition-all hover:scale-[1.02] cursor-default`}>
            <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 rounded-lg bg-white/50">{icon}</div>
                <span className="text-lg font-black">{value}</span>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-tight opacity-70 leading-none">{label}</p>
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
        <div className="dash-card border dash-border rounded-2xl p-5 shadow-sm bg-[var(--color-surface)] relative overflow-hidden group">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-[11px] font-bold dash-text-tertiary uppercase tracking-widest mb-1">{label}</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-black dash-text" style={color ? { color } : {}}>
                            {loading ? '...' : value}
                        </p>
                        {trend && (
                            <span className={`flex items-center text-xs font-bold ${trend === 'up' ? 'text-red-500' : 'text-emerald-500'}`}>
                                {trend === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] dash-text-tertiary font-bold uppercase mt-2">{sub}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--color-surface-alt)] shrink-0 group-hover:scale-110 transition-transform">
                    {icon}
                </div>
            </div>
        </div>
    );
}
