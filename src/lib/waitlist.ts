/**
 * Waitlist submissions from the public marketing pages.
 *
 * Backed by public.waitlist_signups (see the migration of the same name),
 * which is insert-only for the anon key: this module can write a signup but
 * nothing on the client can read the list back.
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

interface WaitlistInsert {
  source: WaitlistSource;
  intent: string | null;
  email: string;
  full_name: string | null;
  company: string | null;
  role: string | null;
  industry: string | null;
  notes: string | null;
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

  const payload: WaitlistInsert = {
    source: entry.source,
    intent: clean(entry.intent),
    email,
    full_name: clean(entry.fullName),
    company: clean(entry.company),
    role: clean(entry.role),
    industry: clean(entry.industry),
    notes: clean(entry.notes),
  };

  /*
   * database.types.ts is generated from the live schema and will not know
   * about waitlist_signups until the migration has been applied and the types
   * regenerated (npx supabase gen types typescript ...). Rather than hand-edit
   * a generated file — the next regeneration would drop the edit — this one
   * call is cast, with the payload shape declared above so what we send is
   * still checked. Delete the cast once the types are regenerated.
   */
  const client = supabase as unknown as {
    from: (table: string) => {
      insert: (values: WaitlistInsert) => Promise<{
        error: { message: string; code?: string } | null;
      }>;
    };
  };

  try {
    const { error } = await client.from('waitlist_signups').insert(payload);

    if (error) {
      // The full error is worth having in the console — the visitor gets a
      // message they can act on instead.
      console.error('[waitlist] insert failed', error);

      // 42P01 = undefined_table. Almost always means the migration has not
      // been run against this project yet, which is a deployment problem
      // rather than anything the visitor did.
      if (error.code === '42P01') {
        return {
          ok: false,
          message: 'The waitlist is not available yet. Please try again later.',
        };
      }
      // 23514 = check_violation, e.g. an email the database rejects.
      if (error.code === '23514') {
        return { ok: false, message: 'Please check the details and try again.' };
      }
      return { ok: false, message: GENERIC_FAILURE };
    }

    return { ok: true };
  } catch (err) {
    // Network failure, blocked request, Supabase unreachable.
    console.error('[waitlist] request failed', err);
    return { ok: false, message: GENERIC_FAILURE };
  }
}
