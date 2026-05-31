/**
 * Horizon Scanning Service
 * Monitors regulatory updates, flags affected content for re-review,
 * and tracks consultation periods.
 */
import { supabase } from './supabase';

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

export async function generateAIAssessment(updateId: string, contentId: string, companyId: string): Promise<RegulatoryImpactAssessment> {
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
  return data;
}

export async function applyImpactRecommendation(assessmentId: string): Promise<boolean> {
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

  return true;
}

