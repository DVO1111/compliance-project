import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

export interface LegalHold {
  id: string;
  company_id: string;
  name: string;
  reason: string | null;
  status: 'active' | 'released';
  created_by: string | null;
  created_at: string;
  released_at: string | null;
}

export interface LegalHoldItem {
  id: string;
  company_id: string;
  legal_hold_id: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

export const legalHoldService = {
  async createLegalHold(
    companyId: string,
    userId: string,
    data: { name: string; reason?: string }
  ): Promise<LegalHold> {
    const { data: hold, error } = await (supabase as any)
      .from('legal_holds')
      .insert({
        company_id: companyId,
        created_by: userId,
        name: data.name,
        reason: data.reason || null,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;

    await recordAuditEvent({
      userId,
      companyId,
      action: 'create_legal_hold',
      entityType: 'legal_hold',
      entityId: hold.id,
      metadata: { name: hold.name, reason: hold.reason }
    });

    return hold;
  },

  async releaseLegalHold(
    companyId: string,
    userId: string,
    holdId: string
  ): Promise<void> {
    const { data: hold, error } = await (supabase as any)
      .from('legal_holds')
      .update({
        status: 'released',
        released_at: new Date().toISOString()
      })
      .eq('id', holdId)
      .eq('company_id', companyId)
      .select()
      .single();

    if (error) throw error;

    await recordAuditEvent({
      userId,
      companyId,
      action: 'release_legal_hold',
      entityType: 'legal_hold',
      entityId: holdId,
      metadata: { name: hold.name }
    });
  },

  async addItemToHold(
    companyId: string,
    userId: string,
    holdId: string,
    entityType: string,
    entityId: string
  ): Promise<LegalHoldItem> {
    const { data: item, error } = await (supabase as any)
      .from('legal_hold_items')
      .insert({
        company_id: companyId,
        legal_hold_id: holdId,
        entity_type: entityType,
        entity_id: entityId
      })
      .select()
      .single();

    if (error) throw error;

    await recordAuditEvent({
      userId,
      companyId,
      action: 'add_item_to_legal_hold',
      entityType: 'legal_hold',
      entityId: holdId,
      metadata: { item_entity_type: entityType, item_entity_id: entityId }
    });

    return item;
  },

  async removeItemFromHold(
    companyId: string,
    userId: string,
    holdItemId: string
  ): Promise<void> {
    // First get item details for audit log
    const { data: item } = await (supabase as any)
      .from('legal_hold_items')
      .select('*')
      .eq('id', holdItemId)
      .single();

    if (!item) return;

    const { error } = await (supabase as any)
      .from('legal_hold_items')
      .delete()
      .eq('id', holdItemId);

    if (error) throw error;

    await recordAuditEvent({
      userId,
      companyId: item.company_id,
      action: 'remove_item_from_legal_hold',
      entityType: 'legal_hold',
      entityId: item.legal_hold_id,
      metadata: { item_entity_type: item.entity_type, item_entity_id: item.entity_id }
    });
  },

  async isEntityOnActiveHold(
    entityType: string,
    entityId: string
  ): Promise<boolean> {
    const { data, error } = await (supabase as any).rpc('is_on_legal_hold', {
      p_entity_type: entityType,
      p_entity_id: entityId
    } as any);

    if (error) {
      logger.error('Error checking legal hold:', error);
      return false;
    }

    return !!data;
  },

  async listHolds(companyId: string): Promise<LegalHold[]> {
    const { data, error } = await (supabase as any)
      .from('legal_holds')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getHoldDetails(companyId: string, holdId: string) {
    const [holdRes, itemsRes] = await Promise.all([
      (supabase as any).from('legal_holds').select('*').eq('id', holdId).eq('company_id', companyId).single(),
      (supabase as any).from('legal_hold_items').select('*').eq('legal_hold_id', holdId).eq('company_id', companyId)
    ]);

    if (holdRes.error) throw holdRes.error;

    return {
      hold: holdRes.data as LegalHold,
      items: (itemsRes.data || []) as LegalHoldItem[]
    };
  }
};
