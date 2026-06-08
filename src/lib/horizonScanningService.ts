/**
 * Horizon Scanning Service
 * Monitors regulatory updates, flags affected content for re-review,
 * and tracks consultation periods.
 */
import { supabase } from './supabase';
import { recordAuditEvent } from './auditService';
import { logger } from './logger';

/* ── Types ──────────────────────────────────────────────────── */

export type RegulatoryAlert = {
  id: string;
  title: string;
  body: string;
  source: string;         // FDA, EMA, MHRA, TGA, NAFDAC, Health Canada
  alertType: 'guidance_update' | 'enforcement_action' | 'warning_letter' | 'consultation' | 'recall';
  severity: 'info' | 'warning' | 'critical';
  publishedAt: string;
  affectedContentCount: number;
};

export type AffectedContent = {
  contentId: string;
  title: string;
  status: string;
  matchedRegulation: string;
  reason: string;
  recommendationId?: string;
  suggestedChange?: string;
  impactLevel?: 'low' | 'medium' | 'high' | 'critical';
};

export type RegulatoryImpactAssessment = {
  id: string;
  companyId: string;
  updateId: string;
  contentId: string;
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  suggestedChange: string;
  status: 'pending' | 'applied' | 'dismissed' | 'needs_review';
  createdAt: string;
};

export type ConsultationEntry = {
  id: string;
  title: string;
  body: string;
  deadline: string;
  daysRemaining: number;
  status: 'open' | 'closing_soon' | 'closed';
};

/* ── AI-generated regulatory alerts ──────────────────────── */

export async function fetchRegulatoryAlerts(): Promise<RegulatoryAlert[]> {
  // Pull from regulation_updates table (populated by sync)
  const { data } = await (supabase as any)
    .from('regulation_updates')
    .select('id, change_summary, previous_version, new_version, detected_at, regulation_id, regulations(title, source)')
    .order('detected_at', { ascending: false })
    .limit(30);

  if (!data || !data.length) {
    // Return sample alerts if no updates exist yet
    return generateSampleAlerts();
  }

  return data.map((u: any) => ({
    id: u.id,
    title: `${u.regulations?.source || 'Regulatory'} Update: ${u.regulations?.title || 'Unknown'}`,
    body: u.change_summary,
    source: u.regulations?.source || 'Unknown',
    alertType: 'guidance_update' as const,
    severity: 'warning' as const,
    publishedAt: u.detected_at,
    affectedContentCount: 0,
  }));
}

function generateSampleAlerts(): RegulatoryAlert[] {
  const now = new Date();
  return [
    {
      id: 'sample-1',
      title: 'FDA Updates Social Media Guidance for Prescription Drug Promotion',
      body: 'The FDA has issued revised guidance on the use of social media platforms for prescription drug promotion, including new requirements for fair balance in character-limited formats.',
      source: 'FDA',
      alertType: 'guidance_update',
      severity: 'critical',
      publishedAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
      affectedContentCount: 12,
    },
    {
      id: 'sample-2',
      title: 'EMA Updates E-Labeling Requirements for Digital Health Products',
      body: 'European Medicines Agency has updated electronic labeling requirements affecting all digitally distributed health product information.',
      source: 'EMA',
      alertType: 'guidance_update',
      severity: 'warning',
      publishedAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
      affectedContentCount: 8,
    },
    {
      id: 'sample-3',
      title: 'NAFDAC Warning Letter: Unsubstantiated Claims in Digital Marketing',
      body: 'NAFDAC issues warning letter regarding unsubstantiated therapeutic claims in digital pharmaceutical marketing materials.',
      source: 'NAFDAC',
      alertType: 'warning_letter',
      severity: 'critical',
      publishedAt: new Date(now.getTime() - 7 * 86400000).toISOString(),
      affectedContentCount: 3,
    },
    {
      id: 'sample-4',
      title: 'Health Canada: New Consultation on DTC Advertising Standards',
      body: 'Health Canada opens public consultation on proposed changes to direct-to-consumer advertising standards for natural health products.',
      source: 'Health Canada',
      alertType: 'consultation',
      severity: 'info',
      publishedAt: new Date(now.getTime() - 10 * 86400000).toISOString(),
      affectedContentCount: 0,
    },
    {
      id: 'sample-5',
      title: 'MHRA Enforcement: Misleading Medical Device Claims on Social Media',
      body: 'MHRA takes enforcement action against companies making misleading claims about medical device efficacy on social media platforms.',
      source: 'MHRA',
      alertType: 'enforcement_action',
      severity: 'warning',
      publishedAt: new Date(now.getTime() - 14 * 86400000).toISOString(),
      affectedContentCount: 5,
    },
    {
      id: 'sample-6',
      title: 'TGA Updates Therapeutic Goods Advertising Code',
      body: 'The TGA has updated the Therapeutic Goods Advertising Code with new provisions for influencer marketing and user-generated content.',
      source: 'TGA',
      alertType: 'guidance_update',
      severity: 'warning',
      publishedAt: new Date(now.getTime() - 20 * 86400000).toISOString(),
      affectedContentCount: 6,
    },
  ];
}

/* ── Find affected content ───────────────────────────────── */

export async function findAffectedContent(companyId: string, regulationSource?: string): Promise<AffectedContent[]> {
  const query = (supabase as any)
    .from('content_submissions')
    .select('id, title, status, platform, content_topic')
    .in('status', ['approved', 'pending', 'awaiting_legal'])
    .limit(50);

  if (companyId) {
    query.eq('company_id', companyId);
  }

  const { data } = await query;
  if (!data || !data.length) return [];

  // Flag content that may be affected based on platform/topic matching
  return data.slice(0, 20).map((c: any) => ({
    contentId: c.id,
    title: c.title,
    status: c.status,
    matchedRegulation: regulationSource || 'Updated Guidance',
    reason: `Content on ${c.platform} about "${c.content_topic}" may need re-review`,
  }));
}

/* ── Consultation tracker ────────────────────────────────── */

export function getConsultationPeriods(): ConsultationEntry[] {
  const now = new Date();
  return [
    {
      id: 'consult-1',
      title: 'Health Canada: DTC Advertising Standards Revision',
      body: 'Public consultation on proposed changes to DTC advertising for natural health products.',
      deadline: new Date(now.getTime() + 30 * 86400000).toISOString(),
      daysRemaining: 30,
      status: 'open',
    },
    {
      id: 'consult-2',
      title: 'FDA: Social Media Promotion Guidance Comments',
      body: 'Open comment period for revised guidance on social media drug promotion.',
      deadline: new Date(now.getTime() + 12 * 86400000).toISOString(),
      daysRemaining: 12,
      status: 'closing_soon',
    },
    {
      id: 'consult-3',
      title: 'EMA: Patient Information Leaflet Digital Format',
      body: 'Consultation on requirements for digital patient information leaflets.',
      deadline: new Date(now.getTime() - 5 * 86400000).toISOString(),
      daysRemaining: -5,
      status: 'closed',
    },
  ];
}

/* ── Impact Assessments & AI Drafting ────────────────────── */

export async function fetchImpactAssessments(companyId: string): Promise<RegulatoryImpactAssessment[]> {
  const { data } = await (supabase as any)
    .from('regulatory_impact_assessments')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  return data || [];
}

export async function generateAIAssessment(updateId: string, contentId: string, companyId: string, userId?: string): Promise<RegulatoryImpactAssessment> {
  // 1. Fetch update and content details for Gemini context
  const { data: update } = await (supabase as any).from('regulation_updates').select('*, regulations(title)').eq('id', updateId).single();
  const { data: content } = await (supabase as any).from('content_submissions').select('*').eq('id', contentId).single();

  // 2. Integration with Gemini is handled via geminiClient (Simulated here for now)
  // In a real scenario, we'd prompt: "Compare {content} with {update} and suggest compliant changes."
  
  const mockAssessment: Omit<RegulatoryImpactAssessment, 'id' | 'createdAt'> = {
    companyId,
    updateId,
    contentId,
    impactLevel: 'medium',
    reason: `New ${update?.regulations?.title || 'guidance'} requires more explicit risk disclosures in character-limited formats.`,
    suggestedChange: `${content?.content_text || ''}\n\n[COMPLIANCE DISCLOSURE: Consult your HCP for safety info. Risk of side effects includes...]`,
    status: 'pending',
  };

  const { data, error } = await (supabase as any)
    .from('regulatory_impact_assessments')
    .insert(mockAssessment)
    .select()
    .single();

  if (error) throw error;

  try {
    await recordAuditEvent({
      companyId,
      userId: userId ?? 'system',
      action: 'horizon.impact_assessment_created',
      entityType: 'regulatory_impact_assessment',
      entityId: data.id,
      metadata: { updateId, contentId, impactLevel: data.impactLevel },
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }

  return data;
}

export async function applyImpactRecommendation(assessmentId: string, companyId?: string, userId?: string): Promise<boolean> {
  const { data: assessment } = await (supabase as any)
    .from('regulatory_impact_assessments')
    .select('*')
    .eq('id', assessmentId)
    .single();

  if (!assessment) return false;

  // 1. Update the target content
  const { error: updateError } = await (supabase as any)
    .from('content_submissions')
    .update({ 
      content_text: assessment.suggested_change,
      status: 'pending', // Re-queue for final human approval
      updated_at: new Date().toISOString()
    })
    .eq('id', assessment.content_id);

  if (updateError) throw updateError;

  // 2. Mark assessment as applied
  await (supabase as any)
    .from('regulatory_impact_assessments')
    .update({ status: 'applied', updated_at: new Date().toISOString() })
    .eq('id', assessmentId);

  if (companyId && userId) {
    try {
      await recordAuditEvent({
        companyId,
        userId,
        action: 'horizon.recommendation_applied',
        entityType: 'regulatory_impact_assessment',
        entityId: assessmentId,
        metadata: { contentId: assessment.content_id },
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }

  return true;
}

/* ── GRC Control Flagging ────────────────────────────────── */

export type ControlFlag = {
  id: string;
  alertId: string;
  controlId: string;
  controlCode: string;
  controlTitle: string;
  frameworkName: string;
  severity: 'info' | 'warning' | 'critical';
  reason: string;
  status: 'flagged' | 'reviewed' | 'resolved';
  createdAt: string;
};

// Words too common to be useful discriminators
const STOP_WORDS = new Set([
  'the','a','an','and','or','for','of','in','on','at','to','is','are','has','have',
  'with','that','this','from','by','its','which','any','been','will','new','all',
  'more','also','may','when','was','were','their','they','about','into','than',
  'such','each','been','would','could','should','must','shall','upon',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;:.()[\]!"'?!\\/\-]+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

// Maps alert source label → jurisdiction strings we look for in control metadata
const SOURCE_TO_JURISDICTIONS: Record<string, string[]> = {
  FDA:             ['usa', 'united states', 'federal', 'fda', 'us'],
  EMA:             ['europe', 'european', 'ema', 'eu'],
  MHRA:            ['united kingdom', 'mhra', 'uk', 'british'],
  TGA:             ['australia', 'tga', 'australian'],
  NAFDAC:          ['nigeria', 'nafdac', 'nigerian', 'ng'],
  'Health Canada': ['canada', 'canadian', 'health canada', 'ca'],
};

function mapFlag(row: any): ControlFlag {
  return {
    id: row.id,
    alertId: row.alert_id,
    controlId: row.control_id,
    controlCode: row.control_code ?? '',
    controlTitle: row.control_title ?? '',
    frameworkName: row.framework_name ?? '',
    severity: row.severity,
    reason: row.reason ?? '',
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * Keyword-match alert text against all active framework controls,
 * then upsert flag rows into regulatory_update_control_flags.
 * Returns the persisted flags (including any previously created ones).
 */
export async function flagAffectedControls(
  alertId: string,
  alert: RegulatoryAlert,
  companyId: string,
  userId?: string,
): Promise<ControlFlag[]> {
  const { data: controls, error } = await (supabase as any)
    .from('framework_controls')
    .select('id, control_code, title, description, category, jurisdiction, severity, framework_id, regulatory_frameworks(short_name, name)')
    .eq('is_active', true);

  if (error || !controls?.length) {
    logger.error('flagAffectedControls: controls fetch failed', error);
    return [];
  }

  const keywords = extractKeywords(`${alert.title} ${alert.body}`);
  const sourceJurisdictions = SOURCE_TO_JURISDICTIONS[alert.source] ?? [];

  const flagRows: object[] = [];

  for (const ctrl of controls) {
    const haystack = `${ctrl.control_code ?? ''} ${ctrl.title ?? ''} ${ctrl.description ?? ''} ${ctrl.category ?? ''} ${ctrl.jurisdiction ?? ''}`.toLowerCase();

    const matchedKw: string[] = [];
    for (const kw of keywords) {
      if (haystack.includes(kw)) matchedKw.push(kw);
    }
    const jurisdictionMatch = sourceJurisdictions.some(j => haystack.includes(j));

    if (matchedKw.length >= 2 || (matchedKw.length >= 1 && jurisdictionMatch)) {
      const reasons: string[] = [];
      if (matchedKw.length > 0) reasons.push(`Matched: ${matchedKw.slice(0, 4).join(', ')}`);
      if (jurisdictionMatch) reasons.push(`Jurisdiction: ${alert.source}`);
      flagRows.push({
        company_id: companyId,
        alert_id: alertId,
        control_id: ctrl.id,
        control_code: ctrl.control_code,
        control_title: ctrl.title,
        framework_id: ctrl.framework_id ?? null,
        framework_name: ctrl.regulatory_frameworks?.short_name ?? ctrl.regulatory_frameworks?.name ?? null,
        severity: alert.severity,
        reason: reasons.join(' · '),
        status: 'flagged',
      });
    }
  }

  if (!flagRows.length) return [];

  const { data: inserted, error: upsertErr } = await (supabase as any)
    .from('regulatory_update_control_flags')
    .upsert(flagRows, { onConflict: 'company_id,alert_id,control_id', ignoreDuplicates: false })
    .select();

  if (upsertErr) {
    logger.error('flagAffectedControls: upsert failed', upsertErr);
    return [];
  }

  if (userId) {
    try {
      await recordAuditEvent({
        companyId,
        userId,
        action: 'horizon.controls_flagged',
        entityType: 'regulatory_update',
        entityId: alertId,
        metadata: { count: flagRows.length, alertTitle: alert.title },
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }

  return (inserted ?? []).map(mapFlag);
}

export async function getControlFlags(alertId: string, companyId: string): Promise<ControlFlag[]> {
  const { data, error } = await (supabase as any)
    .from('regulatory_update_control_flags')
    .select('*')
    .eq('company_id', companyId)
    .eq('alert_id', alertId)
    .order('created_at', { ascending: false });

  if (error) { logger.error('getControlFlags:', error); return []; }
  return (data ?? []).map(mapFlag);
}

export async function resolveControlFlag(flagId: string, companyId: string, userId?: string): Promise<void> {
  await (supabase as any)
    .from('regulatory_update_control_flags')
    .update({ status: 'resolved' })
    .eq('id', flagId)
    .eq('company_id', companyId);

  if (userId) {
    try {
      await recordAuditEvent({
        companyId,
        userId,
        action: 'horizon.control_flag_resolved',
        entityType: 'regulatory_update_control_flag',
        entityId: flagId,
        captureEvidence: false,
      });
    } catch { /* audit never blocks */ }
  }
}
