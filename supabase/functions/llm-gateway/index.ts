// supabase/functions/llm-gateway/index.ts
// Multi-provider LLM gateway: Gemini → OpenAI → Anthropic
// JSON-only mode with repair attempt. Zero API keys in frontend.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


/* ─── Types ──────────────────────────────────────────────── */

interface GatewayRequest {
  prompt: string;
  mode?: "json" | "text";
  schema?: Record<string, unknown>;
  preferredProvider?: "gemini" | "openai" | "anthropic";
}

interface GatewayResponse {
  ok: boolean;
  provider?: string;
  data?: unknown;
  status?: number;
  message?: string;
}

type Provider = "gemini" | "openai" | "anthropic";

/* ─── Provider Implementations ───────────────────────────── */

async function callGemini(prompt: string): Promise<{ text: string; provider: Provider }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw Object.assign(new Error("Missing GEMINI_API_KEY"), { skipFallback: false });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!res.ok) {
    const status = res.status;
    const txt = await res.text().catch(() => "");
    const err = new Error(`Gemini ${status}: ${txt.slice(0, 200)}`);
    (err as any).status = status;
    throw err;
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { text, provider: "gemini" };
}

async function callOpenAI(prompt: string): Promise<{ text: string; provider: Provider }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw Object.assign(new Error("Missing OPENAI_API_KEY"), { skipFallback: false });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey }`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a compliance analysis assistant. Always respond with valid JSON only, no markdown fences." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const status = res.status;
    const txt = await res.text().catch(() => "");
    const err = new Error(`OpenAI ${status}: ${txt.slice(0, 200)}`);
    (err as any).status = status;
    throw err;
  }

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  return { text, provider: "openai" };
}

async function callAnthropic(prompt: string): Promise<{ text: string; provider: Provider }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw Object.assign(new Error("Missing ANTHROPIC_API_KEY"), { skipFallback: false });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01", },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
      system: "You are a compliance analysis assistant. Always respond with valid JSON only, no markdown fences.",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const status = res.status;
    const txt = await res.text().catch(() => "");
    const err = new Error(`Anthropic ${status}: ${txt.slice(0, 200)}`);
    (err as any).status = status;
    throw err;
  }

  const json = await res.json();
  const text = json?.content?.[0]?.text ?? "";
  return { text, provider: "anthropic" };
}

/* ─── Provider Router ────────────────────────────────────── */

const PROVIDERS: Record<Provider, (p: string) => Promise<{ text: string; provider: Provider }>> = {
  gemini: callGemini,
  openai: callOpenAI,
  anthropic: callAnthropic,
};

const DEFAULT_ORDER: Provider[] = ["gemini", "openai", "anthropic"];

function shouldFallback(_err: any): boolean {
  // Always try the next provider — missing keys, rate limits, bad requests, etc.
  return true;
}

async function routeToProvider(
  prompt: string,
  preferred?: Provider
): Promise<{ text: string; provider: Provider }> {
  // Build routing order: preferred first, then remaining in default order
  const order = preferred
    ? [preferred, ...DEFAULT_ORDER.filter((p) => p !== preferred)]
    : [...DEFAULT_ORDER];

  const errors: string[] = [];

  for (const name of order) {
    try {
      return await PROVIDERS[name](prompt);
    } catch (err: any) {
      errors.push(`${name}: ${err.message}`);
      if (!shouldFallback(err)) {
        // Non-retriable error (e.g. 400 bad request) — stop trying
        throw err;
      }
      console.warn(`[llm-gateway] ${name} failed, trying next. Error: ${err.message}`);
    }
  }

  throw new Error(`All providers failed: ${errors.join(" | ")}`);
}

/* ─── JSON Parsing & Repair ──────────────────────────────── */

function cleanJsonText(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(cleanJsonText(text));
  } catch {
    return null;
  }
}

async function parseWithRepair(
  text: string,
  provider: Provider
): Promise<unknown> {
  // First attempt
  const first = tryParseJson(text);
  if (first !== null) return first;

  // Repair attempt: ask same provider to fix the JSON
  console.warn("[llm-gateway] JSON parse failed, attempting repair...");
  const repairPrompt = `The following text was supposed to be valid JSON but has syntax errors. Fix ONLY the JSON syntax and return the corrected JSON with no commentary or markdown:\n\n${text.slice(0, 4000)}`;

  try {
    const { text: repaired } = await PROVIDERS[provider](repairPrompt);
    const second = tryParseJson(repaired);
    if (second !== null) return second;
  } catch {
    // Repair also failed
  }

  throw new Error("Invalid JSON from LLM even after repair attempt");
}

/* ─── CORS Headers ───────────────────────────────────────── */

const CORS = {
  "Access-Control-Allow-Origin": req.headers.get("origin") ?? "",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ─── Logging Helper ─────────────────────────────────────── */

async function logUsage(params: {
  supabase: any;
  companyId: string;
  userId?: string;
  provider: string;
  model: string;
  prompt: string;
  response: string;
  latency: number;
}) {
  try {
    // Basic sanitization
    const sanitize = (text: string) => text.trim().replace(/\s+/g, ' ').slice(0, 200);
    
    // Basic risk detection
    const risks = [];
    const lower = (params.prompt + " " + params.response).toLowerCase();
    if (lower.includes("secret") || lower.includes("password")) risks.push("SENSITIVE_DATA");
    if (lower.includes("guaranteed") || lower.includes("cure")) risks.push("MARKETING_CLAIM");

    await params.supabase.from("ai_usage_logs").insert({
      company_id: params.companyId,
      user_id: params.userId,
      provider_name: params.provider,
      model_name: params.model,
      input_summary: sanitize(params.prompt),
      output_summary: sanitize(params.response),
      risk_flags: risks,
      performance: { latency_ms: params.latency, estimated_cost: 0 },
      source: "llm_gateway"
    });
  } catch (err) {
    console.error("[llm-gateway] Logging failed:", err);
  }
}

/* ─── Main Handler ───────────────────────────────────────── */

serve(async (req) => {
  const startTime = Date.now();
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS, ...SECURITY_HEADERS }});
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, message: "Method Not Allowed" }),
      { status: 405, headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
    );
  }

  try {
    const body: GatewayRequest = await req.json();

    if (!body.prompt || typeof body.prompt !== "string") {
      return new Response(
        JSON.stringify({ ok: false, message: "prompt (string) required" }),
        { status: 400, headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { text, provider } = await routeToProvider(
      body.prompt,
      body.preferredProvider
    );

    // If JSON mode, parse and validate
    let data: unknown;
    if (body.mode === "json" || !body.mode) {
      data = await parseWithRepair(text, provider);
    } else {
      data = text;
    }

    const response: GatewayResponse = { ok: true, provider, data };
    
    // Non-blocking logging
    const authHeader = req.headers.get("Authorization")!;
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { ...SECURITY_HEADERS, Authorization: authHeader } } }
    );

    // Get user/company from token (or assume passed in if we trust the gateway caller)
    // For now we attempt to get from session but gateway often runs with user token
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    // We can't easily wait for company_id without a query, so we assume the caller is authenticated
    // and we fetch the profile.
    if (user) {
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (profile?.company_id) {
        // Fire and forget logging
        logUsage({
          supabase: supabaseClient,
          companyId: profile.company_id,
          userId: user.id,
          provider,
          model: provider === 'openai' ? 'gpt-4o-mini' : (provider === 'anthropic' ? 'claude-3-5-haiku' : 'gemini-2.0-flash'),
          prompt: body.prompt,
          response: typeof data === 'string' ? data : JSON.stringify(data),
          latency: Date.now() - startTime
        });
      }
    }

    return new Response(JSON.stringify(response), {
      headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[llm-gateway] Error:", err);

    const response: GatewayResponse = {
      ok: false,
      provider: undefined,
      status: err.status ?? 500,
      message: err.message ?? "LLM gateway failure",
    };

    return new Response(JSON.stringify(response), {
      status: err.status ?? 500,
      headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" },
    });
  }
});