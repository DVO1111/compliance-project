/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};


const SB_URL = Deno.env.get("SUPABASE_URL") || "";
const SB_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const supabase = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

  try {
    // 1. Fetch pending/failed deliveries due for attempt
    const { data: deliveries, error: fetchErr } = await supabase
      .from("webhook_deliveries")
      .select(`
        *,
        endpoint:webhook_endpoints!inner(target_url, signing_secret_encrypted)
      `)
      .in("status", ["pending", "failed"])
      .lte("next_attempt_at", new Date().toISOString())
      .limit(10);

    if (fetchErr) throw fetchErr;
    if (!deliveries || deliveries.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
      });
    }

    let deliveredCount = 0;
    let failedCount = 0;

    for (const delivery of deliveries) {
      const attempt = delivery.attempt_count + 1;
      const timestamp = new Date().toISOString();
      const payloadStr = JSON.stringify(delivery.payload);
      
      // Decode "encrypted" secret (using the base64 placeholder from service)
      const rawSecret = atob(delivery.endpoint.signing_secret_encrypted);
      
      const signature = await hmacSha256Hex(rawSecret, `${timestamp}.${payloadStr}`);

      try {
        const res = await fetch(delivery.endpoint.target_url, {
          method: "POST",
          headers: { ...SECURITY_HEADERS, "Content-Type": "application/json",
            "X-Compliance-Event": delivery.event_name,
            "X-Compliance-Timestamp": timestamp,
            "X-Compliance-Signature": signature, },
          body: payloadStr,
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        const respBody = await res.text();

        if (res.ok) {
          // Success
          await supabase
            .from("webhook_deliveries")
            .update({
              status: "delivered",
              attempt_count: attempt,
              last_attempt_at: timestamp,
              response_status: res.status,
              response_body_preview: respBody.slice(0, 500),
            })
            .eq("id", delivery.id);
          deliveredCount++;
        } else {
          throw new Error(`Endpoint returned ${res.status}: ${respBody.slice(0, 100)}`);
        }
      } catch (err: any) {
        // Failure - calculate backoff
        failedCount++;
        const maxAttempts = 5;
        const status = attempt >= maxAttempts ? "dead_letter" : "failed";
        
        // Exponential backoff: 2^attempt * 5 minutes
        const backoffMinutes = Math.pow(2, attempt) * 5;
        const nextAttempt = status === "failed" 
          ? new Date(Date.now() + backoffMinutes * 60000).toISOString()
          : null;

        await supabase
          .from("webhook_deliveries")
          .update({
            status,
            attempt_count: attempt,
            last_attempt_at: timestamp,
            next_attempt_at: nextAttempt,
            error_message: err.message,
          })
          .eq("id", delivery.id);
      }
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      processed: deliveries.length,
      delivered: deliveredCount,
      failed: failedCount
    }), {
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...SECURITY_HEADERS, "Content-Type": "application/json" },
    });
  }
});
