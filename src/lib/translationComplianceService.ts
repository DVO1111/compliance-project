/**
 * Translation Compliance Service — Supabase-backed
 */
import { supabase } from './supabase';
import { logger } from './logger';

export type TranslationStatus = 'pending' | 'in_translation' | 'translated' | 're_review' | 'approved' | 'flagged';

export type TranslationJob = {
  id: string;
  company_id: string;
  content_title: string;
  source_language: string;
  target_language: string;
  target_market: string;
  status: TranslationStatus;
  translator: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  compliance_flags?: ComplianceFlag[];
};

export type ComplianceFlag = {
  id: string;
  job_id: string;
  original_claim: string;
  translated_claim: string;
  issue: string;
  severity: 'info' | 'warning' | 'critical';
  rule: string | null;
  market: string | null;
};

export type MarketRule = {
  market: string;
  language: string;
  flag: string;
  restrictions: string[];
};

/* ── Market rules (reference data — stays hardcoded) ───── */

const MARKET_RULES: MarketRule[] = [
  { market: 'United States', language: 'en-US', flag: '🇺🇸', restrictions: ['DTC advertising allowed with fair balance', 'Must include major statement for broadcast', 'FDA-approved indications only'] },
  { market: 'United Kingdom', language: 'en-GB', flag: '🇬🇧', restrictions: ['No DTC Rx advertising', 'ABPI Code compliance required', 'All materials must be certified before use'] },
  { market: 'Germany', language: 'de-DE', flag: '🇩🇪', restrictions: ['HWG (Heilmittelwerbegesetz) compliance', 'No celebrity endorsements for Rx', 'Mandatory reference to package leaflet'] },
  { market: 'France', language: 'fr-FR', flag: '🇫🇷', restrictions: ['ANSM pre-approval for Rx ads', 'No comparative claims without authorization', 'Mandatory "medicament" disclaimer'] },
  { market: 'Japan', language: 'ja-JP', flag: '🇯🇵', restrictions: ['JPMA Fair Competition Code', 'No direct comparison with competitors', 'Strict image usage guidelines'] },
  { market: 'Brazil', language: 'pt-BR', flag: '🇧🇷', restrictions: ['ANVISA pre-clearance required', 'Mandatory safety warning format', 'No inducement to self-diagnosis'] },
  { market: 'Nigeria', language: 'en-NG', flag: '🇳🇬', restrictions: ['NAFDAC pre-certification mandatory', 'No cure claims for chronic diseases', 'Local language disclaimers required'] },
  { market: 'Saudi Arabia', language: 'ar-SA', flag: '🇸🇦', restrictions: ['SFDA approval mandatory', 'Cultural sensitivity review required', 'Arabic primary language enforcement'] },
];

export function getMarketRules(): MarketRule[] {
  return MARKET_RULES;
}

/* ── CRUD ─────────────────────────────────────────────── */

export async function getTranslationJobs(companyId: string): Promise<TranslationJob[]> {
  const { data, error } = await (supabase as any)
    .from('translation_jobs')
    .select('*, compliance_flags:translation_compliance_flags(*)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) { logger.error('getTranslationJobs error:', error); return []; }
  return data ?? [];
}

export async function createTranslationJob(companyId: string, userId: string, job: {
  content_title: string;
  source_language: string;
  target_language: string;
  target_market: string;
  translator?: string;
}): Promise<TranslationJob | null> {
  const { data, error } = await (supabase as any)
    .from('translation_jobs')
    .insert({
      company_id: companyId,
      content_title: job.content_title,
      source_language: job.source_language,
      target_language: job.target_language,
      target_market: job.target_market,
      translator: job.translator || null,
      created_by: userId,
      status: 'pending',
    })
    .select()
    .single();

  if (error) { logger.error('createTranslationJob error:', error); return null; }
  return data;
}

export async function updateJobStatus(jobId: string, status: TranslationStatus): Promise<boolean> {
  const updates: any = { status };
  if (status === 'approved') updates.completed_at = new Date().toISOString();

  const { error } = await (supabase as any)
    .from('translation_jobs')
    .update(updates)
    .eq('id', jobId);

  if (error) { logger.error('updateJobStatus error:', error); return false; }
  return true;
}

export async function addComplianceFlag(jobId: string, flag: {
  original_claim: string;
  translated_claim: string;
  issue: string;
  severity: 'info' | 'warning' | 'critical';
  rule?: string;
  market?: string;
}): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('translation_compliance_flags')
    .insert({
      job_id: jobId,
      original_claim: flag.original_claim,
      translated_claim: flag.translated_claim,
      issue: flag.issue,
      severity: flag.severity,
      rule: flag.rule || null,
      market: flag.market || null,
    });

  if (error) { logger.error('addComplianceFlag error:', error); return false; }

  // auto-flag the job
  await (supabase as any)
    .from('translation_jobs')
    .update({ status: 'flagged' })
    .eq('id', jobId);

  return true;
}
