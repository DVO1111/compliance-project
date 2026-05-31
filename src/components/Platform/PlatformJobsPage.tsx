import React, { useEffect, useState } from 'react';
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Clock,
    RefreshCcw,
    Search,
    ChevronRight,
    Info,
    Calendar,
    Tag
} from 'lucide-react';
import {
    listJobRuns,
    getJobHealthSummary,
    retryJob,
    GovernanceJobRun,
    JobHealthSummary,
    JobType,
    JobStatus
} from '../../lib/platform/governanceJobService';
import { useAuth } from '../../contexts/AuthContext';

/* ─── helpers ────────────────────────────────────────────── */

function fmtDate(d: string | null, format?: string) {
    if (!d) return '—';
    const date = new Date(d);
    if (format === 'MMM DD, HH:mm') {
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showToast(message: string, type: 'success' | 'warning' = 'success') {
    window.dispatchEvent(new CustomEvent('global-toast', {
        detail: { message, type }
    }));
}

function statusColor(status: JobStatus) {
    switch (status) {
        case 'completed': return 'text-green-500 bg-green-500/10';
        case 'failed': return 'text-red-500 bg-red-500/10';
        case 'running': return 'text-blue-500 bg-blue-500/10';
        case 'queued': return 'text-amber-500 bg-amber-500/10';
        case 'cancelled': return 'text-gray-500 bg-gray-500/10';
        default: return 'text-gray-500 bg-gray-500/10';
    }
}

function jobTypeLabel(type: JobType) {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/* ─── components ────────────────────────────────────────────── */

function StatCard({ label, value, icon: Icon, subtext, color }: any) {
    return (
        <div className="dash-card border dash-border rounded-2xl p-6 flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-[var(--color-surface-alt)]">
                    <Icon size={20} style={{ color: color || 'var(--color-accent)' }} />
                </div>
                <span className="text-2xl font-bold dash-text">{value}</span>
            </div>
            <div>
                <h3 className="text-xs font-bold dash-text-tertiary uppercase tracking-wider">{label}</h3>
                {subtext && <p className="text-[10px] dash-text-tertiary opacity-70 mt-1">{subtext}</p>}
            </div>
        </div>
    );
}

const PlatformJobsPage: React.FC = () => {
    const { profile } = useAuth();
    const [jobs, setJobs] = useState<GovernanceJobRun[]>([]);
    const [summary, setSummary] = useState<JobHealthSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

    // Filters
    const [jobTypeFilter, setJobTypeFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [search, setSearch] = useState('');

    const companyId = profile?.company_id;

    const fetchData = async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [jobsData, summaryData] = await Promise.all([
                listJobRuns({
                    companyId,
                    jobType: jobTypeFilter !== 'all' ? jobTypeFilter as JobType : undefined,
                    status: statusFilter !== 'all' ? statusFilter as JobStatus : undefined,
                    limit: 50
                }),
                getJobHealthSummary(companyId)
            ]);
            setJobs(jobsData);
            setSummary(summaryData);
        } catch (err) {
            showToast('Failed to load job runs', 'warning');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [companyId, jobTypeFilter, statusFilter]);

    const handleRetry = async (job: GovernanceJobRun) => {
        if (!profile?.company_id || !profile?.id || retryingIds.has(job.id)) return;

        setRetryingIds(prev => new Set(prev).add(job.id));
        try {
            const success = await retryJob(job.id, profile.company_id, profile.id);
            if (success) {
                showToast('Retry triggered successfully');
                fetchData();
            } else {
                showToast('Failed to trigger retry', 'warning');
            }
        } catch (err) {
            showToast('Error retrying job', 'warning');
        } finally {
            setRetryingIds(prev => {
                const next = new Set(prev);
                next.delete(job.id);
                return next;
            });
        }
    };

    const filteredJobs = jobs.filter(j =>
        j.job_name.toLowerCase().includes(search.toLowerCase()) ||
        j.job_type.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="p-8 max-w-[1600px] mx-auto flex flex-col gap-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold dash-text">Platform Jobs</h1>
                    <p className="dash-text-tertiary mt-1">Operational control plane for governance processes</p>
                </div>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-surface-alt)] dash-text hover:opacity-80 transition-all border dash-border"
                >
                    <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
                    <span className="text-sm font-medium">Refresh</span>
                </button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <StatCard
                    label="Active Jobs"
                    value={summary?.activeJobs || 0}
                    icon={Activity}
                    color="var(--color-accent)"
                    subtext="Ongoing processing tasks"
                />
                <StatCard
                    label="Failed (24h)"
                    value={summary?.failedIn24h || 0}
                    icon={AlertCircle}
                    color="#ef4444"
                    subtext="Jobs requiring attention"
                />
                <StatCard
                    label="Success Rate"
                    value={`${summary?.successRate24h || 0}%`}
                    icon={CheckCircle2}
                    color="#22c55e"
                    subtext="Last 24 hours average"
                />
                <StatCard
                    label="Reliability Index"
                    value={(summary?.successRate24h || 0) > 95 ? 'High' : 'Watch'}
                    icon={Info}
                    color="#a855f7"
                    subtext="System health status"
                />
            </div>

            {/* Control Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[var(--color-surface-alt)] p-4 rounded-2xl border dash-border">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 dash-text-tertiary" size={16} />
                        <input
                            type="text"
                            placeholder="Search jobs..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-[var(--color-surface)] border dash-border rounded-xl py-2 pl-10 pr-4 text-sm dash-text focus:outline-none focus:ring-2 ring-[var(--color-accent)]/20"
                        />
                    </div>
                    <select
                        value={jobTypeFilter}
                        onChange={(e) => setJobTypeFilter(e.target.value)}
                        className="bg-[var(--color-surface)] border dash-border rounded-xl py-2 px-4 text-sm dash-text focus:outline-none cursor-pointer"
                    >
                        <option value="all">All Job Types</option>
                        <option value="automation_runner">Automation</option>
                        <option value="policy_reminder_runner">Reminders</option>
                        <option value="correlation_runner">Correlation</option>
                        <option value="audit_export">Audit Export</option>
                        <option value="risk_posture_refresh">Posture Refresh</option>
                    </select>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-[var(--color-surface)] border dash-border rounded-xl py-2 px-4 text-sm dash-text focus:outline-none cursor-pointer"
                    >
                        <option value="all">All Statuses</option>
                        <option value="running">Running</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                        <option value="queued">Queued</option>
                    </select>
                </div>
            </div>

            {/* Jobs Table */}
            <div className="dash-card border dash-border rounded-2xl overflow-hidden block">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-[var(--color-surface-alt)] border-b dash-border">
                            <th className="px-6 py-4 text-xs font-bold dash-text-tertiary uppercase tracking-wider">Job Name / Type</th>
                            <th className="px-6 py-4 text-xs font-bold dash-text-tertiary uppercase tracking-wider">Status</th>
                            <th className="px-6 py-4 text-xs font-bold dash-text-tertiary uppercase tracking-wider">Source</th>
                            <th className="px-6 py-4 text-xs font-bold dash-text-tertiary uppercase tracking-wider">Started At</th>
                            <th className="px-6 py-4 text-xs font-bold dash-text-tertiary uppercase tracking-wider text-right">Duration</th>
                            <th className="px-6 py-4 text-xs font-bold dash-text-tertiary uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y dash-border">
                        {filteredJobs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center dash-text-tertiary">
                                    <Info className="mx-auto mb-2 opacity-20" size={32} />
                                    No jobs found matching your filters
                                </td>
                            </tr>
                        ) : filteredJobs.map(job => (
                            <tr key={job.id} className="hover:bg-[var(--color-surface-alt)]/50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold dash-text">{job.job_name}</span>
                                        <span className="text-[10px] dash-text-tertiary uppercase font-medium">{jobTypeLabel(job.job_type)}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor(job.status)}`}>
                                        {job.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-xs dash-text-tertiary flex items-center gap-1">
                                        <Tag size={12} className="opacity-50" />
                                        {job.source}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2 text-xs dash-text-tertiary">
                                        <Calendar size={12} className="opacity-50" />
                                        {fmtDate(job.started_at, 'MMM DD, HH:mm')}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2 text-xs dash-text-tertiary font-mono">
                                        <Clock size={12} className="opacity-50" />
                                        {job.duration_ms ? `${(job.duration_ms / 1000).toFixed(1)}s` : '--'}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-end gap-2">
                                        {job.status === 'failed' && (
                                            <button
                                                onClick={() => handleRetry(job)}
                                                disabled={retryingIds.has(job.id)}
                                                className="p-2 rounded-lg bg-[var(--color-surface-alt)] dash-text hover:bg-[var(--color-accent)] hover:text-white transition-all disabled:opacity-50"
                                                title="Retry Job"
                                            >
                                                <RefreshCcw size={14} className={retryingIds.has(job.id) ? "animate-spin" : ""} />
                                            </button>
                                        )}
                                        <button className="p-2 rounded-lg bg-[var(--color-surface-alt)] dash-text hover:bg-[var(--color-surface-high)] transition-all">
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Failed Jobs Warning */}
            {summary && summary.latestFailures.length > 0 && (
                <div className="dash-card border-red-500/20 bg-red-500/5 rounded-2xl p-6 border">
                    <div className="flex items-center gap-2 text-red-500 mb-4 font-bold">
                        <AlertCircle size={20} />
                        <h2>System Failures Requiring Review</h2>
                    </div>
                    <div className="space-y-4">
                        {summary.latestFailures.map(fail => (
                            <div key={fail.id} className="flex items-center justify-between bg-white/5 p-4 rounded-xl">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-red-500">{fail.job_name}</span>
                                        <span className="text-[10px] bg-red-500/10 px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter self-center">FAIL</span>
                                    </div>
                                    <p className="text-xs dash-text-tertiary">{fail.error_message || 'No error message provided'}</p>
                                </div>
                                <button
                                    onClick={() => handleRetry(fail)}
                                    disabled={retryingIds.has(fail.id)}
                                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-all disabled:opacity-50"
                                >
                                    <RefreshCcw size={12} className={retryingIds.has(fail.id) ? "animate-spin" : ""} />
                                    Retry Run
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlatformJobsPage;
