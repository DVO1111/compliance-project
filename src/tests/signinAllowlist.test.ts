/**
 * The sign-in allowlist.
 *
 * Small surface, but the failure modes are the kind that pass a casual
 * reading: an address let in by a capital letter, or a list that is
 * active but matches nothing and locks everyone out.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
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

  //  THE CASE THIS MISSED. approve-signup writes the approved address
  //  into allowed_signins and emails an invite, but cannot edit the
  //  array compiled into the bundle. An invite arrival judged only
  //  against that array was signed out as its password screen drew, so
  //  approving someone produced an email that could not be used. The
  //  argument covers both kinds of emailed link for that reason.
  it('allows an invite callback for an address not in the compiled list', () => {
    expect(isEmailAllowedToSignIn('newly.approved@example.invalid')).toBe(false);
    expect(canRestoreAuthSession('newly.approved@example.invalid', true)).toBe(true);
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

describe('the local-only extension', () => {
  /*
   *  The demo seed's eleven `.example` actors have to be able to sign in
   *  for anyone to look at the seeded data in a browser, and they must
   *  never reach the published list — that array ships in the JavaScript
   *  every visitor downloads.
   *
   *  So they come from VITE_SIGNIN_ALLOWLIST_EXTRA, and the whole
   *  safeguard is that the addition is ignored unless the app is pointed
   *  at a LOOPBACK Supabase. These tests are about that condition, because
   *  if it ever stops holding the front door widens silently.
   *
   *  The module reads the environment once, at import, so each case
   *  re-imports it with a different environment.
   */
  const load = async (url: string, extra: string) => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SIGNIN_ALLOWLIST_EXTRA', extra);
    return import('../lib/auth/allowlist');
  };

  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('admits an extra address when Supabase is on loopback', async () => {
    const m = await load('http://127.0.0.1:54321', 'ada.okafor@ibadanpharma.example');
    expect(m.isEmailAllowedToSignIn('ada.okafor@ibadanpharma.example')).toBe(true);
  });

  it('IGNORES the extras against a hosted Supabase', async () => {
    //  The case that matters. A production build talks to
    //  https://<ref>.supabase.co, so setting the variable there must
    //  change nothing at all.
    const m = await load('https://ovxfflilbqaxedzovgmz.supabase.co', 'ada.okafor@ibadanpharma.example');
    expect(m.SIGNIN_ALLOWLIST_EXTRA).toEqual([]);
    expect(m.isEmailAllowedToSignIn('ada.okafor@ibadanpharma.example')).toBe(false);
  });

  it('treats a LAN address as not local', async () => {
    //  "Not obviously remote" is not the same as "provably local".
    const m = await load('http://192.168.1.10:54321', 'ada.okafor@ibadanpharma.example');
    expect(m.SIGNIN_ALLOWLIST_EXTRA).toEqual([]);
  });

  it('is empty when the variable is unset, even on loopback', async () => {
    const m = await load('http://127.0.0.1:54321', '');
    expect(m.SIGNIN_ALLOWLIST_EXTRA).toEqual([]);
  });

  it('never lets an extra displace the published list', async () => {
    const m = await load('http://127.0.0.1:54321', 'someone@else.example');
    expect(m.ALLOWED_SIGNIN_EMAILS).toContain('ayomideelijah1@gmail.com');
    expect(m.isEmailAllowedToSignIn('ayomideelijah1@gmail.com')).toBe(true);
  });

  it('normalises case and spacing in the extras', async () => {
    const m = await load('http://localhost:54321', '  Ada.Okafor@IbadanPharma.Example , b@c.example ');
    expect(m.isEmailAllowedToSignIn('ada.okafor@ibadanpharma.example')).toBe(true);
    expect(m.isEmailAllowedToSignIn('B@C.EXAMPLE')).toBe(true);
  });
});
