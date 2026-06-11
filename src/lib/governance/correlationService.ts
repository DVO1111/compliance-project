import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { createJobRun, updateJobRunStatus } from '../platform/governanceJobService';
import { logger } from '../logger';

export interface CorrelationRule {
  id: string;
  company_id: string;
  rule_name: string;
  description: string;
  risk_impact: 'security' | 'privacy' | 'operational' | 'financial' | 'legal' | 'compliance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  signal_conditions: any;
}

export interface CorrelationEvent {
  id: string;
  company_id: string;
  rule_id: string;
  triggered_at: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  linked_risk_id?: string;
  metadata: any;
  rule?: CorrelationRule;
}

export async function listCorrelationRules(companyId: string): Promise<CorrelationRule[]> {
  const { data, error } = await (supabase
    .from('correlation_rules') as any)
    .select('*')
    .eq('company_id', companyId);

  if (error) throw error;
  return data || [];
}

export async function listCorrelationEvents(companyId: string, status?: string): Promise<CorrelationEvent[]> {
  let query = (supabase
    .from('correlation_events') as any)
    .select('*, rule:correlation_rules(*)')
    .eq('company_id', companyId)
    .order('triggered_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function evaluateSignalsAndTriggerEvents(companyId: string, userId: string) {
  const jobId = await createJobRun({
    companyId,
    jobType: 'correlation_runner',
    jobName: 'Signal Correlation Engine',
    source: 'system',
    triggeredBy: userId
  });

  try {
    // 1. Fetch Rules
    const rules = await listCorrelationRules(companyId);
    if (rules.length === 0) {
        if (jobId) await updateJobRunStatus(jobId, 'completed', { companyId, userId, metadata: { message: 'No rules found' } });
        return;
    }

    // 2. Aggregate Signals (This would normally be more complex/cached)
  
  // Signal A: Automation Failures
  const { count: automationFailures } = await supabase
    .from('grc_test_runs')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('result', 'fail')
    .gte('executed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Last 7 days

  // Signal B: High Vendor Risks
  const { data: highRiskVendors } = await (supabase
    .from('vendor_risk_profiles') as any)
    .select('risk_score')
    .gte('risk_score', 70);
  
  const vendorRiskCount = highRiskVendors?.length || 0;

  // Signal C: Overdue Policy Acknowledgements
  const { count: overdueCount } = await supabase
    .from('policy_acknowledgements')
    .select('*', { count: 'exact', head: true })
    .lt('acknowledged_at', new Date().toISOString());

  // Signal D: Pending Obligations
  const { count: pendingObligations } = await (supabase
    .from('regulatory_obligations') as any)
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'identified');

  // console.log('Signals checked:', { automationFailures, vendorRiskCount, overdueCount, pendingObligations });

  // 3. Process Rules
  const triggeredEvents: any[] = [];

  for (const rule of rules) {
    let triggered = false;
    let desc = rule.description;

    const cond = rule.signal_conditions;

    if (rule.rule_name === 'High Vendor Risk + Automation Failure') {
      if (vendorRiskCount >= (cond.vendor_risk_threshold || 1) && (automationFailures || 0) >= (cond.automation_failure_count || 1)) {
        triggered = true;
        desc = `Detected ${vendorRiskCount} high-risk vendors and ${automationFailures} recent automation failures. Potential systemic infrastructure risk.`;
      }
    }

    if (rule.rule_name === 'Policy Gap + Non-Compliant Controls') {
      if ((pendingObligations || 0) >= (cond.pending_obligation_count || 1)) {
        triggered = true;
        desc = `High volume of pending regulatory obligations (${pendingObligations}). Immediate compliance review required.`;
      }
    }

    if (triggered) {
      // Check if event already exists in 'open' status to avoid spam
      const { data: existing } = await supabase
        .from('correlation_events')
        .select('id')
        .eq('company_id', companyId)
        .eq('rule_id', rule.id)
        .eq('status', 'open')
        .limit(1);

      if (!existing || existing.length === 0) {
        triggeredEvents.push({
          company_id: companyId,
          rule_id: rule.id,
          severity: rule.severity,
          description: desc,
          status: 'open',
          metadata: {
            automationFailures,
            vendorRiskCount,
            pendingObligations,
            evaluated_at: new Date().toISOString()
          }
        });
      }
    }
  }

  if (triggeredEvents.length > 0) {
    const { data: insertedEvents, error } = await (supabase
      .from('correlation_events') as any)
      .insert(triggeredEvents)
      .select('id, rule_id, severity, description');

    if (error) throw error;

    await recordAuditEvent({
      userId,
      companyId,
      action: 'correlation_events_triggered',
      entityType: 'correlation_engine',
      entityId: 'system',
      metadata: { count: triggeredEvents.length }
    });

    // Create a Risk Register entry for each triggered event and backlink it
    await maybeCreateRisksForEvents(companyId, userId, insertedEvents ?? [], rules);
  }

    if (jobId) {
        await updateJobRunStatus(jobId, 'completed', { 
            companyId, 
            userId, 
            metadata: { triggered_count: triggeredEvents.length } 
        });
    }

    return triggeredEvents;
  } catch (err: any) {
    if (jobId) await updateJobRunStatus(jobId, 'failed', { errorMessage: err.message, companyId, userId });
    throw err;
  }
}

async function maybeCreateRisksForEvents(
  companyId: string,
  userId: string,
  events: { id: string; rule_id: string; severity: string; description: string }[],
  rules: CorrelationRule[],
): Promise<void> {
  try {
    const { createRisk } = await import('./riskRegisterService');
    const ruleMap = new Map(rules.map(r => [r.id, r]));

    for (const event of events) {
      try {
        const rule = ruleMap.get(event.rule_id);
        const risk = await createRisk(companyId, userId, {
          title: `Correlation Alert: ${rule?.rule_name ?? 'Signal Threshold Breached'}`,
          description: event.description,
          risk_category: rule?.risk_impact ?? 'operational',
          risk_level: (event.severity as 'low' | 'medium' | 'high' | 'critical'),
          status: 'identified',
        });

        if (risk) {
          await (supabase.from('correlation_events') as any)
            .update({ linked_risk_id: risk.id })
            .eq('id', event.id)
            .eq('company_id', companyId);
        }
      } catch (innerErr) {
        logger.warn(`maybeCreateRisksForEvents: failed for event ${event.id}`, innerErr);
      }
    }
  } catch (err) {
    logger.warn('maybeCreateRisksForEvents: non-blocking', err);
  }
}

export async function resolveCorrelationEvent(companyId: string, userId: string, eventId: string, notes: string) {
  const { data, error } = await (supabase
    .from('correlation_events') as any)
    .update({ 
      status: 'resolved', 
      metadata: { resolution_notes: notes, resolved_at: new Date().toISOString() } 
    })
    .eq('id', eventId)
    .eq('company_id', companyId)
    .select()
    .single();

  if (error) throw error;

  await recordAuditEvent({
    userId,
    companyId,
    action: 'correlation_event_resolved',
    entityType: 'correlation_event',
    entityId: eventId,
    metadata: { notes }
  });

  return data;
}
