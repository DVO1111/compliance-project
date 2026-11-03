/**
 * Facility logs, part 4 — pest control (FL-12 / FL-13 / FL-14).
 *
 * The enforcement lives in the database and
 * `supabase/tests/facility_pest_control_test.sql` holds it with 38
 * assertions, C2 being the one that matters: a finding marked as
 * needing action cannot be closed by a resolution note, however
 * detailed and well-meant the note is.
 *
 * What is tested here is the client's half of that rule —
 * `canCloseWithNote` and `whyNotCloseable`. They decide whether the
 * UI offers a close button at all, and getting them wrong means
 * offering an action the database will refuse, which is how a product
 * teaches people that its refusals are noise.
 *
 * The second half of W6·29's sentence — "it becomes a task with an
 * owner and a due date" — is NOT implemented, and the last describe
 * block pins the reason so it stays a recorded decision rather than
 * becoming folklore.
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
  });
  return { supabase: { from: vi.fn(() => chain), rpc: (...a: unknown[]) => rpc(...a) } };
});

import {
  canCloseWithNote, whyNotCloseable, validatePestFinding, describePestError,
  createPestFinding, resolveFinding, setFindingNeedsAction,
  listPestVisits, openActionCount,
  type PestFinding, type PestVisitRow,
} from '../lib/facility/facilityLogService';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261207000000_facility_pest_control.sql'),
  'utf8',
);

/*
 *  The migration's header explains at length WHY it does not use
 *  `capa_actions`, and why it does not widen
 *  `facility_zone_schedules.frequency`. So a plain search of the file
 *  for those names matches the prose that rules them out — which is
 *  the opposite of what the assertion means.
 *
 *  Everything below that asks "does this migration do X" therefore
 *  searches the EXECUTABLE SQL with the comments stripped.
 */
const SQL_ONLY = MIGRATION
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

function finding(over: Partial<PestFinding> = {}): PestFinding {
  return {
    id: 'f1', company_id: 'c1', visit_id: 'v1',
    station_code: 'BS-07', location_ref: 'Warehouse W1 · dock door', zone_id: null,
    finding: 'Rodent droppings; 60% of bait taken',
    method_used: 'Bait replaced', needs_action: false, disposition_note: null,
    corrective_task_id: null, resolved_at: null, resolved_by: null, resolution_note: null,
    ...over,
  };
}

beforeEach(() => {
  insert.mockClear(); update.mockClear(); single.mockClear();
  eq.mockClear(); rpc.mockClear();
  single.mockResolvedValue({ data: finding(), error: null });
  rpc.mockResolvedValue({ data: [], error: null });
});

describe('the closure rule, as the UI sees it', () => {
  it('lets an ordinary open finding close with a note', () => {
    //  FL-13's "3 flies on a glue board · Normal level · no action".
    //  Requiring a corrective action here would be absurd.
    const f = finding({ needs_action: false });
    expect(canCloseWithNote(f)).toBe(true);
    expect(whyNotCloseable(f)).toBeNull();
  });

  /*
   *  THE ASSERTION THAT MATTERS. W6·29: "A finding marked as needing
   *  action can't be closed by a note." If this returned true the UI
   *  would offer a close button that the database refuses — and a
   *  product whose buttons fail teaches people to ignore its errors.
   */
  it('refuses to offer a close on a finding needing action', () => {
    const f = finding({ needs_action: true });
    expect(canCloseWithNote(f)).toBe(false);
  });

  it('explains why, rather than just disabling the control', () => {
    const why = whyNotCloseable(finding({ needs_action: true }));
    expect(why).toMatch(/cannot be closed by a note/i);
    //  And names the actual obstacle, which is that the task register
    //  does not exist — not a vague "not allowed".
    expect(why).toMatch(/task register/i);
  });

  it('would allow the close once a corrective task existed', () => {
    //  Nothing can set this today. The branch is here so that when a
    //  task register arrives, the rule already works rather than
    //  needing to be rediscovered.
    const f = finding({ needs_action: true, corrective_task_id: 'task-1' });
    expect(canCloseWithNote(f)).toBe(true);
    expect(whyNotCloseable(f)).toBeNull();
  });

  it('offers no close on an already-closed finding', () => {
    const f = finding({ resolved_at: '2026-10-21T09:00:00Z', resolved_by: 'u1' });
    expect(canCloseWithNote(f)).toBe(false);
    expect(whyNotCloseable(f)).toMatch(/already closed/i);
  });

  it('treats a closed actioned finding as closed, not as needing a task', () => {
    const f = finding({
      needs_action: true, corrective_task_id: 'task-1',
      resolved_at: '2026-10-21T09:00:00Z', resolved_by: 'u1',
    });
    expect(canCloseWithNote(f)).toBe(false);
    expect(whyNotCloseable(f)).toMatch(/already closed/i);
  });
});

describe('validatePestFinding', () => {
  it('accepts the minimum FL-13 records', () => {
    expect(validatePestFinding({
      visit_id: 'v1', station_code: 'BS-03', finding: 'No activity',
    })).toEqual({});
  });

  it('requires a station, so a finding has a place', () => {
    expect(validatePestFinding({
      visit_id: 'v1', station_code: '  ', finding: 'No activity',
    }).station_code).toBeTruthy();
  });

  it('requires a finding even when nothing was found', () => {
    //  "No activity" IS a finding, and FL-13 records it on three
    //  stations. A blank row records nothing at all.
    expect(validatePestFinding({
      visit_id: 'v1', station_code: 'BS-03', finding: '',
    }).finding).toBeTruthy();
  });
});

describe('createPestFinding', () => {
  it('takes company_id from the caller, never from the draft', async () => {
    await createPestFinding('company-real', {
      visit_id: 'v1', station_code: 'BS-07', finding: 'droppings',
      ...({ company_id: 'company-attacker' } as object),
    }, 'u1');
    expect((insert.mock.calls[0][0] as Record<string, unknown>).company_id)
      .toBe('company-real');
  });

  it('defaults needs_action to false rather than guessing', async () => {
    //  The design says a finding is MARKED as needing action. Nothing
    //  derives it from the text, so the default must be the safe one.
    await createPestFinding('c1', {
      visit_id: 'v1', station_code: 'BS-03', finding: 'Rodent droppings everywhere',
    }, 'u1');
    expect((insert.mock.calls[0][0] as Record<string, unknown>).needs_action).toBe(false);
  });

  it('sends null for the optional fields rather than empty strings', async () => {
    await createPestFinding('c1', {
      visit_id: 'v1', station_code: 'BS-03', finding: 'No activity',
      location_ref: '  ', method_used: '', disposition_note: '   ',
    }, 'u1');
    const p = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(p.location_ref).toBeNull();
    expect(p.method_used).toBeNull();
    expect(p.disposition_note).toBeNull();
  });

  it('never sends a corrective_task_id', async () => {
    //  There is nothing to point at, and sending one would be the
    //  loophole: a fabricated task id closes the finding.
    await createPestFinding('c1', {
      visit_id: 'v1', station_code: 'BS-03', finding: 'x',
    }, 'u1');
    expect(insert.mock.calls[0][0]).not.toHaveProperty('corrective_task_id');
  });
});

describe('the write paths scope by company as well as id', () => {
  it('on resolve', async () => {
    await resolveFinding('c1', 'f1', 'u1', 'done');
    expect(eq.mock.calls).toEqual([['id', 'f1'], ['company_id', 'c1']]);
  });

  it('on marking', async () => {
    await setFindingNeedsAction('c1', 'f1', true);
    expect(eq.mock.calls).toEqual([['id', 'f1'], ['company_id', 'c1']]);
  });

  it('records who closed it, alongside when', async () => {
    //  The CHECK constraint refuses one without the other, so the
    //  service must always send both.
    await resolveFinding('c1', 'f1', 'u-closer', 'done');
    const patch = update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.resolved_by).toBe('u-closer');
    expect(patch.resolved_at).toBeTruthy();
  });
});

describe('listPestVisits', () => {
  it('goes through the register RPC', async () => {
    await listPestVisits('c1');
    expect(rpc).toHaveBeenCalledWith('facility_pest_register', { p_company_id: 'c1' });
  });

  it('surfaces a refusal instead of an empty screen', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    await expect(listPestVisits('c1')).rejects.toThrow(/permission denied/);
  });
});

describe('openActionCount', () => {
  const visit = (open: number): PestVisitRow => ({
    visit_id: 'v', reference: 'PC-1', visited_on: '2026-10-20',
    technician_name: null, report_file_ref: null, checked_by: null, checked_at: null,
    provider_id: 'p', provider_name: 'Greenshield', visit_frequency: null,
    contract_until: null, methods: [], next_visit_on: null,
    finding_count: 5, needs_action_count: open, open_action_count: open,
  });

  it('sums across visits', () => {
    expect(openActionCount([visit(1), visit(2)])).toBe(3);
  });

  it('coerces numeric strings, which is how pg returns count()', () => {
    //  `count()` is bigint and arrives as a string; '1' + '2' would
    //  concatenate to '12' and the banner would claim twelve.
    const rows = [visit(1), visit(2)].map((v) => ({
      ...v, open_action_count: String(v.open_action_count) as unknown as number,
    }));
    expect(openActionCount(rows)).toBe(3);
  });

  it('is zero for no visits', () => {
    expect(openActionCount([])).toBe(0);
  });
});

describe('the refusals a reader can act on', () => {
  it.each([
    ['PEST_FINDING_NEEDS_CORRECTIVE_TASK', /cannot be closed by a note/i],
    ['PEST_FINDING_ALREADY_ACTIONED', /already been closed/i],
    ['PEST_VISIT_WRONG_COMPANY', /no visit of this company/i],
    ['PEST_PROVIDER_NOT_FOUND', /no pest control provider/i],
    ['facility_pest_finding_station_chk', /name the station/i],
    ['facility_pest_finding_text_chk', /record what was found/i],
    ['facility_pest_finding_resolved_pair_chk', /recorded together/i],
  ])('explains %s', (raw, pattern) => {
    expect(describePestError(raw).message).toMatch(pattern);
  });

  it('falls back to the shared facility translator for its codes', () => {
    //  A pest finding can name a zone, so zone refusals reach this
    //  path and must not be flattened to UNKNOWN.
    const out = describePestError('FACILITY_ZONE_WRONG_COMPANY');
    expect(out.code).toBe('FACILITY_ZONE_WRONG_COMPANY');
  });

  it('passes an unrecognised message through', () => {
    expect(describePestError('connection reset').message).toBe('connection reset');
  });
});

describe('what the migration does and does not do', () => {
  it('enforces the closure rule in the database, not only in the client', () => {
    expect(MIGRATION).toMatch(/PEST_FINDING_NEEDS_CORRECTIVE_TASK/);
    expect(MIGRATION).toMatch(/PEST_FINDING_ALREADY_ACTIONED/);
  });

  /*
   *  THE RECORDED DECISION. "It becomes a task with an owner and a
   *  due date" is not implemented because no task register exists.
   *  `corrective_task_id` therefore has NO foreign key — there is
   *  nothing to reference — and this test exists so that stays a
   *  deliberate, visible choice.
   */
  it('leaves corrective_task_id without a foreign key', () => {
    const col = SQL_ONLY.slice(
      SQL_ONLY.indexOf('corrective_task_id'),
      SQL_ONLY.indexOf('resolved_at   timestamptz'),
    );
    expect(col).toMatch(/corrective_task_id uuid/);
    expect(col).not.toMatch(/REFERENCES/);
  });

  it('creates no task table of its own', () => {
    //  Inventing a task register to satisfy one screen would be a
    //  product decision taken in a migration.
    //  Anchored on the table NAME. `[^;]*task` also matched the
    //  `corrective_task_id` column inside facility_pest_findings,
    //  which is a column and not a register.
    expect(SQL_ONLY).not.toMatch(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[\w.]*task/i);
  });

  it('does not make a pest finding a CAPA', () => {
    //  capa_actions has assigned_to and due_date and would fit
    //  mechanically, but classifying a bait station as a formal CAPA
    //  record is a quality decision. FL-14 shows TASK-2026-0161.
    expect(SQL_ONLY).not.toMatch(/capa_records|capa_actions/);
  });

  it('raises no deviation automatically', () => {
    expect(SQL_ONLY).not.toMatch(/INSERT INTO public\.deviations/i);
  });

  it('adds no signature requirement', () => {
    expect(SQL_ONLY).not.toMatch(/electronic_signature|requires_signature/i);
  });

  it('constrains no disposition vocabulary', () => {
    //  FL-13 shows "Normal level · no action" and "Watch at next
    //  visit". Two phrases on one screen are not an enum.
    expect(SQL_ONLY).not.toMatch(/disposition_note[^,]*CHECK/);
  });

  it('does not widen the facility schedule frequency vocabulary', () => {
    //  FL-13 says "Fortnightly visits", which is not one of the four
    //  values facility_zone_schedules allows. Pest visits carry their
    //  own free-text frequency instead of changing that CHECK.
    expect(SQL_ONLY).not.toMatch(/facility_zone_schedules/);
    expect(SQL_ONLY).toMatch(/visit_frequency text/);
  });

  it('gives all three tables a company_id foreign key', () => {
    const fks = SQL_ONLY.match(
      /company_id\s+uuid NOT NULL REFERENCES public\.companies \(id\) ON DELETE CASCADE/g,
    ) ?? [];
    expect(fks.length).toBe(3);
  });

  it('keeps the register function SECURITY INVOKER', () => {
    const fn = SQL_ONLY.slice(SQL_ONLY.indexOf('facility_pest_register'));
    expect(fn).toMatch(/SECURITY INVOKER/);
    expect(fn).not.toMatch(/SECURITY DEFINER/);
  });
});
