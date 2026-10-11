/**
 * Instruments: the lockout read, and the calibration-state derivation.
 *
 * The derivation is the interesting part, because its wrong answers are
 * both plausible and harmful in opposite directions:
 *
 *   `due <= today` reads as expired   — shuts a line down a day early,
 *                                       every time, which is how a
 *                                       control gets switched off rather
 *                                       than fixed;
 *   `never calibrated` reads as fine  — weighs a batch on a balance
 *                                       nobody has ever checked.
 *
 * And it must agree with instrument_block_reason() in SQL, because a
 * screen that says "expired" over a sign-off the database allows (or the
 * reverse) is literally one of item 10's NOT DONE IF clauses. The SQL
 * side is asserted in supabase/tests/instrument_calibration_test.sql,
 * section D, including the same boundary.
 */
import { describe, it, expect } from 'vitest';
import {
  checkInstrumentUsable,
  calibrationState,
  daysUntilDue,
  isSelectable,
  type InstrumentGateClient,
  type Instrument,
} from '../lib/pharma/instrumentModel';

function client(reply: { data?: unknown; error?: { message: string } | null } | Error): InstrumentGateClient {
  return {
    rpc: async () => {
      if (reply instanceof Error) throw reply;
      return { data: reply.data ?? null, error: reply.error ?? null };
    },
  };
}

describe('checkInstrumentUsable', () => {
  it('is usable when the database returns null', async () => {
    const r = await checkInstrumentUsable(client({ data: null }), 'i1');
    expect(r.usable).toBe(true);
    expect(r.checkFailed).toBe(false);
  });

  it('passes through the database\'s sentence when blocked', async () => {
    const reason = 'Dispensing balance 01 (BAL-01) went out of calibration on 10 Oct 2026.';
    const r = await checkInstrumentUsable(client({ data: reason }), 'i1');
    expect(r.usable).toBe(false);
    expect(r.reason).toBe(reason);
    expect(r.checkFailed).toBe(false);
  });

  it('is NOT usable when the query errors', async () => {
    const r = await checkInstrumentUsable(client({ error: { message: 'network unreachable' } }), 'i1');
    expect(r.usable).toBe(false);
    expect(r.checkFailed).toBe(true);
  });

  it('is NOT usable when the client throws', async () => {
    const r = await checkInstrumentUsable(client(new Error('connection reset')), 'i1');
    expect(r.usable).toBe(false);
    expect(r.checkFailed).toBe(true);
  });

  it('is NOT usable when permission is refused', async () => {
    const r = await checkInstrumentUsable(
      client({ error: { message: 'INSTRUMENT_FORBIDDEN: caller is not a member of the owning company' } }),
      'i1',
    );
    expect(r.usable).toBe(false);
    expect(r.checkFailed).toBe(true);
  });

  it('is NOT usable with no instrument id', async () => {
    expect((await checkInstrumentUsable(client({ data: null }), null)).usable).toBe(false);
    expect((await checkInstrumentUsable(client({ data: null }), '')).usable).toBe(false);
  });

  it('is NOT usable for an answer whose shape it cannot read', async () => {
    for (const data of [0, 1, false, true, {}, []] as unknown[]) {
      const r = await checkInstrumentUsable(client({ data }), 'i1');
      expect(r.usable, `data ${JSON.stringify(data)} must not read as usable`).toBe(false);
      expect(r.checkFailed, `data ${JSON.stringify(data)} must be flagged unreadable`).toBe(true);
    }
  });
});

// ── the derivation ───────────────────────────────────────────────────

const TODAY = new Date('2026-10-14T13:45:00Z');
const inst = (o: Partial<Instrument> = {}) =>
  ({ status: 'in_service', calibration_due_date: '2027-01-01', ...o }) as Instrument;

describe('calibrationState', () => {
  it('is valid when the due date is comfortably ahead', () => {
    expect(calibrationState(inst({ calibration_due_date: '2027-10-14' }), 30, TODAY)).toBe('valid');
  });

  it('is due_soon inside the lead time', () => {
    expect(calibrationState(inst({ calibration_due_date: '2026-11-01' }), 30, TODAY)).toBe('due_soon');
  });

  it('is VALID on the due date itself, not expired', () => {
    //  A calibration is good THROUGH its due date. `<=` here would shut a
    //  line down a day early every time — and would disagree with
    //  instrument_block_reason(), which compares `< current_date`.
    expect(calibrationState(inst({ calibration_due_date: '2026-10-14' }), 30, TODAY)).toBe('due_soon');
  });

  it('is expired the day after the due date', () => {
    expect(calibrationState(inst({ calibration_due_date: '2026-10-13' }), 30, TODAY)).toBe('expired');
  });

  it('is never when there is no due date at all', () => {
    //  Distinct from expired: different problem, different remedy.
    expect(calibrationState(inst({ calibration_due_date: null }), 30, TODAY)).toBe('never');
  });

  it('is never — not valid — for an unparseable date', () => {
    //  A date this code cannot read is not a calibration it can vouch for.
    expect(calibrationState(inst({ calibration_due_date: 'not-a-date' }), 30, TODAY)).toBe('never');
  });

  it('does not depend on the time of day', () => {
    //  Compared as calendar dates. Comparing a date against an instant
    //  makes the answer flip at midnight UTC for some viewers and not
    //  others.
    for (const h of ['00:00:01', '12:00:00', '23:59:59']) {
      const t = new Date(`2026-10-14T${h}Z`);
      expect(calibrationState(inst({ calibration_due_date: '2026-10-14' }), 30, t)).toBe('due_soon');
      expect(calibrationState(inst({ calibration_due_date: '2026-10-13' }), 30, t)).toBe('expired');
    }
  });

  it('respects a shorter lead time', () => {
    expect(calibrationState(inst({ calibration_due_date: '2026-11-01' }), 5, TODAY)).toBe('valid');
  });
});

describe('daysUntilDue', () => {
  it('counts the days remaining', () => {
    expect(daysUntilDue(inst({ calibration_due_date: '2026-10-24' }), TODAY)).toBe(10);
  });

  it('is zero on the due date', () => {
    expect(daysUntilDue(inst({ calibration_due_date: '2026-10-14' }), TODAY)).toBe(0);
  });

  it('goes negative once it has lapsed', () => {
    expect(daysUntilDue(inst({ calibration_due_date: '2026-10-04' }), TODAY)).toBe(-10);
  });

  it('is null when there is no due date', () => {
    expect(daysUntilDue(inst({ calibration_due_date: null }), TODAY)).toBeNull();
  });
});

describe('isSelectable', () => {
  it('offers an in-service instrument that is in calibration', () => {
    expect(isSelectable(inst({ calibration_due_date: '2027-01-01' }), TODAY)).toBe(true);
  });

  it('still offers one that is due soon', () => {
    //  Due soon is a warning, not a block — refusing it here would stop
    //  work the database is happy to allow.
    expect(isSelectable(inst({ calibration_due_date: '2026-11-01' }), TODAY)).toBe(true);
  });

  it('does not offer an expired one', () => {
    expect(isSelectable(inst({ calibration_due_date: '2026-10-13' }), TODAY)).toBe(false);
  });

  it('does not offer one that has never been calibrated', () => {
    expect(isSelectable(inst({ calibration_due_date: null }), TODAY)).toBe(false);
  });

  it('does not offer a retired or out-of-service instrument, however well calibrated', () => {
    for (const status of ['retired', 'out_of_service'] as const) {
      expect(isSelectable(inst({ status, calibration_due_date: '2027-10-14' }), TODAY)).toBe(false);
    }
  });
});
