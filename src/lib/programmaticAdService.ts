/**
 * Programmatic Ad Compliance Service — Supabase-backed
 */
import { supabase } from './supabase';
import { generateJSON } from './geminiClient';
import { logger } from './logger';

export type PlacementStatus = 'approved' | 'flagged' | 'pulled' | 'monitoring';

export type AdPlacement = {
  id: string;
  company_id: string;
  campaign_name: string;
  product: string;
  platform: string;
  placement_url: string | null;
  context: string | null;
  audience_segment: string | null;
  status: PlacementStatus;
  violation: string | null;
  impressions: number;
  detected_at: string;
};

export type TargetingGuardrail = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  guardrail_type: 'audience_exclusion' | 'context_exclusion' | 'frequency_cap' | 'geo_restriction';
  active: boolean;
  violations: number;
};

export type AdCampaignSummary = {
  campaignName: string;
  product: string;
  totalPlacements: number;
  compliantPlacements: number;
  flaggedPlacements: number;
  pulledPlacements: number;
  complianceRate: number;
};

/* ── Placements ──────────────────────────────────────── */

export async function getAdPlacements(companyId: string): Promise<AdPlacement[]> {
  const { data, error } = await (supabase as any)
    .from('ad_placements')
    .select('*')
    .eq('company_id', companyId)
    .order('detected_at', { ascending: false });

  if (error) { logger.error('getAdPlacements error:', error); return []; }
  return data ?? [];
}

export async function addAdPlacement(companyId: string, placement: {
  campaign_name: string;
  product: string;
  platform: string;
  placement_url?: string;
  context?: string;
  audience_segment?: string;
  status?: PlacementStatus;
  violation?: string;
  impressions?: number;
}): Promise<AdPlacement | null> {
  const { data, error } = await (supabase as any)
    .from('ad_placements')
    .insert({
      company_id: companyId,
      campaign_name: placement.campaign_name,
      product: placement.product,
      platform: placement.platform,
      placement_url: placement.placement_url || null,
      context: placement.context || null,
      audience_segment: placement.audience_segment || null,
      status: placement.status || 'monitoring',
      violation: placement.violation || null,
      impressions: placement.impressions || 0,
    })
    .select()
    .single();

  if (error) { logger.error('addAdPlacement error:', error); return null; }
  return data;
}

export async function updatePlacementStatus(placementId: string, status: PlacementStatus, violation?: string): Promise<boolean> {
  const updates: any = { status };
  if (violation) updates.violation = violation;

  const { error } = await (supabase as any)
    .from('ad_placements')
    .update(updates)
    .eq('id', placementId);

  if (error) { logger.error('updatePlacementStatus error:', error); return false; }
  return true;
}

/* ── Guardrails ──────────────────────────────────────── */

export async function getGuardrails(companyId: string): Promise<TargetingGuardrail[]> {
  const { data, error } = await (supabase as any)
    .from('targeting_guardrails')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) { logger.error('getGuardrails error:', error); return []; }
  return data ?? [];
}

export async function addGuardrail(companyId: string, guardrail: {
  name: string;
  description?: string;
  guardrail_type: 'audience_exclusion' | 'context_exclusion' | 'frequency_cap' | 'geo_restriction';
}): Promise<TargetingGuardrail | null> {
  const { data, error } = await (supabase as any)
    .from('targeting_guardrails')
    .insert({
      company_id: companyId,
      name: guardrail.name,
      description: guardrail.description || null,
      guardrail_type: guardrail.guardrail_type,
      active: true,
      violations: 0,
    })
    .select()
    .single();

  if (error) { logger.error('addGuardrail error:', error); return null; }
  return data;
}

export async function toggleGuardrail(guardrailId: string, active: boolean): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('targeting_guardrails')
    .update({ active })
    .eq('id', guardrailId);

  if (error) { logger.error('toggleGuardrail error:', error); return false; }
  return true;
}

/* ── Campaign Summaries (aggregated from placements) ── */

export async function getCampaignSummaries(companyId: string): Promise<AdCampaignSummary[]> {
  const placements = await getAdPlacements(companyId);

  const campaigns: Record<string, AdCampaignSummary> = {};
  for (const p of placements) {
    if (!campaigns[p.campaign_name]) {
      campaigns[p.campaign_name] = {
        campaignName: p.campaign_name,
        product: p.product,
        totalPlacements: 0,
        compliantPlacements: 0,
        flaggedPlacements: 0,
        pulledPlacements: 0,
        complianceRate: 0,
      };
    }
    const c = campaigns[p.campaign_name];
    c.totalPlacements++;
    if (p.status === 'approved') c.compliantPlacements++;
    else if (p.status === 'flagged') c.flaggedPlacements++;
    else if (p.status === 'pulled') c.pulledPlacements++;
    else c.compliantPlacements++; // monitoring counts as compliant
  }

  return Object.values(campaigns).map(c => ({
    ...c,
    complianceRate: c.totalPlacements > 0 ? Math.round((c.compliantPlacements / c.totalPlacements) * 1000) / 10 : 100,
  }));
}

/* ── AI Scrutiny Engine ──────────────────────────────── */

export async function runAdScrutiny(placementId: string): Promise<{ success: boolean; violation?: string }> {
  // 1. Get placement data
  const { data: placement, error: pErr } = await (supabase as any)
    .from('ad_placements')
    .select('*')
    .eq('id', placementId)
    .single();

  if (pErr || !placement) return { success: false };

  // 2. Get active guardrails for this company
  const guardrails = await getGuardrails(placement.company_id);
  const activeGuardrails = guardrails.filter(g => g.active);

  if (activeGuardrails.length === 0) return { success: true };

  // 3. Construct AI Prompt
  const prompt = `
    Analyze this programmatic ad placement for regulatory and contextual compliance.
    
    PRODUCT: ${placement.product}
    CAMPAIGN: ${placement.campaign_name}
    PLATFORM: ${placement.platform}
    PLACEMENT URL: ${placement.placement_url || 'Unknown'}
    CONTEXT: ${placement.context || 'Unknown'}
    AUDIENCE: ${placement.audience_segment || 'Unknown'}

    ACTIVE COMPLIANCE GUARDRAILS:
    ${activeGuardrails.map(g => `- [${g.guardrail_type}] ${g.name}: ${g.description}`).join('\n')}

    TASK: Determine if this placement violates any of the active guardrails. 
    Focus on "context_exclusion" (e.g., medical products appearing in inappropriate contexts) and "audience_exclusion".

    RESPONSE FORMAT (JSON):
    {
      "is_violation": boolean,
      "violated_guardrail_id": "string | null",
      "reason": "string | null (concise explanation if violation found)",
      "confidence": number (0-100)
    }
  `;

  try {
    const result = await generateJSON<{
      is_violation: boolean;
      violated_guardrail_id: string | null;
      reason: string | null;
    }>(prompt);

    if (result.is_violation) {
      // Update placement status
      await updatePlacementStatus(placementId, 'flagged', result.reason || 'AI Scrutiny detected a contextual violation.');
      
      // Increment guardrail violations if we can match the ID (or name)
      if (result.violated_guardrail_id) {
        // Find by name if AI returned name instead of ID
        const match = activeGuardrails.find(g => g.id === result.violated_guardrail_id || g.name === result.violated_guardrail_id);
        if (match) await incrementGuardrailViolations(match.id);
      }
      
      return { success: true, violation: result.reason || 'Violation detected' };
    } else {
      await updatePlacementStatus(placementId, 'approved');
      return { success: true };
    }
  } catch (err) {
    logger.error('runAdScrutiny AI Error:', err);
    return { success: false };
  }
}

async function incrementGuardrailViolations(guardrailId: string): Promise<void> {
  const { data } = await (supabase as any)
    .from('targeting_guardrails')
    .select('violations')
    .eq('id', guardrailId)
    .single();
  
  if (data) {
    await (supabase as any)
      .from('targeting_guardrails')
      .update({ violations: (data.violations || 0) + 1 })
      .eq('id', guardrailId);
  }
}
