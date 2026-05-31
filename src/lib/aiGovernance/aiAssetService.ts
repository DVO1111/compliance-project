import { supabase } from '../supabase';
import { validateMutation } from '../validationService';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AIAssetType = 'model' | 'prompt_template' | 'workflow' | 'provider' | 'agent';
export type AIAssetStatus = 'active' | 'deprecated' | 'in_review' | 'retired';

export interface AIAsset {
  id: string;
  company_id: string;
  name: string;
  asset_type: AIAssetType;
  provider_vendor_id: string | null;
  status: AIAssetStatus;
  owner_id: string | null;
  description: string | null;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  owner?: { id: string; full_name: string } | null;
  provider?: { id: string; name: string } | null;
}

export interface AIAssetControl {
  id: string;
  company_id: string;
  asset_id: string;
  control_id: string;
  status: string;
  created_at: string;
  // Joins
  control?: { id: string; reference_code: string; title: string } | null;
}

// ─── AI Asset CRUD ──────────────────────────────────────────────────────────

export async function listAssets(companyId: string, filters?: {
  type?: AIAssetType;
  status?: AIAssetStatus;
  provider_id?: string;
  owner_id?: string;
}): Promise<AIAsset[]> {
  let query = (supabase as any)
    .from('ai_assets')
    .select('*, owner:profiles(id, full_name), provider:vendors(id, name)')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });

  if (filters?.type) query = query.eq('asset_type', filters.type);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.provider_id) query = query.eq('provider_vendor_id', filters.provider_id);
  if (filters?.owner_id) query = query.eq('owner_id', filters.owner_id);

  const { data, error } = await query;
  if (error) {
    logger.error('listAssets:', error);
    return [];
  }
  return data ?? [];
}

export async function getAsset(id: string): Promise<AIAsset | null> {
  const { data, error } = await (supabase as any)
    .from('ai_assets')
    .select('*, owner:profiles(id, full_name), provider:vendors(id, name)')
    .eq('id', id)
    .single();

  if (error) {
    logger.error('getAsset:', error);
    return null;
  }
  return data;
}

export async function createAsset(
  companyId: string,
  userId: string,
  asset: Pick<AIAsset, 'name' | 'asset_type' | 'provider_vendor_id' | 'owner_id' | 'description' | 'metadata'>
): Promise<AIAsset | null> {
  const validation = await validateMutation(userId, companyId, 'canManageAIAssets' as any);
  if (!validation.valid) throw new Error(validation.message);

  const { data, error } = await (supabase as any)
    .from('ai_assets')
    .insert({
      company_id: companyId,
      created_by: userId,
      ...asset,
      status: 'active'
    })
    .select()
    .single();

  if (error) {
    logger.error('createAsset:', error);
    return null;
  }

  await recordAuditEvent({
    userId,
    action: 'create_ai_asset',
    entityType: 'ai_asset',
    entityId: data.id,
    companyId,
    metadata: { name: data.name, type: data.asset_type }
  });

  return data;
}

export async function updateAsset(
  companyId: string,
  userId: string,
  assetId: string,
  updates: Partial<Pick<AIAsset, 'name' | 'asset_type' | 'status' | 'description' | 'metadata' | 'provider_vendor_id' | 'owner_id'>>
): Promise<boolean> {
  const validation = await validateMutation(userId, companyId, 'canManageAIAssets' as any);
  if (!validation.valid) throw new Error(validation.message);

  const { error } = await (supabase as any)
    .from('ai_assets')
    .update(updates)
    .eq('id', assetId);

  if (error) {
    logger.error('updateAsset:', error);
    return false;
  }

  await recordAuditEvent({
    userId,
    action: 'update_ai_asset',
    entityType: 'ai_asset',
    entityId: assetId,
    companyId,
    metadata: updates
  });

  return true;
}

export async function retireAsset(companyId: string, userId: string, assetId: string): Promise<boolean> {
  const success = await updateAsset(companyId, userId, assetId, { status: 'retired' });
  if (success) {
    await recordAuditEvent({
      userId,
      action: 'retire_ai_asset',
      entityType: 'ai_asset',
      entityId: assetId,
      companyId
    });
  }
  return success;
}

export async function assignOwner(companyId: string, userId: string, assetId: string, ownerId: string | null): Promise<boolean> {
  const success = await updateAsset(companyId, userId, assetId, { owner_id: ownerId });
  if (success) {
    await recordAuditEvent({
      userId,
      action: 'assign_ai_asset_owner',
      entityType: 'ai_asset',
      entityId: assetId,
      companyId,
      metadata: { owner_id: ownerId }
    });
  }
  return success;
}

export async function linkVendor(companyId: string, userId: string, assetId: string, vendorId: string | null): Promise<boolean> {
  const success = await updateAsset(companyId, userId, assetId, { provider_vendor_id: vendorId });
  if (success) {
    await recordAuditEvent({
      userId,
      action: 'link_ai_vendor',
      entityType: 'ai_asset',
      entityId: assetId,
      companyId,
      metadata: { vendor_id: vendorId }
    });
  }
  return success;
}

// ─── AI Asset Controls ─────────────────────────────────────────────────────

export async function listAssetControls(assetId: string): Promise<AIAssetControl[]> {
  const { data, error } = await (supabase as any)
    .from('ai_asset_controls')
    .select('*, control:grc_controls(id, reference_code, title)')
    .eq('asset_id', assetId);

  if (error) {
    logger.error('listAssetControls:', error);
    return [];
  }
  return data ?? [];
}

export async function linkAssetControl(
  companyId: string,
  userId: string,
  assetId: string,
  controlId: string
): Promise<boolean> {
  const validation = await validateMutation(userId, companyId, 'canManageAIAssets' as any);
  if (!validation.valid) throw new Error(validation.message);

  const { error } = await (supabase as any)
    .from('ai_asset_controls')
    .insert({
      company_id: companyId,
      asset_id: assetId,
      control_id: controlId
    });

  if (error) {
    logger.error('linkAssetControl:', error);
    return false;
  }

  await recordAuditEvent({
    userId,
    action: 'link_ai_asset_control',
    entityType: 'ai_asset',
    entityId: assetId,
    companyId,
    metadata: { control_id: controlId }
  });

  return true;
}

export async function unlinkAssetControl(
  companyId: string,
  userId: string,
  linkId: string,
  assetId: string // For audit log context
): Promise<boolean> {
  const validation = await validateMutation(userId, companyId, 'canManageAIAssets' as any);
  if (!validation.valid) throw new Error(validation.message);

  const { error } = await (supabase as any)
    .from('ai_asset_controls')
    .delete()
    .eq('id', linkId);

  if (error) {
    logger.error('unlinkAssetControl:', error);
    return false;
  }

  await recordAuditEvent({
    userId,
    action: 'unlink_ai_asset_control',
    entityType: 'ai_asset',
    entityId: assetId,
    companyId,
    metadata: { link_id: linkId }
  });

  return true;
}
