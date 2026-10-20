/**
 * Material lots — the data layer for W4·15 (MT-01 … MT-08).
 *
 * The backend for this section already existed: material_lots, the
 * quarantine gate, certificate verification, testing, release and
 * rejection were built in items 04–06. This module does not reimplement
 * any of it. It reads the lots a list needs, and calls the existing
 * functions for the four things a screen can do — record sampling,
 * record a test result, release, reject.
 *
 * ONE THING IS NEW AND IT MATTERS. `releaseReadiness` reads
 * material_lot_release_conditions, which is the same function
 * material_lot_release_block_reason now derives from. Before W4·15 the
 * only way to ask "can this be released" returned the FIRST problem,
 * which is right for a trigger and wrong for a screen that has to show
 * everything before the attempt. There is no second copy of the rule
 * here: if this module computed readiness itself, the card and the
 * gate would be two answers to one question.
 *
 * RELEASE AND REJECTION ARE SIGNED. Both take a signature id, and both
 * are sign-first: electronicSignatureService hashes the record, and a
 * signature taken after the fact would cover a different record than
 * the one the person read. See signAndRelease below.
 */

import { logger } from '../logger';
import { signElectronicRecord } from '../electronicSignatureService';
import { summarise, type ReleaseCondition, type Readiness } from './releaseReadiness';

/**
 * The client, loosely typed.
 *
 * database.types.ts is generated from the deployed schema and does not
 * know material_lot_sampling or the two new functions. Widening once
 * here keeps the cast in one place with one reason; the row shapes
 * below are declared rather than inferred, so a renamed column still
 * breaks the screens that read it.
 */
async function db(): Promise<any> {
  const { supabase } = await import('../supabase');
  return supabase;
}

/* ── Rows ──────────────────────────────────────────────────────────── */

export type LotStatus =
  | 'quarantine' | 'under_test' | 'approved' | 'rejected' | 'released'
  | 'retest_due' | 'expired' | (string & {});

export interface MaterialLotRow {
  id: string;
  company_id: string;
  lot_number: string;
  material_id: string;
  supplier_id: string | null;
  supplier_batch_number: string | null;
  quantity_received: number;
  quantity_available: number;
  unit_of_measure: string;
  received_date: string;
  manufacture_date: string | null;
  supplier_expiry_date: string | null;
  retest_due_date: string | null;
  storage_location: string | null;
  status: LotStatus;
}

export interface SamplingRow {
  id: string;
  material_lot_id: string;
  reference: string;
  sampled_on: string;
  containers_sampled: number;
  containers_total: number;
  sampling_plan: string | null;
}

export type LotResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

/* ── Errors ────────────────────────────────────────────────────────── */

const MESSAGES: Record<string, string> = {
  MATERIAL_NO_LOT:            'That lot no longer exists.',
  MATERIAL_FORBIDDEN:         'You are not a member of the workspace that owns this lot.',
  MATERIAL_RELEASE_BLOCKED:   'Release is blocked. The conditions are listed on the lot.',
  MATERIAL_NOT_QA_AUTHORITY:  'Release is signed by a designated QA release authority.',
  NUMBERING_NO_FORMAT:        'No numbering format is configured for this workspace.',
};

export function describeError(raw: string): { code: string; message: string } {
  const m = /\b(MATERIAL_[A-Z_]+|NUMBERING_[A-Z_]+|SUPPLIER_[A-Z_]+)(?::\s*(.*))?/s.exec(raw ?? '');
  if (!m) return { code: 'MATERIAL_UNKNOWN', message: raw || 'That did not work.' };
  const [, code, detail] = m;
  const explained = detail?.trim();
  //  The database's detail is usually the sentence worth showing — the
  //  release gate's refusal names the lot and the reason. Prefer it
  //  over the generic line.
  return { code, message: explained && explained.length > 0 ? explained : MESSAGES[code] ?? raw };
}

function fail<T>(where: string, error: unknown): LotResult<T> {
  const raw = (error as { message?: string })?.message ?? String(error);
  const { code, message } = describeError(raw);
  logger.error(`materialLotService.${where}`, { code, raw });
  return { ok: false, code, message };
}

/* ── Reading ───────────────────────────────────────────────────────── */

/** MT-01. Quarantined lots first — they are the ones needing work. */
export async function listLots(
  companyId: string, opts: { status?: LotStatus; limit?: number } = {},
): Promise<MaterialLotRow[]> {
  const supabase = await db();
  let q = supabase
    .from('material_lots')
    .select('*')
    .eq('company_id', companyId);

  if (opts.status) q = q.eq('status', opts.status);

  const { data, error } = await q
    .order('received_date', { ascending: false })
    .limit(opts.limit ?? 100);

  if (error) { logger.error('materialLotService.listLots', error); return []; }
  return (data ?? []) as MaterialLotRow[];
}

export async function getLot(lotId: string): Promise<MaterialLotRow | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('material_lots').select('*').eq('id', lotId).maybeSingle();
  if (error) { logger.error('materialLotService.getLot', error); return null; }
  return (data ?? null) as MaterialLotRow | null;
}

/**
 * Everything that stops this lot being released, met or not.
 *
 * The whole point of MT-06: the card leads with the complete list
 * before anything is attempted. Returning only the failures here would
 * reproduce the bug the design rules out one layer down.
 */
export async function releaseReadiness(lotId: string): Promise<Readiness> {
  const supabase = await db();
  const { data, error } = await supabase.rpc('material_lot_release_conditions', {
    p_lot_id: lotId,
  });

  if (error) {
    logger.error('materialLotService.releaseReadiness', error);
    //  An empty list must NOT read as "ready": summarise would report
    //  canRelease true, and a failed read would look like a clean lot.
    //  One synthetic blocking condition says what actually happened.
    return summarise([{
      key: 'readiness_unavailable', met: false, blocking: true,
      title: 'Release conditions could not be read',
      detail: 'The release checks could not be loaded, so nothing can be confirmed. '
        + 'Reload the page before attempting a release.',
      waitingOn: 'WAITING ON THE SYSTEM', sortOrder: 0,
    }]);
  }

  const rows = (data ?? []) as {
    condition_key: string; met: boolean; blocking: boolean;
    title: string; detail: string; waiting_on: string | null; sort_order: number;
  }[];

  const conditions: ReleaseCondition[] = rows.map((r) => ({
    key: r.condition_key,
    met: r.met,
    blocking: r.blocking,
    title: r.title,
    detail: r.detail,
    waitingOn: r.waiting_on,
    sortOrder: r.sort_order,
  }));

  return summarise(conditions);
}

export async function listSampling(lotId: string): Promise<SamplingRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('material_lot_sampling').select('*')
    .eq('material_lot_id', lotId)
    .order('sampled_on', { ascending: false });
  if (error) { logger.error('materialLotService.listSampling', error); return []; }
  return (data ?? []) as SamplingRow[];
}

/* ── Writing ───────────────────────────────────────────────────────── */

/** MT-05's sampling record. */
export async function recordSampling(params: {
  lotId: string; containersSampled: number; containersTotal: number;
  samplingPlan?: string; sampledOn?: string; note?: string;
}): Promise<LotResult<SamplingRow>> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.rpc('material_lot_record_sampling', {
      p_lot_id: params.lotId,
      p_containers_sampled: params.containersSampled,
      p_containers_total: params.containersTotal,
      p_sampling_plan: params.samplingPlan ?? null,
      p_sampled_on: params.sampledOn ?? null,
      p_note: params.note ?? null,
    });
    if (error) return fail('recordSampling', error);
    return { ok: true, data: data as SamplingRow };
  } catch (e) { return fail('recordSampling', e); }
}

/** MT-05's test entry. The pass/fail verdict is the database's. */
export async function recordTestResult(params: {
  lotId: string; testDefinitionId: string;
  actualValue?: number | null; actualText?: string | null;
  testDate?: string; method?: string; instrument?: string;
}): Promise<LotResult<unknown>> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.rpc('material_test_record_result', {
      p_lot_id: params.lotId,
      p_test_def_id: params.testDefinitionId,
      p_actual_value: params.actualValue ?? null,
      p_actual_text: params.actualText ?? null,
      p_test_date: params.testDate ?? null,
      p_method: params.method ?? null,
      p_instrument: params.instrument ?? null,
    });
    if (error) return fail('recordTestResult', error);
    return { ok: true, data };
  } catch (e) { return fail('recordTestResult', e); }
}

/**
 * MT-07. Sign, then release.
 *
 * SIGN-FIRST IS NOT AN ORDERING PREFERENCE. The signature covers a
 * hash of the record as it stood when the person read and signed it.
 * Releasing first and signing after would produce a signature over a
 * record that had already moved — which is precisely what a signature
 * is supposed to make impossible. A release that then fails leaves the
 * signature unspent, which is the safe direction: an unused signature
 * is an audit entry, an unsigned release is a finding.
 */
export async function signAndRelease(params: {
  lotId: string;
  companyId: string;
  password: string;
  releaseType?: 'full' | 'conditional';
  justification?: string;
  authorisedBy?: string;
  comment?: string;
}): Promise<LotResult<unknown>> {
  try {
    //  'release' is the lifecycle action key seeded for material lots,
    //  and 'released' is one of the seven meanings §11.50 allows. They
    //  are different vocabularies and both are closed; passing the
    //  wrong one is refused by the database, not by this module.
    const signed = await signElectronicRecord({
      companyId: params.companyId,
      entityType: 'material_lot',
      entityId: params.lotId,
      action: 'release',
      meaning: 'released',
      password: params.password,
      reason: params.justification,
    });

    if (!signed.ok) {
      return { ok: false, code: signed.code, message: signed.message };
    }

    const supabase = await db();
    const { data, error } = await supabase.rpc('material_lot_release', {
      p_lot_id: params.lotId,
      p_signature_id: signed.signatureId,
      p_release_type: params.releaseType ?? 'full',
      p_justification: params.justification ?? null,
      p_authorised_by: params.authorisedBy ?? null,
      p_comment: params.comment ?? null,
    });
    if (error) return fail('signAndRelease', error);
    return { ok: true, data };
  } catch (e) { return fail('signAndRelease', e); }
}

/** MT-08. The three dispositions the design names. */
export type Disposition = 'return_to_supplier' | 'destruction' | 'downgrade';

export async function signAndReject(params: {
  lotId: string;
  companyId: string;
  password: string;
  disposition: Disposition;
  reason: string;
  note?: string;
}): Promise<LotResult<unknown>> {
  try {
    //  The disposition is NOT the meaning. §11.50's vocabulary has one
    //  word for this — 'rejected' — and which disposition follows is a
    //  property of the rejection record, not of the signature. Writing
    //  "Rejected · return to supplier" into the meaning column would
    //  put free text where a closed vocabulary is the control.
    const signed = await signElectronicRecord({
      companyId: params.companyId,
      entityType: 'material_lot',
      entityId: params.lotId,
      action: 'reject',
      meaning: 'rejected',
      password: params.password,
      reason: params.reason,
      metadata: { disposition: params.disposition },
    });

    if (!signed.ok) {
      return { ok: false, code: signed.code, message: signed.message };
    }

    const supabase = await db();
    const { data, error } = await supabase.rpc('material_lot_reject', {
      p_lot_id: params.lotId,
      p_disposition: params.disposition,
      p_reason: params.reason,
      p_note: params.note ?? null,
      p_signature_id: signed.signatureId,
    });
    if (error) return fail('signAndReject', error);
    return { ok: true, data };
  } catch (e) { return fail('signAndReject', e); }
}
