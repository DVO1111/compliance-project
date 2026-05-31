// src/lib/marketingActions.ts
import { supabase } from "./supabase";
import { recordAuditEvent } from "./auditService";
import { createVersion } from "./versionService";
import { logger } from './logger';

async function updateSubmissionOrThrow(
  contentId: string,
  companyId: string,
  patch: Record<string, any>,
  expectedStatus?: string
) {
  let query = supabase
    .from("content_submissions")
    .update(patch)
    .eq("id", contentId)
    .eq("company_id", companyId);

  if (expectedStatus) {
    query = query.eq("signoff_status", expectedStatus);
  }

  const { data, error } = await query.select("id").maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new Error("Update blocked (RLS) or no row matched.");
  }
}

export async function sendContentToLegal({
  contentId,
  companyId,
  userId,
  currentStatus,
}: {
  contentId: string;
  companyId: string;
  userId: string;
  currentStatus: string;
}) {
  if (!["draft", "analyzed", "amend_requested"].includes(currentStatus)) {
    throw new Error(`Cannot send to legal from status "${currentStatus}".`);
  }

  // Snapshot current content as a version for diffing
  try {
    const { data: sub } = await supabase
      .from('content_submissions')
      .select('content_text, corrected_text')
      .eq('id', contentId)
      .single();

    if (sub) {
      await createVersion({
        submissionId: contentId,
        contentText: (sub as any).content_text || '',
        correctedText: (sub as any).corrected_text || '',
        snapshotBy: userId,
      });
    }
  } catch {
    // Non-fatal — version tracking is best-effort
    logger.warn('Version snapshot failed (non-fatal)');
  }

  await updateSubmissionOrThrow(contentId, companyId, {
    signoff_status: "awaiting_legal",
    submitted_for_legal_at: new Date().toISOString(),
    is_locked: true,
  });

  // ✅ Create calendar events (both marketing publish + legal review)
  try {
    const { createCalendarEvent, createLegalCalendarEvent } = await import('./calendarService');
    const { data: sub } = await supabase
      .from('content_submissions')
      .select('title, scheduled_date')
      .eq('id', contentId)
      .single();

    if (sub) {
      const subTitle = (sub as any).title || 'Untitled';
      const subDeadline = (sub as any).scheduled_date || new Date().toISOString();

      // Create marketing_publish event so cross-calendar updates work later
      await createCalendarEvent({
        companyId,
        submissionId: contentId,
        title: subTitle,
        scheduledDate: subDeadline,
        userId,
        eventType: 'marketing_publish',
      });

      // Create legal_review event
      await createLegalCalendarEvent({
        companyId,
        submissionId: contentId,
        title: subTitle,
        publishDeadline: subDeadline,
        userId,
      });
    }
  } catch (calErr) {
    logger.warn('Calendar event creation failed (non-fatal):', calErr);
  }

  await recordAuditEvent({
    userId,
    action: "submit_for_legal",
    entityType: "content_submission",
    entityId: contentId,
    companyId,
    metadata: { from_status: currentStatus, to_status: "awaiting_legal" },
  });
}

export async function publishContentFromPipeline({
  contentId,
  companyId,
  userId,
  currentStatus,
}: {
  contentId: string;
  companyId: string;
  userId: string;
  currentStatus: string;
}) {
  if (currentStatus !== "signed_off") {
    throw new Error(`Publish blocked: item is "${currentStatus}", not "signed_off".`);
  }

  await updateSubmissionOrThrow(
    contentId,
    companyId,
    {
      signoff_status: "published",
      published_at: new Date().toISOString(),
      published_by: userId,
    },
    "signed_off"
  );

  await recordAuditEvent({
    userId,
    action: "publish",
    entityType: "content_submission",
    entityId: contentId,
    companyId,
    metadata: { from_status: "signed_off", to_status: "published" },
  });
}

export async function rescheduleContent({
  contentId,
  companyId,
  userId,
  nextDate,
}: {
  contentId: string;
  companyId: string;
  userId: string;
  nextDate: string;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }

  await updateSubmissionOrThrow(contentId, companyId, {
    scheduled_date: `${nextDate}T09:00:00.000Z`,
    priority: "scheduled",
  });

  await recordAuditEvent({
    userId,
    action: "reschedule",
    entityType: "content_submission",
    entityId: contentId,
    companyId,
    metadata: { scheduled_date: `${nextDate}T09:00:00.000Z` },
  });
}
