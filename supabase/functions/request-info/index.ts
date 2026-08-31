/**
 * request-info — public lead capture for the marketing site
 *
 * Every "Request Info" / "Join the Waitlist" submission on criateur.com posts
 * here. The function does two things with one payload:
 *
 *   1. stores the lead in public.waitlist_signups
 *   2. emails it to the partnerships inbox over Hostinger SMTP
 *
 * Both are attempted independently and the response reports each, because
 * either one alone still means a human has the lead. The call is only a
 * failure when BOTH fail — that is the one case where telling the visitor
 * "we've received your request" would be a lie.
 *
 * Why a function rather than the browser: the SMTP password must never reach
 * frontend code, and the insert is done with the service role so a lead is
 * still captured if the anon insert policy is ever tightened.
 *
 * Public by design — visitors are anonymous, so this is declared
 * verify_jwt = false in config.toml. It is the only unauthenticated function
 * in the project, hence the validation and per-IP rate limit below.
 *
 * ── On the SMTP port ──────────────────────────────────────────────────────
 * Supabase Edge Functions block outbound connections on ports 25 and 587.
 * Port 465 (implicit TLS, "SMTPS") is the one that works, which is why
 * SMTP_PORT is 465 and `secure` is true. Do not "fix" a delivery problem by
 * moving to 587 — that port cannot connect from here at all.
 *
 * nodemailer is used rather than a Deno SMTP library because it is what
 * Supabase's own send-email-smtp example ships.
 *
 * Env vars (set with: supabase secrets set KEY=value):
 *   SUPABASE_URL              (auto-set by the Supabase runtime)
 *   SUPABASE_SERVICE_ROLE_KEY (auto-set by the Supabase runtime)
 *   SMTP_HOST                 smtp.hostinger.com
 *   SMTP_PORT                 465
 *   SMTP_USERNAME             partnerships@criateur.com
 *   SMTP_PASSWORD             the mailbox password — secret only, never in git
 *   LEADS_TO                  partnerships@criateur.com
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@^9";

const ALLOWED_ORIGINS = [
  "https://criateur.com",
  "https://www.criateur.com",
];

function corsHeaders(origin: string | null) {
  // This endpoint stores and emails; it returns no data worth stealing, so
  // the origin check is hygiene rather than a security boundary.
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

/** Mirrors the source CHECK constraint on the table. */
const SOURCES = ["home", "platform", "who-its-for", "about", "contact"] as const;
type Source = (typeof SOURCES)[number];

interface Payload {
  source: Source;
  intent?: string | null;
  email: string;
  fullName?: string | null;
  company?: string | null;
  role?: string | null;
  industry?: string | null;
  notes?: string | null;
}

const MAX_FIELD = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, MAX_FIELD);
  return t ? t : null;
};

/** Crude in-memory throttle. Edge instances are recycled and not shared, so
 *  this stops a single bored visitor hammering the form, not a distributed
 *  flood — Supabase's own platform limits handle that. */
const HITS = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  HITS.set(ip, recent);
  if (HITS.size > 5000) HITS.clear();
  return recent.length > MAX_PER_WINDOW;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );

function emailBody(p: Payload, storedNote: string) {
  const rows: [string, string | null | undefined][] = [
    ["Full name", p.fullName],
    ["Email", p.email],
    ["Company", p.company],
    ["Role", p.role],
    ["Industry", p.industry],
    ["Notes", p.notes],
    ["Page", p.source],
    ["Button", p.intent],
  ];
  const html = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#666;vertical-align:top;white-space:nowrap">${k}</td>` +
        `<td style="padding:6px 0;color:#111">${escapeHtml(String(v))}</td></tr>`
    )
    .join("");

  const text = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  return {
    html:
      `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif">` +
      `<h2 style="margin:0 0 4px">New Request Info submission</h2>` +
      `<p style="margin:0 0 18px;color:#666">From the ${escapeHtml(p.source)} page on criateur.com</p>` +
      `<table style="border-collapse:collapse;font-size:14px">${html}</table>` +
      `<p style="margin:22px 0 0;color:#999;font-size:12px">${escapeHtml(storedNote)}</p></div>`,
    text: `New Request Info submission\n\n${text}\n\n${storedNote}`,
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = { ...corsHeaders(origin), ...SECURITY_HEADERS };
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return json({ error: "rate_limited" }, 429);

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = clean(raw.email);
  if (!email || !EMAIL_RE.test(email)) {
    return json({ error: "invalid_email" }, 400);
  }
  const source = SOURCES.includes(raw.source as Source)
    ? (raw.source as Source)
    : "home";

  const payload: Payload = {
    source,
    intent: clean(raw.intent),
    email,
    fullName: clean(raw.fullName),
    company: clean(raw.company),
    role: clean(raw.role),
    industry: clean(raw.industry),
    notes: clean(raw.notes),
  };

  // ── 1. store ──────────────────────────────────────────────────────────────
  let stored = false;
  let storeError: string | null = null;
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { error } = await db.from("waitlist_signups").insert({
      source: payload.source,
      intent: payload.intent,
      email: payload.email,
      full_name: payload.fullName,
      company: payload.company,
      role: payload.role,
      industry: payload.industry,
      notes: payload.notes,
    });
    if (error) storeError = `${error.code ?? ""} ${error.message}`.trim();
    else stored = true;
  } catch (err) {
    storeError = String(err);
  }
  if (storeError) console.error("[request-info] store failed", storeError);

  // ── 2. email over Hostinger SMTP ──────────────────────────────────────────
  const host = Deno.env.get("SMTP_HOST") ?? "";
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const user = Deno.env.get("SMTP_USERNAME") ?? "";
  const pass = Deno.env.get("SMTP_PASSWORD") ?? "";
  const to = Deno.env.get("LEADS_TO") ?? "partnerships@criateur.com";

  let emailed = false;
  let emailError: string | null = null;

  const missing = [
    !host && "SMTP_HOST",
    !user && "SMTP_USERNAME",
    !pass && "SMTP_PASSWORD",
  ].filter(Boolean);

  if (missing.length) {
    emailError = `missing secrets: ${missing.join(", ")}`;
  } else {
    const storedNote = stored
      ? "This lead is also stored in waitlist_signups."
      : "NOT stored in the database — this email is the only copy. " +
        (storeError ?? "");
    const body = emailBody(payload, storedNote);
    try {
      const transport = nodemailer.createTransport({
        host,
        port,
        // 465 is implicit TLS. Anything else would need STARTTLS on 587,
        // which Edge Functions cannot reach.
        secure: port === 465,
        auth: { user, pass },
        // Without these a hung SMTP dialogue would hold the request open
        // until the platform kills it, and the visitor would sit spinning.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });

      await transport.sendMail({
        // Hostinger only accepts a From that matches the authenticated
        // mailbox, so this is SMTP_USERNAME with a display name — not the
        // visitor's address, which would be rejected as spoofing.
        from: `Criateur Website <${user}>`,
        to,
        // Hitting Reply in Hostinger goes to the visitor, not to ourselves.
        replyTo: payload.email,
        subject: `Request Info — ${payload.company ?? payload.email}`,
        html: body.html,
        text: body.text,
      });
      emailed = true;
      transport.close();
    } catch (err) {
      emailError = String(err);
    }
  }
  if (emailError) console.error("[request-info] email failed", emailError);

  // A lead that reached either the table or the inbox has been received.
  // Only when neither worked is the visitor told it failed.
  if (!stored && !emailed) {
    return json({ ok: false, stored, emailed, error: "delivery_failed" }, 502);
  }
  return json({ ok: true, stored, emailed }, 200);
});
