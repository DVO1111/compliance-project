/**
 *  The tokens an invite link actually arrives with.
 *
 *  WHY THIS EXISTS. `inviteUserByEmail` does not support PKCE — Supabase
 *  says so outright, because the browser that sends an invite is rarely
 *  the browser that opens it, which is the one thing PKCE depends on. So
 *  an invite lands as an IMPLICIT callback: `#access_token=…&
 *  refresh_token=…&type=invite` in the fragment.
 *
 *  Our client is created with `flowType: 'pkce'`, which recovery genuinely
 *  needs. A PKCE client is waiting for `?code=` and refuses fragment
 *  tokens, so it never established a session for an invited user. They
 *  reached the "Choose your password" screen with no session, were told
 *  the invitation "has already been used or did not establish a session",
 *  and were invited to request a fresh link — which is precisely what the
 *  live project's audit trail shows people doing, within a minute of
 *  confirming, every time.
 *
 *  Reading the pair here lets AuthContext adopt the session explicitly,
 *  so invites work without moving recovery off PKCE.
 */
export type ImplicitInviteTokens = { access_token: string; refresh_token: string };

export function readImplicitInviteTokens(hash: string): ImplicitInviteTokens | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.get('type') !== 'invite') return null;

  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  //  Both or nothing. setSession rejects a half pair, and a link carrying
  //  only one is not something to half-adopt.
  if (!access_token || !refresh_token) return null;

  return { access_token, refresh_token };
}

export function isInviteCallback(search: string, hash: string): boolean {
  const queryParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  return queryParams.get('type') === 'invite'
    || hashParams.get('type') === 'invite'
    || queryParams.get('setup') === '1';
}

export function isPasswordRecoveryCallback(search: string, hash: string): boolean {
  const queryParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  return queryParams.get('recovery') === '1'
    || (queryParams.has('code') && queryParams.get('recovery') === '1')
    || queryParams.get('type') === 'recovery'
    || hashParams.get('type') === 'recovery';
}