import { supabase } from './supabase';
import { logger } from './logger';

export type CapaSource = 'audit_finding' | 'compliance_failure' | 'near_miss' | 'customer_complaint' | 'regulatory_action' | 'internal_review';
export type CapaType = 'corrective' | 'preventive' | 'both';
export type CapaStatus = 'open' | 'investigating' | 'action_planned' | 'in_progress' | 'verification' | 'closed' | 'overdue';

export type CapaRecord = {
  id: string; company_id: string; capa_number: string; title: string; description: string;
  source: CapaSource; capa_type: CapaType; priority: string; status: CapaStatus;
  root_cause: string | null; due_date: string | null; owner_name: string | null;
  created_by: string | null; created_at: string; closed_at: string | null;
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

export async function createCapa(companyId: string, userId: string, c: { title: string; description: string; source: CapaSource; capa_type: CapaType; priority?: string; due_date?: string; owner_name?: string; root_cause?: string }): Promise<CapaRecord | null> {
  const year = new Date().getFullYear();
  const rand = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  const { data, error } = await (supabase as any).from('capa_records').insert({
    company_id: companyId, capa_number: `CAPA-${year}-${rand}`, title: c.title, description: c.description,
    source: c.source, capa_type: c.capa_type, priority: c.priority || 'medium', status: 'open',
    root_cause: c.root_cause || null, due_date: c.due_date || null, owner_name: c.owner_name || null, created_by: userId,
  }).select().single();
  if (error) { logger.error('createCapa:', error); return null; }
  return data;
}

export async function updateCapaStatus(capaId: string, status: CapaStatus): Promise<boolean> {
  const updates: any = { status };
  if (status === 'closed') updates.closed_at = new Date().toISOString();
  const { error } = await (supabase as any).from('capa_records').update(updates).eq('id', capaId);
  if (error) { logger.error('updateCapaStatus:', error); return false; }
  return true;
}

export async function addCapaAction(capaId: string, a: { action_type: string; description: string; assigned_to?: string; due_date?: string }): Promise<boolean> {
  const { error } = await (supabase as any).from('capa_actions').insert({ capa_id: capaId, action_type: a.action_type, description: a.description, assigned_to: a.assigned_to || null, status: 'pending', due_date: a.due_date || null });
  if (error) { logger.error('addCapaAction:', error); return false; }
  return true;
}

export async function completeCapaAction(actionId: string): Promise<boolean> {
  const { error } = await (supabase as any).from('capa_actions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', actionId);
  if (error) { logger.error('completeCapaAction:', error); return false; }
  return true;
}

export const CAPA_SOURCES: { id: CapaSource; label: string }[] = [
  { id: 'audit_finding', label: 'Audit Finding' }, { id: 'compliance_failure', label: 'Compliance Failure' },
  { id: 'near_miss', label: 'Near Miss' }, { id: 'customer_complaint', label: 'Customer Complaint' },
  { id: 'regulatory_action', label: 'Regulatory Action' }, { id: 'internal_review', label: 'Internal Review' },
];
