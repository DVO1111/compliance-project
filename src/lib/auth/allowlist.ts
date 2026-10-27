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
  //  A SEPARATE ADDRESS from fmuyiwa15 above, not a correction of it.
  //  The two differ only in two digits, so an edit that "tidied" one
  //  into the other would lock somebody out and look like a typo fix.
  'fmuyiwa58@gmail.com',
  'aeoladehinde@sterlinglams.com',
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

/**
 * The message shown when a signup is refused because the address is not
 * approved.
 *
 * SEPARATE FROM `SIGNIN_NOT_ALLOWED_MESSAGE` on purpose. That one guards
 * sign-IN, where saying anything specific would let a stranger test which
 * of their colleagues has an account. Signup is not the same question: the
 * person is asserting their own address, and the only thing this reveals is
 * whether THAT address is on the pilot list — which they are entitled to
 * know, and which tells them nothing about anyone else.
 *
 * So this one is allowed to be useful, and says what to do next. A vague
 * "signup failed" here would send an approved user who mistyped their
 * address into a support queue for no reason.
 */
export const SIGNUP_NOT_APPROVED_MESSAGE =
  'This email address is not approved for Criateur yet. Criateur is in a '
  + 'closed pilot — request access at criateur.com and an administrator '
  + 'will add you.';

/**
 * True when a signup failure means "not on the allowlist" rather than
 * "something broke".
 *
 * Two server-side gates can produce it and both are matched, because
 * either may be the one that fires:
 *
 *   - the Before User Created hook, which aborts the signup transaction
 *     before any auth.users row exists and returns its own message;
 *   - `provision_profile`'s SIGNIN_NOT_ALLOWED guard, which fires later if
 *     the hook is not configured on the project.
 *
 * Deliberately narrow. Anything unrecognised is treated as a real failure
 * and surfaced as itself, because reporting a transport error as "you are
 * not approved" would send an approved user away for good.
 */
export function isSignupNotApprovedError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /SIGNIN_NOT_ALLOWED/i.test(message)
    || /not approved for Criateur/i.test(message)
    || /not permitted to use Criateur/i.test(message);
}
