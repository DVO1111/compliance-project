/**
 * Which finished QC results still stand.
 *
 * A finished QC verdict feeds the release gate, so it cannot be
 * edited — 20261112000000 refuses that, after a sweep found nothing
 * stopping a recorded `pass = false` being UPDATEd to true, which
 * would release a batch and leave no trace of the failure.
 *
 * A correction is a new row pointing at the old one. This decides
 * which rows the gate's view of the batch is built from, and the
 * cases that matter are the ones where getting it wrong RELEASES
 * something: treating a superseded failure as still standing only
 * holds a batch, while treating a standing failure as superseded lets
 * it out.
 */
import { describe, it, expect } from 'vitest';
import { standingResults, type BatchQcResult } from '../lib/pharma/batchReleaseService';

const r = (over: Partial<BatchQcResult> & { id: string }): BatchQcResult => ({
  batch_id: 'b1',
  test_name: 'Assay',
  test_method: 'HPLC',
  specification: '98-102 %',
  result: '99.4 %',
  pass: true,
  tested_by: 'u1',
  tested_at: '2026-10-01T09:00:00Z',
  corrected_from_id: null,
  correction_reason: null,
  ...over,
});

describe('standingResults', () => {
  it('keeps a result nothing has corrected', () => {
    expect(standingResults([r({ id: 'a' })]).map((x) => x.id)).toEqual(['a']);
  });

  //  THE CASE THE RELEASE GATE TURNS ON.
  it('drops a failure that has been corrected, and keeps the correction', () => {
    const rows = [
      r({ id: 'fail', pass: false, result: '88.1 %' }),
      r({ id: 'corr', corrected_from_id: 'fail', correction_reason: 'wrong column' }),
    ];
    expect(standingResults(rows).map((x) => x.id)).toEqual(['corr']);
  });

  //  The one that must not go the other way: an uncorrected failure
  //  beside a corrected one still stands.
  it('keeps an uncorrected failure beside a corrected one', () => {
    const rows = [
      r({ id: 'fail1', pass: false }),
      r({ id: 'corr1', corrected_from_id: 'fail1', correction_reason: 'x' }),
      r({ id: 'fail2', test_name: 'Dissolution', pass: false }),
    ];
    expect(standingResults(rows).map((x) => x.id).sort()).toEqual(['corr1', 'fail2']);
  });

  it('follows a chain of corrections to the one that stands', () => {
    const rows = [
      r({ id: 'one', pass: false }),
      r({ id: 'two', corrected_from_id: 'one', correction_reason: 'x', pass: false }),
      r({ id: 'three', corrected_from_id: 'two', correction_reason: 'y' }),
    ];
    expect(standingResults(rows).map((x) => x.id)).toEqual(['three']);
  });

  //  A correction pointing at a row this list does not contain — a
  //  filtered or paged read — must not make the correction vanish too.
  it('keeps a correction whose target is not in the list', () => {
    const rows = [r({ id: 'corr', corrected_from_id: 'elsewhere', correction_reason: 'x' })];
    expect(standingResults(rows).map((x) => x.id)).toEqual(['corr']);
  });

  it('returns nothing for an empty list without inventing a verdict', () => {
    expect(standingResults([])).toEqual([]);
  });
});
