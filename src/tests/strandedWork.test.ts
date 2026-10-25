/**
 * Work stranded by a role revocation — the rules the panel uses.
 *
 * The database side is covered by
 * `stranded_work_and_service_grants_test.sql`. These cover the half
 * that did not exist: what the list shows, when reassignment is
 * offered, and whether a refusal tells the reader what to do next.
 */

import { describe, it, expect } from 'vitest';
import {
  mayReassign, mayReceive, outstanding, strandedLines, strandedHeadline,
  waitingFor, reassignComplete, entityLabel,
} from '../lib/access/strandedWorkRules';
import { describeStrandedError } from '../lib/access/strandedWorkService';
import type { StrandedWorkRow } from '../lib/access/strandedWorkService';
import type { WorkRole } from '../lib/access/permissionRequests';

function row(over: Partial<StrandedWorkRow> = {}): StrandedWorkRow {
  return {
    entity_type: 'material_lot', entity_id: 'e1', state_key: 'quarantine',
    section: 'qa_disposition', last_actor: 'u1', last_acted_at: '2026-10-01T00:00:00Z',
    roles_lost: ['qa_officer'], roles_remaining: [],
    reassigned_to: null, reassigned_at: null, still_stranded: true,
    ...over,
  };
}

describe('who may reassign stranded work', () => {
  //  The trigger admits somebody who administers roles OR who may act
  //  in the section. compliance_admin is the role PM-03 gives
  //  roles_change, so it stands for the first arm.
  it('offers reassignment to a roles administrator', () => {
    expect(mayReassign(['compliance_admin'], 'qa_disposition')).toBe(true);
  });

  it('offers reassignment to somebody who may act in the section', () => {
    expect(mayReassign(['qa_manager'], 'qa_disposition')).toBe(true);
    expect(mayReassign(['qc_analyst'], 'qc_testing')).toBe(true);
  });

  it('does not offer it to somebody with neither', () => {
    expect(mayReassign(['storekeeper'], 'qa_disposition')).toBe(false);
    expect(mayReassign([], 'qa_disposition')).toBe(false);
  });

  //  Act in a DIFFERENT section is not authority over this one.
  it('does not accept Act in an unrelated section', () => {
    expect(mayReassign(['storekeeper'], 'qa_disposition')).toBe(false);
  });

  it('reads the full role set, so a two-role holder is not hidden from', () => {
    expect(mayReassign(['storekeeper', 'qa_manager'], 'qa_disposition')).toBe(true);
  });
});

describe('who may receive it', () => {
  //  The target must be able to finish the work. Reassigning to
  //  somebody who also cannot act closes the entry without resolving
  //  anything, which the database refuses with
  //  STRANDED_WORK_TARGET_CANNOT_ACT.
  it('admits a person with Act in the section', () => {
    expect(mayReceive(['qa_manager'], 'qa_disposition')).toBe(true);
  });

  it('excludes a person without it, even a roles administrator', () => {
    expect(mayReceive(['storekeeper'], 'qa_disposition')).toBe(false);
    //  compliance_admin has `view` on qa_disposition, not `act`.
    expect(mayReceive(['compliance_admin'], 'qa_disposition')).toBe(false);
  });
});

describe('the list distinguishes waiting from resolved', () => {
  it('keeps only rows still stranded', () => {
    const rows = [row(), row({ entity_id: 'e2', still_stranded: false })];
    expect(outstanding(rows).map((r) => r.entity_id)).toEqual(['e1']);
  });

  //  "Nothing stranded" must not be the same sentence as "we have not
  //  looked" — an empty list that means the latter reads as comfort.
  it('says plainly when nothing is waiting', () => {
    expect(strandedHeadline([])).toMatch(/No work is waiting on a withdrawn role/);
    expect(strandedHeadline([row({ still_stranded: false })])).toMatch(/No work is waiting/);
  });

  it('counts records and sections when work is waiting', () => {
    const line = strandedHeadline([
      row(),
      row({ entity_id: 'e2', section: 'qc_testing' }),
    ]);
    expect(line).toMatch(/2 records/);
    expect(line).toMatch(/2 sections/);
  });

  it('is singular for one record', () => {
    const line = strandedHeadline([row()]);
    expect(line).toMatch(/1 record /);
    expect(line).toMatch(/carried on by whoever last touched it/);
  });
});

describe('oldest first', () => {
  //  Stranded work does not get less urgent by sitting.
  it('sorts by when it was last touched', () => {
    const rows = [
      row({ entity_id: 'new', last_acted_at: '2026-10-20T00:00:00Z' }),
      row({ entity_id: 'old', last_acted_at: '2026-09-01T00:00:00Z' }),
    ];
    expect(strandedLines(rows).map((r) => r.entity_id)).toEqual(['old', 'new']);
  });

  it('does not mutate the input', () => {
    const rows = [
      row({ entity_id: 'a', last_acted_at: '2026-10-20T00:00:00Z' }),
      row({ entity_id: 'b', last_acted_at: '2026-09-01T00:00:00Z' }),
    ];
    strandedLines(rows);
    expect(rows.map((r) => r.entity_id)).toEqual(['a', 'b']);
  });

  it('reports how long it has waited', () => {
    const now = new Date('2026-10-11T00:00:00Z');
    expect(waitingFor(row({ last_acted_at: '2026-10-01T00:00:00Z' }), now)).toBe('10 days');
    expect(waitingFor(row({ last_acted_at: '2026-10-10T00:00:00Z' }), now)).toBe('1 day');
    expect(waitingFor(row({ last_acted_at: '2026-10-11T00:00:00Z' }), now)).toBe('today');
    expect(waitingFor(row({ last_acted_at: null }), now)).toBe('unknown');
  });
});

describe('a reassignment cannot be submitted without its audit fields', () => {
  //  The reason becomes part of the audit record, so the form requires
  //  it rather than letting the database reject at the last moment.
  it('requires both an assignee and a reason', () => {
    expect(reassignComplete(null, 'cover')).toBe(false);
    expect(reassignComplete('u2', '')).toBe(false);
    expect(reassignComplete('u2', '   ')).toBe(false);
    expect(reassignComplete('u2', 'QA officer left; handing to the QA manager')).toBe(true);
  });

  it('rejects a whitespace-only reason in the service too', async () => {
    const { reassignStrandedWork } = await import('../lib/access/strandedWorkService');
    await expect(
      reassignStrandedWork({
        companyId: 'c', entityType: 'material_lot', entityId: 'e',
        toUser: 'u2', reason: '   ',
      }),
    ).rejects.toThrow(/reason is required/i);
  });
});

describe('refusals say what to do next', () => {
  it('tells you to grant the role first when the target cannot act', () => {
    const d = describeStrandedError('STRANDED_WORK_TARGET_CANNOT_ACT: that person holds no role');
    expect(d.code).toBe('STRANDED_WORK_TARGET_CANNOT_ACT');
    expect(d.message).toMatch(/Grant them the role first/);
  });

  it('explains who may reassign', () => {
    const d = describeStrandedError('STRANDED_WORK_FORBIDDEN: reassigning material_lot is for');
    expect(d.code).toBe('STRANDED_WORK_FORBIDDEN');
    expect(d.message).toMatch(/administers roles/);
  });

  it('suggests a reload when the row is already resolved', () => {
    const d = describeStrandedError('STRANDED_WORK_NOT_STRANDED: e1 is not waiting');
    expect(d.message).toMatch(/Reload the list/);
  });

  it('passes an unknown refusal through rather than hiding it', () => {
    const d = describeStrandedError('SOME_OTHER_CODE: specific detail');
    expect(d.code).toBe('UNKNOWN');
    expect(d.message).toContain('SOME_OTHER_CODE');
  });
});

describe('entity names are readable', () => {
  it('never shows a raw table name', () => {
    for (const t of ['material_lot', 'batch_record', 'deviation', 'capa_record', 'sop_document']) {
      expect(entityLabel(t)).not.toContain('_');
    }
  });

  it('degrades gracefully for an unmapped type', () => {
    expect(entityLabel('some_new_thing')).toBe('some new thing');
  });
});
