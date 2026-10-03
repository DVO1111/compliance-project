/**
 * The one decision in the password-reset request that has a security
 * consequence, pulled out so it can be tested.
 *
 * "Forgot password?" must not become an account enumerator. If the form
 * answers differently for an address that has an account and one that does
 * not, anyone can ask it "does this person work at this company?" — which
 * on a compliance product is a list of a factory's quality staff.
 *
 * So the screen always advances to "If that email has a Criateur account,
 * a reset link is on its way." Supabase's own behaviour is to answer the
 * same way for an unknown address, and this predicate is the guard against
 * that changing: an error that merely means "no such user" is swallowed, a
 * genuine failure is surfaced, because silently swallowing a transport
 * error would tell someone their reset email is coming when it is not.
 *
 * Deliberately matched on the message. Supabase does not give these a
 * distinct code — `user_not_found` and a network timeout can arrive with
 * the same shape — so the message is the only thing to go on. The pattern
 * is kept narrow for that reason: anything unrecognised is treated as a
 * real failure, which is the safe direction to be wrong in.
 */

/** Messages that mean "that address has no account", not "we failed". */
const ENUMERATION_PATTERNS: readonly RegExp[] = [
  /user not found/i,
  /user_not_found/i,
  /no user found/i,
  /unable to find user/i,
  /email not (?:found|registered|confirmed)/i,
  /invalid email/i,
];

/**
 * True when the error only reveals whether an account exists, and must
 * therefore be hidden from the caller.
 *
 * Returns false for anything unrecognised, so a new or unexpected failure
 * is reported rather than quietly presented as success.
 */
export function isAccountEnumerationError(message: string | null | undefined): boolean {
  if (!message) return false;
  return ENUMERATION_PATTERNS.some((p) => p.test(message));
}

/**
 * Where Supabase sends someone after they click the reset link.
 *
 * The app's own origin, with a marker so the arrival is identifiable in
 * logs and analytics. The SDK exchanges the token in the URL fragment on
 * load and fires PASSWORD_RECOVERY; AuthContext turns that into the reset
 * screen.
 *
 * The URL has to be on the project's redirect allow-list in Supabase or the
 * link refuses to open. That is an operator setting and cannot be fixed
 * from the codebase — the one part of this flow that has to be configured
 * by hand.
 */
export function passwordResetRedirectTo(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/?recovery=1`;
}
