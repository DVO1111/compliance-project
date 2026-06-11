import { supabase } from '../supabase';
import { createJobRun, updateJobRunStatus } from '../platform/governanceJobService';

// ─── Configuration ──────────────────────────────────────────────────────────

// Weights for the global posture score (must sum to 100)
export const SIGNAL_WEIGHTS = {
  control: 0.35,     // 35% - Control Failures
  vendor: 0.25,      // 25% - Vendor Risk
  policy: 0.20,      // 20% - Policy Compliance
  automation: 0.10,  // 10% - Automation Health
  audit: 0.10,       // 10% - Audit Activity
};

export interface CompanyRiskPosture {
  company_id: string;
  posture_score: number;
  policy_signal_score: number;
  control_signal_score: number;
  automation_signal_score: number;
  vendor_signal_score: number;
  audit_signal_score: number;
  highest_risk_level: string;
  open_risks_count: number;
  critical_risks_count: number;
  high_risks_count: number;
  medium_risks_count: number;
  low_risks_count: number;
  updated_at: string;
}

// ─── Signals Calculation ────────────────────────────────────────────────────

/**
 * Policy Signal: % of Overdue Acknowledgements
 * Score 0-100 (0 = perfect, 100 = all overdue)
 */
async function calculatePolicySignal(companyId: string): Promise<number> {
  // Simplistic version: count policies vs count published versions vs acks
  // For MVP: let's look at published policies and see if they have any acks
  const { data: policies } = await (supabase as any)
    .from('policies')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (!policies?.length) return 0;

  // Real world would check overdue dates. For now, baseline is 100 - (acks / policies * 100)
  const { count: acks } = await (supabase as any)
    .from('policy_acknowledgements')
    .select('*', { count: 'exact', head: true })
    .in('policy_id', policies.map((p: any) => p.id));

  const ratio = (acks ?? 0) / (policies.length * 10); // Assume avg 10 users per policy baseline
  const score = Math.max(0, 100 - (ratio * 100));
  return Math.min(100, score);
}

/**
 * Control Signal: latest non_compliant snapshots
 * Score 0-100
 */
async function calculateControlSignal(companyId: string): Promise<number> {
  const { data: snapshots } = await (supabase as any)
    .from('grc_control_snapshots')
    .select('status')
    .eq('company_id', companyId)
    .order('snapshot_date', { ascending: false })
    .limit(50);

  if (!snapshots?.length) return 0;

  const failed = snapshots.filter((s: any) => s.status === 'non_compliant').length;
  return (failed / snapshots.length) * 100;
}

/**
 * Automation Signal: failed/error runs in recent window
 */
async function calculateAutomationSignal(companyId: string): Promise<number> {
  const windowDate = new Date();
  windowDate.setDate(windowDate.getDate() - 7); // Last 7 days

  const { data: runs } = await (supabase as any)
    .from('grc_test_runs')
    .select('status, result')
    .eq('company_id', companyId)
    .gt('executed_at', windowDate.toISOString());

  if (!runs?.length) return 0;

  const failed = runs.filter((r: any) => r.status === 'failed' || r.result === 'fail').length;
  return (failed / runs.length) * 100;
}

/**
 * Vendor Signal: weighted average of vendor risk
 */
async function calculateVendorSignal(companyId: string): Promise<number> {
  const { data: profiles } = await (supabase as any)
    .from('vendor_risk_profiles')
    .select('risk_score')
    .eq('vendor_id', (supabase as any).from('vendors').select('id').eq('company_id', companyId));

  // If subquery fails, join manually
  if (!profiles?.length) {
    const { data: vendors } = await (supabase as any).from('vendors').select('id').eq('company_id', companyId);
    if (!vendors?.length) return 0;
    
    const { data: vps } = await (supabase as any)
      .from('vendor_risk_profiles')
      .select('risk_score')
      .in('vendor_id', vendors.map((v: any) => v.id));
    
    if (!vps?.length) return 0;
    const avg = vps.reduce((acc: number, p: any) => acc + p.risk_score, 0) / vps.length;
    return avg; // risk_score is already 0-100
  }

  const avg = profiles.reduce((acc: number, p: any) => acc + p.risk_score, 0) / profiles.length;
  return avg;
}

/**
 * Audit Signal: overdue open requests
 */
async function calculateAuditSignal(companyId: string): Promise<number> {
  const { data: reqs } = await (supabase as any)
    .from('audit_requests')
    .select('id, status, due_at')
    .eq('company_id', companyId)
    .in('status', ['open', 'in_progress']);

  if (!reqs?.length) return 0;

  const now = new Date();
  const overdue = reqs.filter((r: any) => r.due_at && new Date(r.due_at) < now).length;
  return (overdue / reqs.length) * 100;
}

// ─── Main Scoring Logic ─────────────────────────────────────────────────────

export async function recomputeCompanyRiskPosture(companyId: string): Promise<CompanyRiskPosture | null> {
  const jobId = await createJobRun({
    companyId,
    jobType: 'risk_posture_refresh',
    jobName: 'Risk Posture Recompute',
    source: 'system'
  });

  // console.log(`[Scoring] Recomputing posture for company: ${companyId}`);

  try {
    const [pol, con, aut, ven, aud] = await Promise.all([
    calculatePolicySignal(companyId),
    calculateControlSignal(companyId),
    calculateAutomationSignal(companyId),
    calculateVendorSignal(companyId),
    calculateAuditSignal(companyId),
  ]);

  const postureScore = (
    (pol * SIGNAL_WEIGHTS.policy) +
    (con * SIGNAL_WEIGHTS.control) +
    (aut * SIGNAL_WEIGHTS.automation) +
    (ven * SIGNAL_WEIGHTS.vendor) +
    (aud * SIGNAL_WEIGHTS.audit)
  );

  // Derive high-level stats from the risks table
  const { data: risks } = await (supabase as any)
    .from('risks')
    .select('risk_level, status')
    .eq('company_id', companyId);

  const openRisks = risks?.filter((r: { status: string; risk_level: string }) => r.status !== 'closed') ?? [];
  const highestLevel = openRisks.some((r: { status: string; risk_level: string }) => r.risk_level === 'critical') ? 'critical' :
                       openRisks.some((r: { status: string; risk_level: string }) => r.risk_level === 'high') ? 'high' :
                       openRisks.some((r: { status: string; risk_level: string }) => r.risk_level === 'medium') ? 'medium' : 'low';

  const countByLevel = (level: string) => openRisks.filter((r: { risk_level: string }) => r.risk_level === level).length;

  const upsertData: any = {
    company_id: companyId,
    posture_score: Math.round(postureScore * 100) / 100,
    policy_signal_score: Math.round(pol * 100) / 100,
    control_signal_score: Math.round(con * 100) / 100,
    automation_signal_score: Math.round(aut * 100) / 100,
    vendor_signal_score: Math.round(ven * 100) / 100,
    audit_signal_score: Math.round(aud * 100) / 100,
    highest_risk_level: highestLevel,
    open_risks_count: openRisks.length,
    critical_risks_count: countByLevel('critical'),
    high_risks_count: countByLevel('high'),
    medium_risks_count: countByLevel('medium'),
    low_risks_count: countByLevel('low'),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabase as any)
    .from('company_risk_posture')
    .upsert(upsertData)
    .select()
    .single();

  if (error) throw error;
  
  if (jobId) {
    await updateJobRunStatus(jobId, 'completed', { 
        companyId, 
        metadata: { score: data.posture_score } 
    });
  }

  return data;
  } catch (err: any) {
    if (jobId) await updateJobRunStatus(jobId, 'failed', { 
      errorMessage: err.message, 
      companyId: companyId 
    });
    throw err;
  }
}

export async function getCompanyRiskPosture(companyId: string): Promise<CompanyRiskPosture | null> {
  const { data, error } = await (supabase as any)
    .from('company_risk_posture')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (error) return null;
  return data;
}
