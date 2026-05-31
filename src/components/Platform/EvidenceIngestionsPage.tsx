import React, { useEffect, useState } from 'react';
import {
    Activity,
    ChevronRight,
    Search,
    Filter,
    Clock,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Archive,
    Shield,
    FileText,
    ExternalLink,
    RefreshCw
} from 'lucide-react';
import { externalEvidenceService, IngestionRecord, IngestionStatus } from '../../lib/platform/externalEvidenceService';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../lib/logger';

const EvidenceIngestionsPage: React.FC = () => {
    const { profile } = useAuth();
    const [ingestions, setIngestions] = useState<IngestionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<IngestionStatus | 'all'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const loadIngestions = async () => {
        if (!profile?.company_id) return;
        setLoading(true);
        try {
            const data = await externalEvidenceService.listIngestions(
                profile.company_id,
                filterStatus === 'all' ? undefined : { status: filterStatus }
            );
            setIngestions(data);
        } catch (err) {
            logger.error('Failed to load ingestions:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadIngestions();
    }, [profile?.company_id, filterStatus]);

    const filteredIngestions = ingestions.filter(ing =>
        ing.source_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ing.source_type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getStatusIcon = (status: IngestionStatus) => {
        switch (status) {
            case 'processed': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            case 'failed': return <XCircle className="w-4 h-4 text-rose-500" />;
            case 'received': return <Clock className="w-4 h-4 text-amber-500" />;
            default: return <AlertCircle className="w-4 h-4 text-slate-500" />;
        }
    };

    const getStatusBadge = (status: IngestionStatus) => {
        const styles = {
            processed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
            failed: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
            received: 'bg-amber-500/10 text-amber-500 border-amber-500/20'
        };
        return (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
                {status.toUpperCase()}
            </span>
        );
    };

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                            <Activity className="w-8 h-8" />
                        </div>
                        External Evidence Ingestion
                    </h1>
                    <p className="text-slate-400">
                        Monitor and manage evidence pushed from third-party systems via API.
                    </p>
                </div>
                <button
                    onClick={loadIngestions}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Total Ingestions', value: ingestions.length, icon: Activity, color: 'text-blue-400' },
                    { label: 'Processed', value: ingestions.filter(i => i.status === 'processed').length, icon: CheckCircle2, color: 'text-emerald-400' },
                    { label: 'Failed', value: ingestions.filter(i => i.status === 'failed').length, icon: XCircle, color: 'text-rose-400' },
                    { label: 'Pending', value: ingestions.filter(i => i.status === 'received').length, icon: Clock, color: 'text-amber-400' },
                ].map((stat, i) => (
                    <div key={i} className="glass-card p-4 flex items-center gap-4 border border-white/5">
                        <div className={`p-3 bg-white/5 rounded-xl ${stat.color}`}>
                            <stat.icon className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">{stat.label}</p>
                            <p className="text-2xl font-bold text-white">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="glass-card p-4 border border-white/5 mb-6 flex flex-wrap items-center gap-4">
                <div className="relative flex-1 min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search source name or type..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-900/50 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as any)}
                        className="bg-slate-900/50 border border-white/10 rounded-lg py-2 pl-4 pr-10 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    >
                        <option value="all">All Statuses</option>
                        <option value="received">Received</option>
                        <option value="processed">Processed</option>
                        <option value="failed">Failed</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="glass-card border border-white/5 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-white/5 border-b border-white/10 text-slate-400 text-sm uppercase tracking-wider font-semibold">
                            <th className="px-6 py-4">Received At</th>
                            <th className="px-6 py-4">Source</th>
                            <th className="px-6 py-4">Type</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Links</th>
                            <th className="px-6 py-4">Detail</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredIngestions.map((ing) => (
                            <tr key={ing.id} className="hover:bg-white/5 transition-colors group">
                                <td className="px-6 py-4 text-slate-300 text-sm">
                                    {new Date(ing.created_at).toLocaleString()}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="text-white font-medium">{ing.source_name}</span>
                                        <span className="text-xs text-slate-500">{ing.source_type}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-slate-400 text-sm">{(ing.metadata as any)?.evidence_type || 'Unknown'}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        {getStatusIcon(ing.status)}
                                        {getStatusBadge(ing.status)}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex gap-2">
                                        {ing.submission_id && (
                                            <div title="Linked to Archive" className="p-1 bg-indigo-500/10 text-indigo-400 rounded">
                                                <Archive className="w-4 h-4" />
                                            </div>
                                        )}
                                        {ing.related_control_id && (
                                            <div title="Linked to GRC Control" className="p-1 bg-emerald-500/10 text-emerald-400 rounded">
                                                <Shield className="w-4 h-4" />
                                            </div>
                                        )}
                                        {ing.related_audit_request_id && (
                                            <div title="Linked to Audit Request" className="p-1 bg-amber-500/10 text-amber-400 rounded">
                                                <FileText className="w-4 h-4" />
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-slate-500 hover:text-white transition-colors">
                                        <ExternalLink className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredIngestions.length === 0 && (
                    <div className="p-12 text-center text-slate-500">
                        No ingestion records found.
                    </div>
                )}
            </div>
        </div>
    );
};

export default EvidenceIngestionsPage;
