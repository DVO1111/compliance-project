// src/lib/calendarService.ts
// Calendar event CRUD + deadline reminder logic
import { supabase } from './supabase';
import { notify } from '../integrations/services/notificationService';
import { logger } from './logger';

// ── Types ────────────────────────────────────────────────────
export interface CreatorProfile {
  full_name: string;
  avatar_url?: string;
}

export interface CalendarEvent {
  id: string;
  company_id: string;
  submission_id: string | null;
  event_type: 'marketing_publish' | 'legal_review' | 'meeting';
  title: string;
  scheduled_at: string;
  is_auto_dated: boolean;
  needs_schedule_confirmation: boolean;
  legal_planned_at: string | null;
  legal_acknowledged: boolean;
  status: 'pending' | 'confirmed' | 'completed' | 'overdue';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  creator_profile?: CreatorProfile;
  reviewer_profile?: CreatorProfile;
  meeting_link?: string | null;
  submission_status?: string | null;
}

export interface DateRange {
  start: string; // ISO
  end: string;   // ISO
}

// ── Create calendar event (auto on upload) ───────────────────
export async function createCalendarEvent(opts: {
  companyId: string;
  submissionId: string;
  title: string;
  scheduledDate: string | null;
  userId: string;
  eventType?: 'marketing_publish' | 'legal_review';
}): Promise<CalendarEvent | null> {
  const now = new Date().toISOString();
  const hasDate = !!opts.scheduledDate;

  const row = {
    company_id: opts.companyId,
    submission_id: opts.submissionId,
    event_type: opts.eventType || 'marketing_publish',
    title: opts.title,
    scheduled_at: hasDate ? opts.scheduledDate! : now,
    is_auto_dated: !hasDate,
    needs_schedule_confirmation: !hasDate,
    status: hasDate ? 'confirmed' : 'pending',
    created_by: opts.userId,
  };

  const { data, error } = await supabase
    .from('calendar_events')
    .insert(row as any)
    .select()
    .single();

  if (error) {
    logger.error('Failed to create calendar event:', error.message, error.details, error.hint);
    return null;
  }
  if (!data) {
    logger.error('Calendar event insert returned no data — likely RLS policy issue');
    return null;
  }
  return data as CalendarEvent;
}

// ── Confirm schedule (marketing picks date) ──────────────────
export async function confirmSchedule(
  eventId: string,
  scheduledAt: string,
): Promise<void> {
    const { error } = await (supabase.from('calendar_events') as any)
    .update({
      scheduled_at: scheduledAt,
      is_auto_dated: false,
      needs_schedule_confirmation: false,
      status: 'confirmed',
    })
    .eq('id', eventId);

  if (error) throw error;
}

// ── Confirm same-day publishing (marketing picks time) ───────
export async function confirmSameDay(
  eventId: string,
  timeOfDay: string, // "HH:mm"
): Promise<void> {
  const today = new Date();
  const [h, m] = timeOfDay.split(':').map(Number);
  today.setHours(h, m, 0, 0);

    const { error } = await (supabase.from('calendar_events') as any)
    .update({
      scheduled_at: today.toISOString(),
      is_auto_dated: false,
      needs_schedule_confirmation: false,
      status: 'confirmed',
    })
    .eq('id', eventId);

  if (error) throw error;
}

// ── Legal acknowledges and picks review date ─────────────────
export async function acknowledgeForLegal(
  eventId: string,
  plannedAt: string | 'now',
  companyId: string,
): Promise<void> {
  const ts = plannedAt === 'now' ? new Date().toISOString() : plannedAt;
  // console.log('[Calendar] acknowledgeForLegal:', { eventId, ts });

    const { error } = await (supabase.from('calendar_events') as any)
    .update({
      legal_planned_at: ts,
      scheduled_at: ts,
      legal_acknowledged: true,
    })
    .eq('id', eventId);

  if (error) {
    logger.error('[Calendar] acknowledgeForLegal failed:', error.message, error.details);
    throw error;
  }
  // console.log('[Calendar] acknowledgeForLegal succeeded');

  // ── Fetch the legal event details (submission_id + title) ──
  const { data: legalEvt } = await supabase
    .from('calendar_events')
    .select('submission_id, title, created_by')
    .eq('id', eventId)
    .single();

  const submissionId = (legalEvt as any)?.submission_id;
  const eventTitle = (legalEvt as any)?.title || 'Content';

  // ✅ Sync back to marketing calendar
  if (submissionId) {
    try {
      await updateMarketingCalendarWithLegalDate(companyId, submissionId, ts);
    } catch (syncErr) {
      logger.warn('[Calendar] sync-back to marketing failed (non-fatal):', syncErr);
    }

    // ✅ Send in-app notification to the content creator (marketing user)
    try {
      await sendLegalDateNotificationToMarketing(companyId, submissionId, eventTitle, ts);
    } catch (notifErr) {
      logger.warn('[Calendar] in-app notification failed (non-fatal):', notifErr);
    }
  }

  // Fire external integration notification (Slack, etc.)
  notify(companyId, 'calendar.legal_date_set', {
    event_id: eventId,
    legal_planned_at: ts,
  });
}

// ── Send in-app notification to the marketing content creator ──
async function sendLegalDateNotificationToMarketing(
  _companyId: string,
  submissionId: string,
  eventTitle: string,
  legalPlannedAt: string,
): Promise<void> {
  // Find the content creator from the submission
  const { data: submission } = await supabase
    .from('content_submissions')
    .select('user_id, title')
    .eq('id', submissionId)
    .maybeSingle();

  const recipientId = (submission as any)?.user_id;
  if (!recipientId) {
    logger.warn('[Calendar] No user_id found for submission', submissionId);
    return;
  }

  const title = (submission as any)?.title || eventTitle;
  const plannedDate = new Date(legalPlannedAt);
  const dateStr = plannedDate.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const message = `⚖️ Legal has scheduled their review of "${title}" for ${dateStr}. Your marketing calendar has been updated.`;

  const { error } = await supabase
    .from('notifications')
    .insert({
      recipient_id: recipientId,
      type: 'calendar_legal_date_set',
      content_id: submissionId,
      message,
    } as any);

  if (error) {
    logger.error('[Calendar] Failed to insert notification:', error.message);
  } else {
    // console.log('[Calendar] In-app notification sent to marketing user:', recipientId);
  }
}

// ── Create legal-side event when content sent to legal ───────
export async function createLegalCalendarEvent(opts: {
  companyId: string;
  submissionId: string;
  title: string;
  publishDeadline: string;
  userId: string;
}): Promise<CalendarEvent | null> {
  return createCalendarEvent({
    companyId: opts.companyId,
    submissionId: opts.submissionId,
    title: opts.title,
    scheduledDate: opts.publishDeadline,
    userId: opts.userId,
    eventType: 'legal_review',
  });
}

// ── Create meeting event ─────────────────────────────────────
export async function createMeetingEvent(opts: {
  companyId: string;
  title: string;
  description?: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  meetingLink?: string;
  userId: string;
}): Promise<CalendarEvent | null> {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      company_id: opts.companyId,
      event_type: 'meeting',
      title: opts.title,
      scheduled_at: opts.startTime,
      legal_planned_at: opts.endTime, // Use this for meeting end time
      needs_schedule_confirmation: false,
      status: 'confirmed',
      created_by: opts.userId,
      meeting_link: opts.meetingLink,
    } as any)
    .select()
    .single();

  if (error) {
    logger.error('Failed to create meeting event:', error);
    return null;
  }
  return data as CalendarEvent;
}

// ── Fetch the legal calendar event for a given submission ─────
export async function getLegalEventForSubmission(
  companyId: string,
  submissionId: string,
): Promise<CalendarEvent | null> {
  const { data } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('company_id', companyId)
    .eq('submission_id', submissionId)
    .eq('event_type', 'legal_review')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? (data as CalendarEvent) : null;
}

// ── Update marketing calendar with legal's review date note ──
export async function updateMarketingCalendarWithLegalDate(
  companyId: string,
  submissionId: string,
  legalPlannedAt: string,
): Promise<void> {
  // console.log('[Calendar] updateMarketingCalendarWithLegalDate:', { companyId, submissionId, legalPlannedAt });

  // Find the marketing_publish event for this submission
  const { data: mktEvents, error: fetchErr } = await supabase
    .from('calendar_events')
    .select('id')
    .eq('company_id', companyId)
    .eq('submission_id', submissionId)
    .eq('event_type', 'marketing_publish')
    .order('created_at', { ascending: false }) // Get the latest one
    .limit(1);

  if (fetchErr) {
    logger.error('[Calendar] Failed to find marketing event:', fetchErr.message);
    return;
  }

  // If no marketing event exists (e.g., older submissions or direct legal assignment), create a placeholder
  if (!mktEvents || (mktEvents as any[]).length === 0) {
    logger.warn('[Calendar] No marketing_publish event found for submission', submissionId, '- creating placeholder.');
    
    // Attempt to get the submission title to use as the event title
    const { data: sub } = await supabase
      .from('content_submissions')
      .select('title, user_id')
      .eq('id', submissionId)
      .maybeSingle();

    const { error: insertErr, data: newMktEvent } = await supabase
      .from('calendar_events')
      .insert({
        company_id: companyId,
        submission_id: submissionId,
        event_type: 'marketing_publish',
        title: (sub as any)?.title || 'Content Publishing',
        scheduled_at: legalPlannedAt, // <-- FIX: Schedule it on the legal review day so it's visible then!
        is_auto_dated: true,
        needs_schedule_confirmation: true,
        status: 'pending',
        created_by: (sub as any)?.user_id,
        legal_planned_at: legalPlannedAt,
      } as any)
      .select();

    if (insertErr || !newMktEvent || newMktEvent.length === 0) {
      logger.error('[Calendar] Failed to create fallback marketing event. Error:', insertErr?.message);
    } else {
      // console.log('[Calendar] Created fallback marketing event with legal date successfully');
    }
    return;
  }
  
  const targetId = (mktEvents as any[])[0].id;
  // console.log('[Calendar] Found marketing event:', targetId);

  // Update it with the legal planned date
  const { error: updErr, data: updData } = await (supabase.from('calendar_events') as any)
    .update({
      legal_planned_at: legalPlannedAt,
    })
    .eq('id', targetId)
    .select(); // <-- MUST select to prove RLS didn't silently block it!

  if (updErr) {
    logger.error('[Calendar] Exception during marketing event update:', updErr.message);
  } else if (!updData || updData.length === 0) {
    logger.error('[Calendar] CRITICAL ERROR: Marketing event update succeeded but 0 rows affected! RLS block confirmed for targetId:', targetId);
  } else {
    // console.log('[Calendar] Marketing event successfully updated with legal date. Returned:', (updData as any[])[0].id);
  }
}

// ── Helpers ───────────────────────────────────────────────────

/** Compute a date-range window for the Gantt timeline */
export function getWeekRange(startDate: Date, days: number): DateRange {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Attach creator and reviewer profiles to a list of calendar events */
async function attachProfiles(events: any[]): Promise<CalendarEvent[]> {
  if (!events || events.length === 0) return [];
  
  // 1. Collect all creator IDs
  const creatorIds = [...new Set(events.map(e => e.created_by).filter(Boolean))];
  
  // 2. Discover reviewer IDs based on event submission_ids
  // We'll need to fetch the content_submissions to see who the legal_decided_by/reviewer is
  const submissionIds = [...new Set(events.map(e => e.submission_id).filter(Boolean))];
  const submissionReviewerMap = new Map<string, string>();
  const submissionStatusMap = new Map<string, string>();
  
  if (submissionIds.length > 0) {
    const { data: submissions } = await (supabase.from('content_submissions') as any)
      .select('id, legal_decided_by, signoff_status')
      .in('id', submissionIds);
      
    if (submissions) {
      for (const sub of submissions) {
        if (sub.legal_decided_by) {
          submissionReviewerMap.set(sub.id, sub.legal_decided_by);
        }
        if (sub.signoff_status) {
          submissionStatusMap.set(sub.id, sub.signoff_status);
        }
      }
    }
  }

  const reviewerIds = Array.from(submissionReviewerMap.values());
  
  // 3. Fetch all unique profiles (creators + reviewers)
  const allUserIds = [...new Set([...creatorIds, ...reviewerIds])];
  if (allUserIds.length === 0) return events as CalendarEvent[];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', allUserIds);

  const profileMap = new Map<string, CreatorProfile>();
  for (const p of (profiles ?? []) as any[]) {
    profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
  }

  // 4. Map profiles back to events
  return events.map(e => {
    const reviewerId = e.submission_id ? submissionReviewerMap.get(e.submission_id) : undefined;
    
    return {
      ...e,
      creator_profile: e.created_by ? profileMap.get(e.created_by) : undefined,
      reviewer_profile: reviewerId ? profileMap.get(reviewerId) : undefined,
      submission_status: e.submission_id ? submissionStatusMap.get(e.submission_id) : undefined,
    };
  }) as CalendarEvent[];
}

// ── Fetch events by role ─────────────────────────────────────
export async function getMarketingEvents(
  companyId: string,
  range: DateRange,
): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('company_id', companyId)
    .eq('event_type', 'marketing_publish')
    .gte('scheduled_at', range.start)
    .lte('scheduled_at', range.end)
    .order('scheduled_at', { ascending: true });

  if (error) { logger.error(error); return []; }
  return attachProfiles(data || []);
}

export async function getLegalEvents(
  companyId: string,
  range: DateRange,
): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('company_id', companyId)
    .eq('event_type', 'legal_review')
    .gte('scheduled_at', range.start)
    .lte('scheduled_at', range.end)
    .order('scheduled_at', { ascending: true });

  if (error) { logger.error(error); return []; }
  return attachProfiles(data || []);
}

export async function getAllEvents(
  companyId: string,
  range: DateRange,
): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('company_id', companyId)
    .gte('scheduled_at', range.start)
    .lte('scheduled_at', range.end)
    .order('scheduled_at', { ascending: true });

  if (error) { logger.error(error); return []; }
  return attachProfiles(data || []);
}

// ── Reminder checking (polling) ──────────────────────────────
export async function checkAndSendReminders(
  companyId: string,
  currentUserId: string,
): Promise<void> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Fetch pending/confirmed events with deadlines in the next 24h
  const { data: events } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('company_id', companyId)
    .in('status', ['pending', 'confirmed'])
    .lte('scheduled_at', in24h.toISOString())
    .gte('scheduled_at', now.toISOString());

  if (!events || events.length === 0) return;

  for (const evt of events as CalendarEvent[]) {
    const deadline = new Date(evt.scheduled_at);
    const hoursLeft = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    // 24h reminder
    if (hoursLeft <= 24 && hoursLeft > 5) {
      await sendReminderIfNotSent(evt, '24h', currentUserId, companyId);
    }

    // 5h reminder
    if (hoursLeft <= 5) {
      await sendReminderIfNotSent(evt, '5h', currentUserId, companyId);

      // Legal follow-up: if content is awaiting legal and deadline is < 5h
      if (evt.event_type === 'legal_review' && !evt.legal_acknowledged) {
        await sendReminderIfNotSent(evt, 'legal_unattended', currentUserId, companyId);
      }
    }

    // ✅ Legal planned review deadline < 5h — remind legal their self-set date is near
    if (evt.event_type === 'legal_review' && evt.legal_planned_at && evt.status !== 'completed') {
      const plannedDate = new Date(evt.legal_planned_at);
      const plannedHoursLeft = (plannedDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (plannedHoursLeft > 0 && plannedHoursLeft <= 5) {
        await sendReminderIfNotSent(evt, 'legal_review_due_soon', currentUserId, companyId);
      }
    }

    // Check if marketing content hasn't been sent to legal yet
    if (evt.event_type === 'marketing_publish' && hoursLeft <= 24) {
      await checkLegalSentStatus(evt, companyId, currentUserId);
    }
  }
}

async function sendReminderIfNotSent(
  event: CalendarEvent,
  reminderType: string,
  recipientId: string,
  companyId: string,
): Promise<void> {
  // Check if already sent (unique constraint will also prevent duplicates)
  const { data: existing } = await supabase
    .from('calendar_reminders')
    .select('id')
    .eq('event_id', event.id)
    .eq('reminder_type', reminderType)
    .eq('recipient_id', recipientId)
    .maybeSingle();

  if (existing) return; // Already sent

  const messages: Record<string, string> = {
    '24h': `⏰ Reminder: "${event.title}" is due in less than 24 hours.`,
    '5h': `🚨 Urgent: "${event.title}" is due in less than 5 hours!`,
    'legal_followup': `📋 "${event.title}" hasn't been sent to legal yet. The deadline is approaching.`,
    'legal_unattended': `⚖️ Legal follow-up: "${event.title}" is due soon but hasn't been reviewed yet.`,
    'legal_review_due_soon': `⏳ Your planned review for "${event.title}" is in less than 5 hours.`,
  };

  // Insert reminder record
  await supabase
    .from('calendar_reminders')
    .insert({
      event_id: event.id,
      reminder_type: reminderType,
      recipient_id: recipientId,
      message: messages[reminderType] || `Reminder for "${event.title}"`,
    } as any)
    .single();

  // Fire in-app notification
  await supabase
    .from('notifications')
    .insert({
      recipient_id: recipientId,
      type: `calendar_${reminderType}`,
      content_id: event.submission_id,
      message: messages[reminderType] || `Reminder for "${event.title}"`,
    } as any);

  // Fire external integrations
  notify(companyId, `calendar.reminder.${reminderType}`, {
    title: event.title,
    event_id: event.id,
    deadline: event.scheduled_at,
  });
}

async function checkLegalSentStatus(
  event: CalendarEvent,
  companyId: string,
  userId: string,
): Promise<void> {
  // Check if content has been submitted to legal
  const { data: sub } = await (supabase.from('content_submissions') as any)
    .select('signoff_status')
    .eq('id', event.submission_id || '')
    .single();

  if (!sub) return;
  const status = (sub as any).signoff_status;

  // If content is still in draft/analyzed and deadline is < 24h, remind
  if (['draft', 'analyzed'].includes(status)) {
    await sendReminderIfNotSent(event, 'legal_followup', userId, companyId);
  }
}
