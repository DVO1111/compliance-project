/**
 * Facility logs — W6·29.
 *
 * Environmental monitoring, cleaning, water and pest control for a
 * site. FL-01 states the scope in one line: *"Logs belong to the
 * facility, not to a batch."* Nothing here references a batch, and that
 * is deliberate rather than an omission.
 *
 * ── WHAT THIS SERVICE DOES NOT DECIDE ──
 *
 * It does not decide whether a reading passed. `facility_log_outcome()`
 * does, in the database, against the limits on the reading's own
 * schedule, applied by a BEFORE trigger (20261204000000). A reading's
 * standing against its action limit is the evidential content of an
 * environmental log, and a screen that computed it could be made to
 * report a 112 CFU result against a limit of 100 as fine.
 *
 * So `recordEntry` sends the measurement and reads the verdict back. If
 * the two ever disagree, the database is right.
 *
 * The same reasoning the CoA service already follows for certificate
 * verification, and the same defect that 20261203000000 had to remove
 * from the customs flag.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';

export type FacilityLogType =
  | 'environmental_air'
  | 'environmental_surface'
  | 'cleaning_routine'
  | 'cleaning_deep'
  | 'water'
  | 'pest_control';

export type FacilityFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';

/**
 * `not_assessed` is not a synonym for `within_limits`. A reading taken
 * where no limit is configured has not passed anything, and FL-01 draws
 * exactly that row.
 */
export type FacilityOutcome =
  | 'within_limits'
  | 'outside_alert'
  | 'outside_action'
  | 'not_done'
  | 'not_assessed';

/** FL-01's tabs, in the order the design draws them. */
export const LOG_TYPE_TABS: { type: FacilityLogType[]; label: string }[] = [
  { label: 'Environmental', type: ['environmental_air', 'environmental_surface'] },
  { label: 'Cleaning', type: ['cleaning_routine', 'cleaning_deep'] },
  { label: 'Water', type: ['water'] },
  { label: 'Pest control', type: ['pest_control'] },
];

export const LOG_TYPE_LABELS: Record<FacilityLogType, string> = {
  environmental_air: 'Air',
  environmental_surface: 'Surface swabs',
  cleaning_routine: 'Routine clean',
  cleaning_deep: 'Deep clean',
  water: 'Water',
  pest_control: 'Pest control',
};

export const FREQUENCY_LABELS: Record<FacilityFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

/**
 * Wording for each outcome, kept here so the register, the zone history
 * and any report cannot describe the same verdict differently.
 */
export const OUTCOME_LABELS: Record<FacilityOutcome, string> = {
  within_limits: 'Within limits',
  outside_alert: 'Above alert limit',
  outside_action: 'Outside action limit',
  not_done: 'Not done',
  not_assessed: 'Recorded, no limit set',
};

export const OUTCOME_TONE: Record<FacilityOutcome, 'ok' | 'warn' | 'bad' | 'idle'> = {
  within_limits: 'ok',
  outside_alert: 'warn',
  outside_action: 'bad',
  not_done: 'bad',
  not_assessed: 'idle',
};

export interface FacilityZone {
  id: string;
  company_id: string;
  site_id: string;
  name: string;
  code: string | null;
  grade: string | null;
  line_ref: string | null;
  equipment_refs: string[];
  cleaning_sop_ref: string | null;
  owner_id: string | null;
  alert_owner_after_days: number;
  escalate_to_qa_after_days: number;
  is_active: boolean;
}

export interface FacilitySchedule {
  id: string;
  company_id: string;
  zone_id: string;
  log_type: FacilityLogType;
  description: string;
  frequency: FacilityFrequency;
  due_time: string | null;
  alert_limit: number | null;
  action_limit: number | null;
  result_unit: string | null;
  owner_id: string | null;
  is_active: boolean;
}

export interface FacilityLogEntry {
  id: string;
  company_id: string;
  zone_id: string;
  schedule_id: string | null;
  log_type: FacilityLogType;
  due_at: string | null;
  recorded_at: string;
  recorded_by: string | null;
  result_value: number | null;
  result_unit: string | null;
  result_position: string | null;
  performed: boolean;
  outcome: FacilityOutcome;
  notes: string | null;
  reference: string | null;
  linked_deviation_id: string | null;
}

/** One row of FL-01's register: a schedule with its most recent entry. */
export interface RegisterRow {
  schedule_id: string;
  zone_id: string;
  zone_name: string;
  zone_grade: string | null;
  zone_line_ref: string | null;
  log_type: FacilityLogType;
  description: string;
  frequency: FacilityFrequency;
  due_time: string | null;
  alert_limit: number | null;
  action_limit: number | null;
  result_unit: string | null;
  last_entry_id: string | null;
  last_recorded_at: string | null;
  last_result_value: number | null;
  last_result_position: string | null;
  last_outcome: FacilityOutcome | null;
  last_reference: string | null;
  days_since_last: number | null;
}

const ZONE_COLUMNS =
  'id, company_id, site_id, name, code, grade, line_ref, equipment_refs, ' +
  'cleaning_sop_ref, owner_id, alert_owner_after_days, escalate_to_qa_after_days, is_active';

const SCHEDULE_COLUMNS =
  'id, company_id, zone_id, log_type, description, frequency, due_time, ' +
  'alert_limit, action_limit, result_unit, owner_id, is_active';

const ENTRY_COLUMNS =
  'id, company_id, zone_id, schedule_id, log_type, due_at, recorded_at, recorded_by, ' +
  'result_value, result_unit, result_position, performed, outcome, notes, reference, ' +
  'linked_deviation_id';

/**
 * Turn a database refusal into something a person can act on.
 *
 * The codes are the ones the trigger actually raises, not a guess. A
 * refusal nobody can read sends the reader to the wrong person.
 */
export function describeFacilityError(raw: string): { code: string; message: string } {
  const text = String(raw ?? '');
  if (text.includes('FACILITY_ZONE_WRONG_COMPANY')) {
    return {
      code: 'FACILITY_ZONE_WRONG_COMPANY',
      message: 'That zone belongs to another company.',
    };
  }
  if (text.includes('FACILITY_SCHEDULE_WRONG_ZONE')) {
    return {
      code: 'FACILITY_SCHEDULE_WRONG_ZONE',
      message:
        'That scheduled test belongs to a different zone, so its limits do not apply ' +
        'to this reading. Pick the test for this zone.',
    };
  }
  if (text.includes('FACILITY_ZONE_NOT_FOUND')) {
    return { code: 'FACILITY_ZONE_NOT_FOUND', message: 'That zone no longer exists.' };
  }
  if (text.includes('facility_schedule_limits_ordered')) {
    return {
      code: 'LIMITS_INVERTED',
      message:
        'The action limit cannot be below the alert limit — every result measured ' +
        'against them would read the wrong way round.',
    };
  }
  //  Unknown codes pass through rather than being flattened into
  //  "something went wrong", which is how a real finding gets lost.
  return { code: 'UNKNOWN', message: text || 'The facility log could not be updated.' };
}

export async function listZones(companyId: string): Promise<FacilityZone[]> {
  const { data, error } = await supabase
    .from('facility_zones')
    .select(ZONE_COLUMNS)
    .eq('company_id', companyId)
    .order('name', { ascending: true });
  if (error) {
    logger.error('[facility] could not list zones', { error: error.message });
    throw new Error(describeFacilityError(error.message).message);
  }
  return (data ?? []) as unknown as FacilityZone[];
}

export async function listSchedules(companyId: string): Promise<FacilitySchedule[]> {
  const { data, error } = await supabase
    .from('facility_zone_schedules')
    .select(SCHEDULE_COLUMNS)
    .eq('company_id', companyId)
    .order('description', { ascending: true });
  if (error) {
    logger.error('[facility] could not list schedules', { error: error.message });
    throw new Error(describeFacilityError(error.message).message);
  }
  return (data ?? []) as unknown as FacilitySchedule[];
}

/** FL-01's register. */
export async function listRegister(companyId: string): Promise<RegisterRow[]> {
  const { data, error } = await supabase.rpc('facility_log_register', {
    p_company_id: companyId,
  });
  if (error) {
    logger.error('[facility] could not load the register', { error: error.message });
    throw new Error(describeFacilityError(error.message).message);
  }
  return (data ?? []) as unknown as RegisterRow[];
}

/** FL-05's zone history, most recent first. */
export async function listZoneHistory(
  companyId: string,
  zoneId: string,
  limit = 50,
): Promise<FacilityLogEntry[]> {
  const { data, error } = await supabase
    .from('facility_log_entries')
    .select(ENTRY_COLUMNS)
    .eq('company_id', companyId)
    .eq('zone_id', zoneId)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error) {
    logger.error('[facility] could not load zone history', { error: error.message });
    throw new Error(describeFacilityError(error.message).message);
  }
  return (data ?? []) as unknown as FacilityLogEntry[];
}

/**
 * Record a reading, a clean, a water check or a pest visit.
 *
 * `outcome` is not a parameter. The trigger derives it from this
 * reading and its schedule's limits, and the row that comes back
 * carries the verdict — read it rather than computing one here.
 */
export async function recordEntry(params: {
  companyId: string;
  zoneId: string;
  scheduleId?: string | null;
  logType: FacilityLogType;
  recordedBy: string;
  dueAt?: string | null;
  resultValue?: number | null;
  resultUnit?: string | null;
  resultPosition?: string | null;
  /** False for a scheduled test that was not carried out. */
  performed?: boolean;
  notes?: string | null;
  reference?: string | null;
}): Promise<FacilityLogEntry> {
  const { data, error } = await supabase
    .from('facility_log_entries')
    .insert({
      company_id: params.companyId,
      zone_id: params.zoneId,
      schedule_id: params.scheduleId ?? null,
      log_type: params.logType,
      due_at: params.dueAt ?? null,
      recorded_by: params.recordedBy,
      result_value: params.resultValue ?? null,
      result_unit: params.resultUnit ?? null,
      result_position: params.resultPosition ?? null,
      performed: params.performed ?? true,
      notes: params.notes ?? null,
      reference: params.reference ?? null,
    })
    .select(ENTRY_COLUMNS)
    .single();

  if (error) {
    const described = describeFacilityError(error.message);
    logger.error('[facility] could not record an entry', { code: described.code });
    throw new Error(described.message);
  }
  return data as unknown as FacilityLogEntry;
}

/**
 * Is a schedule overdue?
 *
 * Pure, so the register can be summarised without another round trip,
 * and so the rule is testable. It answers only "has the window passed
 * since the last entry" — FL-02's per-zone escalation days are a
 * separate question about who gets told, and are not decided here.
 */
export const FREQUENCY_DAYS: Record<FacilityFrequency, number> = {
  daily: 1, weekly: 7, monthly: 30, quarterly: 91,
};

export function isOverdue(row: RegisterRow): boolean {
  //  Never recorded: overdue by definition, which is FL-01's "Not
  //  sampled" row.
  if (row.last_recorded_at === null || row.days_since_last === null) return true;
  return row.days_since_last > FREQUENCY_DAYS[row.frequency];
}

/** FL-01's five tiles, counted from the register rather than stored. */
export interface RegisterSummary {
  outsideAction: number;
  outsideAlert: number;
  overdue: number;
  deepCleanOverdue: number;
  pestFindings: number;
  dueToday: number;
  doneToday: number;
}

export function summarise(rows: RegisterRow[]): RegisterSummary {
  const overdueRows = rows.filter(isOverdue);
  const today = new Date().toISOString().slice(0, 10);
  return {
    outsideAction: rows.filter((r) => r.last_outcome === 'outside_action').length,
    outsideAlert: rows.filter((r) => r.last_outcome === 'outside_alert').length,
    overdue: overdueRows.length,
    deepCleanOverdue: overdueRows.filter((r) => r.log_type === 'cleaning_deep').length,
    pestFindings: rows.filter(
      (r) => r.log_type === 'pest_control'
        && (r.last_outcome === 'outside_action' || r.last_outcome === 'outside_alert'),
    ).length,
    dueToday: rows.filter((r) => r.frequency === 'daily').length,
    doneToday: rows.filter(
      (r) => r.frequency === 'daily' && (r.last_recorded_at ?? '').slice(0, 10) === today,
    ).length,
  };
}

/** The register, narrowed to one of FL-01's tabs. */
export function filterByTab(rows: RegisterRow[], types: FacilityLogType[]): RegisterRow[] {
  return rows.filter((r) => types.includes(r.log_type));
}

/**
 * FL-01's order: "today, overdue and failed first".
 *
 * Worst first, because the register exists to be triaged: outside an
 * action limit, then overdue, then above an alert limit, then the rest.
 */
export function triageOrder(rows: RegisterRow[]): RegisterRow[] {
  const rank = (r: RegisterRow): number => {
    if (r.last_outcome === 'outside_action') return 0;
    if (isOverdue(r)) return 1;
    if (r.last_outcome === 'outside_alert') return 2;
    if (r.last_outcome === 'not_done') return 3;
    return 4;
  };
  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || a.zone_name.localeCompare(b.zone_name)
      || a.description.localeCompare(b.description),
  );
}
