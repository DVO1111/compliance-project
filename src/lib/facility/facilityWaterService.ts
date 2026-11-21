/**
 * Water treatment — FL-10 and FL-11.
 *
 * Kept out of `facilityLogService` because water results are judged
 * differently from everything else in facility logs, and mixing the
 * two would invite exactly the mistake this model exists to prevent.
 *
 * ── WHY WATER IS NOT AN ENVIRONMENTAL READING ──
 *
 * `facility_log_outcome()` asks one question: is the result above its
 * limit. FL-11 draws four kinds of limit, and only two of them are
 * that question:
 *
 *     Free chlorine after carbon      0.00                 max
 *     Conductivity, RO permeate       1.3 or less          max
 *     pH, loop return                 5.0 – 7.0            RANGE
 *     Total viable count, PW-03       100 or less          max
 *     Coliforms, PW-03                Absent in 100 mL     QUALITATIVE
 *
 * A pH range expressed as an upper bound of 7.0 passes a reading of
 * 4.0, which is far too acidic to release purified water on. That was
 * confirmed against the live function before this module was written,
 * and `facility_water_treatment_test.sql` section B holds it.
 *
 * As everywhere else in this feature, `outcome` is DERIVED by the
 * database. `recordResult` never sends it.
 */
import { supabase } from '../supabase';
import { logger } from '../logger';

export type WaterLimitKind = 'max' | 'range' | 'qualitative';

export type WaterOutcome =
  | 'within_limits'
  | 'outside_limits'
  | 'awaiting_laboratory'
  | 'not_assessed';

export const WATER_OUTCOME_LABELS: Record<WaterOutcome, string> = {
  within_limits: 'Within limits',
  outside_limits: 'Outside limits',
  //  Not a failure and not a pass: the sample was taken and the
  //  laboratory has not reported.
  awaiting_laboratory: 'Awaiting laboratory',
  not_assessed: 'Not assessed',
};

export const WATER_OUTCOME_TONE: Record<WaterOutcome, 'ok' | 'warn' | 'bad' | 'idle'> = {
  within_limits: 'ok',
  outside_limits: 'bad',
  //  A warning rather than neutral: an overdue external analysis is
  //  something somebody has to chase.
  awaiting_laboratory: 'warn',
  not_assessed: 'idle',
};

export const WATER_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly'] as const;
export type WaterFrequency = typeof WATER_FREQUENCIES[number];

export const WATER_FREQUENCY_LABELS: Record<WaterFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

export interface WaterStage {
  id: string;
  source_id: string;
  position: number;
  name: string;
  equipment_ref: string | null;
}

export interface WaterRegisterRow {
  test_id: string;
  source_id: string;
  source_name: string;
  source_ref: string | null;
  test_name: string;
  sample_point: string | null;
  frequency: WaterFrequency;
  limit_kind: WaterLimitKind;
  limit_min: number | null;
  limit_max: number | null;
  expected_text: string | null;
  result_unit: string | null;
  laboratory_kind: 'in_house' | 'external';
  laboratory_name: string | null;
  last_result_id: string | null;
  last_sampled_on: string | null;
  last_due_on: string | null;
  last_value: number | null;
  last_text: string | null;
  last_received: boolean | null;
  last_report_ref: string | null;
  last_outcome: WaterOutcome | null;
}

function fmtDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function num(v: number | null): string {
  if (v == null) return '';
  //  Trailing zeros matter here: FL-11 prints a free-chlorine limit
  //  as "0.00" rather than "0", because the precision is the point.
  return String(Number(v));
}

/**
 *  FL-11's LIMIT column, in the words the design uses.
 *
 *  Each phrasing is taken from the screen rather than invented:
 *  "1.3 or less", "5.0 – 7.0", "Absent in 100 mL".
 */
export function formatLimit(row: WaterRegisterRow): string {
  const unit = row.result_unit ? ` ${row.result_unit}` : '';
  if (row.limit_kind === 'qualitative') {
    return row.expected_text
      ? `${row.expected_text}${unit ? ` in${unit}` : ''}`
      : '—';
  }
  if (row.limit_kind === 'range') {
    if (row.limit_min == null || row.limit_max == null) return '—';
    //  En dash, as the design draws it.
    return `${num(row.limit_min)} – ${num(row.limit_max)}`;
  }
  if (row.limit_max == null) return '—';
  //  A zero ceiling reads better as the bare figure, which is how
  //  FL-11 prints the free-chlorine row.
  return Number(row.limit_max) === 0 ? num(row.limit_max) : `${num(row.limit_max)} or less`;
}

/**
 *  FL-11's LAST RESULT column: "1.1 µS/cm · 21 Oct", "Absent · 15
 *  Oct", or "Not received · due 15 Oct".
 */
export function formatLastResult(row: WaterRegisterRow): string {
  if (!row.last_result_id) return 'Never sampled';
  if (row.last_received === false) {
    return row.last_due_on
      ? `Not received · due ${fmtDay(row.last_due_on)}`
      : 'Not received';
  }
  const when = fmtDay(row.last_sampled_on);
  if (row.last_text) return `${row.last_text}${when ? ` · ${when}` : ''}`;
  if (row.last_value != null) {
    const unit = row.result_unit ? ` ${row.result_unit}` : '';
    return `${num(row.last_value)}${unit}${when ? ` · ${when}` : ''}`;
  }
  return when ? `Recorded · ${when}` : 'Recorded';
}

/** "In-house · Emeka Nwankwo" or "Labcheck Analytical · LA-88412". */
export function formatLaboratory(row: WaterRegisterRow): string {
  const parts = [row.laboratory_name || (row.laboratory_kind === 'in_house' ? 'In-house' : 'External')];
  if (row.last_report_ref) parts.push(row.last_report_ref);
  return parts.join(' · ');
}

export async function listWaterRegister(companyId: string): Promise<WaterRegisterRow[]> {
  const { data, error } = await supabase.rpc('facility_water_register', {
    p_company_id: companyId,
  });
  if (error) {
    logger.error('[water] could not load the register', { error: error.message });
    throw new Error(describeWaterError(error.message).message);
  }
  return (data ?? []) as unknown as WaterRegisterRow[];
}

export async function listStages(
  companyId: string,
  sourceId: string,
): Promise<WaterStage[]> {
  const { data, error } = await supabase
    .from('facility_water_stages')
    .select('id, source_id, position, name, equipment_ref')
    .eq('company_id', companyId)
    .eq('source_id', sourceId)
    .order('position', { ascending: true });
  if (error) {
    logger.error('[water] could not load the treatment train', { error: error.message });
    throw new Error(describeWaterError(error.message).message);
  }
  return (data ?? []) as unknown as WaterStage[];
}

export interface WaterResultDraft {
  test_id: string;
  sampled_on: string;
  due_on?: string | null;
  result_value?: number | null;
  result_text?: string | null;
  received?: boolean;
  report_ref?: string | null;
  analyst_name?: string | null;
  notes?: string | null;
}

/**
 *  Client-side validation, mirroring what the database will accept.
 *  It is not the enforcement — the outcome and the company checks are
 *  the trigger's — but a form should object before a round trip.
 */
export function validateWaterResult(
  draft: WaterResultDraft,
  kind: WaterLimitKind,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.sampled_on) errors.sampled_on = 'Record the date the sample was taken.';

  //  A result that has not come back needs no figure; one that has
  //  needs the right KIND of figure.
  if (draft.received === false) return errors;

  if (kind === 'qualitative') {
    if (!String(draft.result_text ?? '').trim()) {
      errors.result_text = 'State the result, such as Absent.';
    }
  } else if (draft.result_value == null || Number.isNaN(draft.result_value)) {
    errors.result_value = 'Record the measured value.';
  }
  return errors;
}

/**
 *  NEVER SENDS `outcome`. Whether the water met its specification is
 *  the database's to decide, and a caller that could assert it could
 *  file a failing result as a pass.
 */
export async function recordResult(
  companyId: string,
  draft: WaterResultDraft,
  recordedBy: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('facility_water_results')
    .insert({
      company_id: companyId,
      test_id: draft.test_id,
      sampled_on: draft.sampled_on,
      due_on: draft.due_on || null,
      result_value: draft.result_value ?? null,
      result_text: draft.result_text?.trim() || null,
      received: draft.received ?? true,
      report_ref: draft.report_ref?.trim() || null,
      analyst_name: draft.analyst_name?.trim() || null,
      notes: draft.notes?.trim() || null,
      recorded_by: recordedBy,
    });
  if (error) {
    logger.error('[water] could not record a result', { error: error.message });
    throw new Error(describeWaterError(error.message).message);
  }
}

export interface WaterSummary {
  tests: number;
  outside: number;
  awaiting: number;
  neverSampled: number;
}

export function summarise(rows: WaterRegisterRow[]): WaterSummary {
  return {
    tests: rows.length,
    outside: rows.filter((r) => r.last_outcome === 'outside_limits').length,
    awaiting: rows.filter((r) => r.last_outcome === 'awaiting_laboratory').length,
    neverSampled: rows.filter((r) => !r.last_result_id).length,
  };
}

/**
 *  Worst first, the same reasoning as FL-01's table: a result outside
 *  its limits, then one nobody has chased, then one never taken.
 */
export function triage(rows: WaterRegisterRow[]): WaterRegisterRow[] {
  const rank = (r: WaterRegisterRow): number => {
    if (r.last_outcome === 'outside_limits') return 0;
    if (r.last_outcome === 'awaiting_laboratory') return 1;
    if (!r.last_result_id) return 2;
    if (r.last_outcome === 'not_assessed') return 3;
    return 4;
  };
  return [...rows].sort(
    (a, b) => rank(a) - rank(b)
      || a.source_name.localeCompare(b.source_name)
      || a.test_name.localeCompare(b.test_name),
  );
}

export function describeWaterError(raw: string): { code: string; message: string } {
  const text = String(raw ?? '');
  if (text.includes('WATER_TEST_WRONG_COMPANY') || text.includes('WATER_TEST_NOT_FOUND')) {
    return {
      code: 'WATER_TEST_NOT_FOUND',
      message: 'No water test of this company has that id.',
    };
  }
  if (text.includes('WATER_SOURCE_WRONG_COMPANY')
      || text.includes('WATER_SOURCE_NOT_FOUND')) {
    return {
      code: 'WATER_SOURCE_NOT_FOUND',
      message: 'No water source of this company has that id.',
    };
  }
  if (text.includes('facility_water_limit_shape_chk')) {
    return {
      code: 'LIMIT_INCOMPLETE',
      message:
        'That limit cannot be used as stated — a range needs both ends, a maximum needs '
        + 'a ceiling, and a qualitative test needs the result it expects.',
    };
  }
  if (text.includes('facility_water_range_ordered_chk')) {
    return {
      code: 'RANGE_INVERTED',
      message: 'The top of the range cannot be below the bottom — every result would fail.',
    };
  }
  return { code: 'UNKNOWN', message: text || 'The water log could not be updated.' };
}
