// src/components/LegalReview/ReviewAssignmentPanel.tsx
// Reviewer picker + quorum config + SLA deadline + vote status
import { useEffect, useState } from 'react';
import {
    UserPlus, Users, CheckCircle, XCircle, AlertTriangle,
    Clock, Shield, Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
    createReviewAssignment,
    getAssignmentForSubmission,
    type ReviewAssignment,
    type ReviewVote,
} from '../../lib/reviewWorkflowService';
import SlaIndicator from './SlaIndicator';
import { logger } from '../../lib/logger';

interface ReviewAssignmentPanelProps {
    submissionId: string;
    companyId: string;
    currentUserId: string;
    canAssign: boolean; // true for executives/admins
}

interface ReviewerProfile {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
}

export default function ReviewAssignmentPanel({
    submissionId,
    companyId,
    currentUserId,
    canAssign,
}: ReviewAssignmentPanelProps) {
    const [assignment, setAssignment] = useState<ReviewAssignment | null>(null);
    const [votes, setVotes] = useState<ReviewVote[]>([]);
    const [loading, setLoading] = useState(true);

    // Assignment form state
    const [showForm, setShowForm] = useState(false);
    const [availableReviewers, setAvailableReviewers] = useState<ReviewerProfile[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [quorum, setQuorum] = useState(2);
    const [slaHours, setSlaHours] = useState(48);
    const [creating, setCreating] = useState(false);

    // Reviewer profile cache for vote display
    const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({});

    // Load existing assignment
    useEffect(() => {
        let mounted = true;
        (async () => {
            setLoading(true);
            const result = await getAssignmentForSubmission(submissionId);
            if (!mounted) return;
            setAssignment(result.assignment);
            setVotes(result.votes);
            setLoading(false);
        })();
        return () => { mounted = false; };
    }, [submissionId]);

    // Load reviewer profiles when assignment exists
    useEffect(() => {
        if (!assignment) return;
        const ids = [...assignment.reviewer_ids, ...votes.map(v => v.reviewer_id)].filter(Boolean);
        if (ids.length === 0) return;
        (async () => {
            const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
            if (!data) return;
            const map: Record<string, string> = {};
            data.forEach((p: any) => { map[p.id] = p.full_name || p.email || p.id.slice(0, 8); });
            setReviewerNames(map);
        })();
    }, [assignment, votes]);

    // Load available compliance/legal reviewers for the picker
    useEffect(() => {
        if (!showForm) return;
        (async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, email, role')
                .eq('company_id', companyId);
            if (data) setAvailableReviewers(data as ReviewerProfile[]);
        })();
    }, [showForm, companyId]);

    const handleCreate = async () => {
        if (selectedIds.length === 0) return;
        setCreating(true);
        try {
            const result = await createReviewAssignment({
                companyId,
                submissionId,
                reviewerIds: selectedIds,
                quorum: Math.min(quorum, selectedIds.length),
                slaHours,
                createdBy: currentUserId,
            });
            setAssignment(result);
            setShowForm(false);
        } catch (err) {
            logger.error('Failed to create assignment:', err);
        } finally {
            setCreating(false);
        }
    };

    const toggleReviewer = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8 dash-text-tertiary">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading review assignment…
            </div>
        );
    }

    /* ── No assignment yet ──────────────────────────────── */
    if (!assignment) {
        return (
            <div className="space-y-4">
                <div className="text-center py-8">
                    <Users className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" />
                    <p className="text-sm dash-text-secondary font-medium">No reviewers assigned</p>
                    <p className="text-xs dash-text-tertiary mt-1">This submission is using the single-reviewer workflow.</p>
                    {canAssign && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-behance-blue)] text-white rounded-lg text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
                        >
                            <UserPlus className="w-4 h-4" />
                            Assign Reviewers
                        </button>
                    )}
                </div>

                {/* Assignment form */}
                {showForm && (
                    <div className="border border-[var(--color-info)]/20 rounded-xl p-4 bg-[var(--color-info-soft)]/30 space-y-4">
                        <h4 className="text-sm font-semibold dash-text flex items-center gap-2">
                            <Shield className="w-4 h-4 text-[var(--color-behance-blue)]" />
                            Assign Review Panel
                        </h4>

                        {/* Reviewer picker */}
                        <div>
                            <label className="text-[11px] font-semibold dash-text-secondary uppercase tracking-wider block mb-2">
                                Select Reviewers ({selectedIds.length} selected)
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                                {availableReviewers
                                    .filter((r) => r.id !== currentUserId)
                                    .map((r) => (
                                        <button
                                            key={r.id}
                                            onClick={() => toggleReviewer(r.id)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all ${selectedIds.includes(r.id)
                                                    ? 'bg-[var(--color-behance-blue)] text-white'
                                                    : 'dash-card border dash-border dash-text hover:border-[var(--color-behance-blue)]/30'
                                                }`}
                                        >
                                            <div
                                                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${selectedIds.includes(r.id) ? 'dash-card/20 text-white' : 'dash-surface-alt dash-text-secondary'
                                                    }`}
                                            >
                                                {(r.full_name || r.email)[0]?.toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate font-medium">{r.full_name || r.email}</p>
                                                <p className={`text-[10px] truncate ${selectedIds.includes(r.id) ? 'text-white/70' : 'dash-text-tertiary'}`}>
                                                    {r.role}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                            </div>
                        </div>

                        {/* Quorum + SLA */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] font-semibold dash-text-secondary uppercase tracking-wider block mb-1">
                                    Quorum (approvals needed)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={selectedIds.length || 1}
                                    value={quorum}
                                    onChange={(e) => setQuorum(Number(e.target.value))}
                                    className="w-full border dash-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)]"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold dash-text-secondary uppercase tracking-wider block mb-1">
                                    SLA (hours)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={720}
                                    value={slaHours}
                                    onChange={(e) => setSlaHours(Number(e.target.value))}
                                    className="w-full border dash-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--color-behance-blue)]/20 focus:border-[var(--color-behance-blue)]"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => setShowForm(false)}
                                className="px-3 py-1.5 text-sm dash-text-secondary hover:dash-text"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={selectedIds.length === 0 || creating}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-behance-blue)] text-white rounded-lg text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                Assign {selectedIds.length} Reviewer{selectedIds.length !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    /* ── Assignment exists — show status ────────────────── */
    const approvals = votes.filter((v) => v.vote === 'approve').length;
    const rejections = votes.filter((v) => v.vote === 'reject').length;
    const amendments = votes.filter((v) => v.vote === 'request_changes').length;
    const totalVotes = votes.length;
    const quorumPct = Math.min((approvals / assignment.quorum) * 100, 100);

    const voteIcon = (vote: string) => {
        switch (vote) {
            case 'approve': return <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />;
            case 'reject': return <XCircle className="w-4 h-4 text-[var(--color-danger)]" />;
            case 'request_changes': return <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />;
            default: return <Clock className="w-4 h-4 dash-text-tertiary" />;
        }
    };

    const statusPill = assignment.status === 'resolved' ? (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${assignment.resolved_outcome === 'approved'
                ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
                : assignment.resolved_outcome === 'rejected'
                    ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                    : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
            }`}>
            {assignment.resolved_outcome === 'approved' ? 'Approved' :
                assignment.resolved_outcome === 'rejected' ? 'Rejected' : 'Changes Requested'}
        </span>
    ) : (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--color-info-soft)] text-[var(--color-info)]">
            In Progress
        </span>
    );

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-[var(--color-behance-blue)]" />
                    <h4 className="text-sm font-semibold dash-text">Review Panel</h4>
                    {statusPill}
                </div>
                <SlaIndicator deadlineAt={assignment.deadline_at} size="md" />
            </div>

            {/* Quorum progress */}
            <div className="rounded-xl border dash-border p-3">
                <div className="flex items-center justify-between text-xs dash-text-secondary mb-2">
                    <span className="font-medium">Quorum Progress</span>
                    <span>{approvals} of {assignment.quorum} approvals needed</span>
                </div>
                <div className="w-full dash-surface-alt rounded-full h-2.5">
                    <div
                        className="h-2.5 rounded-full transition-all duration-500 bg-gradient-to-r from-[var(--color-behance-blue)] to-emerald-500"
                        style={{ width: `${quorumPct}%` }}
                    />
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs dash-text-secondary">
                    <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-[var(--color-success)]" /> {approvals} approved</span>
                    <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-[var(--color-danger)]" /> {rejections} rejected</span>
                    <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-[var(--color-warning)]" /> {amendments} changes</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3 dash-text-tertiary" /> {assignment.reviewer_ids.length - totalVotes} pending</span>
                </div>
            </div>

            {/* Reviewer list */}
            <div className="space-y-2">
                {assignment.reviewer_ids.map((reviewerId) => {
                    const vote = votes.find((v) => v.reviewer_id === reviewerId);
                    const name = reviewerNames[reviewerId] || reviewerId.slice(0, 8);
                    const isCurrentUser = reviewerId === currentUserId;

                    return (
                        <div
                            key={reviewerId}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${vote
                                    ? vote.vote === 'approve'
                                        ? 'border-[var(--color-success)]/20 bg-[var(--color-success-soft)]/50'
                                        : vote.vote === 'reject'
                                            ? 'border-[var(--color-danger)]/20 bg-[var(--color-danger-soft)]/50'
                                            : 'border-[var(--color-warning)]/20 bg-[var(--color-warning-soft)]/50'
                                    : 'dash-border dash-surface-alt'
                                }`}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-behance-blue)] to-blue-300 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                    {name[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium dash-text truncate">
                                        {name}
                                        {isCurrentUser && <span className="ml-1 text-xs text-[var(--color-behance-blue)]">(you)</span>}
                                    </p>
                                    {vote?.comments && (
                                        <p className="text-xs dash-text-secondary truncate mt-0.5">"{vote.comments}"</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {vote ? (
                                    <>
                                        {voteIcon(vote.vote)}
                                        <span className="text-xs font-medium capitalize dash-text-secondary">
                                            {vote.vote.replace('_', ' ')}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-xs dash-text-tertiary italic">Awaiting vote</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

