/**
 * Who may sign in while the product is not open to the public.
 *
 * READ THIS BEFORE RELYING ON IT.
 *
 * This is a GATE IN THE USER INTERFACE, NOT A SECURITY BOUNDARY. The
 * browser holds the Supabase anon key — it has to, that is how the
 * client talks to the backend — so anyone who can open the site can also
 * call Supabase directly and obtain a session without ever loading this
 * file. What this list does is keep the product's front door shut: a
 * person who signs up or is handed a password cannot get into the
 * application. What it does not do is stop someone determined.
 *
 * The real version of this control belongs in the database, where it
 * cannot be skipped: supabase/migrations/20261017000000_signin_allowlist.sql
 * adds an `allowed_signins` table and makes provision_profile refuse an
 * address that is not in it. That migration is written and is in this
 * branch, but it has NOT been applied to any live project — applying it
 * is a deliberate act against a real database, and it is the step that
 * turns this from a front door into a lock.
 *
 * So: this file is honest about being a convenience. Treat the list as
 * published, because it ships in the JavaScript every visitor
 * downloads — never put anything in here that an address alone should
 * not reveal.
 */

/**
 * The addresses allowed in. Case and surrounding spaces are ignored;
 * Gmail dots and +tags are NOT normalised, because treating
 * `a.b@gmail.com` and `ab@gmail.com` as the same address is a Gmail
 * convention and guessing which providers share it is how an allowlist
 * quietly becomes wider than it reads.
 */
export const ALLOWED_SIGNIN_EMAILS: readonly string[] = [
  'ayomideelijah1@gmail.com',
  'fmuyiwa15@gmail.com',
];

/** True when the gate is on at all. An empty list means "everyone", so
 *  emptying the list is how this is switched off — there is no second
 *  flag that can disagree with the list. */
export const SIGNIN_ALLOWLIST_ACTIVE = ALLOWED_SIGNIN_EMAILS.length > 0;

/**
 * The message shown to someone who is not on the list.
 *
 * It does not say whether the account exists. "That address is not
 * registered" on a closed beta tells anyone with a form a way to test
 * which of their colleagues has an account, and the sign-in screen is
 * careful about this elsewhere — see isAccountEnumerationError in
 * passwordReset.ts, which exists for the same reason.
 */
export const SIGNIN_NOT_ALLOWED_MESSAGE =
  'Criateur is not open for general sign-in yet. If you should have access, ask your administrator to add your work address.';

export function isEmailAllowedToSignIn(email: string | null | undefined): boolean {
  if (!SIGNIN_ALLOWLIST_ACTIVE) return true;
  if (!email) return false;
  const normalised = email.trim().toLowerCase();
  return ALLOWED_SIGNIN_EMAILS.some((allowed) => allowed.trim().toLowerCase() === normalised);
}
