/**
 * Crisis Response Service — Supabase-backed
 */
import { supabase } from './supabase';
import { logger } from './logger';
import { recordAuditEvent } from './auditService';

export type CrisisLevel = 'watch' | 'alert' | 'critical' | 'recall';
export type CrisisStatus = 'active' | 'contained' | 'resolved' | 'closed';

export type CrisisEvent = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  level: CrisisLevel;
  status: CrisisStatus;
  product: string;
  affected_channels: string[];
  affected_content_count: number;
  withdrawn_count: number;
  triggered_by: string | null;
  triggered_at: string;
  resolved_at: string | null;
  timeline?: TimelineEntry[];
};

export type TimelineEntry = {
  id: string;
  crisis_id: string;
  action: string;
  performer: string;
  details: string | null;
  automated: boolean;
  created_at: string;
};

export type AffectedMaterial = {
  id: string;
  crisis_id: string;
  title: string;
  channel: string;
  status: 'live' | 'withdrawn' | 'under_review';
  withdrawn_at: string | null;
};

/* ── CRUD ─────────────────────────────────────────────── */

export async function getCrisisEvents(companyId: string): Promise<CrisisEvent[]> {
  const { data, error } = await (supabase as any)
    .from('crisis_events')
    .select('*, timeline:crisis_timeline_entries(*)')
    .eq('company_id', companyId)
    .order('triggered_at', { ascending: false });

  if (error) { logger.error('getCrisisEvents error:', error); return []; }
  return data ?? [];
}

export async function createCrisisEvent(companyId: string, userId: string, event: {
  title: string;
  description?: string;
  level: CrisisLevel;
  product: string;
  affected_channels?: string[];
}): Promise<CrisisEvent | null> {
  const { data, error } = await (supabase as any)
    .from('crisis_events')
    .insert({
      company_id: companyId,
      title: event.title,
      description: event.description || null,
      level: event.level,
      status: 'active',
      product: event.product,
      affected_channels: event.affected_channels || [],
      triggered_by: userId,
    })
    .select()
    .single();

  if (error) { logger.error('createCrisisEvent error:', error); return null; }

  // Auto-add first timeline entry
  await addTimelineEntry(data.id, 'Crisis triggered', 'System', `Crisis event created: ${event.title}`, false);

  try { await recordAuditEvent({ userId, companyId, action: 'crisis.created', entityType: 'crisis_event', entityId: data.id, metadata: { title: event.title, level: event.level, product: event.product }, captureEvidence: false }); } catch { /* non-blocking */ }
  return data;
}

export async function updateCrisisStatus(crisisId: string, status: CrisisStatus, companyId: string, userId: string): Promise<boolean> {
  const updates: any = { status };
  if (status === 'resolved' || status === 'closed') updates.resolved_at = new Date().toISOString();

  const { error } = await (supabase as any)
    .from('crisis_events')
    .update(updates)
    .eq('id', crisisId);

  if (error) { logger.error('updateCrisisStatus error:', error); return false; }
  try { await recordAuditEvent({ userId, companyId, action: 'crisis.status_changed', entityType: 'crisis_event', entityId: crisisId, metadata: { status }, captureEvidence: false }); } catch { /* non-blocking */ }
  return true;
}

export async function updateCrisisCounts(crisisId: string, affectedCount: number, withdrawnCount: number): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('crisis_events')
    .update({ affected_content_count: affectedCount, withdrawn_count: withdrawnCount })
    .eq('id', crisisId);

  if (error) { logger.error('updateCrisisCounts error:', error); return false; }
  return true;
}

/* ── Timeline ────────────────────────────────────────── */

export async function addTimelineEntry(crisisId: string, action: string, performer: string, details: string, automated: boolean): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('crisis_timeline_entries')
    .insert({ crisis_id: crisisId, action, performer, details, automated });

  if (error) { logger.error('addTimelineEntry error:', error); return false; }
  return true;
}

/* ── Affected Materials ──────────────────────────────── */

export async function getAffectedMaterials(crisisId: string): Promise<AffectedMaterial[]> {
  const { data, error } = await (supabase as any)
    .from('crisis_affected_materials')
    .select('*')
    .eq('crisis_id', crisisId)
    .order('title');

  if (error) { logger.error('getAffectedMaterials error:', error); return []; }
  return data ?? [];
}

export async function addAffectedMaterial(crisisId: string, title: string, channel: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('crisis_affected_materials')
    .insert({ crisis_id: crisisId, title, channel, status: 'live' });

  if (error) { logger.error('addAffectedMaterial error:', error); return false; }
  return true;
}

export async function withdrawMaterial(materialId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('crisis_affected_materials')
    .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString() })
    .eq('id', materialId);

  if (error) { logger.error('withdrawMaterial error:', error); return false; }
  return true;
}

/**
 * Automatically identifies all live content for a product and flags them for the crisis.
 */
export async function activateAutomatedProtocol(crisisId: string, product: string): Promise<number> {
  // 1. Find all live content submissions for this product (using title as proxy)
  const { data: submissions } = await (supabase as any)
    .from('content_submissions')
    .select('id, title, platform')
    .ilike('title', `%${product}%`)
    .eq('status', 'approved');

  if (!submissions || submissions.length === 0) return 0;

  // 2. Add them to affected materials
  const materials = submissions.map((s: any) => ({
    crisis_id: crisisId,
    title: s.title,
    channel: s.platform,
    status: 'live'
  }));

  const { error } = await (supabase as any)
    .from('crisis_affected_materials')
    .insert(materials);

  if (error) {
    logger.error('activateAutomatedProtocol insert error:', error);
    return 0;
  }

  // 3. Update crisis count
  await updateCrisisCounts(crisisId, submissions.length, 0);

  // 4. Add timeline entry
  await addTimelineEntry(
    crisisId,
    'Automated Protocol Activated',
    'AI Protocol Agent',
    `Identified ${submissions.length} live materials associated with "${product}" across multiple channels.`,
    true
  );

  return submissions.length;
}

/**
 * Bulk withdraws all flagged materials for a crisis.
 */
export async function quarantineAllMaterials(crisisId: string, companyId?: string, userId?: string): Promise<boolean> {
  // 1. Bulk update status to withdrawn
  const { error } = await (supabase as any)
    .from('crisis_affected_materials')
    .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString() })
    .eq('crisis_id', crisisId)
    .eq('status', 'live');

  if (error) {
    logger.error('quarantineAllMaterials error:', error);
    return false;
  }

  // 2. Get the new count of withdrawn materials
  const { data: materials } = await (supabase as any)
    .from('crisis_affected_materials')
    .select('id, status')
    .eq('crisis_id', crisisId);

  const total = materials?.length || 0;
  const withdrawn = materials?.filter((m: any) => m.status === 'withdrawn').length || 0;

  // 3. Update crisis counts
  await updateCrisisCounts(crisisId, total, withdrawn);

  // 4. Add timeline entry
  await addTimelineEntry(
    crisisId,
    'Global Quarantine Executed',
    'Crisis Lead (Automated Tool)',
    `Mass withdrawal of ${withdrawn} materials completed. All live channels are now quarantined.`,
    true
  );

  if (companyId && userId) {
    try { await recordAuditEvent({ userId, companyId, action: 'crisis.quarantine_executed', entityType: 'crisis_event', entityId: crisisId, metadata: { withdrawn_count: withdrawn, total_count: total }, captureEvidence: false }); } catch { /* non-blocking */ }
  }
  return true;
}

/**
 * Simulates an emergency broadcast to the organization.
 */
export async function sendEmergencyBroadcast(crisisId: string, message: string, performer: string): Promise<boolean> {
  return addTimelineEntry(
    crisisId,
    'Emergency Broadcast Sent',
    performer,
    `BROADCAST: ${message}`,
    false
  );
}
