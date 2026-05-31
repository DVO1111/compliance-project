import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { createJobRun, updateJobRunStatus } from '../platform/governanceJobService';
import { retentionService, RetentionPolicy, DataClass } from './retentionService';
import { legalHoldService } from './legalHoldService';

export interface RetentionDryRunResult {
  policyId: string;
  dataClass: DataClass;
  recordsIdentified: number;
  recordsHeld: number;
  actionTaken: 'none' | 'archived' | 'deleted';
}

export const retentionRunner = {
  /**
   * Executes a dry-run of retention policies for a company.
   * Identifies records that would be archived or deleted.
   */
  async executeDryRun(companyId: string, userId: string): Promise<RetentionDryRunResult[]> {
    const jobId = await createJobRun({
      companyId,
      jobType: 'retention_runner',
      jobName: 'Retention Policy Execution (Dry Run)',
      source: 'system',
      triggeredBy: userId
    });

    try {
      const policies = await retentionService.listRetentionPolicies(companyId);
      const results: RetentionDryRunResult[] = [];

      for (const policy of policies.filter(p => p.enabled)) {
        const stats = await this.calculateRetentionImpact(policy);
        results.push({
          policyId: policy.id,
          dataClass: policy.data_class,
          recordsIdentified: stats.totalPastThreshold,
          recordsHeld: stats.totalOnHold,
          actionTaken: 'none'
        });
      }

      if (jobId) {
        await updateJobRunStatus(jobId, 'completed', { 
          companyId, 
          userId, 
          metadata: { dryRunResults: results } 
        });
      }

      await recordAuditEvent({
        userId,
        companyId,
        action: 'retention_dry_run',
        entityType: 'retention_policy',
        entityId: 'batch',
        metadata: { policy_count: policies.length, total_identified: results.reduce((sum, r) => sum + r.recordsIdentified, 0) }
      });

      return results;
    } catch (err: any) {
      if (jobId) await updateJobRunStatus(jobId, 'failed', { errorMessage: err.message, companyId, userId });
      throw err;
    }
  },

  async calculateRetentionImpact(policy: RetentionPolicy): Promise<{ totalPastThreshold: number; totalOnHold: number }> {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - policy.retention_days);
    
    // In a real implementation, we would query each table based on data_class
    // For MVP dry-run, we'll implement a few major ones or return mock counts if table not easily accessible
    
    let tableName = policy.data_class;
    let dateColumn = 'created_at';

    // Map data_class to actual table if different
    if (policy.data_class === 'content_submissions') {
      tableName = 'content_submissions';
    } else if (policy.data_class === 'policy_acknowledgements') {
      tableName = 'policy_acknowledgements';
      dateColumn = 'acknowledged_at';
    }

    // Get records past threshold
    const { data: records, error } = await supabase
      .from(tableName as any)
      .select('id')
      .eq('company_id', policy.company_id)
      .lt(dateColumn, thresholdDate.toISOString());

    if (error || !records) return { totalPastThreshold: 0, totalOnHold: 0 };

    // Filter by legal hold
    // In a production scenario, this would be a JOIN or efficient RPC
    let holdCount = 0;
    for (const rec of records) {
      const onHold = await legalHoldService.isEntityOnActiveHold(policy.data_class.replace(/s$/, ''), (rec as any).id);
      if (onHold) holdCount++;
    }

    return {
      totalPastThreshold: records.length,
      totalOnHold: holdCount
    };
  }
};
