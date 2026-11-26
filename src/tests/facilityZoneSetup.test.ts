/**
 * Facility logs, part 2 — setting a zone up (FL-02).
 *
 * The register built in part 1 can only ever be as populated as the
 * zones behind it, and until this screen existed there was no way to
 * create one. These tests cover the client half: the draft validators,
 * the write payloads, and the refusals the database sends back.
 *
 * Two of them are the point of the file:
 *
 *   - `createZone` must not let a form nominate a company. The
 *     company_id comes from the caller's profile at the call site, and
 *     a test that only checked the happy path would not notice if a
 *     later refactor started reading it from the draft.
 *   - the validators must mirror the triggers in 20261205000000 rather
 *     than replace them. They exist so a mistake is caught while the
 *     field is focused; `supabase/tests/facility_zone_setup_test.sql`
 *     holds the enforcement with 33 assertions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const insert = vi.fn();
const update = vi.fn();
const single = vi.fn();
const eq = vi.fn();
const rpc = vi.fn();

vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    insert: (...a: unknown[]) => { insert(...a); return chain; },
    update: (...a: unknown[]) => { update(...a); return chain; },
    select: () => chain,
    single: () => single(),
    eq: (...a: unknown[]) => { eq(...a); return chain; },
    order: () => chain,
    limit: () => chain,
  });
  return { supabase: { from: vi.fn(() => chain), rpc: (...a: unknown[]) => rpc(...a) } };
});

import {
  validateZoneDraft, validateScheduleDraft,
  createZone, updateZone, setZoneActive,
  createSchedule, updateSchedule, setScheduleActive,
  listSiteOptions, describeFacilityError,
  type ZoneDraft, type ScheduleDraft,
} from '../lib/facility/facilityLogService';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261205000000_facility_zone_setup.sql'),
  'utf8',
);

const zoneDraft = (over: Partial<ZoneDraft> = {}): ZoneDraft => ({
  site_id: 'site-1',
  name: 'Granulation suite',
  ...over,
});

const scheduleDraft = (over: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  zone_id: 'zone-1',
  log_type: 'environmental_air',
  description: 'Air · settle plates, 4 positions',
  frequency: 'daily',
  ...over,
});

beforeEach(() => {
  insert.mockClear(); update.mockClear(); single.mockClear();
  eq.mockClear(); rpc.mockClear();
  single.mockResolvedValue({ data: { id: 'z9', name: 'Granulation suite' }, error: null });
  rpc.mockResolvedValue({ data: [], error: null });
});

describe('validateZoneDraft', () => {
  it('accepts the minimum FL-02 asks for', () => {
    expect(validateZoneDraft(zoneDraft())).toEqual({});
  });

  it('requires a site, because a zone belongs to one', () => {
    expect(validateZoneDraft(zoneDraft({ site_id: '' })).site_id).toBeTruthy();
  });

  //  NOT NULL does not catch these: '' and '   ' are both values.
  it.each(['', '   ', '\t'])('rejects a blank name (%j)', (name) => {
    expect(validateZoneDraft(zoneDraft({ name })).name).toBeTruthy();
  });

  it('keeps a name that merely has padding', () => {
    //  The service trims on the way out, so this is valid input.
    expect(validateZoneDraft(zoneDraft({ name: '  G2  ' }))).toEqual({});
  });

  it.each([
    ['a negative owner alert', { alert_owner_after_days: -1 }],
    ['a negative QA escalation', { escalate_to_qa_after_days: -3 }],
    ['a fractional day count', { alert_owner_after_days: 1.5 }],
  ])('rejects %s', (_label, over) => {
    expect(Object.keys(validateZoneDraft(zoneDraft(over)))).not.toHaveLength(0);
  });

  it('allows zero days, which means "as soon as it is overdue"', () => {
    expect(validateZoneDraft(zoneDraft({
      alert_owner_after_days: 0, escalate_to_qa_after_days: 0,
    }))).toEqual({});
  });

  /*
   *  FL-02 draws the owner alert above the QA escalation and the
   *  column defaults read that way, but the design states no rule
   *  about their order and a company that wants QA told first is not
   *  obviously wrong. So this is deliberately NOT an error — and this
   *  test is here so that inventing the rule later has to be a
   *  decision rather than a slip.
   */
  it('does not impose an order between the two escalation fields', () => {
    expect(validateZoneDraft(zoneDraft({
      alert_owner_after_days: 5, escalate_to_qa_after_days: 1,
    }))).toEqual({});
  });
});

describe('validateScheduleDraft', () => {
  it('accepts a cleaning test with no limits at all', () => {
    //  FL-01 draws these rows: a clean is done or not done, not
    //  measured. Requiring limits would contradict the design.
    expect(validateScheduleDraft(scheduleDraft({
      log_type: 'cleaning_routine', description: 'Routine clean',
    }))).toEqual({});
  });

  it('requires a description, which is the register row label', () => {
    expect(validateScheduleDraft(scheduleDraft({ description: '  ' })).description)
      .toBeTruthy();
  });

  it('refuses an action limit below its alert limit', () => {
    const errors = validateScheduleDraft(scheduleDraft({
      alert_limit: 50, action_limit: 25, result_unit: 'CFU',
    }));
    expect(errors.action_limit).toBeTruthy();
  });

  it('accepts an action limit equal to its alert limit', () => {
    //  The database CHECK is `action_limit >= alert_limit`, so equal
    //  is allowed and the client must not be stricter than the column.
    expect(validateScheduleDraft(scheduleDraft({
      alert_limit: 25, action_limit: 25, result_unit: 'CFU',
    }))).toEqual({});
  });

  it('requires a unit once either limit is set', () => {
    expect(validateScheduleDraft(scheduleDraft({ alert_limit: 25 })).result_unit)
      .toBeTruthy();
    expect(validateScheduleDraft(scheduleDraft({ action_limit: 50 })).result_unit)
      .toBeTruthy();
  });

  it('needs no unit when neither limit is set', () => {
    expect(validateScheduleDraft(scheduleDraft({ result_unit: '' }))).toEqual({});
  });
});

describe('createZone', () => {
  it('takes company_id from the caller, never from the draft', async () => {
    await createZone('company-real', {
      ...zoneDraft(),
      //  A form that could set this would be a tenancy hole. The type
      //  does not allow it; this proves the runtime does not either.
      ...({ company_id: 'company-attacker' } as Partial<ZoneDraft>),
    }, 'user-1');
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.company_id).toBe('company-real');
  });

  it('trims the text fields and nulls the empty ones', async () => {
    await createZone('c1', zoneDraft({
      name: '  G2  ', code: '  GR-02 ', grade: '   ', line_ref: '',
      cleaning_sop_ref: ' SOP-CLN-014 ',
    }), 'user-1');
    const p = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(p.name).toBe('G2');
    expect(p.code).toBe('GR-02');
    //  '' and '   ' become null rather than being stored as blanks —
    //  otherwise "no grade" and "a grade of three spaces" differ.
    expect(p.grade).toBeNull();
    expect(p.line_ref).toBeNull();
    expect(p.cleaning_sop_ref).toBe('SOP-CLN-014');
  });

  it('defaults the two escalation fields the way the columns do', async () => {
    await createZone('c1', zoneDraft(), null);
    const p = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(p.alert_owner_after_days).toBe(0);
    expect(p.escalate_to_qa_after_days).toBe(1);
  });

  it('records who created it, and tolerates not knowing', async () => {
    await createZone('c1', zoneDraft(), null);
    expect((insert.mock.calls[0][0] as Record<string, unknown>).created_by).toBeNull();
  });

  it('reports a refusal in the words the reader needs', async () => {
    single.mockResolvedValueOnce({
      data: null, error: { message: 'FACILITY_SITE_WRONG_COMPANY' },
    });
    await expect(createZone('c1', zoneDraft(), 'u1')).rejects.toThrow(/another company/i);
  });
});

describe('updateZone', () => {
  it('sends only the fields it was given', async () => {
    await updateZone('c1', 'z1', { grade: 'Grade C' });
    const patch = update.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch)).toEqual(['grade']);
  });

  it('can clear an optional field without clearing the others', async () => {
    await updateZone('c1', 'z1', { line_ref: '' });
    const patch = update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toEqual({ line_ref: null });
  });

  it('scopes the update by company as well as by id', async () => {
    //  RLS already confines the row. Stating it again means a wrong id
    //  cannot silently match nothing and read as success.
    await updateZone('c1', 'z1', { grade: 'Grade D' });
    expect(eq.mock.calls).toEqual([['id', 'z1'], ['company_id', 'c1']]);
  });

  it('never sends company_id in the patch', async () => {
    await updateZone('c1', 'z1', {
      ...({ company_id: 'c2' } as Partial<ZoneDraft>), grade: 'Grade D',
    });
    expect(update.mock.calls[0][0]).not.toHaveProperty('company_id');
  });
});

describe('retiring rather than deleting', () => {
  it('retires a zone by flipping is_active', async () => {
    await setZoneActive('c1', 'z1', false);
    expect(update.mock.calls[0][0]).toEqual({ is_active: false });
  });

  it('retires a schedule the same way', async () => {
    await setScheduleActive('c1', 's1', false);
    expect(update.mock.calls[0][0]).toEqual({ is_active: false });
  });

  /*
   *  This is why the UI offers no delete, so it is asserted rather
   *  than left as a comment: entries cascade from a zone, and a delete
   *  would take the GMP records with it.
   */
  it('is justified by the FK rules the migration relies on', () => {
    const part1 = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261204000000_facility_logs.sql'),
      'utf8',
    );
    const zoneFk = /zone_id\s+uuid NOT NULL REFERENCES public\.facility_zones \(id\) ON DELETE CASCADE/;
    const schedFk = /schedule_id\s+uuid REFERENCES public\.facility_zone_schedules \(id\) ON DELETE SET NULL/;
    expect(part1).toMatch(zoneFk);
    expect(part1).toMatch(schedFk);
  });
});

describe('createSchedule', () => {
  it('sends the caller company and the zone it was given', async () => {
    await createSchedule('c1', scheduleDraft());
    const p = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(p.company_id).toBe('c1');
    expect(p.zone_id).toBe('zone-1');
  });

  it('sends null rather than an empty due time', async () => {
    await createSchedule('c1', scheduleDraft({ due_time: '' }));
    expect((insert.mock.calls[0][0] as Record<string, unknown>).due_time).toBeNull();
  });

  it('keeps a limit of zero, which is a real limit', async () => {
    //  `?? null` would keep 0 but `|| null` would not, and a zero
    //  action limit means "any detection is a breach".
    await createSchedule('c1', scheduleDraft({ action_limit: 0, result_unit: 'CFU' }));
    expect((insert.mock.calls[0][0] as Record<string, unknown>).action_limit).toBe(0);
  });
});

describe('updateSchedule', () => {
  it('can clear a limit explicitly', async () => {
    await updateSchedule('c1', 's1', { alert_limit: null });
    expect(update.mock.calls[0][0]).toEqual({ alert_limit: null });
  });

  it('scopes by company as well as id', async () => {
    await updateSchedule('c1', 's1', { frequency: 'weekly' });
    expect(eq.mock.calls).toEqual([['id', 's1'], ['company_id', 'c1']]);
  });
});

describe('listSiteOptions', () => {
  it('goes through the RPC with the company as its argument', async () => {
    await listSiteOptions('c1');
    expect(rpc).toHaveBeenCalledWith('facility_site_options', { p_company_id: 'c1' });
  });
});

describe('the refusals a reader can act on', () => {
  it.each([
    ['FACILITY_SITE_WRONG_COMPANY', /another company/i],
    ['FACILITY_SITE_NOT_FOUND', /no site of this company/i],
    ['FACILITY_SCHEDULE_WRONG_COMPANY', /another company/i],
    ['FACILITY_ZONE_NAME_REQUIRED', /needs a name/i],
    ['FACILITY_SCHEDULE_DESCRIPTION_REQUIRED', /describe what the test is/i],
    ['facility_zones_site_id_name_key', /already has that name/i],
    ['facility_schedule_limits_ordered', /cannot be below/i],
  ])('explains %s', (raw, pattern) => {
    expect(describeFacilityError(raw).message).toMatch(pattern);
  });

  it('passes an unrecognised message through instead of flattening it', () => {
    const out = describeFacilityError('connection terminated unexpectedly');
    expect(out.code).toBe('UNKNOWN');
    expect(out.message).toBe('connection terminated unexpectedly');
  });
});

describe('the migration states the rules it enforces', () => {
  it('attaches both triggers BEFORE insert and update', () => {
    expect(MIGRATION).toMatch(
      /BEFORE INSERT OR UPDATE ON public\.facility_zones/,
    );
    expect(MIGRATION).toMatch(
      /BEFORE INSERT OR UPDATE ON public\.facility_zone_schedules/,
    );
  });

  it('keeps facility_site_options SECURITY INVOKER', () => {
    //  A definer function here would hand over every company's sites.
    const fn = MIGRATION.slice(MIGRATION.indexOf('facility_site_options'));
    expect(fn).toMatch(/SECURITY INVOKER/);
    expect(fn).not.toMatch(/SECURITY DEFINER/);
  });

  it('adds no signature, approval or automatic deviation', () => {
    //  None of these is drawn in W6·29, so none belongs in the
    //  migration. If one appears later it should be because a quality
    //  decision was taken, which would also update this test.
    expect(MIGRATION).not.toMatch(/electronic_signature|signature_id|requires_signature/i);
    expect(MIGRATION).not.toMatch(/INSERT INTO public\.deviations/i);
  });
});
