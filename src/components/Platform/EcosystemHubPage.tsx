import React, { useEffect, useState } from 'react';
import {
    Plug,
    KeyRound,
    Radio,
    Activity,
    Terminal,
    ShieldCheck,
    ExternalLink,
    Copy,
    Zap,
    RefreshCcw,
    CheckCircle2,
    AlertCircle,
    FileCode,
    BookOpen
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ecosystemAdminService, EcosystemOverview } from '../../lib/platform/ecosystemAdminService';
import { DEVELOPER_DOCS } from '../../lib/platform/developerDocs';
import WebhooksPage from './WebhooksPage';
import EvidenceIngestionsPage from './EvidenceIngestionsPage';
import { logger } from '../../lib/logger';

/* ─── Components ────────────────────────────────────────────── */

const EcosystemHubPage: React.FC = () => {
    const { profile } = useAuth();
    const companyId = profile?.company_id;

    const [activeTab, setActiveTab] = useState<'overview' | 'api' | 'webhooks' | 'evidence' | 'docs' | 'activity'>('overview');
    const [overview, setOverview] = useState<EcosystemOverview | null>(null);
    const [apiActivity, setApiActivity] = useState<any[]>([]);
    const [webhookHealth, setWebhookHealth] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            const [ovData, actData, healthData] = await Promise.all([
                ecosystemAdminService.getOverview(companyId),
                ecosystemAdminService.getApiActivity(companyId),
                ecosystemAdminService.getWebhookHealth(companyId)
            ]);
            setOverview(ovData);
            setApiActivity(actData);
            setWebhookHealth(healthData);
        } catch (err) {
            logger.error('Failed to load ecosystem data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [companyId]);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        window.dispatchEvent(new CustomEvent('global-toast', { detail: { message: 'Copied to clipboard', type: 'success' } }));
    };

    return (
        <div className="p-8 max-w-[1600px] mx-auto flex flex-col gap-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Plug className="text-indigo-400" size={32} />
                        Partner Toolkit & Ecosystem
                    </h1>
                    <p className="text-slate-400 mt-1">Unified control tower for API request observability, diagnostics, and documentation.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchData}
                        className="p-2.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-all border border-slate-700"
                    >
                        <RefreshCcw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-2xl border border-white/5 w-fit overflow-x-auto">
                {[
                    { id: 'overview', label: 'Overview', icon: ShieldCheck },
                    { id: 'api', label: 'API Access', icon: KeyRound },
                    { id: 'webhooks', label: 'Webhooks', icon: Radio },
                    { id: 'evidence', label: 'Ingestion', icon: Activity },
                    { id: 'docs', label: 'Docs', icon: BookOpen },
                    { id: 'activity', label: 'Activity', icon: Activity },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all font-bold text-sm whitespace-nowrap ${activeTab === tab.id
                            ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                            : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {activeTab === 'overview' && (
                    <div className="space-y-8">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="glass-card p-6 border border-white/5 flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                                        <KeyRound size={24} />
                                    </div>
                                    <span className="text-3xl font-extrabold text-white">{overview?.activeApiKeys || 0}</span>
                                </div>
                                <h3 className="font-bold text-slate-300 text-sm">Active API Keys</h3>
                            </div>

                            <div className="glass-card p-6 border border-white/5 flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                                        <Radio size={24} />
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-3xl font-extrabold text-white">{webhookHealth?.successRate.toFixed(1) || 100}%</span>
                                        <span className="text-[10px] text-emerald-400 font-bold uppercase">Success Rate (24h)</span>
                                    </div>
                                </div>
                                <h3 className="font-bold text-slate-300 text-sm">Webhook Reliability</h3>
                            </div>

                            <div className="glass-card p-6 border border-white/5 flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                                        <Activity size={24} />
                                    </div>
                                    <span className="text-3xl font-extrabold text-white">{overview?.ingestionsReceived7d || 0}</span>
                                </div>
                                <h3 className="font-bold text-slate-300 text-sm">Ingestions (7d)</h3>
                            </div>

                            <div className="glass-card p-6 border border-white/5 flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 rounded-xl bg-fuchsia-500/10 text-fuchsia-400">
                                        <ShieldCheck size={24} />
                                    </div>
                                    <span className="text-3xl font-extrabold text-white">{apiActivity.length > 50 ? '50+' : apiActivity.length}</span>
                                </div>
                                <h3 className="font-bold text-slate-300 text-sm">Recent API Requests</h3>
                            </div>
                        </div>

                        {/* Health Watch */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="glass-card p-6 border border-rose-500/20 bg-rose-500/5">
                                <h2 className="text-lg font-bold text-rose-500 flex items-center gap-2 mb-4">
                                    <AlertCircle size={20} />
                                    Recent Diagnostic Failures
                                </h2>
                                <div className="space-y-4">
                                    {webhookHealth?.commonErrors.length > 0 ? (
                                        webhookHealth.commonErrors.map((err: any) => (
                                            <div key={err.msg} className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-white">{err.msg}</span>
                                                    <p className="text-xs text-slate-500">Frequency in last 24h</p>
                                                </div>
                                                <span className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-500 font-bold text-sm">{err.count}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-8 text-center text-slate-500 italic text-sm">No delivery failures in the last 24h.</div>
                                    )}
                                </div>
                            </div>

                            <div className="glass-card p-6 border border-indigo-500/20 bg-indigo-500/5 flex flex-col justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-indigo-400 flex items-center gap-2 mb-4">
                                        <Zap size={20} />
                                        Operational Visibility
                                    </h2>
                                    <p className="text-sm text-slate-300 leading-relaxed mb-6">
                                        Platform telemetry is now active. All requests through the v1 gateway are logged with latency and outcome metrics for troubleshooting.
                                    </p>
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 text-xs text-slate-400">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            API Gateway instrumentation: Enabled
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-400">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            Webhook outbox worker: Active
                                        </div>
                                    </div>
                                </div>
                                <button className="mt-6 w-full py-3 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 transition-all text-sm">
                                    View Full Activity Log
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'api' && (
                    <div className="flex flex-col gap-6">
                        <div className="glass-card p-12 text-center border border-white/5 flex flex-col items-center gap-4">
                            <KeyRound size={48} className="text-slate-600 opacity-30" />
                            <div>
                                <h2 className="text-xl font-bold text-white">API Access Management</h2>
                                <p className="text-slate-500 max-w-md mx-auto mt-2">
                                    Currently using localized API keys. In this sprint, we recommend creating Service Accounts to map your keys to dedicated principals.
                                </p>
                            </div>
                            <button className="premium-button px-8 py-3 rounded-2xl bg-indigo-500 text-white font-bold">
                                Create Service Account
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'webhooks' && <WebhooksPage />}

                {activeTab === 'evidence' && <EvidenceIngestionsPage />}

                {activeTab === 'docs' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-4 space-y-4">
                            {DEVELOPER_DOCS.map(doc => (
                                <button
                                    key={doc.id}
                                    className="w-full glass-card p-5 border border-white/5 text-left hover:bg-white/5 transition-all group"
                                >
                                    <h3 className="font-bold text-white inline-flex items-center gap-2">
                                        {doc.title}
                                        <ExternalLink size={14} className="opacity-0 group-hover:opacity-100 transition-all" />
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-1">{doc.description}</p>
                                </button>
                            ))}
                        </div>
                        <div className="lg:col-span-8 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                            {DEVELOPER_DOCS.map(doc => (
                                <div key={doc.id} className="glass-card p-8 border border-white/5 bg-slate-950/30">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                            <BookOpen size={18} />
                                        </div>
                                        <h2 className="text-xl font-extrabold text-white">{doc.title}</h2>
                                    </div>
                                    <div className="prose prose-invert prose-sm max-w-none text-slate-400 leading-relaxed whitespace-pre-wrap">
                                        {doc.content}
                                    </div>
                                    {doc.code && (
                                        <div className="mt-6 rounded-2xl bg-black border border-white/5 p-6 relative group">
                                            <button
                                                onClick={() => copyToClipboard(doc.code!)}
                                                className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 text-slate-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Copy size={14} />
                                            </button>
                                            <pre className="text-[11px] font-mono text-emerald-400 overflow-x-auto leading-relaxed">
                                                {doc.code}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'activity' && (
                    <div className="glass-card border border-white/5 overflow-hidden">
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
                            <h2 className="font-bold text-white flex items-center gap-2">
                                <Activity size={18} className="text-fuchsia-400" />
                                Recent Telemetry Logs
                            </h2>
                            <span className="text-xs text-slate-500 uppercase font-bold tracking-widest">Live Trace</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-950/50 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                        <th className="px-6 py-4">Timestamp</th>
                                        <th className="px-6 py-4">Method & Path</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Latency</th>
                                        <th className="px-6 py-4">Principal</th>
                                        <th className="px-6 py-4 text-right">Error</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 text-sm">
                                    {apiActivity.map((log: any) => (
                                        <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-4 text-slate-500 font-mono text-[11px]">
                                                {new Date(log.created_at).toLocaleTimeString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.method === 'POST' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-slate-500/10 text-slate-400'
                                                        }`}>
                                                        {log.method}
                                                    </span>
                                                    <span className="text-white font-mono text-xs">{log.path}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`font-bold ${log.status_code >= 400 ? 'text-rose-500' : 'text-emerald-500'
                                                    }`}>
                                                    {log.status_code}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-400 text-xs">
                                                {log.latency_ms}ms
                                            </td>
                                            <td className="px-6 py-4 text-slate-300">
                                                {log.service_account?.name || log.api_key?.name || 'Anonymous'}
                                            </td>
                                            <td className="px-6 py-4 text-right text-rose-500 italic text-[11px]">
                                                {log.error_message}
                                            </td>
                                        </tr>
                                    ))}
                                    {apiActivity.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">
                                                No API activity logged yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EcosystemHubPage;
