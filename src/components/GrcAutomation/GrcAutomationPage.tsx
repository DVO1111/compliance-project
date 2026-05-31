import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
    listAllTests,
    toggleTestEnabled,
    triggerTest,
    type GrcControlTest
} from '../../lib/grcAutomation/grcControlTestsService';
import {
    listAllRuns,
    type GrcTestRun
} from '../../lib/grcAutomation/grcTestRunsService';
import {
    grcAutomationMonitoringService,
    type AutomationHealthMetrics,
    type ProviderHealth
} from '../../lib/grcAutomation/grcAutomationMonitoringService';
import AutomationTestModal from './AutomationTestModal';
import {
    Zap,
    Play,
    History,
    Settings2,
    ListChecks,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Clock,
    ExternalLink,
    Plus,
    Shield,
    Loader2,
    Search,
    RefreshCw,
    Calendar,
    Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '../../lib/logger';

type TestWithControl = GrcControlTest & { grc_controls: { reference_code: string; title: string } };
type RunWithTest = GrcTestRun & { grc_control_tests: { test_name: string } };

export default function GrcAutomationPage() {
    const { profile, user } = useAuth();
    const companyId = profile?.company_id;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'tests' | 'runs' | 'health'>('tests');

    const [tests, setTests] = useState<TestWithControl[]>([]);
    const [runs, setRuns] = useState<RunWithTest[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
    const [showTestModal, setShowTestModal] = useState(false);
    const [runningTestId, setRunningTestId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Monitoring State
    const [healthMetrics, setHealthMetrics] = useState<AutomationHealthMetrics | null>(null);
    const [overdueTests, setOverdueTests] = useState<any[]>([]);
    const [providerHealth, setProviderHealth] = useState<ProviderHealth[]>([]);
    const [flappyTests, setFlappyTests] = useState<any[]>([]);

    const loadData = useCallback(async (isRefresh = false) => {
        if (!companyId) return;
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const [allTests, allRuns] = await Promise.all([
                listAllTests(companyId),
                listAllRuns(companyId, 50)
            ]);
            setTests(allTests as any);
            setRuns(allRuns as any);

            // Fetch health metrics in background or if on health tab
            const [global, overdue, providers, flappy] = await Promise.all([
                grcAutomationMonitoringService.getGlobalHealth(companyId),
                grcAutomationMonitoringService.listOverdueTests(companyId),
                grcAutomationMonitoringService.getProviderHealth(companyId),
                grcAutomationMonitoringService.getFlappingMetrics(companyId)
            ]);
            setHealthMetrics(global);
            setOverdueTests(overdue);
            setProviderHealth(providers);
            setFlappyTests(flappy);
        } catch (err) {
            logger.error('Failed to load automation data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [companyId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    };

    const handleToggle = async (testId: string, enabled: boolean) => {
        if (!companyId || !user) return;
        try {
            await toggleTestEnabled(testId, enabled, user.id, companyId);
            setTests(prev => prev.map(t => t.id === testId ? { ...t, enabled } : t));
            showToast('success', `Test ${enabled ? 'enabled' : 'disabled'} successfully`);
        } catch (err: any) {
            showToast('error', err.message);
        }
    };

    const handleRunNow = async (testId: string) => {
        if (!companyId || !user) return;
        setRunningTestId(testId);
        try {
            const result = await triggerTest(testId, companyId, user.id);
            if (result.success) {
                showToast('success', 'Manual run completed successfully');
                loadData(true);
            } else {
                showToast('error', result.message);
            }
        } catch (err: any) {
            showToast('error', err.message);
        } finally {
            setRunningTestId(null);
        }
    };

    const filteredTests = tests.filter(t =>
        t.test_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.grc_controls.reference_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.grc_controls.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredRuns = runs.filter(r =>
        r.grc_control_tests?.test_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-[#0B0F19] relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-[var(--color-purple)]/[0.12] via-indigo-500/[0.06] to-transparent rounded-full blur-3xl pointer-events-none" />

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

                {/* Toast */}
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-[var(--color-success)] text-white' : 'bg-[var(--color-danger)] text-white'
                                }`}
                        >
                            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                            {toast.message}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full dash-card/[0.04] border border-white/[0.08] text-xs font-medium text-[var(--color-purple)] mb-4">
                            <Zap className="w-3.5 h-3.5" />
                            Continuous Compliance
                        </div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent tracking-tight">
                            Automation Management
                        </h1>
                        <p className="dash-text-tertiary mt-2 max-w-xl">
                            Monitor, configure and trigger automated control tests across your interconnected systems.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                setSelectedTestId(null);
                                setShowTestModal(true);
                            }}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-[var(--color-purple)] hover:from-[var(--color-purple)] hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/20"
                        >
                            <Plus className="w-4 h-4" />
                            New Automation Test
                        </button>
                    </div>
                </div>

                {/* Filters & Tabs */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
                    <div className="flex p-1 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm w-fit">
                        <button
                            onClick={() => setActiveTab('tests')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'tests'
                                ? 'bg-white/[0.08] text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-200'
                                }`}
                        >
                            <ListChecks className="w-4 h-4" />
                            Automated Tests
                        </button>
                        <button
                            onClick={() => setActiveTab('runs')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'runs'
                                ? 'bg-white/[0.08] text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-200'
                                }`}
                        >
                            <History className="w-4 h-4" />
                            Execution History
                        </button>
                        <button
                            onClick={() => setActiveTab('health')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'health'
                                ? 'bg-white/[0.08] text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-200'
                                }`}
                        >
                            <Activity className="w-4 h-4" />
                            Health
                        </button>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:flex-initial min-w-[280px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search tests or controls..."
                                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-purple)] focus:ring-1 focus:ring-[var(--color-purple)] transition-all"
                            />
                        </div>
                        <button
                            onClick={() => loadData(true)}
                            disabled={refreshing}
                            className={`p-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-gray-400 hover:text-white transition-colors ${refreshing ? 'animate-spin' : ''}`}
                        >
                            <RefreshCw className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 grayscale opacity-50">
                        <Loader2 className="w-10 h-10 text-[var(--color-purple)] animate-spin mb-4" />
                        <p className="text-sm text-gray-400">Loading automation data...</p>
                    </div>
                ) : activeTab === 'tests' ? (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredTests.length === 0 ? (
                            <div className="dash-card/[0.02] border border-white/[0.06] rounded-2xl p-16 text-center">
                                <Shield className="w-12 h-12 mx-auto mb-4 text-[var(--color-purple)] opacity-20" />
                                <h3 className="text-lg font-semibold text-white mb-2">No tests found</h3>
                                <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">
                                    {searchTerm ? "Try adjusting your search filters." : "Ready to automate your GRC control checks? Start by creating your first automated test."}
                                </p>
                                {!searchTerm && (
                                    <button
                                        onClick={() => setShowTestModal(true)}
                                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-sm font-medium text-white hover:bg-white/[0.1] transition-all"
                                    >
                                        Create First Test →
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredTests.map((test) => {
                                const latestRun = runs.find(r => r.test_id === test.id);
                                return (
                                    <motion.div
                                        key={test.id}
                                        layoutId={test.id}
                                        className="group dash-card/[0.02] border border-white/[0.06] hover:border-white/[0.12] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-6 transition-all"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${test.enabled ? 'bg-[var(--color-purple)]/10 text-[var(--color-purple)]' : 'bg-white/5 text-gray-500'}`}>
                                                    <Activity className="w-4 h-4" />
                                                </div>
                                                <h3 className="text-lg font-bold text-white group-hover:text-[var(--color-purple)] transition-colors truncate">
                                                    {test.test_name}
                                                </h3>
                                                {!test.enabled && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-gray-500 border border-white/5">
                                                        Disabled
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4 text-xs dash-text-tertiary">
                                                <span className="flex items-center gap-1.5">
                                                    <Shield className="w-3.5 h-3.5" />
                                                    {test.grc_controls.reference_code}: {test.grc_controls.title}
                                                </span>
                                                <span className="w-1 h-1 rounded-full bg-white/10" />
                                                <span className="flex items-center gap-1.5 capitalize">
                                                    <Settings2 className="w-3.5 h-3.5" />
                                                    {test.provider_id.replace(/_/g, ' ')}
                                                </span>
                                                <span className="w-1 h-1 rounded-full bg-white/10" />
                                                <span className="flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {test.frequency}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-6 sm:gap-10">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Latest Status</span>
                                                {latestRun ? (
                                                    <div className="flex items-center gap-2">
                                                        {latestRun.result === 'pass' && <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />}
                                                        {latestRun.result === 'fail' && <XCircle className="w-4 h-4 text-[var(--color-danger)]" />}
                                                        {!latestRun.result && <AlertCircle className="w-4 h-4 text-behance-amber-500" />}
                                                        <span className={`text-sm font-medium ${latestRun.result === 'pass' ? 'text-[var(--color-success)]' :
                                                            latestRun.result === 'fail' ? 'text-[var(--color-danger)]' : 'text-behance-amber-500'
                                                            }`}>
                                                            {latestRun.result?.toUpperCase() || (latestRun.status === 'running' ? 'EXECUTING...' : 'ERROR')}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-gray-600 italic">Never run</span>
                                                )}
                                            </div>

                                            <div className="flex flex-col gap-1 min-w-[120px]">
                                                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Next Run</span>
                                                <span className="text-sm text-white flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                                                    {test.enabled && test.next_run_at ? new Date(test.next_run_at).toLocaleDateString() : '--'}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleRunNow(test.id)}
                                                    disabled={!test.enabled || runningTestId === test.id}
                                                    className={`p-2.5 rounded-xl border border-white/[0.08] transition-all ${!test.enabled || runningTestId === test.id
                                                        ? 'opacity-30 cursor-not-allowed'
                                                        : 'bg-white/[0.03] text-[var(--color-purple)] hover:bg-[var(--color-purple)] hover:text-white'
                                                        }`}
                                                    title="Run Now"
                                                >
                                                    {runningTestId === test.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Play className="w-4 h-4" />
                                                    )}
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        setSelectedTestId(test.id);
                                                        setShowTestModal(true);
                                                    }}
                                                    className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-gray-400 hover:text-white transition-all"
                                                    title="Edit Configuration"
                                                >
                                                    <Settings2 className="w-4 h-4" />
                                                </button>

                                                <button
                                                    onClick={() => handleToggle(test.id, !test.enabled)}
                                                    className={`p-2.5 rounded-xl border border-white/[0.08] transition-all ${test.enabled
                                                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white'
                                                        : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white'
                                                        }`}
                                                    title={test.enabled ? 'Disable' : 'Enable'}
                                                >
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                ) : activeTab === 'runs' ? (
                    <div className="space-y-4">
                        {filteredRuns.length === 0 ? (
                            <div className="dash-card/[0.02] border border-white/[0.06] rounded-2xl p-16 text-center">
                                <History className="w-12 h-12 mx-auto mb-4 text-gray-600 opacity-20" />
                                <h3 className="text-lg font-semibold text-white mb-2">No execution history</h3>
                                <p className="text-sm text-gray-400">Runs will appear here once they are triggered.</p>
                            </div>
                        ) : (
                            <div className="dash-card/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">Test / Control</th>
                                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">Execution Date</th>
                                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">Result</th>
                                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">Duration</th>
                                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.04]">
                                        {filteredRuns.map((run) => (
                                            <tr key={run.id} className="group hover:bg-white/[0.01] transition-colors">
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-semibold text-white">{run.grc_control_tests?.test_name || 'Deleted Test'}</p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5">ID: {run.id.split('-')[0]}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm text-gray-300">{new Date(run.executed_at).toLocaleString()}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${run.result === 'pass' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                        run.result === 'fail' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                            'bg-behance-amber-500/10 text-behance-amber-400 border-behance-amber-500/20'
                                                        }`}>
                                                        {run.result === 'pass' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                                        {run.result || run.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-500">
                                                    {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(2)}s` : '--'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-gray-400 hover:text-white transition-all">
                                                        <ExternalLink className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Health KPIs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: 'Enabled Tests', value: healthMetrics?.totalEnabled || 0, icon: ListChecks, color: 'var(--color-purple)' },
                                { label: 'Overdue Tests', value: healthMetrics?.overdueCount || 0, icon: Clock, color: 'var(--color-danger)', alert: (healthMetrics?.overdueCount || 0) > 0 },
                                { label: 'Failing (24h)', value: healthMetrics?.failingCount || 0, icon: XCircle, color: 'var(--color-danger)' },
                                { label: 'Flapping Count', value: flappyTests.length, icon: Activity, color: 'var(--color-warning)' }
                            ].map((kpi, idx) => (
                                <div key={idx} className="dash-card/[0.02] border border-white/[0.06] rounded-2xl p-6 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <kpi.icon className="w-16 h-16" style={{ color: kpi.color }} />
                                    </div>
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{kpi.label}</p>
                                    <h4 className="text-2xl font-bold text-white flex items-center gap-2">
                                        {kpi.value}
                                        {kpi.alert && (
                                            <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                        )}
                                    </h4>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Overdue Tests */}
                            <div className="dash-card/[0.02] border border-white/[0.06] rounded-2xl p-6">
                                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-red-500" />
                                    Overdue & Stale Tests
                                </h3>
                                {overdueTests.length === 0 ? (
                                    <div className="py-10 text-center">
                                        <CheckCircle2 className="w-10 h-10 text-emerald-500/20 mx-auto mb-3" />
                                        <p className="text-sm text-gray-500">All tests are running as scheduled.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {overdueTests.map(test => (
                                            <div key={test.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-white truncate">{test.test_name}</p>
                                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">
                                                        Next Run: {new Date(test.next_run_at).toLocaleString()}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleRunNow(test.id)}
                                                    className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all"
                                                >
                                                    <Play className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Provider Health */}
                            <div className="dash-card/[0.02] border border-white/[0.06] rounded-2xl p-6">
                                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-indigo-500" />
                                    Provider Connection Health (24h)
                                </h3>
                                {providerHealth.length === 0 ? (
                                    <p className="py-10 text-center text-sm text-gray-500 italic">No runs recorded today.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {providerHealth.map(provider => (
                                            <div key={provider.providerId} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-sm font-bold text-white capitalize">{provider.providerName}</span>
                                                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${provider.errorRate > 0 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                                                        }`}>
                                                        {provider.errorRate.toFixed(1)}% Error
                                                    </span>
                                                </div>
                                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-500 ${provider.errorRate > 20 ? 'bg-red-500' : 'bg-emerald-500'}`}
                                                        style={{ width: `${100 - provider.errorRate}%` }}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
                                                    <span>{provider.totalRuns24h} total runs</span>
                                                    <span>{provider.failingTestsCount} failing tests</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Flapping Tests Table */}
                        <div className="dash-card/[0.02] border border-white/[0.06] rounded-2xl p-6">
                            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-orange-500" />
                                Most Flapping Tests (Transitions in last 20 runs)
                            </h3>
                            {flappyTests.length === 0 ? (
                                <p className="py-10 text-center text-sm text-gray-500 italic">No significant flapping detected across enabled tests.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500 border-b border-white/[0.06]">
                                                <th className="px-4 py-3">Test Name</th>
                                                <th className="px-4 py-3">Transitions</th>
                                                <th className="px-4 py-3 text-right">Latest Result</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.04]">
                                            {flappyTests.map(test => (
                                                <tr key={test.id} className="text-sm group">
                                                    <td className="px-4 py-3 text-white font-medium">{test.name}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="px-2 py-1 rounded bg-orange-500/10 text-orange-400 font-bold tabular-nums">
                                                            {test.transitions}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${test.latestResult === 'pass' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                                            }`}>
                                                            {test.latestResult}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>


            <AnimatePresence>
                {showTestModal && companyId && user && (
                    <AutomationTestModal
                        isOpen={showTestModal}
                        companyId={companyId}
                        userId={user.id}
                        testId={selectedTestId}
                        onClose={() => {
                            setShowTestModal(false);
                            setSelectedTestId(null);
                        }}
                        onSuccess={() => {
                            loadData(true);
                        }}
                    />
                )}
            </AnimatePresence>
        </div >
    );
}
