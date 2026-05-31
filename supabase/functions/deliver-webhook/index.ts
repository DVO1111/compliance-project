/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


type OutboxRow = {
  id: string;
  company_id: string;
  content_id: string;
  event_type: string;
  payload: unknown;
  status: "queued" | "processing" | "delivered" | "failed";
  error: string | null;
  created_at: string;
  delivered_at: string | null;
};

type ConnectionRow = {
  id: string;
  company_id: string;
  provider_id: string;
  display_name: string;
  status: string;
  credentials_encrypted: string | null;
  config: Record<string, unknown>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, "content-type": "application/json" },
  });
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

// HMAC-SHA256 signature (hex)
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

function slackTextFromEvent(eventType: string, payload: any) {
  const title = payload?.title ?? payload?.payload?.title ?? "";
  const msg = payload?.payload?.message ?? payload?.message ?? "";
  const parts = [
    `*ComplianceHub* — ${eventType}`,
    title ? `*Title:* ${title}` : "",
    msg ? `*Message:* ${msg}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

Deno.serve(async (req) => {
  // Protect dispatcher endpoint
  const dispatcherSecret = Deno.env.get("DISPATCHER_SECRET") || "";
  const headerSecret = req.headers.get("x-dispatcher-secret") || "";
  if (!dispatcherSecret) return json({ error: "Missing DISPATCHER_SECRET in function env." }, 500);
  if (headerSecret !== dispatcherSecret) return json({ error: "Unauthorized" }, 401);

  const SB_URL = Deno.env.get("SB_URL") || Deno.env.get("SUPABASE_URL") || "";
  const SB_SERVICE_ROLE_KEY =
    Deno.env.get("SB_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const SLACK_STATE_SECRET = Deno.env.get("SLACK_STATE_SECRET") || "";
  if (!SB_URL || !SB_SERVICE_ROLE_KEY) return json({ error: "Missing SB_URL / SB_SERVICE_ROLE_KEY." }, 500);

  const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "25"), 100);

  // 1) Load queued rows
  const { data: queued, error: qErr } = await supabase
    .from("publish_outbox")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (qErr) return json({ error: qErr.message }, 500);

  const rows = (queued || []) as OutboxRow[];
  if (rows.length === 0) return json({ ok: true, processed: 0, message: "No queued events." });

  const ids = rows.map((r) => r.id);

  // 2) Claim rows
  const { data: claimed, error: cErr } = await supabase
    .from("publish_outbox")
    .update({ status: "processing", error: null })
    .in("id", ids)
    .eq("status", "queued")
    .select("*");
  if (cErr) return json({ error: cErr.message }, 500);

  const claimedRows = (claimed || []) as OutboxRow[];
  if (claimedRows.length === 0) return json({ ok: true, processed: 0, message: "Nothing claimed (race)." });

  let delivered = 0;
  let failed = 0;

  for (const row of claimedRows) {
    // Load active connections for company
    const { data: conns, error: iErr } = await supabase
      .from("integration_connections")
      .select("id, company_id, provider_id, display_name, status, credentials_encrypted, config")
      .eq("company_id", row.company_id)
      .eq("status", "active")
      .in("provider_id", ["webhook", "slack", "microsoft_teams", "asana", "monday"]);

    if (iErr) {
      failed++;
      await supabase.from("publish_outbox").update({ status: "failed", error: `Connections query failed: ${iErr.message}` }).eq("id", row.id);
      continue;
    }

    const dests = (conns || []) as ConnectionRow[];
    if (dests.length === 0) {
      failed++;
      await supabase
        .from("publish_outbox")
        .update({ status: "failed", error: "No active destinations for this company." })
        .eq("id", row.id);
      continue;
    }

    const eventBody = {
      id: row.id,
      event_type: row.event_type,
      company_id: row.company_id,
      content_id: row.content_id,
      created_at: row.created_at,
      payload: row.payload,
    };

    const bodyStr = JSON.stringify(eventBody);
    const timestamp = new Date().toISOString();

    let allOk = true;
    let lastErr = "";

    for (const dest of dests) {
      try {
        const baseHeaders: Record<string, string> = {
          "content-type": "application/json",
          "x-company-id": row.company_id,
          "x-company-timestamp": timestamp,
          "x-criateur-event": row.event_type,
          "x-criateur-event-id": row.id,
          "x-criateur-company-id": row.company_id,
          "x-criateur-timestamp": timestamp,
        };

        if (dest.provider_id === "webhook") {
          const webhookUrl = String(dest.config?.webhook_url || "");
          if (!webhookUrl) throw new Error("Missing webhook_url");
          const secret = dest.config?.webhook_secret ? String(dest.config.webhook_secret) : "";

          const headers = { ...baseHeaders };
          if (secret) {
            headers["x-company-signature"] = await hmacSha256Hex(secret, `${row.company_id}.${timestamp}.${bodyStr}`);
            headers["x-criateur-signature"] = await hmacSha256Hex(secret, `${timestamp}.${bodyStr}`);
          }

          const res = await fetch(webhookUrl, { method: "POST", headers, body: bodyStr });
          if (!res.ok) {
            allOk = false;
            lastErr = `Webhook failed (${res.status}) ${(await safeText(res)).slice(0, 500)}`;
          }
        }

        if (dest.provider_id === "microsoft_teams") {
          const webhookMap = (dest.config?.webhook_map as Record<string, string> | undefined) || {};
          const webhookUrl =
            String(webhookMap[row.event_type] || dest.config?.default_webhook_url || dest.config?.webhook_url || "");
          if (!webhookUrl) throw new Error("Missing Teams webhook_url");

          // Adaptive Card payload (rich)
          const title = (eventBody.payload as any)?.title || row.event_type;
          const card = {
            type: "message",
            attachments: [
              {
                contentType: "application/vnd.microsoft.card.adaptive",
                content: {
                  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                  type: "AdaptiveCard",
                  version: "1.4",
                  body: [
                    { type: "TextBlock", text: "ComplianceHub", weight: "Bolder", size: "Medium" },
                    { type: "TextBlock", text: row.event_type, weight: "Bolder", wrap: true },
                    { type: "TextBlock", text: String(title), wrap: true, spacing: "Small" },
                    { type: "TextBlock", text: `Content ID: ${row.content_id}`, isSubtle: true, wrap: true, spacing: "Small" },
                  ],
                },
              },
            ],
          };

          const res = await fetch(webhookUrl, { method: "POST", headers: { ...baseHeaders, ...SECURITY_HEADERS }, body: JSON.stringify(card) });
          if (!res.ok) {
            allOk = false;
            lastErr = `Teams webhook failed (${res.status}) ${(await safeText(res)).slice(0, 500)}`;
          }
        }

        if (dest.provider_id === "slack") {
          const mode = String(dest.config?.auth_mode || "webhook");

          // Webhook mode
          if (mode !== "oauth") {
            const webhookUrl = String(dest.config?.webhook_url || "");
            if (!webhookUrl) throw new Error("Missing Slack webhook_url");
            const msg = { text: slackTextFromEvent(row.event_type, eventBody) };
            const res = await fetch(webhookUrl, { method: "POST", headers: { ...baseHeaders, ...SECURITY_HEADERS }, body: JSON.stringify(msg) });
            if (!res.ok) {
              allOk = false;
              lastErr = `Slack webhook failed (${res.status}) ${(await safeText(res)).slice(0, 500)}`;
            }
          }

          // OAuth mode
          if (mode === "oauth") {
            if (!SLACK_STATE_SECRET) throw new Error("Missing SLACK_STATE_SECRET in function env");
            if (!dest.credentials_encrypted) throw new Error("Missing Slack credentials (reconnect Slack)");

            let tokens: any = {};
            try {
              tokens = await decryptJson(SLACK_STATE_SECRET, String(dest.credentials_encrypted));
            } catch (e) {
              throw new Error(`Could not decrypt Slack credentials (reconnect Slack): ${(e as any)?.message ?? e}`);
            }

            const botToken = tokens?.access_token as string | undefined;
            if (!botToken) throw new Error("Missing Slack bot token (reconnect Slack)");

            const channelMap = (dest.config?.channel_map as Record<string, string> | undefined) || {};
            const channelId = channelMap[row.event_type] || String(dest.config?.default_channel_id || "");
            if (!channelId) throw new Error("No Slack channel selected (set default channel)");

            const text = slackTextFromEvent(row.event_type, eventBody);
            const res = await fetch("https://slack.com/api/chat.postMessage", {
              method: "POST",
              headers: { ...SECURITY_HEADERS, ...baseHeaders,
                Authorization: `Bearer ${botToken }`,
              },
              body: JSON.stringify({ channel: channelId, text }),
            });

            const respJson = await res.json().catch(() => ({}));
            if (!res.ok || respJson?.ok === false) {
              allOk = false;
              lastErr = `Slack API failed: ${respJson?.error || res.status}`;
            }
          }
        }

        if (dest.provider_id === "asana") {
          const token = String(dest.config?.personal_access_token || "");
          const workspace = String(dest.config?.workspace_gid || "");
          if (!token) throw new Error("Missing Asana personal_access_token");
          if (!workspace) throw new Error("Missing Asana workspace_gid");

          const createOnSubs = dest.config?.create_on_submissions !== false;
          const createOnApprovals = dest.config?.create_on_approvals !== false;
          const createOnReg = dest.config?.create_on_regulatory !== false;

          if (
            (row.event_type.startsWith("submission.") && !createOnSubs) ||
            ((row.event_type.startsWith("approval.") || row.event_type.startsWith("rejection.")) && !createOnApprovals) ||
            (row.event_type.startsWith("regulatory.") && !createOnReg)
          ) {
            continue;
          }

          const project = dest.config?.project_gid ? String(dest.config.project_gid) : undefined;
          const title = (eventBody.payload as any)?.title || row.event_type;
          const taskName = `[${row.event_type}] ${String(title)}`;
          const notes = `Company: ${row.company_id}\nContent: ${row.content_id}\nEvent: ${row.event_type}`;

          const asanaBody: any = { data: { name: taskName, notes, workspace } };
          if (project) asanaBody.data.projects = [project];

          const res = await fetch("https://app.asana.com/api/1.0/tasks", {
            method: "POST",
            headers: { ...SECURITY_HEADERS, ...baseHeaders,
              Authorization: `Bearer ${token }`,
            },
            body: JSON.stringify(asanaBody),
          });

          if (!res.ok) {
            allOk = false;
            lastErr = `Asana failed (${res.status}) ${(await safeText(res)).slice(0, 500)}`;
          }
        }

        if (dest.provider_id === "monday") {
          const token = String(dest.config?.api_token || "");
          const boardId = String(dest.config?.board_id || "");
          if (!token) throw new Error("Missing monday.com api_token");
          if (!boardId) throw new Error("Missing monday.com board_id");

          const createOnSubs = dest.config?.create_on_submissions !== false;
          const createOnApprovals = dest.config?.create_on_approvals !== false;
          const createOnReg = dest.config?.create_on_regulatory !== false;

          if (
            (row.event_type.startsWith("submission.") && !createOnSubs) ||
            ((row.event_type.startsWith("approval.") || row.event_type.startsWith("rejection.")) && !createOnApprovals) ||
            (row.event_type.startsWith("regulatory.") && !createOnReg)
          ) {
            continue;
          }

          const groupId = dest.config?.group_id ? String(dest.config.group_id) : undefined;
          const title = (eventBody.payload as any)?.title || row.event_type;
          const itemName = `[${row.event_type}] ${String(title)}`;
          const note = `Company: ${row.company_id} | Content: ${row.content_id} | Event: ${row.event_type}`;

          const mutation =
            "mutation ($board_id: Int!, $item_name: String!, $column_values: JSON!, $group_id: String) {" +
            " create_item(board_id: $board_id, group_id: $group_id, item_name: $item_name, column_values: $column_values) { id }" +
            "}";

          const variables: any = {
            board_id: Number(boardId),
            item_name: itemName,
            column_values: JSON.stringify({ text: note }),
          };
          if (groupId) variables.group_id = groupId;

          const res = await fetch("https://api.monday.com/v2", {
            method: "POST",
            headers: { ...SECURITY_HEADERS, ...baseHeaders,
              Authorization: token, },
            body: JSON.stringify({ query: mutation, variables }),
          });

          const respJson = await res.json().catch(() => ({}));
          if (!res.ok || respJson?.errors) {
            allOk = false;
            lastErr = `monday.com failed: ${respJson?.errors?.[0]?.message || res.status}`;
          }
        }
      } catch (e) {
        allOk = false;
        lastErr = `Delivery error: ${(e as any)?.message ?? String(e)}`;
      }
    }

    if (allOk) {
      delivered++;
      await supabase.from("publish_outbox").update({ status: "delivered", delivered_at: new Date().toISOString(), error: null }).eq("id", row.id);
    } else {
      failed++;
      await supabase.from("publish_outbox").update({ status: "failed", error: lastErr }).eq("id", row.id);
    }
  }

  return json({ ok: true, claimed: claimedRows.length, delivered, failed });
});
