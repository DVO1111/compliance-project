import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

// ── Types ──────────────────────────────────────────────────────────

export type JobType = 
  | 'automation_runner' 
  | 'policy_reminder_runner' 
  | 'correlation_runner' 
  | 'audit_export' 
  | 'risk_posture_refresh'
  | 'retention_runner';

export type JobSource = 'cron' | 'manual' | 'system';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface GovernanceJobRun {
  id: string;
  company_id: string | null;
  job_type: JobType;
  job_name: string;
  source: JobSource;
  status: JobStatus;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  triggered_by: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: any;
  error_message: string | null;
}

export interface JobHealthSummary {
  activeJobs: number;
  failedIn24h: number;
  successRate24h: number;
  avgDurationByType: Record<string, number>;
  latestFailures: GovernanceJobRun[];
}

// ── Service Methods ────────────────────────────────────────────────

/**
 * Records the start of a governance job.
 */
export async function createJobRun(params: {
  companyId: string | null;
  jobType: JobType;
  jobName: string;
  source: JobSource;
  triggeredBy?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: any;
}): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from('governance_job_runs')
    .insert({
      company_id: params.companyId,
      job_type: params.jobType,
      job_name: params.jobName,
      source: params.source,
      status: 'running',
      triggered_by: params.triggeredBy,
      related_entity_type: params.relatedEntityType,
      related_entity_id: params.relatedEntityId,
      metadata: params.metadata || {}
    })
    .select('id')
    .single();

  if (error) {
    logger.error('[GovernanceJob] Error creating job run:', error);
    return null;
  }

  await recordAuditEvent({
    userId: params.triggeredBy || 'system',
    action: 'create_job_run',
    entityType: 'governance_job_run',
    entityId: data.id,
    companyId: params.companyId || 'public',
    metadata: { job_type: params.jobType, job_name: params.jobName },
    captureEvidence: false
  });

  return data.id;
}

/**
 * Updates a job run status and calculates duration.
 */
export async function updateJobRunStatus(
  id: string,
  status: JobStatus,
  options?: {
    errorMessage?: string;
    metadata?: any;
    companyId?: string | null;
    userId?: string;
  }
): Promise<void> {
  const completedAt = (status === 'completed' || status === 'failed' || status === 'cancelled') 
    ? new Date().toISOString() 
    : null;

  // Get start time to calculate duration
  const { data: job } = await (supabase as any)
    .from('governance_job_runs')
    .select('started_at')
    .eq('id', id)
    .single();

  let duration_ms = null;
  if (job && completedAt) {
    duration_ms = new Date(completedAt).getTime() - new Date(job.started_at).getTime();
  }

  const { error } = await (supabase as any)
    .from('governance_job_runs')
    .update({
      status,
      completed_at: completedAt,
      duration_ms,
      error_message: options?.errorMessage,
      metadata: options?.metadata ? { ...(job?.metadata || {}), ...options.metadata } : undefined
    })
    .eq('id', id);

  if (error) {
    logger.error('[GovernanceJob] Error updating job status:', error);
  }

  await recordAuditEvent({
    userId: options?.userId || 'system',
    action: 'update_job_run',
    entityType: 'governance_job_run',
    entityId: id,
    companyId: options?.companyId || 'public',
    metadata: { status, error: options?.errorMessage },
    captureEvidence: false
  });
}

/**
 * Lists job runs with optional filters.
 */
export async function listJobRuns(filters?: {
  companyId?: string;
  jobType?: JobType;
  status?: JobStatus;
  limit?: number;
}): Promise<GovernanceJobRun[]> {
  let query = (supabase as any)
    .from('governance_job_runs')
    .select('*')
    .order('started_at', { ascending: false });

  if (filters?.companyId) query = query.eq('company_id', filters.companyId);
  if (filters?.jobType) query = query.eq('job_type', filters.jobType);
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) {
    logger.error('[GovernanceJob] Error listing jobs:', error);
    return [];
  }
  return data as GovernanceJobRun[];
}

/**
 * Gets health summary metrics.
 */
export async function getJobHealthSummary(companyId?: string): Promise<JobHealthSummary> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1. Active jobs
  const { count: activeCount } = await (supabase as any)
    .from('governance_job_runs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'running')
    .match(companyId ? { company_id: companyId } : {});

  // 2. Failures in 24h
  const { count: failed24h } = await (supabase as any)
    .from('governance_job_runs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('started_at', yesterday)
    .match(companyId ? { company_id: companyId } : {});

  // 3. Success rate 24h
  const { data: runs24h } = await (supabase as any)
    .from('governance_job_runs')
    .select('status')
    .gte('started_at', yesterday)
    .match(companyId ? { company_id: companyId } : {});
  
  const total24h = runs24h?.length || 0;
  const completed24h = runs24h?.filter((r: any) => r.status === 'completed').length || 0;
  const successRate = total24h > 0 ? (completed24h / total24h) * 100 : 100;

  // 4. Latest failures
  const { data: failures } = await (supabase as any)
    .from('governance_job_runs')
    .select('*')
    .eq('status', 'failed')
    .match(companyId ? { company_id: companyId } : {})
    .order('started_at', { ascending: false })
    .limit(5);

  return {
    activeJobs: activeCount || 0,
    failedIn24h: failed24h || 0,
    successRate24h: Math.round(successRate),
    avgDurationByType: {}, // Aggregation would be better in SQL, placeholder for MVP
    latestFailures: failures || []
  };
}

/**
 * Retries a job by re-invoking the original logic.
 */
export async function retryJob(jobRunId: string, companyId: string, userId: string): Promise<boolean> {
  const { data: job, error } = await (supabase as any)
    .from('governance_job_runs')
    .select('*')
    .eq('id', jobRunId)
    .single();

  if (error || !job) return false;

  // Create new run row
  const newJobId = await createJobRun({
    companyId: job.company_id,
    jobType: job.job_type,
    jobName: job.job_name,
    source: 'manual',
    triggeredBy: userId,
    relatedEntityType: job.related_entity_type,
    relatedEntityId: job.related_entity_id,
    metadata: { ...job.metadata, retried_from_job_run_id: job.id }
  });

  if (!newJobId) return false;

  await recordAuditEvent({
    userId,
    action: 'retry_job_run',
    entityType: 'governance_job_run',
    entityId: newJobId,
    companyId: job.company_id || 'public',
    metadata: { original_run_id: job.id },
    captureEvidence: false
  });

  // Triggering logic depends on job type
  try {
    if (job.job_type === 'automation_runner' && job.related_entity_id) {
        const { triggerTest } = await import('../grcAutomation/grcControlTestsService');
        await triggerTest(job.related_entity_id, companyId, userId);
    } else if (job.job_type === 'correlation_runner') {
        const { evaluateSignalsAndTriggerEvents } = await import('../governance/correlationService');
        await evaluateSignalsAndTriggerEvents(companyId, userId);
    } else if (job.job_type === 'audit_export' && job.related_entity_id) {
        // Need to find sessionId and export type from metadata or similar
        // For MVP, we'll assume we can re-trigger basic exports
    } else if (job.job_type === 'risk_posture_refresh') {
        const { recomputeCompanyRiskPosture } = await import('../governance/riskScoringService');
        await recomputeCompanyRiskPosture(companyId);
    }

    // Success if we reached here
    await updateJobRunStatus(newJobId, 'completed', { companyId: job.company_id, userId });
    return true;
  } catch (err: any) {
    await updateJobRunStatus(newJobId, 'failed', { 
        errorMessage: err.message, 
        companyId: job.company_id, 
        userId 
    });
    return false;
  }
}
