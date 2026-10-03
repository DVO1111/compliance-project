/**
 * Command centre panels — a failed read must not look like an empty one.
 *
 * supabase-js RESOLVES a failed query with `{ data: null, error }` rather
 * than rejecting. Every one of the four view-backed panels used to read
 * `const { data } = await ...` and return `[]` or zeros, so a view that
 * did not exist, or that RLS refused, rendered as an empty radar, a flat
 * line, or a 0% policy-compliance ring. On a compliance dashboard that is
 * worse than an error: 0% acknowledged and "could not read the figure"
 * are very different facts and both appeared as the former.
 *
 * Three of the four views do not exist on any deployment today, so this
 * is not a hypothetical path — it is the current one.
 *
 * What these tests cover is exactly what a mock can prove: how the
 * service behaves when the server's answer is an error, an empty set, or
 * a shape it did not expect. Whether the views themselves leak across
 * tenants, and whether the counts are right, is tested against real
 * Postgres in supabase/tests/view_security_invoker_test.sql — asserting
 * that here against a mock would prove nothing about it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A chainable stand-in for the PostgREST builder. Every filter returns
 * `this`, and the chain resolves to whatever `next` is set to — so a test
 * can script the server's answer, including the resolved-with-error shape
 * that is the whole point of this file.
 */
let next: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('../lib/supabase', () => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    filter: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(next)),
    //  Awaiting the builder is what actually performs the request.
    then: (resolve: any, reject: any) => Promise.resolve(next).then(resolve, reject),
  };
  return {
    supabase: {
      from: vi.fn(() => chain),
      rpc: vi.fn(() => Promise.resolve(next)),
    },
  };
});

import {
  getVendorPulse,
  getPolicyCompliance,
  getAutomationHealth,
  getAuditVelocity,
  PanelUnavailableError,
} from '../lib/governance/commandCenterService';

const COMPANY = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  next = { data: null, error: null };
});

describe('a failed read is reported, not swallowed', () => {
  //  The error shape PostgREST returns for a view that does not exist.
  //  This is literally what v_automation_health_summary returns today.
  const MISSING_RELATION = {
    message: 'relation "public.v_automation_health_summary" does not exist',
    code: '42P01',
  };

  const PERMISSION_DENIED = {
    message: 'permission denied for view v_policy_compliance_stats',
    code: '42501',
  };

  it('getAutomationHealth throws on a missing relation', async () => {
    next = { data: null, error: MISSING_RELATION };
    await expect(getAutomationHealth(COMPANY)).rejects.toBeInstanceOf(PanelUnavailableError);
  });

  it('the thrown error names the relation, so a caller need not parse the message', async () => {
    next = { data: null, error: MISSING_RELATION };
    await expect(getAutomationHealth(COMPANY)).rejects.toMatchObject({
      relation: 'v_automation_health_summary',
    });
  });

  it('getPolicyCompliance throws on permission denied rather than reporting 0%', async () => {
    next = { data: null, error: PERMISSION_DENIED };
    //  The regression this guards: a rejected read used to become
    //  { acknowledged: 0, total: 0, rate: 0 } and draw a 0% ring.
    await expect(getPolicyCompliance(COMPANY)).rejects.toBeInstanceOf(PanelUnavailableError);
  });

  it('getVendorPulse throws rather than returning an empty radar', async () => {
    next = { data: null, error: MISSING_RELATION };
    await expect(getVendorPulse(COMPANY)).rejects.toBeInstanceOf(PanelUnavailableError);
  });

  it('getAuditVelocity throws rather than returning an empty chart', async () => {
    next = { data: null, error: MISSING_RELATION };
    await expect(getAuditVelocity(COMPANY)).rejects.toBeInstanceOf(PanelUnavailableError);
  });

  it('the message carries the server detail, so the panel can show why', async () => {
    next = { data: null, error: PERMISSION_DENIED };
    await expect(getPolicyCompliance(COMPANY)).rejects.toThrow(/permission denied/);
  });
});

describe('a genuinely empty result is still empty, not an error', () => {
  //  The other half of the contract. A control that reports failure for a
  //  company with no vendors would be as wrong as one that reports zero
  //  for a broken view.
  it('getVendorPulse returns [] for a company with no vendors', async () => {
    next = { data: [], error: null };
    await expect(getVendorPulse(COMPANY)).resolves.toEqual([]);
  });

  it('getAutomationHealth returns [] for no runs', async () => {
    next = { data: [], error: null };
    await expect(getAutomationHealth(COMPANY)).resolves.toEqual([]);
  });

  it('getAuditVelocity returns [] for no sessions', async () => {
    next = { data: [], error: null };
    await expect(getAuditVelocity(COMPANY)).resolves.toEqual([]);
  });

  it('getPolicyCompliance returns zeros for a company with no active policies', async () => {
    next = { data: [], error: null };
    await expect(getPolicyCompliance(COMPANY)).resolves.toEqual({
      acknowledged: 0,
      total: 0,
      rate: 0,
    });
  });
});

describe('getPolicyCompliance arithmetic', () => {
  it('computes the rate across policies', async () => {
    //  Two active policies, a headcount of 4 repeated per policy, three
    //  acknowledgements on one and one on the other: 4 of 8 -> 50%.
    next = {
      data: [
        { acknowledged_users: 3, total_users: 4, compliance_rate: 75 },
        { acknowledged_users: 1, total_users: 4, compliance_rate: 25 },
      ],
      error: null,
    };
    await expect(getPolicyCompliance(COMPANY)).resolves.toEqual({
      acknowledged: 4,
      total: 8,
      rate: 50,
    });
  });

  it('does not divide by zero when the headcount is zero', async () => {
    next = {
      data: [{ acknowledged_users: 0, total_users: 0, compliance_rate: 0 }],
      error: null,
    };
    const r = await getPolicyCompliance(COMPANY);
    expect(r.rate).toBe(0);
    expect(Number.isNaN(r.rate)).toBe(false);
  });

  it('adds numerically when the driver hands back bigint as a string', async () => {
    //  The counts are bigint in Postgres. A driver that serialises them as
    //  strings would, without the explicit Number(), make "3" + "1" = "31"
    //  and a rate of 3100%. This is the assertion that fails if the casts
    //  are removed.
    next = {
      data: [
        { acknowledged_users: '3', total_users: '4', compliance_rate: '75' },
        { acknowledged_users: '1', total_users: '4', compliance_rate: '25' },
      ],
      error: null,
    };
    await expect(getPolicyCompliance(COMPANY)).resolves.toEqual({
      acknowledged: 4,
      total: 8,
      rate: 50,
    });
  });

  it('treats a null count as zero rather than as NaN', async () => {
    next = {
      data: [{ acknowledged_users: null, total_users: 4, compliance_rate: 0 }],
      error: null,
    };
    const r = await getPolicyCompliance(COMPANY);
    expect(r).toEqual({ acknowledged: 0, total: 4, rate: 0 });
  });
});
