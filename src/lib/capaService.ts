/**
 * CAPA — now backed by the Lifecycle Engine (Deliverable 03).
 *
 * `capa_records.status` is a DERIVED read model: the database keeps it in
 * step with entity_current_state and rejects direct writes, so every read
 * below is unchanged. The only way to move a CAPA is
 * `transitionCapa()`.
 *
 * `overdue` remains in the type because it remains in the lifecycle
 * definition, but nothing writes it and no UI offers it. Overdue
 * reporting is derived from `due_date`, exactly as before.
 */

import { supabase } from './supabase';
import { logger } from './logger';
import { recordAuditEvent } from './auditService';
import { transition as lifecycleTransition, getAvailableActions } from './lifecycleService';
import type { LifecycleAction } from './lifecycleService';

export type CapaSource = 'audit_finding' | 'compliance_failure' | 'near_miss' | 'customer_complaint' | 'regulatory_action' | 'internal_review';
export type CapaType = 'corrective' | 'preventive' | 'both';
export type CapaStatus = 'open' | 'investigating' | 'action_planned' | 'in_progress' | 'verification' | 'closed' | 'overdue';

export type CapaRecord = {
  id: string; company_id: string; capa_number: string; title: string; description: string;
  source: CapaSource; capa_type: CapaType; priority: string; status: CapaStatus;
  root_cause: string | null; due_date: string | null; owner_name: string | null;
  created_by: string | null; created_at: string; closed_at: string | null;
  control_id: string | null; control_code: string | null;
  source_risk_id: string | null;
  actions?: CapaAction[];
};

export type CapaAction = {
  id: string; capa_id: string; action_type: string; description: string;
  assigned_to: string | null; status: string; due_date: string | null;
  completed_at: string | null; created_at: string;
};

export async function getCapas(companyId: string): Promise<CapaRecord[]> {
  const { data, error } = await (supabase as any).from('capa_records').select('*, actions:capa_actions(*)').eq('company_id', companyId).order('created_at', { ascending: false });
  if (error) { logger.error('getCapas:', error); return []; }
  return data ?? [];
}

export async function createCapa(companyId: string, userId: string, c: { title: string; description: string; source: CapaSource; capa_type: CapaType; priority?: string; due_date?: string; owner_name?: string; root_cause?: string; controlId?: string; controlCode?: string; sourceRiskId?: string }): Promise<CapaRecord | null> {
  const year = new Date().getFullYear();
  const rand = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  const { data, error } = await (supabase as any).from('capa_records').insert({
    company_id: companyId, capa_number: `CAPA-${year}-${rand}`, title: c.title, description: c.description,
    source: c.source, capa_type: c.capa_type, priority: c.priority || 'medium',
    root_cause: c.root_cause || null, due_date: c.due_date || null, owner_name: c.owner_name || null, created_by: userId,
    control_id: c.controlId || null, control_code: c.controlCode || null,
    source_risk_id: c.sourceRiskId || null,
  }).select().single();
  if (error) { logger.error('createCapa:', error); return null; }
  try { await recordAuditEvent({ userId, companyId, action: 'capa.created', entityType: 'capa', entityId: data.id, metadata: { title: c.title, source: c.source, capa_type: c.capa_type, priority: c.priority || 'medium', control_id: c.controlId ?? null }, captureEvidence: false }); } catch { /* non-blocking */ }
  return data;
}

/** Returns true if an open (non-closed) CAPA already exists for this control — prevents duplicate auto-CAPAs. */
export async function hasPendingCapaForControl(companyId: string, controlId: string): Promise<boolean> {
  const { data, error } = await (supabase as any)
    .from('capa_records')
    .select('id')
    .eq('company_id', companyId)
    .eq('control_id', controlId)
    .neq('status', 'closed')
    .limit(1);
  if (error) { logger.error('hasPendingCapaForControl:', error); return false; }
  return (data ?? []).length > 0;
}

/** Actions the engine will currently allow on this CAPA, for the UI. */
export async function getCapaActions(capaId: string, companyId: string): Promise<LifecycleAction[]> {
  return getAvailableActions('capa_record', capaId, companyId);
}

/**
 * Move a CAPA to a new state through the Lifecycle Engine.
 *
 * `status` and `closed_at` are not written here — the database derives
 * both from the new state. The seeded graph is any-to-any, matching what
 * the table permitted before adoption, so no move that used to work has
 * become impossible.
 *
 * Returns false rather than throwing, preserving the contract the CAPA
 * page already expects from this function.
 */
export async function transitionCapa(capaId: string, status: CapaStatus, companyId: string, userId: string): Promise<boolean> {
  const result = await lifecycleTransition({
    entityType: 'capa_record',
    entityId: capaId,
    actionKey: `set_${status}`,
    companyId,
    metadata: { requested_status: status },
  });

  if (!result.ok) { logger.error('transitionCapa rejected:', result.code, result.message); return false; }

  // attribute to the actor the DATABASE resolved, not the caller's argument
  const actorId = result.data.actor_id;

  try { await recordAuditEvent({ userId: actorId ?? '', companyId, action: 'capa.status_changed', entityType: 'capa', entityId: capaId, metadata: { status, history_id: result.data.history_id }, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

/**
 * @deprecated Renamed to `transitionCapa`. Retained so no caller keeps a
 * direct-write mental model; writing `status` directly is rejected by the
 * database.
 */
export const updateCapaStatus = transitionCapa;

export async function addCapaAction(capaId: string, a: { action_type: string; description: string; assigned_to?: string; due_date?: string }, companyId: string, userId: string): Promise<boolean> {
  const { data, error } = await (supabase as any).from('capa_actions').insert({ capa_id: capaId, action_type: a.action_type, description: a.description, assigned_to: a.assigned_to || null, status: 'pending', due_date: a.due_date || null }).select().single();
  if (error) { logger.error('addCapaAction:', error); return false; }
  try { await recordAuditEvent({ userId, companyId, action: 'capa.action_added', entityType: 'capa', entityId: capaId, metadata: { action_type: a.action_type, description: a.description }, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

export async function completeCapaAction(actionId: string, companyId: string, userId: string): Promise<boolean> {
  const { error } = await (supabase as any).from('capa_actions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', actionId);
  if (error) { logger.error('completeCapaAction:', error); return false; }
  try { await recordAuditEvent({ userId, companyId, action: 'capa.action_completed', entityType: 'capa', entityId: actionId, metadata: { action_id: actionId }, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

export const CAPA_SOURCES: { id: CapaSource; label: string }[] = [
  { id: 'audit_finding', label: 'Audit Finding' }, { id: 'compliance_failure', label: 'Compliance Failure' },
  { id: 'near_miss', label: 'Near Miss' }, { id: 'customer_complaint', label: 'Customer Complaint' },
  { id: 'regulatory_action', label: 'Regulatory Action' }, { id: 'internal_review', label: 'Internal Review' },
];
