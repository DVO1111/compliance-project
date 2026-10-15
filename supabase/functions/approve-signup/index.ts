import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: JSON_HEADERS });
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ") || !url || !serviceKey) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  const callerClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: approver, error: approverError } = await admin
    .from("access_approvers")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (approverError || !approver) {
    return new Response(JSON.stringify({ error: "not_authorized" }), { status: 403, headers: JSON_HEADERS });
  }

  let body: { action?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: JSON_HEADERS });
  }

  if (body.action === "list") {
    const { data, error } = await admin
      .from("access_requests")
      .select("email,full_name,company,role,industry,notes,requested_at")
      .is("approved_at", null)
      .order("requested_at", { ascending: true });
    if (error) {
      console.error("[approve-signup] request list failed", error.message);
      return new Response(JSON.stringify({ error: "request_list_failed" }), { status: 500, headers: JSON_HEADERS });
    }
    return new Response(JSON.stringify({ requests: data ?? [] }), { headers: JSON_HEADERS });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (body.action !== "approve" || !EMAIL_RE.test(email) || email.length > 320) {
    return new Response(JSON.stringify({ error: "invalid_request" }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: request, error: requestError } = await admin
    .from("access_requests")
    .select("email,full_name,company,industry,approved_at")
    .eq("email", email)
    .maybeSingle();
  if (requestError || !request) {
    return new Response(JSON.stringify({ error: "request_not_found" }), { status: 404, headers: JSON_HEADERS });
  }

  const siteOrigin = Deno.env.get("APP_BASE_URL")?.replace(/\/+$/, "") || "";
  if (!siteOrigin || !/^https:\/\//i.test(siteOrigin)) {
    return new Response(JSON.stringify({ error: "app_url_not_configured" }), { status: 500, headers: JSON_HEADERS });
  }
  const setupUrl = `${siteOrigin}/?setup=1`;

  const { error: allowlistError } = await admin.from("allowed_signins").upsert({
    email,
    note: `Approved access request by ${user.email ?? user.id}`,
    added_by: user.id,
  }, { onConflict: "email" });
  if (allowlistError) {
    console.error("[approve-signup] allowlist update failed", allowlistError.message);
    return new Response(JSON.stringify({ error: "approval_failed" }), { status: 500, headers: JSON_HEADERS });
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: setupUrl,
    data: {
      full_name: request.full_name,
      organization: request.company,
      industry_type: request.industry,
    },
  });
  if (inviteError && /already (?:been )?(?:registered|exists)|user already/i.test(inviteError.message)) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!anonKey) {
      console.error("[approve-signup] SUPABASE_ANON_KEY is unavailable for existing-account recovery");
      return new Response(JSON.stringify({ error: "invite_email_failed" }), { status: 502, headers: JSON_HEADERS });
    }
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: recoveryError } = await authClient.auth.resetPasswordForEmail(email, {
      redirectTo: setupUrl,
    });
    if (recoveryError) {
      console.error("[approve-signup] existing-account setup email failed", recoveryError.message);
      return new Response(JSON.stringify({ error: "invite_email_failed" }), { status: 502, headers: JSON_HEADERS });
    }
  } else if (inviteError) {
    console.error("[approve-signup] invite email failed", inviteError.message);
    return new Response(JSON.stringify({ error: "invite_email_failed" }), { status: 502, headers: JSON_HEADERS });
  }

  const { error: markError } = await admin.from("access_requests").update({
    approved_at: new Date().toISOString(),
    approved_by: user.id,
  }).eq("email", email);
  if (markError) {
    console.error("[approve-signup] request status update failed", markError.message);
  }

  return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
});