/**
 * Waitlist and Request Info submissions from the public marketing pages.
 *
 * These used to be inserted straight into public.waitlist_signups from the
 * browser, which meant a lead existed only as a database row nobody was
 * watching — and if the migration had not been applied to a project, the
 * insert failed and the lead was simply lost.
 *
 * Submissions now go to the request-info Edge Function, which stores the row
 * with the service role AND emails it to the partnerships inbox. The email
 * is what makes a lead actually arrive somewhere a person looks; the function
 * treats either one succeeding as a successful submission and says which in
 * its response. The SMTP credentials live in Edge Function secrets and never
 * reach the browser.
 */

import { supabase } from './supabase';

/** Which marketing page the signup came from. Must match the source CHECK
 *  constraint on the table — a value outside this set is rejected by Postgres,
 *  not silently stored. */
export type WaitlistSource = 'home' | 'platform' | 'who-its-for' | 'about' | 'contact';

export interface WaitlistEntry {
  source: WaitlistSource;
  /** Which button was used — 'demo', 'waitlist', 'walkthrough', 'contact'… */
  intent?: string | null;
  email: string;
  fullName?: string | null;
  company?: string | null;
  role?: string | null;
  industry?: string | null;
  notes?: string | null;
}

/** The function's payload — camelCase; it maps to the table's columns
 *  server-side so the browser never has to know the schema. */
interface RequestInfoPayload {
  source: WaitlistSource;
  intent: string | null;
  email: string;
  fullName: string | null;
  company: string | null;
  role: string | null;
  industry: string | null;
  notes: string | null;
}

/** What request-info returns. `stored` and `emailed` are reported separately
 *  so a partial delivery is visible in the console rather than silent. */
interface RequestInfoResponse {
  ok: boolean;
  stored?: boolean;
  emailed?: boolean;
  error?: string;
}

export type WaitlistResult =
  | { ok: true }
  | { ok: false; message: string };

const GENERIC_FAILURE =
  "We couldn't record that just now. Please try again in a moment.";

/** Empty strings should land as NULL, not as '' — the table's CHECK
 *  constraints allow null but a blank string is just noise in the data. */
const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export async function submitWaitlist(entry: WaitlistEntry): Promise<WaitlistResult> {
  const email = clean(entry.email);
  if (!email) return { ok: false, message: 'Enter a valid email address.' };

  const payload: RequestInfoPayload = {
    source: entry.source,
    intent: clean(entry.intent),
    email,
    fullName: clean(entry.fullName),
    company: clean(entry.company),
    role: clean(entry.role),
    industry: clean(entry.industry),
    notes: clean(entry.notes),
  };

  try {
    const { data, error } = await supabase.functions.invoke<RequestInfoResponse>(
      'request-info',
      { body: payload },
    );

    if (error) {
      // The full error belongs in the console; the visitor gets something
      // they can act on. Never report success on a failed call — a lead the
      // visitor believes was sent, and was not, is worse than an error.
      console.error('[request-info] call failed', error);
      return { ok: false, message: GENERIC_FAILURE };
    }

    if (!data?.ok) {
      console.error('[request-info] rejected', data);
      if (data?.error === 'rate_limited') {
        return { ok: false, message: 'Too many attempts. Please wait a minute and try again.' };
      }
      if (data?.error === 'invalid_email') {
        return { ok: false, message: 'Enter a valid email address.' };
      }
      return { ok: false, message: GENERIC_FAILURE };
    }

    // Delivered, but worth knowing which half worked when only one did.
    if (!data.emailed) console.warn('[request-info] stored but not emailed');
    if (!data.stored) console.warn('[request-info] emailed but not stored');

    return { ok: true };
  } catch (err) {
    // Network failure, blocked request, Supabase unreachable.
    console.error('[request-info] request failed', err);
    return { ok: false, message: GENERIC_FAILURE };
  }
}
