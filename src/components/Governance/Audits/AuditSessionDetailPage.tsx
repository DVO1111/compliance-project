import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
    ArrowLeft,
    Users,
    FileText,
    Package,
    Plus,
    Download,
    UserPlus,
    Trash2,
    Calendar,
    Shield,
    AlertCircle,
    CheckCircle2,
    Clock,
    Scale,
    LinkIcon,
    X,
} from 'lucide-react';
import {
    AuditSession,
    AuditSessionParticipant,
    AuditRequest,
    AuditRequestItem,
    AuditRequestEvidence,
    AuditRequestStatus,
    ParticipantRole,
    AUDIT_TYPES,
    SESSION_STATUSES,
    REQUEST_STATUSES,
    getAuditSession,
    updateAuditSession,
    listParticipants,
    addParticipant,
    removeParticipant,
    listRequests,
    createRequest,
    updateRequestStatus,
    listRequestItems,
    listRequestEvidence,
    linkEvidenceToRequest,
    unlinkEvidence,
    getSessionEvidence,
} from '../../../lib/audit/auditWorkspaceService';
import { supabase } from '../../../lib/supabase';
import {
    createExportJob,
    listExportJobs,
    downloadExport,
    getAuditPackSummary,
    type AuditExportJob,
    type AuditPackSummary,
    type ExportType
} from '../../../lib/audit/auditExportEngine';
import ArchivePickerModal from './ArchivePickerModal';

/* ─── helpers ──────────────────────────────────────────────── */

function statusBadge(status: string, statuses: { id: string; label: string; color: string }[]) {
    const cfg = statuses.find(s => s.id === status) ?? { label: status, color: '#94a3b8' };
    return (
        <span
            className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
            style={{ background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}44` }}
        >
            {cfg.label}
        </span>
    );
}

function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function auditTypeLabel(type: string) {
    return AUDIT_TYPES.find(t => t.id === type)?.label ?? type;
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color?: string }) {
    return (
        <div className="dash-card border dash-border rounded-2xl p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[var(--color-surface-alt)]">
                    <Icon size={14} style={{ color: color ?? 'var(--color-accent)' }} />
                </div>
                <span className="text-[10px] font-bold dash-text-tertiary uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-xl font-bold dash-text pl-1">{value}</div>
        </div>
    );
}

/* ─── component ────────────────────────────────────────────── */

interface Props {
    auditSessionId: string | null;
    onBack: () => void;
}

type Tab = 'overview' | 'requests' | 'evidence-pack';

export default function AuditSessionDetailPage({ auditSessionId, onBack }: Props) {
    const { user, profile } = useAuth();
    const companyId = (profile as any)?.company_id;
    const isAuditor = (profile as any)?.role === 'auditor';

    const [session, setSession] = useState<AuditSession | null>(null);
    const [participants, setParticipants] = useState<AuditSessionParticipant[]>([]);
    const [requests, setRequests] = useState<AuditRequest[]>([]);
    const [sessionEvidence, setSessionEvidence] = useState<AuditRequestEvidence[]>([]);
    const [exportSummary, setExportSummary] = useState<AuditPackSummary | null>(null);
    const [exportJobs, setExportJobs] = useState<AuditExportJob[]>([]);
    const [exportType, setExportType] = useState<ExportType>('json_bundle');
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('overview');

    // Modal states
    const [showAddParticipant, setShowAddParticipant] = useState(false);
    const [showCreateRequest, setShowCreateRequest] = useState(false);
    const [showArchivePicker, setShowArchivePicker] = useState<string | null>(null); // requestId
    const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
    const [requestItems, setRequestItems] = useState<AuditRequestItem[]>([]);
    const [requestEvidence, setRequestEvidence] = useState<AuditRequestEvidence[]>([]);

    // Add participant form
    const [participantEmail, setParticipantEmail] = useState('');
    const [participantRole, setParticipantRole] = useState<ParticipantRole>('auditor');
    const [addingParticipant, setAddingParticipant] = useState(false);

    // Create request form
    const [reqTitle, setReqTitle] = useState('');
    const [reqDesc, setReqDesc] = useState('');
    const [reqDue, setReqDue] = useState('');
    const [creatingReq, setCreatingReq] = useState(false);

    // ─── data loading ─────────────────────────────────────────

    const loadSession = useCallback(async () => {
        if (!auditSessionId) return;
        setLoading(true);
        try {
            const [s, p, r, e, stats, jobs] = await Promise.all([
                getAuditSession(auditSessionId),
                listParticipants(auditSessionId),
                listRequests(auditSessionId),
                getSessionEvidence(auditSessionId),
                getAuditPackSummary(auditSessionId),
                listExportJobs(auditSessionId),
            ]);
            setSession(s);
            setParticipants(p);
            setRequests(r);
            setSessionEvidence(e);
            setExportSummary(stats);
            setExportJobs(jobs);
        } finally {
            setLoading(false);
        }
    }, [auditSessionId]);

    useEffect(() => { loadSession(); }, [loadSession]);

    const loadRequestDetail = useCallback(async (requestId: string) => {
        const [items, evidence] = await Promise.all([
            listRequestItems(requestId),
            listRequestEvidence(requestId),
        ]);
        setRequestItems(items);
        setRequestEvidence(evidence);
    }, []);

    useEffect(() => {
        if (selectedRequest) loadRequestDetail(selectedRequest);
    }, [selectedRequest, loadRequestDetail]);

    // ─── handlers ─────────────────────────────────────────────

    const handleAddParticipant = async () => {
        if (!participantEmail.trim() || !companyId || !user || !auditSessionId) return;
        setAddingParticipant(true);

        // Try to find a profile by email
        const { data: profiles } = await (supabase as any)
            .from('profiles')
            .select('id, full_name')
            .ilike('email', participantEmail.trim())
            .limit(1);

        // Also try auth.users (stored email) — use profile match or fallback to the email itself
        let userId = profiles?.[0]?.id;

        // If not found in profiles, check if there's a user with this email in the system
        if (!userId) {
            // For MVP, we'll insert with a placeholder and use invited_email
            // In production, you'd send an invite link
            // Create a placeholder participation record — use the acting user's ID as placeholder
            window.dispatchEvent(new CustomEvent('global-toast', {
                detail: { message: 'User not found. They need to create an account first, then you can add them.', type: 'warning' },
            }));
            setAddingParticipant(false);
            return;
        }

        const ok = await addParticipant(companyId, auditSessionId, userId, participantRole, participantEmail.trim(), user.id);
        if (ok) {
            setShowAddParticipant(false);
            setParticipantEmail('');
            setParticipantRole('auditor');
            await loadSession();
        }
        setAddingParticipant(false);
    };

    const handleRemoveParticipant = async (participantId: string) => {
        if (!confirm('Remove this participant?')) return;
        await removeParticipant(participantId);
        await loadSession();
    };

    const handleCreateRequest = async () => {
        if (!reqTitle.trim() || !companyId || !user || !auditSessionId) return;
        setCreatingReq(true);
        const req = await createRequest(companyId, auditSessionId, user.id, {
            title: reqTitle.trim(),
            description: reqDesc.trim() || undefined,
            due_at: reqDue || undefined,
        });
        if (req) {
            setShowCreateRequest(false);
            setReqTitle('');
            setReqDesc('');
            setReqDue('');
            await loadSession();
        }
        setCreatingReq(false);
    };

    const handleStatusChange = async (requestId: string, newStatus: AuditRequestStatus) => {
        if (!user || !companyId) return;
        await updateRequestStatus(requestId, newStatus, user.id, companyId);
        await loadSession();
        if (selectedRequest === requestId) loadRequestDetail(requestId);
    };

    const handleLinkEvidence = async (submissionId: string) => {
        if (!showArchivePicker || !companyId || !user) return;
        await linkEvidenceToRequest(companyId, showArchivePicker, submissionId, user.id);
        setShowArchivePicker(null);
        await loadSession();
        if (selectedRequest) loadRequestDetail(selectedRequest);
    };

    const handleUnlinkEvidence = async (evidenceId: string) => {
        await unlinkEvidence(evidenceId);
        if (selectedRequest) loadRequestDetail(selectedRequest);
        await loadSession();
    };

    const handleSessionStatusToggle = async () => {
        if (!session) return;
        const nextStatus = session.status === 'draft' ? 'active' : session.status === 'active' ? 'closed' : 'draft';
        await updateAuditSession(session.id, { status: nextStatus }, user!.id, companyId!);
        await loadSession();
    };

    const handleExport = async () => {
        if (!auditSessionId || !companyId || !user) return;
        const job = await createExportJob(companyId, auditSessionId, user.id, exportType);
        if (job) {
            window.dispatchEvent(new CustomEvent('global-toast', {
                detail: { message: 'Export job initiated. It will appear in the history when ready.', type: 'info' },
            }));
            // Refresh jobs list after a short delay
            setTimeout(async () => {
                const updatedJobs = await listExportJobs(auditSessionId);
                setExportJobs(updatedJobs);
            }, 2000);
        }
    };

    const handleDownloadJob = async (jobId: string) => {
        if (!companyId || !user) return;
        try {
            await downloadExport(jobId, companyId, user.id);
        } catch (err) {
            window.dispatchEvent(new CustomEvent('global-toast', {
                detail: { message: 'Failed to download: ' + (err as Error).message, type: 'error' },
            }));
        }
    };

    // ─── render ───────────────────────────────────────────────

    if (loading || !session) {
        return (
            <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto" style={{ borderColor: 'var(--color-accent)' }} />
                <p className="text-sm dash-text-tertiary mt-3">Loading audit session...</p>
            </div>
        );
    }

    const tabs: { id: Tab; label: string; icon: typeof Users; count?: number }[] = [
        { id: 'overview', label: 'Overview', icon: Shield },
        { id: 'requests', label: 'Requests', icon: FileText, count: requests.length },
        { id: 'evidence-pack', label: 'Evidence Pack', icon: Package, count: sessionEvidence.length },
    ];

    const selectedReq = requests.find(r => r.id === selectedRequest);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="p-2 rounded-xl hover:bg-[var(--color-surface-alt)] transition-colors"
                >
                    <ArrowLeft size={20} className="dash-text-secondary" />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold dash-text">{session.name}</h1>
                        {statusBadge(session.status, SESSION_STATUSES)}
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                        <span className="text-sm dash-text-secondary">{auditTypeLabel(session.audit_type)}</span>
                        <span className="text-sm dash-text-tertiary flex items-center gap-1">
                            <Calendar size={12} /> {fmtDate(session.start_date)} — {fmtDate(session.end_date)}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {!isAuditor && (
                        <button
                            onClick={handleSessionStatusToggle}
                            className="px-4 py-2 rounded-xl text-sm font-medium border dash-border hover:bg-[var(--color-surface-alt)] transition-colors"
                        >
                            {session.status === 'draft' ? 'Activate' : session.status === 'active' ? 'Close' : 'Reopen'}
                        </button>
                    )}
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md"
                        style={{ background: 'var(--color-accent)' }}
                    >
                        <Download size={16} /> Export Pack
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="dash-card border dash-border rounded-2xl p-1 flex gap-1">
                {tabs.map(t => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => { setTab(t.id); setSelectedRequest(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'text-white shadow-md' : 'dash-text-secondary hover:bg-[var(--color-surface-alt)]'
                                }`}
                            style={active ? { background: 'var(--color-accent)' } : undefined}
                        >
                            <Icon size={16} />
                            {t.label}
                            {t.count !== undefined && (
                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${active ? 'bg-white/20' : 'bg-[var(--color-surface-alt)]'
                                    }`}>
                                    {t.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            {tab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Session Info */}
                    <div className="lg:col-span-2 dash-card border dash-border rounded-2xl p-6 space-y-4">
                        <h3 className="text-sm font-bold dash-text-secondary uppercase tracking-wider">Session Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <InfoField label="Audit Type" value={auditTypeLabel(session.audit_type)} />
                            <InfoField label="Status" value={SESSION_STATUSES.find(s => s.id === session.status)?.label ?? session.status} />
                            <InfoField label="Start Date" value={fmtDate(session.start_date)} />
                            <InfoField label="End Date" value={fmtDate(session.end_date)} />
                            <InfoField label="Created" value={fmtDate(session.created_at)} />
                            <InfoField label="Requests" value={`${requests.length} total, ${requests.filter(r => r.status === 'open' || r.status === 'in_progress').length} active`} />
                        </div>
                    </div>

                    {/* Participants */}
                    <div className="dash-card border dash-border rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold dash-text-secondary uppercase tracking-wider">Participants</h3>
                            {!isAuditor && (
                                <button
                                    onClick={() => setShowAddParticipant(true)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors"
                                    title="Add Participant"
                                >
                                    <UserPlus size={16} style={{ color: 'var(--color-accent)' }} />
                                </button>
                            )}
                        </div>
                        <div className="space-y-2">
                            {participants.length === 0 ? (
                                <p className="text-sm dash-text-tertiary text-center py-4">No participants yet</p>
                            ) : (
                                participants.map(p => (
                                    <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--color-surface-alt)]">
                                        <div
                                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                            style={{ background: p.role === 'auditor' ? '#f59e0b' : 'var(--color-accent)' }}
                                        >
                                            {(p.profile?.full_name ?? p.invited_email ?? '?')[0]?.toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium dash-text truncate">
                                                {p.profile?.full_name ?? p.invited_email ?? 'Unknown'}
                                            </p>
                                            <p className="text-[11px] dash-text-tertiary capitalize">{p.role}</p>
                                        </div>
                                        {!isAuditor && p.user_id !== user?.id && (
                                            <button
                                                onClick={() => handleRemoveParticipant(p.id)}
                                                className="p-1 rounded hover:bg-red-500/10 text-red-400 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {tab === 'requests' && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Requests List */}
                    <div className="lg:col-span-2 dash-card border dash-border rounded-2xl overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b dash-border">
                            <h3 className="text-sm font-bold dash-text-secondary uppercase tracking-wider">Evidence Requests</h3>
                            <button
                                onClick={() => setShowCreateRequest(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                style={{ background: 'var(--color-accent)' }}
                            >
                                <Plus size={14} /> New Request
                            </button>
                        </div>
                        <div className="divide-y dash-border max-h-[60vh] overflow-y-auto">
                            {requests.length === 0 ? (
                                <div className="p-8 text-center">
                                    <FileText size={32} className="mx-auto mb-2 dash-text-tertiary opacity-40" />
                                    <p className="text-sm dash-text-tertiary">No evidence requests yet</p>
                                </div>
                            ) : (
                                requests.map(r => (
                                    <button
                                        key={r.id}
                                        onClick={() => setSelectedRequest(r.id)}
                                        className={`w-full text-left px-4 py-3 hover:bg-[var(--color-surface-alt)] transition-colors ${selectedRequest === r.id ? 'bg-[var(--color-surface-alt)] border-l-2' : ''
                                            }`}
                                        style={selectedRequest === r.id ? { borderColor: 'var(--color-accent)' } : undefined}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="font-medium text-sm dash-text line-clamp-1">{r.title}</p>
                                            {statusBadge(r.status, REQUEST_STATUSES)}
                                        </div>
                                        {r.description && (
                                            <p className="text-xs dash-text-tertiary mt-1 line-clamp-1">{r.description}</p>
                                        )}
                                        <div className="flex items-center gap-3 mt-1.5 text-[11px] dash-text-tertiary">
                                            <span className="flex items-center gap-1">
                                                <Clock size={10} /> {fmtDate(r.created_at)}
                                            </span>
                                            {r.due_at && (
                                                <span className="flex items-center gap-1 text-amber-500">
                                                    <AlertCircle size={10} /> Due {fmtDate(r.due_at)}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Request Detail */}
                    <div className="lg:col-span-3 dash-card border dash-border rounded-2xl p-6">
                        {!selectedReq ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <FileText size={40} className="dash-text-tertiary opacity-30 mb-3" />
                                <p className="font-medium dash-text-secondary">Select a request to view details</p>
                                <p className="text-sm dash-text-tertiary mt-1">Click any request from the list on the left</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Request header */}
                                <div>
                                    <div className="flex items-start justify-between">
                                        <h3 className="text-lg font-bold dash-text">{selectedReq.title}</h3>
                                        <button onClick={() => setSelectedRequest(null)} className="p-1 rounded hover:bg-[var(--color-surface-alt)]">
                                            <X size={16} className="dash-text-tertiary" />
                                        </button>
                                    </div>
                                    {selectedReq.description && (
                                        <p className="text-sm dash-text-secondary mt-1.5">{selectedReq.description}</p>
                                    )}
                                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                                        {statusBadge(selectedReq.status, REQUEST_STATUSES)}
                                        {selectedReq.due_at && (
                                            <span className="text-xs dash-text-tertiary flex items-center gap-1">
                                                <Calendar size={12} /> Due {fmtDate(selectedReq.due_at)}
                                            </span>
                                        )}
                                        <span className="text-xs dash-text-tertiary">
                                            Created {fmtDate(selectedReq.created_at)}
                                        </span>
                                    </div>
                                </div>

                                {/* Status actions */}
                                {!isAuditor && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold dash-text-secondary uppercase tracking-wider mr-2">Set Status:</span>
                                        {REQUEST_STATUSES.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => handleStatusChange(selectedReq.id, s.id as AuditRequestStatus)}
                                                disabled={selectedReq.status === s.id}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedReq.status === s.id
                                                    ? 'text-white shadow-sm'
                                                    : 'border dash-border dash-text-secondary hover:bg-[var(--color-surface-alt)]'
                                                    }`}
                                                style={selectedReq.status === s.id ? { background: s.color } : undefined}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Linked Items */}
                                <div>
                                    <h4 className="text-xs font-bold dash-text-secondary uppercase tracking-wider mb-2">Linked Items</h4>
                                    {requestItems.length === 0 ? (
                                        <p className="text-sm dash-text-tertiary py-2">No items linked to this request</p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {requestItems.map(item => (
                                                <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--color-surface-alt)] text-sm">
                                                    <LinkIcon size={12} className="dash-text-tertiary flex-shrink-0" />
                                                    {item.control && <span className="dash-text">Control: {item.control.reference_code} — {item.control.title}</span>}
                                                    {item.policy_version && <span className="dash-text">Policy: {item.policy_version.version_label}</span>}
                                                    {item.vendor && <span className="dash-text">Vendor: {item.vendor.name}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Linked Evidence */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-xs font-bold dash-text-secondary uppercase tracking-wider">Linked Evidence</h4>
                                        {!isAuditor && (
                                            <button
                                                onClick={() => setShowArchivePicker(selectedReq.id)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                                style={{ background: 'var(--color-accent)' }}
                                            >
                                                <Plus size={12} /> Link from Archive
                                            </button>
                                        )}
                                    </div>
                                    {requestEvidence.length === 0 ? (
                                        <p className="text-sm dash-text-tertiary py-2">No evidence linked yet</p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {requestEvidence.map(ev => (
                                                <div key={ev.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--color-surface-alt)]">
                                                    <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium dash-text truncate">{ev.submission?.title ?? 'Unknown'}</p>
                                                        <div className="flex items-center gap-2 text-[11px] dash-text-tertiary">
                                                            <span className="capitalize">{ev.submission?.platform}</span>
                                                            <span>·</span>
                                                            <span>{fmtDate(ev.submission?.created_at ?? null)}</span>
                                                        </div>
                                                    </div>
                                                    {!isAuditor && (
                                                        <button
                                                            onClick={() => handleUnlinkEvidence(ev.id)}
                                                            className="p-1 rounded hover:bg-red-500/10 text-red-400"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {tab === 'evidence-pack' && (
                <div className="space-y-6">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <StatCard label="Requests" value={exportSummary?.totalRequests ?? 0} icon={FileText} />
                        <StatCard label="Fulfilled" value={exportSummary?.fulfilledRequests ?? 0} icon={CheckCircle2} color="#10b981" />
                        <StatCard label="Evidence" value={exportSummary?.evidenceCount ?? 0} icon={Package} color="#6366f1" />
                        <StatCard label="Controls" value={exportSummary?.controlsCount ?? 0} icon={Shield} color="#8b5cf6" />
                        <StatCard label="Policies" value={exportSummary?.policiesCount ?? 0} icon={Scale} color="#ec4899" />
                        <StatCard label="Vendors" value={exportSummary?.vendorsCount ?? 0} icon={Users} color="#f59e0b" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Export Controls */}
                        <div className="lg:col-span-1 dash-card border dash-border rounded-2xl p-6 space-y-4">
                            <h3 className="text-sm font-bold dash-text-secondary uppercase tracking-wider">Export Pack</h3>
                            <p className="text-xs dash-text-tertiary">Generate a comprehensive audit bundle containing all linked documentation.</p>

                            <div className="space-y-3 pt-2">
                                <div>
                                    <label className="block text-[10px] font-bold dash-text-tertiary uppercase mb-1.5 ml-1">Format</label>
                                    <select
                                        value={exportType}
                                        onChange={(e) => setExportType(e.target.value as ExportType)}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2 text-sm focus:outline-none"
                                    >
                                        <option value="json_bundle">JSON Bundle (Audit-Ready)</option>
                                        <option value="print_view">Print View (Export to PDF)</option>
                                    </select>
                                </div>
                                <button
                                    onClick={handleExport}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md hover:brightness-110 transition-all"
                                    style={{ background: 'var(--color-accent)' }}
                                >
                                    <Download size={16} /> Generate Export
                                </button>
                            </div>
                        </div>

                        {/* Recent History */}
                        <div className="lg:col-span-2 dash-card border dash-border rounded-2xl overflow-hidden">
                            <div className="px-5 py-3 bg-[var(--color-surface-alt)] border-b dash-border">
                                <h3 className="text-xs font-bold dash-text-secondary uppercase tracking-wider">Export History</h3>
                            </div>
                            <div className="divide-y dash-border overflow-x-auto">
                                {exportJobs.length === 0 ? (
                                    <div className="p-8 text-center">
                                        <Clock size={32} className="mx-auto mb-2 dash-text-tertiary opacity-40" />
                                        <p className="text-sm dash-text-tertiary">No previous exports found</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-[var(--color-surface-alt)]/50">
                                                <th className="px-5 py-2 text-[10px] font-bold dash-text-tertiary uppercase">Created</th>
                                                <th className="px-5 py-2 text-[10px] font-bold dash-text-tertiary uppercase">Type</th>
                                                <th className="px-5 py-2 text-[10px] font-bold dash-text-tertiary uppercase">Status</th>
                                                <th className="px-5 py-2 text-right text-[10px] font-bold dash-text-tertiary uppercase">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y dash-border">
                                            {exportJobs.map(job => (
                                                <tr key={job.id} className="hover:bg-[var(--color-surface-alt)]/30 transition-colors">
                                                    <td className="px-5 py-3 text-xs dash-text-secondary">{fmtDate(job.created_at)}</td>
                                                    <td className="px-5 py-3 text-xs dash-text">
                                                        <span className="capitalize">{job.export_type.replace('_', ' ')}</span>
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${job.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 underline' :
                                                            job.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                                                                'bg-amber-500/10 text-amber-500'
                                                            }`}>
                                                            {job.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3 text-right">
                                                        {job.status === 'completed' && (
                                                            <button
                                                                onClick={() => handleDownloadJob(job.id)}
                                                                className="text-[var(--color-accent)] hover:underline text-xs flex items-center gap-1 justify-end ml-auto"
                                                            >
                                                                <Download size={12} /> Download
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Preview List */}
                    <div className="dash-card border dash-border rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xs font-bold dash-text-secondary uppercase tracking-wider">Preview: Evidence Summary</h4>
                            <span className="text-[10px] dash-text-tertiary">{sessionEvidence.length} items linked</span>
                        </div>
                        <div className="space-y-1.5">
                            {sessionEvidence.map((ev, i) => (
                                <div key={ev.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--color-surface-alt)]/50 border dash-border">
                                    <span className="text-[10px] font-bold dash-text-tertiary w-4">{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium dash-text truncate">{ev.submission?.title ?? 'Unknown'}</p>
                                        <p className="text-[10px] dash-text-tertiary capitalize">
                                            {ev.submission?.platform} · {fmtDate(ev.submission?.created_at ?? null)}
                                        </p>
                                    </div>
                                    <CheckCircle2 size={12} className="text-emerald-500 opacity-60" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modals ──────────────────────────────────────────── */}

            {/* Add Participant */}
            {showAddParticipant && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="dash-card border dash-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-lg font-bold dash-text mb-4 flex items-center gap-2">
                            <UserPlus size={20} style={{ color: 'var(--color-accent)' }} />
                            Add Participant
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">User Email *</label>
                                <input
                                    value={participantEmail}
                                    onChange={e => setParticipantEmail(e.target.value)}
                                    placeholder="auditor@example.com"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">Role</label>
                                <select
                                    value={participantRole}
                                    onChange={e => setParticipantRole(e.target.value as ParticipantRole)}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                                >
                                    <option value="auditor">Auditor (External)</option>
                                    <option value="admin">Admin</option>
                                    <option value="member">Member</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowAddParticipant(false)}
                                className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:bg-[var(--color-surface-alt)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddParticipant}
                                disabled={!participantEmail.trim() || addingParticipant}
                                className="px-6 py-2 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                                style={{ background: 'var(--color-accent)' }}
                            >
                                {addingParticipant ? 'Adding...' : 'Add Participant'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Request */}
            {showCreateRequest && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="dash-card border dash-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-lg font-bold dash-text mb-4 flex items-center gap-2">
                            <FileText size={20} style={{ color: 'var(--color-accent)' }} />
                            New Evidence Request
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">Title *</label>
                                <input
                                    value={reqTitle}
                                    onChange={e => setReqTitle(e.target.value)}
                                    placeholder="e.g. Access control policy evidence"
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">Description</label>
                                <textarea
                                    value={reqDesc}
                                    onChange={e => setReqDesc(e.target.value)}
                                    placeholder="Details about what evidence is needed..."
                                    rows={3}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 resize-none"
                                    style={{ '--tw-ring-color': 'var(--color-accent)' } as any}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold dash-text-secondary mb-1.5 uppercase tracking-wider">Due Date</label>
                                <input
                                    type="date"
                                    value={reqDue}
                                    onChange={e => setReqDue(e.target.value)}
                                    className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowCreateRequest(false)}
                                className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:bg-[var(--color-surface-alt)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateRequest}
                                disabled={!reqTitle.trim() || creatingReq}
                                className="px-6 py-2 rounded-xl text-sm font-semibold text-white shadow-md disabled:opacity-50"
                                style={{ background: 'var(--color-accent)' }}
                            >
                                {creatingReq ? 'Creating...' : 'Create Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Archive Picker */}
            {showArchivePicker && (
                <ArchivePickerModal
                    onSelect={handleLinkEvidence}
                    onClose={() => setShowArchivePicker(null)}
                    excludeIds={requestEvidence.map(e => e.submission_id)}
                />
            )}
        </div>
    );
}

/* ─── Sub-components ───────────────────────────────────────── */

function InfoField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[11px] font-bold dash-text-tertiary uppercase tracking-wider">{label}</p>
            <p className="text-sm font-medium dash-text mt-0.5">{value}</p>
        </div>
    );
}
