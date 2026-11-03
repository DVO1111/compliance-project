/**
 * The server-side signup gate, and the message it produces.
 *
 * The gate itself is not here — it is the Before User Created hook and the
 * `provision_profile` guard, and `allowlist_enabled_state_test.sql` holds
 * the database half with 42 assertions. What is tested here is the part the
 * client decides:
 *
 *   - that a refusal is recognised and turned into a message a person can
 *     act on, and that an unrecognised failure is NOT;
 *   - that the hook fails closed, which is the property that decides
 *     whether a broken check is an open door;
 *   - that the signup message is allowed to be specific while the sign-in
 *     message is not, which is a deliberate asymmetry and easy to "fix"
 *     into a leak.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isSignupNotApprovedError,
  SIGNUP_NOT_APPROVED_MESSAGE,
  SIGNIN_NOT_ALLOWED_MESSAGE,
} from '../lib/auth/allowlist';

const HOOK = readFileSync(
  join(process.cwd(), 'supabase/functions/before-user-created/index.ts'),
  'utf8',
);

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261212000000_allowlist_enabled_state.sql'),
  'utf8',
);

//  The migration that made the gate closed by default. Kept separate from
//  MIGRATION rather than concatenated, so an assertion about the CURRENT
//  rule cannot be satisfied by the historical migration that states the
//  old one — which it still does, correctly, because that is what was
//  applied at the time.
const CLOSED_DEFAULT = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261214000000_closed_signup_by_default.sql'),
  'utf8',
);

//  Prose explains what the code avoids, so a search of the whole file would
//  match the thing it refuses to do.
const HOOK_CODE = HOOK
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('recognising a refusal', () => {
  it('recognises the hook\'s own wording', () => {
    expect(isSignupNotApprovedError(
      'This email address is not approved for Criateur yet.',
    )).toBe(true);
  });

  it('recognises the database guard, which fires when the hook is not configured', () => {
    expect(isSignupNotApprovedError(
      'SIGNIN_NOT_ALLOWED: this address is not permitted to use Criateur yet',
    )).toBe(true);
  });

  it('does NOT treat an ordinary failure as a refusal', () => {
    /*
     *  The direction that matters. Reporting a transport error as "you are
     *  not approved" sends an approved user away for good, and they have no
     *  reason to try again.
     */
    for (const m of [
      'Failed to fetch',
      'Network request failed',
      'Database error saving new user',
      'User already registered',
      'Password should be at least 6 characters',
      'rate limit exceeded',
    ]) {
      expect(isSignupNotApprovedError(m)).toBe(false);
    }
  });

  it('treats nothing as nothing', () => {
    expect(isSignupNotApprovedError(null)).toBe(false);
    expect(isSignupNotApprovedError(undefined)).toBe(false);
    expect(isSignupNotApprovedError('')).toBe(false);
  });
});

describe('the two messages say different amounts, on purpose', () => {
  it('tells a would-be signup what to do next', () => {
    expect(SIGNUP_NOT_APPROVED_MESSAGE).toMatch(/not approved/i);
    expect(SIGNUP_NOT_APPROVED_MESSAGE).toMatch(/request access|administrator/i);
  });

  it('keeps the SIGN-IN message free of anything about accounts', () => {
    /*
     *  The asymmetry is the point. At signup the person is asserting their
     *  own address and learns only about themselves. At sign-in, saying
     *  "that address is not registered" lets anyone test which of their
     *  colleagues has an account — on a compliance product, that is a list
     *  of a factory's quality staff.
     */
    expect(SIGNIN_NOT_ALLOWED_MESSAGE).not.toMatch(/no (such )?account/i);
    expect(SIGNIN_NOT_ALLOWED_MESSAGE).not.toMatch(/not (found|registered)/i);
  });

  it('never tells a visitor whether the address already has an account', () => {
    for (const m of [SIGNUP_NOT_APPROVED_MESSAGE, SIGNIN_NOT_ALLOWED_MESSAGE]) {
      expect(m).not.toMatch(/already (have|has|registered|exists)/i);
    }
  });
});

describe('the hook fails closed', () => {
  it('refuses when the signing secret is not configured', () => {
    //  An unconfigured secret must not mean "accept anything": that would
    //  make a missing env var an open front door.
    expect(HOOK_CODE).toMatch(/AUTH_HOOK_SECRET/);
    expect(HOOK_CODE).toMatch(/if\s*\(!secret\)[\s\S]{0,200}return false/);
  });

  it('refuses when the allowlist check itself errors', () => {
    //  A refused signup is visible and recoverable. An unnoticed opening is
    //  neither, because its symptom is accounts being created successfully.
    expect(HOOK_CODE).toMatch(/if\s*\(error\)[\s\S]{0,400}return deny/);
  });

  it('only allows on an explicit true', () => {
    //  `data !== true` rather than `!data`: a null, a string or an object
    //  from a changed RPC shape must not be read as permission.
    expect(HOOK_CODE).toMatch(/data\s*!==\s*true/);
  });

  it('verifies the webhook signature before doing anything', () => {
    /*
     *  Without this, anyone who learns the URL could probe the allowlist
     *  one address at a time — turning the gate into the enumeration
     *  oracle that the table has no RLS policy precisely to avoid.
     */
    expect(HOOK_CODE).toMatch(/signatureValid/);
    const sigIndex = HOOK_CODE.indexOf('await signatureValid');
    const rpcIndex = HOOK_CODE.indexOf('app_signin_is_allowed');
    expect(sigIndex).toBeGreaterThan(-1);
    expect(sigIndex).toBeLessThan(rpcIndex);
  });

  it('rejects a replayed request', () => {
    expect(HOOK_CODE).toMatch(/300/);
    expect(HOOK_CODE).toMatch(/webhook-timestamp/);
  });

  it('compares signatures without leaking their contents through timing', () => {
    expect(HOOK_CODE).toMatch(/timingSafeEqual/);
  });

  it('normalises the address exactly as the database does', () => {
    //  If these disagree, an address approved in the table is refused at
    //  signup — and the operator sees a correct-looking list and a user who
    //  cannot register.
    expect(HOOK_CODE).toMatch(/\.trim\(\)\.toLowerCase\(\)/);
    expect(MIGRATION).toMatch(/lower\(trim\(coalesce\(p_email/);
  });

  it('does not log the address of everyone who tries to sign up', () => {
    const refusalLog = HOOK_CODE.match(/console\.(info|warn|error)\([^)]*\)/g) ?? [];
    for (const line of refusalLog) {
      expect(line).not.toMatch(/\bemail\b/);
    }
  });

  it('keeps the service-role key inside the function', () => {
    //  It is read from the runtime environment and used to construct the
    //  client; it must never be echoed, returned or logged.
    expect(HOOK_CODE).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(HOOK_CODE).not.toMatch(/console\.[a-z]+\([^)]*SERVICE_ROLE/);
    expect(HOOK_CODE).not.toMatch(/JSON\.stringify\([^)]*SERVICE_ROLE/);
  });
});

describe('the database keeps both gates', () => {
  it('still guards provision_profile on the resolved address', () => {
    expect(MIGRATION).toMatch(/app_signin_is_allowed\(v_email\)/);
  });

  it('matches only ENABLED rows', () => {
    //  If disabling every row opened the product, revoking the last pilot
    //  user would publish the application — and the operator doing it
    //  would believe they had just locked it down.
    expect(MIGRATION).toMatch(/AND a\.is_enabled/);
  });

  it('no longer treats an empty allowlist as open', () => {
    /*
     *  THIS TEST ASSERTED THE OPPOSITE UNTIL 20261214000000.
     *
     *  The original gate began `NOT EXISTS (SELECT 1 FROM allowed_signins)`
     *  so that emptying the table opened the product without a code
     *  change. The product requirement is that only approved addresses may
     *  register, and that reading turned "somebody emptied the table" into
     *  "the product is public" — the one moment it should be shut.
     *
     *  Opening signup is now a deliberate switch in `signin_policy`, so the
     *  capability is kept and the accident is not. Asserted against the
     *  CURRENT migration, because the historical one still contains the old
     *  clause and should: it is what was applied at the time.
     */
    expect(CLOSED_DEFAULT).toMatch(/app_public_signup_enabled/);
    expect(CLOSED_DEFAULT).not.toMatch(
      /SELECT\s+NOT EXISTS \(SELECT 1 FROM public\.allowed_signins\)/,
    );
    //  And the switch is off unless somebody turns it on.
    expect(CLOSED_DEFAULT).toMatch(/public_signup_enabled boolean NOT NULL DEFAULT false/);
  });

  it('requires a reason before public signup can be opened', () => {
    //  "Open, but nobody recorded why" is not a record — the same
    //  reasoning as allowed_signins.disabled_at/disabled_by.
    expect(CLOSED_DEFAULT).toMatch(/SIGNUP_POLICY_REASON_REQUIRED/);
    expect(CLOSED_DEFAULT).toMatch(/signin_policy_open_is_accounted_for/);
  });

  it('reads a missing policy row as CLOSED', () => {
    /*
     *  "Deny everyone" is also what a broken configuration looks like. The
     *  wrong default would turn a deleted row into an open front door that
     *  nobody notices, because the symptom is signups succeeding.
     */
    expect(CLOSED_DEFAULT).toMatch(/coalesce\(\s*\n?\s*\(SELECT s\.public_signup_enabled[\s\S]*?false\)/);
  });

  it('refuses to apply if it would deny everyone', () => {
    //  The one way tightening a gate can do harm: applying it to a
    //  database with no enabled address and no switch, which locks out the
    //  person applying it.
    expect(CLOSED_DEFAULT).toMatch(/SIGNUP_WOULD_BE_CLOSED_TO_EVERYONE/);
  });

  it('keeps the policy table out of the browser', () => {
    expect(CLOSED_DEFAULT).toMatch(/ALTER TABLE public\.signin_policy ENABLE ROW LEVEL SECURITY/);
    expect(CLOSED_DEFAULT).toMatch(/REVOKE ALL ON public\.signin_policy FROM anon, authenticated/);
  });

  it('reuses the existing approver set to guard the switch', () => {
    //  Not a second idea of who may administer this.
    expect(CLOSED_DEFAULT).toMatch(/app_is_allowlist_admin/);
    expect(CLOSED_DEFAULT).toMatch(/ALLOWLIST_NOT_PERMITTED/);
  });

  it('gives anon no grant on the admin surface', () => {
    expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.admin_allowlist_list\(\)\s+FROM PUBLIC, anon/);
    expect(MIGRATION).not.toMatch(/GRANT EXECUTE[^;]*admin_allowlist[^;]*anon/);
  });

  it('re-checks the caller inside every admin function', () => {
    //  Not in the route, not in the UI, not in a policy: in the function,
    //  so it holds however the function is reached.
    const checks = MIGRATION.match(/app_is_allowlist_admin\(\)/g) ?? [];
    expect(checks.length).toBeGreaterThanOrEqual(4);
  });

  it('does not weaken the table to make administration easier', () => {
    expect(MIGRATION).not.toMatch(/CREATE POLICY[^;]*allowed_signins/i);
    expect(MIGRATION).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(MIGRATION).not.toMatch(/GRANT (SELECT|ALL)[^;]*allowed_signins/i);
  });
});

describe('the recovery email template', () => {
  const RAW = readFileSync(
    join(process.cwd(), 'supabase/templates/recovery.html'), 'utf8',
  );
  /*
   *  The file's own comment explains what it refuses to do — it names
   *  `{{ .Token }}` and `<link>` as things not to use — so asserting
   *  against the whole file would match the prose and report the opposite
   *  of the truth. Only the markup is searched.
   */
  const TEMPLATE = RAW.replace(/<!--[\s\S]*?-->/g, '');

  it('uses Supabase\'s own generated link', () => {
    //  The whole point of Task 3: the branding changes, the token flow does
    //  not. A hand-built reset URL would be a homemade token system.
    expect(TEMPLATE).toMatch(/\{\{\s*\.ConfirmationURL\s*\}\}/);
  });

  it('never puts the raw token in the message', () => {
    /*
     *  `{{ .Token }}` in a link, an image URL or an analytics parameter is
     *  a live credential in somewhere it can be logged or forwarded.
     */
    expect(TEMPLATE).not.toMatch(/\{\{\s*\.Token/);
    expect(TEMPLATE).not.toMatch(/\{\{\s*\.TokenHash/);
  });

  it('carries the application branding rather than Supabase\'s default', () => {
    expect(TEMPLATE).toMatch(/Criateur/);
    //  The design system's ink and accent.
    expect(TEMPLATE).toMatch(/#0d1933/i);
    expect(TEMPLATE).toMatch(/#3e7a41/i);
  });

  it('offers the link as text as well as a button', () => {
    //  Some clients mangle the button, and a recipient who cannot click
    //  must not have to request a second email.
    const occurrences = TEMPLATE.match(/\{\{\s*\.ConfirmationURL\s*\}\}/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('says the link is single-use and expiring', () => {
    expect(TEMPLATE).toMatch(/once|single/i);
    expect(TEMPLATE).toMatch(/expire/i);
  });

  it('tells a recipient who did not ask that they need do nothing', () => {
    expect(TEMPLATE).toMatch(/did not request/i);
  });

  it('loads no remote stylesheet or web font, which clients strip anyway', () => {
    expect(TEMPLATE).not.toMatch(/<link\b/i);
    expect(TEMPLATE).not.toMatch(/@import/i);
    expect(TEMPLATE).not.toMatch(/fonts\.googleapis/i);
  });

  it('does not ask for a password in the email itself', () => {
    expect(TEMPLATE).not.toMatch(/<input/i);
    expect(TEMPLATE).not.toMatch(/<form/i);
  });
});
