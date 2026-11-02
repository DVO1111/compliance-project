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
 *
 * EMPTY, DELIBERATELY — THE CLOSED BETA IS OVER.
 * ----------------------------------------------
 * This held four addresses from when the product was a closed pilot. The
 * live project now has TWENTY accounts with profiles, and only those four
 * were on the list. The gate never fired because the deployed bundle
 * predated it; the first deploy that carried it would have signed out and
 * refused SIXTEEN real users, each with their own workspace — among them
 * the owner of CCI. That is not a gate doing its job, it is a pilot
 * artefact outliving the pilot.
 *
 * The alternative was to list all twenty addresses. That is worse, and
 * the header above says why: this array ships in the JavaScript every
 * visitor downloads, so "never put anything in here that an address alone
 * should not reveal" would have been broken twenty times over by
 * publishing real customers' email addresses. It would also go stale on
 * the twenty-first account.
 *
 * So the list is emptied, which is the off-switch this file documents:
 * SIGNIN_ALLOWLIST_ACTIVE goes false and isEmailAllowedToSignIn admits
 * everyone. NOTHING IS WEAKENED BY THAT. This was never the security
 * boundary — the header is explicit — and authorisation still rests
 * where it always did: RLS on every company-scoped table, and
 * provision_profile deciding who may hold a profile at all.
 *
 * The real gate, if the product closes again, is the DATABASE one:
 * supabase/migrations/20261214000000_closed_signup_by_default.sql, which
 * makes `allowed_signins` authoritative and closed by default. It is
 * written and merged but NOT YET APPLIED to the live project. Re-populating
 * this array is not the way back; applying that migration is.
 */
export const ALLOWED_SIGNIN_EMAILS: readonly string[] = [];

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

/**
 * Recovery and invite sessions may set a password, but do not grant
 * normal app access.
 *
 * THE ARGUMENT COVERS BOTH KINDS OF EMAILED LINK, and it has to.
 * approve-signup adds an approved address to `allowed_signins` in the
 * database and then sends an invite through inviteUserByEmail. What it
 * cannot do is add that address to ALLOWED_SIGNIN_EMAILS, which is
 * compiled into the bundle every visitor downloads. So an invite
 * callback that was only compared against the hard-coded array was
 * signed out on arrival: the session existed, the password screen drew,
 * and a moment later it vanished. Approving someone produced an email
 * that could not be used.
 *
 * Widening this to invites is safe for the same reason it was safe for
 * recoveries: the link was sent by the product to an address the
 * recipient controls, after an owner approved the request, and
 * `allowed_signins` -- the gate that is not in the browser -- still
 * decides whether the account can have a profile at all.
 */
export function canRestoreAuthSession(
  email: string | null | undefined,
  isEmailedLinkCallback: boolean,
): boolean {
  return isEmailedLinkCallback || isEmailAllowedToSignIn(email);
}
