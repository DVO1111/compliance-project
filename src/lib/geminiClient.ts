/**
 * LLM Client — proxies through the llm-gateway Edge Function,
 * with a client-side Gemini fallback when the gateway is unavailable.
 *
 * Fallback order:
 *   1. supabase/functions/v1/llm-gateway  (preferred — no keys in frontend)
 *   2. Direct Gemini API via VITE_GEMINI_API_KEY  (dev / offline fallback)
 */

import { supabase } from './supabase';
import { logger } from './logger';

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";
let circuitState: CircuitState = "CLOSED";
let failureCount = 0;
let lastFailureTime: number | null = null;
const FAILURE_THRESHOLD = 3;
const RECOVERY_TIMEOUT = 30_000;

function updateCircuit(next: CircuitState) {
  circuitState = next;
  // console.log(`[geminiClient] Circuit state: ${next}`);
}

/* ─── Gateway Response ────────────────────────────────────── */

interface GatewayResponse {
  ok: boolean;
  provider?: string;
  data?: unknown;
  status?: number;
  message?: string;
}

/* ─── Direct Gemini fallback ─────────────────────────────── */

async function callGeminiDirect(
  prompt: string,
  mode: 'json' | 'text' = 'json'
): Promise<{ data: unknown; provider: string }> {
  // Security Hardening: Only allow direct calls if EXPLICITLY enabled and key provided.
  // We remove the VITE_ prefix to prevent Vite from bundling the key into the build.
  const apiKey = (import.meta as any).env.INTERNAL_GEMINI_API_KEY; 
  
  if (!apiKey) {
    throw new Error(
      'Direct Gemini API access is disabled in production for security. LLM Gateway is required.'
    );
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(60_000),
    }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Gemini direct ${res.status}: ${txt.slice(0, 300)}`);
  }

  const json = await res.json();
  const rawText: string =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (mode === 'text') {
    return { data: rawText, provider: 'gemini-direct' };
  }

  // JSON mode — clean markdown fences and parse
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return { data: JSON.parse(cleaned), provider: 'gemini-direct' };
  } catch {
    throw new Error('Gemini returned invalid JSON: ' + cleaned.slice(0, 200));
  }
}

/* ─── Core ────────────────────────────────────────────────── */

/**
 * Call the llm-gateway Edge Function first.
 * If it fails (not deployed, 404, network error), fall back to direct Gemini.
 */
async function callGateway(
  prompt: string,
  mode: 'json' | 'text' = 'json'
): Promise<{ data: unknown; provider: string }> {
  // Check circuit state
  if (circuitState === "OPEN") {
    const elapsed = Date.now() - (lastFailureTime ?? 0);
    if (elapsed >= RECOVERY_TIMEOUT) {
      updateCircuit("HALF_OPEN");
    } else {
      throw new Error("Circuit Breaker is OPEN. Service temporarily unavailable.");
    }
  }

  const executeCall = async () => {
    // --- Attempt 1: Edge Function Gateway ---
    try {
      const { data: invokeData, error: invokeError } = await supabase.functions.invoke('llm-gateway', {
        body: { prompt, mode },
      });

      if (invokeError) {
        throw invokeError;
      } else if (invokeData && invokeData.ok) {
        return { data: invokeData.data, provider: invokeData.provider ?? 'unknown' };
      } else {
        throw new Error(invokeData?.message || "Gateway error");
      }
    } catch (gatewayErr) {
      logger.warn('[geminiClient] Gateway failed, trying direct:', gatewayErr);
      return callGeminiDirect(prompt, mode);
    }
  };

  try {
    const result = await executeCall();
    // Success — reset circuit
    failureCount = 0;
    if (circuitState === "HALF_OPEN") updateCircuit("CLOSED");
    return result;
  } catch (err) {
    failureCount++;
    lastFailureTime = Date.now();
    if (failureCount >= FAILURE_THRESHOLD) {
      updateCircuit("OPEN");
    }
    throw err;
  }
}

/* ─── Public API (drop-in replacement for old geminiClient) ── */

/**
 * Generate text from the best-available LLM provider.
 * Returns the raw text string.
 */
export async function generateText(prompt: string): Promise<string> {
  const { data } = await callGateway(prompt, 'text');
  return typeof data === 'string' ? data : JSON.stringify(data);
}

/**
 * Generate structured JSON from the best-available LLM provider.
 * Strips markdown fences and parses the response.
 */
export async function generateJSON<T = unknown>(prompt: string): Promise<T> {
  const { data } = await callGateway(prompt, 'json');
  return data as T;
}

// Re-export for backwards compat
export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

