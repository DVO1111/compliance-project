import { supabase } from '../supabase';
import { Database } from '../database.types';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

export type FrameworkRow = Database['public']['Tables']['grc_frameworks']['Row'];
export type GrcFramework = FrameworkRow;
type FrameworkInsert = Database['public']['Tables']['grc_frameworks']['Insert'];
type FrameworkUpdate = Database['public']['Tables']['grc_frameworks']['Update'];

export async function createFramework(
  framework: FrameworkInsert,
  userId: string
): Promise<FrameworkRow | null> {
  const { data, error } = await (supabase as any)
    .from('grc_frameworks')
    .insert({ ...framework, created_by: userId })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create framework:', error);
    throw new Error(error.message || 'Failed to create framework');
  }

  const record = data as unknown as FrameworkRow;
  if (record) {
    try {
      await recordAuditEvent({
        userId,
        companyId: record.company_id,
        action: 'create_framework',
        entityType: 'grc_framework',
        entityId: record.id,
        metadata: { name: record.name, version: record.version },
        captureEvidence: false
      });
    } catch (auditErr) {
      logger.error('Failed to record audit event for createFramework:', auditErr);
    }
  }

  return record;
}

export async function getFrameworks(companyId: string): Promise<FrameworkRow[]> {
  const { data, error } = await supabase
    .from('grc_frameworks')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to get frameworks:', error);
    return [];
  }

  return data || [];
}

export async function updateFramework(
  id: string,
  updates: FrameworkUpdate,
  userId: string,
  companyId: string
): Promise<FrameworkRow | null> {
  // Fetch old data for metadata (optional but good practice)
  const { data: oldData } = await supabase
    .from('grc_frameworks')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  const { data, error } = await (supabase as any)
    .from('grc_frameworks')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update framework:', error);
    throw new Error(error.message || 'Failed to update framework');
  }

  const record = data as unknown as FrameworkRow;
  if (record) {
    try {
      await recordAuditEvent({
        userId,
        companyId: record.company_id,
        action: 'update_framework',
        entityType: 'grc_framework',
        entityId: record.id,
        metadata: { updates, previous_values: oldData },
        captureEvidence: false
      });
    } catch (auditErr) {
      logger.error('Failed to record audit event for updateFramework:', auditErr);
    }
  }

  return record;
}

export type FrameworkWithCount = FrameworkRow & { control_count: number };

export async function getFrameworksWithControlCounts(companyId: string): Promise<FrameworkWithCount[]> {
  // Two parallel queries: frameworks + control counts grouped by framework_id
  const [frameworksRes, countsRes] = await Promise.all([
    supabase
      .from('grc_frameworks')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('grc_controls')
      .select('framework_id')
      .eq('company_id', companyId),
  ]);

  if (frameworksRes.error) {
    logger.error('Failed to get frameworks:', frameworksRes.error);
    return [];
  }

  const frameworks = (frameworksRes.data || []) as any[];

  // Build count map client-side
  const countMap: Record<string, number> = {};
  if (countsRes.data) {
    for (const row of countsRes.data) {
      const fid = (row as any).framework_id;
      countMap[fid] = (countMap[fid] || 0) + 1;
    }
  }

  return frameworks.map(fw => ({
    ...fw,
    control_count: countMap[fw.id] || 0,
  })) as FrameworkWithCount[];
}
