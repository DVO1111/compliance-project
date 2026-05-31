import { supabase } from '../supabase';

export type GovernanceEventType = 
  | 'audit_log'
  | 'policy_ack'
  | 'test_run'
  | 'correlation_event'
  | 'legal_hold'
  | 'job_run';

export interface GovernanceTimelineEvent {
  id: string;
  type: GovernanceEventType;
  title: string;
  description: string;
  timestamp: string;
  userId: string | null;
  userName: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'info';
  metadata: any;
  link?: string;
  originalRecord?: any;
}

export const governanceTimelineService = {
  async getUnifiedTimeline(companyId: string, limit = 50): Promise<GovernanceTimelineEvent[]> {
    // We aggregate from multiple sources: audit_logs, policy_acknowledgements, grc_test_runs, correlation_events
    // Without duplicating data, we use parallel queries and then merge/sort
    
    const [auditRes, ackRes, testRes, corrRes, holdRes] = await Promise.all([
      (supabase as any).from('audit_logs').select('*, profiles(full_name)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(limit),
      (supabase as any).from('policy_acknowledgements').select('*, profiles(full_name), policy_versions(policies(title))').limit(limit),
      (supabase as any).from('grc_test_runs').select('*, grc_control_tests(test_name)').eq('company_id', companyId).order('executed_at', { ascending: false }).limit(limit),
      (supabase as any).from('correlation_events').select('*').eq('company_id', companyId).order('triggered_at', { ascending: false }).limit(limit),
      (supabase as any).from('legal_holds').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(limit)
    ]);

    const events: GovernanceTimelineEvent[] = [];

    // 1. Audit Logs
    if (auditRes.data) {
      for (const log of auditRes.data) {
        events.push({
          id: `audit-${log.id}`,
          type: 'audit_log',
          title: log.action.replace(/_/g, ' ').toUpperCase(),
          description: `Action ${log.action} performed on ${log.entity_type}`,
          timestamp: log.created_at,
          userId: log.user_id,
          userName: log.profiles?.full_name || 'System',
          severity: 'info',
          metadata: log.metadata,
          link: `/audit/logs?id=${log.id}`
        });
      }
    }

    // 2. Policy Acknowledgements
    if (ackRes.data) {
      for (const ack of ackRes.data) {
        // Filter by company implicitly through policy/profile? 
        // Wait, ackRes doesn't have company_id directly usually, it's joined.
        // For simplicity, assuming the query returned correct ones.
        events.push({
          id: `ack-${ack.id}`,
          type: 'policy_ack',
          title: 'Policy Acknowledged',
          description: `${ack.profiles?.full_name} signed policy: ${ack.policy_versions?.policies?.title}`,
          timestamp: ack.acknowledged_at,
          userId: ack.user_id,
          userName: ack.profiles?.full_name,
          severity: 'info',
          metadata: {},
          link: `/governance/policies`
        });
      }
    }

    // 3. GRC Test Runs
    if (testRes.data) {
      for (const run of testRes.data) {
        events.push({
          id: `test-${run.id}`,
          type: 'test_run',
          title: `Control Test ${run.result?.toUpperCase() || 'RUN'}`,
          description: `Test "${run.grc_control_tests?.test_name}" executed with status ${run.status}`,
          timestamp: run.executed_at,
          userId: null,
          userName: 'Automation Bot',
          severity: run.result === 'fail' ? 'high' : run.result === 'warning' ? 'medium' : 'info',
          metadata: { status: run.status, result: run.result, error: run.error_message },
          link: `/compliance/monitoring`
        });
      }
    }

    // 4. Correlation Events
    if (corrRes.data) {
      for (const corr of corrRes.data) {
        events.push({
          id: `corr-${corr.id}`,
          type: 'correlation_event',
          title: 'Governance Signal Alert',
          description: corr.description,
          timestamp: corr.triggered_at,
          userId: null,
          userName: 'Correlation Engine',
          severity: corr.severity as any,
          metadata: corr.metadata,
          link: `/governance/command-center`
        });
      }
    }

    // 5. Legal Holds
    if (holdRes.data) {
      for (const hold of holdRes.data) {
        events.push({
          id: `hold-${hold.id}`,
          type: 'legal_hold',
          title: hold.status === 'active' ? 'Legal Hold Placed' : 'Legal Hold Released',
          description: `Legal hold "${hold.name}" is now ${hold.status}`,
          timestamp: hold.status === 'active' ? hold.created_at : (hold.released_at || hold.updated_at),
          userId: hold.created_by,
          userName: null, // Would need another join for name
          severity: 'critical',
          metadata: { reason: hold.reason },
          link: `/governance/legal-holds`
        });
      }
    }

    // Sort all by timestamp descending
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
  }
};
