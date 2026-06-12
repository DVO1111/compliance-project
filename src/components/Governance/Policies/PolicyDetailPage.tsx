import { useState, useEffect } from 'react';
import {
    ArrowLeft,
    History,
    Users,
    FileCheck,
    Shield,
    Calendar,
    Plus,
    Eye,
    CheckCircle2,
    Clock,
    AlertCircle,
    Send,
    UserCheck as UserCheckIcon,
    RefreshCw,
    ThumbsUp,
    ThumbsDown,
    Archive,
    RotateCcw,
} from 'lucide-react';
import { policyService, Policy, PolicyVersion } from '../../../lib/governance/policyService';
import { useAuth } from '../../../contexts/AuthContext';
import AddVersionModal from './AddVersionModal';
import { logger } from '../../../lib/logger';

interface PolicyDetailPageProps {
    policyId: string | null;
    onBack: () => void;
}

type Tab = 'versions' | 'compliance' | 'review_cycle';

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
    draft:            { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300', label: 'Draft' },
    under_review:     { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', label: 'Under Review' },
    pending_approval: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', label: 'Pending Approval' },
    approved:         { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', label: 'Approved' },
    published:        { bg: 'bg-[var(--color-success-soft)]', text: 'text-[var(--color-success)]', border: 'border-[var(--color-success-border)]', label: 'Published' },
    archived:         { bg: 'bg-[var(--color-surface-alt)]', text: 'text-gray-500', border: 'border-gray-300', label: 'Archived' },
    retired:          { bg: 'bg-red-50', text: 'text-red-500', border: 'border-red-200', label: 'Retired' },
};

function StatusBadge({ status }: { status: string }) {
    const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${s.bg} ${s.text} ${s.border}`}>
            {s.label}
        </span>
    );
}

export default function PolicyDetailPage({ policyId, onBack }: PolicyDetailPageProps) {
    const { user, profile } = useAuth();
    const isAdmin = (profile as any)?.role === 'admin' || (profile as any)?.role === 'owner';
    const [policy, setPolicy] = useState<Policy | null>(null);
    const [versions, setVersions] = useState<PolicyVersion[]>([]);
    const [acknowledgements, setAcknowledgements] = useState<any[]>([]);
    const [complianceStats, setComplianceStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showAddVersionModal, setShowAddVersionModal] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('versions');

    // Workflow action state
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [showRejectModal, setShowRejectModal] = useState<string | null>(null); // versionId
    const [showReviewModal, setShowReviewModal] = useState<string | null>(null); // versionId

    // Review cycle state
    const [reviewCycleMonths, setReviewCycleMonths] = useState(12);
    const [cycleUpdating, setCycleUpdating] = useState(false);

    const fetchData = async () => {
        if (!policyId || !profile?.company_id) return;
        try {
            setLoading(true);
            const policies = await policyService.listPolicies(profile.company_id);
            const p = policies.find(p => p.id === policyId);
            if (p) {
                setPolicy(p);
                const [vData, aData, cData] = await Promise.all([
                    policyService.listPolicyVersions(policyId),
                    policyService.listPolicyAcknowledgements(policyId),
                    policyService.getAcknowledgementCompliance(policyId, profile.company_id)
                ]);
                setVersions(vData);
                setAcknowledgements(aData);
                setComplianceStats(cData);
                setReviewCycleMonths((p as any).review_cycle_months ?? 12);
            }
        } catch (error) {
            logger.error('Error fetching policy detail:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [policyId, profile?.company_id]);

    const handlePublish = async (versionId: string) => {
        if (!user) return;
        setActionLoading(versionId + '_publish');
        try {
            await policyService.publishPolicyVersion(profile?.company_id || '', user.id, versionId);
            await fetchData();
        } catch (error) {
            logger.error('Failed to publish:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleSubmitForReview = async (versionId: string) => {
        if (!user) return;
        setShowReviewModal(versionId);
    };

    const confirmSubmitForReview = async () => {
        if (!user || !showReviewModal) return;
        setActionLoading(showReviewModal + '_review');
        try {
            await policyService.submitForReview(showReviewModal, null, user.id);
            setShowReviewModal(null);
            await fetchData();
        } catch (error) {
            logger.error('Failed to submit for review:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleApprove = async (versionId: string) => {
        if (!user) return;
        setActionLoading(versionId + '_approve');
        try {
            await policyService.approveVersion(versionId, user.id);
            await fetchData();
        } catch (error) {
            logger.error('Failed to approve:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async () => {
        if (!user || !showRejectModal) return;
        setActionLoading(showRejectModal + '_reject');
        try {
            await policyService.rejectVersion(showRejectModal, user.id, reviewNotes);
            setShowRejectModal(null);
            setReviewNotes('');
            await fetchData();
        } catch (error) {
            logger.error('Failed to reject:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRetire = async () => {
        if (!user || !policyId) return;
        if (!window.confirm('Are you sure you want to retire this policy? All published versions will be archived.')) return;
        setActionLoading('retire');
        try {
            await policyService.retirePolicy(policyId, user.id);
            await fetchData();
        } catch (error) {
            logger.error('Failed to retire policy:', error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleSaveReviewCycle = async () => {
        if (!policyId) return;
        setCycleUpdating(true);
        try {
            await policyService.scheduleReviewCycle(policyId, reviewCycleMonths);
            await fetchData();
        } catch (error) {
            logger.error('Failed to update review cycle:', error);
        } finally {
            setCycleUpdating(false);
        }
    };

    const handleSendReminder = async (userId: string) => {
        const publishedVer = versions.find(v => v.status === 'published');
        if (!publishedVer) return;
        try {
            await policyService.sendManualReminder(publishedVer.id, userId);
            alert('Reminder sent!');
        } catch (err) {
            logger.error('Failed to send reminder:', err);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-accent)]"></div>
            </div>
        );
    }

    if (!policy) {
        return (
            <div className="p-8 text-center space-y-4">
                <AlertCircle className="mx-auto text-[var(--color-danger)]" size={48} />
                <h2 className="text-xl font-bold dash-text">Policy Not Found</h2>
                <button onClick={onBack} className="dash-button-primary">Back to Policies</button>
            </div>
        );
    }

    const policyAny = policy as any;

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-sm dash-text-tertiary hover:dash-text-primary transition-colors"
            >
                <ArrowLeft size={16} />
                <span>Back to Policies</span>
            </button>

            <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <h1 className="text-3xl font-bold dash-text">{policy.title}</h1>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--color-surface-alt)] border dash-border dash-text-tertiary">
                            {policy.category}
                        </span>
                    </div>
                    <p className="text-sm dash-text-secondary max-w-2xl">{policy.description}</p>
                </div>

                <div className="flex gap-3 h-fit flex-wrap">
                    <button
                        onClick={() => setShowAddVersionModal(true)}
                        className="dash-button-primary flex items-center gap-2"
                    >
                        <Plus size={18} />
                        <span>New Version</span>
                    </button>
                    {isAdmin && policy.is_active && (
                        <button
                            onClick={handleRetire}
                            disabled={actionLoading === 'retire'}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl border dash-border text-sm font-semibold dash-text-tertiary hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all disabled:opacity-50"
                        >
                            <Archive size={16} />
                            {actionLoading === 'retire' ? 'Retiring…' : 'Retire Policy'}
                        </button>
                    )}
                </div>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="dash-card border dash-border rounded-2xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                        <History size={24} />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Versions</div>
                        <div className="text-2xl font-bold dash-text">{versions.length}</div>
                    </div>
                </div>
                <div className="dash-card border dash-border rounded-2xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-green-500/10 text-green-500">
                        <Users size={24} />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Comp. Rate</div>
                        <div className="text-2xl font-bold dash-text">{complianceStats?.rate?.toFixed(0) ?? 0}%</div>
                    </div>
                </div>
                <div className="dash-card border dash-border rounded-2xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
                        <Clock size={24} />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Next Review</div>
                        <div className="text-sm font-bold dash-text">
                            {policyAny.next_review_due
                                ? new Date(policyAny.next_review_due).toLocaleDateString()
                                : 'Not set'}
                        </div>
                    </div>
                </div>
                <div className="dash-card border dash-border rounded-2xl p-4 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                        <Shield size={24} />
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest dash-text-tertiary">Status</div>
                        <div className="text-lg font-bold dash-text capitalize">{policy.is_active ? 'Active' : 'Retired'}</div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="dash-card border dash-border rounded-2xl overflow-hidden">
                <div className="flex border-b dash-border">
                    {([
                        { id: 'versions' as Tab, label: 'Version History', icon: Clock },
                        { id: 'compliance' as Tab, label: 'Compliance Tracking', icon: UserCheckIcon },
                        { id: 'review_cycle' as Tab, label: 'Review Cycle', icon: RefreshCw },
                    ] as { id: Tab; label: string; icon: typeof Clock }[]).map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === id ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent dash-text-tertiary hover:dash-text-primary'}`}
                        >
                            <Icon size={16} />
                            {label}
                        </button>
                    ))}
                </div>

                <div className="p-6">
                    {/* ── Version History ── */}
                    {activeTab === 'versions' && (
                        <div className="space-y-4">
                            {versions.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="dash-text-tertiary text-[10px] font-bold uppercase tracking-widest border-b dash-border">
                                                <th className="pb-3 px-2">Version</th>
                                                <th className="pb-3 px-2">Status</th>
                                                <th className="pb-3 px-2">Requires Sign</th>
                                                <th className="pb-3 px-2">Effective Date</th>
                                                <th className="pb-3 px-2">Created</th>
                                                <th className="pb-3 px-2 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y dash-border">
                                            {versions.map(v => {
                                                const isActioning = (suffix: string) => actionLoading === v.id + suffix;
                                                return (
                                                    <tr key={v.id} className="group hover:bg-[var(--color-surface-alt)] transition-colors">
                                                        <td className="py-4 px-2">
                                                            <div className="text-sm font-semibold dash-text">v{v.version_label}</div>
                                                            {v.review_notes && (
                                                                <div className="text-[10px] dash-text-tertiary italic mt-0.5 max-w-[200px] truncate">
                                                                    Note: {v.review_notes}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="py-4 px-2">
                                                            <StatusBadge status={v.status} />
                                                        </td>
                                                        <td className="py-4 px-2">
                                                            {v.requires_ack ? (
                                                                <span className="text-xs text-[var(--color-accent)] font-medium flex items-center gap-1">
                                                                    <CheckCircle2 size={12} /> Mandatory
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-gray-400">Optional</span>
                                                            )}
                                                        </td>
                                                        <td className="py-4 px-2 text-xs dash-text">
                                                            {v.effective_date ? new Date(v.effective_date).toLocaleDateString() : 'N/A'}
                                                        </td>
                                                        <td className="py-4 px-2 text-xs dash-text-tertiary">
                                                            {new Date(v.created_at).toLocaleDateString()}
                                                        </td>
                                                        <td className="py-4 px-2 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                {/* Draft → submit for review */}
                                                                {v.status === 'draft' && (
                                                                    <button
                                                                        onClick={() => handleSubmitForReview(v.id)}
                                                                        disabled={!!isActioning('_review')}
                                                                        className="px-3 py-1 rounded-lg bg-blue-500 text-white text-[10px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                                                                    >
                                                                        Submit for Review
                                                                    </button>
                                                                )}
                                                                {/* Under review → approve or reject (admin only) */}
                                                                {v.status === 'under_review' && isAdmin && (
                                                                    <>
                                                                        <button
                                                                            onClick={() => handleApprove(v.id)}
                                                                            disabled={!!isActioning('_approve')}
                                                                            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500 text-white text-[10px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                                                                        >
                                                                            <ThumbsUp size={11} />
                                                                            {isActioning('_approve') ? '…' : 'Approve'}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setShowRejectModal(v.id)}
                                                                            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-500 text-white text-[10px] font-bold hover:opacity-90 transition-opacity"
                                                                        >
                                                                            <ThumbsDown size={11} />
                                                                            Reject
                                                                        </button>
                                                                    </>
                                                                )}
                                                                {/* Approved → publish */}
                                                                {v.status === 'approved' && (
                                                                    <button
                                                                        onClick={() => handlePublish(v.id)}
                                                                        disabled={!!isActioning('_publish')}
                                                                        className="px-3 py-1 rounded-lg bg-[var(--color-success)] text-white text-[10px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                                                                    >
                                                                        {isActioning('_publish') ? 'Publishing…' : 'Publish'}
                                                                    </button>
                                                                )}
                                                                <button className="p-1 rounded-lg hover:bg-[var(--color-surface-alt)] transition-colors dash-text-tertiary">
                                                                    <Eye size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-12 space-y-2">
                                    <FileCheck size={48} className="mx-auto text-[var(--color-text-tertiary)] opacity-20" />
                                    <p className="dash-text-tertiary">No versions created yet.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Compliance Tracking ── */}
                    {activeTab === 'compliance' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold dash-text uppercase tracking-wider">Employee Attestation Status</h3>
                                <div className="flex gap-2">
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-success)]">
                                        <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" /> Signed
                                    </span>
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-warning)]">
                                        <div className="w-2 h-2 rounded-full bg-[var(--color-warning)]" /> Pending
                                    </span>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="dash-text-tertiary text-[10px] font-bold uppercase tracking-widest border-b dash-border">
                                            <th className="pb-3 px-2">Employee</th>
                                            <th className="pb-3 px-2">Status</th>
                                            <th className="pb-3 px-2">Signed At</th>
                                            <th className="pb-3 px-2 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y dash-border">
                                        {acknowledgements.map(ack => (
                                            <tr key={ack.id} className="group hover:bg-[var(--color-surface-alt)] transition-colors">
                                                <td className="py-4 px-2">
                                                    <div className="text-sm font-semibold dash-text">{ack.profiles?.full_name || 'Unknown User'}</div>
                                                    <div className="text-[10px] dash-text-tertiary">{ack.profiles?.email}</div>
                                                </td>
                                                <td className="py-4 px-2">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--color-success-soft)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                                                        Acknowledged
                                                    </span>
                                                </td>
                                                <td className="py-4 px-2 text-xs dash-text">
                                                    {new Date(ack.acknowledged_at).toLocaleString()}
                                                </td>
                                                <td className="py-4 px-2 text-right">
                                                    <button className="text-[var(--color-accent)] hover:underline text-xs font-bold">
                                                        View Log
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {complianceStats?.pending > 0 && (
                                            <tr className="bg-gray-50/50">
                                                <td colSpan={4} className="py-4 px-2 text-center text-xs dash-text-tertiary italic">
                                                    + {complianceStats.pending} other employees pending acknowledgement
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="pt-4 flex justify-end">
                                <button
                                    className="dash-button-primary flex items-center gap-2"
                                    onClick={() => alert('Sending bulk reminders...')}
                                >
                                    <Send size={16} />
                                    <span>Send Reminders to All Pending</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Review Cycle ── */}
                    {activeTab === 'review_cycle' && (
                        <div className="space-y-6 max-w-lg">
                            <div>
                                <h3 className="text-sm font-bold dash-text uppercase tracking-wider mb-1">Scheduled Review Cycle</h3>
                                <p className="text-xs dash-text-tertiary">
                                    Set how often this policy should be reviewed. The next review date is computed from today when saved.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Review every (months)</label>
                                    <select
                                        value={reviewCycleMonths}
                                        onChange={e => setReviewCycleMonths(Number(e.target.value))}
                                        className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none"
                                    >
                                        {[3, 6, 12, 18, 24, 36].map(m => (
                                            <option key={m} value={m}>{m} months ({m === 12 ? 'Annual' : m === 6 ? 'Semi-annual' : m === 3 ? 'Quarterly' : `Every ${m / 12} years`})</option>
                                        ))}
                                    </select>
                                </div>

                                {policyAny.next_review_due && (
                                    <div className="flex items-center gap-3 p-3 bg-[var(--color-surface-alt)] rounded-xl border dash-border">
                                        <Calendar size={16} className="dash-text-tertiary" />
                                        <div>
                                            <div className="text-[10px] uppercase font-bold dash-text-tertiary">Next Review Due</div>
                                            <div className="text-sm dash-text font-semibold">
                                                {new Date(policyAny.next_review_due).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {policyAny.last_reviewed_at && (
                                    <div className="flex items-center gap-3 p-3 bg-[var(--color-surface-alt)] rounded-xl border dash-border">
                                        <RotateCcw size={16} className="dash-text-tertiary" />
                                        <div>
                                            <div className="text-[10px] uppercase font-bold dash-text-tertiary">Last Reviewed</div>
                                            <div className="text-sm dash-text font-semibold">
                                                {new Date(policyAny.last_reviewed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={handleSaveReviewCycle}
                                    disabled={cycleUpdating}
                                    className="dash-button-primary flex items-center gap-2 disabled:opacity-50"
                                >
                                    <RefreshCw size={16} />
                                    {cycleUpdating ? 'Saving…' : 'Save Review Schedule'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Add Version Modal ── */}
            {showAddVersionModal && (
                <AddVersionModal
                    policyId={policyId!}
                    onClose={() => setShowAddVersionModal(false)}
                    onSuccess={() => {
                        setShowAddVersionModal(false);
                        fetchData();
                    }}
                />
            )}

            {/* ── Submit for Review Modal ── */}
            {showReviewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-[var(--color-surface)] border dash-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
                        <h2 className="text-lg font-bold dash-text flex items-center gap-2">
                            <RefreshCw size={18} className="text-blue-500" />
                            Submit Version for Review
                        </h2>
                        <p className="text-sm dash-text-secondary">
                            This will move the version to <strong>Under Review</strong> status. Admins will be able to approve or reject it.
                        </p>
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button onClick={() => setShowReviewModal(null)} className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:bg-[var(--color-surface-alt)] transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={confirmSubmitForReview}
                                disabled={actionLoading === showReviewModal + '_review'}
                                className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-blue-500 shadow-md disabled:opacity-50"
                            >
                                {actionLoading === showReviewModal + '_review' ? 'Submitting…' : 'Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Reject Modal ── */}
            {showRejectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-[var(--color-surface)] border dash-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
                        <h2 className="text-lg font-bold dash-text flex items-center gap-2">
                            <ThumbsDown size={18} className="text-red-500" />
                            Reject Version
                        </h2>
                        <div>
                            <label className="block text-xs font-semibold dash-text-secondary mb-1.5">Reason for rejection (required)</label>
                            <textarea
                                value={reviewNotes}
                                onChange={e => setReviewNotes(e.target.value)}
                                rows={4}
                                placeholder="Explain what needs to be changed before this version can be approved…"
                                className="w-full bg-[var(--color-surface-alt)] border dash-border rounded-xl px-3 py-2.5 text-sm dash-text focus:outline-none resize-none"
                            />
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button onClick={() => { setShowRejectModal(null); setReviewNotes(''); }} className="px-4 py-2 rounded-xl text-sm font-medium dash-text-secondary hover:bg-[var(--color-surface-alt)] transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={!reviewNotes.trim() || actionLoading === showRejectModal + '_reject'}
                                className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 shadow-md disabled:opacity-50"
                            >
                                {actionLoading === showRejectModal + '_reject' ? 'Rejecting…' : 'Reject Version'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
