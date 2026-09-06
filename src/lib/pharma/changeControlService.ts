/**
 * Change Control — now backed by the Lifecycle Engine (Deliverable 03).
 *
 * `change_controls.status` is a DERIVED read model. The database keeps it
 * in step with entity_current_state and rejects any direct write, so
 * reads below are unchanged while the engine owns the workflow. The only
 * way to move a Change Control is `transitionChangeControl()`.
 */

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';
import { transition as lifecycleTransition, getAvailableActions } from '../lifecycleService';
import type { LifecycleAction } from '../lifecycleService';

export type ChangeControlStatus =
  | 'draft'
  | 'impact_assessment'
  | 'pending_approval'
  | 'approved'
  | 'implementing'
  | 'verification'
  | 'closed'
  | 'rejected';

export type ChangeType = 'sop' | 'formulation' | 'equipment' | 'process' | 'supplier' | 'packaging' | 'other';
export type ChangeCategory = 'major' | 'minor' | 'emergency';

export interface ChangeControl {
  id: string;
  company_id: string;
  change_number: string;
  title: string;
  description: string | null;
  change_type: ChangeType;
  change_category: ChangeCategory;
  impact_assessment: string | null;
  regulatory_impact: boolean;
  validation_required: boolean;
  status: ChangeControlStatus;
  effective_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listChangeControls(companyId: string, status?: ChangeControlStatus): Promise<ChangeControl[]> {
  let query = (supabase as any)
    .from('change_controls')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) { logger.error('listChangeControls:', error); return []; }
  return data ?? [];
}

export async function getChangeControl(id: string, companyId: string): Promise<ChangeControl | null> {
  const { data, error } = await (supabase as any)
    .from('change_controls')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) { logger.error('getChangeControl:', error); return null; }
  return data;
}

export async function createChangeControl(
  companyId: string,
  userId: string,
  cc: Pick<ChangeControl, 'title' | 'description' | 'change_type' | 'change_category' | 'regulatory_impact' | 'validation_required'>
): Promise<ChangeControl> {
  // Auto-generate change_number: CC-YYYY-XXXX
  const year = new Date().getFullYear();
  const { count } = await (supabase as any)
    .from('change_controls')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);
  const seq = String((count ?? 0) + 1).padStart(4, '0');
  const changeNumber = `CC-${year}-${seq}`;

  // `status` is not set here. A trigger initialises the record's lifecycle
  // on insert and derives status from it, so naming a status would either
  // be redundant or a lie the database immediately corrects.
  const { data, error } = await (supabase as any)
    .from('change_controls')
    .insert({ ...cc, company_id: companyId, change_number: changeNumber, created_by: userId })
    .select()
    .single();

  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: 'create_change_control',
    entityType: 'change_control',
    entityId: data.id,
    metadata: { change_number: changeNumber, title: cc.title },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for create_change_control:', e));

  return data;
}

/** Actions the engine will currently allow on this record, for the UI. */
export async function getChangeControlActions(
  id: string,
  companyId: string,
): Promise<LifecycleAction[]> {
  return getAvailableActions('change_control', id, companyId);
}

/**
 * Move a Change Control to a new state.
 *
 * The state change goes through `lifecycle_transition`, which is the
 * authoritative path and the security boundary: tenancy, actor identity,
 * locked/terminal states and the mandatory-comment rule are all enforced
 * in the database. `status` is not written here — the database derives it.
 *
 * The seeded graph is any-to-any, matching what the table permitted
 * before this module was adopted, so no previously-possible move has
 * become impossible. Moving into `rejected` now requires a comment
 * server-side; previously that was enforced only by the browser.
 *
 * Returns nothing on success and throws on rejection, preserving the
 * contract the UI already expects from this function.
 */
export async function transitionChangeControl(
  id: string,
  companyId: string,
  userId: string,
  newStatus: ChangeControlStatus,
  extra?: { rejectedReason?: string; impactAssessment?: string; effectiveDate?: string }
): Promise<void> {
  const result = await lifecycleTransition({
    entityType: 'change_control',
    entityId: id,
    actionKey: `set_${newStatus}`,
    companyId,
    // the reason IS the comment the engine requires on the rejected path
    comment: newStatus === 'rejected' ? (extra?.rejectedReason ?? undefined) : undefined,
    metadata: { requested_status: newStatus },
  });

  if (!result.ok) throw new Error(result.message);

  // The actor the DATABASE resolved from the session. Everything below
  // attributes to this, never to the `userId` argument: the engine already
  // refuses to record a transition against a user other than the caller,
  // and the surrounding metadata should not be weaker than the history it
  // describes.
  const actorId = result.data.actor_id;

  // Side-effect columns only — never `status`. These are attributes of the
  // record, not a second copy of its state, so writing them here is not a
  // dual write. Deliberately after the transition: if the engine refuses
  // the move, none of this should be recorded.
  const updates: Record<string, unknown> = {};
  if (newStatus === 'approved') { updates.approved_by = actorId; updates.approved_at = new Date().toISOString(); }
  if (newStatus === 'rejected') updates.rejected_reason = extra?.rejectedReason ?? null;
  if (extra?.impactAssessment) updates.impact_assessment = extra.impactAssessment;
  if (extra?.effectiveDate) updates.effective_date = extra.effectiveDate;

  if (Object.keys(updates).length > 0) {
    const { error } = await (supabase as any)
      .from('change_controls')
      .update(updates)
      .eq('id', id)
      .eq('company_id', companyId);
    // the state has already moved and is recorded in lifecycle history;
    // failing to stamp an attribute must not be reported as a failed move
    if (error) logger.error('change_control attribute update failed after transition:', error);
  }

  await recordAuditEvent({
    userId: actorId ?? '',
    companyId,
    action: `change_control_${newStatus}`,
    entityType: 'change_control',
    entityId: id,
    metadata: { new_status: newStatus, history_id: result.data.history_id, ...extra },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for change_control status update:', e));
}

/**
 * @deprecated Renamed to `transitionChangeControl`. Kept so no call site
 * silently keeps a direct-write mental model; the implementation is the
 * engine path and writing `status` directly is rejected by the database.
 */
export const updateChangeControlStatus = transitionChangeControl;

export const CC_STATUS_LABELS: Record<ChangeControlStatus, string> = {
  draft: 'Draft',
  impact_assessment: 'Impact Assessment',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  implementing: 'Implementing',
  verification: 'Verification',
  closed: 'Closed',
  rejected: 'Rejected',
};

export const CC_STATUS_COLORS: Record<ChangeControlStatus, string> = {
  draft: 'text-gray-600 bg-gray-50 border-gray-200',
  impact_assessment: 'text-purple-600 bg-purple-50 border-purple-200',
  pending_approval: 'text-amber-600 bg-amber-50 border-amber-200',
  approved: 'text-green-600 bg-green-50 border-green-200',
  implementing: 'text-blue-600 bg-blue-50 border-blue-200',
  verification: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  closed: 'text-teal-600 bg-teal-50 border-teal-200',
  rejected: 'text-red-600 bg-red-50 border-red-200',
};

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  sop: 'SOP / Procedure',
  formulation: 'Formulation',
  equipment: 'Equipment',
  process: 'Process',
  supplier: 'Supplier',
  packaging: 'Packaging',
  other: 'Other',
};
