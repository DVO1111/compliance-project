// src/lib/reviewWorkflowService.ts
// Parallel review assignments with quorum-based resolution + SLA enforcement
import { supabase } from './supabase';
import { recordAuditEvent } from './auditService';

/* ── Types ─────────────────────────────────────────────── */

export interface ReviewAssignment {
  id: string;
  company_id: string;
  submission_id: string;
  reviewer_ids: string[];
  quorum: number;
  sla_hours: number;
  deadline_at: string | null;
  status: 'open' | 'resolved' | 'expired' | 'cancelled';
  resolved_at: string | null;
  resolved_outcome: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewVote {
  id: string;
  assignment_id: string;
  reviewer_id: string;
  vote: 'approve' | 'reject' | 'abstain' | 'request_changes';
  comments: string;
  created_at: string;
  updated_at: string;
}

/* ── Create assignment ─────────────────────────────────── */

export async function createReviewAssignment(opts: {
  companyId: string;
  submissionId: string;
  reviewerIds: string[];
  quorum: number;
  slaHours: number;
  createdBy: string;
}): Promise<ReviewAssignment> {
  const deadlineAt = new Date(Date.now() + opts.slaHours * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from('review_assignments')
    .insert({
      company_id: opts.companyId,
      submission_id: opts.submissionId,
      reviewer_ids: opts.reviewerIds,
      quorum: opts.quorum,
      sla_hours: opts.slaHours,
      deadline_at: deadlineAt,
      status: 'open',
      created_by: opts.createdBy,
    })
    .select('*')
    .single();

  if (error) throw error;

  // Update submission with SLA deadline
  await supabase
    .from('content_submissions')
    .update({ sla_deadline_at: deadlineAt })
    .eq('id', opts.submissionId);

  await recordAuditEvent({
    userId: opts.createdBy,
    action: 'review_assigned',
    entityType: 'content_submission',
    entityId: opts.submissionId,
    companyId: opts.companyId,
    metadata: {
      reviewer_count: opts.reviewerIds.length,
      quorum: opts.quorum,
      sla_hours: opts.slaHours,
    },
  });

  return data as ReviewAssignment;
}

/* ── Cast vote ─────────────────────────────────────────── */

export async function castVote(opts: {
  assignmentId: string;
  reviewerId: string;
  vote: ReviewVote['vote'];
  comments: string;
  companyId: string;
  submissionId: string;
}): Promise<{ vote: ReviewVote; resolved: boolean; outcome?: string }> {
  // Upsert the vote (reviewer can change their mind)
  const { data: voteData, error: voteErr } = await supabase
    .from('review_votes')
    .upsert(
      {
        assignment_id: opts.assignmentId,
        reviewer_id: opts.reviewerId,
        vote: opts.vote,
        comments: opts.comments,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'assignment_id,reviewer_id' }
    )
    .select('*')
    .single();

  if (voteErr) throw voteErr;

  await recordAuditEvent({
    userId: opts.reviewerId,
    action: `review_vote_${opts.vote}`,
    entityType: 'content_submission',
    entityId: opts.submissionId,
    companyId: opts.companyId,
    metadata: { assignment_id: opts.assignmentId, vote: opts.vote },
  });

  // Check quorum
  const resolution = await checkQuorumReached(opts.assignmentId);

  return {
    vote: voteData as ReviewVote,
    resolved: resolution.resolved,
    outcome: resolution.outcome,
  };
}

/* ── Check quorum ──────────────────────────────────────── */

export async function checkQuorumReached(
  assignmentId: string
): Promise<{ resolved: boolean; outcome?: string }> {
  // Fetch assignment
  const { data: assignment, error: aErr } = await supabase
    .from('review_assignments')
    .select('*')
    .eq('id', assignmentId)
    .single();

  if (aErr || !assignment) return { resolved: false };
  if (assignment.status !== 'open') return { resolved: true, outcome: assignment.resolved_outcome ?? undefined };

  // Fetch all votes
  const { data: votes, error: vErr } = await supabase
    .from('review_votes')
    .select('*')
    .eq('assignment_id', assignmentId);

  if (vErr || !votes) return { resolved: false };

  const approvals = votes.filter((v: any) => v.vote === 'approve').length;
  const rejections = votes.filter((v: any) => v.vote === 'reject').length;
  const amendments = votes.filter((v: any) => v.vote === 'request_changes').length;
  const quorum = assignment.quorum;

  let outcome: string | null = null;

  if (approvals >= quorum) {
    outcome = 'approved';
  } else if (rejections >= quorum) {
    outcome = 'rejected';
  } else if (amendments >= quorum) {
    outcome = 'amend_requested';
  }

  if (outcome) {
    // Resolve the assignment
    await supabase
      .from('review_assignments')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_outcome: outcome,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId);

    return { resolved: true, outcome };
  }

  return { resolved: false };
}

/* ── Fetch assignment + votes for a submission ─────────── */

export async function getAssignmentForSubmission(
  submissionId: string
): Promise<{ assignment: ReviewAssignment | null; votes: ReviewVote[] }> {
  // Get the latest (most recent) open or resolved assignment
  const { data: assignments, error } = await supabase
    .from('review_assignments')
    .select('*')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !assignments || assignments.length === 0) {
    return { assignment: null, votes: [] };
  }

  const assignment = assignments[0] as ReviewAssignment;

  const { data: votes } = await supabase
    .from('review_votes')
    .select('*')
    .eq('assignment_id', assignment.id)
    .order('created_at', { ascending: true });

  return { assignment, votes: (votes || []) as ReviewVote[] };
}

/* ── SLA check (call periodically or on page load) ─────── */

export async function getOverdueAssignments(
  companyId: string
): Promise<ReviewAssignment[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('review_assignments')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'open')
    .lt('deadline_at', now);

  if (error) return [];
  return (data || []) as ReviewAssignment[];
}
