/**
 * notify — Email + in-app notification dispatcher
 *
 * POST body (single recipient):
 *   { recipient_id, type, content_id?, content_title?, actor_name?, note? }
 *
 * POST body (broadcast to role group):
 *   { company_id, notify_roles, type, content_id?, content_title?, actor_name?, note? }
 *
 * Notification types:
 *   content_submitted   → legal/compliance team: new item in queue
 *   content_approved    → submitter: their content was approved
 *   content_rejected    → submitter: their content was rejected
 *   changes_requested   → submitter: reviewer wants changes
 *
 * Env vars required:
 *   SUPABASE_URL              (auto-set by Supabase runtime)
 *   SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase runtime)
 *   RESEND_API_KEY            (set via: supabase secrets set RESEND_API_KEY=re_...)
 *   RESEND_FROM               (optional, defaults to onboarding@resend.dev for testing)
 *   APP_BASE_URL              (optional, e.g. https://app.criateuros.com)
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Security / CORS ───────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  ...SECURITY_HEADERS,
  "Content-Type": "application/json",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type NotificationType =
  | "content_submitted"
  | "content_approved"
  | "content_rejected"
  | "changes_requested";

interface NotifyPayload {
  // Single recipient
  recipient_id?: string;
  // OR broadcast
  company_id?: string;
  notify_roles?: string[];
  // Common fields
  type: NotificationType;
  content_id?: string;
  content_title?: string;
  actor_name?: string;
  note?: string;
}

interface ResolvedRecipient {
  user_id: string;
  email: string;
  email_enabled: boolean;
  full_name?: string;
}

// ── Email HTML builder ────────────────────────────────────────────────────────

function buildEmail(opts: {
  heading: string;
  body: string;
  cta?: { label: string; url: string };
  accentColor: string;
}): string {
  const { heading, body, cta, accentColor } = opts;
  const ctaBlock = cta?.url
    ? `<tr><td style="padding:24px 40px 0;text-align:center;">
         <a href="${cta.url}" style="display:inline-block;padding:12px 28px;background:${accentColor};color:#fff;font-family:-apple-system,sans-serif;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
           ${cta.label}
         </a>
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:${accentColor};padding:24px 40px;">
            <p style="margin:0;color:rgba(255,255,255,0.85);font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Criateur OS</p>
            <h1 style="margin:6px 0 0;color:#fff;font-size:22px;font-weight:700;line-height:1.3;">${heading}</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;color:#374151;font-size:15px;line-height:1.65;">
            ${body}
          </td>
        </tr>
        <!-- CTA -->
        ${ctaBlock}
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px 32px;border-top:1px solid #e5e7eb;margin-top:16px;">
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
              This notification was sent by Criateur OS, your pharmaceutical compliance operating system.
              You can manage your notification preferences in your account settings.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Template map ──────────────────────────────────────────────────────────────

function getTemplate(
  type: NotificationType,
  payload: NotifyPayload,
  appUrl: string
): { subject: string; html: string } {
  const title = payload.content_title || "your submission";
  const actor = payload.actor_name || "A team member";
  const note = payload.note;
  const noteBlock = note
    ? `<div style="margin-top:16px;padding:12px 16px;background:#f9fafb;border-left:3px solid #d1d5db;border-radius:0 6px 6px 0;">
         <p style="margin:0;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Reviewer note</p>
         <p style="margin:4px 0 0;font-size:14px;color:#374151;">${note}</p>
       </div>`
    : "";

  const templates: Record<
    NotificationType,
    { subject: string; html: string }
  > = {
    content_submitted: {
      subject: `New submission for review: "${payload.content_title || "Untitled"}"`,
      html: buildEmail({
        heading: "New Content Awaiting Review",
        body: `<p>A new submission has entered the compliance review queue and requires your attention.</p>
               <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                 <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:120px;">Title</td>
                     <td style="padding:8px 0;font-weight:600;">${title}</td></tr>
                 <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Submitted by</td>
                     <td style="padding:8px 0;">${actor}</td></tr>
               </table>
               <p>Please log in to review and process this submission at your earliest convenience.</p>`,
        cta: { label: "Open Review Queue →", url: appUrl },
        accentColor: "#2943D6",
      }),
    },
    content_approved: {
      subject: `✓ Approved: "${payload.content_title || "Your submission"}"`,
      html: buildEmail({
        heading: "Submission Approved",
        body: `<p>Your submission has been reviewed and approved by the compliance team.</p>
               <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                 <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:120px;">Title</td>
                     <td style="padding:8px 0;font-weight:600;">${title}</td></tr>
                 <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Reviewed by</td>
                     <td style="padding:8px 0;">${actor}</td></tr>
               </table>
               ${noteBlock}
               <p style="margin-top:20px;">Your content is cleared and ready for the next stage.</p>`,
        cta: { label: "View Submission →", url: appUrl },
        accentColor: "#059669",
      }),
    },
    content_rejected: {
      subject: `Action required: "${payload.content_title || "Your submission"}" was not approved`,
      html: buildEmail({
        heading: "Submission Not Approved",
        body: `<p>Your submission has been reviewed. Unfortunately, it could not be approved at this time.</p>
               <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                 <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:120px;">Title</td>
                     <td style="padding:8px 0;font-weight:600;">${title}</td></tr>
                 <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Reviewed by</td>
                     <td style="padding:8px 0;">${actor}</td></tr>
               </table>
               ${noteBlock}
               <p style="margin-top:20px;">Please log in to review the feedback in full.</p>`,
        cta: { label: "View Feedback →", url: appUrl },
        accentColor: "#dc2626",
      }),
    },
    changes_requested: {
      subject: `Changes requested on: "${payload.content_title || "your submission"}"`,
      html: buildEmail({
        heading: "Changes Requested",
        body: `<p>Your reviewer has requested changes before your submission can be approved.</p>
               <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                 <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:120px;">Title</td>
                     <td style="padding:8px 0;font-weight:600;">${title}</td></tr>
                 <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Reviewed by</td>
                     <td style="padding:8px 0;">${actor}</td></tr>
               </table>
               ${noteBlock}
               <p style="margin-top:20px;">Please log in to address the requested changes and resubmit.</p>`,
        cta: { label: "View & Revise →", url: appUrl },
        accentColor: "#d97706",
      }),
    },
  };

  return templates[type];
}

// ── In-app message builder ────────────────────────────────────────────────────

function getInAppMessage(
  type: NotificationType,
  payload: NotifyPayload
): string {
  const title = payload.content_title || "your submission";
  const actor = payload.actor_name || "The compliance team";
  switch (type) {
    case "content_submitted":
      return `New submission "${title}" is ready for your review.`;
    case "content_approved":
      return `"${title}" was approved by ${actor}.`;
    case "content_rejected":
      return `"${title}" was not approved. ${payload.note ? `Note: ${payload.note}` : "See feedback for details."}`;
    case "changes_requested":
      return `Changes requested on "${title}". ${payload.note ? `Note: ${payload.note}` : "See review for details."}`;
    default:
      return `You have a new notification regarding "${title}".`;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const resendFrom =
    Deno.env.get("RESEND_FROM") ?? "Criateur OS <onboarding@resend.dev>";
  const appUrl =
    Deno.env.get("APP_BASE_URL") ?? "https://app.criateuros.com";

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase config" }),
      { status: 500, headers: JSON_HEADERS }
    );
  }

  let payload: NotifyPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  if (!payload.type) {
    return new Response(
      JSON.stringify({ error: "Missing required field: type" }),
      { status: 400, headers: JSON_HEADERS }
    );
  }

  // Use service-role client (bypasses RLS, can read profiles + auth.users)
  const adminClient = createClient(supabaseUrl, serviceKey);

  // ── 1. Resolve recipient list ─────────────────────────────────────────────

  const recipientIds: string[] = [];

  if (payload.recipient_id) {
    recipientIds.push(payload.recipient_id);
  } else if (payload.company_id && payload.notify_roles?.length) {
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id")
      .eq("company_id", payload.company_id)
      .in("role", payload.notify_roles);

    (profiles ?? []).forEach((p: any) => recipientIds.push(p.id));
  }

  if (recipientIds.length === 0) {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "No recipients resolved — nothing to send",
      }),
      { headers: JSON_HEADERS }
    );
  }

  // ── 2. Resolve recipients with email + prefs ──────────────────────────────

  const resolved: ResolvedRecipient[] = [];

  for (const uid of recipientIds) {
    // Get email via admin API
    const { data: userData } = await adminClient.auth.admin.getUserById(uid);
    const email = userData?.user?.email;
    if (!email) continue;

    // Check profile_settings for email preference (gracefully handle missing row)
    const { data: settings } = await adminClient
      .from("profile_settings")
      .select("email_enabled, toggles")
      .eq("user_id", uid)
      .maybeSingle();

    // Default: email enabled if no settings row
    const emailEnabled = settings?.email_enabled ?? true;

    // Check per-type toggle
    const toggles = (settings?.toggles as Record<string, boolean>) ?? {};
    let toggleEnabled = true;
    if (
      payload.type === "content_approved" ||
      payload.type === "content_rejected" ||
      payload.type === "changes_requested"
    ) {
      toggleEnabled = toggles["approvals_rejections"] ?? true;
    } else if (payload.type === "content_submitted") {
      toggleEnabled = toggles["status_changes"] ?? true;
    }

    const { data: profileData } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("id", uid)
      .maybeSingle();

    resolved.push({
      user_id: uid,
      email,
      email_enabled: emailEnabled && toggleEnabled,
      full_name: profileData?.full_name ?? undefined,
    });
  }

  // ── 3. Send notifications ─────────────────────────────────────────────────

  const template = getTemplate(payload.type, payload, appUrl);
  const inAppMsg = getInAppMessage(payload.type, payload);

  const results: Array<{
    user_id: string;
    email_sent: boolean;
    in_app_written: boolean;
    error?: string;
  }> = [];

  for (const recipient of resolved) {
    let emailSent = false;
    let inAppWritten = false;
    let errorMsg: string | undefined;

    // Write in-app notification (always, regardless of email pref)
    try {
      const { error: insertErr } = await adminClient
        .from("notifications")
        .insert({
          recipient_id: recipient.user_id,
          user_id: payload.recipient_id ?? null,
          type: payload.type,
          content_id: payload.content_id ?? null,
          message: inAppMsg,
        });

      if (!insertErr) inAppWritten = true;
    } catch (err: any) {
      errorMsg = `in-app write failed: ${err.message}`;
    }

    // Send email if enabled and Resend key is configured
    if (recipient.email_enabled && resendKey) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [recipient.email],
            subject: template.subject,
            html: template.html,
          }),
        });

        if (emailRes.ok) {
          emailSent = true;
        } else {
          const body = await emailRes.text();
          errorMsg = `Resend error ${emailRes.status}: ${body}`;
        }
      } catch (err: any) {
        errorMsg = `email send failed: ${err.message}`;
      }
    }

    results.push({
      user_id: recipient.user_id,
      email_sent: emailSent,
      in_app_written: inAppWritten,
      ...(errorMsg ? { error: errorMsg } : {}),
    });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: JSON_HEADERS,
  });
});
