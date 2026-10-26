/**
 * The action register, and the escalation criteria behind it.
 *
 * ── WHAT CHANGED, AND WHY THE CLIENT GOT SIMPLER ──
 *
 * Before 20261209000000 the pest view had to explain that a finding
 * needing action could not be closed at all, because there was no
 * task register to point at. There is one now, so the screen can
 * offer the real workflow: raise an action with an owner and a due
 * date, complete it with closure evidence, and link a CAPA where the
 * company's own criteria require one.
 *
 * ── THE CRITERIA ARE DATA, SO THIS MODULE DOES NOT JUDGE ──
 *
 * The instruction was to "define the escalation criteria explicitly
 * rather than inventing hidden rules". So there is no threshold in
 * this file. `escalationFor()` asks the database which criteria a
 * finding matches and gets rows back — a code, a description and the
 * detail of why it fired. The screen shows those words.
 *
 * Which means a reader asking "why does this need a CAPA?" is
 * answered with their own company's rule, quoted, rather than with a
 * message somebody wrote into the product.
 */
import { supabase } from '../supabase';
import { logger } from '../logger';

export type ActionStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';
export type ActionSourceKind = 'pest_finding' | 'facility_log_entry';
export type EscalationBasis = 'severity' | 'recurrence' | 'product_impact';

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const ACTION_STATUS_TONE: Record<ActionStatus, 'ok' | 'warn' | 'bad' | 'idle'> = {
  completed: 'ok',
  in_progress: 'warn',
  open: 'warn',
  cancelled: 'idle',
};

export interface ActionRow {
  action_id: string;
  source_kind: ActionSourceKind;
  source_id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  due_on: string | null;
  status: ActionStatus;
  closure_evidence: string | null;
  closure_ref: string | null;
  completed_at: string | null;
  linked_capa_id: string | null;
  capa_number: string | null;
  station_code: string | null;
  visit_reference: string | null;
  is_overdue: boolean;
}

export interface EscalationMatch {
  criterion_id: string;
  code: string;
  description: string;
  basis: EscalationBasis;
  requires_capa: boolean;
  detail: string;
}

export async function listActions(companyId: string): Promise<ActionRow[]> {
  const { data, error } = await supabase.rpc('facility_action_list', {
    p_company_id: companyId,
  });
  if (error) {
    logger.error('[action] could not load the register', { error: error.message });
    throw new Error(describeActionError(error.message).message);
  }
  return (data ?? []) as unknown as ActionRow[];
}

/**
 *  Which of the company's own criteria this finding matches.
 *
 *  Returns rows, not a verdict — the point of the criteria being data
 *  is that the reason is quotable.
 */
export async function escalationFor(findingId: string): Promise<EscalationMatch[]> {
  const { data, error } = await supabase.rpc('facility_escalation_matches', {
    p_finding_id: findingId,
  });
  if (error) {
    logger.error('[action] could not evaluate escalation', { error: error.message });
    throw new Error(describeActionError(error.message).message);
  }
  return (data ?? []) as unknown as EscalationMatch[];
}

/** Does any matching criterion require a formal CAPA? */
export function requiresCapa(matches: EscalationMatch[]): boolean {
  return matches.some((m) => m.requires_capa);
}

/** The criteria that require one, for the sentence the screen shows. */
export function capaReasons(matches: EscalationMatch[]): EscalationMatch[] {
  return matches.filter((m) => m.requires_capa);
}

export interface ActionDraft {
  source_kind: ActionSourceKind;
  source_id: string;
  title: string;
  description?: string | null;
  owner_id?: string | null;
  due_on?: string | null;
}

export function validateActionDraft(draft: ActionDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(draft.title ?? '').trim()) {
    errors.title = 'Say what has to be done.';
  }
  //  An owner and a due date are what W6·29 asks for, and what a
  //  derived task could never have. Not refused by the column —
  //  an action can be raised before either is decided — but the
  //  form asks for them.
  if (!draft.owner_id) errors.owner_id = 'Give the action an owner.';
  if (!draft.due_on) errors.due_on = 'Give the action a due date.';
  return errors;
}

export async function createAction(
  companyId: string,
  draft: ActionDraft,
  createdBy: string | null,
): Promise<ActionRow> {
  const { data, error } = await supabase
    .from('facility_action_register')
    .insert({
      company_id: companyId,
      source_kind: draft.source_kind,
      source_id: draft.source_id,
      title: draft.title.trim(),
      description: draft.description?.trim() || null,
      owner_id: draft.owner_id ?? null,
      due_on: draft.due_on || null,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error) {
    logger.error('[action] could not raise an action', { error: error.message });
    throw new Error(describeActionError(error.message).message);
  }
  return data as unknown as ActionRow;
}

/**
 *  Complete an action.
 *
 *  `closure_evidence` is required by the register's own CHECK, so
 *  this refuses locally first rather than letting a constraint do the
 *  talking: "never allow a finding requiring action to be closed
 *  without its required action and closure evidence."
 */
export async function completeAction(
  companyId: string,
  actionId: string,
  completedBy: string,
  evidence: string,
  ref?: string | null,
): Promise<void> {
  if (!evidence.trim()) {
    throw new Error(
      'An action cannot be completed without closure evidence — say what was done '
      + 'and how it was checked.',
    );
  }
  const { error } = await supabase
    .from('facility_action_register')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: completedBy,
      closure_evidence: evidence.trim(),
      closure_ref: ref?.trim() || null,
    })
    .eq('id', actionId)
    .eq('company_id', companyId);
  if (error) {
    logger.error('[action] could not complete an action', { error: error.message });
    throw new Error(describeActionError(error.message).message);
  }
}

export async function setActionStatus(
  companyId: string,
  actionId: string,
  status: Exclude<ActionStatus, 'completed'>,
  cancelledReason?: string | null,
): Promise<void> {
  if (status === 'cancelled' && !String(cancelledReason ?? '').trim()) {
    //  An unexplained cancellation is indistinguishable from
    //  suppression, which is why the column requires a reason.
    throw new Error('Say why the action is being cancelled.');
  }
  const { error } = await supabase
    .from('facility_action_register')
    .update({
      status,
      cancelled_reason: status === 'cancelled' ? (cancelledReason ?? '').trim() : null,
    })
    .eq('id', actionId)
    .eq('company_id', companyId);
  if (error) {
    logger.error('[action] could not change an action status', { error: error.message });
    throw new Error(describeActionError(error.message).message);
  }
}

export async function linkCapa(
  companyId: string,
  actionId: string,
  capaId: string,
): Promise<void> {
  const { error } = await supabase
    .from('facility_action_register')
    .update({ linked_capa_id: capaId })
    .eq('id', actionId)
    .eq('company_id', companyId);
  if (error) {
    logger.error('[action] could not link a CAPA', { error: error.message });
    throw new Error(describeActionError(error.message).message);
  }
}

/** Open CAPAs this company could link to. */
export interface CapaOption {
  id: string;
  capa_number: string;
  title: string;
  status: string;
}

export async function listLinkableCapas(companyId: string): Promise<CapaOption[]> {
  const { data, error } = await supabase
    .from('capa_records')
    .select('id, capa_number, title, status')
    .eq('company_id', companyId)
    .order('capa_number', { ascending: false });
  if (error) {
    logger.error('[action] could not list CAPAs', { error: error.message });
    throw new Error(describeActionError(error.message).message);
  }
  return (data ?? []) as unknown as CapaOption[];
}

export interface ActionSummary {
  total: number;
  open: number;
  overdue: number;
  completed: number;
}

export function summarise(rows: ActionRow[]): ActionSummary {
  return {
    total: rows.length,
    open: rows.filter((r) => r.status === 'open' || r.status === 'in_progress').length,
    overdue: rows.filter((r) => r.is_overdue).length,
    completed: rows.filter((r) => r.status === 'completed').length,
  };
}

export function actionsFor(rows: ActionRow[], sourceId: string): ActionRow[] {
  return rows.filter((r) => r.source_id === sourceId);
}

export function describeActionError(raw: string): { code: string; message: string } {
  const text = String(raw ?? '');

  //  Checked first: it is the most specific, and it carries the
  //  criterion codes after the colon.
  if (text.includes('ACTION_NEEDS_CAPA')) {
    const codes = text.split('ACTION_NEEDS_CAPA:')[1]?.trim().split(/[\s,]+/).filter(Boolean);
    return {
      code: 'ACTION_NEEDS_CAPA',
      message:
        'This finding cannot be closed without a formal CAPA, because '
        + (codes && codes.length
          ? `your escalation criteria require one: ${codes.join(', ')}.`
          : 'one of your escalation criteria requires one.'),
    };
  }
  if (text.includes('ACTION_NOT_COMPLETED')) {
    return {
      code: 'ACTION_NOT_COMPLETED',
      message: 'The corrective action is not completed yet, so the finding stays open.',
    };
  }
  if (text.includes('ACTION_NEEDS_CLOSURE_EVIDENCE')) {
    return {
      code: 'ACTION_NEEDS_CLOSURE_EVIDENCE',
      message: 'The corrective action has no closure evidence recorded against it.',
    };
  }
  if (text.includes('PEST_FINDING_NEEDS_CORRECTIVE_TASK')) {
    return {
      code: 'PEST_FINDING_NEEDS_CORRECTIVE_TASK',
      message:
        'A finding marked as needing action needs a corrective action raised against it '
        + 'before it can be closed.',
    };
  }
  if (text.includes('ACTION_SOURCE_WRONG_COMPANY')
      || text.includes('ACTION_SOURCE_NOT_FOUND')) {
    return {
      code: 'ACTION_SOURCE_NOT_FOUND',
      message: 'No finding of this company has that id.',
    };
  }
  if (text.includes('CAPA_WRONG_COMPANY') || text.includes('CAPA_NOT_FOUND')) {
    return { code: 'CAPA_NOT_FOUND', message: 'No CAPA of this company has that id.' };
  }
  if (text.includes('ACTION_WRONG_COMPANY') || text.includes('ACTION_NOT_FOUND')) {
    return { code: 'ACTION_NOT_FOUND', message: 'No action of this company has that id.' };
  }
  if (text.includes('facility_action_completion_shape_chk')) {
    return {
      code: 'EVIDENCE_REQUIRED',
      message: 'An action can only be completed with closure evidence recorded.',
    };
  }
  if (text.includes('facility_action_cancelled_reason_chk')) {
    return {
      code: 'REASON_REQUIRED',
      message: 'A cancelled action has to say why it was cancelled.',
    };
  }
  if (text.includes('facility_pest_findings_corrective_task_fkey')) {
    return {
      code: 'ACTION_IN_USE',
      message:
        'That action is the closure evidence for a finding, so it cannot be deleted.',
    };
  }
  return { code: 'UNKNOWN', message: text || 'The action register could not be updated.' };
}
