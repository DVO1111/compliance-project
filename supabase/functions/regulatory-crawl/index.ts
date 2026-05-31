// supabase/functions/regulatory-crawl/index.ts
// Web retrieval engine: crawls for regulatory updates using Tavily (or SerpAPI).
// Saves results into regulatory_updates table, deduplicates by URL.
// Optionally summarizes snippets via llm-gateway.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


const CORS = {
  "Access-Control-Allow-Origin": req.headers.get("origin") ?? "",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ─── Config ─────────────────────────────────────────────── */

const DEFAULT_JURISDICTIONS = ["nigeria", "usa", "europe", "pan_african"];

const SEARCH_QUERIES = [
  "healthcare advertising regulation update",
  "pharmaceutical marketing compliance circular",
  "medical device promotion regulatory change",
];

/* ─── Search Providers ───────────────────────────────────── */

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  published_at?: string;
  raw?: Record<string, unknown>;
}

async function searchTavily(
  query: string,
  apiKey: string
): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Tavily error ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.results || []).map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: r.content || "",
    source: "tavily",
    published_at: r.published_date || null,
    raw: r,
  }));
}

async function searchSerpApi(
  query: string,
  apiKey: string
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: "google",
    num: "5",
  });

  const res = await fetch(`https://serpapi.com/search.json?${params}`, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`SerpAPI error ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.organic_results || []).map((r: any) => ({
    title: r.title || "",
    url: r.link || "",
    snippet: r.snippet || "",
    source: "serpapi",
    published_at: r.date || null,
    raw: r,
  }));
}

/* ─── Main Handler ───────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...CORS, ...SECURITY_HEADERS }});
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Determine search provider
  const searchProvider = (Deno.env.get("SEARCH_PROVIDER") || "tavily").toLowerCase();
  const tavilyKey = Deno.env.get("TAVILY_API_KEY");
  const serpKey = Deno.env.get("SERPAPI_KEY");

  const apiKey = searchProvider === "serpapi" ? serpKey : tavilyKey;
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: `Missing ${searchProvider === "serpapi" ? "SERPAPI_KEY" : "TAVILY_API_KEY"} secret`,
      }),
      { status: 500, headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
    );
  }

  const searchFn = searchProvider === "serpapi" ? searchSerpApi : searchTavily;

  // Parse optional body
  let body: { jurisdictions?: string[]; companyId?: string; summarize?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // defaults
  }

  const jurisdictions = body.jurisdictions || DEFAULT_JURISDICTIONS;
  const companyId = body.companyId || null;
  const shouldSummarize = body.summarize ?? false;

  let totalInserted = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (const jurisdiction of jurisdictions) {
    for (const baseQuery of SEARCH_QUERIES) {
      const fullQuery = `${baseQuery} ${jurisdiction}`;

      try {
        const results = await searchFn(fullQuery, apiKey);

        for (const result of results) {
          if (!result.url) continue;

          // Optional: summarize snippet via llm-gateway
          let snippet = result.snippet;
          if (shouldSummarize && snippet.length > 50) {
            try {
              const gatewayUrl = `${supabaseUrl}/functions/v1/llm-gateway`;
              const summaryRes = await fetch(gatewayUrl, {
                method: "POST",
                headers: { ...SECURITY_HEADERS, "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceKey }`,
                },
                body: JSON.stringify({
                  prompt: `Summarize this regulatory update snippet in 2 sentences. Be factual and concise:\n\n${snippet.slice(0, 1000)}`,
                  mode: "text",
                }),
              });
              const summaryBody = await summaryRes.json();
              if (summaryBody.ok && typeof summaryBody.data === "string") {
                snippet = summaryBody.data;
              }
            } catch {
              // Keep original snippet on summary failure
            }
          }

          // Insert (dedup by URL via UNIQUE constraint)
          const { error: insertErr } = await supabase
            .from("regulatory_updates")
            .insert({
              company_id: companyId,
              jurisdiction,
              title: result.title,
              url: result.url,
              source: result.source,
              published_at: result.published_at || null,
              snippet,
              raw: result.raw || {},
            });

          if (insertErr) {
            if (insertErr.code === "23505") {
              totalSkipped++;
            } else {
              errors.push(`Insert error for ${result.url}: ${insertErr.message}`);
            }
          } else {
            totalInserted++;
          }
        }
      } catch (err: any) {
        errors.push(`Search error for "${fullQuery}": ${err.message}`);
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      inserted: totalInserted,
      skipped: totalSkipped,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { headers: { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json" } }
  );
});
