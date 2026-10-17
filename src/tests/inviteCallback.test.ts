import { describe, expect, it } from 'vitest';
import { isInviteCallback, isPasswordRecoveryCallback } from '../lib/auth/inviteCallback';

describe('isInviteCallback', () => {
  it('recognizes an invite callback in the auth URL fragment', () => {
    expect(isInviteCallback('', '#access_token=abc&type=invite')).toBe(true);
  });

  it('recognizes an invite callback in the query string', () => {
    expect(isInviteCallback('?type=invite&code=abc', '')).toBe(true);
  });

  it('recognizes an invite callback when the type remains in the query string', () => {
    expect(isInviteCallback('?type=invite', '')).toBe(true);
  });

  it('recognizes the configured setup redirect before Supabase exchanges the callback', () => {
    expect(isInviteCallback('?setup=1&code=abc', '')).toBe(true);
  });

  it('does not treat recovery or ordinary URLs as an invite', () => {
    expect(isInviteCallback('?type=recovery', '#access_token=abc')).toBe(false);
    expect(isInviteCallback('', '')).toBe(false);
  });
});

describe('isPasswordRecoveryCallback', () => {
  it('recognizes the configured recovery redirect marker', () => {
    expect(isPasswordRecoveryCallback('?recovery=1', '')).toBe(true);
  });

  it('keeps recovery routing recognizable when Supabase returns an expired-token error', () => {
    expect(isPasswordRecoveryCallback('?error=access_denied&error_code=otp_expired&recovery=1', '')).toBe(true);
  });

  it('recognizes Supabase recovery redirects when type remains in the query string', () => {
    expect(isPasswordRecoveryCallback('?type=recovery&code=auth-code', '')).toBe(true);
  });

  it('recognizes a PKCE recovery callback carrying an authorization code', () => {
    expect(isPasswordRecoveryCallback('?recovery=1&code=auth-code', '')).toBe(true);
  });

  it('recognizes Supabase recovery tokens in the URL fragment', () => {
    expect(isPasswordRecoveryCallback('', '#access_token=abc&type=recovery')).toBe(true);
  });

  it('does not treat invite callbacks as password recovery', () => {
    expect(isPasswordRecoveryCallback('?setup=1&type=invite', '#type=invite')).toBe(false);
  });
});