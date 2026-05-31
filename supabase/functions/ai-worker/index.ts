// supabase/functions/ai-worker/index.ts
// Processes queued ai_jobs: claims jobs, runs LLM analysis via llm-gateway,
// caches results in ai_risk_assessments, handles retries + dead-letter.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


const CORS = {
  "Access-Control-Allow-Origin": req.headers.get("origin") ?? "",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ─── Analysis Prompt ────────────────────────────────────── */

function buildAnalysisPrompt(
  content: string,
  platform: string,
  audience: string,
  jurisdiction: string
): string {
  return `
You are an expert pharmaceutical/healthcare compliance analyst.
Analyze the following marketing content for compliance violations that go BEYOND simple keyword matching.
Focus on:
1. **Implied cure claims** — language that suggests a product can cure, treat, or prevent disease without explicit claims
2. **Subtle superlatives** — words like "best", "most effective", "superior" even when qualified
3. **Misleading statistics** — cherry-picked data, out-of-context numbers, misleading comparisons
4. **Emotional manipulation** — fear-based marketing, exploitation of patient vulnerabilities
5. **Off-label promotion** — suggesting uses not approved by regulators
6. **Missing disclaimers** — required warnings/disclaimers that are absent

Content Platform: ${platform}
Target Audience: ${audience}
Jurisdiction: ${jurisdiction}

--- CONTENT ---
${content.slice(0, 6000)}
--- END CONTENT ---

Return a JSON object with this EXACT structure (no markdown, no commentary):
{
  "ai_risk_score": <number 0-100>,
  "overall_sentiment": "<positive|neutral|negative>",
  "intent_violations": [
    {
      "type": "<violation type>",
      "description": "<detailed explanation>",
      "severity": "<low|medium|high|critical>",
      "phrase": "<exact text from content>",
      "regulation_ref": "<regulation reference if applicable>"
    }
  ],
  "subtle_claims": ["<list of subtle/implied claims found>"],
  "recommendations": ["<specific actionable fixes>"],
  "summary": "<2-3 sentence executive summary of compliance risk>"
}
`;
}

/* ─── Main Handler ───────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS, ...SECURITY_HEADERS }});
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: { limit?: number; workerId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // No body = use defaults
  }

  const limit = body.limit ?? 5;
  const workerId = body.workerId ?? `worker-${crypto.randomUUID().slice(0, 8)}`;

  // 1) Claim jobs
  const { data: jobs, error: claimErr } = await supabase.rpc("claim_ai_jobs", {
    p_limit: limit,
    p_worker: workerId,
  });

  if (claimErr) {
    console.error("[ai-worker] claim_ai_jobs error:", claimErr);
    return new Response(
      JSON.stringify({ ok: false, message: claimErr.message }),
      { status: 500, headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
    );
  }

  if (!jobs || jobs.length === 0) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0, message: "No jobs to process" }),
      { headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
    );
  }

  const results: Array<{ jobId: string; status: string; error?: string }> = [];

  // 2) Process each job
  for (const job of jobs) {
    try {
      if (job.job_type === "ai_risk_assessment") {
        await processRiskAssessment(supabase, supabaseUrl, serviceKey, job);
        results.push({ jobId: job.id, status: "succeeded" });
      } else {
        // Unknown job type — mark as dead
        await supabase.rpc("complete_ai_job", {
          p_job_id: job.id,
          p_status: "dead",
          p_error: `Unknown job_type: ${job.job_type}`,
        });
        results.push({ jobId: job.id, status: "dead", error: "Unknown job_type" });
      }
    } catch (err: any) {
      console.error(`[ai-worker] Job ${job.id} failed:`, err.message);

      // Mark as failed (RPCs handle retry logic)
      await supabase.rpc("complete_ai_job", {
        p_job_id: job.id,
        p_status: "failed",
        p_error: err.message?.slice(0, 500) ?? "Unknown error",
      });

      results.push({ jobId: job.id, status: "failed", error: err.message });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed: jobs.length, results }),
    { headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
  );
});

/* ─── Risk Assessment Processor ──────────────────────────── */

async function processRiskAssessment(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  job: any
): Promise<void> {
  const submissionId = job.submission_id;
  const contentHash = job.payload?.content_hash;

  // 1) Load submission
  const { data: submission } = await supabase
    .from("content_submissions")
    .select("content_text, platform, target_audience, jurisdiction, company_id")
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  // 2) Check cache — skip if same content_hash and not expired
  if (contentHash) {
    const { data: cached } = await supabase
      .from("ai_risk_assessments")
      .select("id, expires_at")
      .eq("submission_id", submissionId)
      .eq("content_hash", contentHash)
      .maybeSingle();

    if (cached && cached.expires_at && new Date(cached.expires_at) > new Date()) {
      // Cache hit — mark succeeded without re-running
      await supabase.rpc("complete_ai_job", {
        p_job_id: job.id,
        p_status: "succeeded",
        p_error: null,
        p_result: { cached: true },
      });
      return;
    }
  }

  // 3) Call llm-gateway
  const gatewayUrl = `${supabaseUrl}/functions/v1/llm-gateway`;
  const prompt = buildAnalysisPrompt(
    submission.content_text,
    submission.platform || "website",
    submission.target_audience || "general_public",
    submission.jurisdiction || "nigeria"
  );

  const llmRes = await fetch(gatewayUrl, {
    method: "POST",
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey }`,
    },
    body: JSON.stringify({ prompt, mode: "json" }),
  });

  const llmBody = await llmRes.json();

  if (!llmBody.ok) {
    const status = llmBody.status ?? llmRes.status;
    // If 429/5xx → retriable (throw to trigger retry logic)
    if (status === 429 || status >= 500) {
      throw new Error(`LLM provider error (${status}): ${llmBody.message}`);
    }
    throw new Error(`LLM analysis failed: ${llmBody.message}`);
  }

  const ai = llmBody.data as {
    ai_risk_score?: number;
    overall_sentiment?: string;
    intent_violations?: unknown[];
    subtle_claims?: string[];
    recommendations?: string[];
    summary?: string;
  };

  const score = Math.max(0, Math.min(100, ai.ai_risk_score ?? 0));

  // 4) Upsert ai_risk_assessments
  await supabase.from("ai_risk_assessments").upsert(
    {
      submission_id: submissionId,
      company_id: job.company_id || submission.company_id || null,
      ai_risk_score: score,
      overall_sentiment: ai.overall_sentiment ?? "neutral",
      intent_violations: ai.intent_violations ?? [],
      subtle_claims: ai.subtle_claims ?? [],
      recommendations: ai.recommendations ?? [],
      summary: ai.summary ?? "",
      model_version: llmBody.provider ?? "unknown",
      content_hash: contentHash ?? null,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "submission_id" }
  );

  // 5) Update content_submissions summary
  await supabase
    .from("content_submissions")
    .update({
      ai_risk_score: score,
      ai_risk_summary: ai.summary ?? "",
    })
    .eq("id", submissionId);

  // 6) Mark job succeeded
  await supabase.rpc("complete_ai_job", {
    p_job_id: job.id,
    p_status: "succeeded",
    p_result: { score, provider: llmBody.provider },
  });
}
