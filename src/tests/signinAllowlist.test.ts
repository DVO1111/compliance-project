/**
 * The sign-in allowlist.
 *
 * Small surface, but the failure modes are the kind that pass a casual
 * reading: an address let in by a capital letter, or a list that is
 * active but matches nothing and locks everyone out.
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
  it('is active, and holds the owner address', () => {
    expect(SIGNIN_ALLOWLIST_ACTIVE).toBe(true);
    expect(ALLOWED_SIGNIN_EMAILS).toContain('ayomideelijah1@gmail.com');
  });

  //  Every entry lower-case, because the comparison lower-cases both
  //  sides: an upper-case entry would still work, which is exactly why
  //  it would go unnoticed if the comparison were ever simplified.
  it('stores every address in the form it compares', () => {
    for (const e of ALLOWED_SIGNIN_EMAILS) expect(e).toBe(e.trim().toLowerCase());
  });
});

describe('isEmailAllowedToSignIn', () => {
  it('admits the listed address', () => {
    expect(isEmailAllowedToSignIn('ayomideelijah1@gmail.com')).toBe(true);
  });

  it('ignores case and surrounding space, which is how it will be typed', () => {
    expect(isEmailAllowedToSignIn('  AyomideElijah1@Gmail.com ')).toBe(true);
  });

  it('refuses anyone else', () => {
    expect(isEmailAllowedToSignIn('someone@else.com')).toBe(false);
    expect(isEmailAllowedToSignIn('ayomideelijah2@gmail.com')).toBe(false);
  });

  //  A near-miss that a `startsWith` or `includes` comparison would let
  //  through. This is the assertion that would catch that rewrite.
  it('is not a substring match', () => {
    expect(isEmailAllowedToSignIn('ayomideelijah1@gmail.com.attacker.net')).toBe(false);
    expect(isEmailAllowedToSignIn('xayomideelijah1@gmail.com')).toBe(false);
  });

  it('refuses an empty or absent address rather than defaulting open', () => {
    expect(isEmailAllowedToSignIn('')).toBe(false);
    expect(isEmailAllowedToSignIn(null)).toBe(false);
    expect(isEmailAllowedToSignIn(undefined)).toBe(false);
  });

  //  Gmail treats a.b@ and ab@ as one mailbox; most providers do not.
  //  The list does not normalise, and that is deliberate — this test
  //  records the decision so a later "fix" has to argue with it.
  it('does not silently treat Gmail dot variants as the same address', () => {
    expect(isEmailAllowedToSignIn('ayomide.elijah1@gmail.com')).toBe(false);
  });
});

describe('canRestoreAuthSession', () => {
  //  The unlisted example is deliberately an address that belongs to
  //  nobody. It used to be a real one, which worked until that person
  //  was added to the list — then this test failed, and the recovery
  //  test below silently stopped testing an UNLISTED recovery while
  //  still passing. An example that can be granted access is not a
  //  fixture, it is a time bomb.
  const NOBODY = 'stranger@example.invalid';

  it('keeps the closed allowlist for ordinary sessions', () => {
    expect(canRestoreAuthSession(NOBODY, false)).toBe(false);
    expect(canRestoreAuthSession('fmuyiwa15@gmail.com', false)).toBe(true);
  });

  it('allows an unlisted recovery session only so its password can be changed', () => {
    expect(canRestoreAuthSession(NOBODY, true)).toBe(true);
    expect(canRestoreAuthSession(null, true)).toBe(true);
  });

  //  The test account, added so the invite flow can be exercised end to
  //  end. Asserted here so that removing it from the list is a decision
  //  someone makes rather than something that happens.
  it('admits the test account', () => {
    expect(canRestoreAuthSession('aeoladehinde@sterlinglams.com', false)).toBe(true);
  });
});

describe('the refusal message', () => {
  //  A closed beta must not become a way to test whether a colleague has
  //  an account. The same reasoning governs the password-reset copy.
  it('does not reveal whether the account exists', () => {
    expect(SIGNIN_NOT_ALLOWED_MESSAGE).not.toMatch(/not (found|registered|recognised|recognized)/i);
    expect(SIGNIN_NOT_ALLOWED_MESSAGE).not.toMatch(/no (such )?account/i);
    expect(SIGNIN_NOT_ALLOWED_MESSAGE).not.toMatch(/wrong|incorrect/i);
  });

  it('tells the person what to do next', () => {
    expect(SIGNIN_NOT_ALLOWED_MESSAGE).toMatch(/administrator/i);
  });
});
