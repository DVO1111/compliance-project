/**
 * Finished-product specifications.
 *
 * A typed surface over 20261113000000. Nothing here decides anything:
 * a specification is frozen on approval by triggers, approval requires
 * a designated QA authority, and the release gate reads the version in
 * force when a batch was made. This file carries the refusals back as
 * sentences.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';

export type LimitType = 'range' | 'min' | 'max' | 'exact_text' | 'complies' | 'absent';

/** The limit vocabulary, which is material_specification_parameters'. */
export const LIMIT_TYPES: { value: LimitType; label: string }[] = [
  { value: 'range',      label: 'Between two values' },
  { value: 'min',        label: 'At least' },
  { value: 'max',        label: 'At most' },
  { value: 'exact_text', label: 'Exactly this text' },
  { value: 'complies',   label: 'Complies (judged by the analyst)' },
  { value: 'absent',     label: 'Absent (judged by the analyst)' },
];

export interface ProductSpecification {
  id: string;
  product_id: string;
  version: string;
  status: 'draft' | 'effective' | 'superseded' | 'withdrawn';
  effective_date: string | null;
  approved_at: string | null;
}

export interface SpecificationTest {
  id: string;
  test_name: string;
  test_method: string | null;
  unit: string | null;
  limit_type: LimitType;
  min_value: number | null;
  max_value: number | null;
  expected_text: string | null;
  is_required: boolean;
  sort_order: number;
}

export type SpecResult =
  | { ok: true; id?: string }
  | { ok: false; code: string; message: string };

function toFailure(error: { message?: string } | null, fallback: string): SpecResult {
  const raw = error?.message ?? fallback;
  const m = raw.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/s);
  if (m) return { ok: false, code: m[1], message: m[2].trim() };
  return { ok: false, code: 'SPEC_ERROR', message: raw };
}

/**
 * How a limit reads to a person.
 *
 * Built from the same fields the database judges on, so a screen
 * cannot describe a limit differently from the way it is applied.
 */
export function limitSummary(t: SpecificationTest): string {
  const u = t.unit ? ` ${t.unit}` : '';
  switch (t.limit_type) {
    case 'range':      return `${t.min_value} to ${t.max_value}${u}`;
    case 'min':        return `at least ${t.min_value}${u}`;
    case 'max':        return `at most ${t.max_value}${u}`;
    case 'exact_text': return `exactly “${t.expected_text ?? ''}”`;
    case 'complies':   return 'complies';
    case 'absent':     return 'absent';
    default:           return t.limit_type;
  }
}

export async function listProductSpecifications(
  companyId: string, productId: string,
): Promise<ProductSpecification[]> {
  const { data, error } = await supabase
    .from('product_specifications')
    .select('id, product_id, version, status, effective_date, approved_at')
    .eq('company_id', companyId)
    .eq('product_id', productId)
    .order('effective_date', { ascending: false, nullsFirst: true })
    .order('version', { ascending: false });
  if (error) { logger.error('listProductSpecifications', error); return []; }
  return (data ?? []) as unknown as ProductSpecification[];
}

export async function listSpecificationTests(
  specificationId: string,
): Promise<SpecificationTest[]> {
  const { data, error } = await supabase
    .from('product_specification_tests')
    .select('id, test_name, test_method, unit, limit_type, min_value, max_value, expected_text, is_required, sort_order')
    .eq('specification_id', specificationId)
    .order('sort_order');
  if (error) { logger.error('listSpecificationTests', error); return []; }
  return (data ?? []) as unknown as SpecificationTest[];
}

export async function createDraftSpecification(args: {
  companyId: string; productId: string; version: string; userId?: string | null;
}): Promise<SpecResult> {
  const { data, error } = await supabase
    .from('product_specifications')
    .insert({
      company_id: args.companyId,
      product_id: args.productId,
      version: args.version,
      status: 'draft',
      created_by: args.userId ?? null,
    })
    .select('id')
    .single();
  if (error) return toFailure(error, 'The draft could not be created.');
  return { ok: true, id: String((data as { id: string }).id) };
}

export async function addSpecificationTest(args: {
  specificationId: string;
  testName: string;
  testMethod: string | null;
  unit: string | null;
  limitType: LimitType;
  minValue: number | null;
  maxValue: number | null;
  expectedText: string | null;
  isRequired: boolean;
  sortOrder: number;
}): Promise<SpecResult> {
  const { error } = await supabase.from('product_specification_tests').insert({
    specification_id: args.specificationId,
    test_name: args.testName.trim(),
    test_method: args.testMethod,
    unit: args.unit,
    limit_type: args.limitType,
    //  Sent as null where the limit does not use them, so the CHECK
    //  constraint judges the row the database will actually hold
    //  rather than one padded with zeroes.
    min_value: args.limitType === 'range' || args.limitType === 'min' ? args.minValue : null,
    max_value: args.limitType === 'range' || args.limitType === 'max' ? args.maxValue : null,
    expected_text: args.limitType === 'exact_text' ? args.expectedText : null,
    is_required: args.isRequired,
    sort_order: args.sortOrder,
  });
  if (error) return toFailure(error, 'The test could not be added.');
  return { ok: true };
}

export async function removeSpecificationTest(testId: string): Promise<SpecResult> {
  const { error } = await supabase
    .from('product_specification_tests').delete().eq('id', testId);
  if (error) return toFailure(error, 'The test could not be removed.');
  return { ok: true };
}

/**
 * Approve a draft, fixing it.
 *
 * Refusals worth reading as written:
 *   PRODUCT_SPEC_FORBIDDEN          not a designated QA authority
 *   PRODUCT_SPEC_NO_TESTS           it states no criteria
 *   PRODUCT_SPEC_NOTHING_REQUIRED   it requires nothing, so nothing could be judged
 */
export async function approveSpecification(
  specificationId: string, effectiveDate: string | null,
): Promise<SpecResult> {
  const { error } = await supabase.rpc('product_specification_approve', {
    p_specification_id: specificationId,
    p_effective_date: effectiveDate ?? undefined,
  });
  if (error) {
    logger.warn('[spec] approval refused', { specificationId, error });
    return toFailure(error, 'The specification could not be approved.');
  }
  return { ok: true };
}
