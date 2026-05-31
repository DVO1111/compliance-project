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

async function decryptJson(secret: string, encrypted: string): Promise<Record<string, unknown>> {
  const [ivB64, cipherB64] = encrypted.split(".");
  if (!ivB64 || !cipherB64) throw new Error("Invalid encrypted credential format");
  const key = await aesKeyFromSecret(secret);
  const iv = base64UrlDecode(ivB64);
  const cipher = base64UrlDecode(cipherB64);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  const text = new TextDecoder().decode(new Uint8Array(plain));
  return JSON.parse(text);
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SB_URL = Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL") || "";
  const SB_SERVICE_ROLE_KEY =
    Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const GOOGLE_STATE_SECRET = Deno.env.get("GOOGLE_STATE_SECRET") || "";

  if (!SB_URL || !SB_SERVICE_ROLE_KEY) return json({ error: "Missing SB_URL / SB_SERVICE_ROLE_KEY." }, 500);
  if (!GOOGLE_STATE_SECRET) return json({ error: "Missing GOOGLE_STATE_SECRET." }, 500);

  const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({} as any));

  const companyId = String(body.company_id || "");
  const connectionId = String(body.connection_id || "");
  const parentId = String(body.parent_id || "root");
  if (!companyId || !connectionId) return json({ error: "Missing company_id/connection_id" }, 400);

  const { data: conn, error } = await supabase
    .from("integration_connections")
    .select("id, company_id, provider_id, status, credentials_encrypted, config")
    .eq("id", connectionId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!conn) return json({ error: "Connection not found" }, 404);
  if (conn.provider_id !== "google_drive") return json({ error: "Not a Google Drive connection" }, 400);
  if (!conn.credentials_encrypted) return json({ error: "Not connected (missing credentials)." }, 400);

  const creds = await decryptJson(GOOGLE_STATE_SECRET, String(conn.credentials_encrypted));
  const accessToken = String(creds.access_token || "");
  if (!accessToken) return json({ error: "Missing access token (reconnect)." }, 400);

  // List folders under parent
  const q = parentId === "root"
    ? "'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    : `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
  listUrl.searchParams.set("q", q);
  listUrl.searchParams.set("fields", "files(id,name)");
  listUrl.searchParams.set("pageSize", "100");
  listUrl.searchParams.set("orderBy", "name");

  const resp = await fetch(listUrl.toString(), {
    headers: { ...SECURITY_HEADERS, Authorization: `Bearer ${accessToken }` },
  });

  const js = await safeJson(resp);
  if (!resp.ok) {
    return json({ error: js?.error?.message || `Drive API error ${resp.status}` }, 400);
  }

  return json({ ok: true, folders: js?.files || [] });
});
