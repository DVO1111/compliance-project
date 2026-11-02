/**
 * The sign-in allowlist.
 *
 * Small surface, but the failure modes are the kind that pass a casual
 * reading: an address let in by a capital letter, or a list that is
 * active but matches nothing and locks everyone out.
 *
 * THE LIST IS NOW EMPTY, which is the documented off-switch. The closed
 * pilot is over: the live project has twenty accounts and the array held
 * four, so the first deploy carrying this gate would have refused sixteen
 * real users. See the comment on ALLOWED_SIGNIN_EMAILS for why the list
 * was emptied rather than extended to twenty.
 *
 * The matching tests below are NOT deleted. They are guarded by
 * `it.runIf(SIGNIN_ALLOWLIST_ACTIVE)` and written against whatever the
 * list contains, so the moment anyone repopulates it they come back to
 * life and guard it again.
 */
import { describe, it, expect } from 'vitest';
import {
  ALLOWED_SIGNIN_EMAILS,
  SIGNIN_ALLOWLIST_ACTIVE,
  SIGNIN_NOT_ALLOWED_MESSAGE,
  canRestoreAuthSession,
  isEmailAllowedToSignIn,
} from '../lib/auth/allowlist';

describe('the allowlist itself', () => {
  it('is empty, so the browser gate admits everyone', () => {
    expect(ALLOWED_SIGNIN_EMAILS).toHaveLength(0);
    expect(SIGNIN_ALLOWLIST_ACTIVE).toBe(false);
  });

  /*
   *  THE PROPERTY THAT OUTLASTS THE PILOT.
   *
   *  This array is compiled into the JavaScript every visitor downloads.
   *  Listing the twenty live accounts would have published twenty real
   *  people's email addresses to anyone who opened the bundle. Whatever
   *  this list holds in future, it must not hold a customer's address.
   */
  it('publishes nobody: no real mailbox is compiled into the bundle', () => {
    for (const e of ALLOWED_SIGNIN_EMAILS) {
      expect(e).toMatch(/@(example\.(com|org|net|invalid)|test|invalid)$/);
    }
  });

  //  Every entry lower-case, because the comparison lower-cases both
  //  sides: an upper-case entry would still work, which is exactly why
  //  it would go unnoticed if the comparison were ever simplified.
  it('stores every address in the form it compares', () => {
    for (const e of ALLOWED_SIGNIN_EMAILS) expect(e).toBe(e.trim().toLowerCase());
  });
});

describe('isEmailAllowedToSignIn — with the gate off', () => {
  it('admits an ordinary address', () => {
    expect(isEmailAllowedToSignIn('folaabitogun@gmail.com')).toBe(true);
    expect(isEmailAllowedToSignIn('anyone@elsewhere.test')).toBe(true);
  });

  /*
   *  NOTHING IS WEAKENED BY THAT, and this is the place to say so. This
   *  function was never the security boundary — the module header is
   *  explicit, and the browser holds the anon key regardless. What still
   *  decides access is RLS on every company-scoped table and
   *  provision_profile deciding who may hold a profile. The real gate, if
   *  the product closes again, is 20261214000000_closed_signup_by_default.
   */
  it('is a front door, not a lock — the message still says who to ask', () => {
    expect(SIGNIN_NOT_ALLOWED_MESSAGE).toMatch(/administrator/i);
  });
});

describe('isEmailAllowedToSignIn — the matching rules, if the list returns', () => {
  //  Written against the list rather than a fixed address, so these
  //  reactivate for whatever a future list contains.
  const first = ALLOWED_SIGNIN_EMAILS[0] ?? '';

  it.runIf(SIGNIN_ALLOWLIST_ACTIVE)('admits a listed address', () => {
    expect(isEmailAllowedToSignIn(first)).toBe(true);
  });

  it.runIf(SIGNIN_ALLOWLIST_ACTIVE)('ignores case and surrounding space', () => {
    expect(isEmailAllowedToSignIn(`  ${first.toUpperCase()} `)).toBe(true);
  });

  it.runIf(SIGNIN_ALLOWLIST_ACTIVE)('refuses anyone else', () => {
    expect(isEmailAllowedToSignIn('someone@else.test')).toBe(false);
  });

  //  A near-miss that a `startsWith` or `includes` comparison would let
  //  through. This is the assertion that would catch that rewrite.
  it.runIf(SIGNIN_ALLOWLIST_ACTIVE)('is not a substring match', () => {
    expect(isEmailAllowedToSignIn(`${first}.attacker.net`)).toBe(false);
    expect(isEmailAllowedToSignIn(`x${first}`)).toBe(false);
  });

  it.runIf(SIGNIN_ALLOWLIST_ACTIVE)('refuses an absent address rather than defaulting open', () => {
    expect(isEmailAllowedToSignIn('')).toBe(false);
    expect(isEmailAllowedToSignIn(null)).toBe(false);
  });

  //  Gmail treats a.b@ and ab@ as one mailbox; most providers do not.
  //  The list does not normalise, and that is deliberate — this test
  //  records the decision so a later "fix" has to argue with it.
  it.runIf(SIGNIN_ALLOWLIST_ACTIVE)('does not treat Gmail dot variants as the same address', () => {
    const [local, domain] = first.split('@');
    if (local && local.length > 2 && domain) {
      const dotted = `${local[0]}.${local.slice(1)}@${domain}`;
      expect(isEmailAllowedToSignIn(dotted)).toBe(false);
    }
  });
});

describe('canRestoreAuthSession', () => {
  const NOBODY = 'stranger@example.invalid';

  it('restores an ordinary session now that the gate is open', () => {
    expect(canRestoreAuthSession(NOBODY, false)).toBe(true);
  });

  //  THE CASE THIS MISSED, kept because it is the reason the second
  //  argument exists. approve-signup writes the approved address into
  //  allowed_signins and emails an invite, but cannot edit the array
  //  compiled into the bundle. An invite arrival judged only against that
  //  array was signed out as its password screen drew, so approving
  //  somebody produced an email that could not be used. Still true the
  //  moment the list is repopulated, so it is asserted unconditionally.
  it('always allows an emailed link, recovery or invite', () => {
    expect(canRestoreAuthSession(NOBODY, true)).toBe(true);
    expect(canRestoreAuthSession(null, true)).toBe(true);
    expect(canRestoreAuthSession('newly.approved@example.invalid', true)).toBe(true);
  });
});

describe('the refusal message', () => {
  //  Kept whether or not the gate is on: if the product ever closes
  //  again, this copy is shown, and it must not become a way to test
  //  whether a colleague has an account. The same reasoning governs the
  //  password-reset copy.
  it('does not reveal whether the account exists', () => {
    expect(SIGNIN_NOT_ALLOWED_MESSAGE).not.toMatch(/not (found|registered|recognised|recognized)/i);
    expect(SIGNIN_NOT_ALLOWED_MESSAGE).not.toMatch(/no (such )?account/i);
    expect(SIGNIN_NOT_ALLOWED_MESSAGE).not.toMatch(/wrong|incorrect/i);
  });

  it('tells the person what to do next', () => {
    expect(SIGNIN_NOT_ALLOWED_MESSAGE).toMatch(/administrator/i);
  });
});
