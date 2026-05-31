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

type Channel = { id: string; name: string; is_private: boolean; is_member: boolean };

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

async function getUserAndCompany(supabase: any, jwt: string, companyId: string) {
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return { ok: false as const, error: "Unauthorized" };
  const userId = userData.user.id;

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, company_id")
    .eq("id", userId)
    .maybeSingle();

  if (pErr || !profile) return { ok: false as const, error: "Profile not found" };
  if (profile.company_id !== companyId) return { ok: false as const, error: "Wrong company" };
  return { ok: true as const };
}

async function slackApi(token: string, url: string) {
  const res = await fetch(url, {
    headers: { ...SECURITY_HEADERS, Authorization: `Bearer ${token }` },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function slackPost(token: string, url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...SECURITY_HEADERS, Authorization: `Bearer ${token }`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

Deno.serve(async (req) => {
  const SB_URL = Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL") || "";
  const SB_SERVICE_ROLE_KEY =
    Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const SLACK_STATE_SECRET = Deno.env.get("SLACK_STATE_SECRET") || "";
  if (!SB_URL || !SB_SERVICE_ROLE_KEY) return json({ error: "Missing SB_URL / SB_SERVICE_ROLE_KEY." }, 500);
  if (!SLACK_STATE_SECRET) return json({ error: "Missing SLACK_STATE_SECRET." }, 500);

  const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = String(body.action || "");
  const companyId = String(body.company_id || "");
  const connectionId = String(body.connection_id || "");
  const channelId = String(body.channel_id || "");

  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return json({ error: "Missing Authorization" }, 401);
  if (!companyId) return json({ error: "Missing company_id" }, 400);

  const check = await getUserAndCompany(supabase, jwt, companyId);
  if (!check.ok) return json({ error: check.error }, 401);

  if (action !== "list_channels" && action !== "join_channel" && action !== "botinfo") return json({ error: "Unsupported action" }, 400);
  if (!connectionId) return json({ error: "Missing connection_id" }, 400);

  const { data: conn, error: cErr } = await supabase
    .from("integration_connections")
    .select("id, company_id, provider_id, status, credentials_encrypted, config")
    .eq("id", connectionId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (cErr || !conn) return json({ error: "Slack connection not found" }, 404);
  if (conn.provider_id !== "slack") return json({ error: "Not a Slack connection" }, 400);
  if (String(conn.config?.auth_mode || "webhook") !== "oauth") {
    return json({ error: "Slack connection is not OAuth mode" }, 400);
  }

  let creds: any = {};
  try {
    creds = conn.credentials_encrypted ? await decryptJson(SLACK_STATE_SECRET, String(conn.credentials_encrypted)) : {};
  } catch (e) {
    return json({ error: `Could not decrypt Slack credentials. Reconnect Slack. (${(e as any)?.message ?? e})` }, 400);
  }

  const botToken = creds?.access_token;
  const botUserId = creds?.bot_user_id;
  if (!botToken) return json({ error: "Missing bot token (reconnect Slack)" }, 400);

  if (action === "botinfo") {
  const { data } = await slackApi(botToken, "https://slack.com/api/auth.test");
  if (!data?.ok) return json({ ok: false, error: data?.error || "unknown" }, 400);
  return json({
    ok: true,
    bot_user_id: data?.user_id || botUserId || null,
    bot_user_name: data?.user || null,
    team_id: data?.team_id || null,
    team_name: data?.team || null,
  });
}

  if (action === "join_channel") {
    if (!channelId) return json({ error: "Missing channel_id" }, 400);

    // Bots can join public channels with channels:join.
    // Private channels cannot be joined unless the bot is invited.
    const { data } = await slackPost(botToken, "https://slack.com/api/conversations.join", { channel: channelId });
    if (!data?.ok) {
      const err = String(data?.error || "unknown");
      if (err === "method_not_supported_for_channel_type" || err === "not_in_channel") {
        return json({
          ok: false,
          error: err,
          message:
            "If this is a private channel, Slack requires the bot/app to be invited first. In Slack, run: /invite @your-app in that channel, then refresh the channel list.",
          bot_user_id: botUserId,
        }, 400);
      }
      return json({ ok: false, error: err }, 400);
    }
    return json({ ok: true, joined: true });
  }

  // List public + private channels.
  // Private channels will only appear if the bot has groups:read and is already a member.
  const channels: Channel[] = [];
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams({
      limit: "200",
      exclude_archived: "true",
      types: "public_channel,private_channel",
    });
    if (cursor) qs.set("cursor", cursor);

    const { data } = await slackApi(botToken, `https://slack.com/api/conversations.list?${qs.toString()}`);
    if (!data?.ok) return json({ error: `Slack error: ${data?.error || "unknown"}` }, 400);

    for (const c of (data.channels || []) as any[]) {
      if (!c?.id || !c?.name) continue;
      channels.push({
        id: c.id,
        name: c.name,
        is_private: Boolean(c.is_private),
        is_member: Boolean(c.is_member),
      });
    }

    cursor = data?.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }

  channels.sort((a, b) => a.name.localeCompare(b.name));
  return json({ ok: true, channels });
});
