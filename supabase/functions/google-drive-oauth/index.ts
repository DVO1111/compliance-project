/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "content-type": "application/json" },
  });
}

function base64UrlEncode(bytes: Uint8Array): string {
  const bin = String.fromCharCode(...bytes);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function aesKeyFromSecret(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptJson(secret: string, obj: Record<string, unknown>): Promise<string> {
  const key = await aesKeyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(cipher))}`;
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return base64UrlEncode(bytes);
}

function buildRedirectUrl(APP_BASE_URL: string) {
  // We keep the callback inside the Edge Function itself.
  // The function will redirect the browser back to the app.
  const u = new URL(APP_BASE_URL);
  u.pathname = "/functions/v1/google-drive-oauth";
  return u.toString();
}

Deno.serve(async (req) => {
  const SB_URL = Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL") || "";
  const SB_SERVICE_ROLE_KEY =
    Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "";

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  const GOOGLE_STATE_SECRET = Deno.env.get("GOOGLE_STATE_SECRET") || "";

  if (!SB_URL || !SB_SERVICE_ROLE_KEY) return json({ error: "Missing SB_URL / SB_SERVICE_ROLE_KEY." }, 500);
  if (!APP_BASE_URL) return json({ error: "Missing APP_BASE_URL." }, 500);
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return json({ error: "Missing GOOGLE_CLIENT_ID/SECRET." }, 500);
  if (!GOOGLE_STATE_SECRET) return json({ error: "Missing GOOGLE_STATE_SECRET." }, 500);

  const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const url = new URL(req.url);

  // Callback from Google (GET)
  if (req.method === "GET" && url.searchParams.get("code")) {
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const companyId = url.searchParams.get("company_id") || "";
    const connectionId = url.searchParams.get("connection_id") || "";
    const expected = url.searchParams.get("st") || "";

    // Basic CSRF check
    if (!state || !expected || state !== expected) {
      const app = new URL(APP_BASE_URL);
      app.searchParams.set("integration", "google_drive");
      app.searchParams.set("status", "error");
      app.searchParams.set("reason", "bad_state");
      return Response.redirect(app.toString(), 302);
    }

    if (!companyId || !connectionId) {
      const app = new URL(APP_BASE_URL);
      app.searchParams.set("integration", "google_drive");
      app.searchParams.set("status", "error");
      app.searchParams.set("reason", "missing_company_or_connection");
      return Response.redirect(app.toString(), 302);
    }

    const redirectUri = buildRedirectUrl(APP_BASE_URL);

    // Exchange code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { ...SECURITY_HEADERS, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok) {
      const app = new URL(APP_BASE_URL);
      app.searchParams.set("integration", "google_drive");
      app.searchParams.set("status", "error");
      app.searchParams.set("reason", "token_exchange_failed");
      return Response.redirect(app.toString(), 302);
    }

    // Fetch basic profile (Drive doesn't have profile; use OAuth userinfo)
    let email: string | null = null;
    try {
      const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { ...SECURITY_HEADERS, Authorization: `Bearer ${tokenJson.access_token }` },
      });
      const meJson = await me.json().catch(() => ({}));
      email = meJson?.email || null;
    } catch {
      // ignore
    }

    const encrypted = await encryptJson(GOOGLE_STATE_SECRET, {
      provider: "google_drive",
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      scope: tokenJson.scope,
      token_type: tokenJson.token_type,
      expiry_date: tokenJson.expires_in ? Date.now() + Number(tokenJson.expires_in) * 1000 : null,
      email,
    });

    // Update the existing connection
    await supabase
      .from("integration_connections")
      .update({
        status: "active",
        credentials_encrypted: encrypted,
        config: { auth_mode: "oauth" },
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("company_id", companyId);

    const app = new URL(APP_BASE_URL);
    app.searchParams.set("integration", "google_drive");
    app.searchParams.set("status", "success");
    return Response.redirect(app.toString(), 302);
  }

  // Start OAuth (POST)
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({} as any));
    if (body?.action !== "start") return json({ error: "Invalid action" }, 400);

    const companyId = String(body.company_id || "");
    const connectionId = String(body.connection_id || "");
    if (!companyId || !connectionId) return json({ error: "Missing company_id/connection_id" }, 400);

    const redirectUri = buildRedirectUrl(APP_BASE_URL);
    const st = randomState();

    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("access_type", "offline");
    auth.searchParams.set("prompt", "consent");
    auth.searchParams.set(
      "scope",
      [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive.metadata.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" "),
    );
    auth.searchParams.set("state", st);
    auth.searchParams.set("include_granted_scopes", "true");

    // Carry identifiers in query so we can update right row on callback
    auth.searchParams.set("company_id", companyId);
    auth.searchParams.set("connection_id", connectionId);
    auth.searchParams.set("st", st);

    return json({ url: auth.toString() });
  }

  return json({ error: "Unsupported method" }, 405);
});
