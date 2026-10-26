/**
 * Cleaning — FL-09.
 *
 * Two read models and one write, behind the page W6·29 calls
 * "Cleaning": the DEEP CLEANING SCHEDULE with its overdue alerting,
 * and RECENT CLEANING RECORDS with the fields FL-09 attributes to
 * PRD G3.6 — date, operator, method, chemicals, contact time, line or
 * zone.
 *
 * ── WHY THE SCHEDULE COUNTS VERIFIED CLEANS ──
 *
 * FL-09 draws both tables on one screen, and they contradict each
 * other unless one rule holds. Its schedule says Granulation room G2
 * was last deep cleaned on 15 Sep and is "Overdue · 6 days"; its
 * records table, directly beneath, shows a deep clean of G2 finished
 * 21 Oct 08:05, "Awaiting Grace Eze".
 *
 * A deep clean was performed and the schedule still reports overdue.
 * FL-08 states the same rule in words: "The overdue alert clears when
 * Grace Eze verifies."
 *
 * The rule lives in `facility_deep_clean_schedule`, not here. This
 * module does not recompute it, so a client cannot disagree with the
 * register about whether a zone is overdue — the same reasoning that
 * keeps `outcome` in the database.
 *
 * ── WHAT IS NOT DECIDED HERE ──
 *
 * No rule that a verifier must differ from the operator. FL-08 says
 * "Supervisor, after you save" and every row FL-09 draws names two
 * people, but the design states no constraint and the product has no
 * supervisor role to bind one to. Recorded as an open decision; the
 * SQL suite asserts the absence so adding it stays a decision.
 */
import { supabase } from '../supabase';
import { logger } from '../logger';
import { FREQUENCY_LABELS, type FacilityFrequency } from './facilityLogService';

/** The three cleaning types FL-09's records table draws. */
export type CleaningType =
  | 'cleaning_routine'
  | 'cleaning_deep'
  | 'cleaning_changeover';

export const CLEANING_TYPE_LABELS: Record<CleaningType, string> = {
  cleaning_routine: 'Routine',
  cleaning_deep: 'Deep',
  cleaning_changeover: 'Changeover',
};

/**
 * FL-09's "EVERY" column prints the period as a noun — "Month",
 * "Week", "Quarter" — where FL-01's register prints the adverb
 * ("Monthly"). Both are the same frequency said two ways, so the
 * label is here and `FREQUENCY_LABELS` is left alone.
 */
export const CLEANING_PERIOD_LABELS: Record<FacilityFrequency, string> = {
  daily: 'Day',
  weekly: 'Week',
  monthly: 'Month',
  quarterly: 'Quarter',
};

export type DeepCleanStatus =
  | 'overdue'
  | 'due_soon'
  | 'on_schedule'
  | 'never_cleaned';

export interface DeepCleanRow {
  schedule_id: string;
  zone_id: string;
  zone_name: string;
  zone_grade: string | null;
  frequency: FacilityFrequency;
  description: string;
  last_cleaned_at: string | null;
  last_reference: string | null;
  last_operator: string | null;
  next_due_on: string | null;
  days_until_due: number | null;
  status: DeepCleanStatus;
}

export interface CleaningRecordRow {
  entry_id: string;
  reference: string | null;
  zone_id: string;
  zone_name: string;
  zone_code: string | null;
  line_ref: string | null;
  log_type: CleaningType;
  cleaning_method: string | null;
  cleaning_agents: string[] | null;
  contact_minutes: number | null;
  started_at: string | null;
  finished_at: string | null;
  recorded_at: string;
  operator_name: string | null;
  verified_at: string | null;
  verifier_name: string | null;
  schedule_id: string | null;
}

/**
 * The window in which a deep clean reads as "due soon" rather than
 * "on schedule".
 *
 * FL-09 CONSTRAINS this and does not state it. Against a today of 21
 * Oct it draws "Due in 3 days" for a schedule due on the 24th, and
 * "On schedule" for ones due in eleven, twelve and twenty days. So
 * the threshold is somewhere from 3 to 10 days, and seven is the
 * choice — named here, passed to the database rather than hidden
 * inside it, and pinned by a test. It is not presented as the
 * design's own number.
 */
export const DUE_SOON_DAYS = 7;

/** What the design constrains the window to, asserted by a test. */
export const DUE_SOON_EVIDENCE = { atLeast: 3, atMost: 10 } as const;

export function describeFacilityCleaningError(message: string): string {
  if (message.includes('FACILITY_VERIFIER_WRONG_COMPANY')) {
    //  Says what was checked rather than guessing which of two causes
    //  applied: under RLS another company's profile is invisible, so
    //  "does not exist" and "belongs to someone else" are the same
    //  observation.
    return 'No person of this company has that id, so the verification was not recorded.';
  }
  if (message.includes('FACILITY_VERIFICATION_IS_FINAL')) {
    return 'This record has already been verified, and a verification cannot be withdrawn or re-timed.';
  }
  if (message.includes('facility_entry_cleaning_shape_chk')) {
    return 'Cleaning details belong to a cleaning record and cannot be added to another kind of reading.';
  }
  if (message.includes('facility_entry_contact_minutes_chk')) {
    return 'Contact time must be more than zero minutes.';
  }
  if (message.includes('facility_entry_clean_window_chk')) {
    return 'A clean cannot finish before it started.';
  }
  if (message.includes('facility_entry_verification_pair_chk')) {
    return 'A verification needs both a person and a time.';
  }
  return message;
}

export async function listDeepCleanSchedule(
  companyId: string,
  dueSoonDays: number = DUE_SOON_DAYS,
): Promise<DeepCleanRow[]> {
  const { data, error } = await supabase.rpc('facility_deep_clean_schedule', {
    p_company_id: companyId,
    p_due_soon_days: dueSoonDays,
  });
  if (error) {
    logger.error('[facility] could not load the deep cleaning schedule', {
      error: error.message,
    });
    throw new Error(describeFacilityCleaningError(error.message));
  }
  return (data ?? []) as unknown as DeepCleanRow[];
}

export async function listCleaningRecords(
  companyId: string,
  limit = 50,
): Promise<CleaningRecordRow[]> {
  const { data, error } = await supabase.rpc('facility_cleaning_records', {
    p_company_id: companyId,
    p_limit: limit,
  });
  if (error) {
    logger.error('[facility] could not load cleaning records', {
      error: error.message,
    });
    throw new Error(describeFacilityCleaningError(error.message));
  }
  return (data ?? []) as unknown as CleaningRecordRow[];
}

export interface CleaningDraft {
  zoneId: string;
  scheduleId: string | null;
  logType: CleaningType;
  method: string;
  agents: string[];
  contactMinutes: number | null;
  lineRef: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  reference: string | null;
}

/**
 * The checks the form can make before asking the database.
 *
 * Every one of these is also enforced by a CHECK constraint, which is
 * where the guarantee lives — this only saves a round trip and puts
 * the message beside the field. A rule enforced ONLY here would be a
 * rule a direct API call does not have to keep.
 */
export function validateCleaningDraft(d: CleaningDraft): string | null {
  if (!d.zoneId) return 'Choose the zone that was cleaned.';
  if (!d.method.trim()) return 'Describe the method used.';
  if (d.contactMinutes !== null && d.contactMinutes <= 0) {
    return 'Contact time must be more than zero minutes.';
  }
  if (d.startedAt && d.finishedAt && d.finishedAt < d.startedAt) {
    return 'A clean cannot finish before it started.';
  }
  return null;
}

export async function recordClean(
  companyId: string,
  d: CleaningDraft,
  recordedBy: string | null,
): Promise<void> {
  const problem = validateCleaningDraft(d);
  if (problem) throw new Error(problem);

  //  `outcome` is not sent. It is derived by a BEFORE trigger, and a
  //  caller that asserted it would be asserting the evidential content
  //  of a GMP record.
  const { error } = await supabase.from('facility_log_entries').insert({
    company_id: companyId,
    zone_id: d.zoneId,
    schedule_id: d.scheduleId,
    log_type: d.logType,
    recorded_at: d.finishedAt ?? new Date().toISOString(),
    recorded_by: recordedBy,
    reference: d.reference?.trim() || null,
    cleaning_method: d.method.trim(),
    cleaning_agents: d.agents.length ? d.agents : null,
    contact_minutes: d.contactMinutes,
    line_ref: d.lineRef?.trim() || null,
    started_at: d.startedAt,
    finished_at: d.finishedAt,
  });
  if (error) {
    logger.error('[facility] could not record the clean', { error: error.message });
    throw new Error(describeFacilityCleaningError(error.message));
  }
}

/**
 * FL-09's "Awaiting Grace Eze" becoming "Grace Eze ✓".
 *
 * Once written this cannot be withdrawn — the database refuses it —
 * because FL-08 makes a verification the thing that clears an overdue
 * alert, and an alert that silently came back would leave no record
 * of why.
 */
export async function verifyCleaningRecord(
  entryId: string,
  verifierId: string,
): Promise<void> {
  const { error } = await supabase
    .from('facility_log_entries')
    .update({ verified_by: verifierId, verified_at: new Date().toISOString() })
    .eq('id', entryId);
  if (error) {
    logger.error('[facility] could not verify the cleaning record', {
      error: error.message,
    });
    throw new Error(describeFacilityCleaningError(error.message));
  }
}

/** FL-09's status badge, in the words the design prints. */
export function describeDeepCleanStatus(r: DeepCleanRow): string {
  switch (r.status) {
    case 'overdue': {
      const d = r.days_until_due === null ? null : Math.abs(r.days_until_due);
      return d === null ? 'Overdue' : `Overdue · ${d} ${d === 1 ? 'day' : 'days'}`;
    }
    case 'due_soon': {
      const d = r.days_until_due ?? 0;
      //  "Due today" rather than "Due in 0 days", which reads as a
      //  bug even when it is arithmetically right.
      if (d <= 0) return 'Due today';
      return `Due in ${d} ${d === 1 ? 'day' : 'days'}`;
    }
    case 'never_cleaned':
      //  Not "on schedule": nothing has been verified against this
      //  schedule, so it has passed nothing. The same distinction
      //  FL-01 draws as "Not sampled".
      return 'Never deep cleaned';
    default:
      return 'On schedule';
  }
}

/** FL-09's "15 Sep · CR-2026-0302 · Sadiq Musa". */
export function describeLastClean(r: DeepCleanRow): string {
  if (!r.last_cleaned_at) return 'No verified deep clean on record';
  const when = new Date(r.last_cleaned_at).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
  return [when, r.last_reference, r.last_operator].filter(Boolean).join(' · ');
}

/** FL-09's "Deep · wipe down, top to bottom". */
export function describeTypeAndMethod(r: CleaningRecordRow): string {
  const type = CLEANING_TYPE_LABELS[r.log_type] ?? r.log_type;
  return r.cleaning_method ? `${type} · ${r.cleaning_method}` : type;
}

/** FL-09's "G2 · TL-1", falling back to the zone alone. */
export function describeZoneAndLine(r: CleaningRecordRow): string {
  const zone = r.zone_code || r.zone_name;
  return r.line_ref ? `${zone} · ${r.line_ref}` : zone;
}

export interface CleaningSummary {
  overdue: number;
  dueSoon: number;
  neverCleaned: number;
  awaitingVerification: number;
}

export function summariseCleaning(
  schedule: DeepCleanRow[],
  records: CleaningRecordRow[],
): CleaningSummary {
  return {
    overdue: schedule.filter((r) => r.status === 'overdue').length,
    dueSoon: schedule.filter((r) => r.status === 'due_soon').length,
    neverCleaned: schedule.filter((r) => r.status === 'never_cleaned').length,
    awaitingVerification: records.filter((r) => r.verified_at === null).length,
  };
}

/**
 * The period label FL-09 prints in its "EVERY" column, with the
 * register's own label as the fallback so an unknown frequency prints
 * something rather than nothing.
 */
export function describePeriod(f: FacilityFrequency): string {
  return CLEANING_PERIOD_LABELS[f] ?? FREQUENCY_LABELS[f] ?? f;
}
