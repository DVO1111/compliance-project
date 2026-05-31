import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { validateMutation } from '../validationService';

export interface RegulatoryObligation {
  id: string;
  company_id: string;
  regulation_id: string | null;
  title: string;
  description: string;
  jurisdiction: string;
  category: string;
  status: 'identified' | 'implemented' | 'monitored';
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  regulation?: { title: string };
  owner?: { full_name: string };
  links?: ObligationLink[];
}

export interface ObligationLink {
  id: string;
  company_id: string;
  obligation_id: string;
  link_type: 'control' | 'policy' | 'risk' | 'vendor';
  linked_entity_id: string;
  created_at: string;
  entity_details?: any; // To be populated by joining or secondary fetch
}

export async function listObligations(companyId: string, filters?: any) {
  let query = (supabase
    .from('regulatory_obligations') as any)
    .select(`
      *,
      regulation:regulations(title),
      owner:profiles(full_name)
    `)
    .eq('company_id', companyId);

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.jurisdiction) query = query.eq('jurisdiction', filters.jurisdiction);
  if (filters?.regulation_id) query = query.eq('regulation_id', filters.regulation_id);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getObligationDetail(id: string, companyId: string) {
  const { data: obligation, error } = await (supabase
    .from('regulatory_obligations') as any)
    .select(`
      *,
      regulation:regulations(*),
      owner:profiles(full_name),
      links:obligation_links(*)
    `)
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  if (error) throw error;
  return obligation;
}

export async function createObligation(companyId: string, userId: string, data: Partial<RegulatoryObligation>) {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies');
  if (!validation.valid) throw new Error(validation.message);

  const { data: newObligation, error } = await (supabase
    .from('regulatory_obligations') as any)
    .insert([{
      ...data,
      company_id: companyId
    }])
    .select()
    .single();

  if (error) throw error;

  await recordAuditEvent({
    userId,
    action: 'create',
    entityType: 'regulatory_obligation',
    entityId: newObligation.id,
    companyId: companyId,
    metadata: { title: newObligation.title }
  });

  return newObligation;
}

export async function updateObligation(companyId: string, userId: string, id: string, updates: Partial<RegulatoryObligation>) {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies');
  if (!validation.valid) throw new Error(validation.message);

  const { data: updated, error } = await (supabase
    .from('regulatory_obligations') as any)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();

  if (error) throw error;

  await recordAuditEvent({
    userId,
    action: 'update',
    entityType: 'regulatory_obligation',
    entityId: id,
    companyId: companyId,
    metadata: updates
  });

  return updated;
}

export async function linkObligationEntity(
  companyId: string, 
  userId: string, 
  obligationId: string, 
  type: 'control' | 'policy' | 'risk' | 'vendor', 
  entityId: string
) {
  const { data, error } = await (supabase
    .from('obligation_links') as any)
    .insert([{
      obligation_id: obligationId,
      link_type: type,
      linked_entity_id: entityId,
      company_id: companyId
    }])
    .select()
    .single();

  if (error) throw error;

  await recordAuditEvent({
    userId,
    action: 'link',
    entityType: 'regulatory_obligation',
    entityId: obligationId,
    companyId: companyId,
    metadata: { link_type: type, entity_id: entityId }
  });

  return data;
}

export async function removeObligationLink(linkId: string, userId: string, companyId: string) {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies');
  if (!validation.valid) throw new Error(validation.message);

  const { data: link, error } = await (supabase
    .from('obligation_links') as any)
    .delete()
    .eq('id', linkId)
    .eq('company_id', companyId)
    .select('obligation_id, link_type, linked_entity_id')
    .single();

  if (error) throw error;

  if (link) {
    await recordAuditEvent({
      userId,
      action: 'unlink',
      entityType: 'regulatory_obligation',
      entityId: link.obligation_id,
      companyId: companyId,
      metadata: { link_type: link.link_type, entity_id: link.linked_entity_id }
    });
  }
}
