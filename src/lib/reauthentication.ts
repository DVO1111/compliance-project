/**
 * Re-authentication — the decision, separated from React.
 *
 * This lives outside AuthContext so its security properties can be
 * asserted directly rather than inferred from a rendered provider. The
 * properties that matter are as much about what it does NOT do as what
 * it does:
 *
 *   - it verifies the password server-side, via verify_user_password(),
 *     which hashes the candidate against auth.users for auth.uid();
 *   - it does NOT call signInWithPassword(), so no new session is
 *     minted, no SIGNED_IN event fires, and no profile reload is
 *     triggered as a side effect of asking "is this really you";
 *   - it does NOT touch any table, so it cannot reload or mutate state.
 *
 * Those are testable by handing it a client that records every call and
 * asserting the ones that must never happen.
 *
 * NOT FOR ELECTRONIC SIGNATURES. sign_electronic_record() already
 * re-verifies the password, writes every attempt to
 * electronic_signature_attempts, and throttles repeated failures. This
 * helper does none of that, so routing signatures through it would
 * trade an audited, throttled control for one that is neither.
 */

export interface ReauthenticationClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface ReauthenticationResult {
  success: boolean;
  error: Error | null;
}

/** The single RPC this is allowed to call. */
export const REAUTH_RPC = 'verify_user_password';

export async function reauthenticateWithPassword(
  client: ReauthenticationClient,
  user: { id: string } | null | undefined,
  password: string
): Promise<ReauthenticationResult> {
  //  Checked before any call goes out: an unauthenticated caller must
  //  not be able to use this to probe passwords at all.
  if (!user) {
    return { success: false, error: new Error('No authenticated user to re-verify.') };
  }
  if (!password) {
    return { success: false, error: new Error('A password is required.') };
  }

  try {
    const { data, error } = await client.rpc(REAUTH_RPC, { password });
    if (error) {
      return { success: false, error: new Error(error.message) };
    }
    //  The RPC returns a boolean. Anything that is not exactly true —
    //  false, null, undefined — is a failure, so a shape change cannot
    //  quietly become a pass.
    if (data !== true) {
      return { success: false, error: new Error('That password is not correct.') };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err as Error };
  }
}
