/**
 * audit-prep-assembler
 *
 * Assembles an AI-powered audit evidence package for a given session.
 * Steps:
 *   1. Mark session as 'assembling'
 *   2. Pull evidence from batch_records, capa_records, grc_control_snapshots,
 *      licenses, sop_documents, policies, regulatory_obligations, risks, change_controls
 *   3. Insert all evidence as audit_prep_items
 *   4. Call Claude to generate an inspection readiness assessment
 *   5. Mark session as 'ready' with the AI summary and evidence counts
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-set)
 *   ANTHROPIC_API_KEY (set via: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...)
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

// ── Evidence counts shape ─────────────────────────────────────────────────────

interface EvidenceCounts {
  batch_records?:   { total: number; released: number; rejected: number; pending: number };
  capas?:           { total: number; open: number; closed: number; overdue: number };
  controls?:        { total: number; compliant: number; non_compliant: number; partial: number };
  certificates?:    { total: number; active: number; expiring_soon: number; expired: number };
  sops?:            { total: number; effective: number; in_review: number };
  policies?:        { total: number; published: number; approved: number };
  obligations?:     { total: number; completed: number; pending: number; overdue: number };
  risks?:           { total: number; open: number; mitigated: number; high: number };
  change_controls?: { total: number; approved: number; pending: number; regulatory: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPast(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function isExpiringSoon(dateStr: string | null, days = 90): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);
  return d > new Date() && d <= cutoff;
}

// ── Claude AI summary ─────────────────────────────────────────────────────────

async function generateAISummary(
  anthropicKey: string,
  session: Record<string, unknown>,
  counts: EvidenceCounts
): Promise<string> {
  const auditLabel =
    (session.audit_type as string ?? 'Internal').toUpperCase();

  const prompt = `You are a pharmaceutical compliance expert preparing an inspection readiness report.

Audit Details:
- Name: ${session.name}
- Type: ${auditLabel}
- Scheduled: ${session.scheduled_date ?? "TBD"}
- Inspector: ${session.inspector_name ?? "Unknown"} (${session.inspector_org ?? "—"})
- Scope: ${session.scope_notes ?? "Full facility audit"}

Evidence Assembled:
${JSON.stringify(counts, null, 2)}

Write a concise (300–400 word) Inspection Readiness Assessment that:
1. Opens with an overall readiness rating (Ready / Needs Attention / Not Ready) and a one-sentence rationale.
2. Summarises the key strengths in each evidence category.
3. Calls out any red flags (overdue CAPAs, non-compliant controls, expired/expiring licences, open high-priority risks, unresolved obligations).
4. Provides 3–5 specific action recommendations the team should address before the inspection date.
5. Closes with a brief statement of overall audit preparedness.

Write in a direct, professional tone. Use plain paragraphs — no markdown headers or bullet symbols (the output will be rendered as plain text in a report).`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("Anthropic error:", res.status, t);
      return `[AI summary unavailable — Anthropic API returned ${res.status}]`;
    }

    const json: any = await res.json();
    return json?.content?.[0]?.text ?? "[AI summary unavailable]";
  } catch (err: any) {
    console.error("Anthropic fetch failed:", err.message);
    return `[AI summary unavailable — ${err.message}]`;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: JSON_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase config" }), { status: 500, headers: JSON_HEADERS });
  }

  let body: { session_id?: string; company_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: JSON_HEADERS });
  }

  const { session_id, company_id } = body;
  if (!session_id || !company_id) {
    return new Response(JSON.stringify({ error: "session_id and company_id required" }), { status: 400, headers: JSON_HEADERS });
  }

  const db = createClient(supabaseUrl, serviceKey);

  // ── 1. Load session ──────────────────────────────────────────────────────
  const { data: session, error: sErr } = await db
    .from("audit_prep_sessions")
    .select("*")
    .eq("id", session_id)
    .eq("company_id", company_id)
    .single();

  if (sErr || !session) {
    return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, headers: JSON_HEADERS });
  }

  // ── 2. Mark assembling ───────────────────────────────────────────────────
  await db
    .from("audit_prep_sessions")
    .update({ status: "assembling", updated_at: new Date().toISOString() })
    .eq("id", session_id);

  // Delete previously assembled items (re-assembly scenario)
  await db.from("audit_prep_items").delete().eq("session_id", session_id);

  const counts: EvidenceCounts = {};
  const now = new Date().toISOString().slice(0, 10);
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const itemsToInsert: Record<string, unknown>[] = [];

  const addItem = (
    item_type: string,
    source_table: string,
    source_id: string | null,
    title: string,
    status: string | null,
    item_date: string | null,
    relevance_tag: string,
    description?: string,
    metadata?: Record<string, unknown>
  ) => {
    itemsToInsert.push({
      session_id,
      company_id,
      item_type,
      source_table,
      source_id,
      title,
      description: description ?? null,
      status,
      item_date,
      relevance_tag,
      metadata: metadata ?? {},
    });
  };

  // ── 3a. Batch records (last 2 years) ─────────────────────────────────────
  try {
    const { data: batches } = await db
      .from("batch_records")
      .select("id, batch_number, product_name, status, manufacturing_date, released_at")
      .eq("company_id", company_id)
      .gte("manufacturing_date", twoYearsAgo.toISOString().slice(0, 10))
      .order("manufacturing_date", { ascending: false })
      .limit(200);

    const bl = batches ?? [];
    counts.batch_records = {
      total: bl.length,
      released: bl.filter((b: any) => b.status === "released").length,
      rejected: bl.filter((b: any) => b.status === "rejected").length,
      pending: bl.filter((b: any) => !["released", "rejected", "archived"].includes(b.status)).length,
    };

    for (const b of bl as any[]) {
      const tag = b.status === "released" ? "released_batch" : b.status === "rejected" ? "rejected_batch" : "pending_batch";
      addItem("batch_record", "batch_records", b.id, `Batch ${b.batch_number} — ${b.product_name}`, b.status, b.manufacturing_date, tag, undefined, { released_at: b.released_at });
    }
  } catch { /* graceful skip */ }

  // ── 3b. CAPA records ──────────────────────────────────────────────────────
  try {
    const { data: capas } = await db
      .from("capa_records")
      .select("id, capa_number, title, source, priority, status, due_date, closed_at")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(150);

    const cl = capas ?? [];
    counts.capas = {
      total: cl.length,
      open: (cl as any[]).filter((c) => !["closed"].includes(c.status)).length,
      closed: (cl as any[]).filter((c) => c.status === "closed").length,
      overdue: (cl as any[]).filter((c) => c.status !== "closed" && c.due_date && isPast(c.due_date)).length,
    };

    for (const c of cl as any[]) {
      const isOverdue = c.status !== "closed" && isPast(c.due_date);
      const tag = c.status === "closed" ? "closed_capa" : isOverdue ? "overdue_capa" : "open_capa";
      addItem("capa", "capa_records", c.id, `${c.capa_number} — ${c.title}`, c.status, c.due_date ?? c.closed_at, tag, `Source: ${c.source} | Priority: ${c.priority}`);
    }
  } catch { /* graceful skip */ }

  // ── 3c. GRC control snapshots (latest per control) ─────────────────────
  try {
    const { data: snaps } = await db
      .from("grc_control_snapshots")
      .select("id, control_id, status, snapshot_date, notes, grc_controls(title, control_ref)")
      .eq("company_id", company_id)
      .order("snapshot_date", { ascending: false })
      .limit(300);

    // Deduplicate to latest snapshot per control
    const seen = new Set<string>();
    const latest: any[] = [];
    for (const s of (snaps ?? []) as any[]) {
      if (!seen.has(s.control_id)) {
        seen.add(s.control_id);
        latest.push(s);
      }
    }

    counts.controls = {
      total: latest.length,
      compliant: latest.filter((s) => s.status === "compliant").length,
      non_compliant: latest.filter((s) => s.status === "non_compliant").length,
      partial: latest.filter((s) => s.status === "partial").length,
    };

    for (const s of latest) {
      const ctrl = s.grc_controls as any;
      const label = ctrl?.title ?? ctrl?.control_ref ?? s.control_id;
      const tag = s.status === "compliant" ? "compliant_control" : s.status === "non_compliant" ? "non_compliant_control" : "partial_control";
      addItem("control", "grc_control_snapshots", s.id, `Control: ${label}`, s.status, s.snapshot_date?.slice(0, 10) ?? null, tag, s.notes ?? undefined);
    }
  } catch { /* graceful skip */ }

  // ── 3d. Licences / certificates ───────────────────────────────────────────
  try {
    const { data: lics } = await db
      .from("licenses")
      .select("id, product_name, nafdac_reg_number, expiry_date, issuing_authority, status, category")
      .eq("company_id", company_id)
      .order("expiry_date", { ascending: true });

    const ll = lics ?? [];
    counts.certificates = {
      total: ll.length,
      active: (ll as any[]).filter((l) => l.status === "active" && !isExpiringSoon(l.expiry_date) && !isPast(l.expiry_date)).length,
      expiring_soon: (ll as any[]).filter((l) => isExpiringSoon(l.expiry_date)).length,
      expired: (ll as any[]).filter((l) => isPast(l.expiry_date)).length,
    };

    for (const l of ll as any[]) {
      const expired = isPast(l.expiry_date);
      const expiring = isExpiringSoon(l.expiry_date);
      const tag = expired ? "expired_licence" : expiring ? "expiring_licence" : "active_licence";
      addItem("certificate", "licenses", l.id, `${l.product_name} (${l.nafdac_reg_number || l.category})`, l.status, l.expiry_date, tag, `Issuing authority: ${l.issuing_authority}`);
    }
  } catch { /* graceful skip */ }

  // ── 3e. SOP documents (effective and in_review) ───────────────────────────
  try {
    const { data: sops } = await db
      .from("sop_documents")
      .select("id, sop_number, title, category, status, effective_date, review_due_date")
      .eq("company_id", company_id)
      .in("status", ["effective", "approved", "in_review"])
      .order("effective_date", { ascending: false });

    const sl = sops ?? [];
    counts.sops = {
      total: sl.length,
      effective: (sl as any[]).filter((s) => ["effective", "approved"].includes(s.status)).length,
      in_review: (sl as any[]).filter((s) => s.status === "in_review").length,
    };

    for (const s of sl as any[]) {
      addItem("sop", "sop_documents", s.id, `${s.sop_number} — ${s.title}`, s.status, s.effective_date, s.status === "in_review" ? "sop_under_review" : "effective_sop", `Category: ${s.category}`);
    }
  } catch { /* graceful skip */ }

  // ── 3f. Policies (published/approved) ────────────────────────────────────
  try {
    const { data: pols } = await db
      .from("policies")
      .select("id, title, status, updated_at")
      .eq("company_id", company_id)
      .in("status", ["published", "approved", "active"])
      .order("updated_at", { ascending: false });

    const pl = pols ?? [];
    counts.policies = {
      total: pl.length,
      published: (pl as any[]).filter((p) => p.status === "published").length,
      approved: (pl as any[]).filter((p) => ["approved", "active"].includes(p.status)).length,
    };

    for (const p of pl as any[]) {
      addItem("policy", "policies", p.id, p.title, p.status, p.updated_at?.slice(0, 10) ?? null, "published_policy");
    }
  } catch { /* graceful skip */ }

  // ── 3g. Regulatory obligations ────────────────────────────────────────────
  try {
    const { data: obs } = await db
      .from("regulatory_obligations")
      .select("id, title, status, due_date, description")
      .eq("company_id", company_id)
      .order("due_date", { ascending: true })
      .limit(100);

    const ol = obs ?? [];
    counts.obligations = {
      total: ol.length,
      completed: (ol as any[]).filter((o) => ["completed", "na"].includes(o.status)).length,
      pending: (ol as any[]).filter((o) => ["pending", "in_progress"].includes(o.status) && !isPast(o.due_date)).length,
      overdue: (ol as any[]).filter((o) => !["completed", "na"].includes(o.status) && isPast(o.due_date)).length,
    };

    for (const o of ol as any[]) {
      const tag = ["completed", "na"].includes(o.status) ? "completed_obligation"
        : isPast(o.due_date) ? "overdue_obligation" : "pending_obligation";
      addItem("obligation", "regulatory_obligations", o.id, o.title, o.status, o.due_date, tag, o.description ?? undefined);
    }
  } catch { /* graceful skip */ }

  // ── 3h. Risks ─────────────────────────────────────────────────────────────
  try {
    const { data: risks } = await db
      .from("risks")
      .select("id, title, status, risk_level, created_at")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(100);

    const rl = risks ?? [];
    counts.risks = {
      total: rl.length,
      open: (rl as any[]).filter((r) => !["mitigated", "closed", "accepted"].includes(r.status)).length,
      mitigated: (rl as any[]).filter((r) => ["mitigated", "closed"].includes(r.status)).length,
      high: (rl as any[]).filter((r) => ["high", "critical"].includes(r.risk_level ?? "")).length,
    };

    for (const r of rl as any[]) {
      const tag = ["mitigated", "closed"].includes(r.status) ? "mitigated_risk" : ["high", "critical"].includes(r.risk_level ?? "") ? "high_risk" : "open_risk";
      addItem("risk", "risks", r.id, r.title, r.status, r.created_at?.slice(0, 10) ?? null, tag);
    }
  } catch { /* graceful skip */ }

  // ── 3i. Change controls (approved / regulatory impact) ───────────────────
  try {
    const { data: ccs } = await db
      .from("change_controls")
      .select("id, change_number, title, change_type, status, regulatory_impact, effective_date")
      .eq("company_id", company_id)
      .in("status", ["approved", "implementing", "verification", "closed", "pending_approval"])
      .order("effective_date", { ascending: false })
      .limit(100);

    const ccl = ccs ?? [];
    counts.change_controls = {
      total: ccl.length,
      approved: (ccl as any[]).filter((c) => ["approved", "closed"].includes(c.status)).length,
      pending: (ccl as any[]).filter((c) => ["pending_approval", "implementing", "verification"].includes(c.status)).length,
      regulatory: (ccl as any[]).filter((c) => c.regulatory_impact).length,
    };

    for (const c of ccl as any[]) {
      const tag = c.regulatory_impact ? "regulatory_change" : "approved_change";
      addItem("change_control", "change_controls", c.id, `${c.change_number} — ${c.title}`, c.status, c.effective_date, tag, `Type: ${c.change_type}${c.regulatory_impact ? " | Regulatory impact" : ""}`);
    }
  } catch { /* graceful skip */ }

  // ── 4. Bulk-insert evidence items ─────────────────────────────────────────
  if (itemsToInsert.length > 0) {
    // Insert in batches of 200 to stay within payload limits
    for (let i = 0; i < itemsToInsert.length; i += 200) {
      await db.from("audit_prep_items").insert(itemsToInsert.slice(i, i + 200));
    }
  }

  // ── 5. AI summary ─────────────────────────────────────────────────────────
  let aiSummary = "";
  if (anthropicKey) {
    aiSummary = await generateAISummary(anthropicKey, session as Record<string, unknown>, counts);
  } else {
    aiSummary = `[AI summary skipped — ANTHROPIC_API_KEY not configured. Set it via: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...]`;
  }

  // ── 6. Mark session ready ─────────────────────────────────────────────────
  await db
    .from("audit_prep_sessions")
    .update({
      status: "ready",
      assembled_at: new Date().toISOString(),
      ai_summary: aiSummary,
      evidence_counts: counts,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session_id);

  return new Response(
    JSON.stringify({
      ok: true,
      session_id,
      items_assembled: itemsToInsert.length,
      counts,
    }),
    { headers: JSON_HEADERS }
  );
});
