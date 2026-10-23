/**
 * The QC testing screen's rules.
 *
 * Extracted for the same reason as dispositionRules and receiptRules:
 * this project has no DOM testing library, so a rule written inline in
 * a component cannot be asserted — and these decide whether a lot
 * looks finished when it is not.
 *
 * THE VERDICT IS NEVER COMPUTED HERE. material_test_record_result
 * decides pass or fail against the specification limit, and
 * material_lot_release_conditions decides whether the lot may be
 * released. This module only arranges what has already been decided.
 * A screen that re-derived a pass could disagree with the record, and
 * on a QC result that disagreement is the finding.
 */

import { canAct } from '../access/roleAccess';
import type { WorkRole } from '../access/permissionRequests';
import type { TestDefinitionRow, TestResultRow } from './materialLotService';

/** PM-03 gives Act on QC testing to the QC Analyst alone. */
export function mayRecordResults(role: WorkRole | null | undefined): boolean {
  return canAct(role, 'qc_testing');
}

export interface TestLine {
  definition: TestDefinitionRow;
  /** The most recent result, or null where none has been recorded. */
  result: TestResultRow | null;
  /** 'pass' | 'fail' | 'outstanding' — never computed, only read. */
  state: 'pass' | 'fail' | 'outstanding';
}

/**
 * Every required test, with its result where one exists.
 *
 * BUILT FROM THE DEFINITIONS, NOT THE RESULTS. A list built from what
 * has been recorded shows a lot nobody has tested as having nothing
 * outstanding, which is the single most dangerous way to get this
 * wrong: it makes an untested lot look finished.
 *
 * A result whose verdict the database did not set reads as
 * outstanding rather than as a pass. Absence of a failure is not a
 * pass.
 */
export function testLines(
  definitions: TestDefinitionRow[],
  results: TestResultRow[],
): TestLine[] {
  return definitions.map((definition) => {
    //  Results arrive newest first, so the first match is the current
    //  one. A retest supersedes the result before it.
    const result = results.find((r) => r.test_definition_id === definition.id) ?? null;
    const verdict = (result?.result ?? '').toLowerCase();
    const state: TestLine['state'] =
      verdict === 'pass' ? 'pass'
        : verdict === 'fail' ? 'fail'
          : 'outstanding';
    return { definition, result, state };
  });
}

/**
 * What the heading says about a lot's testing.
 *
 * Counts only REQUIRED tests against completion, because an optional
 * test nobody ran does not stop a release and saying "2 of 5
 * outstanding" when three of them are optional sends somebody looking
 * for work that does not exist.
 */
export function testingHeadline(lines: TestLine[]): string {
  const required = lines.filter((l) => l.definition.is_required !== false);
  if (required.length === 0) return 'No required tests are defined for this material.';

  const failed = required.filter((l) => l.state === 'fail').length;
  if (failed > 0) {
    return `${failed} required test${failed === 1 ? '' : 's'} failed. `
      + 'This lot cannot be released.';
  }

  const outstanding = required.filter((l) => l.state === 'outstanding').length;
  if (outstanding > 0) {
    return `${outstanding} of ${required.length} required test${required.length === 1 ? '' : 's'} `
      + 'still outstanding.';
  }
  return 'All required tests are complete and passing.';
}

/**
 * Whether a result entry has enough to submit.
 *
 * A value OR text, not both required and not neither: some parameters
 * are numeric (assay 99.2) and some are descriptive (appearance,
 * "white crystalline powder"). Demanding a number for a description
 * is how somebody ends up typing 1 to get past the form.
 */
export function resultComplete(
  definitionId: string,
  value: string,
  text: string,
): boolean {
  if (!definitionId) return false;
  if (text.trim().length > 0) return true;
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n);
}
