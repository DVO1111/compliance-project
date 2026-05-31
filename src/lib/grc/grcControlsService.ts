import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

// ─── Types ───────────────────────────────────────────────────
export type GrcControl = {
  id: string;
  company_id: string;
  framework_id: string;
  reference_code: string | null;
  title: string;
  description: string | null;
  domain_category: string | null;
  status: string | null;
  owner_user_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type EnrichedControl = GrcControl & {
  framework_name: string;
  owner_name: string | null;
  latest_snapshot_status: string | null;
  evidence_count: number;
};

// ─── Create ──────────────────────────────────────────────────
export async function createControl(
  control: {
    company_id: string;
    framework_id: string;
    reference_code?: string | null;
    title: string;
    description?: string | null;
    domain_category?: string | null;
    status?: string | null;
    owner_user_id?: string | null;
  },
  userId: string
): Promise<GrcControl> {
  const { data, error } = await (supabase as any)
    .from('grc_controls')
    .insert({ ...control, created_by: userId })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create control:', error);
    throw new Error(error.message || 'Failed to create control');
  }

  const record = data as GrcControl;
  if (record) {
    try {
      await recordAuditEvent({
        userId,
        companyId: record.company_id,
        action: 'create_control',
        entityType: 'grc_control',
        entityId: record.id,
        metadata: {
          title: record.title,
          reference_code: record.reference_code,
          framework_id: record.framework_id,
        },
        captureEvidence: false,
      });
    } catch (auditErr) {
      logger.error('Failed to record audit event for createControl:', auditErr);
    }
  }

  return record;
}

// ─── Update ──────────────────────────────────────────────────
export async function updateControl(
  id: string,
  updates: Record<string, any>,
  userId: string,
  companyId: string
): Promise<GrcControl> {
  const { data: oldData } = await (supabase as any)
    .from('grc_controls')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  const { data, error } = await (supabase as any)
    .from('grc_controls')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update control:', error);
    throw new Error(error.message || 'Failed to update control');
  }

  const record = data as GrcControl;
  if (record) {
    try {
      await recordAuditEvent({
        userId,
        companyId: record.company_id,
        action: 'update_control',
        entityType: 'grc_control',
        entityId: record.id,
        metadata: {
          updates,
          previous_values: oldData,
          framework_id: record.framework_id,
        },
        captureEvidence: false,
      });
    } catch (auditErr) {
      logger.error('Failed to record audit event for updateControl:', auditErr);
    }
  }

  return record;
}

// ─── Assign Owner ────────────────────────────────────────────
export async function assignOwner(
  controlId: string,
  ownerUserId: string | null,
  userId: string,
  companyId: string
): Promise<GrcControl> {
  const { data, error } = await (supabase as any)
    .from('grc_controls')
    .update({ owner_user_id: ownerUserId })
    .eq('id', controlId)
    .eq('company_id', companyId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to assign owner:', error);
    throw new Error(error.message || 'Failed to assign owner');
  }

  const record = data as GrcControl;
  try {
    await recordAuditEvent({
      userId,
      companyId,
      action: 'assign_owner',
      entityType: 'grc_control',
      entityId: controlId,
      metadata: { owner_user_id: ownerUserId },
      captureEvidence: false,
    });
  } catch (auditErr) {
    logger.error('Failed to record audit event for assignOwner:', auditErr);
  }

  return record;
}

// ─── Enriched List (N+1-free) ────────────────────────────────
export async function getControlsEnriched(
  companyId: string,
  frameworkFilter?: string
): Promise<EnrichedControl[]> {
  // Build controls query
  let controlsQuery = (supabase as any)
    .from('grc_controls')
    .select('*')
    .eq('company_id', companyId)
    .order('reference_code', { ascending: true });

  if (frameworkFilter) {
    controlsQuery = controlsQuery.eq('framework_id', frameworkFilter);
  }

  // 5 parallel queries
  const [controlsRes, frameworksRes, snapshotsRes, evidenceRes, profilesRes] = await Promise.all([
    controlsQuery,
    (supabase as any).from('grc_frameworks').select('id,name').eq('company_id', companyId),
    (supabase as any)
      .from('grc_control_snapshots')
      .select('control_id,status')
      .eq('company_id', companyId)
      .order('snapshot_date', { ascending: false }),
    (supabase as any)
      .from('grc_control_evidence')
      .select('control_id')
      .eq('company_id', companyId),
    supabase.from('profiles').select('id,full_name').eq('company_id', companyId),
  ]);

  if (controlsRes.error) {
    logger.error('Failed to get controls:', controlsRes.error);
    throw new Error(controlsRes.error.message || 'Failed to load controls');
  }

  const controls = (controlsRes.data || []) as GrcControl[];

  // Framework name map
  const fwMap: Record<string, string> = {};
  if (frameworksRes.data) {
    for (const fw of frameworksRes.data as any[]) {
      fwMap[fw.id] = fw.name;
    }
  }

  // Latest snapshot map (first occurrence per control_id since ordered desc)
  const snapMap: Record<string, string> = {};
  if (snapshotsRes.data) {
    for (const s of snapshotsRes.data as any[]) {
      if (!snapMap[s.control_id]) {
        snapMap[s.control_id] = s.status;
      }
    }
  }

  // Evidence count map
  const evidenceMap: Record<string, number> = {};
  if (evidenceRes.data) {
    for (const e of evidenceRes.data as any[]) {
      evidenceMap[e.control_id] = (evidenceMap[e.control_id] || 0) + 1;
    }
  }

  // Owner name map
  const ownerMap: Record<string, string> = {};
  if (profilesRes.data) {
    for (const p of profilesRes.data as any[]) {
      ownerMap[p.id] = p.full_name || 'Unnamed';
    }
  }

  return controls.map((c) => ({
    ...c,
    framework_name: fwMap[c.framework_id] || 'Unknown',
    owner_name: c.owner_user_id ? ownerMap[c.owner_user_id] || null : null,
    latest_snapshot_status: snapMap[c.id] || null,
    evidence_count: evidenceMap[c.id] || 0,
  }));
}

// ─── Get Company Members (for owner picker) ──────────────────
export type CompanyMember = {
  user_id: string;
  full_name: string;
};

export async function getCompanyMembers(companyId: string): Promise<CompanyMember[]> {
  const { data: memberData } = await (supabase as any)
    .from('company_members')
    .select('user_id')
    .eq('company_id', companyId);

  if (!memberData || memberData.length === 0) return [];

  const userIds = (memberData as any[]).map((m) => m.user_id).filter(Boolean);

  const { data: profileData } = await supabase
    .from('profiles')
    .select('id,full_name')
    .in('id', userIds);

  if (!profileData) return [];

  return (profileData as any[]).map((p) => ({
    user_id: p.id,
    full_name: p.full_name || 'Unnamed',
  }));
}
