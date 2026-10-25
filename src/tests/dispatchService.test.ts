/**
 * Dispatch — the write, and what happens when the database refuses it.
 *
 * `dispatchService` was the one connected write path in the release
 * chain with no test of its own. The audit classified it "connected,
 * insufficiently tested", and these are the tests that close that.
 *
 * Two things are worth proving. First that the row it sends matches
 * what the table expects, because a silently mis-shaped insert is how a
 * dispatch goes unrecorded. Second that a refusal keeps its CODE: the
 * guards on this table raise `DISPATCH_BEFORE_RELEASE`,
 * `DISPATCH_IN_THE_FUTURE` and a section-role refusal, and a caller
 * that flattens those into one message cannot tell the operator which
 * rule they hit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
const single = vi.fn();

vi.mock('../lib/supabase', () => {
  const chain = {
    insert: (...args: unknown[]) => { insert(...args); return chain; },
    select: () => chain,
    single: () => single(),
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
  };
  return { supabase: { from: vi.fn(() => chain), rpc: vi.fn() } };
});

import { recordDispatch } from '../lib/pharma/dispatchService';

const base = {
  companyId: 'co-1',
  batchId: 'b-1',
  destination: 'Lagos distribution warehouse',
  quantity: 120,
  unit: 'cases',
};

beforeEach(() => {
  insert.mockClear();
  single.mockReset();
});

describe('the row that reaches the table', () => {
  it('records a dispatch and returns its id', async () => {
    single.mockResolvedValue({ data: { id: 'd-1' }, error: null });

    const result = await recordDispatch({ ...base, userId: 'u-1' });

    expect(result).toEqual({ ok: true, id: 'd-1' });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 'co-1',
        batch_id: 'b-1',
        destination: 'Lagos distribution warehouse',
        quantity: 120,
        unit: 'cases',
        dispatched_by: 'u-1',
      }),
    );
  });

  //  Whitespace in a destination or a reference is how two rows for the
  //  same consignment end up looking different in a trace.
  it('trims the free-text fields', async () => {
    single.mockResolvedValue({ data: { id: 'd-2' }, error: null });

    await recordDispatch({
      ...base,
      destination: '  Ibadan plant  ',
      reference: '  WB-99  ',
      unit: ' cases ',
      notes: '  split consignment  ',
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: 'Ibadan plant',
        reference: 'WB-99',
        unit: 'cases',
        notes: 'split consignment',
      }),
    );
  });

  //  An empty reference must be null, not ''. A trace that filters on
  //  "has a reference" would otherwise count a blank one.
  it('sends null rather than an empty string for an absent reference', async () => {
    single.mockResolvedValue({ data: { id: 'd-3' }, error: null });

    await recordDispatch({ ...base, reference: '   ', notes: '' });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ reference: null, notes: null }),
    );
  });

  it('records no actor rather than a guessed one when none is given', async () => {
    single.mockResolvedValue({ data: { id: 'd-4' }, error: null });

    await recordDispatch(base);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ dispatched_by: null }),
    );
  });
});

describe('a refusal keeps the code that says which rule was hit', () => {
  //  THE ROLE REFUSAL. PM-03 gives `distribution` Act to the
  //  storekeeper; a QA Manager reading the register cannot add to it,
  //  and the database says so. The service must pass that through
  //  rather than reporting a generic failure.
  it('surfaces a section-role refusal with its code', async () => {
    single.mockResolvedValue({
      data: null,
      error: {
        message:
          'SECTION_FORBIDDEN: recording a dispatch is reserved to a role with Act on distribution',
      },
    });

    const result = await recordDispatch(base);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SECTION_FORBIDDEN');
    expect(result.message).toMatch(/Act on distribution/);
  });

  it('surfaces a dispatch recorded before its release', async () => {
    single.mockResolvedValue({
      data: null,
      error: { message: 'DISPATCH_BEFORE_RELEASE: the batch was released after this date' },
    });

    const result = await recordDispatch(base);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('DISPATCH_BEFORE_RELEASE');
  });

  it('surfaces a future-dated dispatch', async () => {
    single.mockResolvedValue({
      data: null,
      error: { message: 'DISPATCH_IN_THE_FUTURE: dispatched_at is ahead of now()' },
    });

    const result = await recordDispatch(base);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('DISPATCH_IN_THE_FUTURE');
  });

  //  An error with no code must not be mistaken for one. Inventing a
  //  code here would make a connection failure look like a guard.
  it('labels an uncoded failure as DISPATCH_ERROR without inventing a rule', async () => {
    single.mockResolvedValue({
      data: null,
      error: { message: 'network unreachable' },
    });

    const result = await recordDispatch(base);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('DISPATCH_ERROR');
    expect(result.message).toBe('network unreachable');
  });

  //  A refusal with no message at all still has to fail closed.
  it('fails closed when the database returns an error with no message', async () => {
    single.mockResolvedValue({ data: null, error: {} });

    const result = await recordDispatch(base);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/could not be recorded/);
  });

  //  A multi-line refusal keeps its detail — the DOTALL flag in the
  //  service's matcher exists for exactly this.
  it('keeps the detail of a multi-line refusal', async () => {
    single.mockResolvedValue({
      data: null,
      error: { message: 'DISPATCH_BEFORE_RELEASE: released 2026-10-02\ndispatched 2026-10-01' },
    });

    const result = await recordDispatch(base);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('dispatched 2026-10-01');
  });
});
