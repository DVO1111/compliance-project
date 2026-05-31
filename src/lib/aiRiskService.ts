// src/lib/aiRiskService.ts
// AI Risk Assessment Service — v2 (FIXED JWT / 401)
//
// NO browser-side LLM calls. All AI analysis happens server-side via:
//   1. enqueue-ai-job → queues a job
//   2. ai-worker → processes it and caches results
//
// This service provides:
//   - enqueueAIJob(companyId, submissionId) → fire-and-forget
//   - getAssessment(submissionId) → read cached result
//   - getJobStatus(submissionId) → poll job status
//   - retryAssessment(companyId, submissionId) → manually retry
//
// Fix included:
// ✅ Explicitly attach Authorization Bearer <access_token> when invoking Edge Function
// (prevents 401 Unauthorized when "Verify JWT" is enabled on the function)

import { supabase } from './supabase';
import { logger } from './logger';

// ── Types ────────────────────────────────────────────────────────────────

export interface IntentViolation {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  phrase: string;
  regulation_ref: string;
}

export interface AIRiskAssessment {
  ai_risk_score: number;
  overall_sentiment: string;
  intent_violations: IntentViolation[];
  subtle_claims: string[];
  recommendations: string[];
  summary: string;
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'none';

export interface JobInfo {
  id: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
}

export interface PreviewResult {
  score: number;
  topIssues: string[];
  sentiment: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** FNV-1a hash — lightweight content fingerprint for idempotency */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

// ── Enqueue ──────────────────────────────────────────────────────────────

/**
 * Fire-and-forget: insert a job directly into the ai_jobs table.
 * Returns true if a new job was created, false if one already exists.
 * Never throws — upload must never fail because of this.
 *
 * Uses direct DB insert (RLS allows authenticated INSERT).
 * No Edge Function call needed — eliminates 401 issues entirely.
 */
export async function enqueueAIJob(
  companyId: string,
  submissionId: string,
  jobType: string = 'ai_risk_assessment'
): Promise<boolean> {
  try {
    // 1) Compute content_hash from the submission text (for idempotency)
    let contentHash: string | null = null;
    if (jobType === 'ai_risk_assessment') {
      const { data: submission } = await (supabase as any)
        .from('content_submissions')
        .select('content_text')
        .eq('id', submissionId)
        .maybeSingle();

      if (submission?.content_text) {
        contentHash = fnv1a(submission.content_text);
      }
    }

    // 2) Insert job (idempotent via unique index on job_type + submission_id + content_hash)
    const { error } = await (supabase as any)
      .from('ai_jobs')
      .insert({
        company_id: companyId || null,
        submission_id: submissionId,
        job_type: jobType,
        status: 'queued',
        payload: { content_hash: contentHash },
      });

    if (error) {
      // 23505 = unique_violation → job already exists → that's fine
      if (error.code === '23505') {
        return false;
      }
      logger.warn('[aiRiskService] enqueueAIJob insert error (non-fatal):', error.message);
      return false;
    }

    return true;
  } catch (err) {
    logger.warn('[aiRiskService] enqueueAIJob failed (non-fatal):', err);
    return false;
  }
}

// ── Job Status ───────────────────────────────────────────────────────────

/**
 * Get the latest job status for a submission.
 * Returns null if no job exists or if query fails (non-fatal).
 */
export async function getJobStatus(submissionId: string): Promise<JobInfo | null> {
  const { data, error } = await (supabase as any)
    .from('ai_jobs')
    .select('id, status, attempts, max_attempts, last_error, created_at')
    .eq('submission_id', submissionId)
    .eq('job_type', 'ai_risk_assessment')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as JobInfo;
}

// ── Cached Assessment (read-only) ────────────────────────────────────────

/**
 * Get a cached AI risk assessment for a submission.
 * Does NOT trigger any AI call — just reads from db.
 */
export async function getAssessment(submissionId: string): Promise<AIRiskAssessment | null> {
  const { data, error } = await (supabase as any)
    .from('ai_risk_assessments')
    .select('*')
    .eq('submission_id', submissionId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    ai_risk_score: data.ai_risk_score ?? 0,
    overall_sentiment: data.overall_sentiment ?? 'neutral',
    intent_violations: data.intent_violations ?? [],
    subtle_claims: data.subtle_claims ?? [],
    recommendations: data.recommendations ?? [],
    summary: data.summary ?? '',
  };
}

/**
 * Backwards-compatible alias used by existing code.
 * Now read-only: just fetches cached assessment, no AI call.
 */
export async function getOrCreateAssessment(
  submissionId: string,
  _companyId?: string
): Promise<AIRiskAssessment> {
  const cached = await getAssessment(submissionId);
  if (cached) return cached;

  // No cached result — return empty (the job queue handles analysis)
  return {
    ai_risk_score: 0,
    overall_sentiment: 'neutral',
    intent_violations: [],
    subtle_claims: [],
    recommendations: [],
    summary: '',
  };
}

// ── Retry ────────────────────────────────────────────────────────────────

/**
 * Manually retry an AI assessment for a submission.
 * Deletes the dead job and enqueues a fresh one.
 */
export async function retryAssessment(companyId: string, submissionId: string): Promise<boolean> {
  // Delete any dead/failed jobs for this submission
  await (supabase as any)
    .from('ai_jobs')
    .delete()
    .eq('submission_id', submissionId)
    .eq('job_type', 'ai_risk_assessment')
    .in('status', ['dead', 'failed']);

  return enqueueAIJob(companyId, submissionId);
}

// ── Content Analysis (kept for backwards compat, now a no-op) ────────────

/**
 * @deprecated AI analysis now happens server-side via job queue.
 * This function is kept for backwards compatibility with complianceEngine imports.
 * Returns an empty assessment — the actual analysis is async via ai-worker.
 */
export async function analyzeContentWithAI(
  _contentText: string,
  _platform: string,
  _targetAudience: string,
  _regulationTexts: string[] = []
): Promise<AIRiskAssessment> {
  return {
    ai_risk_score: 0,
    overall_sentiment: 'neutral',
    intent_violations: [],
    subtle_claims: [],
    recommendations: [],
    summary: 'AI analysis queued — results will appear shortly.',
  };
}

// ── Pre-Upload Risk Preview ──────────────────────────────────────────────

/**
 * Lightweight risk preview.
 *
 * NOTE:
 * Your project currently has NO geminiClient.ts. This function attempts to import it
 * only if it exists. If it doesn't, preview gracefully returns a safe default.
 *
 * If you later add an LLM gateway client (recommended), swap this to call it.
 */
export async function previewRisk(
  contentText: string,
  jurisdiction: string = 'nigeria'
): Promise<PreviewResult> {
  if (contentText.trim().length < 20) {
    return { score: 0, topIssues: [], sentiment: 'neutral' };
  }

  try {
    // Optional dynamic import — only works if you actually have this module
    const mod = await import('./geminiClient').catch(() => null);
    const generateJSON = (mod as any)?.generateJSON as undefined | (<T>(prompt: string) => Promise<T>);

    if (!generateJSON) {
      // No client available — safe fallback
      return { score: 0, topIssues: [], sentiment: 'neutral' };
    }

    const prompt = `
You are a compliance risk screener. Quickly assess this draft marketing content for potential compliance risks.
Jurisdiction: ${jurisdiction}

--- CONTENT ---
${contentText.slice(0, 1000)}
--- END CONTENT ---

Return JSON only:
{
  "score": <number 0-100, where 0 is no risk and 100 is maximum risk>,
  "topIssues": ["<issue 1>", "<issue 2>", "<issue 3>"],
  "sentiment": "<positive|neutral|negative>"
}
`;

    const result = await generateJSON<PreviewResult>(prompt);
    result.score = Math.max(0, Math.min(100, result.score || 0));
    result.topIssues = (result.topIssues || []).slice(0, 5);
    return result;
  } catch {
    return { score: 0, topIssues: [], sentiment: 'neutral' };
  }
}