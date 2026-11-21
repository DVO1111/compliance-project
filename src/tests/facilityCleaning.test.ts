/**
 * FL-09 — the deep cleaning schedule and cleaning records.
 *
 * The rules that matter live in the database and
 * `supabase/tests/facility_cleaning_test.sql` holds them with 54
 * assertions, including the one this feature turns on: a deep clean
 * that has been performed but not verified leaves its schedule
 * overdue.
 *
 * What is tested here is the part the client decides:
 *
 *   - the strings FL-09 prints, which are the whole status column;
 *   - that the client never recomputes overdue, because a client that
 *     disagreed with the register about a GMP obligation would be the
 *     worst available bug;
 *   - the draft validation, which must agree with the CHECK
 *     constraints rather than inventing a second rulebook;
 *   - that the due-soon window is a named choice inside the range the
 *     design constrains it to, and not a number dressed up as the
 *     design's own.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rpc = vi.fn();
const insert = vi.fn();
const update = vi.fn();
const eq = vi.fn();

vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    eq: (...a: unknown[]) => { eq(...a); return chain; },
    order: () => chain,
    limit: () => chain,
    insert: (...a: unknown[]) => { insert(...a); return Promise.resolve({ error: null }); },
    update: (...a: unknown[]) => { update(...a); return chain; },
  });
  return {
    supabase: { from: vi.fn(() => chain), rpc: (...a: unknown[]) => rpc(...a) },
  };
});

vi.mock('../lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  listDeepCleanSchedule, listCleaningRecords, recordClean, verifyCleaningRecord,
  validateCleaningDraft, describeDeepCleanStatus, describeLastClean,
  describeTypeAndMethod, describeZoneAndLine, describePeriod, summariseCleaning,
  describeFacilityCleaningError, CLEANING_TYPE_LABELS, CLEANING_PERIOD_LABELS,
  DUE_SOON_DAYS, DUE_SOON_EVIDENCE,
  type DeepCleanRow, type CleaningRecordRow, type CleaningDraft,
} from '../lib/facility/facilityCleaningService';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261211000000_facility_cleaning.sql'),
  'utf8',
);

//  Prose explains what the migration AVOIDS, so a search of the whole
//  file would match the thing it refuses to do. Stripped, as the pest
//  suite had to be after exactly that mistake.
const SQL_ONLY = MIGRATION
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*--.*$/gm, '');

beforeEach(() => {
  rpc.mockReset();
  insert.mockReset();
  update.mockReset();
  eq.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
});

function sched(over: Partial<DeepCleanRow> = {}): DeepCleanRow {
  return {
    schedule_id: 's1', zone_id: 'z1', zone_name: 'Granulation room G2',
    zone_grade: 'Grade D', frequency: 'monthly', description: 'Deep clean',
    last_cleaned_at: '2026-09-15T06:00:00Z', last_reference: 'CR-2026-0302',
    last_operator: 'Sadiq Musa', next_due_on: '2026-10-15',
    days_until_due: -6, status: 'overdue',
    ...over,
  };
}

function rec(over: Partial<CleaningRecordRow> = {}): CleaningRecordRow {
  return {
    entry_id: 'e1', reference: 'CR-2026-0415', zone_id: 'z1',
    zone_name: 'Granulation room G2', zone_code: 'G2', line_ref: 'TL-1',
    log_type: 'cleaning_deep', cleaning_method: 'wipe down, top to bottom',
    cleaning_agents: ['Hypochlorite 1%', 'IPA 70%'], contact_minutes: 15,
    started_at: '2026-10-21T06:20:00Z', finished_at: '2026-10-21T08:05:00Z',
    recorded_at: '2026-10-21T08:05:00Z', operator_name: 'Yusuf Garba',
    verified_at: null, verifier_name: null, schedule_id: 's1',
    ...over,
  };
}

describe('FL-09 status column', () => {
  it('prints the overdue badge the design draws', () => {
    expect(describeDeepCleanStatus(sched())).toBe('Overdue · 6 days');
  });

  it('prints "due in 3 days" for the micro lab', () => {
    expect(describeDeepCleanStatus(
      sched({ status: 'due_soon', days_until_due: 3 }),
    )).toBe('Due in 3 days');
  });

  it('says "on schedule" where the design does', () => {
    expect(describeDeepCleanStatus(
      sched({ status: 'on_schedule', days_until_due: 11 }),
    )).toBe('On schedule');
  });

  it('never prints "in 0 days", which reads as a bug', () => {
    const s = describeDeepCleanStatus(sched({ status: 'due_soon', days_until_due: 0 }));
    expect(s).toBe('Due today');
    expect(s).not.toMatch(/0 days/);
  });

  it('says day, not days, for one', () => {
    expect(describeDeepCleanStatus(sched({ status: 'due_soon', days_until_due: 1 })))
      .toBe('Due in 1 day');
    expect(describeDeepCleanStatus(sched({ status: 'overdue', days_until_due: -1 })))
      .toBe('Overdue · 1 day');
  });

  it('keeps "never cleaned" distinct from a pass', () => {
    /*
     *  The same distinction FL-01 draws as "Not sampled". A schedule
     *  with nothing verified against it has passed nothing, and
     *  printing "On schedule" would be a claim the data does not
     *  support.
     */
    const s = describeDeepCleanStatus(
      sched({ status: 'never_cleaned', last_cleaned_at: null, next_due_on: null,
              days_until_due: null, last_reference: null, last_operator: null }),
    );
    expect(s).toBe('Never deep cleaned');
    expect(s).not.toMatch(/on schedule/i);
  });

  it('prints the last clean as date · record · operator', () => {
    //  The month abbreviation is the platform's — Node's en-GB gives
    //  "Sept" where the design draws "Sep" — so the ORDER and the
    //  separator are asserted, which is what the design fixes. The
    //  sibling trend and water views print it the same way.
    expect(describeLastClean(sched()))
      .toMatch(/^15 Sept? · CR-2026-0302 · Sadiq Musa$/);
  });

  it('says so rather than printing an empty cell when nothing is on record', () => {
    expect(describeLastClean(sched({ last_cleaned_at: null })))
      .toMatch(/No verified deep clean/);
  });
});

describe('FL-09 records table', () => {
  it('prints type and method the way the design joins them', () => {
    expect(describeTypeAndMethod(rec())).toBe('Deep · wipe down, top to bottom');
    expect(describeTypeAndMethod(rec({
      log_type: 'cleaning_changeover', cleaning_method: 'foam and rinse',
    }))).toBe('Changeover · foam and rinse');
  });

  it('prints the type alone when no method was given', () => {
    expect(describeTypeAndMethod(rec({ cleaning_method: null }))).toBe('Deep');
  });

  it('prints zone and line, and the zone alone where there is no line', () => {
    expect(describeZoneAndLine(rec())).toBe('G2 · TL-1');
    expect(describeZoneAndLine(rec({ line_ref: null }))).toBe('G2');
    //  Falls back to the name, so a zone with no code still prints.
    expect(describeZoneAndLine(rec({ zone_code: null, line_ref: null })))
      .toBe('Granulation room G2');
  });

  it('counts an unverified record as an outstanding obligation', () => {
    const s = summariseCleaning([], [rec(), rec({ entry_id: 'e2', verified_at: '2026-10-21T09:00:00Z' })]);
    expect(s.awaitingVerification).toBe(1);
  });

  it('counts the schedule by status', () => {
    const s = summariseCleaning([
      sched(),
      sched({ schedule_id: 's2', status: 'due_soon' }),
      sched({ schedule_id: 's3', status: 'on_schedule' }),
      sched({ schedule_id: 's4', status: 'never_cleaned' }),
    ], []);
    expect(s).toMatchObject({ overdue: 1, dueSoon: 1, neverCleaned: 1 });
  });
});

describe('the period label', () => {
  it('prints the noun FL-09 prints, not the adverb FL-01 does', () => {
    expect(describePeriod('monthly')).toBe('Month');
    expect(describePeriod('weekly')).toBe('Week');
    expect(describePeriod('quarterly')).toBe('Quarter');
  });

  it('covers every frequency the schedule allows', () => {
    for (const f of ['daily', 'weekly', 'monthly', 'quarterly'] as const) {
      expect(CLEANING_PERIOD_LABELS[f]).toBeTruthy();
    }
  });
});

describe('the due-soon window is a choice, and says so', () => {
  it('sits inside the range FL-09 constrains it to', () => {
    /*
     *  Against a today of 21 Oct the design draws "Due in 3 days" for
     *  a schedule due on the 24th and "On schedule" for ones due in
     *  eleven, twelve and twenty days. So the threshold is at least 3
     *  and at most 10. Any value in that range reproduces FL-09;
     *  nothing outside it does.
     */
    expect(DUE_SOON_DAYS).toBeGreaterThanOrEqual(DUE_SOON_EVIDENCE.atLeast);
    expect(DUE_SOON_DAYS).toBeLessThanOrEqual(DUE_SOON_EVIDENCE.atMost);
  });

  it('is passed to the database rather than hidden inside it', async () => {
    await listDeepCleanSchedule('c1');
    expect(rpc).toHaveBeenCalledWith('facility_deep_clean_schedule', {
      p_company_id: 'c1', p_due_soon_days: DUE_SOON_DAYS,
    });
  });

  it('can be overridden by a caller, which is what makes it a choice', async () => {
    await listDeepCleanSchedule('c1', 14);
    expect(rpc).toHaveBeenCalledWith('facility_deep_clean_schedule', {
      p_company_id: 'c1', p_due_soon_days: 14,
    });
  });
});

describe('the client never decides whether a zone is overdue', () => {
  it('renders the status the database sent, even when it looks wrong', () => {
    /*
     *  THE REGRESSION THIS FILE EXISTS FOR. A deep clean performed
     *  today against a schedule that is overdue still reads overdue,
     *  because it has not been verified. If the client ever
     *  recomputed the status from last_cleaned_at it would "correct"
     *  this row and silently clear a GMP alert.
     */
    const row = sched({ status: 'overdue', days_until_due: -6 });
    expect(describeDeepCleanStatus(row)).toBe('Overdue · 6 days');
  });

  it('computes no due date, window or overdue flag of its own', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/facility/facilityCleaningService.ts'), 'utf8',
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    //  No date arithmetic: the due date and the day count both arrive
    //  from `facility_deep_clean_schedule`.
    expect(code).not.toMatch(/setDate|setMonth|addMonths|86400000|24 \* 60 \* 60/);
    expect(code).not.toMatch(/FREQUENCY_DAYS/);
  });

  it('sends no outcome when recording a clean', async () => {
    await recordClean('c1', {
      zoneId: 'z1', scheduleId: 's1', logType: 'cleaning_deep',
      method: 'wipe down', agents: ['IPA 70%'], contactMinutes: 15,
      lineRef: 'TL-1', startedAt: null, finishedAt: null, reference: 'CR-1',
    }, 'u1');
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    //  Derived by a BEFORE trigger; a caller that asserted it would be
    //  asserting the evidential content of a GMP record.
    expect(payload).not.toHaveProperty('outcome');
    expect(payload.cleaning_agents).toEqual(['IPA 70%']);
    expect(payload.log_type).toBe('cleaning_deep');
  });

  it('sends no verification when recording a clean', async () => {
    await recordClean('c1', {
      zoneId: 'z1', scheduleId: null, logType: 'cleaning_routine',
      method: 'mop', agents: [], contactMinutes: null,
      lineRef: null, startedAt: null, finishedAt: null, reference: null,
    }, 'u1');
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    //  A clean is not verified by the person recording it, and a
    //  record that arrived pre-verified would make the verification
    //  step meaningless.
    expect(payload).not.toHaveProperty('verified_by');
    expect(payload).not.toHaveProperty('verified_at');
  });

  it('sends an empty chemical list as null rather than an empty array', async () => {
    await recordClean('c1', {
      zoneId: 'z1', scheduleId: null, logType: 'cleaning_routine',
      method: 'mop', agents: [], contactMinutes: null,
      lineRef: null, startedAt: null, finishedAt: null, reference: null,
    }, 'u1');
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.cleaning_agents).toBeNull();
  });

  it('writes both halves of a verification together', async () => {
    await verifyCleaningRecord('e1', 'u9');
    const payload = update.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.verified_by).toBe('u9');
    expect(payload.verified_at).toBeTruthy();
    expect(eq).toHaveBeenCalledWith('id', 'e1');
  });
});

describe('the screen does not contradict itself', () => {
  it('counts the deep-clean tile from the schedule, not the register', () => {
    /*
     *  FOUND BY RENDERING, NOT BY READING. FL-01's tile read "0 deep
     *  cleans overdue" while FL-09's table beneath it read "Overdue ·
     *  6 days" for the same zone, because the two answer different
     *  questions: the register's view of a deep clean is its last
     *  ENTRY, FL-09's is its last VERIFIED entry.
     *
     *  The tile now comes from the deep cleaning schedule, which is
     *  the authority on the question it asks. The rest of
     *  `summarise` is untouched.
     */
    const page = readFileSync(
      join(process.cwd(), 'src/components/Facility/FacilityLogsPage.tsx'), 'utf8',
    );
    expect(page).toMatch(/listDeepCleanSchedule/);
    expect(page).toMatch(/deepCleanOverdue:\s*deepClean\.filter/);
  });
});

describe('draft validation agrees with the constraints', () => {
  const base: CleaningDraft = {
    zoneId: 'z1', scheduleId: null, logType: 'cleaning_routine',
    method: 'mop and wipe', agents: [], contactMinutes: 5,
    lineRef: null, startedAt: null, finishedAt: null, reference: null,
  };

  it('accepts a well-formed draft', () => {
    expect(validateCleaningDraft(base)).toBeNull();
  });

  it('requires a zone', () => {
    expect(validateCleaningDraft({ ...base, zoneId: '' })).toMatch(/zone/i);
  });

  it('requires a method, and will not take blank space for one', () => {
    expect(validateCleaningDraft({ ...base, method: '   ' })).toMatch(/method/i);
  });

  it('refuses a contact time of zero, as the CHECK does', () => {
    //  Zero contact is not a short contact: the chemical never
    //  touched the surface.
    expect(validateCleaningDraft({ ...base, contactMinutes: 0 })).toMatch(/zero/i);
    expect(validateCleaningDraft({ ...base, contactMinutes: -5 })).toBeTruthy();
    expect(SQL_ONLY).toMatch(/contact_minutes\s+IS\s+NULL\s+OR\s+contact_minutes\s*>\s*0/i);
  });

  it('refuses a clean that finished before it started, as the CHECK does', () => {
    expect(validateCleaningDraft({
      ...base, startedAt: '2026-10-21T08:00', finishedAt: '2026-10-21T06:00',
    })).toMatch(/finish/i);
    expect(SQL_ONLY).toMatch(/finished_at\s*>=\s*started_at/i);
  });

  it('allows no contact time at all, which is not the same as zero', () => {
    expect(validateCleaningDraft({ ...base, contactMinutes: null })).toBeNull();
  });
});

describe('refusals are explained in the reader\'s terms', () => {
  it('says what was actually checked about a verifier', () => {
    const m = describeFacilityCleaningError('FACILITY_VERIFIER_WRONG_COMPANY');
    //  Under RLS another company's profile is invisible, so "does not
    //  exist" and "belongs to someone else" are one observation. The
    //  message must not claim to distinguish them.
    expect(m).toMatch(/no person of this company/i);
    expect(m).not.toMatch(/another company|other company/i);
  });

  it('explains that a verification is final', () => {
    expect(describeFacilityCleaningError('FACILITY_VERIFICATION_IS_FINAL'))
      .toMatch(/cannot be withdrawn/i);
  });

  it('passes an unrecognised message through rather than inventing one', () => {
    expect(describeFacilityCleaningError('some other failure')).toBe('some other failure');
  });
});

describe('the migration', () => {
  it('counts only verified deep cleans towards the schedule', () => {
    //  The rule FL-09's own two tables prove. Mutation-tested: without
    //  it, seven SQL assertions fail.
    expect(SQL_ONLY).toMatch(/verified_at\s+IS\s+NOT\s+NULL/);
  });

  it('uses calendar intervals for the due date, not a day count', () => {
    /*
     *  01 Oct + 30 days is 31 Oct and the design draws 01 Nov; 02 Aug
     *  + 91 days is 01 Nov and the design draws 02 Nov. A due DATE is
     *  a calendar question.
     */
    expect(SQL_ONLY).toMatch(/interval '1 month'/);
    expect(SQL_ONLY).toMatch(/interval '3 months'/);
    expect(SQL_ONLY).not.toMatch(/interval '30 days'/);
    expect(SQL_ONLY).not.toMatch(/interval '91 days'/);
  });

  it('keeps both read functions SECURITY INVOKER', () => {
    expect(SQL_ONLY).not.toMatch(/SECURITY DEFINER/);
  });

  it('invents no four-eyes rule', () => {
    /*
     *  Every row FL-09 draws names two different people and FL-08 says
     *  "Supervisor, after you save", but the design states no
     *  constraint and the product has no supervisor role to bind one
     *  to. Asserted as an absence so adding it stays a decision
     *  somebody takes.
     */
    expect(SQL_ONLY).not.toMatch(/verified_by\s*(<>|!=|IS DISTINCT FROM)\s*NEW\.recorded_by/i);
    expect(SQL_ONLY).not.toMatch(/FOUR_EYES|SELF_VERIF/i);
  });

  it('creates no CAPA and no deviation from an overdue clean', () => {
    expect(SQL_ONLY).not.toMatch(/capa_records/i);
    expect(SQL_ONLY).not.toMatch(/INSERT INTO public\.deviations/i);
  });

  it('does not widen the schedule vocabulary', () => {
    /*
     *  A changeover clean follows a product changeover, not a
     *  frequency, so it can be recorded and never scheduled. The
     *  widened CHECK must name facility_log_entries and nothing else.
     */
    const widened = SQL_ONLY.match(/ADD CONSTRAINT facility_log_entries_log_type_check[\s\S]*?\);/);
    expect(widened).not.toBeNull();
    expect(widened![0]).toMatch(/cleaning_changeover/);
    expect(SQL_ONLY).not.toMatch(/facility_zone_schedules[\s\S]{0,400}cleaning_changeover/);
  });

  it('introduces no permission key and no new section', () => {
    expect(SQL_ONLY).not.toMatch(/section_permissions/i);
    expect(SQL_ONLY).not.toMatch(/canView|canAct/);
  });

  it('builds no second schedule table', () => {
    //  FL-09's footnote: the deep cleaning schedule shares FL-02's
    //  rule, so it is a facility_zone_schedules row and not a new
    //  entity with its own overdue logic.
    expect(SQL_ONLY).not.toMatch(/CREATE TABLE[^;]*cleaning_schedule/i);
  });

  it('names all three cleaning types in the records read model', () => {
    expect(CLEANING_TYPE_LABELS.cleaning_routine).toBe('Routine');
    expect(CLEANING_TYPE_LABELS.cleaning_deep).toBe('Deep');
    expect(CLEANING_TYPE_LABELS.cleaning_changeover).toBe('Changeover');
  });
});

describe('the read functions ask the database for the right thing', () => {
  it('asks for cleaning records with a bounded list', async () => {
    await listCleaningRecords('c1', 25);
    expect(rpc).toHaveBeenCalledWith('facility_cleaning_records', {
      p_company_id: 'c1', p_limit: 25,
    });
  });

  it('returns an empty list rather than throwing when there is nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(listDeepCleanSchedule('c1')).resolves.toEqual([]);
    await expect(listCleaningRecords('c1')).resolves.toEqual([]);
  });

  it('turns a database refusal into the reader\'s words', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'FACILITY_VERIFICATION_IS_FINAL' } });
    await expect(listDeepCleanSchedule('c1')).rejects.toThrow(/cannot be withdrawn/i);
  });
});
