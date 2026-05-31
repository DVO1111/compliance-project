import { supabase } from './supabase';
import { generateJSON } from './geminiClient';
import { logger } from './logger';

export type AuthorType = 'employee' | 'agency' | 'hcp' | 'patient' | 'influencer' | 'unknown';
export type FlagType = 'off_label' | 'undisclosed_sponsorship' | 'misleading_claim' | 'adverse_event' | 'compliant';
export type MentionStatus = 'new' | 'reviewing' | 'escalated' | 'resolved' | 'dismissed';
export type SentimentType = 'positive' | 'negative' | 'neutral';

export type SocialMention = {
  id: string; company_id: string; platform: string; author: string; author_type: AuthorType;
  content: string; url: string | null; flag_type: FlagType | null; severity: string;
  status: MentionStatus; detected_at: string; resolved_at: string | null;
  sentiment?: SentimentType;
  ai_analysis?: string;
  ai_recommendation?: string;
};

export type MonitoringRule = {
  id: string; company_id: string; platform: string; keywords: string[];
  product: string | null; rule_type: string; active: boolean; created_at: string;
};

export async function getMentions(companyId: string): Promise<SocialMention[]> {
  const { data, error } = await (supabase as any).from('social_mentions').select('*').eq('company_id', companyId).order('detected_at', { ascending: false }).limit(100);
  if (error) { logger.error('getMentions:', error); return []; }
  return data ?? [];
}

export async function addMention(companyId: string, m: { platform: string; author: string; author_type: AuthorType; content: string; url?: string; flag_type?: FlagType; severity?: string }): Promise<SocialMention | null> {
  const { data, error } = await (supabase as any).from('social_mentions').insert({ company_id: companyId, platform: m.platform, author: m.author, author_type: m.author_type, content: m.content, url: m.url || null, flag_type: m.flag_type || null, severity: m.severity || 'low', status: 'new' }).select().single();
  if (error) { logger.error('addMention:', error); return null; }
  
  // Trigger AI analysis in the background
  runSocialAIAnalysis(data.id);
  
  return data;
}

export async function updateMentionStatus(id: string, status: MentionStatus): Promise<boolean> {
  const updates: any = { status };
  if (status === 'resolved' || status === 'dismissed') updates.resolved_at = new Date().toISOString();
  const { error } = await (supabase as any).from('social_mentions').update(updates).eq('id', id);
  if (error) { logger.error('updateMentionStatus:', error); return false; }
  return true;
}

export async function getRules(companyId: string): Promise<MonitoringRule[]> {
  const { data, error } = await (supabase as any).from('social_monitoring_rules').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
  if (error) { logger.error('getRules:', error); return []; }
  return data ?? [];
}

export async function addRule(companyId: string, r: { platform: string; keywords: string[]; product?: string; rule_type: string }): Promise<MonitoringRule | null> {
  const { data, error } = await (supabase as any).from('social_monitoring_rules').insert({ company_id: companyId, platform: r.platform, keywords: r.keywords, product: r.product || null, rule_type: r.rule_type, active: true }).select().single();
  if (error) { logger.error('addRule:', error); return null; }
  return data;
}

export async function toggleRule(id: string, active: boolean): Promise<boolean> {
  const { error } = await (supabase as any).from('social_monitoring_rules').update({ active }).eq('id', id);
  if (error) { logger.error('toggleRule:', error); return false; }
  return true;
}

export async function runSocialAIAnalysis(mentionId: string): Promise<boolean> {
  const { data: m, error: getErr } = await (supabase as any).from('social_mentions').select('*').eq('id', mentionId).single();
  if (getErr || !m) return false;

  const prompt = `
    Analyze this social media mention for pharmaceutical compliance:
    
    CONTENT: "${m.content}"
    AUTHOR: ${m.author} (${m.author_type})
    PLATFORM: ${m.platform}

    TASK:
    1. Identify Compliance Flag (one of: off_label, undisclosed_sponsorship, misleading_claim, adverse_event, compliant).
    2. Assess Sentiment (positive, negative, neutral).
    3. Categorize Severity (low, medium, high, critical).
    4. Provide a 1-sentence AI Analysis of the risk.
    5. Provide a 1-sentence AI Action Recommendation.

    RESPONSE FORMAT (JSON):
    {
      "flag_type": "string",
      "sentiment": "string",
      "severity": "string",
      "ai_analysis": "string",
      "ai_recommendation": "string"
    }
  `;

  try {
    const analysis = await generateJSON<{
      flag_type: FlagType;
      sentiment: SentimentType;
      severity: string;
      ai_analysis: string;
      ai_recommendation: string;
    }>(prompt);

    const { error: updErr } = await (supabase as any)
      .from('social_mentions')
      .update({
        flag_type: analysis.flag_type,
        sentiment: analysis.sentiment,
        severity: analysis.severity,
        ai_analysis: analysis.ai_analysis,
        ai_recommendation: analysis.ai_recommendation
      })
      .eq('id', mentionId);

    return !updErr;
  } catch (err) {
    logger.error('runSocialAIAnalysis error:', err);
    return false;
  }
}

export const PLATFORMS = ['LinkedIn', 'X', 'Instagram', 'YouTube', 'TikTok', 'Reddit', 'Doximity', 'Figure 1', 'Patient Forums'];
export const FLAG_LABELS: Record<string, string> = { off_label: 'Off-Label Promotion', undisclosed_sponsorship: 'Undisclosed Sponsorship', misleading_claim: 'Misleading Claim', adverse_event: 'Adverse Event', compliant: 'Compliant' };
