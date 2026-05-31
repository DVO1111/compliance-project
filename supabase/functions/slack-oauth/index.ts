/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


type Json = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "content-type": "application/json" },
  });
}

function base64UrlEncode(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

async function aesKeyFromSecret(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptJson(secret: string, payload: Json): Promise<string> {
  const key = await aesKeyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const cipherBytes = new Uint8Array(cipher);
  return `${base64UrlEncode(iv)}.${base64UrlEncode(cipherBytes)}`;
}

function buildRedirect(baseUrl: string, params: Record<string, string>) {
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function exchangeSlackCode(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const form = new URLSearchParams();
  form.set("client_id", args.clientId);
  form.set("client_secret", args.clientSecret);
  form.set("code", args.code);
  form.set("redirect_uri", args.redirectUri);

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { ...SECURITY_HEADERS, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Slack OAuth HTTP ${res.status}`);
  }
  if (!data?.ok) {
    throw new Error(data?.error || "Slack OAuth failed");
  }
  return data;
}

Deno.serve(async (req) => {
  const SB_URL = Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL") || "";
  const SB_SERVICE_ROLE_KEY =
    Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  const SLACK_CLIENT_ID = Deno.env.get("SLACK_CLIENT_ID") || "";
  const SLACK_CLIENT_SECRET = Deno.env.get("SLACK_CLIENT_SECRET") || "";
  const SLACK_STATE_SECRET = Deno.env.get("SLACK_STATE_SECRET") || "";
  const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "";

  if (!SB_URL || !SB_SERVICE_ROLE_KEY) return json({ error: "Missing SB_URL / SB_SERVICE_ROLE_KEY" }, 500);
  if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) return json({ error: "Missing Slack app secrets" }, 500);
  if (!SLACK_STATE_SECRET) return json({ error: "Missing SLACK_STATE_SECRET" }, 500);
  if (!APP_BASE_URL) return json({ error: "Missing APP_BASE_URL" }, 500);

  const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const url = new URL(req.url);

  // We support both GET query and POST body for action
  let body: any = null;
  if (req.method !== "GET") {
    try {
      body = await req.json();
    } catch {
      body = null;
    }
  }

  const action = (url.searchParams.get("action") || body?.action || "").toString();

  const redirectUri = `${SB_URL.replace(/\/$/, "")}/functions/v1/slack-oauth?action=callback`;

  if (action === "start") {
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json({ error: "Missing Authorization" }, 401);

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);

    const userId = userData.user.id;
    const companyId = (url.searchParams.get("company_id") || body?.company_id || "").toString();
    if (!companyId) return json({ error: "Missing company_id" }, 400);

    // Verify user belongs to company
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    if (pErr) return json({ error: pErr.message }, 500);
    if (!profile?.company_id || profile.company_id !== companyId) {
      return json({ error: "Forbidden" }, 403);
    }

    // Upsert connection (one Slack workspace per company)
    const { data: existing } = await supabase
      .from("integration_connections")
      .select("id, config")
      .eq("company_id", companyId)
      .eq("provider_id", "slack")
      .maybeSingle();

    let connectionId = existing?.id as string | undefined;
    const baseConfig = {
      mode: "oauth",
      notify_submissions: true,
      notify_approvals: true,
      notify_expiry: true,
      ...(existing?.config || {}),
    };

    if (!connectionId) {
      const { data: inserted, error: insErr } = await supabase
        .from("integration_connections")
        .insert({
          company_id: companyId,
          provider_id: "slack",
          display_name: "Slack",
          status: "pending",
          credentials_encrypted: null,
          config: baseConfig,
          created_by: userId,
        })
        .select("id")
        .single();
      if (insErr) return json({ error: insErr.message }, 500);
      connectionId = inserted.id as string;
    } else {
      await supabase
        .from("integration_connections")
        .update({ status: "pending", last_error: null, config: baseConfig, updated_at: new Date().toISOString() })
        .eq("id", connectionId);
    }

    // Build signed state
    const statePayload = {
      company_id: companyId,
      user_id: userId,
      connection_id: connectionId,
      ts: Date.now(),
      nonce: crypto.randomUUID(),
    };
    const payloadStr = JSON.stringify(statePayload);
    const payloadB64 = base64UrlEncode(new TextEncoder().encode(payloadStr));
    const sig = await hmacSha256(SLACK_STATE_SECRET, payloadB64);
    const sigB64 = base64UrlEncode(sig);
    const state = `${payloadB64}.${sigB64}`;

    // Public channels: channels:read, channels:join
    // Private channels (that the bot is already a member of): groups:read
    // Note: bots cannot "join" private channels unless invited; we still include groups:read
    // so we can list private channels the app has access to.
    const scopes = ["chat:write", "chat:write.public", "channels:read", "channels:join", "groups:read"].join(",");
    const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
    authorizeUrl.searchParams.set("client_id", SLACK_CLIENT_ID);
    authorizeUrl.searchParams.set("scope", scopes);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", state);

    return json({ authorize_url: authorizeUrl.toString() });
  }

  if (action === "callback") {
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const err = url.searchParams.get("error");

    if (err) {
      const redirect = buildRedirect(APP_BASE_URL, {
        integration: "slack",
        status: "error",
        message: `Slack error: ${err}`,
      });
      return Response.redirect(redirect, 302);
    }

    if (!code || !state || !state.includes(".")) {
      const redirect = buildRedirect(APP_BASE_URL, {
        integration: "slack",
        status: "error",
        message: "Slack callback missing code/state",
      });
      return Response.redirect(redirect, 302);
    }

    const [payloadB64, sigB64] = state.split(".");
    const expected = await hmacSha256(SLACK_STATE_SECRET, payloadB64);
    const provided = base64UrlDecode(sigB64);

    // Constant-time compare
    if (provided.length !== expected.length) {
      const redirect = buildRedirect(APP_BASE_URL, {
        integration: "slack",
        status: "error",
        message: "Invalid Slack state",
      });
      return Response.redirect(redirect, 302);
    }
    let ok = true;
    for (let i = 0; i < provided.length; i++) ok = ok && (provided[i] === expected[i]);
    if (!ok) {
      const redirect = buildRedirect(APP_BASE_URL, {
        integration: "slack",
        status: "error",
        message: "Invalid Slack state signature",
      });
      return Response.redirect(redirect, 302);
    }

    const payloadStr = new TextDecoder().decode(base64UrlDecode(payloadB64));
    let parsed: any;
    try {
      parsed = JSON.parse(payloadStr);
    } catch {
      parsed = null;
    }

    const ts = Number(parsed?.ts || 0);
    const companyId = (parsed?.company_id || "").toString();
    const connectionId = (parsed?.connection_id || "").toString();
    if (!companyId || !connectionId || !ts) {
      const redirect = buildRedirect(APP_BASE_URL, {
        integration: "slack",
        status: "error",
        message: "Slack state payload invalid",
      });
      return Response.redirect(redirect, 302);
    }

    // 10 min expiry
    if (Date.now() - ts > 10 * 60 * 1000) {
      const redirect = buildRedirect(APP_BASE_URL, {
        integration: "slack",
        status: "error",
        message: "Slack OAuth link expired. Please try again.",
      });
      return Response.redirect(redirect, 302);
    }

    try {
      const tokenResp = await exchangeSlackCode({
        code,
        clientId: SLACK_CLIENT_ID,
        clientSecret: SLACK_CLIENT_SECRET,
        redirectUri,
      });

      const botToken = tokenResp?.access_token as string;
      const teamId = tokenResp?.team?.id as string | undefined;
      const teamName = tokenResp?.team?.name as string | undefined;
      const botUserId = tokenResp?.bot_user_id as string | undefined;

      if (!botToken) throw new Error("Slack OAuth returned no access_token");

      const encrypted = await encryptJson(SLACK_STATE_SECRET, {
        access_token: botToken,
        team_id: teamId,
        team_name: teamName,
        bot_user_id: botUserId,
        installed_at: new Date().toISOString(),
      });

      // Update connection
      const { error: upErr } = await supabase
        .from("integration_connections")
        .update({
          status: "active",
          last_error: null,
          credentials_encrypted: encrypted,
          config: { mode: "oauth", team_id: teamId, team_name: teamName },
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId)
        .eq("company_id", companyId);

      if (upErr) throw new Error(upErr.message);

      const redirect = buildRedirect(APP_BASE_URL, {
        integration: "slack",
        status: "success",
        message: teamName ? `Slack connected (${teamName}).` : "Slack connected.",
      });
      return Response.redirect(redirect, 302);
    } catch (e) {
      // Best-effort mark error
      try {
        await supabase
          .from("integration_connections")
          .update({ status: "error", last_error: (e as any)?.message ?? String(e), updated_at: new Date().toISOString() })
          .eq("id", connectionId)
          .eq("company_id", companyId);
      } catch {
        // ignore
      }

      const redirect = buildRedirect(APP_BASE_URL, {
        integration: "slack",
        status: "error",
        message: (e as any)?.message ?? "Slack OAuth failed",
      });
      return Response.redirect(redirect, 302);
    }
  }

  return json({ error: "Unsupported action" }, 400);
});
