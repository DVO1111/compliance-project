/**
 * What has to be said when a CAPA is raised.
 *
 * UAT: "After clicking 'raise CAPA', it just changes the status to a
 * CAPA has been raised without actually allowing me to write the CAPA,
 * add responsibility and timeline."
 *
 * The thing that makes an empty CAPA harmful rather than merely untidy
 * is the deviation's closure checklist: "A CAPA has been raised" counts
 * LINKS, not substance. So a record with no action, nobody responsible
 * and no date is enough to let a deviation be closed while the
 * corrective action exists only as a row. These rules are what stops
 * that, and they live in a module rather than the dialog because this
 * project has no component testing.
 */

import { describe, it, expect } from 'vitest';
import {
  CAPA_TYPES, CAPA_PRIORITIES,
  emptyCapaForm, checkCapaForm, canSubmitCapa, priorityForSeverity,
  type CapaForm,
} from '../lib/deviations/capaForm';

const TODAY = '2026-11-26';

const deviation = {
  deviationNumber: 'DEV-00002',
  title: 'Out of specification of hardness of DMF tablets',
  severity: 'major',
};

const filled = (over: Partial<CapaForm> = {}): CapaForm => ({
  ...emptyCapaForm(deviation),
  description: 'Re-qualify the tablet press and retrain two operators on the hardness check.',
  ownerId: 'u-ada',
  dueDate: '2026-12-10',
  ...over,
});

describe('the vocabularies match the database', () => {
  //  capa_records_capa_type_check and capa_records_priority_check.
  //  Offering a value outside them produces a CAPA the insert refuses
  //  after the person has typed the whole thing.
  it('offers only the types and priorities the CHECK constraints allow', () => {
    expect([...CAPA_TYPES]).toEqual(['corrective', 'preventive', 'both']);
    expect([...CAPA_PRIORITIES]).toEqual(['low', 'medium', 'high', 'critical']);
  });
});

describe('the priority carried from the deviation', () => {
  //  Mirrors capa_raise_from_deviation. A critical deviation producing
  //  a medium CAPA by default would be a quiet downgrade of somebody
  //  else's assessment.
  it('matches what the database would have chosen', () => {
    expect(priorityForSeverity('critical')).toBe('critical');
    expect(priorityForSeverity('major')).toBe('high');
    expect(priorityForSeverity('minor')).toBe('medium');
    expect(priorityForSeverity('anything else')).toBe('medium');
  });

  it('prefills the form with it, and with a title worth keeping', () => {
    const f = emptyCapaForm(deviation);
    expect(f.priority).toBe('high');
    expect(f.title).toContain('DEV-00002');
  });
});

describe('what a CAPA must say before it is raised', () => {
  it('accepts a complete one', () => {
    expect(checkCapaForm(filled(), TODAY)).toEqual({});
    expect(canSubmitCapa(filled(), TODAY)).toBe(true);
  });

  //  THE THREE UAT NAMED, each refused on its own so a failure says
  //  which one is missing rather than "the form is invalid".
  it('refuses a CAPA with no action written', () => {
    expect(checkCapaForm(filled({ description: '' }), TODAY).description).toBeTruthy();
    expect(checkCapaForm(filled({ description: '   ' }), TODAY).description).toBeTruthy();
    //  A few characters is not a corrective action.
    expect(checkCapaForm(filled({ description: 'fix it' }), TODAY).description).toBeTruthy();
  });

  it('refuses a CAPA with nobody responsible', () => {
    expect(checkCapaForm(filled({ ownerId: '' }), TODAY).ownerId).toBeTruthy();
  });

  it('refuses a CAPA with no timeline', () => {
    expect(checkCapaForm(filled({ dueDate: '' }), TODAY).dueDate).toBeTruthy();
  });

  //  A date already past is not a timeline, and it would show as
  //  overdue the moment it was created.
  it('refuses a due date in the past, and accepts today', () => {
    expect(checkCapaForm(filled({ dueDate: '2026-11-25' }), TODAY).dueDate).toBeTruthy();
    expect(checkCapaForm(filled({ dueDate: TODAY }), TODAY).dueDate).toBeUndefined();
  });

  it('refuses a CAPA with no title', () => {
    expect(checkCapaForm(filled({ title: '' }), TODAY).title).toBeTruthy();
  });

  //  Every problem is reported at once. Reporting them one at a time
  //  makes somebody submit four times to find out what the form wants.
  it('names every problem together', () => {
    const errors = checkCapaForm(
      filled({ title: '', description: '', ownerId: '', dueDate: '' }), TODAY);
    expect(Object.keys(errors).sort()).toEqual(['description', 'dueDate', 'ownerId', 'title']);
    expect(canSubmitCapa(filled({ ownerId: '' }), TODAY)).toBe(false);
  });
});
