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
import { transition as lifecycleTransition, getAvailableActions, signAndTransition } from '../lifecycleService';
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
  //  What was done, and the evidence it worked. Both are preconditions
  //  in the database: a record cannot reach verification without the
  //  first or be closed without the second.
  implementation_summary: string | null;
  verification_summary: string | null;
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
export interface ChangeControlTransitionInput {
  /** Required on every move: the record of what was done at this stage. */
  comment?: string;
  rejectedReason?: string;
  impactAssessment?: string;
  implementationSummary?: string;
  verificationSummary?: string;
  effectiveDate?: string;
}

/**
 * The stage evidence, written to the record itself.
 *
 * SEPARATE, AND FIRST. See transitionChangeControl for why the order
 * matters; this exists so the write has one definition and the modal can
 * also save a draft of the assessment without moving the record.
 */
export async function saveChangeControlEvidence(
  id: string,
  companyId: string,
  fields: Pick<ChangeControlTransitionInput,
    'impactAssessment' | 'implementationSummary' | 'verificationSummary' | 'effectiveDate'>,
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (fields.impactAssessment !== undefined) updates.impact_assessment = fields.impactAssessment;
  if (fields.implementationSummary !== undefined) updates.implementation_summary = fields.implementationSummary;
  if (fields.verificationSummary !== undefined) updates.verification_summary = fields.verificationSummary;
  if (fields.effectiveDate !== undefined) updates.effective_date = fields.effectiveDate;
  if (Object.keys(updates).length === 0) return;

  const { error } = await (supabase as any)
    .from('change_controls')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId);
  if (error) throw error;
}

export async function transitionChangeControl(
  id: string,
  companyId: string,
  userId: string,
  newStatus: ChangeControlStatus,
  extra?: ChangeControlTransitionInput
): Promise<void> {
  //  EVIDENCE IS WRITTEN BEFORE THE MOVE, and that order is the whole
  //  point rather than a detail.
  //
  //  The database now checks the evidence ON ENTRY to the next state:
  //  no impact assessment, no pending_approval. This function used to
  //  write those columns AFTER the transition, which under the new rule
  //  would refuse every move and then save the text the move needed —
  //  failing on the first attempt and succeeding on a second identical
  //  one, which is the most confusing shape a bug can take.
  //
  //  Writing first also means a refused transition does not discard what
  //  the person typed. The text is an attribute of the record, not a
  //  claim about its state, so it is not a half-finished transition.
  await saveChangeControlEvidence(id, companyId, {
    impactAssessment: extra?.impactAssessment,
    implementationSummary: extra?.implementationSummary,
    verificationSummary: extra?.verificationSummary,
    effectiveDate: extra?.effectiveDate,
  });

  const result = await lifecycleTransition({
    entityType: 'change_control',
    entityId: id,
    actionKey: `set_${newStatus}`,
    companyId,
    //  Every transition now requires a comment server-side. The
    //  rejection reason IS that comment on the rejected path, so a
    //  caller that supplies only a reason still satisfies the rule.
    comment: extra?.comment ?? extra?.rejectedReason ?? undefined,
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
  //  Stage evidence is NOT written here any more — it went in before the
  //  transition, because the database checks it on entry. What remains
  //  are the two stamps that can only be known once the move succeeded.
  const updates: Record<string, unknown> = {};
  if (newStatus === 'approved') { updates.approved_by = actorId; updates.approved_at = new Date().toISOString(); }
  if (newStatus === 'rejected') updates.rejected_reason = extra?.rejectedReason ?? null;

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
 * Approve a change control, which is a signed act.
 *
 * WHY THIS IS NOT JUST ANOTHER TRANSITION. Approval is the one step in
 * change control that a regulator reads as a person's attestation
 * rather than a status. `set_approved` carries requires_signature, so
 * the engine refuses it without a consumed signature, and the signature
 * is taken over the record AS IT STANDS — sign first, then move, which
 * is what `signAndTransition` exists to sequence. A signature over a
 * record that then changed before the move would attest to something
 * that no longer existed.
 *
 * The password is re-entered at the moment of signing and is never
 * stored or logged; it goes straight to the RPC, which verifies and
 * discards it.
 */
export async function approveChangeControl(
  id: string,
  companyId: string,
  password: string,
  comment: string,
): Promise<void> {
  const result = await signAndTransition({
    entityType: 'change_control',
    entityId: id,
    actionKey: 'set_approved',
    companyId,
    meaning: 'approved',
    password,
    comment,
    metadata: { requested_status: 'approved' },
  });

  if (!result.ok) throw new Error(result.message);

  const actorId = result.data.actor_id;

  const { error } = await (supabase as any)
    .from('change_controls')
    .update({ approved_by: actorId, approved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId);
  if (error) logger.error('change_control approval stamp failed after transition:', error);

  await recordAuditEvent({
    userId: actorId ?? '',
    companyId,
    action: 'change_control_approved',
    entityType: 'change_control',
    entityId: id,
    metadata: {
      new_status: 'approved',
      history_id: result.data.history_id,
      signature_id: result.data.signature_id,
    },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for change_control approval:', e));
}

/**
 * Whether this workspace refuses an approval by the person who raised
 * the change. Defaults to false when no row exists, which matches the
 * column default rather than guessing a second time.
 */
export async function getRequireSegregationOfDuties(companyId: string): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from('company_change_control_settings')
    .select('require_segregation_of_duties')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) { logger.error('getRequireSegregationOfDuties:', error); return false; }
  return data?.require_segregation_of_duties ?? false;
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
