import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { validateMutation } from '../validationService';
import { logger } from '../logger';

export interface RegulatoryObligation {
  id: string;
  company_id: string;
  regulation_id: string | null;
  title: string;
  description: string;
  jurisdiction: string;
  category: string;
  status: 'identified' | 'implemented' | 'monitored';
  due_date: string | null;
  is_recurring: boolean;
  frequency: RecurrenceFrequency | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  regulation?: { title: string };
  owner?: { full_name: string };
  links?: ObligationLink[];
}

export type RecurrenceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'biannual' | 'annual';

/** Advance a date by one recurrence interval. Falls back to today when no base date. */
export function computeNextDueDate(current: string | null, frequency: RecurrenceFrequency): string {
  const base = current ? new Date(current) : new Date();
  const d = new Date(base);
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'biannual': d.setMonth(d.getMonth() + 6); break;
    case 'annual': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split('T')[0];
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

/**
 * Mark a recurring obligation's current cycle as complete. If the obligation is
 * recurring, a fresh 'identified' record for the next cycle is auto-generated
 * (carrying title/description/category/jurisdiction/frequency forward).
 * Returns the newly created next-cycle obligation, or null for one-off obligations.
 */
export async function completeObligationCycle(
  companyId: string,
  userId: string,
  id: string,
): Promise<RegulatoryObligation | null> {
  const validation = await validateMutation(userId, companyId, 'canManagePolicies');
  if (!validation.valid) throw new Error(validation.message);

  // Load the obligation being completed.
  const { data: current, error: fetchErr } = await (supabase
    .from('regulatory_obligations') as any)
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single();
  if (fetchErr) throw fetchErr;

  const ob = current as RegulatoryObligation;

  // Mark the current cycle complete (monitored = ongoing/verified state).
  await updateObligation(companyId, userId, id, { status: 'monitored' });

  if (!ob.is_recurring || !ob.frequency) return null;

  const nextDue = computeNextDueDate(ob.due_date, ob.frequency);
  const { data: next, error: insErr } = await (supabase
    .from('regulatory_obligations') as any)
    .insert([{
      company_id: companyId,
      regulation_id: ob.regulation_id,
      title: ob.title,
      description: ob.description,
      jurisdiction: ob.jurisdiction,
      category: ob.category,
      owner_id: ob.owner_id,
      is_recurring: true,
      frequency: ob.frequency,
      due_date: nextDue,
      status: 'identified',
    }])
    .select()
    .single();
  if (insErr) throw insErr;

  await recordAuditEvent({
    userId,
    companyId,
    action: 'obligation.cycle_completed',
    entityType: 'regulatory_obligation',
    entityId: id,
    metadata: { next_obligation_id: next.id, next_due_date: nextDue, frequency: ob.frequency },
  });

  return next;
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

/**
 * Find obligations in 'identified' status past their due_date and raise a CAPA for each.
 * Safe to call on a schedule — deduplicates by checking for an existing open CAPA with the same title.
 */
export async function escalateOverdueObligations(companyId: string, userId: string): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: overdue } = await (supabase
      .from('regulatory_obligations') as any)
      .select('id, title, description, jurisdiction, category, due_date')
      .eq('company_id', companyId)
      .eq('status', 'identified')
      .lt('due_date', today)
      .not('due_date', 'is', null);

    if (!overdue || overdue.length === 0) return 0;

    const { createCapa } = await import('../capaService');

    let escalated = 0;
    for (const ob of overdue as RegulatoryObligation[]) {
      try {
        const capaTitle = `Overdue Obligation: ${ob.title}`;

        // Dedup — check for existing open CAPA with same title
        const { data: existing } = await (supabase as any)
          .from('capa_records')
          .select('id')
          .eq('company_id', companyId)
          .eq('title', capaTitle)
          .neq('status', 'closed')
          .limit(1);

        if (existing && existing.length > 0) continue;

        await createCapa(companyId, userId, {
          title: capaTitle,
          description: `Regulatory obligation "${ob.title}" (${ob.jurisdiction} / ${ob.category}) was due on ${ob.due_date} and remains in 'identified' status. Immediate action required to implement or formally acknowledge this obligation.`,
          source: 'regulatory_action',
          capa_type: 'corrective',
          priority: 'high',
          due_date: ob.due_date ?? undefined,
        });

        escalated++;
      } catch (innerErr) {
        logger.warn(`escalateOverdueObligations: failed for obligation ${ob.id}`, innerErr);
      }
    }

    if (escalated > 0) {
      await recordAuditEvent({
        userId,
        companyId,
        action: 'obligations.overdue_escalated',
        entityType: 'regulatory_obligation',
        entityId: 'batch',
        metadata: { escalated_count: escalated },
      });
    }

    return escalated;
  } catch (err) {
    logger.warn('escalateOverdueObligations: non-blocking', err);
    return 0;
  }
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
