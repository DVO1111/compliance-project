/**
 * AI Response Validator — Phase 3.2
 *
 * Validates the shape of AI-generated JSON responses before they reach the UI.
 * On schema mismatch the validator:
 *   1. Logs the failure to audit_logs (entity_type = 'ai_response')
 *   2. Returns a caller-supplied safe default — never throws, never crashes
 *
 * No external schema library required — uses a lightweight field-type map.
 *
 * Usage:
 *   const result = await wrapAICall(
 *     () => generateJSON<MyType>(prompt),
 *     { score: 'number', issues: 'array', summary: 'string' },
 *     DEFAULT_RESULT,
 *     { action: 'ai_risk_assessment', companyId, userId }
 *   );
 */

import { recordAuditEvent } from './auditService';
import { logger } from './logger';

/* ── Schema types ───────────────────────────────────────────────────────── */

export type FieldType =
  | 'string'  | 'string?'
  | 'number'  | 'number?'
  | 'boolean' | 'boolean?'
  | 'array'   | 'array?'
  | 'object'  | 'object?';

/** Maps field names to their expected types. Suffix '?' means optional. */
export type SchemaShape = Record<string, FieldType>;

export interface ValidationResult<T> {
  valid: boolean;
  data: T;
  errors: string[];
}

/* ── Core shape validator ────────────────────────────────────────────────── */

function isOptional(t: FieldType): boolean {
  return t.endsWith('?');
}

function baseType(t: FieldType): string {
  return t.replace('?', '');
}

function checkField(value: unknown, expected: FieldType): boolean {
  if (value === undefined || value === null) return isOptional(expected);
  const bt = baseType(expected);
  if (bt === 'string')  return typeof value === 'string';
  if (bt === 'number')  return typeof value === 'number';
  if (bt === 'boolean') return typeof value === 'boolean';
  if (bt === 'array')   return Array.isArray(value);
  if (bt === 'object')  return typeof value === 'object' && !Array.isArray(value);
  return false;
}

export function validateShape<T>(
  response: unknown,
  schema: SchemaShape,
  fallback: T
): ValidationResult<T> {
  const errors: string[] = [];

  if (typeof response !== 'object' || response === null || Array.isArray(response)) {
    errors.push(`Expected object, got ${Array.isArray(response) ? 'array' : typeof response}`);
    return { valid: false, data: fallback, errors };
  }

  const obj = response as Record<string, unknown>;

  for (const [field, expectedType] of Object.entries(schema)) {
    if (!checkField(obj[field], expectedType)) {
      const actual = obj[field] === undefined
        ? 'missing'
        : Array.isArray(obj[field]) ? 'array' : typeof obj[field];
      errors.push(`Field "${field}": expected ${expectedType}, got ${actual}`);
    }
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? (response as T) : fallback,
    errors,
  };
}

/* ── Audit logger for AI failures ───────────────────────────────────────── */

async function logAIValidationFailure(
  action: string,
  errors: string[],
  rawResponse: unknown,
  context?: { companyId?: string; userId?: string }
): Promise<void> {
  try {
    await recordAuditEvent({
      userId: context?.userId ?? 'system',
      action: 'ai_response_validation_failed',
      entityType: 'ai_response',
      entityId: action,
      companyId: context?.companyId ?? 'unknown',
      metadata: {
        ai_action: action,
        validation_errors: errors,
        response_preview: JSON.stringify(rawResponse).slice(0, 500),
      },
    });
  } catch (err) {
    // Audit failure must never crash the caller
    logger.warn('[aiResponseValidator] Failed to log validation failure:', err);
  }
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Wrap an AI call with schema validation and safe-default fallback.
 *
 * - Calls `callFn()` to get the raw AI response
 * - Validates shape against `schema`
 * - If invalid: logs to audit_logs, returns `fallback`
 * - If the call throws: logs the error, returns `fallback`
 */
export async function wrapAICall<T>(
  callFn: () => Promise<unknown>,
  schema: SchemaShape,
  fallback: T,
  context?: { companyId?: string; userId?: string; action: string }
): Promise<T> {
  const action = context?.action ?? 'unknown_ai_call';

  let raw: unknown;
  try {
    raw = await callFn();
  } catch (err) {
    logger.warn(`[aiResponseValidator] AI call "${action}" threw:`, err);
    await logAIValidationFailure(
      action,
      [`Call threw: ${err instanceof Error ? err.message : String(err)}`],
      null,
      context
    );
    return fallback;
  }

  const result = validateShape<T>(raw, schema, fallback);

  if (!result.valid) {
    logger.warn(`[aiResponseValidator] Schema mismatch for "${action}":`, result.errors);
    await logAIValidationFailure(action, result.errors, raw, context);
    return fallback;
  }

  return result.data;
}

/**
 * Synchronous shape validator — use when you already have the response
 * and just need to confirm it matches expectations before rendering.
 *
 * Returns `fallback` on mismatch; does not log to audit (no async context).
 */
export function safeParseAIResponse<T>(
  response: unknown,
  schema: SchemaShape,
  fallback: T
): T {
  return validateShape(response, schema, fallback).data;
}
