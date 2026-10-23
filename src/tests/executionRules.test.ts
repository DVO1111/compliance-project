/**
 * The batch-execution screen's rules.
 *
 * These are the decisions the page makes about what to DRAW. The
 * decisions about what is ALLOWED are in the database and tested by
 * supabase/tests/batch_execution_authorisation_test.sql — the two are
 * deliberately separate, and where they disagree the database wins.
 *
 * The cases worth having here are the ones that fail silently: a null
 * role treated as permission, a null floor verdict treated as "nothing
 * wrong", a button hidden when something is outstanding rather than
 * disabled with the reason.
 */
import { describe, it, expect } from 'vitest';
import {
  mayExecute, viewerNotice, stageIsOpen, startOffered, entryOffered,
  completeOffered, completeEnabled, signStep, completeConfirmation,
  dispensingIncomplete, readingComplete,
} from '../lib/batch/executionRules';
import { assess, type FloorCondition } from '../lib/floor/floorConditions';
import type { StripStage, CompletionBlocker } from '../lib/batch/stageStrip';

const stage = (over: Partial<StripStage> = {}): StripStage => ({
  stageId: 's1',
  sequenceNo: 1,
  name: 'Mixing',
  status: 'pending',
  state: 'current',
  waitingFor: null,
  requiresVerifier: false,
  operatorId: null,
  verifierId: null,
  signedByOperator: false,
  signedByVerifier: false,
  readingsTotal: 1,
  readingsRecorded: 0,
  readingsOutOfSpec: 0,
  ...over,
});

const blocker = (key: string): CompletionBlocker => ({
  key, title: key, detail: 'detail', sortOrder: 1,
});

const condition = (over: Partial<FloorCondition> = {}): FloorCondition => ({
  key: 'c1',
  severity: 'blocked',
  title: 'The line is not cleared',
  detail: 'No verified line clearance for this batch.',
  continueWith: null,
  sortOrder: 1,
  ...over,
} as FloorCondition);

const clear = assess([]);

describe('mayExecute', () => {
  it('admits the production supervisor, who is PM-03\'s only Act on batch records', () => {
    expect(mayExecute('production_supervisor')).toBe(true);
  });

  it('refuses the storekeeper, who has Act on material lots and View here', () => {
    expect(mayExecute('storekeeper')).toBe(false);
  });

  //  The case the whole grid turns on. A QA Manager decides whether a
  //  batch is released; they do not run it.
  it('refuses the QA Manager', () => {
    expect(mayExecute('qa_manager')).toBe(false);
  });

  it('refuses the compliance admin, who is View everywhere', () => {
    expect(mayExecute('compliance_admin')).toBe(false);
  });

  //  FAILS CLOSED. A role that has not resolved is not a role with
  //  permission; the page may still be loading.
  it('refuses a null role rather than treating it as unrestricted', () => {
    expect(mayExecute(null)).toBe(false);
    expect(mayExecute(undefined)).toBe(false);
  });
});

describe('viewerNotice', () => {
  it('says who may act, so the reader knows who to fetch', () => {
    expect(viewerNotice('qa_manager')).toContain('production supervisor');
  });

  it('says the database enforces it, not the screen', () => {
    expect(viewerNotice('storekeeper')).toContain('database');
  });

  //  A role that has not loaded is a different sentence from a role
  //  that is not permitted. Telling somebody they lack permission while
  //  their profile is still arriving is a lie that gets reported as a bug.
  it('distinguishes a role that has not loaded from one without permission', () => {
    expect(viewerNotice(null)).toContain('not loaded');
    expect(viewerNotice(null)).not.toContain('reserved to');
  });
});

describe('stageIsOpen', () => {
  it('is true only for the current stage', () => {
    expect(stageIsOpen(stage({ state: 'current' }))).toBe(true);
    expect(stageIsOpen(stage({ state: 'locked' }))).toBe(false);
    expect(stageIsOpen(stage({ state: 'done' }))).toBe(false);
    expect(stageIsOpen(stage({ state: 'closed' }))).toBe(false);
    expect(stageIsOpen(null)).toBe(false);
  });
});

describe('startOffered', () => {
  it('offers the start to a supervisor on a pending current stage with a clear line', () => {
    expect(startOffered(stage(), clear, 'production_supervisor')).toBe(true);
  });

  it('does not offer it to a role with View', () => {
    expect(startOffered(stage(), clear, 'qa_manager')).toBe(false);
  });

  it('does not offer it on a locked stage', () => {
    expect(startOffered(stage({ state: 'locked' }), clear, 'production_supervisor')).toBe(false);
  });

  it('does not offer it on a stage already running', () => {
    expect(startOffered(stage({ status: 'in_progress' }), clear, 'production_supervisor')).toBe(false);
  });

  //  THE ONE THAT MATTERS. A verdict that has not been read is not a
  //  clear line, and the first render has no conditions yet.
  it('fails closed while the floor conditions have not been read', () => {
    expect(startOffered(stage(), null, 'production_supervisor')).toBe(false);
  });

  it('is stopped by a blocked condition', () => {
    const blocked = assess([condition()]);
    expect(startOffered(stage(), blocked, 'production_supervisor')).toBe(false);
  });

  //  Flagged is not blocked. "The work continues once somebody with the
  //  right authority says so" — the notice above the strip carries that,
  //  and hiding the button would make the authorisation unreachable.
  it('is not stopped by a flagged condition', () => {
    const flagged = assess([condition({
      severity: 'flagged', continueWith: 'A production supervisor can authorise it.',
    })]);
    expect(startOffered(stage(), flagged, 'production_supervisor')).toBe(true);
  });
});

describe('entryOffered', () => {
  it('offers reading entry and dispensing on a running stage', () => {
    expect(entryOffered(stage({ status: 'in_progress' }), 'production_supervisor')).toBe(true);
  });

  //  batch_stage_record_reading refuses a pending stage outright, so
  //  offering the field would walk into BATCH_STAGE_NOT_IN_PROGRESS.
  it('does not offer them before the stage has started', () => {
    expect(entryOffered(stage({ status: 'pending' }), 'production_supervisor')).toBe(false);
  });

  it('does not offer them to a role with View', () => {
    expect(entryOffered(stage({ status: 'in_progress' }), 'qc_analyst')).toBe(false);
  });
});

describe('completeOffered and completeEnabled', () => {
  //  The design's rule: "Complete and sign stays disabled with the
  //  reason given." Offered, and not enabled — not removed.
  it('still offers the button when something is outstanding', () => {
    const s = stage({ status: 'in_progress' });
    expect(completeOffered(s, 'production_supervisor')).toBe(true);
    expect(completeEnabled(s, [blocker('missing_readings')], 'production_supervisor')).toBe(false);
  });

  it('enables it once nothing is outstanding', () => {
    const s = stage({ status: 'in_progress' });
    expect(completeEnabled(s, [], 'production_supervisor')).toBe(true);
  });

  it('offers it on a stage awaiting its verifier', () => {
    expect(completeOffered(stage({ status: 'awaiting_verification' }), 'production_supervisor')).toBe(true);
  });

  it('does not offer it on a completed stage', () => {
    expect(completeOffered(stage({ status: 'complete' }), 'production_supervisor')).toBe(false);
  });

  it('never enables it for a role with View, blockers or not', () => {
    const s = stage({ status: 'in_progress' });
    expect(completeEnabled(s, [], 'storekeeper')).toBe(false);
  });
});

describe('signStep', () => {
  it('asks the operator for the first signature on a running stage', () => {
    expect(signStep(stage({ status: 'in_progress' }), 'u1')).toBe('operator');
  });

  it('asks for a verification once the stage is awaiting one', () => {
    expect(signStep(stage({ status: 'awaiting_verification', operatorId: 'u1' }), 'u2'))
      .toBe('verify');
  });

  //  The database refuses a verifier who is the operator. Drawing the
  //  control for the operator themselves would offer a refusal.
  it('does not ask the operator to verify their own stage', () => {
    expect(signStep(stage({ status: 'awaiting_verification', operatorId: 'u1' }), 'u1'))
      .toBe('none');
  });

  //  Unknown identity: offer it and let the database decide, rather
  //  than hiding a control on a guess. Hiding it would strand a stage
  //  whose operator id failed to load.
  it('offers verification when the viewer or the operator is unknown', () => {
    expect(signStep(stage({ status: 'awaiting_verification', operatorId: 'u1' }), null))
      .toBe('verify');
    expect(signStep(stage({ status: 'awaiting_verification', operatorId: null }), 'u1'))
      .toBe('verify');
  });

  it('asks for nothing on a pending or completed stage', () => {
    expect(signStep(stage({ status: 'pending' }), 'u1')).toBe('none');
    expect(signStep(stage({ status: 'complete' }), 'u1')).toBe('none');
    expect(signStep(null, 'u1')).toBe('none');
  });
});

describe('completeConfirmation', () => {
  it('warns that a stage needing a verifier is not finished when signed', () => {
    const s = completeConfirmation(stage({ requiresVerifier: true }));
    expect(s).toContain('second person');
    expect(s).toContain('not finished');
  });

  it('says so when no second signature is wanted', () => {
    expect(completeConfirmation(stage({ requiresVerifier: false })))
      .toContain('no second signature');
  });

  it('names the stage either way', () => {
    expect(completeConfirmation(stage({ sequenceNo: 3, name: 'Granulation' })))
      .toContain('3 · Granulation');
  });
});

describe('dispensingIncomplete', () => {
  it('is satisfied by a lot, a quantity and a balance', () => {
    expect(dispensingIncomplete({ lotId: 'l1', quantity: '24', instrumentId: 'b1' }))
      .toEqual([]);
  });

  it('names each missing thing rather than returning a bare false', () => {
    const missing = dispensingIncomplete({ lotId: null, quantity: '', instrumentId: null });
    expect(missing).toHaveLength(3);
    expect(missing.join(' ')).toContain('lot');
    expect(missing.join(' ')).toContain('quantity');
    expect(missing.join(' ')).toContain('balance');
  });

  //  Zero and negative are not quantities. The database refuses them
  //  with DISPENSE_BAD_QUANTITY; saying so before the round trip is
  //  faster and says the same thing.
  it('refuses zero and negative quantities', () => {
    expect(dispensingIncomplete({ lotId: 'l1', quantity: '0', instrumentId: 'b1' }))
      .toHaveLength(1);
    expect(dispensingIncomplete({ lotId: 'l1', quantity: '-5', instrumentId: 'b1' }))
      .toHaveLength(1);
  });

  it('refuses text in the quantity field', () => {
    expect(dispensingIncomplete({ lotId: 'l1', quantity: 'about 24', instrumentId: 'b1' }))
      .toHaveLength(1);
  });

  //  An out-of-tolerance quantity is NOT incomplete. It is a complete
  //  entry that needs an authorisation, which the database asks for by
  //  name — refusing it here would make the exception path unreachable.
  it('does not treat an out-of-tolerance quantity as incomplete', () => {
    expect(dispensingIncomplete({ lotId: 'l1', quantity: '9999', instrumentId: 'b1' }))
      .toEqual([]);
  });
});

describe('readingComplete', () => {
  it('accepts a number for a machine setting', () => {
    expect(readingComplete({ parameterType: 'machine_setting', value: '40', text: '' })).toBe(true);
  });

  it('accepts text for a product attribute', () => {
    expect(readingComplete({ parameterType: 'product_attribute', value: '', text: 'Complies' }))
      .toBe(true);
  });

  it('rejects an empty entry', () => {
    expect(readingComplete({ parameterType: 'machine_setting', value: '', text: '' })).toBe(false);
    expect(readingComplete({ parameterType: 'product_attribute', value: '', text: '  ' })).toBe(false);
  });

  it('rejects an unparseable number', () => {
    expect(readingComplete({ parameterType: 'machine_setting', value: 'fast', text: '' })).toBe(false);
  });

  //  OUT OF SPECIFICATION IS STILL COMPLETE. in_specification is
  //  computed by the database against the formula's limits, and a
  //  reading outside them is exactly the one that must be recorded.
  it('accepts a reading that will be out of specification', () => {
    expect(readingComplete({ parameterType: 'machine_setting', value: '900', text: '' })).toBe(true);
  });
});
