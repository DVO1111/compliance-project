import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { createJobRun, updateJobRunStatus } from '../platform/governanceJobService';
import { logger } from '../logger';

export type GrcControlTest = {
  id: string;
  company_id: string;
  control_id: string;
  test_name: string;
  provider_id: string;
  connection_id: string;
  check_type: 'configuration' | 'log_audit' | 'resource_list' | 'identity_verify';
  configuration: Record<string, any>;
  frequency: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function createTest(
  test: Omit<GrcControlTest, 'id' | 'created_at' | 'updated_at' | 'last_run_at' | 'next_run_at' | 'created_by'>,
  userId: string
): Promise<GrcControlTest> {
  const { data, error } = await (supabase as any)
    .from('grc_control_tests')
    .insert({ 
      ...test, 
      created_by: userId,
      next_run_at: computeNextRunAt(test.frequency)
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create control test:', error);
    throw new Error(error.message || 'Failed to create test');
  }

  const record = data as GrcControlTest;
  await recordAuditEvent({
    userId,
    companyId: record.company_id,
    action: 'create_control_test',
    entityType: 'grc_control_test',
    entityId: record.id,
    metadata: { 
      test_name: record.test_name, 
      provider_id: record.provider_id,
      control_id: record.control_id
    },
    captureEvidence: false
  });

  return record;
}

export async function updateTest(
  id: string,
  updates: Partial<GrcControlTest>,
  userId: string,
  companyId: string
): Promise<GrcControlTest> {
  const { data: oldData } = await (supabase as any)
    .from('grc_control_tests')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single();

  const finalUpdates = { ...updates };
  if (updates.frequency) {
    finalUpdates.next_run_at = computeNextRunAt(updates.frequency);
  }

  const { data, error } = await (supabase as any)
    .from('grc_control_tests')
    .update(finalUpdates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update control test:', error);
    throw new Error(error.message || 'Failed to update test');
  }

  const record = data as GrcControlTest;
  await recordAuditEvent({
    userId,
    companyId: record.company_id,
    action: 'update_control_test',
    entityType: 'grc_control_test',
    entityId: record.id,
    metadata: { updates, previous_values: oldData },
    captureEvidence: false
  });

  return record;
}

export async function toggleTestEnabled(
  id: string,
  enabled: boolean,
  userId: string,
  companyId: string
): Promise<void> {
  const { error } = await (supabase as any)
    .from('grc_control_tests')
    .update({ enabled })
    .eq('id', id)
    .eq('company_id', companyId);

  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: enabled ? 'enable_control_test' : 'disable_control_test',
    entityType: 'grc_control_test',
    entityId: id,
    metadata: { enabled },
    captureEvidence: false
  });
}

export async function listTestsByControl(
  controlId: string,
  companyId: string
): Promise<GrcControlTest[]> {
  const { data, error } = await (supabase as any)
    .from('grc_control_tests')
    .select('*')
    .eq('control_id', controlId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function listAllTests(
  companyId: string
): Promise<(GrcControlTest & { grc_controls: { reference_code: string; title: string } })[]> {
  const { data, error } = await (supabase as any)
    .from('grc_control_tests')
    .select('*, grc_controls(reference_code, title)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Manually trigger an automation test via edge function
 */
export async function triggerTest(
  testId: string,
  companyId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const jobId = await createJobRun({
    companyId,
    jobType: 'automation_runner',
    jobName: `Manual Test Run: ${testId}`,
    source: 'manual',
    triggeredBy: userId,
    relatedEntityType: 'grc_control_test',
    relatedEntityId: testId
  });

  const { data, error } = await supabase.functions.invoke('automation-runner', {
    body: { testId, companyId }
  });

  if (error) {
    logger.error('Failed to trigger automation test:', error);
    if (jobId) await updateJobRunStatus(jobId, 'failed', { errorMessage: error.message, companyId, userId });
    throw new Error(error.message || 'Failed to trigger test');
  }

  if (jobId) {
    await updateJobRunStatus(jobId, 'completed', { 
        companyId, 
        userId, 
        metadata: { results: data?.results } 
    });
  }

  await recordAuditEvent({
    userId,
    companyId,
    action: 'manual_run_triggered',
    entityType: 'grc_control_test',
    entityId: testId,
    metadata: { testId },
    captureEvidence: false
  });

  return { 
    success: data?.results?.executed > 0 || data?.message?.includes('complete'), 
    message: data?.message || 'Manual run triggered successfully'
  };
}

export function computeNextRunAt(frequency: string): string {
  const now = new Date();
  switch (frequency.toLowerCase()) {
    case 'hourly':
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    case 'daily':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    case 'monthly':
      const nextMonth = new Date(now);
      nextMonth.setMonth(now.getMonth() + 1);
      return nextMonth.toISOString();
    default:
      // If it's a cron string or unknown, default to next hour for safety in this MVP
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }
}
