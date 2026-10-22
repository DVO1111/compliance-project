/**
 * What a trace MEANS, as opposed to what it contains.
 *
 * The rows a trace returns are per dispensing, so the same batch
 * appears once per weighing and the same lot once per batch. Counting
 * rows would overstate both, and on a recall the count is the thing
 * somebody reads first.
 *
 * The case that matters most is the released/held split: a released
 * batch may have left the site and everything else can be held where
 * it stands. Getting that wrong in the lenient direction means
 * telling somebody a batch is still in the building when it is not.
 */
import { describe, it, expect } from 'vitest';
import { traceSummary, tracedQuantity, type TraceLink } from '../lib/materials/traceService';

const link = (over: Partial<TraceLink> = {}): TraceLink => ({
  batchId: 'b1',
  batchNumber: 'BX-0001',
  batchStatus: 'qc_in_progress',
  productName: 'Tablet Three',
  lotId: 'l1',
  lotNumber: 'LOT-0001',
  supplierName: 'Lagos Chemicals',
  supplierLotNumber: 'SUP-77',
  quantity: 24,
  unit: 'kg',
  dispensedAt: '2026-10-01T09:00:00Z',
  ...over,
});

describe('traceSummary', () => {
  it('counts distinct batches, not dispensing rows', () => {
    //  Three weighings of one lot into one batch is one batch.
    const s = traceSummary([link(), link(), link()]);
    expect(s.batches).toBe(1);
    expect(s.lots).toBe(1);
  });

  it('counts distinct lots across batches', () => {
    const s = traceSummary([
      link({ batchId: 'b1', lotId: 'l1' }),
      link({ batchId: 'b1', lotId: 'l2' }),
      link({ batchId: 'b2', lotId: 'l1' }),
    ]);
    expect(s.batches).toBe(2);
    expect(s.lots).toBe(2);
  });

  //  THE SPLIT THAT DECIDES WHAT HAPPENS NEXT.
  it('separates released batches from the rest', () => {
    const s = traceSummary([
      link({ batchId: 'b1', batchNumber: 'BX-0001', batchStatus: 'released' }),
      link({ batchId: 'b2', batchNumber: 'BX-0002', batchStatus: 'qc_in_progress' }),
      link({ batchId: 'b3', batchNumber: 'BX-0003', batchStatus: 'hold' }),
    ]);
    expect(s.released).toEqual(['BX-0001']);
    expect(s.held).toEqual(['BX-0002', 'BX-0003']);
  });

  //  Only 'released' counts as gone. Anything else — rejected,
  //  archived, on hold, unknown — is treated as still here, which is
  //  the wrong guess in the safe direction only if it errs toward
  //  holding stock rather than toward declaring it distributed.
  it('treats an unknown status as not released', () => {
    const s = traceSummary([
      link({ batchId: 'b1', batchNumber: 'BX-0001', batchStatus: null }),
      link({ batchId: 'b2', batchNumber: 'BX-0002', batchStatus: 'something_new' }),
    ]);
    expect(s.released).toEqual([]);
    expect(s.held).toEqual(['BX-0001', 'BX-0002']);
  });

  it('falls back to the batch id when there is no number', () => {
    const s = traceSummary([
      link({ batchId: 'b-no-number', batchNumber: null, batchStatus: 'released' }),
    ]);
    expect(s.released).toEqual(['b-no-number']);
  });

  it('names each supplier once, for the upstream call', () => {
    const s = traceSummary([
      link({ lotId: 'l1', supplierName: 'Lagos Chemicals' }),
      link({ lotId: 'l2', supplierName: 'Lagos Chemicals' }),
      link({ lotId: 'l3', supplierName: 'Kano Excipients' }),
    ]);
    expect(s.suppliers).toEqual(['Kano Excipients', 'Lagos Chemicals']);
  });

  it('leaves out a supplier nobody recorded rather than inventing one', () => {
    const s = traceSummary([link({ supplierName: null })]);
    expect(s.suppliers).toEqual([]);
  });

  it('summarises an empty trace without claiming anything', () => {
    const s = traceSummary([]);
    expect(s).toEqual({ batches: 0, lots: 0, released: [], held: [], suppliers: [] });
  });
});

describe('tracedQuantity', () => {
  it('adds up the dispensed quantities', () => {
    expect(tracedQuantity([link({ quantity: 24 }), link({ quantity: 6 })]))
      .toEqual({ amount: 30, unit: 'kg' });
  });

  //  A PARTIAL TOTAL READS AS A COMPLETE ONE. Nothing on the number
  //  says which rows it left out, so there is no number.
  it('returns null when any quantity is missing', () => {
    expect(tracedQuantity([link({ quantity: 24 }), link({ quantity: null })])).toBeNull();
  });

  it('returns null when the units disagree', () => {
    expect(tracedQuantity([link({ unit: 'kg' }), link({ unit: 'g' })])).toBeNull();
  });

  it('returns null when a unit is missing', () => {
    expect(tracedQuantity([link({ unit: null })])).toBeNull();
  });

  it('returns null for an empty trace rather than zero', () => {
    //  Zero is a claim — "none of it was used" — and an empty trace
    //  does not support it.
    expect(tracedQuantity([])).toBeNull();
  });

  it('rejects a non-finite quantity', () => {
    expect(tracedQuantity([link({ quantity: Number.NaN })])).toBeNull();
  });
});
