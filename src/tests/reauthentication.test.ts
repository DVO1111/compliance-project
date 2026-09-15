/**
 * Re-authentication — security behaviour tests.
 *
 * Covers the seven properties required by the security review. Several
 * of them are negative: the point of re-authentication is that asking
 * "is this really you" must not itself change anything. Those are
 * asserted by handing the function a client that records every call and
 * checking that the forbidden ones never happen.
 *
 * The fake client exposes the same surface a real Supabase client does —
 * `auth.signInWithPassword`, `auth.setSession`, `auth.refreshSession`,
 * `onAuthStateChange` and `from` — so "it was never called" is a
 * meaningful statement rather than an artefact of a thin stub.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  reauthenticateWithPassword,
  REAUTH_RPC,
  type ReauthenticationClient,
} from '../lib/reauthentication';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTH_CONTEXT = resolve(HERE, '../contexts/AuthContext.tsx');

const USER = { id: '00000000-0000-4000-8000-000000000001' };

/** A client that records everything, and screams if the wrong thing is called. */
function makeClient(rpcResult: { data: unknown; error: { message: string } | null }) {
  const authStateListeners: Array<(e: string) => void> = [];
  const client = {
    rpc: vi.fn(async (_fn: string, _args: Record<string, unknown>) => rpcResult),
    from: vi.fn(() => {
      throw new Error('from() must not be called during re-authentication');
    }),
    auth: {
      signInWithPassword: vi.fn(async () => {
        throw new Error('signInWithPassword must not be called during re-authentication');
      }),
      setSession: vi.fn(async () => {
        throw new Error('setSession must not be called during re-authentication');
      }),
      refreshSession: vi.fn(async () => {
        throw new Error('refreshSession must not be called during re-authentication');
      }),
      signOut: vi.fn(async () => {
        throw new Error('signOut must not be called during re-authentication');
      }),
      onAuthStateChange: vi.fn((cb: (e: string) => void) => {
        authStateListeners.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  };
  return { client, authStateListeners };
}

const ok = { data: true, error: null };
const wrong = { data: false, error: null };

describe('reauthentication — the password check itself', () => {
  it('succeeds with the correct password', async () => {
    const { client } = makeClient(ok);
    const r = await reauthenticateWithPassword(client as unknown as ReauthenticationClient, USER, 'correct-horse');
    expect(r).toEqual({ success: true, error: null });
  });

  it('verifies server-side, via verify_user_password', async () => {
    const { client } = makeClient(ok);
    await reauthenticateWithPassword(client as unknown as ReauthenticationClient, USER, 'correct-horse');
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith(REAUTH_RPC, { password: 'correct-horse' });
    expect(REAUTH_RPC).toBe('verify_user_password');
  });

  it('fails with an incorrect password', async () => {
    const { client } = makeClient(wrong);
    const r = await reauthenticateWithPassword(client as unknown as ReauthenticationClient, USER, 'nope');
    expect(r.success).toBe(false);
    expect(r.error?.message).toMatch(/not correct/i);
  });

  it('treats a non-boolean result as failure rather than success', async () => {
    // a shape change in the RPC must not quietly become a pass
    for (const data of [null, undefined, 'true', 1, {}]) {
      const { client } = makeClient({ data, error: null });
      const r = await reauthenticateWithPassword(client as unknown as ReauthenticationClient, USER, 'x');
      expect(r.success, `data=${JSON.stringify(data)} must not pass`).toBe(false);
    }
  });

  it('fails, without throwing, when the RPC itself errors', async () => {
    const { client } = makeClient({ data: null, error: { message: 'network down' } });
    const r = await reauthenticateWithPassword(client as unknown as ReauthenticationClient, USER, 'x');
    expect(r.success).toBe(false);
    expect(r.error?.message).toBe('network down');
  });
});

describe('reauthentication — an unauthenticated caller', () => {
  it.each([[null], [undefined]])('fails when user is %s', async (user) => {
    const { client } = makeClient(ok);
    const r = await reauthenticateWithPassword(client as unknown as ReauthenticationClient, user, 'anything');
    expect(r.success).toBe(false);
    expect(r.error?.message).toMatch(/no authenticated user/i);
  });

  it('does not reach the server at all when unauthenticated', async () => {
    // otherwise this would be an unauthenticated password-probing oracle
    const { client } = makeClient(ok);
    await reauthenticateWithPassword(client as unknown as ReauthenticationClient, null, 'guess');
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('rejects an empty password without a round trip', async () => {
    const { client } = makeClient(ok);
    const r = await reauthenticateWithPassword(client as unknown as ReauthenticationClient, USER, '');
    expect(r.success).toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe('reauthentication — what must NOT happen', () => {
  it('does not rotate the session', async () => {
    const { client } = makeClient(ok);
    await reauthenticateWithPassword(client as unknown as ReauthenticationClient, USER, 'correct-horse');
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(client.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('triggers no auth-state event', async () => {
    const { client, authStateListeners } = makeClient(ok);
    const seen: string[] = [];
    client.auth.onAuthStateChange((e) => seen.push(e));
    await reauthenticateWithPassword(client as unknown as ReauthenticationClient, USER, 'correct-horse');
    expect(authStateListeners).toHaveLength(1); // the listener really is registered
    expect(seen).toEqual([]);                   // …and nothing fired it
  });

  it('triggers no profile reload — it touches no table', async () => {
    const { client } = makeClient(ok);
    await reauthenticateWithPassword(client as unknown as ReauthenticationClient, USER, 'correct-horse');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('has no login side effect on failure either', async () => {
    const { client } = makeClient(wrong);
    await reauthenticateWithPassword(client as unknown as ReauthenticationClient, USER, 'nope');
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('makes exactly one call, and only the verification RPC', async () => {
    const { client } = makeClient(ok);
    await reauthenticateWithPassword(client as unknown as ReauthenticationClient, USER, 'correct-horse');
    expect(client.rpc.mock.calls.map((c) => c[0])).toEqual([REAUTH_RPC]);
  });
});

describe('AuthContext wiring', () => {
  const src = readFileSync(AUTH_CONTEXT, 'utf8');

  it('delegates to the audited helper rather than reimplementing the check', () => {
    expect(src).toContain('reauthenticateWithPassword');
  });

  it('never calls signInWithPassword for re-authentication', () => {
    // Guards against the original implementation being reintroduced.
    // Comments are stripped first: the file deliberately *mentions*
    // signInWithPassword in prose explaining why re-auth does not use
    // it, and that mention must not count as a call.
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');

    const calls = [...code.matchAll(/signInWithPassword/g)];
    expect(calls, 'signInWithPassword should appear exactly once in code').toHaveLength(1);

    // …and that one occurrence belongs to signIn(), not to reauthenticate()
    const around = code.slice(Math.max(0, calls[0].index! - 500), calls[0].index!);
    expect(around).toContain('const signIn');
    expect(around).not.toContain('const reauthenticate');
  });
});
