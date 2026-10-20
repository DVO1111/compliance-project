/**
 * The two kinds of stage parameter — W4·16 (MF-02, MF-03, MF-04).
 *
 * The design's NOT DONE IF is the specification:
 *
 *   "Parameter type hidden in a settings panel: no. It's the first
 *    question when defining a parameter and shows on every row."
 *
 * WHY THE TYPE IS THE FIRST QUESTION AND NOT A DETAIL. It decides what
 * happens when the value is out of range, and the two answers are
 * opposites:
 *
 *   Machine setting   — an instruction to the equipment. Out of range
 *                       is flagged, and if it is marked critical the
 *                       stage STOPS until a supervisor decides.
 *   Product attribute — a measurement of the product. Out of range is
 *                       flagged and NEVER blocks entry; the operator
 *                       corrects or escalates.
 *
 * A form that asked for name, target and limits first and the type
 * last would let somebody define the thing before deciding what it
 * does — and the type cannot be changed once the formula is approved,
 * because the whole formula freezes.
 *
 * THE TWO CHIPS DIFFER IN SHAPE, NOT ONLY COLOUR. A navy square chip
 * with a gear against an outlined green pill with a flask. The design
 * says why: "They differ in shape, so they also work in greyscale."
 * Two coloured rectangles would be one printout away from being the
 * same thing.
 */

import type { IconName } from '../design/icons';

export type ParameterType = 'machine_setting' | 'product_attribute';

export interface ParameterTypeStyle {
  /** The words on the chip, in the design's own casing. */
  label: string;
  /** "Machine setting", for a heading or a sentence. */
  title: string;
  /** What it is, in the operator's terms. */
  blurb: string;
  /** What happens when a reading falls outside the limits. */
  outOfRange: string;
  icon: IconName;
  /** square = navy filled chip, pill = outlined green. */
  shape: 'square' | 'pill';
  /** The 4px bar down the left of the row. */
  bar: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
}

export const PARAMETER_TYPES: Record<ParameterType, ParameterTypeStyle> = {
  machine_setting: {
    label: 'MACHINE SETTING',
    title: 'Machine setting',
    blurb: 'Set on the equipment: speed, force, temperature, time.',
    outOfRange:
      'Out of range is flagged. If you mark it critical, the stage stops until a '
      + 'supervisor decides.',
    icon: 'nav/settings',
    shape: 'square',
    bar: 'var(--nv-light-ink-bg)',
    chipBg: 'var(--nv-light-ink-bg)',
    chipBorder: 'var(--nv-light-ink-bg)',
    chipText: 'var(--nv-light-ink-text)',
  },
  product_attribute: {
    label: 'PRODUCT ATTRIBUTE',
    title: 'Product attribute',
    blurb: 'Measured on the product: weight, hardness, pH, appearance.',
    outOfRange:
      'Out of range is flagged and never blocks entry. The operator can correct or '
      + 'escalate.',
    icon: 'quality/qc-testing',
    shape: 'pill',
    bar: 'var(--nv-light-action-bg)',
    chipBg: 'var(--nv-light-surface)',
    chipBorder: 'var(--nv-light-action-bg)',
    chipText: 'var(--nv-light-action-bg)',
  },
};

/**
 * "Only machine settings can be critical."
 *
 * Critical means the stage stops until a supervisor decides, and a
 * product attribute never blocks entry — so the two are a
 * contradiction rather than an unusual combination.
 *
 * THE DATABASE DOES NOT ENFORCE THIS YET, and that is stated here
 * rather than left to be discovered: master_formula_stage_parameters
 * carries is_critical on product attributes in four existing suites and
 * nothing reads it for them. So this is the rule the screens apply, and
 * master_formula_parameter_critical_allowed() is the same rule in SQL
 * for anything server-side. When the lead confirms it, a CHECK makes it
 * structural and these two become one.
 */
export function canBeCritical(type: ParameterType): boolean {
  return type === 'machine_setting';
}

export function criticalBlurb(type: ParameterType): string {
  return canBeCritical(type)
    ? 'Out of range stops the stage until a supervisor decides.'
    : 'Only machine settings can be critical. A product attribute never blocks entry.';
}

export interface StageParameter {
  id?: string;
  parameter: string;
  parameterType: ParameterType;
  unit?: string | null;
  targetValue?: number | null;
  targetText?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  isCritical?: boolean;
  /** Null means it is not on a clock — recorded once at the stage. */
  samplingIntervalMinutes?: number | null;
}

/**
 * The right-hand summary on a parameter row: "3.0 kN · 2.0 – 4.0".
 *
 * Mirrors master_formula_parameter_text in SQL deliberately — the
 * version comparison formats both sides of a difference with the SQL
 * one, and a row that described the same parameter differently would
 * make the diff and the builder look like they disagreed.
 */
export function describeParameter(p: StageParameter): string {
  const parts: string[] = [];

  const value = p.targetValue != null ? String(p.targetValue) : p.targetText ?? '';
  const target = [value, p.unit ?? ''].filter(Boolean).join(' ').trim();
  if (target) parts.push(target);

  if (p.minValue != null || p.maxValue != null) {
    parts.push(`${p.minValue ?? '…'} – ${p.maxValue ?? '…'}`);
  }

  return parts.join(' · ');
}

/**
 * The "Recorded" line: "At start, then every 60 min".
 *
 * A null interval is NOT "never recorded" — it is recorded once, when
 * the stage runs. Rendering that as a blank would read as a missing
 * setting on a parameter that is correctly configured.
 */
export function describeRecording(p: StageParameter): string {
  if (p.samplingIntervalMinutes != null) {
    return `At start, then every ${p.samplingIntervalMinutes} min`;
  }
  //  The two types do different things with no interval, and one
  //  sentence for both read wrongly on screen: a machine setting is
  //  SET once when the stage starts, a product attribute is MEASURED
  //  once while it runs. "At the stage, once" described neither.
  return p.parameterType === 'machine_setting'
    ? 'Set when the stage starts'
    : 'Recorded once during the stage';
}

/**
 * Whether a parameter is complete enough to add.
 *
 * The two CHECK constraints the database already enforces, restated so
 * the drawer can say which field is missing instead of surfacing a
 * constraint name. They exist for different reasons and the messages
 * say which:
 *
 *   A machine setting is an INSTRUCTION — it must say what to set.
 *   A product attribute is an ACCEPTANCE CRITERION — it must be
 *   judgeable, and without limits it would pass by being unjudgeable.
 */
export type ParameterCheck =
  | { ok: true }
  | { ok: false; field: 'parameter' | 'target' | 'limits' | 'critical'; message: string };

export function checkParameter(p: StageParameter): ParameterCheck {
  if (!p.parameter.trim()) {
    return { ok: false, field: 'parameter', message: 'Give the parameter a name.' };
  }

  if (p.parameterType === 'machine_setting') {
    const hasValue = p.targetValue != null
      || (p.targetText != null && p.targetText.trim() !== '');
    if (!hasValue) {
      return {
        ok: false, field: 'target',
        message: 'A machine setting is an instruction. Say what to set, as a number or a '
          + 'named position.',
      };
    }
  }

  if (p.parameterType === 'product_attribute'
      && p.minValue == null && p.maxValue == null) {
    return {
      ok: false, field: 'limits',
      message: 'A product attribute is an acceptance criterion. Without a limit there is '
        + 'nothing to judge it against, so it would pass by being unjudgeable.',
    };
  }

  if (p.minValue != null && p.maxValue != null && p.minValue > p.maxValue) {
    return {
      ok: false, field: 'limits',
      message: 'The lower limit is above the upper limit.',
    };
  }

  if (p.isCritical && !canBeCritical(p.parameterType)) {
    return {
      ok: false, field: 'critical',
      message: criticalBlurb(p.parameterType),
    };
  }

  return { ok: true };
}
