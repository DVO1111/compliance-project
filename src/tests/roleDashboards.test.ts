/**
 * DB-01 and DB-02 as two different screens, and the flow card that
 * reads differently for each role.
 *
 * These tests exist because the defect being repaired was precisely
 * that every role got one dashboard. A test that only checked "the
 * dashboard renders" would have passed throughout that defect, so what
 * is asserted here is the DIFFERENCE: which tiles, which controls,
 * which stages are locked, and which of those can be asked for.
 */

import { describe, it, expect } from 'vitest';
import { FLOW_STAGES } from '../components/Dashboard/db/materialBatchFlow';
import {
  QA_MANAGER_CONTROLS, STOREKEEPER_CONTROLS,
} from '../components/Dashboard/db/ControlsInForce';
import { greetingFor } from '../components/Dashboard/db/DashboardHeader';
import { sectionAccess } from '../lib/access/roleAccess';
import { canBeRequested } from '../lib/access/permissionRequests';

describe('the material and batch flow', () => {
  it('draws the design’s eight stages in order', () => {
    expect(FLOW_STAGES.map((s) => s.no)).toEqual(
      ['01', '02', '03', '04', '05', '06', '07', '08'],
    );
    expect(FLOW_STAGES.map((s) => s.title)).toEqual([
      'Procurement', 'Warehouse', 'QC testing', 'QA disposition',
      'Production', 'Finished QC', 'QA release', 'Distribution',
    ]);
  });

  //  The card is the same component on both dashboards. If it did not
  //  resolve differently per role it would be decoration.
  it('locks for a Storekeeper exactly the stages PM-03 closes', () => {
    const locked = FLOW_STAGES
      .filter((s) => s.section && sectionAccess('storekeeper', s.section) === 'none')
      .map((s) => s.no);
    expect(locked).toEqual(['03', '04', '06', '07']);
  });

  it('locks nothing for a QA Manager', () => {
    const locked = FLOW_STAGES
      .filter((s) => s.section && sectionAccess('qa_manager', s.section) === 'none');
    expect(locked).toEqual([]);
  });

  it('gives a Storekeeper Act on exactly warehouse and distribution', () => {
    const acts = FLOW_STAGES
      .filter((s) => s.section && sectionAccess('storekeeper', s.section) === 'act')
      .map((s) => s.title);
    expect(acts).toEqual(['Warehouse', 'Distribution']);
  });

  //  Stage 06 reads a column the design does not draw for it. The flag
  //  is what makes that visible on screen; losing it would turn a
  //  documented assumption into a silent one.
  it('marks the stage whose column was inferred', () => {
    const inferred = FLOW_STAGES.filter((s) => s.inferred).map((s) => s.no);
    expect(inferred).toEqual(['06']);
  });

  it('gives every stage a section to read, so none defaults to open', () => {
    for (const s of FLOW_STAGES) expect(s.section, s.no).toBeTruthy();
  });
});

describe('the two dashboards are not the same screen', () => {
  it('states what the system enforces, and what the role cannot do', () => {
    expect(QA_MANAGER_CONTROLS).toHaveLength(5);
    expect(STOREKEEPER_CONTROLS).toHaveLength(5);
    expect(QA_MANAGER_CONTROLS).not.toEqual(STOREKEEPER_CONTROLS);
  });

  it('shares only the audit-trail sentence between the two control lists', () => {
    const shared = QA_MANAGER_CONTROLS.filter((c) => STOREKEEPER_CONTROLS.includes(c));
    expect(shared).toEqual(['Every action is logged in the audit trail.']);
  });

  it('keeps the QA Manager’s controls in the design’s words', () => {
    expect(QA_MANAGER_CONTROLS[0]).toBe('Only approved suppliers can be used.');
    expect(QA_MANAGER_CONTROLS[3])
      .toBe('Batches need complete QC and QA review before release.');
  });

  it('keeps the Storekeeper’s limits in the design’s words', () => {
    expect(STOREKEEPER_CONTROLS[0]).toBe('Receive material, but not approve its quality.');
    expect(STOREKEEPER_CONTROLS[1]).toBe('Issue only lots that QA has approved.');
  });
});

describe('what a Storekeeper may ask for', () => {
  //  DB-02 lists four locked sections and marks one of them as not
  //  requestable. Getting that wrong in either direction is a real
  //  failure: offering to request batch release invites a refusal, and
  //  hiding the others leaves somebody with no way to ask at all.
  it('lets QC testing, deviations and the audit trail be requested', () => {
    expect(canBeRequested('qc_testing')).toBe(true);
    expect(canBeRequested('deviation_capa')).toBe(true);
    expect(canBeRequested('audit_trail')).toBe(true);
  });

  it('refuses to let batch release be requested at all', () => {
    expect(canBeRequested('batch_release')).toBe(false);
  });
});

describe('the greeting follows the clock', () => {
  //  A dashboard that says good morning at six in the evening is the
  //  detail that makes people stop trusting the numbers beside it.
  it('changes through the day', () => {
    expect(greetingFor(new Date('2026-10-22T07:00:00'))).toBe('Good morning');
    expect(greetingFor(new Date('2026-10-22T13:00:00'))).toBe('Good afternoon');
    expect(greetingFor(new Date('2026-10-22T19:00:00'))).toBe('Good evening');
  });

  it('treats noon as afternoon and midnight as morning', () => {
    expect(greetingFor(new Date('2026-10-22T12:00:00'))).toBe('Good afternoon');
    expect(greetingFor(new Date('2026-10-22T00:30:00'))).toBe('Good morning');
  });
});
