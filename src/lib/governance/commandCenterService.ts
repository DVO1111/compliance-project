import { supabase } from '../supabase';
import { Risk, RISK_LEVELS, RISK_CATEGORIES } from './riskRegisterService';
import { CompanyRiskPosture } from './riskScoringService';

export interface DashboardMetrics {
  posture: CompanyRiskPosture | null;
  overdueAuditsCount: number;
  aiGovernance: {
    openIncidents: number;
    pendingReviews: number;
    flaggedUsage: number;
  } | null;
}

export interface RiskHeatmapData {
  row: string; // Level
  col: string; // Category
  count: number;
}

export interface VendorPulseData {
  category: string;
  score: number;
  count: number;
}

export interface AutomationHealthData {
  date: string;
  passed: number;
  failed: number;
}

export async function getDashboardMetrics(companyId: string): Promise<DashboardMetrics> {
  const [postureRes, auditsRes, aiUsageRes, aiIncidentsRes, aiReviewsRes] = await Promise.all([
    supabase
      .from('company_risk_posture')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle(),
    supabase
      .from('audit_requests')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .neq('status', 'fulfilled') // Assuming 'fulfilled' is closed
      .lt('due_at', new Date().toISOString()),
    supabase
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .filter('risk_flags', 'neq', '{}'),
    supabase
      .from('ai_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['open', 'investigating', 'escalated']),
    supabase
      .from('ai_output_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'pending')
  ]);

  const postureRow = postureRes.data as any;
  const posture: CompanyRiskPosture | null = postureRow
    ? ({
        ...postureRow,
        critical_risks_count: postureRow.critical_risks_count ?? 0,
        high_risks_count:     postureRow.high_risks_count     ?? 0,
        medium_risks_count:   postureRow.medium_risks_count   ?? 0,
        low_risks_count:      postureRow.low_risks_count      ?? 0,
      } as CompanyRiskPosture)
    : null;

  return {
    posture,
    overdueAuditsCount: auditsRes.count || 0,
    aiGovernance: {
      flaggedUsage: aiUsageRes.count || 0,
      openIncidents: aiIncidentsRes.count || 0,
      pendingReviews: aiReviewsRes.count || 0
    }
  };
}

export async function getRiskHeatmap(companyId: string): Promise<RiskHeatmapData[]> {
  const { data: risks } = await supabase
    .from('risks')
    .select('risk_level, risk_category')
    .eq('company_id', companyId)
    .neq('status', 'closed');

  if (!risks) return [];

  const matrix: Record<string, number> = {};
  
  risks.forEach((r: { risk_level: string; risk_category: string }) => {
    const key = `${r.risk_level}:${r.risk_category}`;
    matrix[key] = (matrix[key] || 0) + 1;
  });

  const results: RiskHeatmapData[] = [];
  RISK_LEVELS.forEach(l => {
    RISK_CATEGORIES.forEach(c => {
      results.push({
        row: l.id,
        col: c.id,
        count: matrix[`${l.id}:${c.id}`] || 0
      });
    });
  });

  return results;
}

/**
 * Thrown when a panel's underlying query fails, rather than returning an
 * empty result.
 *
 * supabase-js RESOLVES a failed query with `{ data: null, error }` instead
 * of rejecting, so `const { data } = await ...` cannot tell a real empty
 * result from a missing relation or a permission denial. Every one of the
 * four view-backed panels below used to do exactly that, which is why a
 * view that does not exist rendered as a confident `0%` rather than as a
 * problem. See PanelUnavailableError's one use in CommandCenterPage: the
 * panel says it could not load, and the other eight still render.
 *
 * `relation` is carried so a caller can tell which view is missing without
 * parsing the message.
 */
export class PanelUnavailableError extends Error {
  readonly relation: string;
  readonly cause?: unknown;

  constructor(relation: string, cause?: unknown) {
    const detail =
      cause && typeof cause === 'object' && 'message' in (cause as any)
        ? String((cause as any).message)
        : undefined;
    super(
      detail
        ? `Could not read ${relation}: ${detail}`
        : `Could not read ${relation}.`
    );
    this.name = 'PanelUnavailableError';
    this.relation = relation;
    this.cause = cause;
  }
}

export async function getVendorPulse(companyId: string): Promise<VendorPulseData[]> {
  const { data, error } = await supabase
    .from('v_vendor_risk_exposure' as any)
    .select('category, avg_risk_score, vendor_count')
    .eq('company_id', companyId);

  if (error) throw new PanelUnavailableError('v_vendor_risk_exposure', error);

  return (data || []).map((v: any) => ({
    category: v.category,
    score: v.avg_risk_score,
    count: v.vendor_count
  }));
}

export async function getPolicyCompliance(companyId: string): Promise<{ acknowledged: number; total: number; rate: number }> {
    const { data, error } = await supabase
        .from('v_policy_compliance_stats' as any)
        .select('acknowledged_users, total_users, compliance_rate')
        .eq('company_id', companyId);

    if (error) throw new PanelUnavailableError('v_policy_compliance_stats', error);

    if (!data || data.length === 0) return { acknowledged: 0, total: 0, rate: 0 };

    //  Summed across policies deliberately: the denominator is every
    //  acknowledgement the company owes (headcount x active policies), so
    //  the ratio answers "of everything that had to be acknowledged, how
    //  much was". total_users is the company headcount repeated per
    //  policy, which is correct for that reading and would be wrong if
    //  read as a headcount on its own.
    //
    //  The counts are bigint in Postgres and arrive as JS numbers. That is
    //  safe here — headcount x policies stays far below 2^53 — but Number()
    //  is explicit so a string from a driver change cannot turn this into
    //  string concatenation and a nonsense rate.
    const stats = (data as any[]).reduce((acc, curr) => ({
        acknowledged: acc.acknowledged + Number(curr.acknowledged_users ?? 0),
        total: acc.total + Number(curr.total_users ?? 0)
    }), { acknowledged: 0, total: 0 });

    return {
        acknowledged: stats.acknowledged,
        total: stats.total,
        rate: stats.total > 0 ? Math.round((stats.acknowledged / stats.total) * 100) : 0
    };
}

export async function getAutomationHealth(companyId: string): Promise<AutomationHealthData[]> {
  const { data, error } = await supabase
    .from('v_automation_health_summary' as any)
    .select('run_date, passed_count, failed_count')
    .eq('company_id', companyId)
    .order('run_date', { ascending: true });

  //  This one is expected to fail on every deployment today: the view
  //  reads public.grc_automation_runs and nothing in the migration tree
  //  creates that table. It is still thrown rather than swallowed, so the
  //  panel reports itself unavailable instead of drawing an empty chart
  //  that looks like "no automation runs this month".
  if (error) throw new PanelUnavailableError('v_automation_health_summary', error);

  if (!data) return [];

  return data.map((item: any) => ({
    date: item.run_date,
    passed: Number(item.passed_count ?? 0),
    failed: Number(item.failed_count ?? 0)
  }));
}

export async function getAuditVelocity(companyId: string): Promise<any[]> {
    const { data, error } = await supabase
        .from('v_audit_velocity' as any)
        .select('session_name, total_requests, fulfilled_requests')
        .eq('company_id', companyId);

    if (error) throw new PanelUnavailableError('v_audit_velocity', error);

    if (!data) return [];

    return data.map((item: any) => ({
        name: item.session_name,
        created: Number(item.total_requests ?? 0),
        fulfilled: Number(item.fulfilled_requests ?? 0)
    }));
}

export async function getTopRisks(companyId: string): Promise<Risk[]> {
    const { data } = await supabase
        .from('risks')
        .select(`
            *,
            owner:profiles(full_name),
            risk_links(count)
        `)
        .eq('company_id', companyId)
        .neq('status', 'closed')
        .order('risk_level', { ascending: false }) // This assumes alphanumeric order high->critical might need manual sort but simple for now
        .limit(5);
    
    return (data || []).map((r: any) => ({
        ...r,
        links_count: r.risk_links?.[0]?.count || 0
    }));
}

export async function getRegulatoryExposure(companyId: string): Promise<{ total: number; implemented: number; pending: number; highRisk: number; rate: number }> {
    const { data } = await (supabase
        .from('regulatory_obligations') as any)
        .select('*')
        .eq('company_id', companyId);
    
    if (!data) return { total: 0, implemented: 0, pending: 0, highRisk: 0, rate: 0 };

    const total = data.length;
    const implemented = (data || []).filter((o: any) => o.status === 'implemented').length;
    const pending = (data || []).filter((o: any) => o.status === 'identified').length;
    const rate = total > 0 ? Math.round((implemented / total) * 100) : 0;
    
    // For high risk, we could check if it's linked to 'critical' risks but simple count for now
    const highRisk = (data || []).filter((o: any) => o.category === 'critical' || o.jurisdiction === 'global').length; // Placeholder logic

    return { total, implemented, pending, highRisk, rate };
}

export async function getCorrelationEvents(companyId: string) {
    const { data, error } = await supabase
        .from('correlation_events')
        .select('*, rule:correlation_rules(*)')
        .eq('company_id', companyId)
        .order('triggered_at', { ascending: false })
        .limit(5);

    if (error) throw error;
    return data || [];
}

export async function triggerCorrelationEvaluation(companyId: string, userId: string) {
    // This is a bridge to the recently created correlationService
    const { evaluateSignalsAndTriggerEvents } = await import('./correlationService');
    return evaluateSignalsAndTriggerEvents(companyId, userId);
}
