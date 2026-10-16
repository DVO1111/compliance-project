import { describe, expect, it } from 'vitest';
import { isInviteCallback } from '../lib/auth/inviteCallback';

describe('isInviteCallback', () => {
  it('recognizes an invite callback in the auth URL fragment', () => {
    expect(isInviteCallback('', '#access_token=abc&type=invite')).toBe(true);
  });

  it('recognizes an invite callback in the query string', () => {
    expect(isInviteCallback('?type=invite&code=abc', '')).toBe(true);
  });

  it('does not treat recovery or ordinary URLs as an invite', () => {
    expect(isInviteCallback('?type=recovery', '#access_token=abc')).toBe(false);
    expect(isInviteCallback('', '')).toBe(false);
  });
});