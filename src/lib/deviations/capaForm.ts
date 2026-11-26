/**
 * What has to be said when a CAPA is raised.
 *
 * UAT: "After clicking 'raise CAPA', it just changes the status to a
 * CAPA has been raised without actually allowing me to write the CAPA,
 * add responsibility and timeline."
 *
 * The rules live here rather than in the dialog because this project
 * has no component testing — only pure-function suites — so a rule
 * written inside a component is a rule nothing checks. The same reason
 * closure.ts exists beside ClosureSignatureDialog.
 *
 * THE VOCABULARIES ARE THE DATABASE'S, not this file's invention:
 * capa_records_capa_type_check allows corrective, preventive and both;
 * capa_records_priority_check allows low, medium, high and critical.
 * Offering anything else would produce a CAPA the insert refuses after
 * the person has typed the whole thing.
 */

export const CAPA_TYPES = ['corrective', 'preventive', 'both'] as const;
export type CapaType = (typeof CAPA_TYPES)[number];

export const CAPA_TYPE_LABEL: Record<CapaType, string> = {
  corrective: 'Corrective — fix what happened',
  preventive: 'Preventive — stop it happening again',
  both: 'Both',
};

export const CAPA_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type CapaPriority = (typeof CAPA_PRIORITIES)[number];

export const CAPA_PRIORITY_LABEL: Record<CapaPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
};

export interface CapaForm {
  title: string;
  description: string;
  capaType: CapaType;
  priority: CapaPriority;
  ownerId: string;
  dueDate: string;
  isSystemic: boolean;
}

/**
 * The priority a deviation's severity implies.
 *
 * Mirrors capa_raise_from_deviation, which carries severity across so
 * that a critical deviation does not quietly produce a medium CAPA. The
 * form shows the same answer the database would have chosen, so the
 * person sees it and can disagree on purpose rather than by default.
 */
export function priorityForSeverity(severity: string): CapaPriority {
  if (severity === 'critical') return 'critical';
  if (severity === 'major') return 'high';
  return 'medium';
}

export function emptyCapaForm(deviation: {
  deviationNumber: string; title: string; severity: string;
}): CapaForm {
  return {
    //  Prefilled with what the RPC would have generated, so the field is
    //  a starting point rather than a blank the person must fill to get
    //  back to where they already were.
    title: `${deviation.deviationNumber} — ${deviation.title}`,
    description: '',
    capaType: 'corrective',
    priority: priorityForSeverity(deviation.severity),
    ownerId: '',
    dueDate: '',
    isSystemic: false,
  };
}

export interface CapaFormErrors {
  description?: string;
  ownerId?: string;
  dueDate?: string;
  title?: string;
}

/**
 * WHY THESE THREE ARE REQUIRED, when the database permits all of them
 * to be null.
 *
 * A CAPA with no description, no owner and no date still satisfies the
 * deviation's closure checklist — "A CAPA has been raised" counts
 * links, not substance — so an empty one is not a harmless placeholder.
 * It is the thing that lets a deviation be closed while the corrective
 * action exists only as a row.
 *
 * The database is deliberately NOT the gate here, and that is a
 * trade-off rather than an oversight: a NOT NULL would reject the CAPA
 * this project already has, and a required RPC argument would break any
 * browser still running the previous bundle. Stated in the migration
 * too, so the next person finds it from either end.
 */
export function checkCapaForm(form: CapaForm, today: string): CapaFormErrors {
  const errors: CapaFormErrors = {};

  if (form.title.trim().length < 3) {
    errors.title = 'Give the CAPA a title.';
  }
  if (form.description.trim().length < 10) {
    errors.description = 'Describe what will be done. This is the CAPA itself, not a note.';
  }
  if (!form.ownerId) {
    errors.ownerId = 'Name who is responsible for completing it.';
  }
  if (!form.dueDate) {
    errors.dueDate = 'Set the date it is due.';
  } else if (form.dueDate < today) {
    //  A date already past is not a timeline, and it would show as
    //  overdue the moment it was created.
    errors.dueDate = 'The due date cannot be in the past.';
  }

  return errors;
}

export function canSubmitCapa(form: CapaForm, today: string): boolean {
  return Object.keys(checkCapaForm(form, today)).length === 0;
}
