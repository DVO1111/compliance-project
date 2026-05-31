import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { createJobRun, updateJobRunStatus } from '../platform/governanceJobService';
import {
  listRequests,
  getSessionEvidence,
  listRequestItems,
  exportAuditPack
} from './auditWorkspaceService';
import { logger } from '../logger';

// ── Types ──────────────────────────────────────────────────────────

export type ExportType = 'json_bundle' | 'csv_bundle' | 'print_view';
export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface AuditExportJob {
  id: string;
  company_id: string;
  audit_session_id: string;
  requested_by: string | null;
  export_type: ExportType;
  status: ExportStatus;
  file_url: string | null;
  metadata: any;
  created_at: string;
  completed_at: string | null;
}

export interface AuditPackSummary {
  totalRequests: number;
  fulfilledRequests: number;
  evidenceCount: number;
  controlsCount: number;
  policiesCount: number;
  vendorsCount: number;
}

// ── Service Methods ────────────────────────────────────────────────

/**
 * Creates a new export job record and initiates generation.
 */
export async function createExportJob(
  companyId: string,
  sessionId: string,
  userId: string,
  exportType: ExportType
): Promise<AuditExportJob | null> {
  const { data, error } = await (supabase as any)
    .from('audit_export_jobs')
    .insert({
      company_id: companyId,
      audit_session_id: sessionId,
      requested_by: userId,
      export_type: exportType,
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    logger.error('[AuditExport] Error creating job:', error);
    return null;
  }

  await recordAuditEvent({
    userId,
    action: 'create_audit_export_job',
    entityType: 'audit_export_job',
    entityId: data.id,
    companyId,
    metadata: { export_type: exportType, session_id: sessionId },
    captureEvidence: false
  });

  // For MVP, we trigger generation immediately (synchronously or background-ish)
  // In a real prod environment, this might be handled by an Edge Function
  generateAuditPackJob(data.id, sessionId, userId, companyId);

  return data as AuditExportJob;
}

/**
 * Lists export jobs for a session.
 */
export async function listExportJobs(sessionId: string): Promise<AuditExportJob[]> {
  const { data, error } = await (supabase as any)
    .from('audit_export_jobs')
    .select('*')
    .eq('audit_session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[AuditExport] Error listing jobs:', error);
    return [];
  }
  return data as AuditExportJob[];
}

/**
 * Gets a quick summary of audit session stats for the UI.
 */
export async function getAuditPackSummary(sessionId: string): Promise<AuditPackSummary> {
  const [requests, evidence] = await Promise.all([
    listRequests(sessionId),
    getSessionEvidence(sessionId)
  ]);

  const fulfilled = requests.filter(r => r.status === 'fulfilled').length;
  
  // To get controls/policies/vendors count, we need to inspect all request items
  let controls = new Set<string>();
  let policies = new Set<string>();
  let vendors = new Set<string>();

  for (const req of requests) {
    const items = await listRequestItems(req.id);
    items.forEach(item => {
      if (item.control_id) controls.add(item.control_id);
      if (item.policy_version_id) policies.add(item.policy_version_id);
      if (item.vendor_id) vendors.add(item.vendor_id);
    });
  }

  return {
    totalRequests: requests.length,
    fulfilledRequests: fulfilled,
    evidenceCount: evidence.length,
    controlsCount: controls.size,
    policiesCount: policies.size,
    vendorsCount: vendors.size
  };
}

/**
 * Internal worker to generate the pack and update job status.
 */
async function generateAuditPackJob(
  jobId: string, 
  sessionId: string, 
  userId: string,
  companyId: string
) {
  const monitoringJobId = await createJobRun({
    companyId,
    jobType: 'audit_export',
    jobName: `Audit Export: ${sessionId}`,
    source: 'manual',
    triggeredBy: userId,
    relatedEntityType: 'audit_session',
    relatedEntityId: sessionId
  });

  try {
    // 1. Update status to processing
    await (supabase as any)
      .from('audit_export_jobs')
      .update({ status: 'processing' })
      .eq('id', jobId);

    // 2. Generate data
    const pack = await generateFullAuditPack(sessionId);
    
    // 3. Update status to completed with results in metadata
    await (supabase as any)
      .from('audit_export_jobs')
      .update({ 
        status: 'completed', 
        completed_at: new Date().toISOString(),
        metadata: { result: pack } 
      })
      .eq('id', jobId);

    if (monitoringJobId) {
        await updateJobRunStatus(monitoringJobId, 'completed', { companyId, userId });
    }

    await recordAuditEvent({
      userId,
      action: 'generate_audit_export',
      entityType: 'audit_export_job',
      entityId: jobId,
      companyId,
      metadata: { session_id: sessionId },
      captureEvidence: false
    });

  } catch (err) {
    logger.error('[AuditExport] Background generation failed:', err);
    if (monitoringJobId) {
      await updateJobRunStatus(monitoringJobId, 'failed', { 
        errorMessage: String(err), 
        companyId, 
        userId 
      });
    }
    await (supabase as any)
      .from('audit_export_jobs')
      .update({ status: 'failed', metadata: { error: String(err) } })
      .eq('id', jobId);
  }
}

/**
 * Generates the full enriched JSON pack.
 */
async function generateFullAuditPack(sessionId: string): Promise<any> {
  // Reuse existing base export logic
  const basePack = await exportAuditPack(sessionId);
  if (!basePack) throw new Error('Failed to generate base audit pack');

  // Any additional enrichment requested in requirements (e.g. snapshots)
  // Logic to fetch latest snapshots for linked controls
  const enrichedRequests = await Promise.all((basePack as any).requests.map(async (req: any) => {
    const rawItems = await listRequestItems(req.id);
    const itemsWithSnapshots = await Promise.all(rawItems.map(async (item) => {
      if (item.control_id) {
        const { data: snapshot } = await (supabase as any)
          .from('grc_control_snapshots')
          .select('*')
          .eq('control_id', item.control_id)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        return { ...item, latest_snapshot: snapshot };
      }
      return item;
    }));
    return { ...req, items: itemsWithSnapshots };
  }));

  // Fetch relevant audit logs
  const { data: auditLogs } = await (supabase as any)
    .from('audit_logs')
    .select('*')
    .eq('entity_id', sessionId) // Or filter by session-related entities
    .limit(100);

  return {
    ...basePack,
    requests: enrichedRequests,
    audit_logs: auditLogs ?? []
  };
}

/**
 * Triggers a download of a completed export job.
 */
export async function downloadExport(jobId: string, companyId: string, userId: string): Promise<void> {
  const { data: job, error } = await (supabase as any)
    .from('audit_export_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error || !job || job.status !== 'completed') {
    throw new Error('Export job not found or not completed');
  }

  const result = job.metadata?.result;
  if (!result) throw new Error('Export data missing');

  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-export-${job.id.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  await recordAuditEvent({
    userId,
    action: 'download_audit_export',
    entityType: 'audit_export_job',
    entityId: jobId,
    companyId,
    metadata: { export_type: job.export_type },
    captureEvidence: false
  });
}
