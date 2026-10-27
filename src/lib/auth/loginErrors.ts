/**
 * What a failed sign-in is allowed to say.
 *
 * ── THE LEAK THIS CLOSES ───────────────────────────────────────────────────
 *
 * `signInWithPassword` returns "Invalid login credentials" for a wrong
 * password AND for an address that has no account, which is correct and
 * reveals nothing. But it does NOT answer uniformly in every case:
 *
 *     Email not confirmed        -> this address HAS an account
 *     Email link is invalid ...  -> this address HAS an account
 *
 * Surfaced raw — which is what the sign-in screen did — those turn the login
 * form into an account enumerator. Type an address: "Invalid login
 * credentials" means no account or wrong password; "Email not confirmed"
 * means that person registered. On a compliance product that is a way to ask
 * "does this person work at this factory", and the password-reset flow
 * already guards the same question (see `isAccountEnumerationError`).
 *
 * ── WHY NOT JUST HIDE "EMAIL NOT CONFIRMED" ────────────────────────────────
 *
 * Because a real user who has just registered needs to know to check their
 * inbox, and a bare "invalid credentials" sends them to support.
 *
 * So the message is uniform AND carries the hint: everyone who fails to sign
 * in is told that an unconfirmed address will not work yet. Said to
 * everybody, it tells an attacker nothing — the sentence is identical for an
 * address that has no account at all.
 *
 * ── WHAT IS DELIBERATELY STILL SURFACED ────────────────────────────────────
 *
 * Rate limits, network failures and server errors are shown as themselves.
 * They say nothing about whether an account exists, and flattening them into
 * "invalid credentials" would tell someone their password is wrong when the
 * truth is that the service is down.
 */

/** The single answer to every credential-shaped failure. */
export const LOGIN_FAILED_MESSAGE =
  'That email and password did not match. If you have just registered, '
  + 'confirm your address from the email we sent before signing in.';

/**
 * Failures that reveal something about the account, or are the ordinary
 * wrong-password case. All of them get the one message above.
 *
 * Matched on the message because Supabase does not give these distinct
 * codes in every SDK version — the same narrow-by-default reasoning as
 * `isAccountEnumerationError`.
 */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /invalid login credentials/i,
  /invalid_credentials/i,
  //  The leak: these three confirm the address has an account.
  /email not confirmed/i,
  /email_not_confirmed/i,
  /not confirmed/i,
  //  A stale or reused emailed link, which also implies an account.
  /email link is invalid or has expired/i,
  /token has expired or is invalid/i,
  /user not found/i,
  /invalid email or password/i,
];

/**
 * True when the failure must be flattened to `LOGIN_FAILED_MESSAGE`.
 *
 * Returns false for anything unrecognised, so a new or unexpected error is
 * reported as itself. Being wrong in that direction shows the user a clumsy
 * message; being wrong the other way hides a real outage behind "wrong
 * password".
 */
export function isCredentialFailure(message: string | null | undefined): boolean {
  if (!message) return false;
  return CREDENTIAL_PATTERNS.some((p) => p.test(message));
}

/**
 * The message the sign-in screen should display for a failure.
 *
 * Everything the screen shows goes through here, so there is one place that
 * decides what a failed login may disclose.
 */
export function loginFailureMessage(message: string | null | undefined): string {
  if (!message) return LOGIN_FAILED_MESSAGE;
  if (isCredentialFailure(message)) return LOGIN_FAILED_MESSAGE;
  return message;
}
