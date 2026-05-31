// supabase/functions/publish-dispatch/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PublishDispatchRequest = {
  content_id: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // ✅ Simple shared-secret protection (trigger must send this header)
    const hookSecret = Deno.env.get("PUBLISH_HOOK_SECRET") || "";
    const incoming = req.headers.get("x-hook-secret") || "";
    if (!hookSecret || incoming !== hookSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const SB_URL = Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL");
    const SB_SERVICE_ROLE_KEY =
      Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SB_URL || !SB_SERVICE_ROLE_KEY) {
      return jsonResponse(
        { error: "Missing SB_URL / SB_SERVICE_ROLE_KEY secrets" },
        500
      );
    }

    const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = (await req.json()) as PublishDispatchRequest;
    const contentId = body?.content_id;

    if (!contentId) {
      return jsonResponse({ error: "content_id is required" }, 400);
    }

    // 1) Load the submission (include the fields you care about)
    const { data: submission, error: subErr } = await supabase
      .from("content_submissions")
      .select(
        `
        id,
        company_id,
        user_id,
        title,
        platform,
        target_audience,
        content_topic,
        content_text,
        corrected_text,
        signoff_status,
        created_at,
        updated_at,
        published_at,
        published_by,
        legal_decided_at,
        legal_decided_by
      `
      )
      .eq("id", contentId)
      .maybeSingle();

    if (subErr) {
      console.error("Failed to load content_submissions:", subErr);
      return jsonResponse({ error: "Failed to load submission" }, 500);
    }

    if (!submission?.id) {
      return jsonResponse({ error: "Submission not found" }, 404);
    }

    // 2) Build the “publish payload” (this is what you will send to CRMs/websites/etc later)
    // For now we store it in publish_outbox.
    const payload = {
      event: "content.published",
      version: "1.0",
      occurred_at: new Date().toISOString(),
      content: {
        id: submission.id,
        company_id: submission.company_id,
        title: submission.title,
        platform: submission.platform,
        target_audience: submission.target_audience,
        content_topic: submission.content_topic,
        // ✅ choose corrected_text if present, else fallback to original
        body: (submission.corrected_text || submission.content_text || "").toString(),
      },
      workflow: {
        signoff_status: submission.signoff_status,
        published_at: submission.published_at,
        published_by: submission.published_by,
        legal_decided_at: submission.legal_decided_at,
        legal_decided_by: submission.legal_decided_by,
      },
      destination: {
        // Placeholder for the future (company config decides this)
        type: "unconfigured",
        config: null,
      },
      metadata: {
        created_at: submission.created_at,
        updated_at: submission.updated_at,
      },
    };

    // 3) Store payload to outbox (durable)
    const { error: outErr } = await supabase.from("publish_outbox").insert({
      company_id: submission.company_id,
      content_id: submission.id,
      event_type: "content.published",
      payload,
      status: "queued",
    });

    if (outErr) {
      console.error("Failed to insert publish_outbox:", outErr);
      return jsonResponse({ error: "Failed to write publish_outbox" }, 500);
    }

    // For now, we just queue it. Later you’ll deliver it to a configured webhook/API destination.
    return jsonResponse({ ok: true, queued: true, content_id: submission.id });
  } catch (e) {
    console.error("publish-dispatch error:", e);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
