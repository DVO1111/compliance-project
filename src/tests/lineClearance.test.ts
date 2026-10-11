/**
 * Line clearance: the gate's error handling, and the local judgements.
 *
 * TWO THINGS ARE TESTED HERE AND NOTHING ELSE
 * ------------------------------------------
 * 1. checkLineCleared never reports "cleared" when it could not get an
 *    answer. supabase-js RESOLVES with `{ data: null, error }` rather than
 *    rejecting, so the natural implementation reads a network failure as
 *    permission to dispense into an uncleaned line. Every row below that
 *    looks paranoid is there because the mistake is one line of code away.
 *
 * 2. The helpers in lineClearanceModel, each of which has a wrong answer
 *    that looks reasonable — an empty checklist "complete", an unanswered
 *    item treated as benign, an unknown viewer allowed to verify.
 *
 * The RPC wrappers are not tested: the rules behind them belong to the
 * database, where supabase/tests/line_clearance_test.sql asserts them
 * against a real Postgres. Re-asserting them against a mock would prove
 * only that the mock agrees with itself.
 */
import { describe, it, expect } from 'vitest';
import {
  checkLineCleared,
  type ClearanceGateClient,
  outstandingItems,
  isChecklistComplete,
  canPerform,
  canVerify,
  latestFailure,
  canOverride,
  type ClearanceCheck,
  type ChangeoverVerification,
  type ClearanceOverride,
  type LineClearance,
} from '../lib/pharma/lineClearanceModel';

// ── the gate ─────────────────────────────────────────────────────────

function client(reply: { data?: unknown; error?: { message: string } | null } | Error): ClearanceGateClient {
  return {
    rpc: async () => {
      if (reply instanceof Error) throw reply;
      return { data: reply.data ?? null, error: reply.error ?? null };
    },
  };
}

describe('checkLineCleared', () => {
  it('reports cleared when the database returns null', async () => {
    const r = await checkLineCleared(client({ data: null }), 'batch-1');
    expect(r.cleared).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.checkFailed).toBe(false);
  });

  it('reports the database\'s sentence when the line is blocked', async () => {
    const reason = 'Line LINE-A has no clearance record for batch LC-0001.';
    const r = await checkLineCleared(client({ data: reason }), 'batch-1');
    expect(r.cleared).toBe(false);
    expect(r.reason).toBe(reason);
    //  A legitimate block is NOT a failed check. Callers distinguish
    //  "you may not" from "we could not tell".
    expect(r.checkFailed).toBe(false);
  });

  it('is NOT cleared when the query errors', async () => {
    const r = await checkLineCleared(client({ error: { message: 'network unreachable' } }), 'batch-1');
    expect(r.cleared).toBe(false);
    expect(r.checkFailed).toBe(true);
  });

  it('is NOT cleared when the client throws', async () => {
    const r = await checkLineCleared(client(new Error('connection reset')), 'batch-1');
    expect(r.cleared).toBe(false);
    expect(r.checkFailed).toBe(true);
  });

  it('is NOT cleared when permission is refused', async () => {
    //  The database raises LINE_CLEARANCE_FORBIDDEN for another tenant's
    //  batch rather than returning null. That arrives as an error, and an
    //  error is not permission.
    const r = await checkLineCleared(
      client({ error: { message: 'LINE_CLEARANCE_FORBIDDEN: caller is not a member of the owning company' } }),
      'batch-1',
    );
    expect(r.cleared).toBe(false);
    expect(r.checkFailed).toBe(true);
  });

  it('is NOT cleared with no batch id', async () => {
    const r = await checkLineCleared(client({ data: null }), null);
    expect(r.cleared).toBe(false);
    expect(r.checkFailed).toBe(true);
  });

  it('is NOT cleared when the answer is a shape it does not understand', async () => {
    //  A number, an object, a boolean — none of those are an answer, and
    //  an answer this code cannot read is not permission.
    //
    //  checkFailed is asserted as well as cleared, and that is the point
    //  of this case rather than an extra. Falling through without the
    //  type guard ALSO yields cleared: false, so a test that only checked
    //  `cleared` would pass with the guard removed — mutation testing
    //  showed exactly that. What the guard actually buys is a readable
    //  reason and the "we could not tell" flag, so those are what is
    //  pinned here.
    for (const data of [0, 1, false, true, {}, []] as unknown[]) {
      const r = await checkLineCleared(client({ data }), 'batch-1');
      expect(r.cleared, `data ${JSON.stringify(data)} must not read as cleared`).toBe(false);
      expect(r.checkFailed, `data ${JSON.stringify(data)} must be reported as an unreadable answer`).toBe(true);
      expect(typeof r.reason, `data ${JSON.stringify(data)} must yield a readable reason`).toBe('string');
    }
  });

  it('does not treat an empty string as cleared', async () => {
    //  An empty reason is a bug somewhere, not an all-clear.
    const r = await checkLineCleared(client({ data: '' }), 'batch-1');
    expect(r.cleared).toBe(false);
  });
});

// ── the local judgements ─────────────────────────────────────────────

function check(
  code: string,
  result: ClearanceCheck['result'],
  opts: { required?: boolean; sort?: number } = {},
): ClearanceCheck {
  return {
    id: `c-${code}`,
    company_id: 'c',
    clearance_id: 'cl',
    item_code: code,
    label: code,
    requires_record_reference: false,
    is_required: opts.required ?? true,
    sort_order: opts.sort ?? 10,
    result,
    record_reference: null,
    note: null,
    answered_by: null,
    answered_at: null,
    created_at: '2026-10-11T00:00:00Z',
  };
}

function verification(id: string, result: 'pass' | 'fail', at = '2026-10-11T10:00:00Z'): ChangeoverVerification {
  return {
    id, company_id: 'c', clearance_id: 'cl',
    method: 'swab', result, detail: null,
    measured_value: null, limit_value: null, unit: null,
    performed_by: 'u1', performed_at: at, created_at: at,
  };
}

const clearance = (s: Partial<LineClearance>): LineClearance => ({
  id: 'cl', company_id: 'c', line_id: 'l', batch_id: 'b',
  previous_batch_id: null, previous_product_name: null,
  status: 'in_progress',
  performed_by: null, performed_at: null, performed_signature_id: null,
  verified_by: null, verified_at: null, verified_signature_id: null,
  notes: null, created_by: null,
  created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z',
  ...s,
});

describe('outstandingItems', () => {
  it('counts an unanswered required item', () => {
    expect(outstandingItems([check('a', null)]).map(i => i.item_code)).toEqual(['a']);
  });

  it('counts a failed required item', () => {
    expect(outstandingItems([check('a', 'fail')]).map(i => i.item_code)).toEqual(['a']);
  });

  it('does not count a pass or a reasoned not-applicable', () => {
    expect(outstandingItems([check('a', 'pass'), check('b', 'not_applicable')])).toEqual([]);
  });

  it('ignores optional items', () => {
    expect(outstandingItems([check('a', null, { required: false })])).toEqual([]);
  });

  it('returns them in checklist order, not array order', () => {
    const out = outstandingItems([check('c', null, { sort: 30 }), check('a', null, { sort: 10 })]);
    expect(out.map(i => i.item_code)).toEqual(['a', 'c']);
  });
});

describe('isChecklistComplete', () => {
  it('is true when every required item is answered pass or not-applicable', () => {
    expect(isChecklistComplete([check('a', 'pass'), check('b', 'not_applicable')])).toBe(true);
  });

  it('is false while anything required is unanswered', () => {
    expect(isChecklistComplete([check('a', 'pass'), check('b', null)])).toBe(false);
  });

  it('is FALSE for an empty list, not vacuously true', () => {
    //  A clearance whose items failed to load is indistinguishable from
    //  one with none, and "all zero items pass" would offer a signature
    //  on a checklist nobody saw.
    expect(isChecklistComplete([])).toBe(false);
  });
});

describe('canPerform', () => {
  const done = [check('a', 'pass')];

  it('needs the checklist complete and a PASSING changeover result', () => {
    expect(canPerform(clearance({}), done, [verification('v1', 'pass')])).toBe(true);
  });

  it('is false with no changeover result at all', () => {
    expect(canPerform(clearance({}), done, [])).toBe(false);
  });

  it('is false when the only changeover result failed', () => {
    //  A failing result does not satisfy "a result is required" — it
    //  blocks the line.
    expect(canPerform(clearance({}), done, [verification('v1', 'fail')])).toBe(false);
  });

  it('is false while the checklist is incomplete', () => {
    expect(canPerform(clearance({}), [check('a', null)], [verification('v1', 'pass')])).toBe(false);
  });

  it('is false unless the clearance is still in progress', () => {
    for (const status of ['performed', 'verified', 'failed', 'cancelled'] as const) {
      expect(canPerform(clearance({ status }), done, [verification('v1', 'pass')])).toBe(false);
    }
  });
});

describe('canVerify', () => {
  it('is true for a different person once the clearance is performed', () => {
    expect(canVerify(clearance({ status: 'performed', performed_by: 'u1' }), 'u2')).toBe(true);
  });

  it('is FALSE for the person who performed it', () => {
    //  The brief's clause, in one assertion: "One user can both perform
    //  and verify."
    expect(canVerify(clearance({ status: 'performed', performed_by: 'u1' }), 'u1')).toBe(false);
  });

  it('is false when the viewer is unknown', () => {
    //  Not knowing who is looking is not permission.
    expect(canVerify(clearance({ status: 'performed', performed_by: 'u1' }), null)).toBe(false);
    expect(canVerify(clearance({ status: 'performed', performed_by: 'u1' }), undefined)).toBe(false);
    expect(canVerify(clearance({ status: 'performed', performed_by: 'u1' }), '')).toBe(false);
  });

  it('is false unless the clearance is awaiting verification', () => {
    for (const status of ['in_progress', 'verified', 'failed', 'cancelled'] as const) {
      expect(canVerify(clearance({ status, performed_by: 'u1' }), 'u2')).toBe(false);
    }
  });
});

describe('latestFailure', () => {
  it('is the most recent failing result', () => {
    const vs = [
      verification('old', 'fail', '2026-10-11T08:00:00Z'),
      verification('new', 'fail', '2026-10-11T12:00:00Z'),
      verification('pass', 'pass', '2026-10-11T13:00:00Z'),
    ];
    expect(latestFailure(vs)?.id).toBe('new');
  });

  it('reads the timestamp, not the array order', () => {
    const vs = [
      verification('old', 'fail', '2026-10-11T08:00:00Z'),
      verification('new', 'fail', '2026-10-11T12:00:00Z'),
    ].reverse();
    expect(latestFailure(vs)?.id).toBe('new');
  });

  it('is null when nothing failed', () => {
    expect(latestFailure([verification('v1', 'pass')])).toBeNull();
  });
});

describe('canOverride', () => {
  const failed = clearance({ status: 'failed' });
  const override = (vid: string): ClearanceOverride => ({
    id: 'o', company_id: 'c', clearance_id: 'cl', verification_id: vid,
    authorised_by: 'u1', reason: 'why', signature_id: 's',
    decided_at: '2026-10-11T00:00:00Z',
  });

  it('is true for an unanswered changeover failure', () => {
    expect(canOverride(failed, [verification('v1', 'fail')], [])).toBe(true);
  });

  it('is false once that failure has a decision on file', () => {
    expect(canOverride(failed, [verification('v1', 'fail')], [override('v1')])).toBe(false);
  });

  it('is TRUE again for a later, different failure', () => {
    //  A decision authorises one failure. This is the case the database
    //  guard enforces and the one most likely to be got wrong.
    const vs = [
      verification('v1', 'fail', '2026-10-11T08:00:00Z'),
      verification('v2', 'fail', '2026-10-11T12:00:00Z'),
    ];
    expect(canOverride(failed, vs, [override('v1')])).toBe(true);
  });

  it('is false when the clearance failed on its checklist instead', () => {
    //  Nothing for a decision to authorise; the way forward is a restart.
    expect(canOverride(failed, [], [])).toBe(false);
    expect(canOverride(failed, [verification('v1', 'pass')], [])).toBe(false);
  });

  it('is false unless the clearance is failed', () => {
    for (const status of ['in_progress', 'performed', 'verified', 'cancelled'] as const) {
      expect(canOverride(clearance({ status }), [verification('v1', 'fail')], [])).toBe(false);
    }
  });
});
