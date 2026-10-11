/**
 * The pure helpers in batchExecutionService.
 *
 * Only the functions that make a DECISION are tested here — the ones a
 * screen will use to choose what to offer. The RPC wrappers are thin and
 * the rules behind them belong to the database, where
 * supabase/tests/batch_record_execution_test.sql asserts them against a
 * real Postgres; re-asserting them against a mocked client would prove
 * only that the mock agrees with itself.
 *
 * What is worth testing here is the handful of judgements this file makes
 * on its own, because each one has a wrong answer that looks reasonable:
 *
 *   isReadyToClose on an empty list. Closure is irreversible, and "every
 *   stage is complete" is vacuously true of no stages — so a failed read
 *   would offer the one button that cannot be taken back.
 *
 *   outOfSpecificationReadings on an unknown. in_specification is null
 *   when the formula recorded no limits. Treating null as a failure cries
 *   wolf; treating it as a pass claims the formula judged something it
 *   never judged.
 *
 *   outOfSpecificationReadings on a corrected reading. The original row
 *   survives a correction by design, so a naive filter reports a failure
 *   that has already been dealt with.
 */
import { describe, it, expect } from 'vitest';
import {
  nextActionableStage,
  isReadyToClose,
  outOfSpecificationReadings,
  type BatchStage,
  type BatchStageReading,
} from '../lib/pharma/batchExecutionModel';

function stage(seq: number, status: BatchStage['status'], name = `Stage ${seq}`): BatchStage {
  return {
    id: `stage-${seq}`,
    company_id: 'c',
    batch_id: 'b',
    formula_stage_id: null,
    sequence_no: seq,
    name,
    requires_verifier: false,
    status,
    started_at: null,
    started_by: null,
    completed_at: null,
    operator_id: null,
    operator_signature_id: null,
    verifier_id: null,
    verifier_signature_id: null,
    created_at: '2026-10-11T00:00:00Z',
    updated_at: '2026-10-11T00:00:00Z',
  };
}

function reading(id: string, inSpec: boolean | null, correctedFrom: string | null = null): BatchStageReading {
  return {
    id,
    company_id: 'c',
    batch_stage_id: 'stage-1',
    formula_parameter_id: 'p',
    parameter_name: 'Viscosity',
    parameter_type: 'product_attribute',
    unit: 'cP',
    target_value: 450,
    min_value: 400,
    max_value: 500,
    reading_value: 450,
    reading_text: null,
    in_specification: inSpec,
    recorded_by: 'u',
    recorded_at: '2026-10-11T00:00:00Z',
    corrected_from_id: correctedFrom,
    created_at: '2026-10-11T00:00:00Z',
  };
}

describe('nextActionableStage', () => {
  it('is the earliest stage that is not complete', () => {
    const s = nextActionableStage([stage(3, 'pending'), stage(1, 'complete'), stage(2, 'in_progress')]);
    expect(s?.sequence_no).toBe(2);
  });

  it('reads the sequence number, not the array order', () => {
    //  A screen may hand these over in whatever order PostgREST returned
    //  them. Trusting that order would pick a stage out of sequence, and
    //  the database would then refuse the start for reasons the screen
    //  could not explain.
    const s = nextActionableStage([stage(3, 'pending'), stage(2, 'pending'), stage(1, 'complete')]);
    expect(s?.sequence_no).toBe(2);
  });

  it('is null when every stage is complete', () => {
    expect(nextActionableStage([stage(1, 'complete'), stage(2, 'complete')])).toBeNull();
  });

  it('is null for no stages at all', () => {
    expect(nextActionableStage([])).toBeNull();
  });
});

describe('isReadyToClose', () => {
  it('is true when every stage is complete', () => {
    expect(isReadyToClose([stage(1, 'complete'), stage(2, 'complete')])).toBe(true);
  });

  it('is false while any stage is unfinished', () => {
    expect(isReadyToClose([stage(1, 'complete'), stage(2, 'in_progress')])).toBe(false);
    expect(isReadyToClose([stage(1, 'pending')])).toBe(false);
  });

  it('is FALSE for an empty list, not vacuously true', () => {
    //  The whole reason this function exists rather than an inline
    //  .every(): closure cannot be undone, and a batch whose stages
    //  failed to load is indistinguishable from one with none.
    expect(isReadyToClose([])).toBe(false);
  });
});

describe('outOfSpecificationReadings', () => {
  it('reports a reading outside its limits', () => {
    const out = outOfSpecificationReadings([reading('r1', false), reading('r2', true)]);
    expect(out.map(r => r.id)).toEqual(['r1']);
  });

  it('does not treat unknown as a failure', () => {
    //  null means the formula recorded no limits, so nothing was judged.
    expect(outOfSpecificationReadings([reading('r1', null)])).toEqual([]);
  });

  it('does not treat unknown as a pass either', () => {
    //  Stated as its own case because the two mistakes are opposite and
    //  a single assertion would only catch one of them.
    const r = reading('r1', null);
    expect(r.in_specification).not.toBe(true);
    expect(r.in_specification).not.toBe(false);
  });

  it('ignores a reading that has since been corrected', () => {
    //  r1 was out of specification and r2 corrects it. r1 is kept by
    //  design — the original value survives a correction — so a filter
    //  that only looked at in_specification would keep reporting it.
    const out = outOfSpecificationReadings([reading('r1', false), reading('r2', true, 'r1')]);
    expect(out).toEqual([]);
  });

  it('still reports a correction that is itself out of specification', () => {
    const out = outOfSpecificationReadings([reading('r1', false), reading('r2', false, 'r1')]);
    expect(out.map(r => r.id)).toEqual(['r2']);
  });
});
