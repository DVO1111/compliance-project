/**
 * Lifecycle Engine — client service (Deliverables 01 + 02).
 *
 * This module is a thin, typed wrapper. It is deliberately NOT where the
 * rules live: every operation delegates to a Postgres function, because
 * this file runs in the browser with the anon key and therefore cannot be
 * a security boundary or offer a transaction. The database decides which
 * transitions exist, whether one is legal, and who performed it; this
 * service only asks.
 *
 * There is exactly one transition path — `transition()` below, calling the
 * `lifecycle_transition` RPC. Do not add a second one, and do not update a
 * status column directly once a module has been adopted by the engine.
 *
 * Note there is no `actorId` parameter anywhere in this file. The database
 * takes the actor from the session and rejects any attempt to attribute an
 * action to someone else, so passing one from the browser would be either
 * redundant or a forgery. `transition()` reports back the actor the
 * database recorded.
 *
 * Nothing is adopted yet. Existing modules keep their current behaviour
 * until Deliverable 03 migrates them.
 */

import { supabase } from './supabase';
import { logger } from './logger';
import { recordAuditEvent } from './auditService';

/** Entity types with a seeded lifecycle. Extended as modules are adopted. */
export type LifecycleEntityType = 'capa_record' | 'change_control' | 'sop_document';

export interface LifecycleAction {
  action_key: string;
  label: string;
  to_state_key: string;
  sort_order: number;
  /** Comma-separated list of profiles.role values, or null for no gate. */
  required_role: string | null;
  /**
   * Declaring this currently makes the action unusable: no workflow
   * permission vocabulary exists, so the engine fails closed rather than
   * pretending to check something.
   */
  required_permission: string | null;
  requires_comment: boolean;
  /** Also fails closed — there is no e-signature subsystem yet. */
  requires_signature: boolean;
  /** False when this caller would be rejected. Disable the control. */
  is_permitted: boolean;
  /**
   * The code `transition()` would return, or null when permitted. Note a
   * mandatory comment is NOT a blocker here — it depends on what the user
   * types, so prompt for it rather than disabling the action.
   *
   * LIFECYCLE_STATE_LOCKED and LIFECYCLE_STATE_TERMINAL describe the
   * entity rather than the action, so when either appears it appears on
   * every row: show one explanation for the record, not one per button.
   */
  blocked_reason: string | null;
}

export interface LifecycleCurrentState {
  entity_type: string;
  entity_id: string;
  state_key: string;
  label: string;
  is_terminal: boolean;
  is_locked: boolean;
  entered_at: string;
  entered_by: string | null;
}

export interface LifecycleHistoryEntry {
  id: string;
  from_state_key: string | null;
  to_state_key: string;
  action_key: string | null;
  actor_id: string | null;
  comment: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type LifecycleResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

/**
 * Postgres raises these with a recognisable prefix so the caller can tell
 * a rejected transition from an infrastructure failure. The prefix is
 * parsed rather than the message matched, so wording can change freely.
 *
 * Codes the engine can return:
 *   LIFECYCLE_NOT_AUTHENTICATED      no user on the session
 *   LIFECYCLE_FORBIDDEN              caller is not a member of the company
 *   LIFECYCLE_COMPANY_MISMATCH       the entity belongs to another tenant
 *   LIFECYCLE_ACTOR_MISMATCH         attempted to act as another user
 *   LIFECYCLE_NO_DEFINITION          no active lifecycle for the type
 *   LIFECYCLE_NOT_INITIALIZED        entity has no current state
 *   LIFECYCLE_INVALID_TRANSITION     action illegal from the current state
 *   LIFECYCLE_STATE_LOCKED           the current state is locked
 *   LIFECYCLE_STATE_TERMINAL         the current state ends the workflow
 *   LIFECYCLE_ROLE_REQUIRED          caller's role is not sufficient
 *   LIFECYCLE_COMMENT_REQUIRED       the action requires a comment
 *   LIFECYCLE_PERMISSION_UNSUPPORTED declared permission cannot be checked
 *   LIFECYCLE_SIGNATURE_UNSUPPORTED  no e-signature subsystem exists
 *   LIFECYCLE_ALREADY_INITIALIZED    entity already has a state
 *   LIFECYCLE_UNKNOWN_STATE          state key not in the definition
 *   LIFECYCLE_ERROR                  anything else (infrastructure)
 */
function toFailure(error: { message?: string; code?: string } | null): LifecycleResult<never> {
  const raw = error?.message ?? 'Unknown lifecycle error';
  const match = raw.match(/LIFECYCLE_([A-Z_]+):\s*(.*)/);
  if (match) return { ok: false, code: `LIFECYCLE_${match[1]}`, message: match[2].trim() };
  return { ok: false, code: 'LIFECYCLE_ERROR', message: raw };
}

/** Actions legal from the entity's current state. Empty if uninitialised. */
export async function getAvailableActions(
  entityType: LifecycleEntityType | string,
  entityId: string,
  companyId: string,
): Promise<LifecycleAction[]> {
  const { data, error } = await (supabase as any).rpc('lifecycle_available_actions', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_company_id: companyId,
  });
  if (error) {
    logger.error('[lifecycle] getAvailableActions failed', error);
    return [];
  }
  return (data ?? []) as LifecycleAction[];
}

/** The entity's current state, or null if the engine has not adopted it. */
export async function getCurrentState(
  entityType: LifecycleEntityType | string,
  entityId: string,
  companyId: string,
): Promise<LifecycleCurrentState | null> {
  const { data, error } = await (supabase as any)
    .from('entity_current_state')
    .select('entity_type, entity_id, entered_at, entered_by, lifecycle_states!inner(state_key,label,is_terminal,is_locked)')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    logger.error('[lifecycle] getCurrentState failed', error);
    return null;
  }
  if (!data) return null;

  const s = (data as any).lifecycle_states;
  return {
    entity_type: (data as any).entity_type,
    entity_id: (data as any).entity_id,
    state_key: s.state_key,
    label: s.label,
    is_terminal: s.is_terminal,
    is_locked: s.is_locked,
    entered_at: (data as any).entered_at,
    entered_by: (data as any).entered_by,
  };
}

/** Full transition history, oldest first. */
export async function getHistory(
  entityType: LifecycleEntityType | string,
  entityId: string,
  companyId: string,
): Promise<LifecycleHistoryEntry[]> {
  const { data, error } = await (supabase as any)
    .from('entity_state_history')
    .select('id, actor_id, comment, metadata, created_at, from_state:from_state_id(state_key), to_state:to_state_id(state_key), transition:transition_id(action_key)')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('[lifecycle] getHistory failed', error);
    return [];
  }
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    from_state_key: r.from_state?.state_key ?? null,
    to_state_key: r.to_state?.state_key,
    action_key: r.transition?.action_key ?? null,
    actor_id: r.actor_id,
    comment: r.comment,
    metadata: r.metadata ?? {},
    created_at: r.created_at,
  }));
}

/** Give an entity its first state. Idempotency is enforced in the database. */
export async function initialize(
  entityType: LifecycleEntityType | string,
  entityId: string,
  companyId: string,
  stateKey?: string,
): Promise<LifecycleResult<{ state_key: string }>> {
  const { data, error } = await (supabase as any).rpc('lifecycle_initialize', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_company_id: companyId,
    p_state_key: stateKey ?? null,
  });
  if (error) {
    logger.error('[lifecycle] initialize rejected', error);
    return toFailure(error);
  }
  return { ok: true, data: { state_key: (data as any).state_key } };
}

/**
 * The authoritative transition.
 *
 * Validation, the current-state write and the history write all happen
 * inside `lifecycle_transition`, so they share one transaction: a rejected
 * transition changes nothing, and a successful one cannot leave an entity
 * in a new state without its history row.
 *
 * The audit entry is written afterwards and deliberately outside that
 * transaction — the existing audit chain is append-only and sequenced, and
 * folding it in would couple two independent integrity mechanisms. A failed
 * audit write is logged, never silently swallowed, and never rolls back a
 * transition the database has already committed.
 */
export async function transition(params: {
  entityType: LifecycleEntityType | string;
  entityId: string;
  actionKey: string;
  companyId: string;
  comment?: string;
  metadata?: Record<string, unknown>;
}): Promise<LifecycleResult<{ from_state: string; to_state: string; history_id: string; actor_id: string | null }>> {
  const { entityType, entityId, actionKey, companyId, comment, metadata } = params;

  // p_actor_id is deliberately not sent. The database resolves the actor
  // from the session and refuses a mismatched one, so anything this file
  // could pass would be either the same value or a forgery.
  const { data, error } = await (supabase as any).rpc('lifecycle_transition', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_action_key: actionKey,
    p_company_id: companyId,
    p_comment: comment ?? null,
    p_metadata: metadata ?? {},
  });

  if (error) {
    logger.error('[lifecycle] transition rejected', { entityType, entityId, actionKey, error });
    return toFailure(error);
  }

  const result = data as any;

  try {
    await recordAuditEvent({
      // the actor the DATABASE attributed, not one this client asserted
      userId: result.actor_id ?? '',
      action: `lifecycle.transition.${actionKey}`,
      entityType,
      entityId,
      companyId,
      metadata: { from_state: result.from_state, to_state: result.to_state, history_id: result.history_id, comment: comment ?? null },
    });
  } catch (err) {
    logger.error('[lifecycle] transition committed but audit write failed', err);
  }

  return {
    ok: true,
    data: {
      from_state: result.from_state,
      to_state: result.to_state,
      history_id: result.history_id,
      actor_id: result.actor_id ?? null,
    },
  };
}
