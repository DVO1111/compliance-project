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

Deno.serve(async (req) => {
  const SB_URL = Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL") || "";
  const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const SLACK_STATE_SECRET = Deno.env.get("SLACK_STATE_SECRET") || "";
  const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://app.criateur.com";

  if (!SB_URL || !SB_SERVICE_ROLE_KEY) return json({ error: "Missing SB_URL / SB_SERVICE_ROLE_KEY." }, 500);
  if (!SLACK_STATE_SECRET) return json({ error: "Missing SLACK_STATE_SECRET." }, 500);

  const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const companyId = String(body.company_id || "");
  const connectionId = String(body.connection_id || "");
  const channelIds: string[] = Array.isArray(body.channel_ids) ? body.channel_ids : [];
  const messageText = String(body.message_text || "");
  const senderName = String(body.sender_name || "Unknown");
  const companyName = String(body.company_name || "");
  const internalMessageId = String(body.internal_message_id || "");

  // Auth check
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return json({ error: "Missing Authorization" }, 401);
  if (!companyId || !connectionId || !channelIds.length) {
    return json({ error: "Missing required fields: company_id, connection_id, channel_ids" }, 400);
  }

  // Verify user belongs to company
  const { data: userData } = await supabase.auth.getUser(jwt);
  if (!userData?.user) return json({ error: "Unauthorized" }, 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile || profile.company_id !== companyId) return json({ error: "Wrong company" }, 401);

  // Get Slack connection + decrypt token
  const { data: conn } = await supabase
    .from("integration_connections")
    .select("id, credentials_encrypted, config")
    .eq("id", connectionId)
    .eq("company_id", companyId)
    .eq("provider_id", "slack")
    .maybeSingle();

  if (!conn) return json({ error: "Slack connection not found" }, 404);

  let creds: any = {};
  try {
    creds = conn.credentials_encrypted
      ? await decryptJson(SLACK_STATE_SECRET, String(conn.credentials_encrypted))
      : {};
  } catch (e) {
    return json({ error: `Decrypt failed: ${(e as any)?.message}` }, 400);
  }

  const botToken = creds?.access_token;
  if (!botToken) return json({ error: "Missing bot token (reconnect Slack)" }, 400);

  // Deep link back to the internal message
  const deepLink = `${APP_BASE_URL}/?page=team-chat&msg=${internalMessageId}`;

  // Compose message blocks (Slack Block Kit)
  const blocks = [
    {
      type: "section",
      text: { type: "mrkdwn", text: messageText },
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📨 Sent from *Criateur Compliance* • ${senderName} • ${companyName}  |  <${deepLink}|View in app>`,
        },
      ],
    },
  ];

  // Post to each channel
  const results: { channel_id: string; ok: boolean; error?: string }[] = [];

  for (const chId of channelIds) {
    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { ...SECURITY_HEADERS, Authorization: `Bearer ${botToken }`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ channel: chId, blocks, text: messageText }),
      });
      const data = await res.json();
      results.push({ channel_id: chId, ok: Boolean(data?.ok), error: data?.error });
    } catch (e) {
      results.push({ channel_id: chId, ok: false, error: (e as any)?.message });
    }
  }

  // Log to integration_logs
  try {
    await supabase.from("integration_logs").insert({
      connection_id: connectionId,
      event_type: "chat_relay",
      direction: "outbound",
      payload: { channel_ids: channelIds, message_text: messageText, results },
      status: results.every(r => r.ok) ? "success" : "partial_failure",
    } as any);
  } catch { /* non-fatal */ }

  return json({ ok: true, results });
});
