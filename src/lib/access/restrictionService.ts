/**
 * PM-04's individual restrictions, and the per-person history.
 *
 * ── THE TWO HALVES CAME FROM DIFFERENT PLACES ──
 *
 * Restrictions needed a table and got one (20261110000000). The
 * history did not: access_grants already carries granted_at,
 * granted_by, revoked_at, revoked_by, revoke_reason and valid_until,
 * which is the whole of what PM-04's history column prints. Adding a
 * table for it would have been a second record of the same events,
 * which is how two records start disagreeing.
 *
 * ── A RESTRICTION IS NOT A UI STATE ──
 *
 * app_section_access applies an active restriction, so every section
 * guard honours it. Nothing here decides anything: setting one goes
 * through access_restrict(), which checks PM-03's "Change roles and
 * permissions" step, and lifting goes through access_restriction_lift().
 * A refusal arrives as a sentence.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';

export interface RestrictionRow {
  id: string;
  sectionKey: string;
  toLevel: 'view' | 'none';
  reason: string;
  until: string | null;
  setBy: string | null;
  setAt: string;
  liftedAt: string | null;
}

export type RestrictionResult =
  | { ok: true; id?: string }
  | { ok: false; code: string; message: string };

function toFailure(error: { message?: string } | null, fallback: string): RestrictionResult {
  const raw = error?.message ?? fallback;
  const match = raw.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/s);
  if (match) return { ok: false, code: match[1], message: match[2].trim() };
  return { ok: false, code: 'RESTRICTION_ERROR', message: raw };
}

/**
 * Every restriction ever set on a person, lifted ones included.
 *
 * NOT FILTERED TO THE ACTIVE ONES. A restriction that was lifted last
 * week is part of what this panel exists to show; hiding it would make
 * the screen agree with the access check and disagree with the record.
 */
export async function listRestrictions(
  companyId: string, userId: string,
): Promise<RestrictionRow[]> {
  const { data, error } = await supabase
    .from('access_restrictions')
    .select('id, section_key, to_level, reason, until, set_by, set_at, lifted_at')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('set_at', { ascending: false });
  if (error) { logger.error('restrictionService.listRestrictions', error); return []; }
  return ((data as unknown[]) ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      sectionKey: String(row.section_key),
      toLevel: row.to_level as 'view' | 'none',
      reason: String(row.reason ?? ''),
      until: (row.until as string | null) ?? null,
      setBy: (row.set_by as string | null) ?? null,
      setAt: String(row.set_at),
      liftedAt: (row.lifted_at as string | null) ?? null,
    };
  });
}

export async function setRestriction(args: {
  companyId: string;
  userId: string;
  section: string;
  toLevel: 'view' | 'none';
  reason: string;
  until?: string | null;
}): Promise<RestrictionResult> {
  const { data, error } = await supabase.rpc('access_restrict', {
    p_company_id: args.companyId,
    p_user_id: args.userId,
    p_section: args.section,
    p_to_level: args.toLevel,
    p_reason: args.reason,
    p_until: args.until ?? undefined,
  });
  if (error) {
    logger.warn('[restriction] refused', { section: args.section, error });
    return toFailure(error, 'The restriction could not be set.');
  }
  return { ok: true, id: String(data) };
}

export async function liftRestriction(
  restrictionId: string, reason: string,
): Promise<RestrictionResult> {
  const { error } = await supabase.rpc('access_restriction_lift', {
    p_restriction_id: restrictionId,
    p_reason: reason,
  });
  if (error) {
    logger.warn('[restriction] lift refused', { restrictionId, error });
    return toFailure(error, 'The restriction could not be lifted.');
  }
  return { ok: true };
}

// ── History, derived from the records that already exist ────────────

export interface HistoryRow {
  at: string;
  what: string;
  detail: string;
}

/**
 * What has been changed for this person, newest first.
 *
 * Built from access_grants and access_restrictions. Each row of those
 * tables is up to THREE events — granted, revoked, expired — and the
 * history shows the ones that have happened rather than one line per
 * row, because "granted on the 3rd, revoked on the 9th" is two things
 * somebody did and a single line would hide the second.
 *
 * A failed read returns an EMPTY history and says so through `ok`. An
 * empty history and an unreadable one look identical on a screen, and
 * on an access panel that difference matters: one says nothing has
 * been changed for this person.
 */
export async function listAccessHistory(
  companyId: string, userId: string,
): Promise<{ rows: HistoryRow[]; ok: boolean }> {
  const [grants, restrictions] = await Promise.all([
    supabase.from('access_grants')
      .select('section_key, level, granted_at, revoked_at, revoke_reason, valid_until')
      .eq('company_id', companyId).eq('user_id', userId),
    supabase.from('access_restrictions')
      .select('section_key, to_level, reason, until, set_at, lifted_at, lift_reason')
      .eq('company_id', companyId).eq('user_id', userId),
  ]);

  if (grants.error || restrictions.error) {
    logger.error('restrictionService.listAccessHistory', {
      grants: grants.error, restrictions: restrictions.error,
    });
    return { rows: [], ok: false };
  }

  const rows: HistoryRow[] = [];

  for (const g of ((grants.data as unknown[]) ?? [])) {
    const r = g as Record<string, unknown>;
    const section = String(r.section_key ?? '');
    if (r.granted_at) {
      rows.push({
        at: String(r.granted_at),
        what: `Granted ${section} (${String(r.level ?? '')})`,
        detail: r.valid_until ? `Until ${String(r.valid_until)}` : 'No expiry recorded',
      });
    }
    if (r.revoked_at) {
      rows.push({
        at: String(r.revoked_at),
        what: `Revoked ${section}`,
        detail: String(r.revoke_reason ?? 'No reason recorded'),
      });
    }
  }

  for (const x of ((restrictions.data as unknown[]) ?? [])) {
    const r = x as Record<string, unknown>;
    const section = String(r.section_key ?? '');
    rows.push({
      at: String(r.set_at),
      what: `Restricted ${section} to ${String(r.to_level ?? '')}`,
      detail: `${String(r.reason ?? '')}${r.until ? ` · until ${String(r.until)}` : ' · indefinite'}`,
    });
    if (r.lifted_at) {
      rows.push({
        at: String(r.lifted_at),
        what: `Restriction on ${section} lifted`,
        detail: String(r.lift_reason ?? 'No reason recorded'),
      });
    }
  }

  rows.sort((a, b) => b.at.localeCompare(a.at));
  return { rows, ok: true };
}
