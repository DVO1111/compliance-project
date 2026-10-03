/**
 * Password-reset request — the enumeration guard.
 *
 * The property under test is that "Forgot password?" cannot be used to ask
 * whether someone has an account. The screen always advances to the same
 * "if that email has an account" message, and the only thing that decides
 * whether an error is hidden or shown is
 * `isAccountEnumerationError`. Getting it wrong is a real fault in both
 * directions, so both are asserted:
 *
 *   too broad  -> a failed send is presented to the user as success, and
 *                 they wait for an email that never arrives
 *   too narrow -> the form answers differently for a known and an unknown
 *                 address, which is the enumeration leak
 *
 * There is no DOM test environment in this project, so the screens
 * themselves are not rendered here. This covers the decision that carries
 * the consequence.
 */

import { describe, it, expect } from 'vitest';
import {
  isAccountEnumerationError,
  passwordResetRedirectTo,
} from '../lib/auth/passwordReset';

describe('isAccountEnumerationError — hidden, because it reveals account existence', () => {
  const HIDDEN = [
    'User not found',
    'user_not_found',
    'No user found with that email',
    'Unable to find user with that email address',
    'Email not found',
    'Email not registered',
    'Email not confirmed',
    'Invalid email',
    //  Case and surrounding text must not matter — these arrive wrapped in
    //  varying envelopes across SDK versions.
    'AuthApiError: USER NOT FOUND (400)',
  ];

  it.each(HIDDEN)('hides %j', (msg) => {
    expect(isAccountEnumerationError(msg)).toBe(true);
  });
});

describe('isAccountEnumerationError — surfaced, because the send really failed', () => {
  const SURFACED = [
    'Failed to fetch',
    'Network request failed',
    'request timed out',
    'Error sending recovery email',
    'For security purposes, you can only request this after 60 seconds',
    'email rate limit exceeded',
    'SMTP connection refused',
    'Internal Server Error',
    'Service temporarily unavailable',
    //  Unrecognised must mean "report it". This is the assertion that
    //  fails if someone widens the pattern to a catch-all.
    'something nobody has seen before',
  ];

  it.each(SURFACED)('surfaces %j', (msg) => {
    expect(isAccountEnumerationError(msg)).toBe(false);
  });

  it('a rate limit is surfaced, not hidden', () => {
    //  Called out on its own because it is the tempting one to swallow:
    //  it is not a failure of the address, and telling someone their email
    //  is coming when they have been throttled means they wait for nothing.
    expect(isAccountEnumerationError('email rate limit exceeded')).toBe(false);
  });
});

describe('isAccountEnumerationError — empty input', () => {
  it.each([null, undefined, ''])('treats %j as a real failure', (msg) => {
    //  No message is not evidence that the address is unknown, so the safe
    //  reading is that something went wrong.
    expect(isAccountEnumerationError(msg)).toBe(false);
  });
});

describe('passwordResetRedirectTo', () => {
  it('builds the redirect from the origin', () => {
    expect(passwordResetRedirectTo('https://app.criateur.com'))
      .toBe('https://app.criateur.com/?recovery=1');
  });

  it('does not double the slash when the origin has a trailing one', () => {
    expect(passwordResetRedirectTo('https://app.criateur.com/'))
      .toBe('https://app.criateur.com/?recovery=1');
  });

  it('works for a local origin with a port', () => {
    expect(passwordResetRedirectTo('http://localhost:5173'))
      .toBe('http://localhost:5173/?recovery=1');
  });
});
