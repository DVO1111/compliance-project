import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { recomputeCompanyRiskPosture } from './riskScoringService';
import { validateMutation } from '../validationService';
import { webhookService } from '../platform/webhookService';
import { logger } from '../logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export type RiskCategory = 'security' | 'privacy' | 'operational' | 'financial' | 'legal' | 'compliance';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type RiskStatus = 'identified' | 'mitigating' | 'monitored' | 'closed';
export type RiskLinkType = 'control' | 'policy' | 'vendor' | 'audit_request' | 'automation_test';

export interface Risk {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  risk_category: RiskCategory;
  risk_level: RiskLevel;
  status: RiskStatus;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  owner?: { full_name: string } | null;
  links_count?: number;
}

export interface RiskLink {
  id: string;
  company_id: string;
  risk_id: string;
  link_type: RiskLinkType;
  linked_entity_id: string;
  created_at: string;
  // metadata (dynamically loaded)
  entity_label?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const RISK_CATEGORIES: { id: RiskCategory; label: string }[] = [
  { id: 'security', label: 'Security' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'operational', label: 'Operational' },
  { id: 'financial', label: 'Financial' },
  { id: 'legal', label: 'Legal' },
  { id: 'compliance', label: 'Compliance' },
];

export const RISK_LEVELS: { id: RiskLevel; label: string; color: string }[] = [
  { id: 'low', label: 'Low', color: '#22c55e' },
  { id: 'medium', label: 'Medium', color: '#f59e0b' },
  { id: 'high', label: 'High', color: '#ef4444' },
  { id: 'critical', label: 'Critical', color: '#7f1d1d' },
];

export const RISK_STATUSES: { id: RiskStatus; label: string }[] = [
  { id: 'identified', label: 'Identified' },
  { id: 'mitigating', label: 'Mitigating' },
  { id: 'monitored', label: 'Monitored' },
  { id: 'closed', label: 'Closed' },
];

// ─── Risk Register ──────────────────────────────────────────────────────────

export async function listRisks(companyId: string, filters?: Partial<Risk>): Promise<Risk[]> {
  let query = (supabase as any)
    .from('risks')
    .select('*, owner:profiles(full_name)')
    .eq('company_id', companyId);

  if (filters?.risk_category) query = query.eq('risk_category', filters.risk_category);
  if (filters?.risk_level) query = query.eq('risk_level', filters.risk_level);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) { logger.error('listRisks:', error); return []; }

  const risks = data ?? [];
  // Enrich with links count
  for (const r of risks) {
    const { count } = await (supabase as any)
      .from('risk_links')
      .select('*', { count: 'exact', head: true })
      .eq('risk_id', r.id);
    r.links_count = count ?? 0;
  }

  return risks;
}

export async function getRiskDetail(riskId: string): Promise<Risk | null> {
  const { data, error } = await (supabase as any)
    .from('risks')
    .select('*, owner:profiles(full_name)')
    .eq('id', riskId)
    .single();
  if (error) return null;
  return data;
}

export async function createRisk(
  companyId: string,
  userId: string,
  data: Partial<Pick<Risk, 'title' | 'description' | 'risk_category' | 'risk_level' | 'status' | 'owner_id'>>
): Promise<Risk | null> {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies'); // Fallback to policies perm if direct risk perm is missing
  if (!validation.valid) throw new Error(validation.message);

  const { data: risk, error } = await (supabase as any)
    .from('risks')
    .insert({
      company_id: companyId,
      title: data.title,
      description: data.description || null,
      risk_category: data.risk_category,
      risk_level: data.risk_level,
      status: data.status || 'identified',
      owner_id: data.owner_id || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) { logger.error('createRisk:', error); return null; }

  await recordAuditEvent({
    userId,
    action: 'create_risk',
    entityType: 'risk',
    entityId: risk.id,
    companyId,
    metadata: { title: data.title, category: data.risk_category },
  });

  // Recompute posture
  await recomputeCompanyRiskPosture(companyId);

  // Webhook: vendor.risk.changed
  await webhookService.enqueueEvent(companyId, 'vendor.risk.changed', {
    risk_id: risk.id,
    title: risk.title,
    category: risk.risk_category,
    level: risk.risk_level,
    status: risk.status,
    action: 'created'
  }, { entityType: 'risk', entityId: risk.id });

  return risk;
}

export async function updateRisk(
  companyId: string,
  userId: string,
  riskId: string,
  updates: Partial<Risk>
): Promise<boolean> {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies');
  if (!validation.valid) throw new Error(validation.message);

  const { error } = await (supabase as any)
    .from('risks')
    .update(updates)
    .eq('id', riskId);

  if (error) return false;

  await recordAuditEvent({
    userId,
    action: 'update_risk',
    entityType: 'risk',
    entityId: riskId,
    companyId,
    metadata: updates,
  });

  await recomputeCompanyRiskPosture(companyId);

  // Webhook: vendor.risk.changed
  await webhookService.enqueueEvent(companyId, 'vendor.risk.changed', {
    risk_id: riskId,
    updates,
    action: 'updated'
  }, { entityType: 'risk', entityId: riskId });

  return true;
}

// ─── Risk Linking ───────────────────────────────────────────────────────────

export async function listRiskLinks(riskId: string): Promise<RiskLink[]> {
  const { data, error } = await (supabase as any)
    .from('risk_links')
    .select('*')
    .eq('risk_id', riskId);
  if (error) return [];
  return data ?? [];
}

export async function addRiskLink(
  companyId: string,
  userId: string,
  riskId: string,
  linkType: RiskLinkType,
  entityId: string
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('risk_links')
    .insert({
      company_id: companyId,
      risk_id: riskId,
      link_type: linkType,
      linked_entity_id: entityId,
    });

  if (error) return false;

  await recordAuditEvent({
    userId,
    action: 'link_risk_entity',
    entityType: 'risk_link',
    entityId: riskId,
    companyId,
    metadata: { link_type: linkType, entity_id: entityId },
  });

  return true;
}

export async function removeRiskLink(linkId: string, userId: string, companyId: string): Promise<boolean> {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies');
  if (!validation.valid) throw new Error(validation.message);

  const { error } = await (supabase as any)
    .from('risk_links')
    .delete()
    .eq('id', linkId);

  if (error) return false;

  await recordAuditEvent({
    userId,
    action: 'unlink_risk_entity',
    entityType: 'risk_link',
    entityId: linkId,
    companyId,
  });

  return true;
}
