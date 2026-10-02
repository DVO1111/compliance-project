/**
 * Material dispensing gate — service-layer unit tests. (Week 3, item 04)
 *
 * Item 04's NOT DONE IF is explicit about why these exist:
 *
 *   "The dispensing block is written but never tested. Dispensing is not
 *    built until Week 5, so write a unit test against the service method
 *    rather than leaving it unverified."
 *
 * So these test the service method directly, with an injected client, and
 * dispensing itself does not have to exist yet.
 *
 * The database side — the block itself, the supplier gate, retest
 * reversion, cross-tenant refusal — is tested for real against Postgres
 * in supabase/tests/material_quarantine_gate_test.sql. Asserting those
 * against a mock would prove nothing about them.
 *
 * What a mock CAN prove, and what most of these cases are about, is how
 * the service behaves when the server's answer is missing, broken or
 * unexpected. That is the fail-closed behaviour, and it is not
 * observable from SQL.
 */

import { describe, it, expect } from 'vitest';
import {
  checkMaterialLotDispensable,
  assertMaterialLotDispensable,
  MaterialDispenseBlockedError,
  stripErrcode,
  BLOCK_REASON_RPC,
  ASSERT_DISPENSABLE_RPC,
  type DispenseGateClient,
} from '../lib/pharma/materialDispensingService';

const LOT = '00000000-0000-4000-c000-000000000001';

/** A client that returns a scripted answer per RPC and records the calls. */
function clientReturning(
  script: Record<string, { data?: unknown; error?: { message: string } | null }>
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client: DispenseGateClient = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      const r = script[fn] ?? { data: null, error: null };
      //  `'data' in r` rather than `r.data ?? null`: the nullish default
      //  turned a scripted `undefined` into `null`, which is the one
      //  value the gate reads as "dispensable". The harness was
      //  answering the question instead of the code under test.
      return {
        data: 'data' in r ? r.data : null,
        error: r.error ?? null,
      };
    },
  };
  return { client, calls };
}

function clientThrowing(message: string) {
  const client: DispenseGateClient = {
    async rpc() {
      throw new Error(message);
    },
  };
  return client;
}

describe('checkMaterialLotDispensable', () => {
  it('allows a lot the server reports no reason for', async () => {
    const { client, calls } = clientReturning({ [BLOCK_REASON_RPC]: { data: null } });
    const r = await checkMaterialLotDispensable(client, LOT, 10);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.indeterminate).toBe(false);
    //  The quantity has to reach the server, or the availability check
    //  in the function never runs.
    expect(calls[0].args).toEqual({ p_lot_id: LOT, p_quantity: 10 });
  });

  it('blocks, and surfaces the reason verbatim, when the server gives one', async () => {
    const reason =
      'Lot GP-0001 of Lactose monohydrate is in quarantine and cannot be dispensed. Only approved material may be dispensed.';
    const { client } = clientReturning({ [BLOCK_REASON_RPC]: { data: reason } });
    const r = await checkMaterialLotDispensable(client, LOT);
    expect(r.allowed).toBe(false);
    //  Surfaced unchanged: the server's sentence names the lot, the
    //  material and the cause, and rewording it here would lose that.
    expect(r.reason).toBe(reason);
    expect(r.indeterminate).toBe(false);
  });

  /* ── The fail-closed cases. These are the reason this file exists. ── */

  it('BLOCKS when the RPC returns an error rather than reading it as a pass', async () => {
    //  supabase-js resolves with { data: null, error } instead of
    //  rejecting. A `data === null` test alone would call this allowed —
    //  i.e. would let quarantined material out whenever the network
    //  wobbled.
    const { client } = clientReturning({
      [BLOCK_REASON_RPC]: { data: null, error: { message: 'permission denied' } },
    });
    const r = await checkMaterialLotDispensable(client, LOT, 5);
    expect(r.allowed).toBe(false);
    expect(r.indeterminate).toBe(true);
    expect(r.reason).toMatch(/could not be checked/i);
  });

  it('blocks when the client throws', async () => {
    const r = await checkMaterialLotDispensable(clientThrowing('offline'), LOT, 5);
    expect(r.allowed).toBe(false);
    expect(r.indeterminate).toBe(true);
  });

  it('blocks on an unexpected payload shape', async () => {
    //  Not a string and not exactly null. Could be a client upgrade, a
    //  proxy rewriting the body, anything — none of which is consent.
    for (const data of [undefined, 0, false, {}, [], '']) {
      const { client } = clientReturning({ [BLOCK_REASON_RPC]: { data } });
      const r = await checkMaterialLotDispensable(client, LOT);
      expect(r.allowed, `payload ${JSON.stringify(data)} must not be read as allowed`).toBe(false);
    }
  });

  it('blocks a missing lot id without a round trip', async () => {
    const { client, calls } = clientReturning({ [BLOCK_REASON_RPC]: { data: null } });
    for (const id of [null, undefined, '']) {
      const r = await checkMaterialLotDispensable(client, id as string | null);
      expect(r.allowed).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it('blocks a non-positive or non-finite quantity without a round trip', async () => {
    const { client, calls } = clientReturning({ [BLOCK_REASON_RPC]: { data: null } });
    for (const q of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await checkMaterialLotDispensable(client, LOT, q);
      expect(r.allowed, `quantity ${q} must be refused`).toBe(false);
      expect(r.indeterminate).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it('treats an omitted quantity as a state-only check, not as zero', async () => {
    const { client, calls } = clientReturning({ [BLOCK_REASON_RPC]: { data: null } });
    const r = await checkMaterialLotDispensable(client, LOT);
    expect(r.allowed).toBe(true);
    expect(calls[0].args.p_quantity).toBeNull();
  });
});

describe('assertMaterialLotDispensable', () => {
  it('resolves for a dispensable lot, and calls the server-side assert', async () => {
    const { client, calls } = clientReturning({
      [BLOCK_REASON_RPC]: { data: null },
      [ASSERT_DISPENSABLE_RPC]: { data: null },
    });
    await expect(assertMaterialLotDispensable(client, LOT, 10)).resolves.toBeUndefined();
    //  Both calls matter: the second is the one the database enforces, so
    //  a caller cannot proceed on the first answer alone.
    expect(calls.map(c => c.fn)).toEqual([BLOCK_REASON_RPC, ASSERT_DISPENSABLE_RPC]);
  });

  it('throws with the reason for a blocked lot', async () => {
    const reason = 'Lot GP-0007 of Lactose monohydrate is on hold and cannot be dispensed.';
    const { client, calls } = clientReturning({ [BLOCK_REASON_RPC]: { data: reason } });
    await expect(assertMaterialLotDispensable(client, LOT)).rejects.toThrow(reason);
    //  It must not go on to call the assert after already knowing.
    expect(calls.map(c => c.fn)).toEqual([BLOCK_REASON_RPC]);
  });

  it('throws when the check is indeterminate', async () => {
    const { client } = clientReturning({
      [BLOCK_REASON_RPC]: { error: { message: 'network' } },
    });
    await expect(assertMaterialLotDispensable(client, LOT)).rejects.toBeInstanceOf(
      MaterialDispenseBlockedError
    );
    try {
      await assertMaterialLotDispensable(client, LOT);
    } catch (e) {
      expect((e as MaterialDispenseBlockedError).indeterminate).toBe(true);
    }
  });

  it('lets the server win when the assert refuses after a clean read', async () => {
    //  The lot moved between the two calls, or the caller lacks rights.
    //  Either way the server's refusal is the answer.
    const { client } = clientReturning({
      [BLOCK_REASON_RPC]: { data: null },
      [ASSERT_DISPENSABLE_RPC]: {
        error: { message: 'MATERIAL_DISPENSE_BLOCKED: Lot GP-0009 is rejected and cannot be dispensed.' },
      },
    });
    await expect(assertMaterialLotDispensable(client, LOT, 1)).rejects.toThrow(
      /Lot GP-0009 is rejected/
    );
  });

  it('does not leak the Postgres sentinel into the message', async () => {
    const { client } = clientReturning({
      [BLOCK_REASON_RPC]: { data: null },
      [ASSERT_DISPENSABLE_RPC]: {
        error: { message: 'MATERIAL_FORBIDDEN: caller is not a member of the owning company' },
      },
    });
    await expect(assertMaterialLotDispensable(client, LOT)).rejects.toThrow(
      'caller is not a member of the owning company'
    );
  });
});

describe('stripErrcode', () => {
  it('removes either sentinel and leaves anything else alone', () => {
    expect(stripErrcode('MATERIAL_DISPENSE_BLOCKED: in quarantine')).toBe('in quarantine');
    expect(stripErrcode('MATERIAL_FORBIDDEN: not a member')).toBe('not a member');
    expect(stripErrcode('something else entirely')).toBe('something else entirely');
  });
});
