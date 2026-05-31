import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

export type GrcTestRun = {
  id: string;
  company_id: string;
  test_id: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'error';
  result: 'pass' | 'fail' | 'warning' | null;
  evidence_payload: Record<string, any>;
  executed_at: string;
  duration_ms: number | null;
  error_message: string | null;
};

export async function createRun(
  run: Omit<GrcTestRun, 'id' | 'executed_at'>,
  userId: string | null = null // Automation runner might not have a userId in traditional sense
): Promise<GrcTestRun> {
  const { data, error } = await (supabase as any)
    .from('grc_test_runs')
    .insert(run)
    .select()
    .single();

  if (error) {
    logger.error('Failed to record test run:', error);
    throw new Error(error.message || 'Failed to record run');
  }

  const record = data as GrcTestRun;
  
  // Update the test's last_run_at and next_run_at if successful/failed completion
  if (record.status !== 'queued' && record.status !== 'running') {
    const { data: test } = await (supabase as any)
      .from('grc_control_tests')
      .select('frequency')
      .eq('id', record.test_id)
      .single();
    
    if (test) {
      const { computeNextRunAt } = await import('./grcControlTestsService');
      await (supabase as any)
        .from('grc_control_tests')
        .update({ 
          last_run_at: record.executed_at,
          next_run_at: computeNextRunAt(test.frequency)
        })
        .eq('id', record.test_id);
    }
  }

  // Audit event (userId might be null for automation runner service-role calls)
  await recordAuditEvent({
    userId: userId || '00000000-0000-0000-0000-000000000000', // System/Bot ID
    companyId: record.company_id,
    action: 'record_test_run',
    entityType: 'grc_test_run',
    entityId: record.id,
    metadata: { 
      test_id: record.test_id, 
      status: record.status, 
      result: record.result 
    },
    captureEvidence: false
  });

  return record;
}

export async function listRunsByTest(
  testId: string,
  companyId: string,
  limit = 20
): Promise<GrcTestRun[]> {
  const { data, error } = await (supabase as any)
    .from('grc_test_runs')
    .select('*')
    .eq('test_id', testId)
    .eq('company_id', companyId)
    .order('executed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getLatestRunByTest(
  testId: string,
  companyId: string
): Promise<GrcTestRun | null> {
  const { data, error } = await (supabase as any)
    .from('grc_test_runs')
    .select('*')
    .eq('test_id', testId)
    .eq('company_id', companyId)
    .order('executed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function listAllRuns(
  companyId: string,
  limit = 50
): Promise<(GrcTestRun & { grc_control_tests: { test_name: string } })[]> {
  const { data, error } = await (supabase as any)
    .from('grc_test_runs')
    .select('*, grc_control_tests(test_name)')
    .eq('company_id', companyId)
    .order('executed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
