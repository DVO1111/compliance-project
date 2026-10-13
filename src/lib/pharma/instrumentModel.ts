import { logger } from '../logger';

/**
 * Instruments and calibration: the shapes, the lockout read, and the
 * judgements a screen makes.
 *
 * Everything item 10 needs that does NOT bind the Supabase client lives
 * here, so it can be tested without a project, a network or a .env — the
 * lockout read included, which takes its client as an argument for that
 * reason.
 *
 * ONE RULE ABOVE ALL OTHERS IN THIS FILE
 * --------------------------------------
 * "Expired status is displayed but the sign-off still succeeds" is one of
 * item 10's NOT DONE IF clauses, and it describes a DISAGREEMENT between
 * what a screen shows and what the database allows. So nothing here
 * invents a calibration state: `calibrationState` below is derived from
 * the same due date, with the same comparison, as
 * instrument_block_reason() in SQL — and `isUsable` defers to the
 * server's answer rather than computing its own.
 *
 * If you change the comparison here, change it in
 * 20261014000000_instrument_calibration.sql in the same commit.
 */

export type InstrumentStatus = 'in_service' | 'out_of_service' | 'retired';
export type CalibrationResult = 'pass' | 'fail' | 'pass_with_adjustment';

export interface Instrument {
  id: string;
  company_id: string;
  code: string;
  name: string;
  instrument_type: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  location: string | null;
  owner_user_id: string | null;
  /** SERVICE state, not calibration state. */
  status: InstrumentStatus;
  /** Derived from the certificates by trigger; a direct write is refused.
   *  null means never calibrated, which blocks use. */
  calibration_due_date: string | null;
  last_calibrated_on: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstrumentCalibration {
  id: string;
  company_id: string;
  instrument_id: string;
  certificate_number: string | null;
  calibrated_on: string;
  due_on: string;
  performed_by_org: string | null;
  performed_in_house: boolean;
  result: CalibrationResult;
  document_path: string | null;
  document_mime_type: string | null;
  document_size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface InstrumentUsage {
  id: string;
  company_id: string;
  instrument_id: string;
  entity_type: 'dispensing_record' | 'batch_stage';
  entity_id: string;
  used_at: string;
  used_by: string | null;
  /** Snapshot: what the due date was when the instrument was used. */
  due_on_at_use: string | null;
  instrument_code_at_use: string | null;
  created_at: string;
}

export interface CalibrationAlert {
  id: string;
  company_id: string;
  instrument_id: string;
  alert_type: 'calibration_approaching' | 'calibration_overdue';
  due_date: string;
  lead_days: number;
  owner_user_id: string | null;
  raised_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

/**
 * What a screen should say about an instrument's calibration.
 *
 * 'never' is kept distinct from 'expired' because they are different
 * problems with different remedies: one instrument has never been
 * calibrated, the other is overdue for recalibration. Collapsing them
 * into "not calibrated" tells an engineer less than the database knows.
 */
export type CalibrationState = 'valid' | 'due_soon' | 'expired' | 'never';

/**
 * Derived from the due date, with the SAME comparison the database uses:
 * a calibration is good THROUGH its due date, so `due === today` is
 * valid, not expired. Getting that boundary wrong shuts a line down a day
 * early, every time, which is the kind of bug that gets a control
 * switched off rather than fixed.
 */
export function calibrationState(
  instrument: Pick<Instrument, 'calibration_due_date'>,
  leadDays = 30,
  today: Date = new Date(),
): CalibrationState {
  if (!instrument.calibration_due_date) return 'never';

  //  Compared as calendar dates, not instants. A due date is a day, and
  //  comparing it against a timestamp makes the answer depend on the time
  //  of day and on the viewer's timezone.
  const due = Date.parse(`${instrument.calibration_due_date}T00:00:00Z`);
  if (Number.isNaN(due)) return 'never';
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  if (due < now) return 'expired';
  const daysLeft = Math.round((due - now) / 86_400_000);
  return daysLeft <= leadDays ? 'due_soon' : 'valid';
}

/** Days until the calibration lapses; negative once it has. Null when the
 *  instrument has never been calibrated. */
export function daysUntilDue(
  instrument: Pick<Instrument, 'calibration_due_date'>,
  today: Date = new Date(),
): number | null {
  if (!instrument.calibration_due_date) return null;
  const due = Date.parse(`${instrument.calibration_due_date}T00:00:00Z`);
  if (Number.isNaN(due)) return null;
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((due - now) / 86_400_000);
}

/**
 * Whether a screen should offer this instrument for a recorded step.
 *
 * Service state and calibration both matter, and this is ADVICE: the
 * database refuses it regardless. It exists so an operator is not offered
 * a balance that will be rejected a moment later.
 */
export function isSelectable(
  instrument: Pick<Instrument, 'status' | 'calibration_due_date'>,
  today: Date = new Date(),
): boolean {
  if (instrument.status !== 'in_service') return false;
  const state = calibrationState(instrument, 30, today);
  return state === 'valid' || state === 'due_soon';
}

// ── the lockout read ─────────────────────────────────────────────────

export interface InstrumentGateClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface InstrumentCheck {
  /** True ONLY when the server positively confirmed the instrument may be
   *  used. Never true by default, and never true on an error. */
  usable: boolean;
  reason: string | null;
  checkFailed: boolean;
}

const BLOCKED_BY_FAILURE =
  'The instrument\'s calibration could not be checked, so it cannot be used for a recorded step.';

/**
 * Asks the database whether an instrument may be used.
 *
 * The same shape, and the same reasoning, as the quarantine and clearance
 * gates: supabase-js RESOLVES with `{ data: null, error }`, so reading
 * `data === null` as "fine" turns a network failure into permission to
 * weigh a batch on an uncalibrated balance.
 */
export async function checkInstrumentUsable(
  client: InstrumentGateClient,
  instrumentId: string | null | undefined,
): Promise<InstrumentCheck> {
  if (!instrumentId) {
    return {
      usable: false,
      reason: 'No instrument was given, so no calibration could be checked.',
      checkFailed: true,
    };
  }

  let data: unknown;
  let error: { message: string } | null;
  try {
    ({ data, error } = await client.rpc('instrument_block_reason', { p_instrument_id: instrumentId }));
  } catch (e: any) {
    logger.error('[instrument] gate threw', e);
    return { usable: false, reason: BLOCKED_BY_FAILURE, checkFailed: true };
  }

  if (error) {
    logger.error('[instrument] gate failed', { instrumentId, error });
    return { usable: false, reason: BLOCKED_BY_FAILURE, checkFailed: true };
  }

  if (data === null || data === undefined) {
    return { usable: true, reason: null, checkFailed: false };
  }
  if (typeof data !== 'string') {
    logger.error('[instrument] gate returned an unexpected shape', { instrumentId, data });
    return {
      usable: false,
      reason: 'The calibration check returned something unexpected, so the instrument cannot be used.',
      checkFailed: true,
    };
  }
  return { usable: false, reason: data, checkFailed: false };
}
