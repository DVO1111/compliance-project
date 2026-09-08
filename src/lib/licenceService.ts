import { supabase } from './supabase';
import { logger } from './logger';

/* ═══════════════════════════════════════════════════════════════
   Licence Lifecycle — Service Layer  (Deliverable 06)
   ═══════════════════════════════════════════════════════════════

   This service talks to `regulatory_licences`, the Regulatory Affairs
   licence record that D05 linked to the product registry. It is NOT the
   older License Vault (`licenses` / `licenseService.ts`), which is left
   alone and still works.

   Nothing here is a security boundary. The browser holds the anon key
   and talks straight to PostgREST, so every rule this file appears to
   enforce is really enforced by a trigger or an RPC in
   20260921000000_licence_lifecycle.sql. What the functions below add is
   a readable message before the write, rather than a raw Postgres error
   after it.
*/

// ── Types ────────────────────────────────────────────────────────────

export type LicenceStatus =
  | 'draft'
  | 'active'
  | 'renewal_due'
  | 'renewal_in_progress'
  | 'renewed'
  | 'expired'
  | 'suspended'
  | 'discontinued';

export const LICENCE_STATUS_LABELS: Record<LicenceStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  renewal_due: 'Renewal Due',
  renewal_in_progress: 'Renewal In Progress',
  renewed: 'Renewed / Superseded',
  expired: 'Expired',
  suspended: 'Suspended',
  discontinued: 'Discontinued',
};

export interface RegulatoryLicence {
  id: string;
  company_id: string;
  licence_type: string;
  name: string;
  product_name: string | null;
  product_id: string | null;
  registration_number: string | null;
  regulatory_body: string;
  issue_date: string | null;
  expiry_date: string | null;
  renewal_lead_days: number;
  status: LicenceStatus;
  discontinued_at: string | null;
  superseded_by_licence_id: string | null;
  file_name: string | null;
  file_url: string | null;
  submission_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicenceRenewalPolicy {
  company_id: string;
  alert_months: number[];
  monthly_from_month: number;
  suppress_when_discontinued: boolean;
  renewal_exception_allows_initiation: boolean;
  renewal_exception_allows_release: boolean;
  production_notify_roles: string[];
  renewal_template_key: string;
  /** true when no row exists and the defaults are in force. */
  is_default?: boolean;
}

export interface LicenceRenewalAlert {
  id: string;
  company_id: string;
  licence_id: string;
  renewal_cycle_expiry: string;
  milestone_months: number;
  due_date: string;
  raised_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export interface LicenceRenewalStep {
  id: string;
  company_id: string;
  licence_id: string;
  renewal_cycle_expiry: string;
  step_no: number;
  title: string;
  description: string;
  deadline: string;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
}

export type VariationClass = 'minor' | 'major';

export type VariationType =
  | 'labelling_artwork'
  | 'pack_size'
  | 'shelf_life_extension'
  | 'minor_specification_change'
  | 'administrative_change'
  | 'name_change'
  | 'formulation_change'
  | 'manufacturing_site_change'
  | 'manufacturing_process_change'
  | 'api_source_change'
  | 'indication_change'
  | 'dosage_form_change'
  | 'shelf_life_reduction';

export type VariationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'query_raised'
  | 'approved'
  | 'implemented'
  | 'rejected'
  | 'withdrawn';

export interface LicenceVariation {
  id: string;
  company_id: string;
  licence_id: string;
  product_id: string | null;
  reference: string | null;
  variation_class: VariationClass;
  variation_type: VariationType;
  title: string;
  description: string;
  justification: string | null;
  impact_assessment: string | null;
  status: VariationStatus;
  submitted_date: string | null;
  decision_date: string | null;
  napams_reference: string | null;
  resulting_expiry_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Variation types that always require prior approval. This mirrors
 * `licence_variation_minimum_class()` in the database, which is the one
 * that actually refuses the write — keep the two in step.
 */
export const MAJOR_ONLY_VARIATION_TYPES: VariationType[] = [
  'formulation_change',
  'manufacturing_site_change',
  'manufacturing_process_change',
  'api_source_change',
  'indication_change',
  'dosage_form_change',
  'shelf_life_reduction',
];

export const VARIATION_TYPE_LABELS: Record<VariationType, string> = {
  labelling_artwork: 'Labelling / artwork change',
  pack_size: 'Pack size',
  shelf_life_extension: 'Shelf-life extension',
  minor_specification_change: 'Minor specification change',
  administrative_change: 'Administrative change',
  name_change: 'Product name change',
  formulation_change: 'Formulation change',
  manufacturing_site_change: 'Manufacturing site change',
  manufacturing_process_change: 'Manufacturing process change',
  api_source_change: 'API source change',
  indication_change: 'Indication change',
  dosage_form_change: 'Dosage form change',
  shelf_life_reduction: 'Shelf-life reduction',
};

export function variationMinimumClass(type: VariationType): VariationClass {
  return MAJOR_ONLY_VARIATION_TYPES.includes(type) ? 'major' : 'minor';
}

/** True when the chosen classification is lower than the type allows. */
export function isVariationClassTooLow(type: VariationType, chosen: VariationClass): boolean {
  return variationMinimumClass(type) === 'major' && chosen !== 'major';
}

/**
 * The fields a major variation must carry before it can be approved.
 * Mirrors the check in `licence_variation_approve()`.
 */
export function missingMajorVariationFields(
  v: Pick<LicenceVariation, 'variation_class' | 'justification' | 'impact_assessment'>,
): string[] {
  if (v.variation_class !== 'major') return [];
  const missing: string[] = [];
  if (!v.justification?.trim()) missing.push('justification');
  if (!v.impact_assessment?.trim()) missing.push('impact assessment');
  return missing;
}

// ── Alert schedule ───────────────────────────────────────────────────

export const DEFAULT_ALERT_MONTHS = [12, 6, 3];
export const DEFAULT_MONTHLY_FROM_MONTH = 3;

/**
 * 12, 6, 3, then monthly — expanded to the milestone list, descending.
 * Mirrors `licence_alert_milestones()`; used for previewing a schedule
 * in the settings UI before it is saved.
 */
export function expandAlertMilestones(
  alertMonths: number[] = DEFAULT_ALERT_MONTHS,
  monthlyFromMonth: number = DEFAULT_MONTHLY_FROM_MONTH,
): number[] {
  const set = new Set<number>();
  for (const m of alertMonths) if (m >= 0) set.add(m);
  for (let m = Math.max(monthlyFromMonth - 1, 0); m >= 0; m--) set.add(m);
  return [...set].sort((a, b) => b - a);
}

export function describeMilestone(months: number): string {
  if (months === 0) return 'At expiry';
  if (months === 1) return '1 month before expiry';
  return `${months} months before expiry`;
}

// ── The batch gate, at the service layer ─────────────────────────────

/**
 * Thrown when a batch operation is refused because the product's
 * licence is not in force. The database refuses it too — this exists so
 * the UI can show the reason before attempting the write.
 */
export class LicenceBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'LicenceBlockedError';
  }
}

export type BatchOperation = 'initiation' | 'release';

/**
 * Null when the operation may proceed; otherwise a message naming the
 * licence, its expiry date and its renewal status.
 *
 * On any transport failure this returns null rather than inventing a
 * block: the trigger is the authority and will refuse the write anyway,
 * so failing open here costs a clearer message, not the control.
 */
export async function licenceBlockReason(
  productId: string | null | undefined,
  operation: BatchOperation,
): Promise<string | null> {
  if (!productId) return null;
  const { data, error } = await (supabase as any).rpc('licence_block_reason', {
    p_product_id: productId,
    p_operation: operation,
  });
  if (error) {
    logger.warn('licenceBlockReason: falling back to the database trigger', error);
    return null;
  }
  return (data as string | null) ?? null;
}

/** Throws {@link LicenceBlockedError} when the operation is not allowed. */
export async function assertBatchAllowed(
  productId: string | null | undefined,
  operation: BatchOperation,
): Promise<void> {
  const reason = await licenceBlockReason(productId, operation);
  if (reason) throw new LicenceBlockedError(reason);
}

// ── Licences ─────────────────────────────────────────────────────────

export async function listLicences(companyId: string): Promise<RegulatoryLicence[]> {
  const { data, error } = await (supabase as any)
    .from('regulatory_licences')
    .select('*')
    .eq('company_id', companyId)
    .order('expiry_date', { ascending: true, nullsFirst: false });
  if (error) { logger.error('listLicences:', error); return []; }
  return data ?? [];
}

export async function listLicencesForProduct(productId: string): Promise<RegulatoryLicence[]> {
  const { data, error } = await (supabase as any)
    .from('regulatory_licences')
    .select('*')
    .eq('product_id', productId)
    .order('expiry_date', { ascending: false });
  if (error) { logger.error('listLicencesForProduct:', error); return []; }
  return data ?? [];
}

export interface ApprovalCascadeStep {
  step: string;
  ok: boolean;
  detail: string;
  recipients?: number;
  alerts_created?: number;
}

export interface ApprovalCascadeResult {
  licence_id: string;
  company_id: string;
  registration_number: string;
  expiry_date: string;
  steps: ApprovalCascadeStep[];
}

/**
 * Records the grant of a licence. One call, one transaction, five
 * separately audited steps: the grant, the registration capture, the
 * product status update, the notification to production, and the
 * renewal schedule.
 */
export async function recordLicenceApproval(args: {
  licenceId: string;
  registrationNumber: string;
  expiryDate: string;
  issueDate?: string;
  notify?: boolean;
}): Promise<ApprovalCascadeResult> {
  const { data, error } = await (supabase as any).rpc('licence_record_approval', {
    p_licence_id: args.licenceId,
    p_registration_number: args.registrationNumber,
    p_expiry_date: args.expiryDate,
    p_issue_date: args.issueDate ?? new Date().toISOString().slice(0, 10),
    p_notify: args.notify ?? true,
  });
  if (error) throw error;
  return data as ApprovalCascadeResult;
}

/**
 * Closes a licence as renewed and creates its successor. The superseded
 * record keeps its own expiry date, so a batch released three years ago
 * can still be explained against the certificate that was in force then.
 */
export async function completeLicenceRenewal(args: {
  licenceId: string;
  newRegistrationNumber: string;
  newExpiryDate: string;
  comment: string;
  newIssueDate?: string;
}): Promise<{ previous_licence_id: string; new_licence_id: string }> {
  const { data, error } = await (supabase as any).rpc('licence_complete_renewal', {
    p_licence_id: args.licenceId,
    p_new_registration_number: args.newRegistrationNumber,
    p_new_expiry_date: args.newExpiryDate,
    p_comment: args.comment,
    p_new_issue_date: args.newIssueDate ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data;
}

// ── Renewal alerts and steps ─────────────────────────────────────────

export interface AlertGenerationResult {
  company_id: string;
  as_of: string;
  milestones: number[];
  alerts_created: number;
  renewal_steps_created: number;
  licences_flagged_renewal_due: number;
  licences_suppressed: number;
}

/**
 * Raises whatever renewal alerts are now due. Idempotent — safe to call
 * on every load, or from a scheduled job, or both.
 */
export async function generateRenewalAlerts(
  companyId: string,
  asOf?: string,
): Promise<AlertGenerationResult | null> {
  const { data, error } = await (supabase as any).rpc('licence_generate_renewal_alerts', {
    p_company_id: companyId,
    ...(asOf ? { p_as_of: asOf } : {}),
  });
  if (error) { logger.error('generateRenewalAlerts:', error); return null; }
  return data as AlertGenerationResult;
}

export async function listOpenAlerts(companyId: string): Promise<LicenceRenewalAlert[]> {
  const { data, error } = await (supabase as any)
    .from('licence_renewal_alerts')
    .select('*')
    .eq('company_id', companyId)
    .is('acknowledged_at', null)
    .order('due_date', { ascending: true });
  if (error) { logger.error('listOpenAlerts:', error); return []; }
  return data ?? [];
}

export async function acknowledgeAlert(alertId: string, userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('licence_renewal_alerts')
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: userId })
    .eq('id', alertId);
  if (error) throw error;
}

export async function listRenewalSteps(licenceId: string): Promise<LicenceRenewalStep[]> {
  const { data, error } = await (supabase as any)
    .from('licence_renewal_steps')
    .select('*')
    .eq('licence_id', licenceId)
    .order('step_no', { ascending: true });
  if (error) { logger.error('listRenewalSteps:', error); return []; }
  return data ?? [];
}

export async function setRenewalStepCompleted(
  stepId: string,
  completed: boolean,
  userId: string,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('licence_renewal_steps')
    .update({
      is_completed: completed,
      completed_at: completed ? new Date().toISOString() : null,
      completed_by: completed ? userId : null,
    })
    .eq('id', stepId);
  if (error) throw error;
}

// ── Policy ───────────────────────────────────────────────────────────

export async function getRenewalPolicy(companyId: string): Promise<LicenceRenewalPolicy | null> {
  const { data, error } = await (supabase as any).rpc('licence_renewal_policy', {
    p_company_id: companyId,
  });
  if (error) { logger.error('getRenewalPolicy:', error); return null; }
  return data as LicenceRenewalPolicy;
}

export async function saveRenewalPolicy(
  companyId: string,
  patch: Partial<Omit<LicenceRenewalPolicy, 'company_id' | 'is_default'>>,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('licence_renewal_policies')
    .upsert({ company_id: companyId, ...patch, updated_at: new Date().toISOString() },
            { onConflict: 'company_id' });
  if (error) throw error;
}

/** Deleting the row is how a company returns to the shipped defaults. */
export async function resetRenewalPolicy(companyId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('licence_renewal_policies')
    .delete()
    .eq('company_id', companyId);
  if (error) throw error;
}

// ── Variations ───────────────────────────────────────────────────────

export async function listVariations(licenceId: string): Promise<LicenceVariation[]> {
  const { data, error } = await (supabase as any)
    .from('licence_variations')
    .select('*')
    .eq('licence_id', licenceId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('listVariations:', error); return []; }
  return data ?? [];
}

export async function createVariation(
  companyId: string,
  userId: string,
  v: {
    licence_id: string;
    product_id?: string | null;
    variation_class: VariationClass;
    variation_type: VariationType;
    title: string;
    description?: string;
    justification?: string;
    impact_assessment?: string;
    reference?: string;
  },
): Promise<LicenceVariation> {
  if (isVariationClassTooLow(v.variation_type, v.variation_class)) {
    throw new Error(
      `"${VARIATION_TYPE_LABELS[v.variation_type]}" is a major variation and cannot be filed as minor.`,
    );
  }
  const { data, error } = await (supabase as any)
    .from('licence_variations')
    .insert({ ...v, company_id: companyId, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveVariation(args: {
  variationId: string;
  comment: string;
  resultingExpiryDate?: string | null;
}): Promise<unknown> {
  const { data, error } = await (supabase as any).rpc('licence_variation_approve', {
    p_variation_id: args.variationId,
    p_comment: args.comment,
    p_resulting_expiry_date: args.resultingExpiryDate ?? null,
  });
  if (error) throw error;
  return data;
}

export async function implementVariation(variationId: string, comment: string): Promise<unknown> {
  const { data, error } = await (supabase as any).rpc('licence_variation_implement', {
    p_variation_id: variationId,
    p_comment: comment,
  });
  if (error) throw error;
  return data;
}

// ── Dashboard ────────────────────────────────────────────────────────

export interface LicenceRenewalDashboard {
  company_id: string;
  milestones: number[];
  open_alerts: Array<{
    alert_id: string;
    licence_id: string;
    licence_name: string;
    registration_number: string | null;
    milestone_months: number;
    expiry_date: string;
    renewal_status: LicenceStatus;
    raised_at: string;
  }>;
  open_steps: number;
  overdue_steps: number;
  expired_licences: number;
  open_variations: number;
}

export async function getRenewalDashboard(
  companyId: string,
): Promise<LicenceRenewalDashboard | null> {
  const { data, error } = await (supabase as any).rpc('licence_renewal_dashboard', {
    p_company_id: companyId,
  });
  if (error) { logger.error('getRenewalDashboard:', error); return null; }
  return data as LicenceRenewalDashboard;
}
