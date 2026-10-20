/**
 * Reading and writing deviations — W5·11.
 *
 * The judgements live in raise.ts and investigation.ts, which import
 * no client and so test without a project, a network or a .env. This
 * file is the join between those and the database, and nothing more:
 * every rule it needs already exists on one side or the other.
 *
 * WHAT FAILS OPEN AND WHAT FAILS CLOSED, because the distinction is
 * the whole of this file's safety:
 *
 *   REPORTS fail open — an empty list and a logged error. The
 *     register, the closure checklist and the category list tell a
 *     screen what to SHOW. A failed read there must not stop somebody
 *     raising a deviation or closing one; it must stop the screen
 *     claiming to know.
 *
 *   `impactConsequences` fails CLOSED, and it is the exception. It
 *     tells somebody what choosing an impact will do to release before
 *     they choose it. An empty list means the sheet cannot say, and
 *     RaiseDeviationSheet draws that as "the impact options did not
 *     load correctly" rather than offering three unexplained buttons —
 *     because the alternative is somebody raising a blocking deviation
 *     on a guess.
 *
 * NOTHING HERE RE-DERIVES A VERDICT. `blocking` on a closure condition
 * and `effect` on an impact option arrive decided; this maps column
 * names to field names and stops.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';
import type { ImpactOption, DeviationDraft, SourceType } from './raise';
import type {
  RegisterRow, ReadinessCondition, RootCauseAnalysis, Framework, Why,
} from './investigation';
import type { LinkedRecord, ClosureSignature } from
  '../../components/Deviations/InvestigationPanel';
import type { RecordDeviation } from '../../components/Deviations/DeviationOnRecord';

export type DeviationResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

function failure(error: unknown, fallback: string): { ok: false; code: string; message: string } {
  const message = (error as { message?: string } | null)?.message ?? '';
  //  The database's errors are written for the person reading them —
  //  'DEVIATION_IMPACT_REQUIRED: product quality impact must be yes,
  //  no or undetermined' — so the code is split off and the sentence
  //  is shown rather than replaced with something vaguer.
  const match = /^([A-Z][A-Z0-9_]+):\s*(.*)$/.exec(message);
  if (match) return { ok: false, code: match[1], message: match[2] };
  return { ok: false, code: 'DEVIATION_FAILED', message: message || fallback };
}

// ── what each impact option will do ──────────────────────────────────

/**
 * The three options with their effect on release, for the raise sheet.
 *
 * FAILS CLOSED. See the header: an empty list is how the sheet knows
 * it cannot say what an option would do, and it says so instead of
 * offering the choice anyway.
 */
export async function impactConsequences(
  companyId: string,
  sourceType: SourceType,
  sourceId: string | null,
): Promise<ImpactOption[]> {
  const { data, error } = await supabase.rpc('deviation_impact_consequence', {
    p_company_id: companyId,
    p_source_type: sourceType,
    //  The generated types give every defaulted argument `string |
    //  undefined`, and PostgREST omits an undefined key rather than
    //  sending null — which is what makes the database's own DEFAULT
    //  apply. Passing null would override the default with null.
    p_source_id: sourceId ?? undefined,
  });
  if (error) {
    logger.error('[deviations] impactConsequences failed', { companyId, sourceType, error });
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      impact: row.impact as ImpactOption['impact'],
      label: String(row.label),
      effect: row.effect as ImpactOption['effect'],
      consequence: String(row.consequence),
      sortOrder: Number(row.sort_order),
    };
  });
}

// ── raising ──────────────────────────────────────────────────────────

export interface RaiseOptions {
  entryPoint?: string;
  immediateAction?: string;
  containment?: string;
}

/**
 * Raises it.
 *
 * The draft's own `checkDraft` has already refused a blank impact on
 * the screen; the database refuses it again by name. Both, because a
 * service-layer check is not the same guarantee as a column, and a
 * column's message is not the sentence somebody should read on a
 * tablet.
 */
export async function raiseDeviation(
  companyId: string,
  draft: DeviationDraft,
  opts: RaiseOptions = {},
): Promise<DeviationResult<{ id: string; deviationNumber: string }>> {
  const { data, error } = await supabase.rpc('deviation_raise', {
    p_company_id: companyId,
    p_title: draft.title.trim(),
    p_severity: draft.severity as string,
    p_product_quality_impact: draft.impact as string,
    p_source_type: draft.sourceType,
    p_source_id: draft.sourceId ?? undefined,
    p_description: draft.description.trim() || undefined,
    p_entry_point: opts.entryPoint ?? 'manual',
    p_immediate_action: opts.immediateAction ?? undefined,
    p_containment: opts.containment ?? undefined,
  });
  if (error) {
    logger.error('[deviations] raise failed', { companyId, error });
    return failure(error, 'The deviation could not be raised.');
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return { ok: true, id: String(row.id), deviationNumber: String(row.deviation_number) };
}

// ── the register ─────────────────────────────────────────────────────

export async function registerRows(
  companyId: string,
  includeClosed = false,
): Promise<RegisterRow[]> {
  const { data, error } = await supabase.rpc('deviation_register', {
    p_company_id: companyId,
    p_include_closed: includeClosed,
  });
  if (error) {
    logger.error('[deviations] register failed', { companyId, error });
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      deviationNumber: String(row.deviation_number),
      title: String(row.title),
      severity: String(row.severity),
      impact: String(row.product_quality_impact),
      sourceType: String(row.source_type),
      sourceLabel: (row.source_label as string | null) ?? null,
      stateKey: String(row.state_key),
      stateLabel: String(row.state_label),
      dueDate: (row.investigation_due_date as string | null) ?? null,
      daysOverdue: row.days_overdue === null || row.days_overdue === undefined
        ? null : Number(row.days_overdue),
      isOverdue: row.is_overdue === true,
      raisedAt: String(row.raised_at),
      linkedCapaCount: Number(row.linked_capa_count ?? 0),
    };
  });
}

// ── the closure checklist ────────────────────────────────────────────

export async function closureReadiness(deviationId: string): Promise<ReadinessCondition[]> {
  const { data, error } = await supabase.rpc('deviation_closure_readiness', {
    p_deviation_id: deviationId,
  });
  if (error) {
    logger.error('[deviations] closureReadiness failed', { deviationId, error });
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      key: String(row.condition_key),
      met: row.met === true,
      //  Read, never inferred. `blocking` is false on the CAPA
      //  condition while W5·11 decision 4 is open, and a default of
      //  true here would quietly turn an unconfirmed rule into a gate.
      blocking: row.blocking === true,
      title: String(row.title),
      detail: String(row.detail),
      sortOrder: Number(row.sort_order),
    };
  });
}

// ── the company's root cause categories ──────────────────────────────

export async function rootCauseCategories(
  companyId: string,
): Promise<Array<{ key: string; label: string }>> {
  const { data, error } = await supabase.rpc('root_cause_categories_effective', {
    p_company_id: companyId,
  });
  if (error) {
    logger.error('[deviations] rootCauseCategories failed', { companyId, error });
    return [];
  }
  return ((data as unknown[]) ?? [])
    //  Retired categories stay in the table so history validates, and
    //  are not offered for a new analysis.
    .filter((r) => (r as Record<string, unknown>).is_active === true)
    .map((r) => {
      const row = r as Record<string, unknown>;
      return { key: String(row.category_key), label: String(row.label) };
    });
}

/** The company's default framework, for a new analysis. The analysis
 *  records what was actually used, so changing the default does not
 *  rewrite the ones already done. */
export async function defaultFramework(companyId: string): Promise<Framework> {
  const { data, error } = await supabase.rpc('company_rca_settings_effective', {
    p_company_id: companyId,
  });
  if (error) {
    logger.error('[deviations] defaultFramework failed', { companyId, error });
    return 'five_whys';
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return (row?.default_framework as Framework) ?? 'five_whys';
}

// ── the root cause analysis ──────────────────────────────────────────

/**
 * The analysis attached to a deviation, or null when none has been
 * started.
 *
 * Null rather than a blank analysis: a screen that was handed an empty
 * one could not tell "nobody has started" from "somebody started and
 * wrote nothing", and only the first should offer to begin.
 */
export async function rootCauseFor(deviationId: string): Promise<RootCauseAnalysis | null> {
  const { data, error } = await supabase
    .from('root_cause_analyses')
    .select('*')
    .eq('subject_type', 'deviation')
    .eq('subject_id', deviationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('[deviations] rootCauseFor failed', { deviationId, error });
    return null;
  }
  if (!data) return null;

  const a = data as Record<string, unknown>;
  const whys = await whysFor(String(a.id));

  return {
    id: String(a.id),
    framework: (a.framework as Framework) ?? 'five_whys',
    whys,
    answers: {
      what: (a.w5h1_what as string | null) ?? null,
      why: (a.w5h1_why as string | null) ?? null,
      where: (a.w5h1_where as string | null) ?? null,
      when: (a.w5h1_when as string | null) ?? null,
      who: (a.w5h1_who as string | null) ?? null,
      how: (a.w5h1_how as string | null) ?? null,
    },
    determinedRootCause: (a.determined_root_cause as string | null) ?? null,
    rootCauseCategory: (a.root_cause_category as string | null) ?? null,
    completedAt: (a.completed_at as string | null) ?? null,
  };
}

async function whysFor(analysisId: string): Promise<Why[]> {
  const { data, error } = await supabase
    .from('root_cause_whys')
    .select('seq, question, answer')
    .eq('analysis_id', analysisId)
    .order('seq');
  if (error) {
    logger.error('[deviations] whysFor failed', { analysisId, error });
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      seq: Number(row.seq),
      question: String(row.question),
      answer: (row.answer as string | null) ?? null,
    };
  });
}

/**
 * Starts an analysis, in the framework the company uses.
 *
 * The framework is fixed at creation and the database refuses to
 * change it once whys are recorded or the analysis is completed — so
 * this is the one moment it is chosen.
 */
export async function startRootCause(
  companyId: string,
  deviationId: string,
  framework: Framework,
): Promise<DeviationResult<{ id: string }>> {
  const { data, error } = await supabase
    .from('root_cause_analyses')
    .insert({
      company_id: companyId,
      subject_type: 'deviation',
      subject_id: deviationId,
      framework,
    })
    .select('id')
    .single();
  if (error) {
    logger.error('[deviations] startRootCause failed', { deviationId, error });
    return failure(error, 'The analysis could not be started.');
  }
  return { ok: true, id: String((data as Record<string, unknown>).id) };
}

// ── what is on a batch or a lot ──────────────────────────────────────

/**
 * The deviations attached to a batch, with what each does to release.
 *
 * `effect` is the gate's own answer — `deviation_open_for_batch`
 * returns the impact and the release rule decides — so this maps it
 * rather than computing it. A mapping written here would go on saying
 * "blocks" after somebody changed the company's setting for an
 * undetermined impact, on the one screen where a person decides
 * whether to release a batch.
 */
export async function deviationsOnBatch(
  companyId: string,
  batchId: string,
  undeterminedBlocks: boolean,
): Promise<RecordDeviation[]> {
  const { data, error } = await supabase.rpc('deviation_open_for_batch', {
    p_company_id: companyId,
    p_batch_id: batchId,
  });
  if (error) {
    logger.error('[deviations] deviationsOnBatch failed', { batchId, error });
    return [];
  }
  return ((data as unknown[]) ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const impact = String(row.product_quality_impact);
    return {
      id: String(row.id),
      deviationNumber: String(row.deviation_number),
      title: String(row.title),
      severity: String(row.severity),
      impact,
      stateKey: String(row.state_key),
      stateLabel: String(row.state_key) === 'closed' ? 'Closed' : String(row.state_key),
      effect: effectOf(impact, String(row.state_key), undeterminedBlocks),
      attachedAs: row.attached_as === 'raised_against' ? 'raised_against' : 'linked',
    };
  });
}

/**
 * The release rule, in one place.
 *
 * yes blocks, no warns, undetermined follows the company's setting
 * (W5·11 decision 1). Closed does nothing, whatever its impact was —
 * which is why the state is a parameter and not an afterthought.
 */
function effectOf(
  impact: string, stateKey: string, undeterminedBlocks: boolean,
): RecordDeviation['effect'] {
  if (stateKey === 'closed') return 'none';
  if (impact === 'yes') return 'blocks';
  if (impact === 'undetermined') return undeterminedBlocks ? 'blocks' : 'warns';
  return 'warns';
}

/** Whether an undetermined impact blocks release for this company.
 *  Read once per screen and passed down, so one screen cannot show two
 *  answers. */
export async function undeterminedBlocksRelease(companyId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('company_rca_settings_effective', {
    p_company_id: companyId,
  });
  if (error) {
    logger.error('[deviations] undeterminedBlocksRelease failed', { companyId, error });
    //  Item 02's safe default. A failed read must not quietly release
    //  a batch that an undetermined impact would have held.
    return true;
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return row?.undetermined_blocks_release !== false;
}

// ── the linked records panel ─────────────────────────────────────────

export async function linkedRecords(deviationId: string): Promise<LinkedRecord[]> {
  const { data, error } = await supabase
    .from('deviation_links')
    .select('id, linked_type, linked_id, note')
    .eq('deviation_id', deviationId)
    .order('created_at');
  if (error) {
    logger.error('[deviations] linkedRecords failed', { deviationId, error });
    return [];
  }
  return ((data as unknown[]) ?? [])
    .map((r) => {
      const row = r as Record<string, unknown>;
      const kind = String(row.linked_type);
      if (kind !== 'capa' && kind !== 'change_control'
          && kind !== 'batch' && kind !== 'material_lot') return null;
      return {
        key: String(row.id),
        kind,
        label: String(row.linked_id).slice(0, 8),
        detail: (row.note as string | null) ?? '',
      } as LinkedRecord;
    })
    .filter((x): x is LinkedRecord => x !== null);
}

export type { ClosureSignature };
