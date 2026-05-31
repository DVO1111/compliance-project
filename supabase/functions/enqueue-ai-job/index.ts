// supabase/functions/enqueue-ai-job/index.ts
// Idempotently enqueue an AI analysis job.
// Input: { companyId, submissionId, jobType }
// Computes content_hash server-side from content_submissions.

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

/** FNV-1a hash (same algorithm used in the frontend) */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS, ...SECURITY_HEADERS }});
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, message: "Method Not Allowed" }),
      { status: 405, headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();

    // Accept both camelCase and snake_case keys
    const companyId    = body.companyId    ?? body.company_id    ?? null;
    const submissionId = body.submissionId ?? body.submission_id ?? null;
    const jobType      = body.jobType      ?? body.job_type      ?? "ai_risk_assessment";

    if (!submissionId) {
      return new Response(
        JSON.stringify({ ok: false, message: "submissionId / submission_id required" }),
        { status: 400, headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Compute content_hash server-side
    let contentHash = "";
    if (jobType === "ai_risk_assessment") {
      const { data: submission } = await supabase
        .from("content_submissions")
        .select("content_text")
        .eq("id", submissionId)
        .maybeSingle();

      if (!submission?.content_text) {
        return new Response(
          JSON.stringify({ ok: false, message: "Submission not found or empty" }),
          { status: 404, headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
        );
      }

      contentHash = fnv1a(submission.content_text);
    }

    // Insert job (idempotent via unique constraint)
    const { error } = await supabase.from("ai_jobs").insert({
      company_id: companyId || null,
      submission_id: submissionId,
      job_type: jobType,
      status: "queued",
      payload: { content_hash: contentHash || null },
    });

    if (error) {
      // 23505 = unique_violation → job already exists → that's fine
      if (error.code === "23505") {
        return new Response(
          JSON.stringify({ ok: true, queued: false, message: "Job already exists" }),
          { headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    return new Response(
      JSON.stringify({ ok: true, queued: true }),
      { headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[enqueue-ai-job] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, message: err.message ?? "Enqueue failed" }),
      { status: 500, headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
    );
  }
});
