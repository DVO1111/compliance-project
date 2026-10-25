/**
 * Incoming supplier certificates of analysis.
 *
 * ── WHY THIS FILE EXISTS ──
 *
 * The database has had this workflow since 20261003000000, with 73 SQL
 * assertions over it, and nothing in the product could reach it. No
 * component read `material_certificates_of_analysis` and nothing called
 * `material_coa_verify`, so the table held no rows and the column that
 * decision 2 reads — `verified_by` — could never be set.
 *
 * That made a tested control inert: "whoever verified a lot's
 * certificate may not make its disposition" cannot fire if nobody can
 * verify a certificate. This service is the missing half.
 *
 * ── WHAT THIS FILE DOES NOT DECIDE ──
 *
 * It does not compare a stated value against a specification limit.
 * `material_coa_verify` does that, in the database, against
 * `material_specification_parameters`. This service sends an id and
 * reads back a verdict. A screen that computed its own pass could
 * disagree with the stored record, and on a certificate check that
 * disagreement IS the finding — the same reasoning QcTestingPage
 * already follows for test results.
 *
 * It also does not decide who may verify. The authority check lives in
 * `material_coa_verify_authority_error()` and in a BEFORE trigger on
 * the table, so a direct write is refused exactly as the RPC is. This
 * service surfaces the refusal; it does not reimplement it.
 *
 * ── FILING IS CLERICAL, VERIFYING IS NOT ──
 *
 * Recording that a supplier sent a certificate is paperwork and stays
 * open to any member of the company. Only setting `verification_status`
 * or `verified_by` is a quality judgement, and only that is gated.
 * `uploadCertificate` therefore writes neither.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';

export type VerificationStatus = 'unverified' | 'verified' | 'discrepant' | 'rejected';

export interface SupplierResult {
  parameter: string;
  stated_value?: number | null;
  stated_text?: string | null;
  unit?: string | null;
}

export interface CertificateRow {
  id: string;
  company_id: string;
  material_lot_id: string;
  certificate_number: string | null;
  issued_date: string | null;
  received_date: string | null;
  supplier_results: SupplierResult[];
  verification_status: VerificationStatus;
  verified_at: string | null;
  verified_by: string | null;
  discrepancy_count: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface DiscrepancyRow {
  id: string;
  certificate_id: string;
  parameter: string;
  discrepancy_type:
    | 'out_of_specification'
    | 'missing_result'
    | 'unparseable_value'
    | 'unit_mismatch'
    | 'extra_parameter';
  specification_limit: string | null;
  stated_value: string | null;
  is_critical: boolean;
  detected_at: string;
  resolved_at: string | null;
}

export interface VerifyOutcome {
  certificate_id: string;
  specification_id: string | null;
  parameters_checked: number;
  discrepancies: number;
  critical: number;
  verification_status: VerificationStatus;
}

/**
 * Turn a database refusal into something a person can act on.
 *
 * The codes are the ones the database actually raises — not a guess at
 * what it might say. A refusal nobody can read sends the reader to the
 * wrong person, which on an authorisation error is the whole cost.
 */
export function describeCoaError(raw: string): { code: string; message: string } {
  const text = String(raw ?? '');

  if (text.includes('COA_VERIFY_FORBIDDEN')) {
    return {
      code: 'COA_VERIFY_FORBIDDEN',
      message:
        'Checking a supplier certificate against the material specification is ' +
        'quality work. It is reserved to a role the permission matrix gives QC ' +
        'testing or QA disposition. Being a member of the company is not enough, ' +
        'and the database enforces that, not this screen.',
    };
  }
  if (text.includes('COA_FORBIDDEN')) {
    return {
      code: 'COA_FORBIDDEN',
      message: 'This certificate belongs to another company.',
    };
  }
  if (text.includes('COA_NO_SPECIFICATION')) {
    return {
      code: 'COA_NO_SPECIFICATION',
      message:
        'This material has no effective specification, so there is nothing to ' +
        'check the certificate against. Approve a material specification first.',
    };
  }
  if (text.includes('COA_NOT_FOUND')) {
    return { code: 'COA_NOT_FOUND', message: 'That certificate no longer exists.' };
  }
  //  Unknown codes are passed through rather than flattened into
  //  "something went wrong", which is how a real finding gets lost.
  return { code: 'UNKNOWN', message: text || 'The certificate could not be verified.' };
}

export async function listCertificates(lotId: string): Promise<CertificateRow[]> {
  const { data, error } = await supabase
    .from('material_certificates_of_analysis')
    .select(
      'id, company_id, material_lot_id, certificate_number, issued_date, received_date, ' +
        'supplier_results, verification_status, verified_at, verified_by, ' +
        'discrepancy_count, uploaded_by, created_at',
    )
    .eq('material_lot_id', lotId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[coa] could not list certificates', { lotId, error: error.message });
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as CertificateRow[];
}

export async function listDiscrepancies(certificateId: string): Promise<DiscrepancyRow[]> {
  const { data, error } = await supabase
    .from('material_coa_discrepancies')
    .select(
      'id, certificate_id, parameter, discrepancy_type, specification_limit, ' +
        'stated_value, is_critical, detected_at, resolved_at',
    )
    .eq('certificate_id', certificateId)
    .order('is_critical', { ascending: false })
    .order('parameter', { ascending: true });

  if (error) {
    logger.error('[coa] could not list discrepancies', {
      certificateId,
      error: error.message,
    });
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as DiscrepancyRow[];
}

/**
 * File a certificate the supplier sent. Clerical: writes no
 * verification field, so goods-in can do it.
 */
export async function uploadCertificate(params: {
  companyId: string;
  lotId: string;
  certificateNumber?: string | null;
  issuedDate?: string | null;
  supplierResults: SupplierResult[];
}): Promise<string> {
  const { data, error } = await supabase
    .from('material_certificates_of_analysis')
    .insert({
      company_id: params.companyId,
      material_lot_id: params.lotId,
      certificate_number: params.certificateNumber ?? null,
      issued_date: params.issuedDate ?? null,
      supplier_results: params.supplierResults,
    })
    .select('id')
    .single();

  if (error) {
    logger.error('[coa] could not file certificate', { error: error.message });
    throw new Error(describeCoaError(error.message).message);
  }
  return (data as { id: string }).id;
}

/**
 * Ask the database to check the certificate against the specification.
 *
 * The verdict, the discrepancy count and the status all come back from
 * the function. Nothing here interprets the numbers.
 */
export async function verifyCertificate(certificateId: string): Promise<VerifyOutcome> {
  const { data, error } = await supabase.rpc('material_coa_verify', {
    p_coa_id: certificateId,
  });

  if (error) {
    const described = describeCoaError(error.message);
    logger.error('[coa] verification refused', {
      certificateId,
      code: described.code,
    });
    throw new Error(described.message);
  }
  return data as unknown as VerifyOutcome;
}
