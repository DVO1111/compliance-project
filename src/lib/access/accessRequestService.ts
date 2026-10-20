/**
 * Asking for access, and deciding on it — the data layer for W2-0.
 *
 * Every write here is one RPC call. There is no `.insert()` and no
 * `.update()` in this file, and that is not a style choice: the tables
 * carry a SELECT policy and nothing else, so a direct write lands
 * nowhere. The duties check, the cap on a grant's length, "nobody
 * decides their own request" and "one live grant per section" all live
 * in `access_request_raise` and `access_decide`, where a crafted POST
 * still has to go through them.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not re-run the conflict check
 * before calling — `permissionRequests.checkConflict` is for the UI, so
 * a radio can be disabled and a drawer can say why. Checking here as
 * well would be a third copy of the rule and the one most likely to
 * drift, since nothing renders it. The database has the only copy that
 * counts.
 *
 * ERRORS ARE TRANSLATED, NOT SWALLOWED. The functions raise with
 * machine-readable prefixes — ACCESS_DECIDE_DUTY_CONFLICT and the rest
 * — and `describeError` turns them into the sentence a person should
 * read. An untranslated one is returned as-is rather than replaced with
 * "Something went wrong", because a message nobody can act on is worse
 * than a slightly technical one.
 */

import { logger } from '../logger';
import type {
  AccessSection, AccessLevel, WorkRole, AccessRequestInput, Decision,
} from './permissionRequests';

/**
 * The client, loosely typed.
 *
 * `database.types.ts` is generated from the deployed schema and does
 * not yet know these five tables, so every `.from('access_…')` is a
 * type error until it is regenerated. The project's existing services
 * widen at the call site — `(supabase as any).from('capa_records')` —
 * which scatters the cast and loses it the moment somebody copies a
 * line. Widening once here keeps it to a single place with a single
 * reason, and the row shapes above are still checked: `PermissionRequestRow`
 * and `GrantRow` are declared, not inferred, so a column renamed in the
 * migration breaks the screens that read it.
 *
 * Regenerating the types removes the need for this. Until then, the
 * SQL suite is what holds the shapes honest.
 */
async function db() {
  const { supabase } = await import('../supabase');
  return supabase;
}

/* ── What comes back ───────────────────────────────────────────────── */

export type RequestStatus =
  | 'waiting' | 'granted' | 'granted_narrowed' | 'declined' | 'withdrawn';

export interface PermissionRequestRow {
  id: string;
  company_id: string;
  reference: string;
  requested_by: string;
  work_role: WorkRole;
  section_key: AccessSection;
  level: AccessLevel;
  scope: string;
  requested_until: string | null;
  reason: string;
  status: RequestStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  granted_level: AccessLevel | null;
  granted_scope: string | null;
  granted_until: string | null;
  created_at: string;
}

export interface GrantRow {
  id: string;
  company_id: string;
  user_id: string;
  section_key: AccessSection;
  level: AccessLevel;
  scope: string;
  valid_until: string | null;
  request_id: string | null;
  granted_by: string;
  granted_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export type AccessResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

/* ── Turning a raised exception into something to read ─────────────── */

const MESSAGES: Record<string, string> = {
  ACCESS_REQUEST_NOT_SIGNED_IN:  'Sign in again — your session has expired.',
  ACCESS_REQUEST_NOT_A_MEMBER:   'You are not a member of this workspace.',
  ACCESS_REQUEST_UNKNOWN_SECTION:'That section does not exist.',
  ACCESS_REQUEST_NOT_REQUESTABLE:'This section cannot be requested.',
  ACCESS_REQUEST_BAD_LEVEL:      'Pick either View or Act.',
  ACCESS_REQUEST_DUTY_CONFLICT:  'Segregation of duties does not allow this.',
  ACCESS_REQUEST_NO_REASON:      'Say why you need it — the admin sees this as you write it.',
  ACCESS_REQUEST_END_DATE_PAST:  'That end date has already passed.',
  ACCESS_REQUEST_TOO_LONG:       'That is longer than a temporary grant may run.',
  ACCESS_REQUEST_ALREADY_WAITING:
    'You already have a request waiting for this section. The admin will see one, not two.',

  ACCESS_DECIDE_NOT_SIGNED_IN:   'Sign in again — your session has expired.',
  ACCESS_DECIDE_NOT_FOUND:       'That request no longer exists.',
  ACCESS_DECIDE_NOT_A_MEMBER:    'You are not a member of this workspace.',
  ACCESS_DECIDE_ALREADY_DECIDED: 'Somebody has already decided this one.',
  ACCESS_DECIDE_OWN_REQUEST:     'You cannot decide your own request.',
  ACCESS_DECIDE_NO_REASON:       'Say why, so the person knows what to do next.',
  ACCESS_DECIDE_NO_NOTE:
    'A note is required when you change the request, so the person knows what they got.',
  ACCESS_DECIDE_NOTHING_NARROWED:
    'Nothing was narrowed. Use "Grant as asked", or shorten the time or the records.',
  ACCESS_DECIDE_WIDENS_REQUEST:
    'This would give more than was asked for. Act has to be requested, not added.',
  ACCESS_DECIDE_DUTY_CONFLICT:   'Segregation of duties does not allow this.',
  ACCESS_DECIDE_NOT_REQUESTABLE: 'This section cannot be granted this way.',
  ACCESS_DECIDE_END_DATE_PAST:   'That end date has already passed.',
  ACCESS_DECIDE_TOO_LONG:        'That is longer than a temporary grant may run.',
  ACCESS_DECIDE_EXISTING_GRANT:
    'They already hold a grant on this section. Change that one rather than adding a second.',

  ACCESS_REVOKE_NOT_SIGNED_IN:   'Sign in again — your session has expired.',
  ACCESS_REVOKE_NO_REASON:       'Say why the access is being removed.',
  ACCESS_REVOKE_NOT_FOUND:       'That grant no longer exists.',
  ACCESS_REVOKE_NOT_A_MEMBER:    'You are not a member of this workspace.',
  ACCESS_REVOKE_ALREADY_REVOKED: 'That grant has already been removed.',
};

/**
 * The code, and a sentence for it.
 *
 * The database raises `CODE: detail` where the detail is often the
 * reason itself — the duties rule's own words. Where there is one, it
 * is preferred over the generic sentence above, because "A QC analyst
 * tests the material..." tells somebody what to do and "Segregation of
 * duties does not allow this" does not.
 */
export function describeError(raw: string): { code: string; message: string } {
  const match = /\b(ACCESS_[A-Z_]+)(?::\s*(.*))?/s.exec(raw ?? '');
  if (!match) return { code: 'ACCESS_UNKNOWN', message: raw || 'That did not work.' };

  const [, code, detail] = match;
  const explained = detail?.trim();
  return {
    code,
    message: explained && explained.length > 0
      ? explained
      : MESSAGES[code] ?? raw,
  };
}

function fail<T>(where: string, error: unknown): AccessResult<T> {
  const raw = (error as { message?: string })?.message ?? String(error);
  const { code, message } = describeError(raw);
  logger.error(`accessRequestService.${where}`, { code, raw });
  return { ok: false, code, message };
}

/* ── Reading ───────────────────────────────────────────────────────── */

/** Everything waiting on an admin, oldest first — PM-01's top card. */
export async function listWaiting(companyId: string): Promise<PermissionRequestRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('access_permission_requests')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'waiting')
    //  Oldest first, which is what "Oldest: 2 hours" at the top of the
    //  page is counting. A newest-first queue quietly starves the one
    //  person who has been waiting longest.
    .order('created_at', { ascending: true });

  if (error) { logger.error('accessRequestService.listWaiting', error); return []; }
  return (data ?? []) as PermissionRequestRow[];
}

/** PM-01's second card. */
export async function listDecided(
  companyId: string, limit = 20,
): Promise<PermissionRequestRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('access_permission_requests')
    .select('*')
    .eq('company_id', companyId)
    .neq('status', 'waiting')
    .order('decided_at', { ascending: false })
    .limit(limit);

  if (error) { logger.error('accessRequestService.listDecided', error); return []; }
  return (data ?? []) as PermissionRequestRow[];
}

/**
 * What one person can open, now.
 *
 * Reads the view rather than the table, so a grant whose end date has
 * passed is already gone. Doing the date arithmetic here instead would
 * mean a browser with a wrong clock could show access that has lapsed.
 */
export async function listActiveGrants(
  companyId: string, userId: string,
): Promise<GrantRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('access_grants_active')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId);

  if (error) { logger.error('accessRequestService.listActiveGrants', error); return []; }
  return (data ?? []) as GrantRow[];
}

/** The person's own requests, so a locked tile can say "Requested". */
export async function listMyRequests(
  companyId: string, userId: string,
): Promise<PermissionRequestRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('access_permission_requests')
    .select('*')
    .eq('company_id', companyId)
    .eq('requested_by', userId)
    .order('created_at', { ascending: false });

  if (error) { logger.error('accessRequestService.listMyRequests', error); return []; }
  return (data ?? []) as PermissionRequestRow[];
}

/* ── Writing ───────────────────────────────────────────────────────── */

/** Step 1–2: the person asks. DB-03's Send request. */
export async function raiseRequest(params: {
  companyId: string;
  workRole: WorkRole;
  request: AccessRequestInput;
}): Promise<AccessResult<PermissionRequestRow>> {
  const { companyId, workRole, request } = params;
  try {
    const supabase = await db();
    const { data, error } = await supabase.rpc('access_request_raise', {
      p_company_id: companyId,
      p_section_key: request.section,
      p_level: request.level,
      p_scope: request.scope,
      //  `access_request_raise` gives p_until no DEFAULT, so the
      //  generated types call it `string` — the generator has no way
      //  to say "required, and may be NULL". The SQL parameter is
      //  plain `date` and an open-ended request passes NULL for it,
      //  which is the commonest case. The cast says that, rather than
      //  inventing a date or an empty string the function would then
      //  have to parse.
      p_until: request.until as unknown as string,
      p_reason: request.reason,
      p_work_role: workRole,
    });
    if (error) return fail('raiseRequest', error);
    return { ok: true, data: data as PermissionRequestRow };
  } catch (e) {
    return fail('raiseRequest', e);
  }
}

/** Step 4: the admin decides. PM-02's footer button. */
export async function decide(
  requestId: string, decision: Decision,
): Promise<AccessResult<PermissionRequestRow>> {
  //  The Decision union the UI carries and the three words the function
  //  takes are mapped here, in one place. The UI's names describe what
  //  the admin chose; the function's describe what it does.
  //  `undefined`, not `null`. access_decide gives p_level, p_scope,
  //  p_until and p_note DEFAULT NULL; PostgREST omits an undefined key
  //  so the default applies, and sends an explicit null for a null —
  //  which for these four happens to be the same value, and for a
  //  parameter with a real default (material_lot_record_sampling's
  //  p_sampled_on DEFAULT current_date) is not.
  const args = decision.kind === 'decline'
    ? { p_decision: 'decline', p_level: undefined, p_scope: undefined,
        p_until: undefined, p_note: decision.reason }
    : decision.kind === 'grant_as_asked'
      ? { p_decision: 'grant', p_level: undefined, p_scope: undefined,
          p_until: undefined, p_note: undefined }
      : {
        p_decision: 'narrow',
        p_level: decision.level,
        p_scope: decision.scope,
        p_until: decision.until ?? undefined,
        p_note: decision.note,
      };

  try {
    const supabase = await db();
    const { data, error } = await supabase.rpc('access_decide', {
      p_request_id: requestId, ...args,
    });
    if (error) return fail('decide', error);
    return { ok: true, data: data as PermissionRequestRow };
  } catch (e) {
    return fail('decide', e);
  }
}

/** Step 5: restrict, pause or revoke. PM-04. */
export async function revokeGrant(
  grantId: string, reason: string,
): Promise<AccessResult<GrantRow>> {
  try {
    const supabase = await db();
    const { data, error } = await supabase.rpc('access_grant_revoke', {
      p_grant_id: grantId, p_reason: reason,
    });
    if (error) return fail('revokeGrant', error);
    return { ok: true, data: data as GrantRow };
  } catch (e) {
    return fail('revokeGrant', e);
  }
}

/* ── The reference data the screens need ───────────────────────────── */

export interface SectionRow {
  key: AccessSection;
  label: string;
  unrequestable_reason: string | null;
  sort_order: number;
}

/**
 * The sections, from the database.
 *
 * permissionRequests.ts carries the same list as constants, and that is
 * deliberate rather than an oversight: the constants let a dialog
 * render and a test run with no network, and this reads the list that
 * actually governs. They are checked against each other in
 * src/tests/accessSections.test.ts, so a section added in a migration
 * and not in the module fails a test rather than showing a raw key on
 * screen.
 */
export async function listSections(): Promise<SectionRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('access_sections')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) { logger.error('accessRequestService.listSections', error); return []; }
  return (data ?? []) as SectionRow[];
}

/** How long a grant may run here. Configuration, not a constant. */
export async function maxGrantDays(companyId: string): Promise<number> {
  const supabase = await db();
  const { data, error } = await supabase.rpc('access_max_grant_days', {
    p_company_id: companyId,
  });
  if (error) {
    logger.error('accessRequestService.maxGrantDays', error);
    //  The module's own default, so a failed read shortens nothing and
    //  lengthens nothing.
    const { MAX_GRANT_DAYS } = await import('./permissionRequests');
    return MAX_GRANT_DAYS;
  }
  return (data as number) ?? 90;
}
