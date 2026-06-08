// src/lib/contentBlockService.ts
// Dynamic Asset Composition — pre-approved, compliance-locked content blocks

import { supabase } from './supabase';
import { logger } from './logger';
import { recordAuditEvent } from './auditService';

/* ── Types ───────────────────────────────────────────── */

export type BlockType = 'disclaimer' | 'statistic' | 'risk_statement' | 'boilerplate' | 'fair_balance' | 'call_to_action' | 'custom';

export interface ContentBlock {
  id: string;
  company_id: string;
  block_name: string;
  block_type: BlockType;
  content_text: string;
  jurisdiction: string;
  version: number;
  is_locked: boolean;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface BlockUsageRecord {
  id: string;
  block_id: string;
  content_id: string;
  used_at: string;
}

/* ── Block CRUD ──────────────────────────────────────── */

export async function createBlock(
  companyId: string,
  data: {
    blockName: string;
    blockType: BlockType;
    contentText: string;
    jurisdiction?: string;
  },
  userId: string
): Promise<ContentBlock | null> {
  const { data: block, error } = await (supabase as any)
    .from('content_blocks')
    .insert({
      company_id: companyId,
      block_name: data.blockName,
      block_type: data.blockType,
      content_text: data.contentText,
      jurisdiction: data.jurisdiction || 'all',
      version: 1,
      is_locked: false,
      created_by: userId,
    })
    .select()
    .single();

  if (error) { logger.error('createBlock error:', error); return null; }

  try {
    await recordAuditEvent({
      companyId, userId,
      action: `content_block.created: ${data.blockName} (${data.blockType})`,
      entityType: 'content_block', entityId: block.id,
      metadata: { blockType: data.blockType, jurisdiction: data.jurisdiction ?? 'all' },
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }

  return block;
}

export async function updateBlock(
  blockId: string,
  data: { contentText?: string; blockName?: string },
  companyId?: string,
  userId?: string,
): Promise<void> {
  const updates: any = { updated_at: new Date().toISOString() };
  if (data.contentText !== undefined) updates.content_text = data.contentText;
  if (data.blockName !== undefined) updates.block_name = data.blockName;

  // Increment version
  const { data: current } = await (supabase as any)
    .from('content_blocks')
    .select('version')
    .eq('id', blockId)
    .single();

  if (current) updates.version = (current.version || 1) + 1;

  await (supabase as any)
    .from('content_blocks')
    .update(updates)
    .eq('id', blockId);

  if (companyId && userId) {
    try {
      await recordAuditEvent({
        companyId, userId,
        action: 'content_block.updated',
        entityType: 'content_block', entityId: blockId,
        metadata: { fields: Object.keys(data) },
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }
}

export async function lockBlock(blockId: string, userId: string, companyId?: string): Promise<void> {
  await (supabase as any)
    .from('content_blocks')
    .update({
      is_locked: true,
      approved_at: new Date().toISOString(),
      approved_by: userId,
    })
    .eq('id', blockId);

  if (companyId) {
    try {
      await recordAuditEvent({
        companyId, userId,
        action: 'content_block.locked',
        entityType: 'content_block', entityId: blockId,
        metadata: {},
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }
}

export async function unlockBlock(blockId: string, userId?: string, companyId?: string): Promise<void> {
  await (supabase as any)
    .from('content_blocks')
    .update({ is_locked: false, approved_at: null, approved_by: null })
    .eq('id', blockId);

  if (companyId && userId) {
    try {
      await recordAuditEvent({
        companyId, userId,
        action: 'content_block.unlocked',
        entityType: 'content_block', entityId: blockId,
        metadata: {},
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }
}

export async function deleteBlock(blockId: string, companyId?: string, userId?: string): Promise<void> {
  if (companyId && userId) {
    try {
      await recordAuditEvent({
        companyId, userId,
        action: 'content_block.deleted',
        entityType: 'content_block', entityId: blockId,
        metadata: {},
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }

  await (supabase as any)
    .from('content_blocks')
    .delete()
    .eq('id', blockId);
}

export async function getBlocks(
  companyId: string,
  filters?: { blockType?: BlockType; jurisdiction?: string; search?: string }
): Promise<ContentBlock[]> {
  let query = (supabase as any)
    .from('content_blocks')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });

  if (filters?.blockType) query = query.eq('block_type', filters.blockType);
  if (filters?.jurisdiction) query = query.eq('jurisdiction', filters.jurisdiction);
  if (filters?.search) query = query.ilike('block_name', `%${filters.search}%`);

  const { data, error } = await query;
  if (error) { logger.error('getBlocks error:', error); return []; }
  return data ?? [];
}

/* ── Usage Tracking ──────────────────────────────────── */

export async function recordUsage(blockId: string, contentId: string, companyId: string): Promise<void> {
  await (supabase as any)
    .from('block_usage')
    .insert({ company_id: companyId, block_id: blockId, content_id: contentId });
}

export async function getUsage(blockId: string): Promise<BlockUsageRecord[]> {
  const { data, error } = await (supabase as any)
    .from('block_usage')
    .select('*')
    .eq('block_id', blockId)
    .order('used_at', { ascending: false });

  if (error) { logger.error('getUsage error:', error); return []; }
  return data ?? [];
}

export async function getBlocksUsedInContent(contentId: string): Promise<ContentBlock[]> {
  const { data, error } = await (supabase as any)
    .from('block_usage')
    .select('block:content_blocks(*)')
    .eq('content_id', contentId);

  if (error) { logger.error('getBlocksUsedInContent error:', error); return []; }
  return (data ?? []).map((row: any) => row.block).filter(Boolean);
}
