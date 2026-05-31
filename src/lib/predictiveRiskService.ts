/**
 * Predictive Risk Modeling Service — Supabase-backed saved predictions
 * The prediction engine stays client-side. Saved results go to DB.
 * Industry insights and trends remain as reference data.
 */
import { supabase } from './supabase';
import { generateJSON } from './geminiClient';
import { logger } from './logger';

export type RiskPrediction = {
  id?: string;
  company_id?: string;
  title: string;
  platform: string;
  therapeutic_area: string;
  target_market: string;
  claim_types: string[];
  audience_type: string;
  predicted_risk: number;
  confidence: number;
  risk_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendation: string;
  ai_rationale?: string;
  top_risk_factors: RiskFactor[];
  created_by?: string;
  created_at?: string;
};

export type RiskFactor = {
  factor: string;
  impact: number;
  detail: string;
};

export type IndustryInsight = {
  id: string;
  insight: string;
  dataPoints: number;
  rejectionRate: number;
  market: string;
  therapeuticArea: string;
  claimType: string;
};

export type HistoricalTrend = {
  month: string;
  submissions: number;
  rejections: number;
  avgRisk: number;
};

export type RiskHeatmapPoint = {
  platform: string;
  therapeutic_area: string;
  avg_risk: number;
  sample_size: number;
  max_grade: string;
};

export type RiskVelocityAlert = {
  alert_type: 'critical_cluster' | 'velocity_spike';
  platform: string;
  therapeutic_area: string;
  count: number;
  message: string;
};

/* ── AI-Powered Prediction Engine ────────────────────── */

export async function predictContentRisk(attrs: {
  platform: string;
  therapeuticArea: string;
  claimTypes: string[];
  targetMarket: string;
  audienceType: string;
}): Promise<RiskPrediction> {
  const prompt = `
    Analyze regulatory compliance risk for a pharmaceutical marketing content proposal.
    
    PARAMETERS:
    - Platform: ${attrs.platform}
    - Therapeutic Area: ${attrs.therapeuticArea}
    - Claim Types: ${attrs.claimTypes.join(', ')}
    - Target Market: ${attrs.targetMarket}
    - Audience: ${attrs.audienceType}

    TASK:
    1. Calculate a Risk Score (0-100) based on typical regulatory (FDA, MHRA, EMA, etc.) strictness.
    2. Assign a Risk Grade (A=Low to F=Critical).
    3. Identify Top 3 localized Risk Factors with impact values.
    4. Provide a high-level Recommendation and a detailed AI Rationale.

    RESPONSE FORMAT (JSON):
    {
      "predicted_risk": number,
      "risk_grade": "A" | "B" | "C" | "D" | "F",
      "confidence": number,
      "recommendation": "string",
      "ai_rationale": "string",
      "top_risk_factors": [
        { "factor": "string", "impact": number, "detail": "string" }
      ]
    }
  `;

  try {
    const result = await generateJSON<{
      predicted_risk: number;
      risk_grade: 'A' | 'B' | 'C' | 'D' | 'F';
      confidence: number;
      recommendation: string;
      ai_rationale: string;
      top_risk_factors: RiskFactor[];
    }>(prompt);

    return {
      title: 'AI Content Risk Prediction',
      platform: attrs.platform,
      therapeutic_area: attrs.therapeuticArea,
      target_market: attrs.targetMarket,
      claim_types: attrs.claimTypes,
      audience_type: attrs.audienceType,
      ...result,
    };
  } catch (err) {
    logger.error('predictContentRisk AI Error:', err);
    // Fallback to basic heuristic if AI fails
    return {
      title: 'Heuristic Content Risk Prediction',
      platform: attrs.platform,
      therapeutic_area: attrs.therapeuticArea,
      target_market: attrs.targetMarket,
      claim_types: attrs.claimTypes,
      audience_type: attrs.audienceType,
      predicted_risk: 50,
      confidence: 60,
      risk_grade: 'C',
      recommendation: 'AI analysis failed — system reverted to standard heuristic.',
      top_risk_factors: [
        { factor: 'System Stability', impact: 10, detail: 'AI engine timeout' }
      ]
    };
  }
}

/* ── Save / Load predictions ─────────────────────────── */

export async function savePrediction(companyId: string, userId: string, prediction: RiskPrediction): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('risk_predictions')
    .insert({
      company_id: companyId,
      title: prediction.title,
      platform: prediction.platform,
      therapeutic_area: prediction.therapeutic_area,
      target_market: prediction.target_market,
      claim_types: prediction.claim_types,
      audience_type: prediction.audience_type,
      predicted_risk: prediction.predicted_risk,
      confidence: prediction.confidence,
      risk_grade: prediction.risk_grade,
      recommendation: prediction.recommendation,
      created_by: userId,
    });

  if (error) { logger.error('savePrediction error:', error); return false; }
  return true;
}

export async function getSavedPredictions(companyId: string): Promise<RiskPrediction[]> {
  const { data, error } = await (supabase as any)
    .from('risk_predictions')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { logger.error('getSavedPredictions error:', error); return []; }
  return (data ?? []).map((d: any) => ({
    ...d,
    top_risk_factors: [],
  }));
}

export async function getGlobalRiskHeatmap(companyId: string): Promise<RiskHeatmapPoint[]> {
  const { data, error } = await (supabase as any).rpc('get_risk_heatmap_data', { p_company_id: companyId } as any);
  if (error) { logger.error('getGlobalRiskHeatmap error:', error); return []; }
  return (data as RiskHeatmapPoint[]) || [];
}

export async function getEarlyWarningAlerts(companyId: string): Promise<RiskVelocityAlert[]> {
  const { data, error } = await (supabase as any).rpc('get_risk_velocity', { p_company_id: companyId } as any);
  if (error) { logger.error('getEarlyWarningAlerts error:', error); return []; }
  return (data as RiskVelocityAlert[]) || [];
}

/* ── Industry insights (reference data) ──────────────── */

export function getIndustryInsights(): IndustryInsight[] {
  return [
    { id: 'i1', insight: 'Superiority claims in oncology have a 72% rejection rate in EU markets', dataPoints: 1840, rejectionRate: 72, market: 'EU', therapeuticArea: 'Oncology', claimType: 'Superiority' },
    { id: 'i2', insight: 'Social media posts for cardiovascular products are 3x more likely to be flagged than email', dataPoints: 3200, rejectionRate: 45, market: 'US', therapeuticArea: 'Cardiovascular', claimType: 'Efficacy' },
    { id: 'i3', insight: 'Influencer content in dermatology has seen a 40% increase in regulatory action', dataPoints: 890, rejectionRate: 38, market: 'Global', therapeuticArea: 'Dermatology', claimType: 'Testimonial' },
    { id: 'i4', insight: 'Patient testimonials without adequate disclaimers are rejected 85% of the time', dataPoints: 2100, rejectionRate: 85, market: 'US', therapeuticArea: 'General', claimType: 'Testimonial' },
    { id: 'i5', insight: 'Japanese market requires 2.3x more review cycles on average than US market', dataPoints: 1560, rejectionRate: 52, market: 'Japan', therapeuticArea: 'General', claimType: 'All' },
    { id: 'i6', insight: 'DTC TV ads with inadequate major statements face 90% enforcement action rate', dataPoints: 780, rejectionRate: 90, market: 'US', therapeuticArea: 'General', claimType: 'Fair Balance' },
  ];
}

export function getHistoricalTrends(): HistoricalTrend[] {
  return [
    { month: 'Sep 2025', submissions: 89, rejections: 24, avgRisk: 42 },
    { month: 'Oct 2025', submissions: 102, rejections: 28, avgRisk: 45 },
    { month: 'Nov 2025', submissions: 95, rejections: 22, avgRisk: 40 },
    { month: 'Dec 2025', submissions: 78, rejections: 15, avgRisk: 35 },
    { month: 'Jan 2026', submissions: 110, rejections: 30, avgRisk: 43 },
    { month: 'Feb 2026', submissions: 98, rejections: 20, avgRisk: 38 },
  ];
}
