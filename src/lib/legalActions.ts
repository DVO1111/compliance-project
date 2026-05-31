// src/lib/legalActions.ts
import { supabase } from "./supabase";
import { recordAuditEvent } from "./auditService";
import { getAssignmentForSubmission, castVote } from "./reviewWorkflowService";
import { setApprovalExpiry } from "./expiryService";
import { logger } from './logger';

type LegalDecisionAction = "approve" | "request_changes" | "reject";

async function updateSubmissionOrThrow(contentId: string, companyId: string, patch: Record<string, any>) {
  const { data, error } = await supabase
    .from("content_submissions")
    .update(patch)
    .eq("id", contentId)
    .eq("company_id", companyId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error("Update blocked (RLS) or no row matched.");
  }
}

async function notifyOwner(contentId: string, type: string, message: string) {
  const { error } = await (supabase as any).rpc("notify_review_decision", {
    p_content_id: contentId,
    p_type: type,
    p_message: message,
  } as any);

  if (error) {
    logger.error("notify_review_decision failed:", error);
  }
}

export async function markContentInReview(contentId: string, companyId: string, userId: string) {
  const { error } = await (supabase as any).rpc("mark_content_in_review", {
    p_content_id: contentId,
  } as any);

  if (error) {
    logger.error("mark_content_in_review failed:", error);
    await updateSubmissionOrThrow(contentId, companyId, { signoff_status: "in_review" });
  }

  await recordAuditEvent({
    userId,
    action: "legal_opened",
    entityType: "content_submission",
    entityId: contentId,
    companyId,
  });
}

export async function applyLegalDecision({
  contentId,
  companyId,
  userId,
  action,
  comments,
}: {
  contentId: string;
  companyId: string;
  userId: string;
  action: LegalDecisionAction;
  comments: string;
}) {
  // ── Path A: Parallel review assignment exists → delegate to vote system ──
  const { assignment } = await getAssignmentForSubmission(contentId);

  if (assignment && assignment.status === 'open') {
    const voteMap: Record<LegalDecisionAction, 'approve' | 'reject' | 'request_changes'> = {
      approve: 'approve',
      reject: 'reject',
      request_changes: 'request_changes',
    };

    const { resolved, outcome } = await castVote({
      assignmentId: assignment.id,
      reviewerId: userId,
      vote: voteMap[action],
      comments,
      companyId,
      submissionId: contentId,
    });

    // Also insert a legacy legal_reviews row for audit trail compatibility
    await supabase.from("legal_reviews").insert({
      content_id: contentId,
      reviewer_id: userId,
      status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending',
      comments,
    });

    // If quorum reached, apply the final decision
    if (resolved && outcome) {
      const statusMap: Record<string, string> = {
        approved: 'signed_off',
        rejected: 'rejected',
        amend_requested: 'amend_requested',
      };

      await updateSubmissionOrThrow(contentId, companyId, {
        signoff_status: statusMap[outcome] || 'signed_off',
        is_locked: outcome === 'approved' || outcome === 'rejected',
        legal_decided_at: new Date().toISOString(),
        legal_decided_by: userId,
      });

      // Set approval expiry if approved
      if (outcome === 'approved') {
        await setApprovalExpiry(contentId, companyId, userId);
      }

      await notifyOwner(
        contentId,
        outcome === 'approved' ? 'legal_approved' : outcome === 'rejected' ? 'legal_rejected' : 'legal_amend',
        outcome === 'approved'
          ? 'Legal team approved this content (quorum reached). You may publish.'
          : outcome === 'rejected'
          ? 'Legal team rejected this content (quorum reached). Do not publish.'
          : 'Legal team requested amendments (quorum reached). Please review comments.'
      );
    }

    return;
  }

  // ── Path B: No assignment → legacy single-reviewer flow (backward compat) ──
  const isApprove = action === "approve";
  const isReject = action === "reject";

  const { error: reviewError } = await supabase.from("legal_reviews").insert({
    content_id: contentId,
    reviewer_id: userId,
    status: isApprove ? "approved" : isReject ? "rejected" : "pending",
    comments,
  });
  if (reviewError) throw reviewError;

  await updateSubmissionOrThrow(contentId, companyId, {
    signoff_status: isApprove ? "signed_off" : isReject ? "rejected" : "amend_requested",
    is_locked: isApprove || isReject,
    legal_decided_at: new Date().toISOString(),
    legal_decided_by: userId,
  });

  // Set approval expiry if approved
  if (isApprove) {
    await setApprovalExpiry(contentId, companyId, userId);
  }

  await recordAuditEvent({
    userId,
    action: isApprove ? "legal_approve" : isReject ? "legal_reject" : "legal_amend",
    entityType: "content_submission",
    entityId: contentId,
    companyId,
    metadata: { comments },
  });

  await notifyOwner(
    contentId,
    isApprove ? "legal_approved" : isReject ? "legal_rejected" : "legal_amend",
    isApprove
      ? "Legal approved this content. You may publish."
      : isReject
      ? "Legal rejected this content. Do not publish."
      : "Legal requested amendments. Please review comments."
  );
}
