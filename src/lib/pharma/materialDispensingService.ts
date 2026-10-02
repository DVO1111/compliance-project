/* ═══════════════════════════════════════════════════════════════
   Material dispensing gate — service layer  (Week 3, item 04)
   ═══════════════════════════════════════════════════════════════

   Item 04 asks for a hard block on dispensing quarantined material
   "enforced at the service layer", and its NOT DONE IF says the block
   must not exist "only in the interface".

   Both are satisfied, but not by the same code. The real block is in the
   database — material_lot_assert_dispensable() in
   20261002000000_material_quarantine_gate.sql raises
   MATERIAL_DISPENSE_BLOCKED — because the browser holds the anon key and
   talks straight to PostgREST. A check that lived only in this file
   would be bypassable by anyone who opens a console, which makes it a
   usability feature rather than a control.

   What this file adds is the service method the item asks for: a single
   place every dispensing caller goes through, which surfaces the
   server's reason as a readable message, and which FAILS CLOSED.

   FAIL CLOSED IS THE WHOLE POINT
   ------------------------------
   supabase-js does not reject on a failed query — it RESOLVES with
   { data: null, error }. So the obvious implementation

       const { data } = await client.rpc('material_lot_block_reason', …);
       return { allowed: data === null };          // WRONG

   reads a network failure, a permission error and a dropped connection
   as "no reason to block" — that is, as permission to dispense
   quarantined material. Every path that cannot prove the lot is
   dispensable must therefore report it as blocked, and the tests in
   src/tests/materialDispensing.test.ts exist mostly to hold that line.

   Dispensing itself arrives in Week 5. It must call
   assertMaterialLotDispensable() before it moves any quantity.
*/

import { logger } from '../logger';

export const BLOCK_REASON_RPC = 'material_lot_block_reason';
export const ASSERT_DISPENSABLE_RPC = 'material_lot_assert_dispensable';

/** The slice of a Supabase client this module needs, so it can be tested
 *  without a project, a network or a .env. */
export interface DispenseGateClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface DispenseCheck {
  /** True only when the server positively confirmed the lot may be
   *  dispensed. Never true by default, and never true on an error. */
  allowed: boolean;
  /** Why not, in a sentence fit to show a user. Null when allowed. */
  reason: string | null;
  /** Set when the check itself failed, as opposed to the lot being
   *  legitimately blocked. Callers that want to distinguish "you may not"
   *  from "we could not tell" read this; callers that only care whether
   *  to proceed can ignore it, because `allowed` is false either way. */
  indeterminate: boolean;
}

const UNAVAILABLE =
  'The material lot could not be checked, so dispensing is blocked. Try again, and tell an administrator if it persists.';

/**
 * Ask the server whether a lot may be dispensed.
 *
 * Injectable so the gate's behaviour — particularly its behaviour when
 * the round trip fails — can be unit tested, which is what item 04
 * requires given dispensing itself does not exist until Week 5.
 */
export async function checkMaterialLotDispensable(
  client: DispenseGateClient,
  lotId: string | null | undefined,
  quantity?: number | null
): Promise<DispenseCheck> {
  if (!lotId) {
    return { allowed: false, reason: 'No material lot was specified.', indeterminate: false };
  }
  //  Checked here as well as in the database, so an obviously invalid
  //  request does not need a round trip to be refused.
  if (quantity !== undefined && quantity !== null) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        allowed: false,
        reason: 'A dispensing quantity must be a number greater than zero.',
        indeterminate: false,
      };
    }
  }

  try {
    const { data, error } = await client.rpc(BLOCK_REASON_RPC, {
      p_lot_id: lotId,
      p_quantity: quantity ?? null,
    });

    //  The error branch comes first and refuses. This is the case the
    //  header warns about: supabase-js resolves rather than rejecting, so
    //  without this the `data === null` test below would read a failure
    //  as a clean pass.
    if (error) {
      logger.error('checkMaterialLotDispensable: RPC failed', error);
      return { allowed: false, reason: UNAVAILABLE, indeterminate: true };
    }

    //  NULL from the function means "no reason to block". Anything that
    //  is not exactly null — a string, undefined, an object — is either a
    //  reason or something we do not understand, and neither is consent.
    if (data === null) {
      return { allowed: true, reason: null, indeterminate: false };
    }
    if (typeof data === 'string' && data.length > 0) {
      return { allowed: false, reason: data, indeterminate: false };
    }

    logger.error('checkMaterialLotDispensable: unexpected payload', { data });
    return { allowed: false, reason: UNAVAILABLE, indeterminate: true };
  } catch (err) {
    //  A thrown error (offline, aborted, a client that does reject) is
    //  still not permission.
    logger.error('checkMaterialLotDispensable: threw', err);
    return { allowed: false, reason: UNAVAILABLE, indeterminate: true };
  }
}

/**
 * The hard block. Throws unless the lot may be dispensed.
 *
 * Calls the database's own assert as well as reading the reason, so a
 * caller cannot end up proceeding on a stale or tampered client-side
 * answer: the server refuses independently.
 */
export async function assertMaterialLotDispensable(
  client: DispenseGateClient,
  lotId: string | null | undefined,
  quantity?: number | null
): Promise<void> {
  const check = await checkMaterialLotDispensable(client, lotId, quantity);
  if (!check.allowed) {
    throw new MaterialDispenseBlockedError(check.reason ?? UNAVAILABLE, check.indeterminate);
  }

  const { error } = await client.rpc(ASSERT_DISPENSABLE_RPC, {
    p_lot_id: lotId,
    p_quantity: quantity ?? null,
  });
  if (error) {
    //  The server refused even though the reason read clean — a race
    //  (the lot moved between the two calls) or a permission problem.
    //  The server's answer wins.
    throw new MaterialDispenseBlockedError(stripErrcode(error.message), false);
  }
}

export class MaterialDispenseBlockedError extends Error {
  readonly indeterminate: boolean;
  constructor(message: string, indeterminate = false) {
    super(message);
    this.name = 'MaterialDispenseBlockedError';
    this.indeterminate = indeterminate;
  }
}

/** Postgres prefixes the raised message with its sentinel; users should
 *  not see it. */
export function stripErrcode(message: string): string {
  return message.replace(/^MATERIAL_(DISPENSE_BLOCKED|FORBIDDEN):\s*/, '').trim();
}

//  ── Wrappers over the real client ───────────────────────────────────
//  Imported lazily, like licenceService and productService: src/lib/
//  supabase.ts throws at module load when VITE_SUPABASE_* are unset, so a
//  top-level import would make importing this file for its pure helpers
//  fail anywhere without a .env — CI included.
async function db(): Promise<DispenseGateClient> {
  const { supabase } = await import('../supabase');
  return supabase as unknown as DispenseGateClient;
}

export async function isMaterialLotDispensable(
  lotId: string,
  quantity?: number | null
): Promise<DispenseCheck> {
  return checkMaterialLotDispensable(await db(), lotId, quantity);
}

export async function requireMaterialLotDispensable(
  lotId: string,
  quantity?: number | null
): Promise<void> {
  return assertMaterialLotDispensable(await db(), lotId, quantity);
}
