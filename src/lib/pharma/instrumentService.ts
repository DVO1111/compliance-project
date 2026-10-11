/**
 * Equipment calibration and lockout — Week 4 item 10.
 *
 * A typed surface over the RPCs and tables in
 * supabase/migrations/20261014000000_instrument_calibration.sql.
 *
 * "Calibration status visible on the dispensing screen" is this file's
 * job; "an instrument with expired calibration blocks sign-off" is the
 * database's, and the two read the SAME function so they cannot disagree.
 * That is deliberate: the disagreement between them is literally one of
 * the item's NOT DONE IF clauses.
 */

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';
import {
  checkInstrumentUsable,
  type InstrumentGateClient,
  type InstrumentCheck,
} from './instrumentModel';
import type {
  Instrument, InstrumentCalibration, InstrumentUsage, CalibrationAlert,
} from './instrumentModel';

export type {
  Instrument, InstrumentCalibration, InstrumentUsage, CalibrationAlert,
  InstrumentStatus, CalibrationResult, CalibrationState,
  InstrumentGateClient, InstrumentCheck,
} from './instrumentModel';
export {
  checkInstrumentUsable, calibrationState, daysUntilDue, isSelectable,
} from './instrumentModel';

export type InstrumentResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

function toFailure(error: { message?: string } | null, fallback: string): InstrumentResult<never> {
  const raw = error?.message ?? fallback;
  const match = raw.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/s);
  if (match) return { ok: false, code: match[1], message: match[2].trim() };
  return { ok: false, code: 'INSTRUMENT_ERROR', message: raw };
}

/** The ordinary entry point for the lockout read. */
export function isInstrumentUsable(instrumentId: string | null | undefined): Promise<InstrumentCheck> {
  return checkInstrumentUsable(supabase as unknown as InstrumentGateClient, instrumentId);
}

// ── the register ─────────────────────────────────────────────────────

export async function listInstruments(
  companyId: string,
  opts: { type?: string; includeRetired?: boolean } = {},
): Promise<Instrument[]> {
  let q = (supabase as any)
    .from('instruments')
    .select('*')
    .eq('company_id', companyId)
    .order('code', { ascending: true });
  if (opts.type) q = q.eq('instrument_type', opts.type);
  if (!opts.includeRetired) q = q.neq('status', 'retired');
  const { data, error } = await q;
  if (error) { logger.error('listInstruments:', error); return []; }
  return data ?? [];
}

/**
 * The balances a dispensing screen may offer.
 *
 * Filtered on the server by type and service state, then by calibration
 * locally — but a screen must still show WHY an unusable balance is
 * unusable rather than silently omitting it, or an operator is left
 * wondering where their balance went. Use listInstruments for that and
 * isSelectable to decide what is pickable.
 */
export function listBalances(companyId: string): Promise<Instrument[]> {
  return listInstruments(companyId, { type: 'balance' });
}

export async function createInstrument(
  companyId: string,
  userId: string,
  instrument: {
    code: string; name: string; instrument_type: string;
    manufacturer?: string | null; model?: string | null;
    serial_number?: string | null; location?: string | null;
    owner_user_id?: string | null; notes?: string | null;
  },
): Promise<Instrument | null> {
  //  No calibration_due_date is sent. It is derived from certificates and
  //  the database refuses a direct write — the only way to extend a
  //  calibration is to record one.
  const { data, error } = await (supabase as any)
    .from('instruments')
    .insert({ ...instrument, company_id: companyId, created_by: userId })
    .select()
    .single();
  if (error) { logger.error('createInstrument:', error); return null; }
  return data;
}

// ── certificates ─────────────────────────────────────────────────────

export async function listCalibrations(
  instrumentId: string, companyId: string,
): Promise<InstrumentCalibration[]> {
  const { data, error } = await (supabase as any)
    .from('instrument_calibrations')
    .select('*')
    .eq('instrument_id', instrumentId)
    .eq('company_id', companyId)
    .order('calibrated_on', { ascending: false });
  if (error) { logger.error('listCalibrations:', error); return []; }
  return data ?? [];
}

export interface RecordCalibrationInput {
  companyId: string;
  userId: string;
  instrumentId: string;
  calibratedOn: string;
  dueOn: string;
  certificateNumber?: string | null;
  performedByOrg?: string | null;
  performedInHouse?: boolean;
  result?: 'pass' | 'fail' | 'pass_with_adjustment';
  /** Must begin with the company id — the storage policy scopes by the
   *  first folder, and the database refuses a path that does not. */
  documentPath?: string | null;
  documentMimeType?: string | null;
  documentSizeBytes?: number | null;
}

/**
 * Records a calibration certificate.
 *
 * This is the only way an instrument's due date moves. A 'fail' result
 * leaves the instrument UNCALIBRATED rather than extending it, which
 * blocks it — the point of calibrating something is that failing matters.
 *
 * Refusals worth branching on:
 *   CALIBRATION_DOC_TYPE_REJECTED   not an accepted file type
 *   CALIBRATION_DOC_TOO_LARGE       past the size limit
 *   CALIBRATION_DOC_PATH_SCOPE      path outside the company's folder
 */
export async function recordCalibration(
  input: RecordCalibrationInput,
): Promise<InstrumentResult<{ calibrationId: string; dueOn: string }>> {
  const { data, error } = await (supabase as any)
    .from('instrument_calibrations')
    .insert({
      company_id: input.companyId,
      instrument_id: input.instrumentId,
      certificate_number: input.certificateNumber ?? null,
      calibrated_on: input.calibratedOn,
      due_on: input.dueOn,
      performed_by_org: input.performedByOrg ?? null,
      performed_in_house: input.performedInHouse ?? false,
      result: input.result ?? 'pass',
      document_path: input.documentPath ?? null,
      document_mime_type: input.documentMimeType ?? null,
      document_size_bytes: input.documentSizeBytes ?? null,
      uploaded_by: input.userId,
    })
    .select()
    .single();

  if (error) {
    logger.warn('[instrument] calibration refused', { instrumentId: input.instrumentId, error });
    return toFailure(error, 'Unable to record the calibration.');
  }

  await recordAuditEvent({
    userId: input.userId,
    companyId: input.companyId,
    action: (input.result ?? 'pass') === 'fail' ? 'instrument_calibration_failed' : 'instrument_calibration_recorded',
    entityType: 'instrument',
    entityId: input.instrumentId,
    metadata: {
      certificate_number: input.certificateNumber ?? null,
      calibrated_on: input.calibratedOn,
      due_on: input.dueOn,
      result: input.result ?? 'pass',
    },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for instrument_calibration:', e));

  return { ok: true, calibrationId: (data as any).id, dueOn: (data as any).due_on };
}

// ── use against a step ───────────────────────────────────────────────

export async function listUsages(
  entityType: 'dispensing_record' | 'batch_stage',
  entityId: string,
  companyId: string,
): Promise<InstrumentUsage[]> {
  const { data, error } = await (supabase as any)
    .from('instrument_usages')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('company_id', companyId)
    .order('used_at', { ascending: true });
  if (error) { logger.error('listUsages:', error); return []; }
  return data ?? [];
}

/**
 * Records that an instrument was used for a step.
 *
 * A dispensing records its balance automatically, by trigger — this is
 * for the steps that do not, chiefly stage execution. Refused for an
 * instrument that is out of calibration, so a step cannot be built on one
 * and then signed.
 */
export async function recordInstrumentUse(
  instrumentId: string,
  entityType: 'dispensing_record' | 'batch_stage',
  entityId: string,
): Promise<InstrumentResult<{ usageId: string | null; alreadyRecorded: boolean }>> {
  const { data, error } = await (supabase as any).rpc('instrument_record_use', {
    p_instrument_id: instrumentId,
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) {
    logger.warn('[instrument] use refused', { instrumentId, entityType, entityId, error });
    return toFailure(error, 'Unable to record the instrument use.');
  }
  const r = data as any;
  return { ok: true, usageId: r.usage_id ?? null, alreadyRecorded: r.already_recorded === true };
}

// ── alerts ───────────────────────────────────────────────────────────

export async function listCalibrationAlerts(
  companyId: string, openOnly = true,
): Promise<CalibrationAlert[]> {
  let q = (supabase as any)
    .from('instrument_calibration_alerts')
    .select('*')
    .eq('company_id', companyId)
    .order('due_date', { ascending: true });
  if (openOnly) q = q.is('acknowledged_at', null);
  const { data, error } = await q;
  if (error) { logger.error('listCalibrationAlerts:', error); return []; }
  return data ?? [];
}

export async function acknowledgeCalibrationAlert(
  alertId: string, companyId: string, userId: string,
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('instrument_calibration_alerts')
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: userId })
    .eq('id', alertId)
    .eq('company_id', companyId);
  if (error) { logger.error('acknowledgeCalibrationAlert:', error); return false; }
  return true;
}

/**
 * Runs the calibration sweep.
 *
 * ALERTING ONLY. The lockout never consults these alerts — it derives
 * from the due date — so a sweep that has not run delays a warning and
 * never delays a block.
 */
export async function runCalibrationSweep(
  companyId: string,
): Promise<InstrumentResult<{ approaching: number; overdue: number }>> {
  const { data, error } = await (supabase as any).rpc('instrument_calibration_sweep', {
    p_company_id: companyId,
  });
  if (error) {
    logger.error('[instrument] sweep failed', error);
    return toFailure(error, 'Unable to run the calibration sweep.');
  }
  const r = data as any;
  return { ok: true, approaching: r.approaching ?? 0, overdue: r.overdue ?? 0 };
}
