/**
 * The QC testing screen's rules.
 *
 * The verdict is never this module's — material_test_record_result
 * decides pass or fail against the specification. What is asserted
 * here is that the screen ARRANGES those verdicts without inventing
 * one, and in particular that an untested lot never reads as finished.
 */

import { describe, it, expect } from 'vitest';
import {
  mayRecordResults, testLines, testingHeadline, resultComplete,
} from '../lib/materials/qcRules';
import type {
  TestDefinitionRow, TestResultRow,
} from '../lib/materials/materialLotService';
import type { WorkRole } from '../lib/access/permissionRequests';

const def = (id: string, required = true): TestDefinitionRow => ({
  id, code: id.toUpperCase(), name: `Test ${id}`, method: null, is_required: required,
});
const res = (defId: string, verdict: string | null): TestResultRow => ({
  id: `r-${defId}`, test_definition_id: defId, parameter: null,
  specification_limit: null, actual_value: 1, actual_text: null,
  result: verdict, analyst_name: null, test_date: '2026-10-22',
});

describe('who may record a result', () => {
  it('is the QC Analyst, and nobody else', () => {
    const roles: WorkRole[] = [
      'procurement', 'storekeeper', 'qc_analyst', 'qa_officer', 'qa_manager',
      'production_supervisor', 'compliance_admin', 'management',
    ];
    expect(roles.filter(mayRecordResults)).toEqual(['qc_analyst']);
  });

  //  PM-03 gives the QA Manager View on QC testing, not Act. Testing
  //  the material and deciding its disposition must not be the same
  //  person's keystroke.
  it('refuses the QA Manager, who only views testing', () => {
    expect(mayRecordResults('qa_manager')).toBe(false);
  });
});

describe('building the list of tests', () => {
  //  THE ONE THAT MATTERS. A list built from results shows a lot
  //  nobody has tested as having nothing outstanding — an untested lot
  //  looking finished is the most dangerous way to get this wrong.
  it('lists every defined test even when nothing has been recorded', () => {
    const lines = testLines([def('a'), def('b')], []);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.state === 'outstanding')).toBe(true);
  });

  it('reads the database’s verdict rather than deriving one', () => {
    const lines = testLines([def('a'), def('b')], [res('a', 'pass'), res('b', 'fail')]);
    expect(lines.map((l) => l.state)).toEqual(['pass', 'fail']);
  });

  //  Absence of a failure is not a pass. A row whose verdict the
  //  database never set must not read as one.
  it('treats a result with no verdict as outstanding, not as a pass', () => {
    expect(testLines([def('a')], [res('a', null)])[0]!.state).toBe('outstanding');
    expect(testLines([def('a')], [res('a', '')])[0]!.state).toBe('outstanding');
    expect(testLines([def('a')], [res('a', 'unknown')])[0]!.state).toBe('outstanding');
  });

  it('is not case-sensitive about the verdict', () => {
    expect(testLines([def('a')], [res('a', 'PASS')])[0]!.state).toBe('pass');
  });

  //  Results arrive newest first, so the first match wins and a
  //  retest supersedes what came before it.
  it('takes the most recent result when a test was repeated', () => {
    const lines = testLines([def('a')], [res('a', 'pass'), res('a', 'fail')]);
    expect(lines[0]!.state).toBe('pass');
  });
});

describe('the headline', () => {
  it('counts only required tests', () => {
    const lines = testLines([def('a'), def('b', false)], [res('a', 'pass')]);
    expect(testingHeadline(lines)).toBe('All required tests are complete and passing.');
  });

  it('leads with a failure over an outstanding test', () => {
    const lines = testLines([def('a'), def('b')], [res('a', 'fail')]);
    expect(testingHeadline(lines)).toContain('failed');
    expect(testingHeadline(lines)).toContain('cannot be released');
  });

  it('counts what is left when nothing has failed', () => {
    const lines = testLines([def('a'), def('b')], [res('a', 'pass')]);
    expect(testingHeadline(lines)).toBe('1 of 2 required tests still outstanding.');
  });

  //  A material whose only test is OPTIONAL has no required tests,
  //  and saying "1 outstanding" would send somebody looking for work
  //  that does not block anything. The first version of this test
  //  asserted the wrong answer; the module was right.
  it('says so when every defined test is optional', () => {
    expect(testingHeadline(testLines([def('a', false)], [])))
      .toBe('No required tests are defined for this material.');
  });

  it('says so when no tests are defined at all', () => {
    expect(testingHeadline([])).toBe('No required tests are defined for this material.');
  });

  //  An optional test that FAILED is still a failure worth leading
  //  with? No — it does not block release, so it is not counted. This
  //  pins that choice so it cannot drift silently.
  it('does not let an optional failure claim the lot cannot be released', () => {
    const lines = testLines([def('a'), def('b', false)], [res('a', 'pass'), res('b', 'fail')]);
    expect(testingHeadline(lines)).toBe('All required tests are complete and passing.');
  });
});

describe('what a result entry needs', () => {
  //  Some parameters are measured and some are observed. Demanding a
  //  number for "appearance" is how somebody types 1 to get past the
  //  form.
  it('accepts a number or a description', () => {
    expect(resultComplete('d1', '99.2', '')).toBe(true);
    expect(resultComplete('d1', '', 'white crystalline powder')).toBe(true);
  });

  it('needs a test chosen', () => {
    expect(resultComplete('', '99.2', '')).toBe(false);
  });

  it('needs one of the two', () => {
    expect(resultComplete('d1', '', '')).toBe(false);
    expect(resultComplete('d1', '   ', '  ')).toBe(false);
  });

  it('refuses a value that is not a number when no text is given', () => {
    expect(resultComplete('d1', 'about ninety', '')).toBe(false);
  });

  //  Zero is a real measurement.
  it('accepts zero as a measured value', () => {
    expect(resultComplete('d1', '0', '')).toBe(true);
  });
});
