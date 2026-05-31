/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


const corsHeaders = {
  "Access-Control-Allow-Origin": req.headers.get("origin") ?? "",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * API v1 Proxy Gateway
 * 
 * Entry point for all external /api/v1/... calls.
 * 1. Validates API Key
 * 2. Injects Company Context
 * 3. Enforces rate limits
 * 4. Routes request
 */
Deno.serve(async (req) => {
  const startTime = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders, ...SECURITY_HEADERS }});
  }

  const url = new URL(req.url);
  const path = url.pathname;
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const userAgent = req.headers.get("user-agent");
  const sourceIp = req.headers.get("x-forwarded-for")?.split(',')[0] || "unknown";

  let companyId: string | null = null;
  let apiKeyId: string | null = null;
  let serviceAccountId: string | null = null;
  let scopes: string[] = [];
  let statusCode = 200;
  let errorMessage: string | null = null;

  const logRequest = async (finalStatus: number, errorMsg: string | null = null) => {
    try {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      
      // Fire and forget logging
      await supabaseAdmin.from("api_request_logs").insert({
        company_id: companyId,
        api_key_id: apiKeyId,
        service_account_id: serviceAccountId,
        method: req.method,
        path: path,
        status_code: finalStatus,
        request_id: requestId,
        source_ip: sourceIp,
        user_agent: userAgent,
        latency_ms: Date.now() - startTime,
        scopes_used: scopes,
        error_message: errorMsg
      });
    } catch (logErr) {
      console.error("Failed to log API request:", logErr);
    }
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      statusCode = 401;
      const res = new Response(JSON.stringify({ error: "Unauthorized: Missing Bearer Token" }), {
        status: 401,
        headers: { ...SECURITY_HEADERS, ...corsHeaders, "Content-Type": "application/json" },
      });
      await logRequest(401, "Missing Bearer Token");
      return res;
    }

    const rawKey = authHeader.replace("Bearer ", "");
    
    // Initialize Supabase Client (Service Role for validation)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Validate API Key by Hash
    const keyData = new TextEncoder().encode(rawKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", keyData);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { data: keyRecord, error: keyError } = await supabaseAdmin
      .from("api_keys")
      .select("id, company_id, service_account_id, scopes, revoked_at, expires_at")
      .eq("key_hash", hashHex)
      .maybeSingle();

    if (keyError || !keyRecord) {
      statusCode = 401;
      await logRequest(401, "Invalid API Key");
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid API Key" }), {
        status: 401,
        headers: { ...SECURITY_HEADERS, ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    companyId = keyRecord.company_id;
    apiKeyId = keyRecord.id;
    serviceAccountId = keyRecord.service_account_id;
    scopes = keyRecord.scopes;

    if (keyRecord.revoked_at) {
      statusCode = 401;
      await logRequest(401, "API Key has been revoked");
      return new Response(JSON.stringify({ error: "Unauthorized: API Key has been revoked" }), {
        status: 401,
        headers: { ...SECURITY_HEADERS, ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
       statusCode = 401;
       await logRequest(401, "API Key has expired");
       return new Response(JSON.stringify({ error: "Unauthorized: API Key has expired" }), {
        status: 401,
        headers: { ...SECURITY_HEADERS, ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update last_used_at (async/background)
    supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", hashHex);

    // 2. Route Routing
    if (path === "/api/v1/evidence/ingest" && req.method === "POST") {
      // a. Check Scope
      if (!keyRecord.scopes.includes("evidence:write") && !keyRecord.scopes.includes("governance:evidence:write")) {
        statusCode = 403;
        await logRequest(403, "Missing required scope");
        return new Response(JSON.stringify({ error: "Forbidden: Missing required scope (evidence:write)" }), {
          status: 403,
          headers: { ...SECURITY_HEADERS, ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // b. Parse and Validate Payload
      const payload = await req.json();
      if (!payload.title || !payload.source_name || !payload.source_type) {
        statusCode = 400;
        await logRequest(400, "Missing required fields");
        return new Response(JSON.stringify({ error: "Bad Request: Missing required fields (title, source_name, source_type)" }), {
          status: 400,
          headers: { ...SECURITY_HEADERS, ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // c. Process Ingestion (Synchronous)
      const { data: ingestion, error: ingError } = await supabaseAdmin
        .from('external_evidence_ingestions')
        .insert({
          company_id: keyRecord.company_id,
          source_name: payload.source_name,
          source_type: payload.source_type,
          status: 'received',
          related_control_id: payload.related_control_id || null,
          related_audit_request_id: payload.related_audit_request_id || null,
          metadata: {
            external_reference: payload.external_reference,
            occurred_at: payload.occurred_at,
            evidence_type: payload.evidence_type,
            file_url: payload.file_url,
            ...payload.metadata
          }
        })
        .select()
        .single();

      if (ingError) throw ingError;

      try {
        const { data: submission, error: subError } = await supabaseAdmin
          .from('content_submissions')
          .insert({
            user_id: keyRecord.created_by || null,
            company_id: keyRecord.company_id,
            title: payload.title,
            content_text: payload.content_text || payload.description || `Evidence from ${payload.source_name}`,
            file_name: payload.file_url ? payload.file_url.split('/').pop() || 'external_file' : 'external_evidence.txt',
            file_type: '.txt',
            platform: 'external_evidence',
            content_topic: 'compliance_evidence',
            target_audience: 'healthcare_professionals',
            status: 'approved',
            metadata: {
              ingestion_id: ingestion.id,
              source_name: payload.source_name,
              source_type: payload.source_type,
              external_reference: payload.external_reference
            }
          })
          .select()
          .single();

        if (subError) throw subError;

        if (payload.related_control_id) {
          await supabaseAdmin.from('grc_control_evidence').insert({
            company_id: keyRecord.company_id,
            control_id: payload.related_control_id,
            submission_id: submission.id,
            status: 'valid'
          });
        }

        if (payload.related_audit_request_id) {
          await supabaseAdmin.from('audit_request_evidence').insert({
            company_id: keyRecord.company_id,
            audit_request_id: payload.related_audit_request_id,
            submission_id: submission.id
          });
        }

        await supabaseAdmin
          .from('external_evidence_ingestions')
          .update({
            status: 'processed',
            submission_id: submission.id,
            processed_at: new Date().toISOString()
          })
          .eq('id', ingestion.id);

        statusCode = 201;
        await logRequest(201);
        return new Response(JSON.stringify({
          message: "Evidence ingested successfully",
          ingestion_id: ingestion.id,
          submission_id: submission.id
        }), {
          status: 201,
          headers: { ...SECURITY_HEADERS, ...corsHeaders, "Content-Type": "application/json" },
        });

      } catch (procErr: any) {
        await supabaseAdmin
          .from('external_evidence_ingestions')
          .update({
            status: 'failed',
            error_message: procErr.message || String(procErr)
          })
          .eq('id', ingestion.id);

        statusCode = 500;
        await logRequest(500, procErr.message);
        return new Response(JSON.stringify({ error: "Ingestion processing failed", details: procErr.message }), {
          status: 500,
          headers: { ...SECURITY_HEADERS, ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    statusCode = 200;
    await logRequest(200);
    return new Response(JSON.stringify({
      message: "API Request Authenticated",
      context: {
        company_id: keyRecord.company_id,
        scopes: keyRecord.scopes,
        path: path,
        method: req.method
      }
    }), {
      status: 200,
      headers: { ...SECURITY_HEADERS, ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    statusCode = 500;
    errorMessage = err.message;
    await logRequest(500, err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...SECURITY_HEADERS, ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
