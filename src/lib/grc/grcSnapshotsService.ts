import { supabase } from '../supabase';
import { Database } from '../database.types';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

type SnapshotRow = Database['public']['Tables']['grc_control_snapshots']['Row'];
type SnapshotInsert = Database['public']['Tables']['grc_control_snapshots']['Insert'];

export async function createSnapshot(
  snapshot: SnapshotInsert,
  userId: string
): Promise<SnapshotRow | null> {
  const { data, error } = await (supabase as any)
    .from('grc_control_snapshots')
    .insert({ ...snapshot, created_by: userId })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create snapshot:', error);
    return null;
  }

  const record = data as unknown as SnapshotRow;
  if (record) {
    try {
      await recordAuditEvent({
        userId,
        companyId: record.company_id,
        action: 'set_snapshot',
        entityType: 'grc_control_snapshot',
        entityId: record.id,
        metadata: { control_id: record.control_id, status: record.status, notes: record.notes },
        captureEvidence: false
      });
    } catch (auditErr) {
      logger.error('Failed to record audit event for createSnapshot:', auditErr);
    }
  }

  return record;
}

export async function getLatestSnapshot(
  controlId: string,
  companyId: string
): Promise<SnapshotRow | null> {
  const { data, error } = await (supabase as any)
    .from('grc_control_snapshots')
    .select('*')
    .eq('control_id', controlId)
    .eq('company_id', companyId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('Failed to get latest snapshot:', error);
    return null;
  }

  return data as unknown as SnapshotRow | null;
}

export async function getSnapshotHistory(
  controlId: string,
  companyId: string
): Promise<SnapshotRow[]> {
  const { data, error } = await (supabase as any)
    .from('grc_control_snapshots')
    .select('*')
    .eq('control_id', controlId)
    .eq('company_id', companyId)
    .order('snapshot_date', { ascending: false });

  if (error) {
    logger.error('Failed to get snapshot history:', error);
    return [];
  }

  return (data as unknown as SnapshotRow[]) || [];
}
