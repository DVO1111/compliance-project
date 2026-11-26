/**
 * What a failed sign-in may disclose.
 *
 * The property: a stranger must not be able to use the login form to ask
 * whether an address has a Criateur account. The password-reset flow has
 * guarded this since it was written; the sign-in form did not, and
 * surfaced `error.message` raw.
 *
 * The leak was narrow and real. Supabase answers "Invalid login
 * credentials" for both a wrong password and an unknown address — which
 * reveals nothing — but answers "Email not confirmed" when the address
 * HAS an account and has not been verified. Typed into the form, that is
 * the difference between "no account or wrong password" and "this person
 * registered".
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loginFailureMessage, isCredentialFailure, LOGIN_FAILED_MESSAGE,
} from '../lib/auth/loginErrors';

describe('the login form cannot be used to enumerate accounts', () => {
  it('answers identically for an unknown address and a wrong password', () => {
    //  Both are the ordinary case and both must be indistinguishable.
    expect(loginFailureMessage('Invalid login credentials'))
      .toBe(loginFailureMessage('invalid_credentials'));
    expect(loginFailureMessage('Invalid login credentials')).toBe(LOGIN_FAILED_MESSAGE);
  });

  it('answers identically when the address HAS an unconfirmed account', () => {
    /*
     *  THE ASSERTION THIS FILE EXISTS FOR. "Email not confirmed" proves
     *  the address registered. It must come back as the same sentence as
     *  a completely unknown address.
     */
    expect(loginFailureMessage('Email not confirmed')).toBe(LOGIN_FAILED_MESSAGE);
    expect(loginFailureMessage('email_not_confirmed')).toBe(LOGIN_FAILED_MESSAGE);
    expect(loginFailureMessage('Email not confirmed'))
      .toBe(loginFailureMessage('Invalid login credentials'));
  });

  it('answers identically for a stale emailed link, which also implies an account', () => {
    expect(loginFailureMessage('Email link is invalid or has expired'))
      .toBe(LOGIN_FAILED_MESSAGE);
    expect(loginFailureMessage('User not found')).toBe(LOGIN_FAILED_MESSAGE);
  });

  it('says nothing about accounts, registration or confirmation status', () => {
    //  The sentence itself must not leak what it was flattened from.
    expect(LOGIN_FAILED_MESSAGE).not.toMatch(/no (such )?account/i);
    expect(LOGIN_FAILED_MESSAGE).not.toMatch(/not (found|registered|recognised)/i);
    expect(LOGIN_FAILED_MESSAGE).not.toMatch(/does not exist/i);
  });

  it('still tells a real new user what to do, without telling anyone else anything', () => {
    /*
     *  The hint is given to EVERYONE who fails, so it carries no
     *  information — but it stops a genuinely unconfirmed user being sent
     *  to support by a bare "wrong password".
     */
    expect(LOGIN_FAILED_MESSAGE).toMatch(/confirm your address/i);
  });
});

describe('real failures are still reported as themselves', () => {
  it('does not flatten a rate limit into a credential failure', () => {
    //  Telling someone their password is wrong when the truth is "too many
    //  attempts" sends them to reset a password that was never the problem.
    const m = 'Email rate limit exceeded';
    expect(isCredentialFailure(m)).toBe(false);
    expect(loginFailureMessage(m)).toBe(m);
  });

  it('does not flatten a network or server failure', () => {
    for (const m of ['Failed to fetch', 'Network request failed',
                     'Database error querying schema', 'Service unavailable']) {
      expect(isCredentialFailure(m)).toBe(false);
      expect(loginFailureMessage(m)).toBe(m);
    }
  });

  it('falls back to the uniform message when there is no message at all', () => {
    expect(loginFailureMessage(null)).toBe(LOGIN_FAILED_MESSAGE);
    expect(loginFailureMessage(undefined)).toBe(LOGIN_FAILED_MESSAGE);
    expect(loginFailureMessage('')).toBe(LOGIN_FAILED_MESSAGE);
  });
});

describe('the sign-in screen routes every failure through it', () => {
  it('does not display the raw error message', () => {
    /*
     *  Pinned against the file, because the leak was not a missing
     *  function — it was a screen calling setError(error.message).
     *  Re-introducing that line is the regression.
     */
    const page = readFileSync(
      join(process.cwd(), 'src/components/Auth/LoginPage.tsx'), 'utf8',
    );
    const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const signInHandler = code.slice(
      code.indexOf('const handleSignIn'),
      code.indexOf('const handleSendReset'),
    );
    expect(signInHandler).toMatch(/loginFailureMessage\(error\.message\)/);
    expect(signInHandler).not.toMatch(/setError\(error\.message\)/);
  });
});
