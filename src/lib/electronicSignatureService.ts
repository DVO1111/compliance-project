/**
 * Electronic signatures.
 *
 * There is exactly one signing path — `signElectronicRecord()` below,
 * calling the `sign_electronic_record` RPC. The database decides who the
 * signer is (`auth.uid()`), whether they may perform the action (it asks
 * the lifecycle engine), and what the record hash is. Nothing this file
 * sends can influence any of those, and it must stay that way: adding a
 * signer, role or hash argument here would hand the browser control of
 * the three things the signature exists to attest.
 *
 * A refusal arrives as DATA, not as a thrown error — the database has to
 * commit the attempt record that accompanies it, and an exception would
 * roll that record back. See
 * 20260917000000_electronic_signatures_traceability.sql. A caller that
 * checks only `error` would read a refusal as a successful signature,
 * which is why `ok` is checked here.
 */

import { supabase } from './supabase';
import { logger } from './logger';

/** §11.50 — the closed vocabulary the database CHECK constraint enforces. */
export const SIGNATURE_MEANINGS = [
  'authored',
  'reviewed',
  'approved',
  'rejected',
  'verified',
  'witnessed',
  'released',
] as const;

export type SignatureMeaning = (typeof SIGNATURE_MEANINGS)[number];

export type ElectronicSignatureInput = {
  companyId: string;
  entityType: string;
  entityId: string;
  action: string;
  meaning: SignatureMeaning;
  /** Re-entered at the moment of signing. Never stored, never logged. */
  password: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type ElectronicSignature = {
  id: string;
  company_id: string;
  signer_id: string;
  signer_name: string;
  signer_email: string;
  entity_type: string;
  entity_id: string;
  action: string;
  meaning: SignatureMeaning;
  reason: string | null;
  record_hash: string;
  hash_convention: string;
  signed_state: string;
  metadata: Record<string, unknown>;
  signed_at: string;
  created_at: string;
};

export type SignResult =
  | { ok: true; signatureId: string; signerName: string; recordHash: string; signedState: string; signedAt: string }
  | { ok: false; code: string; message: string };

/** Messages worth showing a person, keyed by the database's own codes. */
const REFUSAL_COPY: Record<string, string> = {
  E_SIGNATURE_BAD_CREDENTIAL: 'That password is not correct. Your attempt has been recorded.',
  E_SIGNATURE_THROTTLED: 'Too many failed attempts. Wait a few minutes before signing again.',
  E_SIGNATURE_NOT_PERMITTED: 'You are not permitted to perform this action.',
  E_SIGNATURE_ACTION_UNAVAILABLE: 'This action is not available for the record in its current state.',
  E_SIGNATURE_NO_RECORD: 'That record does not exist in this workspace.',
  E_SIGNATURE_COMPANY_ACCESS_DENIED: 'You are not an active member of this workspace.',
  E_SIGNATURE_NOT_AUTHENTICATED: 'Sign in again to continue.',
};

export async function signElectronicRecord(input: ElectronicSignatureInput): Promise<SignResult> {
  const { data, error } = await (supabase as any).rpc('sign_electronic_record', {
    p_company_id: input.companyId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_action: input.action,
    p_meaning: input.meaning,
    p_password: input.password,
    p_reason: input.reason ?? null,
    p_metadata: input.metadata ?? {},
  });

  // A thrown error is a genuine fault now — a constraint violation, the
  // network. Policy refusals no longer arrive this way.
  if (error) {
    logger.error('[esign] signing failed', { entityType: input.entityType, entityId: input.entityId, error });
    return { ok: false, code: 'E_SIGNATURE_ERROR', message: error.message ?? 'Unable to create the signature.' };
  }

  const result = data as any;

  if (result?.ok !== true) {
    const code = result?.code ?? 'E_SIGNATURE_ERROR';
    // deliberately no password, and no reason text, in the log line
    logger.warn('[esign] signing refused', {
      entityType: input.entityType, entityId: input.entityId, action: input.action, code,
    });
    return { ok: false, code, message: REFUSAL_COPY[code] ?? result?.message ?? 'The signature was refused.' };
  }

  return {
    ok: true,
    signatureId: result.signature_id,
    signerName: result.signer_name,
    recordHash: result.record_hash,
    signedState: result.signed_state,
    signedAt: result.signed_at,
  };
}

/** Signatures for a company, newest first. RLS scopes this to members. */
export async function getElectronicSignatures(companyId: string): Promise<ElectronicSignature[]> {
  const { data, error } = await (supabase as any)
    .from('electronic_signatures')
    .select('*')
    .eq('company_id', companyId)
    .order('signed_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ElectronicSignature[];
}
