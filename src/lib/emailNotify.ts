/**
 * emailNotify — Fire-and-forget wrapper around the `notify` edge function.
 *
 * Never throws. Failures are silently swallowed so callers are never blocked
 * by a notification system failure.
 */

import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export type NotificationType =
  | 'content_submitted'
  | 'content_approved'
  | 'content_rejected'
  | 'changes_requested';

export interface NotifyParams {
  /** Single recipient by user ID */
  recipient_id?: string;
  /** OR broadcast to all users in a company with matching roles */
  company_id?: string;
  notify_roles?: string[];
  /** Notification type — determines email template and in-app message */
  type: NotificationType;
  content_id?: string;
  content_title?: string;
  /** Name of the person who performed the action (reviewer / submitter) */
  actor_name?: string;
  /** Optional reviewer note or rejection reason */
  note?: string;
}

/**
 * Send a notification to one user or a group of users by role.
 * Fire-and-forget — does not await or surface errors to caller.
 */
export function sendUserNotification(params: NotifyParams): void {
  _send(params).catch(() => {
    // Intentionally silent — notification failure must never break the UI
  });
}

async function _send(params: NotifyParams): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token || !SUPABASE_URL) return;

  await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
}
