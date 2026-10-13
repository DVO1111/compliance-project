/**
 * Dispensing and genealogy — Week 4 item 09.
 *
 * A typed surface over the RPCs in
 * supabase/migrations/20261013000000_dispensing_and_genealogy.sql.
 *
 * "Only approved lots can be dispensed, enforced at the service layer."
 * This is that service layer — and it is not the only enforcement, which
 * matters: item 09's own NOT DONE IF is "a quarantined or rejected lot can
 * be dispensed through a direct call", so the same checks run in a BEFORE
 * INSERT trigger where every writer meets them. What is here exists to
 * tell an operator before they start weighing, not to be the last line.
 *
 * The gate itself lives in dispensingModel so it can be tested without a
 * Supabase client; it is re-exported below.
 */

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';
import { checkDispensable, type DispenseGateClient, type DispenseCheck } from './dispensingModel';
import type { DispensingRecord, GenealogyEdge, FormulaLine } from './dispensingModel';

export type {
  DispensingRecord, GenealogyEdge, FormulaLine,
  DispenseGateClient, DispenseCheck, ToleranceVerdict,
} from './dispensingModel';
export {
  checkDispensable,
  requiredQuantity, toleranceVerdict, needsAuthorisation,
  unitsAgree, canVerifyDispensing, outstandingLines,
} from './dispensingModel';

export type DispenseResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

function toFailure(error: { message?: string } | null, fallback: string): DispenseResult<never> {
  const raw = error?.message ?? fallback;
  const match = raw.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/s);
  if (match) return { ok: false, code: match[1], message: match[2].trim() };
  return { ok: false, code: 'DISPENSE_ERROR', message: raw };
}

/** The ordinary entry point for the gate. */
export function isDispensable(
  batchId: string | null | undefined,
  materialLotId: string | null | undefined,
  quantity?: number | null,
): Promise<DispenseCheck> {
  return checkDispensable(supabase as unknown as DispenseGateClient, batchId, materialLotId, quantity);
}

// ── reads ────────────────────────────────────────────────────────────

export async function listDispensings(batchId: string, companyId: string): Promise<DispensingRecord[]> {
  const { data, error } = await (supabase as any)
    .from('dispensing_records')
    .select('*')
    .eq('batch_id', batchId)
    .eq('company_id', companyId)
    .order('dispensed_at', { ascending: true });
  if (error) { logger.error('listDispensings:', error); return []; }
  return data ?? [];
}

/** Dispensings awaiting a second person's check. */
export async function listUnverifiedDispensings(companyId: string): Promise<DispensingRecord[]> {
  const { data, error } = await (supabase as any)
    .from('dispensing_records')
    .select('*')
    .eq('company_id', companyId)
    .is('verified_at', null)
    .order('dispensed_at', { ascending: true });
  if (error) { logger.error('listUnverifiedDispensings:', error); return []; }
  return data ?? [];
}

/**
 * Forward trace: what went into this batch.
 *
 * Week 5 builds the real trace queries. These two reads exist because the
 * edge is stored now and a screen can already use it; they are not the
 * trace feature.
 */
export async function materialsInBatch(batchId: string, companyId: string): Promise<GenealogyEdge[]> {
  const { data, error } = await (supabase as any)
    .from('batch_material_genealogy')
    .select('*')
    .eq('batch_id', batchId)
    .eq('company_id', companyId)
    .order('last_dispensed_at', { ascending: false });
  if (error) { logger.error('materialsInBatch:', error); return []; }
  return data ?? [];
}

/**
 * Backward trace: where did this lot go.
 *
 * This is the recall direction, and the reason the genealogy table is
 * indexed on material_lot_id as well as batch_id.
 */
export async function batchesFromLot(materialLotId: string, companyId: string): Promise<GenealogyEdge[]> {
  const { data, error } = await (supabase as any)
    .from('batch_material_genealogy')
    .select('*')
    .eq('material_lot_id', materialLotId)
    .eq('company_id', companyId)
    .order('last_dispensed_at', { ascending: false });
  if (error) { logger.error('batchesFromLot:', error); return []; }
  return data ?? [];
}

/** The formula lines a batch is built from, for a dispensing screen. */
export async function listFormulaLines(formulaId: string): Promise<FormulaLine[]> {
  const { data, error } = await (supabase as any)
    .from('master_formula_materials')
    .select('id, material_id, role, quantity_per_batch, overage_pct, tolerance_pct, unit')
    .eq('formula_id', formulaId)
    .order('sort_order', { ascending: true });
  if (error) { logger.error('listFormulaLines:', error); return []; }
  return data ?? [];
}

// ── writes ───────────────────────────────────────────────────────────

export interface DispenseInput {
  batchId: string;
  materialLotId: string;
  actualQuantity: number;
  balanceIdentifier: string;
  companyId: string;
  userId: string;
  formulaMaterialId?: string | null;
  batchStageId?: string | null;
  /** Only used when no formula line is named; otherwise the database
   *  resolves it from the formula, which is the point. */
  requiredQuantity?: number | null;
  signatureId?: string | null;
  /** Required when the quantity is out of tolerance. Must not be the
   *  dispenser, and must be an active member of the company. */
  authorisedBy?: string | null;
  authorisationReason?: string | null;
  authorisationSignatureId?: string | null;
  notes?: string | null;
}

/**
 * Dispenses a quantity of a lot to a batch.
 *
 * The lot is decremented and the genealogy edge written in the same
 * transaction, by trigger, so neither can happen without the other.
 *
 * Refusals worth branching on in a screen:
 *   LINE_NOT_CLEARED                  the line has no verified clearance
 *   MATERIAL_DISPENSE_BLOCKED         the lot is not dispensable
 *   DISPENSE_AUTHORISATION_REQUIRED   out of tolerance; ask a supervisor
 *   DISPENSE_FORMULA_UNIT_MISMATCH    the formula and the lot disagree on units
 *   DISPENSE_INSUFFICIENT_QUANTITY    someone else took it first
 */
export async function dispenseMaterial(
  input: DispenseInput,
): Promise<DispenseResult<{
  dispensingId: string;
  requiredQuantity: number;
  actualQuantity: number;
  toleranceException: boolean;
  lotRemaining: number | null;
}>> {
  const { data, error } = await (supabase as any).rpc('material_dispense', {
    p_batch_id: input.batchId,
    p_material_lot_id: input.materialLotId,
    p_actual_quantity: input.actualQuantity,
    p_balance_identifier: input.balanceIdentifier,
    p_formula_material_id: input.formulaMaterialId ?? null,
    p_batch_stage_id: input.batchStageId ?? null,
    p_required_quantity: input.requiredQuantity ?? null,
    p_signature_id: input.signatureId ?? null,
    p_authorised_by: input.authorisedBy ?? null,
    p_authorisation_reason: input.authorisationReason ?? null,
    p_authorisation_signature_id: input.authorisationSignatureId ?? null,
    p_notes: input.notes ?? null,
  });

  if (error) {
    logger.warn('[dispensing] refused', { batchId: input.batchId, lot: input.materialLotId, error });
    return toFailure(error, 'Unable to record the dispensing.');
  }

  const r = data as any;
  await recordAuditEvent({
    userId: input.userId,
    companyId: input.companyId,
    action: r.tolerance_exception ? 'material_dispense_out_of_tolerance' : 'material_dispense',
    entityType: 'dispensing_record',
    entityId: r.dispensing_id,
    metadata: {
      batch_id: input.batchId,
      material_lot_id: input.materialLotId,
      required_quantity: r.required_quantity,
      actual_quantity: r.actual_quantity,
      balance: input.balanceIdentifier,
      authorised_by: input.authorisedBy ?? null,
      authorisation_reason: input.authorisationReason ?? null,
    },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for material_dispense:', e));

  return {
    ok: true,
    dispensingId: r.dispensing_id,
    requiredQuantity: Number(r.required_quantity),
    actualQuantity: Number(r.actual_quantity),
    toleranceException: r.tolerance_exception === true,
    lotRemaining: r.lot_remaining === null ? null : Number(r.lot_remaining),
  };
}

/** The second person's check. Refuses the dispenser. */
export async function verifyDispensing(
  dispensingId: string,
  signatureId?: string | null,
): Promise<DispenseResult<{ verifiedBy: string }>> {
  const { data, error } = await (supabase as any).rpc('material_dispense_verify', {
    p_dispensing_id: dispensingId,
    p_signature_id: signatureId ?? null,
  });
  if (error) {
    logger.warn('[dispensing] verification refused', { dispensingId, error });
    return toFailure(error, 'Unable to verify the dispensing.');
  }
  return { ok: true, verifiedBy: (data as any)?.verified_by };
}
