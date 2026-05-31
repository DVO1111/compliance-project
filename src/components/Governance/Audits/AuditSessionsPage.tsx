import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
    Plus,
    Search,
    Shield,
    Calendar,
    Users,
    AlertCircle,
    ChevronRight,
    FileCheck,
    Filter,
} from 'lucide-react';
import {
    AuditSession,
    AuditType,
    AUDIT_TYPES,
    SESSION_STATUSES,
    createAuditSession,
    listAuditSessions,
    listAuditSessionsForAuditor,
} from '../../../lib/audit/auditWorkspaceService';

/* ─── helpers ──────────────────────────────────────────────── */

function statusBadge(status: string) {
    const cfg = SESSION_STATUSES.find(s => s.id === status) ?? { label: status, color: '#94a3b8' };
    return (
        <span
            className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
            style={{ background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}44` }}
        >
            {cfg.label}
        </span>
    );
}

function auditTypeLabel(type: string) {
    return AUDIT_TYPES.find(t => t.id === type)?.label ?? type;
}

function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── component ────────────────────────────────────────────── */

export default function AuditSessionsPage() {
    const { user, profile } = useAuth();
    const companyId = (profile as any)?.company_id;
    const isAuditor = (profile as any)?.role === 'auditor';

    const [sessions, setSessions] = useState<AuditSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState<string>('all');

    // Create form
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState<AuditType>('soc2');
    const [newStart, setNewStart] = useState('');
    const [newEnd, setNewEnd] = useState('');
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = isAuditor
                ? await listAuditSessionsForAuditor(user!.id)
                : await listAuditSessions(companyId, user!.id);
            setSessions(data);
        } finally {
            setLoading(false);
        }
    }, [companyId, user, isAuditor]);

    useEffect(() => { if (companyId || isAuditor) load(); }, [companyId, isAuditor, load]);

    const handleCreate = async () => {
        if (!newName.trim() || !companyId || !user) return;
        setCreating(true);
        const session = await createAuditSession(companyId, user.id, {
            name: newName.trim(),
            audit_type: newType,
            start_date: newStart || undefined,
            end_date: newEnd || undefined,
        });
        if (session) {
            setShowCreate(false);
            setNewName('');
            setNewType('soc2');
            setNewStart('');
            setNewEnd('');
            await load();
        }
        setCreating(false);
    };

    const filtered = sessions.filter(s => {
        if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterType !== 'all' && s.audit_type !== filterType) return false;
        return true;
    });

    const openDetail = (id: string) => {
        window.dispatchEvent(new CustomEvent('navigate', {
            detail: { page: 'audit-session-detail', auditSessionId: id },
        }));
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold dash-text flex items-center gap-3">
                        <div className="p-2 rounded-xl shadow-md" style={{ background: 'var(--color-accent)' }}>
                            <Shield size={22} className="text-white" />
                        </div>
                        Audit Workspace
                    </h1>
                    <p className="text-sm dash-text-secondary mt-1">
                        {isAuditor ? 'Your assigned audit sessions' : 'Manage audit sessions and evidence requests'}
                    </p>
                </div>
                {!isAuditor && (
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg hover:shadow-xl transition-all"
                        style={{ background: 'var(--color-accent)' }}
                    >
                        <Plus size={18} /> New Session
                    </button>
                )}
            </div>

            {/* Filters */}
            <div className="dash-card border dash-border rounded-2xl p-4 flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search sessions..."
                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1"
                        style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter size={14} className="dash-text-tertiary" />
                    <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        className="bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2 text-sm focus:outline-none"
                    >
                        <option value="all">All Types</option>
                        {AUDIT_TYPES.map(t => (
                            <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Sessions Table */}
            <div className="dash-card border dash-border rounded-2xl overflow-hidden shadow-sm">
                {loading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-3" style={{ borderColor: 'var(--color-accent)' }} />
                        <p className="text-sm dash-text-tertiary">Loading audit sessions...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-12 text-center">
                        <Shield size={40} className="mx-auto mb-3 dash-text-tertiary opacity-40" />
                        <p className="font-semibold dash-text">No audit sessions found</p>
                        <p className="text-sm dash-text-tertiary mt-1">
                            {isAuditor ? 'You have not been assigned to any audit sessions yet.' : 'Create your first audit session to get started.'}
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b dash-border bg-[var(--color-surface-alt)]">
                                <th className="text-left px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">Session</th>
                                <th className="text-left px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">Type</th>
                                <th className="text-left px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">Status</th>
                                <th className="text-left px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">Dates</th>
                                <th className="text-center px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">Participants</th>
                                <th className="text-center px-5 py-3 font-semibold dash-text-secondary text-xs uppercase tracking-wider">Open Requests</th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(s => (
                                <tr
                                    key={s.id}
                                    className="border-b dash-border hover:bg-[var(--color-surface-alt)] cursor-pointer transition-colors"
                                    onClick={() => openDetail(s.id)}
                                >
                                    <td className="px-5 py-4">
                                        <p className="font-semibold dash-text">{s.name}</p>
                                        <p className="text-xs dash-text-tertiary mt-0.5">{s.id.slice(0, 8)}</p>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-[var(--color-surface-alt)] dash-text-secondary">
                                            {auditTypeLabel(s.audit_type)}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">{statusBadge(s.status)}</td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-1.5 text-xs dash-text-secondary">
                                            <Calendar size={12} />
                                            <span>{formatDate(s.start_date)} — {formatDate(s.end_date)}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <Users size={14} className="dash-text-tertiary" />
                                            <span className="font-semibold dash-text">{s.participants_count ?? 0}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <AlertCircle size={14} className={`${(s.open_requests_count ?? 0) > 0 ? 'text-amber-500' : 'dash-text-tertiary'}`} />
                                            <span className={`font-semibold ${(s.open_requests_count ?? 0) > 0 ? 'text-amber-500' : 'dash-text'}`}>
                                                {s.open_requests_count ?? 0}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <ChevronRight size={16} className="dash-text-tertiary" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Create Session Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="dash-card border dash-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-lg font-bold dash-text mb-4 flex items-center gap-2">
                            <FileCheck size={20} style={{ color: 'var(--color-accent)' }} />
                            Create Audit Session
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">Session Name *</label>
                                <input
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="e.g. SOC 2 Type II 2026"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">Audit Type</label>
                                <select
                                    value={newType}
                                    onChange={e => setNewType(e.target.value as AuditType)}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                                >
                                    {AUDIT_TYPES.map(t => (
                                        <option key={t.id} value={t.id}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">Start Date</label>
                                    <input
                                        type="date"
                                        value={newStart}
                                        onChange={e => setNewStart(e.target.value)}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">End Date</label>
                                    <input
                                        type="date"
                                        value={newEnd}
                                        onChange={e => setNewEnd(e.target.value)}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:bg-[var(--color-surface-alt)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!newName.trim() || creating}
                                className="px-6 py-2 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50 transition-all"
                                style={{ background: 'var(--color-accent)' }}
                            >
                                {creating ? 'Creating...' : 'Create Session'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
