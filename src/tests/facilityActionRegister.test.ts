/**
 * The action register, client side.
 *
 * The enforcement is the database's and
 * `supabase/tests/facility_action_register_test.sql` holds it with 45
 * assertions — the three closure gates, the criteria evaluation, and
 * the refusal that names the criterion which caused it.
 *
 * What is tested here is the part the client decides:
 *
 *   - that `requiresCapa` reads the criteria rather than guessing. No
 *     threshold appears in this module at all, which is the whole
 *     point of "define the escalation criteria explicitly rather than
 *     inventing hidden rules".
 *   - that `completeAction` refuses to send a completion without
 *     closure evidence, so the form objects before the constraint
 *     does.
 *   - that the refusal messages carry the criterion codes through, so
 *     a reader is told which of their own rules stopped them.
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
  requiresCapa, capaReasons, validateActionDraft, summarise, actionsFor,
  createAction, completeAction, setActionStatus, linkCapa, listActions,
  escalationFor, describeActionError,
  ACTION_STATUS_LABELS, ACTION_STATUS_TONE,
  type ActionRow, type EscalationMatch,
} from '../lib/facility/facilityActionService';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261209000000_facility_action_register.sql'),
  'utf8',
);
const SQL_ONLY = MIGRATION
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const match = (over: Partial<EscalationMatch> = {}): EscalationMatch => ({
  criterion_id: 'c1', code: 'ESC-SEV',
  description: 'A finding graded Major or Critical is escalated to CAPA.',
  basis: 'severity', requires_capa: true, detail: 'severity Major',
  ...over,
});

const action = (over: Partial<ActionRow> = {}): ActionRow => ({
  action_id: 'a1', source_kind: 'pest_finding', source_id: 'f1',
  title: 'Seal the gap', description: null, owner_id: 'u1', due_on: '2026-11-03',
  status: 'open', closure_evidence: null, closure_ref: null, completed_at: null,
  linked_capa_id: null, capa_number: null, station_code: 'BS-07',
  visit_reference: 'PC-2026-0019', is_overdue: false,
  ...over,
});

beforeEach(() => {
  insert.mockClear(); update.mockClear(); single.mockClear();
  eq.mockClear(); rpc.mockClear();
  single.mockResolvedValue({ data: { id: 'a9' }, error: null });
  update.mockReturnValue(undefined);
  rpc.mockResolvedValue({ data: [], error: null });
});

describe('escalation is read from the criteria, never guessed', () => {
  it('requires a CAPA when a matching criterion says so', () => {
    expect(requiresCapa([match({ requires_capa: true })])).toBe(true);
  });

  it('does not require one when the matching criterion says not to', () => {
    //  "Link OR escalate … when the criteria require it" — matching
    //  and requiring are different things, and a Minor finding
    //  matches a criterion that requires nothing.
    expect(requiresCapa([match({ code: 'ESC-SEV-MINOR', requires_capa: false })]))
      .toBe(false);
  });

  it('requires one if any of several criteria does', () => {
    expect(requiresCapa([
      match({ code: 'A', requires_capa: false }),
      match({ code: 'B', requires_capa: true }),
    ])).toBe(true);
  });

  it('requires nothing when no criterion matches', () => {
    expect(requiresCapa([])).toBe(false);
  });

  it('names only the criteria that require one', () => {
    const reasons = capaReasons([
      match({ code: 'NEEDS', requires_capa: true }),
      match({ code: 'DOESNT', requires_capa: false }),
    ]);
    expect(reasons.map((r) => r.code)).toEqual(['NEEDS']);
  });

  /*
   *  THE STRUCTURAL ASSERTION. "Define the escalation criteria
   *  explicitly rather than inventing hidden rules" means no
   *  threshold may live in the code. If a severity label or a day
   *  count ever appears in this module, the rule has moved out of the
   *  company's data and back into the product.
   */
  it('contains no threshold of its own', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/lib/facility/facilityActionService.ts'), 'utf8',
    );
    for (const smell of [/'Critical'/, /'Major'/, /'Minor'/, /window_days\s*[<>=]/, /\bdays\s*>\s*\d/]) {
      expect(src).not.toMatch(smell);
    }
  });
});

describe('validateActionDraft', () => {
  it('asks for what W6·29 asks for: an owner and a due date', () => {
    const errors = validateActionDraft({
      source_kind: 'pest_finding', source_id: 'f1', title: 'Seal the gap',
    });
    expect(errors.owner_id).toBeTruthy();
    expect(errors.due_on).toBeTruthy();
  });

  it('accepts a complete draft', () => {
    expect(validateActionDraft({
      source_kind: 'pest_finding', source_id: 'f1', title: 'Seal the gap',
      owner_id: 'u1', due_on: '2026-11-03',
    })).toEqual({});
  });

  it('requires a title that says something', () => {
    expect(validateActionDraft({
      source_kind: 'pest_finding', source_id: 'f1', title: '   ',
      owner_id: 'u1', due_on: '2026-11-03',
    }).title).toBeTruthy();
  });
});

describe('completeAction', () => {
  /*
   *  "Never allow a finding requiring action to be closed without its
   *  required action AND closure evidence." The register's CHECK
   *  enforces it; this refuses first so the reader gets a sentence
   *  rather than a constraint name.
   */
  it('refuses to complete without closure evidence', async () => {
    await expect(completeAction('c1', 'a1', 'u1', '   '))
      .rejects.toThrow(/closure evidence/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('sends the evidence, the completion and who made it', async () => {
    await completeAction('c1', 'a1', 'u-closer', 'Gap sealed; photo on file.', 'MNT-1');
    const patch = update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.status).toBe('completed');
    expect(patch.closure_evidence).toBe('Gap sealed; photo on file.');
    expect(patch.closure_ref).toBe('MNT-1');
    expect(patch.completed_by).toBe('u-closer');
    expect(patch.completed_at).toBeTruthy();
  });

  it('scopes by company as well as id', async () => {
    await completeAction('c1', 'a1', 'u1', 'done');
    expect(eq.mock.calls).toEqual([['id', 'a1'], ['company_id', 'c1']]);
  });
});

describe('setActionStatus', () => {
  it('refuses to cancel without a reason', async () => {
    //  An unexplained cancellation is indistinguishable from
    //  suppression, which is why the column requires one too.
    await expect(setActionStatus('c1', 'a1', 'cancelled', '  '))
      .rejects.toThrow(/why/i);
    expect(update).not.toHaveBeenCalled();
  });

  it('cancels with a reason', async () => {
    await setActionStatus('c1', 'a1', 'cancelled', 'Duplicate of the dock-door action.');
    const patch = update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.status).toBe('cancelled');
    expect(patch.cancelled_reason).toBe('Duplicate of the dock-door action.');
  });

  it('clears the reason when moving back to an open state', async () => {
    await setActionStatus('c1', 'a1', 'in_progress');
    expect((update.mock.calls[0][0] as Record<string, unknown>).cancelled_reason).toBeNull();
  });
});

describe('createAction', () => {
  it('takes company_id from the caller, never from the draft', async () => {
    await createAction('company-real', {
      source_kind: 'pest_finding', source_id: 'f1', title: 'x',
      ...({ company_id: 'company-attacker' } as object),
    }, 'u1');
    expect((insert.mock.calls[0][0] as Record<string, unknown>).company_id)
      .toBe('company-real');
  });

  it('never sends a status or a completion', async () => {
    //  A new action is open, and completion is a separate, evidenced
    //  act. Sending either here would let a caller raise an action
    //  already closed.
    await createAction('c1', {
      source_kind: 'pest_finding', source_id: 'f1', title: 'x',
    }, 'u1');
    const p = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(p).not.toHaveProperty('status');
    expect(p).not.toHaveProperty('completed_at');
    expect(p).not.toHaveProperty('closure_evidence');
  });
});

describe('linkCapa', () => {
  it('sends only the link', async () => {
    await linkCapa('c1', 'a1', 'capa-1');
    expect(update.mock.calls[0][0]).toEqual({ linked_capa_id: 'capa-1' });
  });
});

describe('summarise and actionsFor', () => {
  it('counts open, overdue and completed', () => {
    const out = summarise([
      action({ action_id: '1', status: 'open' }),
      action({ action_id: '2', status: 'in_progress', is_overdue: true }),
      action({ action_id: '3', status: 'completed' }),
      action({ action_id: '4', status: 'cancelled' }),
    ]);
    expect(out).toEqual({ total: 4, open: 2, overdue: 1, completed: 1 });
  });

  it('filters to one finding', () => {
    const out = actionsFor([
      action({ action_id: '1', source_id: 'f1' }),
      action({ action_id: '2', source_id: 'f2' }),
    ], 'f1');
    expect(out.map((a) => a.action_id)).toEqual(['1']);
  });

  it('does not call a cancelled action completed', () => {
    expect(ACTION_STATUS_LABELS.cancelled).not.toMatch(/complete/i);
    expect(ACTION_STATUS_TONE.cancelled).toBe('idle');
  });
});

describe('the refusals carry the criterion through', () => {
  it('names the criteria in an ACTION_NEEDS_CAPA refusal', () => {
    //  This is what the criteria being data buys: the reader is told
    //  which of their own rules stopped them.
    const out = describeActionError('ACTION_NEEDS_CAPA: ESC-SEV, ESC-RECUR');
    expect(out.code).toBe('ACTION_NEEDS_CAPA');
    expect(out.message).toContain('ESC-SEV');
    expect(out.message).toContain('ESC-RECUR');
  });

  it('still reads sensibly when no codes come through', () => {
    const out = describeActionError('ACTION_NEEDS_CAPA');
    expect(out.message).toMatch(/one of your escalation criteria/i);
  });

  it.each([
    ['ACTION_NOT_COMPLETED', /not completed yet/i],
    ['ACTION_NEEDS_CLOSURE_EVIDENCE', /no closure evidence/i],
    ['PEST_FINDING_NEEDS_CORRECTIVE_TASK', /needs a corrective action/i],
    ['CAPA_WRONG_COMPANY', /no capa of this company/i],
    ['facility_action_completion_shape_chk', /only be completed with closure evidence/i],
    ['facility_action_cancelled_reason_chk', /say why/i],
    ['facility_pest_findings_corrective_task_fkey', /closure evidence for a finding/i],
  ])('explains %s', (raw, pattern) => {
    expect(describeActionError(raw).message).toMatch(pattern);
  });

  it('passes an unrecognised message through', () => {
    expect(describeActionError('connection reset').message).toBe('connection reset');
  });
});

describe('the queries go through the right surfaces', () => {
  it('lists actions through the register RPC', async () => {
    await listActions('c1');
    expect(rpc).toHaveBeenCalledWith('facility_action_list', { p_company_id: 'c1' });
  });

  it('evaluates escalation in the database, not here', async () => {
    await escalationFor('f1');
    expect(rpc).toHaveBeenCalledWith('facility_escalation_matches', { p_finding_id: 'f1' });
  });
});

describe('what the migration does', () => {
  it('stores the criteria as a table, not as a CASE in a trigger', () => {
    expect(SQL_ONLY).toMatch(/CREATE TABLE IF NOT EXISTS public\.facility_escalation_criteria/);
  });

  it('seeds no criteria of its own', () => {
    //  A shipped default would be a hidden rule by another route: the
    //  company would be escalating on a threshold somebody else chose.
    expect(SQL_ONLY).not.toMatch(/INSERT INTO public\.facility_escalation_criteria/);
  });

  it('invents no severity scale', () => {
    //  match_values is text[], and the migration names no labels.
    expect(SQL_ONLY).not.toMatch(/'critical'|'major'|'minor'/i);
  });

  it('names the criterion in the refusal', () => {
    expect(SQL_ONLY).toMatch(/ACTION_NEEDS_CAPA: %/);
  });

  it('enforces all three closure gates', () => {
    expect(SQL_ONLY).toMatch(/PEST_FINDING_NEEDS_CORRECTIVE_TASK/);
    expect(SQL_ONLY).toMatch(/ACTION_NOT_COMPLETED/);
    expect(SQL_ONLY).toMatch(/ACTION_NEEDS_CLOSURE_EVIDENCE/);
  });

  it('keeps the action a RESTRICT dependency of the finding it closed', () => {
    //  The completed action IS the closure evidence, so it must not be
    //  deletable while a closed finding points at it.
    expect(SQL_ONLY).toMatch(/REFERENCES public\.facility_action_register \(id\) ON DELETE RESTRICT/);
  });

  it('makes the register general rather than pest-specific', () => {
    expect(SQL_ONLY).toMatch(/source_kind IN \('pest_finding','facility_log_entry'\)/);
  });

  it('adds no new CAPA source value', () => {
    //  capa_records.source is constrained to six values, none of them
    //  a facility source. Widening that vocabulary governs a
    //  regulated record and is not a schema convenience.
    expect(SQL_ONLY).not.toMatch(/capa_records_source_check/);
    expect(SQL_ONLY).not.toMatch(/ALTER TABLE public\.capa_records/);
  });
});
