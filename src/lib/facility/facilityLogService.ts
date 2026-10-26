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
    return {
      code: 'FACILITY_ZONE_NOT_FOUND',
      message: 'No zone of this company has that id.',
    };
  }
  if (text.includes('FACILITY_SITE_WRONG_COMPANY')) {
    return {
      code: 'FACILITY_SITE_WRONG_COMPANY',
      message: 'That site belongs to another company, so a zone cannot be placed in it.',
    };
  }
  //  Under the caller's own RLS a site belonging to another company is
  //  invisible rather than merely wrong, so this one code covers both
  //  "deleted" and "not yours". The message says what was checked
  //  instead of guessing which it was.
  if (text.includes('FACILITY_SITE_NOT_FOUND')) {
    return {
      code: 'FACILITY_SITE_NOT_FOUND',
      message: 'No site of this company has that id, so a zone cannot be placed in it.',
    };
  }
  if (text.includes('FACILITY_SCHEDULE_WRONG_COMPANY')) {
    return {
      code: 'FACILITY_SCHEDULE_WRONG_COMPANY',
      message: 'That zone belongs to another company, so a test cannot be scheduled on it.',
    };
  }
  if (text.includes('FACILITY_ZONE_NAME_REQUIRED')) {
    return {
      code: 'FACILITY_ZONE_NAME_REQUIRED',
      message: 'A zone needs a name — it is how every result is quoted.',
    };
  }
  if (text.includes('FACILITY_SCHEDULE_DESCRIPTION_REQUIRED')) {
    return {
      code: 'FACILITY_SCHEDULE_DESCRIPTION_REQUIRED',
      message: 'Describe what the test is, so the register has a label for its rows.',
    };
  }
  //  23505 on (site_id, name). FL-02 lets you rename a zone, and the
  //  code is how a result is quoted, so the collision has to be said
  //  plainly rather than surfaced as a constraint name.
  if (text.includes('facility_zones_site_id_name_key')) {
    return {
      code: 'ZONE_NAME_TAKEN',
      message: 'Another zone on this site already has that name.',
    };
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

// ───────────────────────────────────────────────────────────────────────
//  FL-02 — setting a zone up
//
//  Everything below writes. The register, the recording of a reading
//  and the history are all useless on a company whose zones were never
//  created, which is what these close.
//
//  None of them sends `outcome`, and none of them sends a derived
//  field: the same rule the recording path follows. What they do send
//  is checked again by the triggers in 20261205000000, so a caller
//  going straight to the API gets the same refusals this client does.
// ───────────────────────────────────────────────────────────────────────

/** FL-02's site selector. */
export interface FacilitySiteOption {
  id: string;
  name: string;
  site_type: string;
}

export async function listSiteOptions(companyId: string): Promise<FacilitySiteOption[]> {
  const { data, error } = await supabase.rpc('facility_site_options', {
    p_company_id: companyId,
  });
  if (error) {
    logger.error('[facility] could not list sites', { error: error.message });
    throw new Error(describeFacilityError(error.message).message);
  }
  return (data ?? []) as unknown as FacilitySiteOption[];
}

/**
 *  What FL-02's zone panel can set. `company_id` is not among them —
 *  it comes from the caller's own profile at the call site, so a form
 *  cannot nominate a company.
 */
export interface ZoneDraft {
  site_id: string;
  name: string;
  code?: string | null;
  grade?: string | null;
  line_ref?: string | null;
  equipment_refs?: string[];
  cleaning_sop_ref?: string | null;
  owner_id?: string | null;
  alert_owner_after_days?: number;
  escalate_to_qa_after_days?: number;
  is_active?: boolean;
}

/**
 *  Client-side validation, mirroring the trigger so the form can
 *  object before a round trip. It is NOT the enforcement: every rule
 *  checked here is checked again in the database, which is why the
 *  messages are the same strings `describeFacilityError` returns.
 *
 *  Returns one message per field, keyed by field, empty when valid.
 */
export function validateZoneDraft(draft: ZoneDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.site_id) errors.site_id = 'Choose the site this zone is in.';
  if (!String(draft.name ?? '').trim()) {
    errors.name = 'A zone needs a name — it is how every result is quoted.';
  }
  for (const f of ['alert_owner_after_days', 'escalate_to_qa_after_days'] as const) {
    const v = draft[f];
    if (v === undefined || v === null) continue;
    if (!Number.isInteger(v) || v < 0) {
      errors[f] = 'Give a whole number of days, zero or more.';
    }
  }
  return errors;
}

export async function createZone(
  companyId: string,
  draft: ZoneDraft,
  createdBy: string | null,
): Promise<FacilityZone> {
  const { data, error } = await supabase
    .from('facility_zones')
    .insert({
      company_id: companyId,
      site_id: draft.site_id,
      name: draft.name.trim(),
      code: draft.code?.trim() || null,
      grade: draft.grade?.trim() || null,
      line_ref: draft.line_ref?.trim() || null,
      equipment_refs: draft.equipment_refs ?? [],
      cleaning_sop_ref: draft.cleaning_sop_ref?.trim() || null,
      owner_id: draft.owner_id ?? null,
      alert_owner_after_days: draft.alert_owner_after_days ?? 0,
      escalate_to_qa_after_days: draft.escalate_to_qa_after_days ?? 1,
      created_by: createdBy,
    })
    .select(ZONE_COLUMNS)
    .single();
  if (error) {
    logger.error('[facility] could not create a zone', { error: error.message });
    throw new Error(describeFacilityError(error.message).message);
  }
  return data as unknown as FacilityZone;
}

/**
 *  FL-02's "Changes apply from the next scheduled test" is why this
 *  updates the zone and never touches recorded entries: an entry keeps
 *  the limits it was judged against, which is the point of deriving
 *  `outcome` at write time rather than reading it back through a join.
 */
export async function updateZone(
  companyId: string,
  zoneId: string,
  draft: Partial<ZoneDraft>,
): Promise<FacilityZone> {
  const patch: Record<string, unknown> = {};
  if (draft.site_id !== undefined) patch.site_id = draft.site_id;
  if (draft.name !== undefined) patch.name = draft.name.trim();
  if (draft.code !== undefined) patch.code = draft.code?.trim() || null;
  if (draft.grade !== undefined) patch.grade = draft.grade?.trim() || null;
  if (draft.line_ref !== undefined) patch.line_ref = draft.line_ref?.trim() || null;
  if (draft.equipment_refs !== undefined) patch.equipment_refs = draft.equipment_refs;
  if (draft.cleaning_sop_ref !== undefined) {
    patch.cleaning_sop_ref = draft.cleaning_sop_ref?.trim() || null;
  }
  if (draft.owner_id !== undefined) patch.owner_id = draft.owner_id;
  if (draft.alert_owner_after_days !== undefined) {
    patch.alert_owner_after_days = draft.alert_owner_after_days;
  }
  if (draft.escalate_to_qa_after_days !== undefined) {
    patch.escalate_to_qa_after_days = draft.escalate_to_qa_after_days;
  }
  if (draft.is_active !== undefined) patch.is_active = draft.is_active;

  const { data, error } = await supabase
    .from('facility_zones')
    .update(patch)
    //  Both predicates on purpose. RLS already confines the row to the
    //  caller's company; stating it again means a wrong id cannot
    //  silently match nothing and read as success.
    .eq('id', zoneId)
    .eq('company_id', companyId)
    .select(ZONE_COLUMNS)
    .single();
  if (error) {
    logger.error('[facility] could not update a zone', { error: error.message });
    throw new Error(describeFacilityError(error.message).message);
  }
  return data as unknown as FacilityZone;
}

/**
 *  Retire rather than delete. A zone's entries are GMP records and
 *  `facility_log_entries.zone_id` is ON DELETE CASCADE, so deleting a
 *  zone would take its history with it. FL-02 offers no delete.
 */
export async function setZoneActive(
  companyId: string,
  zoneId: string,
  isActive: boolean,
): Promise<FacilityZone> {
  return updateZone(companyId, zoneId, { is_active: isActive });
}

export interface ScheduleDraft {
  zone_id: string;
  log_type: FacilityLogType;
  description: string;
  frequency: FacilityFrequency;
  due_time?: string | null;
  alert_limit?: number | null;
  action_limit?: number | null;
  result_unit?: string | null;
  owner_id?: string | null;
  is_active?: boolean;
}

export function validateScheduleDraft(draft: ScheduleDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.zone_id) errors.zone_id = 'Choose the zone this test belongs to.';
  if (!String(draft.description ?? '').trim()) {
    errors.description = 'Describe what the test is, so the register has a label for its rows.';
  }
  const alert = draft.alert_limit;
  const action = draft.action_limit;
  if (alert != null && action != null && action < alert) {
    errors.action_limit =
      'The action limit cannot be below the alert limit — every result measured ' +
      'against them would read the wrong way round.';
  }
  //  A limit without a unit is a number nobody can check. Not a
  //  database rule: FL-01 shows cleaning rows with neither.
  if ((alert != null || action != null) && !String(draft.result_unit ?? '').trim()) {
    errors.result_unit = 'Give the unit the limits are measured in, such as CFU.';
  }
  return errors;
}

export async function createSchedule(
  companyId: string,
  draft: ScheduleDraft,
): Promise<FacilitySchedule> {
  const { data, error } = await supabase
    .from('facility_zone_schedules')
    .insert({
      company_id: companyId,
      zone_id: draft.zone_id,
      log_type: draft.log_type,
      description: draft.description.trim(),
      frequency: draft.frequency,
      due_time: draft.due_time || null,
      alert_limit: draft.alert_limit ?? null,
      action_limit: draft.action_limit ?? null,
      result_unit: draft.result_unit?.trim() || null,
      owner_id: draft.owner_id ?? null,
    })
    .select(SCHEDULE_COLUMNS)
    .single();
  if (error) {
    logger.error('[facility] could not create a schedule', { error: error.message });
    throw new Error(describeFacilityError(error.message).message);
  }
  return data as unknown as FacilitySchedule;
}

export async function updateSchedule(
  companyId: string,
  scheduleId: string,
  draft: Partial<ScheduleDraft>,
): Promise<FacilitySchedule> {
  const patch: Record<string, unknown> = {};
  if (draft.log_type !== undefined) patch.log_type = draft.log_type;
  if (draft.description !== undefined) patch.description = draft.description.trim();
  if (draft.frequency !== undefined) patch.frequency = draft.frequency;
  if (draft.due_time !== undefined) patch.due_time = draft.due_time || null;
  if (draft.alert_limit !== undefined) patch.alert_limit = draft.alert_limit;
  if (draft.action_limit !== undefined) patch.action_limit = draft.action_limit;
  if (draft.result_unit !== undefined) patch.result_unit = draft.result_unit?.trim() || null;
  if (draft.owner_id !== undefined) patch.owner_id = draft.owner_id;
  if (draft.is_active !== undefined) patch.is_active = draft.is_active;

  const { data, error } = await supabase
    .from('facility_zone_schedules')
    .update(patch)
    .eq('id', scheduleId)
    .eq('company_id', companyId)
    .select(SCHEDULE_COLUMNS)
    .single();
  if (error) {
    logger.error('[facility] could not update a schedule', { error: error.message });
    throw new Error(describeFacilityError(error.message).message);
  }
  return data as unknown as FacilitySchedule;
}

/**
 *  Retire rather than delete, for the same reason as a zone:
 *  `facility_log_entries.schedule_id` is ON DELETE SET NULL, so a
 *  delete would strand every past reading with no record of which
 *  test produced it. 20261204000000 says so at the column.
 */
export async function setScheduleActive(
  companyId: string,
  scheduleId: string,
  isActive: boolean,
): Promise<FacilitySchedule> {
  return updateSchedule(companyId, scheduleId, { is_active: isActive });
}

// ───────────────────────────────────────────────────────────────────────
//  FL-06 / FL-07 — trends
//
//  FL-06 states its own aggregation in its subtitle: "Highest
//  settle-plate count per zone per week." So a series is a weekly
//  MAXIMUM, which `facility_log_trend()` computes in the database.
//
//  FL-07 is the same screen in greyscale, and the design's note on
//  both is the constraint that shapes everything here:
//
//      "One series per chart, no colour-only meaning: points change
//       shape (filled circle, hollow square, solid square) and the
//       limits differ by dash pattern and are labelled at the line
//       end. Axes are labelled. 'Show as table' gives the same
//       numbers for screen readers and print."
//
//  That is why `bandFor` exists and returns a band rather than a
//  colour: the mark's SHAPE is the meaning, and colour is only ever
//  reinforcement.
// ───────────────────────────────────────────────────────────────────────

/**
 *  FL-06's three sub-tabs, as sampling METHODS.
 *
 *  Batch 3 reported that the design offers "Settle plates", "Surface
 *  swabs" and "Active air" while `log_type` has only two
 *  environmental values, because settle plates and active air are
 *  both AIR methods. Phase 2 decision 4 settled it: they are distinct
 *  methods, each with its own protocol metadata and its own limits.
 *
 *  THEY MEASURE DIFFERENT QUANTITIES. A settle plate counts CFU per
 *  plate over an exposure period; an active-air sampler counts them
 *  per cubic metre of air drawn. So they are never charted on one
 *  axis and never share a limit — which is what "do not assume
 *  universal alert thresholds" rules out.
 */
export type SampleMethod = 'settle_plate' | 'active_air' | 'surface_swab';

export const SAMPLE_METHOD_LABELS: Record<SampleMethod, string> = {
  settle_plate: 'Settle plates',
  active_air: 'Active air',
  surface_swab: 'Surface swabs',
};

/** Which log type each method samples. Air has two; surface has one. */
export const SAMPLE_METHOD_LOG_TYPE: Record<SampleMethod, FacilityLogType> = {
  settle_plate: 'environmental_air',
  active_air: 'environmental_air',
  surface_swab: 'environmental_surface',
};

/** FL-06's sub-tabs in the order the design draws them. */
export const TREND_METHOD_TABS: SampleMethod[] =
  ['settle_plate', 'surface_swab', 'active_air'];

/**
 *  The denominator that makes a count interpretable, in words.
 *  Returns null for a swab, which has neither an exposure nor a
 *  volume — it samples a defined area instead.
 */
export function describeProtocol(
  method: SampleMethod | null,
  exposureMinutes: number | null,
  volumeLitres: number | null,
): string | null {
  if (method === 'settle_plate' && exposureMinutes != null) {
    const hours = exposureMinutes / 60;
    return Number.isInteger(hours)
      ? `${hours} h exposure`
      : `${exposureMinutes} min exposure`;
  }
  if (method === 'active_air' && volumeLitres != null) {
    //  A cubic metre is a thousand litres, and samplers are specified
    //  either way, so the larger unit is used once it is whole.
    return volumeLitres >= 1000 && volumeLitres % 1000 === 0
      ? `${volumeLitres / 1000} m³ sampled`
      : `${volumeLitres} L sampled`;
  }
  return null;
}

/** The log types that trend. A cleaning record has no number to plot. */
export const TREND_LOG_TYPES: FacilityLogType[] = [
  'environmental_air',
  'environmental_surface',
];

/** FL-06's range selector. */
export const TREND_RANGES: { label: string; weeks: number }[] = [
  { label: '4 weeks', weeks: 4 },
  { label: '12 weeks', weeks: 12 },
  { label: '6 months', weeks: 26 },
];

export interface TrendRow {
  zone_id: string;
  zone_name: string;
  zone_grade: string | null;
  week_start: string;
  max_value: number;
  max_recorded_at: string;
  sample_count: number;
  result_unit: string | null;
  alert_limit: number | null;
  action_limit: number | null;
  sample_method: SampleMethod | null;
  protocol_exposure_minutes: number | null;
  protocol_volume_litres: number | null;
}

export interface TrendSeries {
  zoneId: string;
  zoneName: string;
  zoneGrade: string | null;
  unit: string | null;
  alertLimit: number | null;
  actionLimit: number | null;
  sampleMethod: SampleMethod | null;
  /** The denominator the count is read against; null for a swab. */
  protocolExposureMinutes: number | null;
  protocolVolumeLitres: number | null;
  points: {
    weekStart: string;
    value: number;
    recordedAt: string;
    samples: number;
    band: TrendBand;
  }[];
}

export type TrendBand = 'within' | 'above_alert' | 'outside_action';

/**
 *  Which of FL-06's three point shapes a reading takes.
 *
 *  Deliberately the SAME order of tests as `facility_log_outcome()` in
 *  the database — action first, then alert — so a point cannot be
 *  drawn as merely "above alert" while the row it came from is
 *  recorded as outside the action limit.
 */
export function bandFor(
  value: number,
  alertLimit: number | null,
  actionLimit: number | null,
): TrendBand {
  if (actionLimit != null && value > actionLimit) return 'outside_action';
  if (alertLimit != null && value > alertLimit) return 'above_alert';
  return 'within';
}

/** FL-06's legend. The shape is named in the text, not just drawn. */
export const BAND_LEGEND: Record<TrendBand, string> = {
  within: 'Within limit (filled circle)',
  above_alert: 'Above alert (hollow square)',
  outside_action: 'Outside action (solid square)',
};

export async function listTrend(
  companyId: string,
  logType: FacilityLogType,
  weeks: number,
  /**
   *  Null charts every method, which is what callers written before
   *  20261210000000 get. Naming one keeps the series — and its limit
   *  lines — to that method alone.
   */
  sampleMethod: SampleMethod | null = null,
): Promise<TrendRow[]> {
  const { data, error } = await supabase.rpc('facility_log_trend', {
    p_company_id: companyId,
    p_log_type: logType,
    p_weeks: weeks,
    p_sample_method: sampleMethod,
  });
  if (error) {
    logger.error('[facility] could not load the trend', { error: error.message });
    throw new Error(describeFacilityError(error.message).message);
  }
  return (data ?? []) as unknown as TrendRow[];
}

/**
 * One chart per zone AND METHOD, which is what "one series per chart"
 * means once a zone is monitored by more than one method.
 *
 * Keying on the zone alone would be wrong, and silently so. A Grade A
 * room monitored by settle plates (limit 2 CFU/plate/4h) and by active
 * air (limit 10 CFU/m³) returns two rows per week from an unfiltered
 * `facility_log_trend`. Merged, a plate reading of 3 — a breach — would
 * be plotted on an axis carrying the active-air limits and read as
 * comfortable. The two counts are not the same quantity and share
 * neither a denominator nor a threshold.
 */
export function groupTrend(rows: TrendRow[]): TrendSeries[] {
  const byZone = new Map<string, TrendSeries>();
  for (const r of rows) {
    const key = `${r.zone_id}\u0000${r.sample_method ?? ''}`;
    let s = byZone.get(key);
    if (!s) {
      s = {
        zoneId: r.zone_id, zoneName: r.zone_name, zoneGrade: r.zone_grade,
        unit: r.result_unit, alertLimit: r.alert_limit, actionLimit: r.action_limit,
        sampleMethod: r.sample_method ?? null,
        protocolExposureMinutes: r.protocol_exposure_minutes ?? null,
        protocolVolumeLitres: r.protocol_volume_litres ?? null,
        points: [],
      };
      byZone.set(key, s);
    }
    s.points.push({
      weekStart: r.week_start,
      value: Number(r.max_value),
      recordedAt: r.max_recorded_at,
      samples: Number(r.sample_count),
      band: bandFor(Number(r.max_value), r.alert_limit, r.action_limit),
    });
  }
  for (const s of byZone.values()) {
    s.points.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }
  //  Worst first: a chart that breached an action limit is the one to
  //  read, which is the same triage reasoning FL-01's table uses.
  const rank = (s: TrendSeries): number => {
    if (s.points.some((p) => p.band === 'outside_action')) return 0;
    if (s.points.some((p) => p.band === 'above_alert')) return 1;
    return 2;
  };
  return [...byZone.values()].sort(
    (a, b) => rank(a) - rank(b) || a.zoneName.localeCompare(b.zoneName),
  );
}

/**
 *  HOW LONG A RUN COUNTS AS "RISING" IS NOT STATED BY THE DESIGN.
 *
 *  FL-06 shows two narratives — "rising" for a series that climbed
 *  every week, and "Flat, except week of 13 Oct" for one that did not
 *  — but never says where the line between them falls.
 *
 *  Three points (two consecutive increases) is the choice made here,
 *  because two points is just the last reading being higher than the
 *  one before it, which happens constantly in environmental data and
 *  would label almost every series rising.
 *
 *  It is a choice, not a reading of the design, so it is named here
 *  and pinned by a test. Changing it should be a decision.
 */
export const RISING_RUN_MIN_POINTS = 3;

export interface TrendNarrative {
  direction: 'rising' | 'flat';
  /** The badge: "Rising · outside action limit". */
  badge: string;
  /** The sentence FL-06 prints under the zone name. */
  sentence: string;
  worstBand: TrendBand;
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/**
 *  The narrative FL-06 prints. Pure, so it is tested directly rather
 *  than through a rendered chart.
 */
export function summariseTrend(series: TrendSeries): TrendNarrative {
  const pts = series.points;
  const unit = series.unit ? ` ${series.unit}` : '';

  if (pts.length === 0) {
    return {
      direction: 'flat', badge: 'No readings', worstBand: 'within',
      sentence: 'No measured readings in this period.',
    };
  }

  const worstBand: TrendBand = pts.some((p) => p.band === 'outside_action')
    ? 'outside_action'
    : pts.some((p) => p.band === 'above_alert') ? 'above_alert' : 'within';

  //  The trailing strictly-increasing run, walked back from the end.
  let runStart = pts.length - 1;
  while (runStart > 0 && pts[runStart].value > pts[runStart - 1].value) runStart--;
  const runLength = pts.length - runStart;
  const rising = runLength >= RISING_RUN_MIN_POINTS;

  const bandWord: Record<TrendBand, string> = {
    within: 'within limits',
    above_alert: 'above alert limit',
    outside_action: 'outside action limit',
  };

  if (rising) {
    const from = pts[runStart];
    const to = pts[pts.length - 1];
    //  The first week in this run that crossed each limit — reported
    //  separately because crossing the alert and crossing the action
    //  limit are different events with different consequences.
    const run = pts.slice(runStart);
    const crossedAlert = run.find((p) => p.band !== 'within');
    const crossedAction = run.find((p) => p.band === 'outside_action');
    const crossings = [
      crossedAlert && `the alert limit on ${fmtDay(crossedAlert.recordedAt)}`,
      crossedAction && `the action limit on ${fmtDay(crossedAction.recordedAt)}`,
    ].filter(Boolean) as string[];

    return {
      direction: 'rising',
      badge: `Rising · ${bandWord[worstBand]}`,
      worstBand,
      sentence:
        `Weekly maximum has risen every week since ${fmtDay(from.weekStart)}: `
        + `${from.value} → ${to.value}${unit}.`
        + (crossings.length ? ` Crossed ${crossings.join(' and ')}.` : ''),
    };
  }

  //  Flat. The design names the exceptions rather than the average,
  //  because the excursion is the thing worth reading.
  const breaches = pts.filter((p) => p.band !== 'within');
  if (breaches.length === 0) {
    return {
      direction: 'flat', badge: `Flat · ${bandWord.within}`, worstBand,
      sentence: `Flat, and every weekly maximum stayed within limits.`,
    };
  }
  const named = breaches
    .slice(0, 3)
    .map((p) => `week of ${fmtDay(p.weekStart)}: ${p.value}${unit} on ${fmtDay(p.recordedAt)}`);
  return {
    direction: 'flat',
    badge: `Flat · ${bandWord[worstBand]}`,
    worstBand,
    sentence: `Flat, except ${named.join('; ')}`
      + (breaches.length > 3 ? ` and ${breaches.length - 3} more.` : '.'),
  };
}

/**
 *  "Show as table gives the same numbers" — so the CSV is built from
 *  the same series the chart draws, not from a second query that
 *  could disagree with it.
 */
export function trendToCsv(seriesList: TrendSeries[]): string {
  const head = [
    'Zone', 'Grade', 'Week starting', 'Highest result', 'Unit',
    'Readings in week', 'Peak reading taken', 'Alert limit', 'Action limit', 'Standing',
  ];
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')];
  for (const s of seriesList) {
    for (const p of s.points) {
      lines.push([
        s.zoneName, s.zoneGrade ?? '', p.weekStart, p.value, s.unit ?? '',
        p.samples, p.recordedAt, s.alertLimit ?? '', s.actionLimit ?? '',
        BAND_LEGEND[p.band],
      ].map(cell).join(','));
    }
  }
  return lines.join('\n');
}

// ───────────────────────────────────────────────────────────────────────
//  FL-12 / FL-13 / FL-14 — pest control
//
//  `pest_control` has been one of the six log types since the first
//  facility migration, but a pest visit is not shaped like a reading.
//  FL-13 draws a contracted PROVIDER, a VISIT by a named technician
//  with a report file, and MANY per-station findings inside it.
//
//  W6·29's note on FL-13 is the specification and also the rule:
//
//      "Fields are those PRD G3.9 names: provider, method, date,
//       findings and corrective actions. A finding marked as needing
//       action can't be closed by a note; it becomes a task with an
//       owner and a due date, alerted through the same overdue rule
//       as every facility log."
//
//  THE SECOND HALF OF THAT RULE IS NOT IMPLEMENTED, and the reason is
//  not an oversight. There is no task register in this product —
//  `src/lib/tasks/taskSources.ts` opens by saying so, and adds that a
//  derived task "has no due date and no urgency ordering, because
//  nothing records them". A task with an owner and a due date is
//  precisely what this rule needs and precisely what does not exist.
//
//  So `resolveFinding` can only close a finding that does NOT need
//  action. One that does is refused by the database until a
//  corrective task can be named, which is the design's instruction —
//  it may not be closed by a note — rather than a gap left open.
// ───────────────────────────────────────────────────────────────────────

export interface PestProvider {
  id: string;
  name: string;
  visit_frequency: string | null;
  contract_until: string | null;
  methods: string[];
  next_visit_on: string | null;
}

export interface PestVisitRow {
  visit_id: string;
  reference: string;
  visited_on: string;
  technician_name: string | null;
  report_file_ref: string | null;
  checked_by: string | null;
  checked_at: string | null;
  provider_id: string;
  provider_name: string;
  visit_frequency: string | null;
  contract_until: string | null;
  methods: string[];
  next_visit_on: string | null;
  finding_count: number;
  needs_action_count: number;
  open_action_count: number;
}

export interface PestFinding {
  id: string;
  company_id: string;
  visit_id: string;
  station_code: string;
  location_ref: string | null;
  zone_id: string | null;
  finding: string;
  method_used: string | null;
  needs_action: boolean;
  disposition_note: string | null;
  corrective_task_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

const PEST_FINDING_COLUMNS =
  'id, company_id, visit_id, station_code, location_ref, zone_id, finding, '
  + 'method_used, needs_action, disposition_note, corrective_task_id, '
  + 'resolved_at, resolved_by, resolution_note';

/** FL-13's visit list, newest first, with the provider header. */
export async function listPestVisits(companyId: string): Promise<PestVisitRow[]> {
  const { data, error } = await supabase.rpc('facility_pest_register', {
    p_company_id: companyId,
  });
  if (error) {
    logger.error('[facility] could not load the pest register', { error: error.message });
    throw new Error(describePestError(error.message).message);
  }
  return (data ?? []) as unknown as PestVisitRow[];
}

export async function listPestFindings(
  companyId: string,
  visitId: string,
): Promise<PestFinding[]> {
  const { data, error } = await supabase
    .from('facility_pest_findings')
    .select(PEST_FINDING_COLUMNS)
    .eq('company_id', companyId)
    .eq('visit_id', visitId)
    .order('station_code', { ascending: true });
  if (error) {
    logger.error('[facility] could not load pest findings', { error: error.message });
    throw new Error(describePestError(error.message).message);
  }
  return (data ?? []) as unknown as PestFinding[];
}

export interface PestFindingDraft {
  visit_id: string;
  station_code: string;
  location_ref?: string | null;
  zone_id?: string | null;
  finding: string;
  method_used?: string | null;
  needs_action?: boolean;
  disposition_note?: string | null;
}

export function validatePestFinding(draft: PestFindingDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(draft.station_code ?? '').trim()) {
    errors.station_code = 'Name the station, so the finding can be placed.';
  }
  if (!String(draft.finding ?? '').trim()) {
    errors.finding = 'Record what was found, even if it was no activity.';
  }
  return errors;
}

export async function createPestFinding(
  companyId: string,
  draft: PestFindingDraft,
  createdBy: string | null,
): Promise<PestFinding> {
  const { data, error } = await supabase
    .from('facility_pest_findings')
    .insert({
      company_id: companyId,
      visit_id: draft.visit_id,
      station_code: draft.station_code.trim(),
      location_ref: draft.location_ref?.trim() || null,
      zone_id: draft.zone_id ?? null,
      finding: draft.finding.trim(),
      method_used: draft.method_used?.trim() || null,
      needs_action: draft.needs_action ?? false,
      disposition_note: draft.disposition_note?.trim() || null,
      created_by: createdBy,
    })
    .select(PEST_FINDING_COLUMNS)
    .single();
  if (error) {
    logger.error('[facility] could not record a pest finding', { error: error.message });
    throw new Error(describePestError(error.message).message);
  }
  return data as unknown as PestFinding;
}

/**
 *  Mark, or un-mark, a finding as needing action.
 *
 *  Un-marking is allowed while the finding is still open — a mistake
 *  on the day should be correctable — and refused once it has been
 *  closed, because that would turn a recorded corrective action into
 *  a note after the fact. The database enforces both.
 */
export async function setFindingNeedsAction(
  companyId: string,
  findingId: string,
  needsAction: boolean,
): Promise<PestFinding> {
  const { data, error } = await supabase
    .from('facility_pest_findings')
    .update({ needs_action: needsAction })
    .eq('id', findingId)
    .eq('company_id', companyId)
    .select(PEST_FINDING_COLUMNS)
    .single();
  if (error) {
    logger.error('[facility] could not change needs_action', { error: error.message });
    throw new Error(describePestError(error.message).message);
  }
  return data as unknown as PestFinding;
}

/**
 *  Close a finding with a note.
 *
 *  Only legitimate for a finding that does NOT need action. One that
 *  does is refused by the database, and `canCloseWithNote` below is
 *  what the UI uses to say so before the attempt rather than after.
 */
export async function resolveFinding(
  companyId: string,
  findingId: string,
  resolvedBy: string,
  note: string,
  /**
   *  The completed action that closes it, where one is required.
   *
   *  Added with 20261209000000. The closure is a SINGLE UPDATE that
   *  sets the link and the resolution together, because the trigger
   *  checks them as one state: setting `resolved_at` first and the
   *  link afterwards would be refused, and setting the link first
   *  would leave a closed-looking row for the moment in between.
   */
  correctiveTaskId?: string | null,
): Promise<PestFinding> {
  const { data, error } = await supabase
    .from('facility_pest_findings')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution_note: note.trim() || null,
      ...(correctiveTaskId ? { corrective_task_id: correctiveTaskId } : {}),
    })
    .eq('id', findingId)
    .eq('company_id', companyId)
    .select(PEST_FINDING_COLUMNS)
    .single();
  if (error) {
    logger.error('[facility] could not resolve a pest finding', { error: error.message });
    throw new Error(describePestError(error.message).message);
  }
  return data as unknown as PestFinding;
}

/**
 *  THE RULE, stated once for the UI.
 *
 *  A finding marked as needing action may not be closed by a note.
 *  Until a corrective task can be named it cannot be closed at all,
 *  so the UI disables the control and explains why instead of
 *  offering an action that the database will refuse.
 */
export function canCloseWithNote(f: PestFinding): boolean {
  if (f.resolved_at) return false;
  if (!f.needs_action) return true;
  return f.corrective_task_id != null;
}

/** Why a finding cannot be closed, in words a reader can act on. */
export function whyNotCloseable(f: PestFinding): string | null {
  if (f.resolved_at) return 'This finding is already closed.';
  if (!f.needs_action) return null;
  if (f.corrective_task_id != null) return null;
  return 'A finding marked as needing action cannot be closed by a note. It needs a '
    + 'corrective action task with an owner and a due date, and this product has no '
    + 'task register yet — so it stays open.';
}

export function describePestError(raw: string): { code: string; message: string } {
  const text = String(raw ?? '');
  if (text.includes('PEST_FINDING_NEEDS_CORRECTIVE_TASK')) {
    return {
      code: 'PEST_FINDING_NEEDS_CORRECTIVE_TASK',
      message:
        'A finding marked as needing action cannot be closed by a note — it needs a '
        + 'corrective action task with an owner and a due date.',
    };
  }
  if (text.includes('PEST_FINDING_ALREADY_ACTIONED')) {
    return {
      code: 'PEST_FINDING_ALREADY_ACTIONED',
      message:
        'This finding has already been closed as needing action, so that cannot now be '
        + 'undone. Record a new finding instead.',
    };
  }
  if (text.includes('PEST_VISIT_WRONG_COMPANY') || text.includes('PEST_VISIT_NOT_FOUND')) {
    return {
      code: 'PEST_VISIT_NOT_FOUND',
      message: 'No visit of this company has that id.',
    };
  }
  if (text.includes('PEST_PROVIDER_WRONG_COMPANY')
      || text.includes('PEST_PROVIDER_NOT_FOUND')) {
    return {
      code: 'PEST_PROVIDER_NOT_FOUND',
      message: 'No pest control provider of this company has that id.',
    };
  }
  if (text.includes('facility_pest_finding_station_chk')) {
    return { code: 'STATION_REQUIRED', message: 'Name the station the finding belongs to.' };
  }
  if (text.includes('facility_pest_finding_text_chk')) {
    return { code: 'FINDING_REQUIRED', message: 'Record what was found.' };
  }
  if (text.includes('facility_pest_finding_resolved_pair_chk')
      || text.includes('facility_pest_visit_checked_pair_chk')) {
    return {
      code: 'ATTRIBUTION_REQUIRED',
      message: 'A date and the person it belongs to have to be recorded together.',
    };
  }
  //  Falls through to the shared facility translator, then to the raw
  //  text — an unknown code is reported rather than flattened.
  return describeFacilityError(text);
}

/** FL-13's "needs action, still open" count, for the tab badge. */
export function openActionCount(rows: PestVisitRow[]): number {
  return rows.reduce((n, r) => n + Number(r.open_action_count ?? 0), 0);
}
