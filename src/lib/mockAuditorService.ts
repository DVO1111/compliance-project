import { supabase } from './supabase';
import { generateJSON } from './geminiClient';
import { logger } from './logger';

export type AuditType = 'HIPAA' | 'Joint Commission' | 'NAFDAC' | 'Internal';
export type FindingCategory = 'Documentation' | 'Training' | 'Technical' | 'Process';

export interface AuditSimulation {
  id: string;
  company_id: string;
  audit_type: AuditType;
  score: number;
  status: string;
  summary: string;
  created_at: string;
  completed_at: string | null;
}

export interface AuditFinding {
  id: string;
  simulation_id: string;
  category: FindingCategory;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  remediation_advice: string;
  is_resolved: boolean;
  detected_at: string;
}

export async function runAuditSimulation(companyId: string, type: AuditType): Promise<AuditSimulation | null> {
  // 1. Create initial simulation record
  const { data: sim, error: simErr } = await (supabase as any)
    .from('audit_simulations')
    .insert({ company_id: companyId, audit_type: type, score: 0, status: 'in_progress' })
    .select()
    .single();

  if (simErr) { logger.error('runAuditSimulation start error:', simErr); return null; }

  // 2. Gather cross-platform metrics (Simulated Aggregation)
  // In a real system, we'd query multiple tables here.
  const [trainingRes, contentRes, alertRes] = await Promise.all([
    (supabase as any).from('scenario_attempts').select('passed').eq('user_id', (await supabase.auth.getUser()).data.user?.id),
    (supabase as any).from('content_submissions').select('status'),
    (supabase as any).from('page_compliance_alerts').select('resolved').eq('resolved', false)
  ]);

  const trainingPassed = (trainingRes.data || []).filter((a: any) => a.passed).length;
  const trainingTotal = (trainingRes.data || []).length;
  const flaggedContent = (contentRes.data || []).filter((c: any) => c.status === 'flagged' || c.status === 'critical').length;
  const activeAlerts = (alertRes.data || []).length;

  // 3. AI Triage via Gemini
  const prompt = `
    Perform a Virtual Audit Simulation for a healthcare company.
    AUDIT TYPE: ${type}
    
    METRICS GATHERED:
    - Training Completion: ${trainingPassed}/${trainingTotal} passed
    - Flagged Content Submissions: ${flaggedContent}
    - Unresolved Compliance alerts: ${activeAlerts}

    TASK:
    1. Score the company from 0-100.
    2. Generate a 2-sentence executive summary.
    3. Identify 3-5 specific "Blind Spots" (Findings).
    4. For each finding, provide: Category, Severity, Title, Description, and Remediation Advice.

    RESPONSE FORMAT (JSON):
    {
      "score": number,
      "summary": "string",
      "findings": [
        {
          "category": "Documentation|Training|Technical|Process",
          "severity": "low|medium|high|critical",
          "title": "string",
          "description": "string",
          "remediation_advice": "string"
        }
      ]
    }
  `;

  try {
    const analysis = await generateJSON<{
      score: number;
      summary: string;
      findings: any[];
    }>(prompt);

    // 4. Save findings
    const findingsToInsert = analysis.findings.map(f => ({
      simulation_id: sim.id,
      company_id: companyId,
      ...f
    }));

    await (supabase as any).from('audit_findings').insert(findingsToInsert);

    // 5. Update simulation record
    const { data: updatedSim, error: updErr } = await (supabase as any)
      .from('audit_simulations')
      .update({
        score: analysis.score,
        summary: analysis.summary,
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', sim.id)
      .select()
      .single();

    if (updErr) { logger.error('runAuditSimulation finish error:', updErr); return null; }
    return updatedSim;

  } catch (err) {
    logger.error('runAuditSimulation AI error:', err);
    await (supabase as any).from('audit_simulations').update({ status: 'failed' }).eq('id', sim.id);
    return null;
  }
}

export async function getAuditSimulations(companyId: string): Promise<AuditSimulation[]> {
  const { data, error } = await (supabase as any)
    .from('audit_simulations')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('getAuditSimulations error:', error); return []; }
  return data || [];
}

export async function getAuditFindings(simId: string): Promise<AuditFinding[]> {
  const { data, error } = await (supabase as any)
    .from('audit_findings')
    .select('*')
    .eq('simulation_id', simId)
    .order('detected_at', { ascending: false });
  if (error) { logger.error('getAuditFindings error:', error); return []; }
  return data || [];
}
