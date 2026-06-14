/**
 * compliance-alert-scanner
 *
 * Scans the database for compliance alerts that should fire:
 *   - capa_overdue          : CAPA records past due_date and not closed
 *   - licence_expiring      : Licences within threshold_days of expiry
 *   - obligation_overdue    : Regulatory obligations past due_date
 *   - control_non_compliant : GRC control snapshots marked non_compliant
 *   - deviation_raised      : Deviations raised in the last 24 hours (if table exists)
 *
 * Deduplication: one alert per (company_id, entity_id, alert_type) per calendar day.
 *
 * Can be invoked:
 *   - Via Supabase cron (pg_cron) on a schedule
 *   - Manually via POST with { company_id } body (scans that company only)
 *   - POST with {} body (scans all companies)
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = {
  ...CORS_HEADERS,
  "Content-Type": "application/json",
};

interface AlertRule {
  id: string;
  company_id: string;
  trigger_type: string;
  threshold_days: number;
  notify_owner: boolean;
  notify_admins: boolean;
  notify_email: boolean;
  notify_in_app: boolean;
  is_active: boolean;
}

interface ScanResult {
  fired: number;
  skipped: number;
  errors: string[];
}

async function tableExists(client: any, tableName: string): Promise<boolean> {
  const { data } = await client
    .from("information_schema.tables")
    .select("table_name")
    .eq("table_schema", "public")
    .eq("table_name", tableName)
    .maybeSingle();
  return !!data;
}

async function fireAlert(
  client: any,
  supabaseUrl: string,
  serviceKey: string,
  rule: AlertRule,
  entityType: string,
  entityId: string | null,
  message: string,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);

  // Dedup check: skip if already fired today for this entity + alert type
  if (entityId) {
    const { data: existing } = await client
      .from("compliance_alert_log")
      .select("id")
      .eq("company_id", rule.company_id)
      .eq("entity_id", entityId)
      .eq("alert_type", rule.trigger_type)
      .eq("fired_date", today)
      .maybeSingle();

    if (existing) return false; // already fired today
  }

  // Write to alert log
  const { error: logErr } = await client.from("compliance_alert_log").insert({
    company_id: rule.company_id,
    rule_id: rule.id,
    entity_type: entityType,
    entity_id: entityId,
    alert_type: rule.trigger_type,
    message,
    fired_at: new Date().toISOString(),
    fired_date: today,
    metadata,
  });

  if (logErr) {
    // Could be a duplicate constraint violation (race) — treat as skipped
    return false;
  }

  // Fire in-app + email notifications
  if (rule.notify_in_app || rule.notify_email) {
    const notifyPayload: Record<string, unknown> = {
      company_id: rule.company_id,
      type: rule.trigger_type === "capa_overdue"
        ? "capa_overdue"
        : rule.trigger_type === "deviation_raised"
        ? "deviation_raised"
        : rule.trigger_type, // licence_expiring | obligation_overdue | control_non_compliant
      content_title: message,
      note: `Detected on ${today}`,
    };

    if (rule.notify_admins) {
      notifyPayload["notify_roles"] = ["Admin", "Compliance", "Executive"];
    }

    try {
      await fetch(`${supabaseUrl}/functions/v1/notify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(notifyPayload),
      });
    } catch {
      // Notification failure doesn't block the scan
    }
  }

  return true;
}

async function scanCompany(
  client: any,
  supabaseUrl: string,
  serviceKey: string,
  companyId: string,
  rules: AlertRule[]
): Promise<ScanResult> {
  const result: ScanResult = { fired: 0, skipped: 0, errors: [] };

  for (const rule of rules) {
    if (!rule.is_active) continue;

    try {
      switch (rule.trigger_type) {
        case "capa_overdue": {
          const { data: capas } = await client
            .from("capa_records")
            .select("id, title, due_date, owner_id")
            .eq("company_id", companyId)
            .not("status", "in", '("closed","cancelled")')
            .lt("due_date", new Date().toISOString().slice(0, 10));

          for (const capa of capas ?? []) {
            const msg = `CAPA overdue: "${capa.title || capa.id}" was due on ${capa.due_date}`;
            const fired = await fireAlert(client, supabaseUrl, serviceKey, rule, "capa", capa.id, msg, { title: capa.title, due_date: capa.due_date });
            fired ? result.fired++ : result.skipped++;
          }
          break;
        }

        case "licence_expiring": {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() + rule.threshold_days);
          const { data: licences } = await client
            .from("licenses")
            .select("id, name, expiry_date, license_type")
            .eq("company_id", companyId)
            .eq("status", "active")
            .lte("expiry_date", cutoff.toISOString().slice(0, 10));

          for (const lic of licences ?? []) {
            const msg = `Licence expiring: "${lic.name}" expires ${lic.expiry_date}`;
            const fired = await fireAlert(client, supabaseUrl, serviceKey, rule, "licence", lic.id, msg, { name: lic.name, expiry_date: lic.expiry_date });
            fired ? result.fired++ : result.skipped++;
          }
          break;
        }

        case "obligation_overdue": {
          const { data: obligations } = await client
            .from("regulatory_obligations")
            .select("id, title, due_date, owner_id")
            .eq("company_id", companyId)
            .not("status", "in", '("completed","na","cancelled")')
            .lt("due_date", new Date().toISOString().slice(0, 10));

          for (const ob of obligations ?? []) {
            const msg = `Obligation overdue: "${ob.title || ob.id}" was due ${ob.due_date}`;
            const fired = await fireAlert(client, supabaseUrl, serviceKey, rule, "obligation", ob.id, msg, { title: ob.title, due_date: ob.due_date });
            fired ? result.fired++ : result.skipped++;
          }
          break;
        }

        case "control_non_compliant": {
          // Get latest snapshot per control (most recent snapshot_date)
          const { data: snapshots } = await client
            .from("grc_control_snapshots")
            .select("id, control_id, control_name, snapshot_date, status")
            .eq("company_id", companyId)
            .eq("status", "non_compliant")
            .order("snapshot_date", { ascending: false })
            .limit(200);

          // Deduplicate to one alert per control_id today
          const seen = new Set<string>();
          for (const snap of snapshots ?? []) {
            if (seen.has(snap.control_id)) continue;
            seen.add(snap.control_id);
            const msg = `Control non-compliant: "${snap.control_name || snap.control_id}"`;
            const fired = await fireAlert(client, supabaseUrl, serviceKey, rule, "control", snap.control_id, msg, { snapshot_id: snap.id });
            fired ? result.fired++ : result.skipped++;
          }
          break;
        }

        case "deviation_raised": {
          // Only fire if deviations table exists
          const exists = await tableExists(client, "deviations");
          if (!exists) break;

          const since = new Date();
          since.setHours(since.getHours() - 24);
          const { data: devs } = await client
            .from("deviations")
            .select("id, title, created_at")
            .eq("company_id", companyId)
            .eq("status", "open")
            .gte("created_at", since.toISOString());

          for (const dev of devs ?? []) {
            const msg = `New deviation raised: "${dev.title || dev.id}"`;
            const fired = await fireAlert(client, supabaseUrl, serviceKey, rule, "deviation", dev.id, msg, { title: dev.title });
            fired ? result.fired++ : result.skipped++;
          }
          break;
        }
      }
    } catch (err: any) {
      result.errors.push(`${rule.trigger_type}: ${err.message}`);
    }
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: JSON_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing config" }), { status: 500, headers: JSON_HEADERS });
  }

  let body: { company_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine — scan all
  }

  const client = createClient(supabaseUrl, serviceKey);

  // Fetch active rules — scoped to one company if provided
  let rulesQuery = client
    .from("compliance_alert_rules")
    .select("*")
    .eq("is_active", true);

  if (body.company_id) {
    rulesQuery = rulesQuery.eq("company_id", body.company_id);
  }

  const { data: allRules, error: rulesErr } = await rulesQuery;
  if (rulesErr) {
    return new Response(JSON.stringify({ error: rulesErr.message }), { status: 500, headers: JSON_HEADERS });
  }

  // Group rules by company
  const byCompany: Record<string, AlertRule[]> = {};
  for (const rule of allRules ?? []) {
    if (!byCompany[rule.company_id]) byCompany[rule.company_id] = [];
    byCompany[rule.company_id].push(rule as AlertRule);
  }

  let totalFired = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (const [companyId, rules] of Object.entries(byCompany)) {
    const r = await scanCompany(client, supabaseUrl, serviceKey, companyId, rules);
    totalFired += r.fired;
    totalSkipped += r.skipped;
    allErrors.push(...r.errors.map((e) => `[${companyId.slice(0, 8)}] ${e}`));
  }

  return new Response(
    JSON.stringify({
      ok: true,
      companies_scanned: Object.keys(byCompany).length,
      fired: totalFired,
      skipped: totalSkipped,
      errors: allErrors,
    }),
    { headers: JSON_HEADERS }
  );
});
