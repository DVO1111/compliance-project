/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "content-type": "application/json", ...headers },
  });
}

function base64UrlEncode(input: string) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return atob(b64);
}

async function hmacSha256Hex(secret: string, message: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type StatePayload = {
  company_id: string;
  connection_id: string;
  ts: number;
  nonce: string;
};

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

async function deriveAesKey(secret: string, salt: string) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function bytesToB64Url(bytes: Uint8Array) {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64UrlToBytes(b64url: string) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encryptJson(secret: string, salt: string, payload: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret, salt);
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return `v1.${bytesToB64Url(iv)}.${bytesToB64Url(ciphertext)}`;
}

const GRAPH_SCOPES = [
  "offline_access",
  "User.Read",
  "Files.Read.All",
  "Sites.Read.All",
].join(" ");

// NOTE: use /common for multi-tenant.
const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Callback path: GET with code
  if (req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    const appBaseUrl = Deno.env.get("APP_BASE_URL") || "";
    const redirectBack = new URL(appBaseUrl || "http://localhost:5173");
    redirectBack.pathname = "/integrations";
    redirectBack.searchParams.set("integration", "microsoft_365");

    if (error) {
      redirectBack.searchParams.set("status", "error");
      redirectBack.searchParams.set("reason", errorDescription || error);
      return Response.redirect(redirectBack.toString(), 302);
    }

    if (!code || !state) {
      redirectBack.searchParams.set("status", "error");
      redirectBack.searchParams.set("reason", "Missing code/state");
      return Response.redirect(redirectBack.toString(), 302);
    }

    try {
      const stateSecret = Deno.env.get("MS_STATE_SECRET") || "";
      const [payloadB64, sig] = state.split(".");
      if (!payloadB64 || !sig) throw new Error("Invalid state");
      const expected = await hmacSha256Hex(stateSecret, payloadB64);
      if (expected !== sig) throw new Error("Invalid state signature");

      const payload = JSON.parse(base64UrlDecode(payloadB64)) as StatePayload;
      if (!payload?.company_id || !payload?.connection_id) throw new Error("Invalid state payload");

      const clientId = Deno.env.get("MS_CLIENT_ID") || "";
      const clientSecret = Deno.env.get("MS_CLIENT_SECRET") || "";
      if (!clientId || !clientSecret) throw new Error("Missing MS_CLIENT_ID/MS_CLIENT_SECRET");

      const redirectUri = `${(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")}/functions/v1/microsoft-oauth`;

      const tokenRes = await fetch(`${AUTH_BASE}/token`, {
        method: "POST",
        headers: { ...SECURITY_HEADERS, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenJson?.error_description || tokenJson?.error || "Token exchange failed");

      const now = Math.floor(Date.now() / 1000);
      const credentials = {
        access_token: tokenJson.access_token,
        refresh_token: tokenJson.refresh_token,
        expires_at: now + Number(tokenJson.expires_in || 3600) - 60,
        scope: tokenJson.scope,
        token_type: tokenJson.token_type,
      };

      // Store encrypted token in integration_connections
      const supabase = getSupabaseAdmin();

      const tokenSecret = Deno.env.get('MS_TOKEN_SECRET') || stateSecret;
      const encCreds = await encryptJson(tokenSecret, payload.connection_id, credentials);

      const { error: upErr } = await supabase
        .from("integration_connections")
        .update({
          status: "active",
          credentials_encrypted: encCreds,
          config: { auth_mode: "oauth" },
          last_error: null,
          last_health_check_at: new Date().toISOString(),
        })
        .eq("id", payload.connection_id)
        .eq("company_id", payload.company_id);

      if (upErr) throw upErr;

      redirectBack.searchParams.set("status", "success");
      return Response.redirect(redirectBack.toString(), 302);
    } catch (e) {
      redirectBack.searchParams.set("status", "error");
      redirectBack.searchParams.set("reason", (e as Error)?.message || "OAuth failed");
      return Response.redirect(redirectBack.toString(), 302);
    }
  }

  // Start path: POST { action: 'start', company_id, connection_id }
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.action !== "start") return json({ error: "Unsupported action" }, 400);
      const companyId = body?.company_id as string;
      const connectionId = body?.connection_id as string;
      if (!companyId || !connectionId) return json({ error: "Missing company_id/connection_id" }, 400);

      const clientId = Deno.env.get("MS_CLIENT_ID") || "";
      const stateSecret = Deno.env.get("MS_STATE_SECRET") || "";
      if (!clientId || !stateSecret) return json({ error: "Missing MS_CLIENT_ID/MS_STATE_SECRET" }, 500);

      const redirectUri = `${(Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")}/functions/v1/microsoft-oauth`;

      const payload: StatePayload = {
        company_id: companyId,
        connection_id: connectionId,
        ts: Date.now(),
        nonce: randomNonce(),
      };
      const payloadB64 = base64UrlEncode(JSON.stringify(payload));
      const sig = await hmacSha256Hex(stateSecret, payloadB64);
      const state = `${payloadB64}.${sig}`;

      const authUrl = new URL(`${AUTH_BASE}/authorize`);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_mode", "query");
      authUrl.searchParams.set("scope", GRAPH_SCOPES);
      authUrl.searchParams.set("state", state);

      return json({ url: authUrl.toString() });
    } catch (e) {
      return json({ error: (e as Error)?.message || "Bad request" }, 400);
    }
  }

  return json({ error: "Method not allowed" }, 405);
});
