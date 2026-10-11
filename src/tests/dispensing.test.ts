/**
 * Dispensing: the gate's error handling, and the local judgements.
 *
 * The gate matters most. supabase-js RESOLVES with `{ data: null, error }`
 * rather than rejecting, so the natural implementation reads a network
 * failure as permission to dispense a quarantined lot into an uncleaned
 * line. Everything in the first describe block is there because that
 * mistake is one line of code away.
 *
 * After that, the judgements that have a plausible wrong answer:
 *   overage read as tolerance, which turns a 10% process allowance into a
 *   10% licence to miss;
 *   an undeclared tolerance read as "no limit" rather than "ask";
 *   units compared when one of them is unknown;
 *   an unknown viewer allowed to verify.
 *
 * The RPC wrappers are not tested. Their rules belong to the database,
 * where supabase/tests/dispensing_test.sql asserts them against a real
 * Postgres — including the concurrency clause, which needs two backends
 * and cannot be shown with a mock at all.
 */
import { describe, it, expect } from 'vitest';
import {
  checkDispensable,
  requiredQuantity,
  toleranceVerdict,
  needsAuthorisation,
  unitsAgree,
  canVerifyDispensing,
  outstandingLines,
  type DispenseGateClient,
  type FormulaLine,
  type DispensingRecord,
} from '../lib/pharma/dispensingModel';

function client(reply: { data?: unknown; error?: { message: string } | null } | Error): DispenseGateClient {
  return {
    rpc: async () => {
      if (reply instanceof Error) throw reply;
      return { data: reply.data ?? null, error: reply.error ?? null };
    },
  };
}

describe('checkDispensable', () => {
  it('allows when the database returns null', async () => {
    const r = await checkDispensable(client({ data: null }), 'b', 'l', 24);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.checkFailed).toBe(false);
  });

  it('passes through the database\'s sentence when blocked', async () => {
    const reason = 'Lot D9-0002 of Paracetamol powder is in quarantine and cannot be dispensed.';
    const r = await checkDispensable(client({ data: reason }), 'b', 'l', 24);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe(reason);
    expect(r.checkFailed).toBe(false);
  });

  it('does NOT allow when the query errors', async () => {
    const r = await checkDispensable(client({ error: { message: 'network unreachable' } }), 'b', 'l', 24);
    expect(r.allowed).toBe(false);
    expect(r.checkFailed).toBe(true);
  });

  it('does NOT allow when the client throws', async () => {
    const r = await checkDispensable(client(new Error('connection reset')), 'b', 'l', 24);
    expect(r.allowed).toBe(false);
    expect(r.checkFailed).toBe(true);
  });

  it('does NOT allow when permission is refused', async () => {
    const r = await checkDispensable(
      client({ error: { message: 'DISPENSE_FORBIDDEN: caller is not a member of the owning company' } }),
      'b', 'l', 24,
    );
    expect(r.allowed).toBe(false);
    expect(r.checkFailed).toBe(true);
  });

  it('does NOT allow with a missing batch or lot', async () => {
    expect((await checkDispensable(client({ data: null }), null, 'l')).allowed).toBe(false);
    expect((await checkDispensable(client({ data: null }), 'b', null)).allowed).toBe(false);
    expect((await checkDispensable(client({ data: null }), null, null)).allowed).toBe(false);
  });

  it('does NOT allow an answer whose shape it cannot read', async () => {
    //  checkFailed is asserted too, and that is the point of the case:
    //  falling through without the type guard also yields allowed:false,
    //  so a test that checked only `allowed` would pass with the guard
    //  removed.
    for (const data of [0, 1, false, true, {}, []] as unknown[]) {
      const r = await checkDispensable(client({ data }), 'b', 'l');
      expect(r.allowed, `data ${JSON.stringify(data)} must not allow`).toBe(false);
      expect(r.checkFailed, `data ${JSON.stringify(data)} must be flagged unreadable`).toBe(true);
    }
  });
});

// ── the judgements ───────────────────────────────────────────────────

const line = (o: Partial<FormulaLine> = {}): FormulaLine => ({
  id: 'fm1', material_id: 'm1', role: 'active',
  quantity_per_batch: 24, overage_pct: 0, tolerance_pct: 2, unit: 'kg',
  ...o,
});

describe('requiredQuantity', () => {
  it('is the nominal quantity when there is no overage', () => {
    expect(requiredQuantity(line())).toBe(24);
  });

  it('ADDS the overage, because overage moves the target', () => {
    //  A line with 10% overage asks for 110% of nominal, deliberately,
    //  for a known process loss. Reading overage as a tolerance instead
    //  would hand the operator a 10% licence to miss.
    expect(requiredQuantity(line({ overage_pct: 10 }))).toBeCloseTo(26.4, 10);
  });

  it('treats a missing overage as none', () => {
    expect(requiredQuantity({ quantity_per_batch: 24, overage_pct: undefined as any })).toBe(24);
  });
});

describe('toleranceVerdict', () => {
  it('is within for a quantity inside the declared band', () => {
    //  2% of 24 is 0.48
    expect(toleranceVerdict(line(), 24.4).state).toBe('within');
    expect(toleranceVerdict(line(), 23.6).state).toBe('within');
  });

  it('is within exactly at the limit', () => {
    //  The band is inclusive: 0.48 off is inside, which matches the
    //  database's `deviation > limit` test.
    expect(toleranceVerdict(line(), 24.48).state).toBe('within');
  });

  it('is outside past the limit, in either direction', () => {
    expect(toleranceVerdict(line(), 25).state).toBe('outside');
    expect(toleranceVerdict(line(), 23).state).toBe('outside');
  });

  it('measures the band against the OVERAGED target', () => {
    //  With 10% overage the target is 26.4 and the band is ±0.528, so
    //  24.0 — the nominal quantity — is well outside it.
    const l = line({ overage_pct: 10 });
    expect(toleranceVerdict(l, 24).state).toBe('outside');
    expect(toleranceVerdict(l, 26.4).state).toBe('within');
  });

  it('is undeclared, not within, when the formula declares no tolerance', () => {
    //  Fails closed. The alternative is to invent a tolerance.
    const v = toleranceVerdict(line({ tolerance_pct: null }), 23.9);
    expect(v.state).toBe('undeclared');
    expect(v.limit).toBeNull();
  });

  it('is exact when no tolerance is declared and the quantity matches', () => {
    expect(toleranceVerdict(line({ tolerance_pct: null }), 24).state).toBe('exact');
  });
});

describe('needsAuthorisation', () => {
  it('is true outside a declared tolerance', () => {
    expect(needsAuthorisation(toleranceVerdict(line(), 25))).toBe(true);
  });

  it('is true when no tolerance is declared and the quantity is not exact', () => {
    expect(needsAuthorisation(toleranceVerdict(line({ tolerance_pct: null }), 23.9))).toBe(true);
  });

  it('is false within a declared tolerance, and on an exact match', () => {
    expect(needsAuthorisation(toleranceVerdict(line(), 24.4))).toBe(false);
    expect(needsAuthorisation(toleranceVerdict(line({ tolerance_pct: null }), 24))).toBe(false);
  });
});

describe('unitsAgree', () => {
  it('matches the same unit regardless of case or padding', () => {
    expect(unitsAgree('kg', 'KG')).toBe(true);
    expect(unitsAgree(' kg ', 'kg')).toBe(true);
  });

  it('does not match kg against g', () => {
    //  The hundredfold error that every quantity check waves through.
    expect(unitsAgree('kg', 'g')).toBe(false);
  });

  it('does NOT treat an unknown unit as agreement', () => {
    //  A missing unit is a question, not a match.
    expect(unitsAgree(null, 'kg')).toBe(false);
    expect(unitsAgree('kg', null)).toBe(false);
    expect(unitsAgree(null, null)).toBe(false);
    expect(unitsAgree('', '')).toBe(false);
  });
});

describe('canVerifyDispensing', () => {
  const rec = (o: Partial<DispensingRecord> = {}) =>
    ({ dispensed_by: 'u1', verified_by: null, ...o }) as DispensingRecord;

  it('is true for a different person', () => {
    expect(canVerifyDispensing(rec(), 'u2')).toBe(true);
  });

  it('is FALSE for the dispenser', () => {
    expect(canVerifyDispensing(rec(), 'u1')).toBe(false);
  });

  it('is false when the viewer is unknown', () => {
    expect(canVerifyDispensing(rec(), null)).toBe(false);
    expect(canVerifyDispensing(rec(), undefined)).toBe(false);
    expect(canVerifyDispensing(rec(), '')).toBe(false);
  });

  it('is false once it has already been verified', () => {
    expect(canVerifyDispensing(rec({ verified_by: 'u2' }), 'u3')).toBe(false);
  });
});

describe('outstandingLines', () => {
  const api = line({ id: 'api', quantity_per_batch: 24 });
  const exc = line({ id: 'exc', quantity_per_batch: 50 });

  it('reports a line nobody has touched with its full requirement', () => {
    const out = outstandingLines([api, exc], []);
    expect(out.map(o => [o.line.id, o.outstanding])).toEqual([['api', 24], ['exc', 50]]);
  });

  it('sums several dispensings against one line', () => {
    const out = outstandingLines([api], [
      { formula_material_id: 'api', actual_quantity: 10 },
      { formula_material_id: 'api', actual_quantity: 9 },
    ]);
    expect(out[0].outstanding).toBe(5);
  });

  it('drops a line once it is satisfied', () => {
    const out = outstandingLines([api, exc], [{ formula_material_id: 'api', actual_quantity: 24 }]);
    expect(out.map(o => o.line.id)).toEqual(['exc']);
  });

  it('drops an over-dispensed line rather than reporting a negative', () => {
    //  Over-dispensing is possible with a supervisor authorisation, and
    //  an "outstanding: -6" would render as nonsense. The line is dropped
    //  by the positive filter; the Math.max clamp in the implementation
    //  is belt-and-braces behind it, and this assertion pins the
    //  behaviour callers actually see.
    const out = outstandingLines([api], [{ formula_material_id: 'api', actual_quantity: 30 }]);
    expect(out).toEqual([]);
  });

  it('ignores dispensings that name no formula line', () => {
    const out = outstandingLines([api], [{ formula_material_id: null, actual_quantity: 24 }]);
    expect(out[0].outstanding).toBe(24);
  });

  it('measures against the overaged target', () => {
    const out = outstandingLines([line({ id: 'api', quantity_per_batch: 24, overage_pct: 10 })], []);
    expect(out[0].required).toBeCloseTo(26.4, 10);
  });
});
