/**
 * The approved-supplier register.
 *
 * ── WHY THIS EXISTS, AND WHAT IT DELIBERATELY IS NOT ──
 *
 * `supplier-qualification` rendered a `ComingSoonPage`, while three
 * pieces of approved evidence pointed at a real feature behind it:
 *
 *   - `public.suppliers` is a real table with `qualification_status`,
 *     `qualified_until`, code, country and contact, RLS enabled and
 *     company-isolation policies on all four verbs. Only
 *     `materialLotService` read it, as a lookup for lots.
 *   - PM-03 grants `act` on section `suppliers` to Procurement and the
 *     QA Manager, and `view` to four more roles. Those grants had no
 *     page to be exercised on: a permission already stranded, not one
 *     that would be stranded if something were removed.
 *   - HS-01 row 9 says the approved-SUPPLIER LIST stays in the
 *     product, in Settings › Materials and suppliers.
 *
 * So the list is in scope. THE QUALIFICATION WORKFLOW IS NOT: the same
 * HS-01 row 9 excludes supplier qualification from the MVP in as many
 * words. There are no questionnaires here, no audit scheduling, no CMO
 * assessment and no scoring — those are the excluded part. This is a
 * register of who is approved, until when, and by what standing.
 *
 * The status vocabulary is NOT invented either. It is read off
 * `suppliers_qualification_chk`, which has constrained the column to
 * five values since the table was created.
 *
 * No second signature is required to change a standing, because
 * nothing in the approved material states one. `canAct(role,
 * 'suppliers')` from PM-03 is the whole authorisation rule, and it is
 * the grid's own, not a new one.
 */
import { supabase } from '../supabase';
import { logger } from '../logger';

/**
 *  The five values `suppliers_qualification_chk` allows. Taken from
 *  the constraint rather than chosen, so the client cannot offer a
 *  standing the column will refuse.
 */
export const QUALIFICATION_STATUSES = [
  'pending',
  'qualified',
  'conditional',
  'disqualified',
  'suspended',
] as const;

export type QualificationStatus = typeof QUALIFICATION_STATUSES[number];

export const STATUS_LABELS: Record<QualificationStatus, string> = {
  pending: 'Pending',
  qualified: 'Qualified',
  conditional: 'Conditional',
  disqualified: 'Disqualified',
  suspended: 'Suspended',
};

/**
 *  How each standing should read. `conditional` is a warning and not
 *  a pass: a conditionally approved supplier is usable under stated
 *  limits, which a reader needs to notice.
 */
export const STATUS_TONE: Record<QualificationStatus, 'ok' | 'warn' | 'bad' | 'idle'> = {
  qualified: 'ok',
  conditional: 'warn',
  pending: 'idle',
  suspended: 'bad',
  disqualified: 'bad',
};

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  qualification_status: QualificationStatus;
  qualified_until: string | null;
  address: string | null;
  country: string | null;
  contact_email: string | null;
  notes: string | null;
}

const COLUMNS =
  'id, company_id, name, code, qualification_status, qualified_until, '
  + 'address, country, contact_email, notes';

export async function listSuppliers(companyId: string): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .order('name', { ascending: true });
  if (error) {
    logger.error('[suppliers] could not list the register', { error: error.message });
    throw new Error(describeSupplierError(error.message).message);
  }
  return (data ?? []) as unknown as Supplier[];
}

/**
 *  Change a supplier's standing.
 *
 *  Scoped by company as well as by id: RLS already confines the row,
 *  and saying it again means a wrong id cannot silently match nothing
 *  and read as success.
 */
export async function updateQualification(
  companyId: string,
  supplierId: string,
  status: QualificationStatus,
  qualifiedUntil: string | null,
): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .update({
      qualification_status: status,
      qualified_until: qualifiedUntil || null,
    })
    .eq('id', supplierId)
    .eq('company_id', companyId)
    .select(COLUMNS)
    .single();
  if (error) {
    logger.error('[suppliers] could not update a standing', { error: error.message });
    throw new Error(describeSupplierError(error.message).message);
  }
  return data as unknown as Supplier;
}

/**
 *  WHETHER A QUALIFICATION HAS LAPSED IS ARITHMETIC, NOT A STATUS.
 *
 *  `qualified_until` in the past means the approval has run out. This
 *  reports that as a separate fact and does NOT rewrite
 *  `qualification_status` to 'disqualified' — moving a supplier to
 *  disqualified is somebody's decision, and a date passing is not
 *  that decision being taken.
 */
export function hasLapsed(s: Supplier, today = new Date()): boolean {
  if (!s.qualified_until) return false;
  const until = new Date(s.qualified_until);
  if (Number.isNaN(until.getTime())) return false;
  //  Compared by calendar day: an approval valid "until the 31st" is
  //  valid for the whole of the 31st.
  const end = new Date(until.getFullYear(), until.getMonth(), until.getDate());
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return end < now;
}

/** Days until the approval runs out; negative once it has. */
export function daysUntilLapse(s: Supplier, today = new Date()): number | null {
  if (!s.qualified_until) return null;
  const until = new Date(s.qualified_until);
  if (Number.isNaN(until.getTime())) return null;
  const end = Date.UTC(until.getFullYear(), until.getMonth(), until.getDate());
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end - now) / 86_400_000);
}

/**
 *  Whether this supplier may currently be used, as a single answer.
 *
 *  Only `qualified` and `conditional` are usable standings, and a
 *  lapsed approval is not usable whatever the standing says — which
 *  is the point of reporting the lapse separately.
 */
export function isUsable(s: Supplier, today = new Date()): boolean {
  if (hasLapsed(s, today)) return false;
  return s.qualification_status === 'qualified'
    || s.qualification_status === 'conditional';
}

export interface RegisterSummary {
  total: number;
  qualified: number;
  conditional: number;
  lapsed: number;
  blocked: number;
}

export function summarise(list: Supplier[], today = new Date()): RegisterSummary {
  return {
    total: list.length,
    qualified: list.filter((s) => s.qualification_status === 'qualified').length,
    conditional: list.filter((s) => s.qualification_status === 'conditional').length,
    lapsed: list.filter((s) => hasLapsed(s, today)).length,
    blocked: list.filter((s) =>
      s.qualification_status === 'suspended'
      || s.qualification_status === 'disqualified').length,
  };
}

/**
 *  Worst first: a supplier that cannot be used but looks approved is
 *  the one somebody needs to see. Lapsed approvals come before
 *  blocked standings, because a lapse is the silent failure — the
 *  status still reads "Qualified".
 */
export function triage(list: Supplier[], today = new Date()): Supplier[] {
  const rank = (s: Supplier): number => {
    if (hasLapsed(s, today)) return 0;
    if (s.qualification_status === 'suspended') return 1;
    if (s.qualification_status === 'disqualified') return 2;
    if (s.qualification_status === 'conditional') return 3;
    if (s.qualification_status === 'pending') return 4;
    return 5;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function search(list: Supplier[], query: string): Supplier[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((s) =>
    s.name.toLowerCase().includes(q)
    || (s.code ?? '').toLowerCase().includes(q)
    || (s.country ?? '').toLowerCase().includes(q));
}

export function describeSupplierError(raw: string): { code: string; message: string } {
  const text = String(raw ?? '');
  if (text.includes('suppliers_qualification_chk')) {
    return {
      code: 'UNKNOWN_STATUS',
      message: 'That is not one of the standings this register allows.',
    };
  }
  if (text.includes('row-level security') || text.includes('violates row-level')) {
    return {
      code: 'NOT_PERMITTED',
      message: 'You do not have access to this company’s supplier register.',
    };
  }
  return { code: 'UNKNOWN', message: text || 'The supplier register could not be updated.' };
}
