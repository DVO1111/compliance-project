/**
 * Stage parameter types and version comparison — W4·16.
 *
 * Two of the design's "not done if" clauses are what these assert:
 *
 *   "Parameter type hidden in a settings panel: no. It's the first
 *    question when defining a parameter and shows on every row."
 *
 *   "Machine setting and product attribute visibly different when
 *    defined... They differ in shape, so they also work in greyscale."
 *
 * The greyscale clause is the one worth a test rather than an eye: a
 * later edit that gave both chips the same shape would still look
 * right on screen and be wrong on the printed batch record, which is
 * where a formula is most often read.
 */
import { describe, it, expect } from 'vitest';
import {
  PARAMETER_TYPES, canBeCritical, criticalBlurb,
  describeParameter, describeRecording, checkParameter,
  type ParameterType, type StageParameter,
} from '../lib/formula/parameterTypes';
import { groupDifferences, type FormulaDifference } from '../components/Formula/VersionComparison';

const TYPES: ParameterType[] = ['machine_setting', 'product_attribute'];

const p = (over: Partial<StageParameter> = {}): StageParameter => ({
  parameter: 'Pre-compression force',
  parameterType: 'machine_setting',
  unit: 'kN', targetValue: 3, minValue: 2, maxValue: 4,
  ...over,
});

describe('the two types', () => {
  it('gives each one a chip label, a blurb and an out-of-range sentence', () => {
    for (const t of TYPES) {
      const s = PARAMETER_TYPES[t];
      expect(s.label, t).toBeTruthy();
      expect(s.blurb, t).toBeTruthy();
      expect(s.outOfRange, t).toBeTruthy();
    }
  });

  //  THE GREYSCALE CLAUSE. Colour alone is not a difference on a
  //  printed record; shape is.
  it('distinguishes them by shape, not only by colour', () => {
    expect(PARAMETER_TYPES.machine_setting.shape)
      .not.toBe(PARAMETER_TYPES.product_attribute.shape);
    expect(PARAMETER_TYPES.machine_setting.icon)
      .not.toBe(PARAMETER_TYPES.product_attribute.icon);
  });

  //  The two sentences are opposites, and that is the whole reason the
  //  type is asked first.
  it('states opposite out-of-range behaviour', () => {
    expect(PARAMETER_TYPES.machine_setting.outOfRange).toMatch(/stops/i);
    expect(PARAMETER_TYPES.product_attribute.outOfRange).toMatch(/never blocks entry/i);
  });
});

describe('critical', () => {
  //  "Only machine settings can be critical." Critical means the stage
  //  stops; a product attribute never blocks entry. The two are a
  //  contradiction, not an unusual combination.
  it('is offered for machine settings only', () => {
    expect(canBeCritical('machine_setting')).toBe(true);
    expect(canBeCritical('product_attribute')).toBe(false);
  });

  it('explains itself either way', () => {
    expect(criticalBlurb('machine_setting')).toMatch(/supervisor/i);
    expect(criticalBlurb('product_attribute')).toMatch(/only machine settings/i);
  });

  it('refuses a critical product attribute', () => {
    const r = checkParameter(p({
      parameterType: 'product_attribute', unit: 'mg',
      targetValue: 550, minValue: 530, maxValue: 570, isCritical: true,
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('critical');
  });

  it('accepts a critical machine setting', () => {
    expect(checkParameter(p({ isCritical: true })).ok).toBe(true);
  });
});

describe('what a parameter must carry', () => {
  it('needs a name', () => {
    const r = checkParameter(p({ parameter: '  ' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('parameter');
  });

  //  A machine setting is an INSTRUCTION. One with no value tells an
  //  operator nothing, and the database says so too.
  it('needs a value on a machine setting', () => {
    const r = checkParameter(p({ targetValue: null, targetText: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe('target');
      expect(r.message).toMatch(/instruction/i);
    }
  });

  it('accepts a named position in place of a number', () => {
    expect(checkParameter(p({ targetValue: null, targetText: 'Position 3' })).ok).toBe(true);
  });

  //  A product attribute is an ACCEPTANCE CRITERION. Without limits it
  //  would pass by being unjudgeable — the failure the gates exist for.
  it('needs at least one limit on a product attribute', () => {
    const r = checkParameter(p({
      parameterType: 'product_attribute', unit: 'mg',
      targetValue: 550, minValue: null, maxValue: null,
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe('limits');
      expect(r.message).toMatch(/unjudgeable/i);
    }
  });

  it('accepts a one-sided limit', () => {
    expect(checkParameter(p({
      parameterType: 'product_attribute', unit: 'ppm',
      targetValue: null, minValue: null, maxValue: 50,
    })).ok).toBe(true);
  });

  it('refuses a lower limit above the upper one', () => {
    const r = checkParameter(p({ minValue: 9, maxValue: 2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('limits');
  });
});

describe('how a parameter reads', () => {
  it('shows the target with its unit and the limits', () => {
    expect(describeParameter(p())).toBe('3 kN · 2 – 4');
  });

  it('shows a one-sided limit as open on the other side', () => {
    expect(describeParameter(p({ targetValue: null, minValue: null, maxValue: 50, unit: 'ppm' })))
      .toBe('ppm · … – 50');
  });

  it('falls back to the named position', () => {
    expect(describeParameter(p({ targetValue: null, targetText: 'Position 3', minValue: null, maxValue: null })))
      .toBe('Position 3 kN');
  });

  //  A null interval is NOT "never recorded" — it happens once, when
  //  the stage runs. A blank would read as a missing setting on a
  //  correctly configured parameter.
  it('reads a missing interval as once, not as unset', () => {
    expect(describeRecording(p({ samplingIntervalMinutes: 60 })))
      .toBe('At start, then every 60 min');
    expect(describeRecording(p({ samplingIntervalMinutes: null })))
      .toBe('Set when the stage starts');
  });

  //  And the two types word it differently, because they do different
  //  things: a machine setting is SET, a product attribute is
  //  MEASURED. One sentence for both described neither.
  it('words the once case by type', () => {
    expect(describeRecording(p({ parameterType: 'machine_setting', samplingIntervalMinutes: null })))
      .toMatch(/^Set /);
    expect(describeRecording(p({
      parameterType: 'product_attribute', unit: 'mg', minValue: 530, maxValue: 570,
      samplingIntervalMinutes: null,
    }))).toMatch(/^Recorded /);
  });
});

describe('grouping a version comparison', () => {
  const d = (over: Partial<FormulaDifference>): FormulaDifference => ({
    stageCode: 'COMP', stageName: 'Compression', sequenceNo: 4,
    scope: 'parameter', change: 'changed', item: 'x', field: null,
    oldValue: 'a', newValue: 'b', sortOrder: 20, ...over,
  });

  it('groups differences under their stage, in stage order', () => {
    const groups = groupDifferences([
      d({ stageCode: 'COMP', stageName: 'Compression', sequenceNo: 4, item: 'Force' }),
      d({ stageCode: 'DRY', stageName: 'Dry mixing', sequenceNo: 2, item: 'Speed' }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['Dry mixing', 'Compression']);
  });

  //  Materials and the formula's own fields belong to no stage, so
  //  they get their own groups rather than an "(none)" heading.
  it('puts materials and formula fields in their own groups, last', () => {
    const groups = groupDifferences([
      d({ scope: 'material', stageCode: null, stageName: null, sequenceNo: null, item: 'Starch' }),
      d({ scope: 'formula', stageCode: null, stageName: null, sequenceNo: null, item: 'Batch size' }),
      d({ stageCode: 'DRY', stageName: 'Dry mixing', sequenceNo: 2, item: 'Speed' }),
    ]);
    expect(groups.map((g) => g.title))
      .toEqual(['Dry mixing', 'Bill of materials', 'Batch and yield']);
  });

  it('keeps every difference, in exactly one group', () => {
    const input = [
      d({ stageCode: 'A', stageName: 'A', sequenceNo: 1 }),
      d({ stageCode: 'A', stageName: 'A', sequenceNo: 1, item: 'y' }),
      d({ scope: 'material', stageCode: null, stageName: null, sequenceNo: null }),
      d({ scope: 'formula', stageCode: null, stageName: null, sequenceNo: null }),
    ];
    const total = groupDifferences(input).reduce((n, g) => n + g.rows.length, 0);
    expect(total).toBe(input.length);
  });

  //  Within a stage, the database's sort order is kept: stage changes
  //  before parameter changes, which is how somebody reads a stage.
  it('keeps the database order inside a group', () => {
    const groups = groupDifferences([
      d({ scope: 'parameter', sortOrder: 20, item: 'Force' }),
      d({ scope: 'stage', sortOrder: 10, item: 'Compression' }),
    ]);
    expect(groups[0].rows.map((r) => r.item)).toEqual(['Compression', 'Force']);
  });

  it('handles no differences at all', () => {
    expect(groupDifferences([])).toEqual([]);
  });
});
