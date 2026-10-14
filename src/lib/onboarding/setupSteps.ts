/**
 * The onboarding steps, as data the product actually holds.
 *
 * The hub used to be a list of titles with nowhere to type. This is the
 * part that makes each row do something: read what is already stored,
 * write what the person enters, and report completion from the stored
 * value rather than from having visited a screen.
 *
 * WHAT EACH STEP WRITES, AND WHERE IT SHOWS UP
 * --------------------------------------------
 *   company details       companies.name           — the workspace name
 *                                                    on every screen
 *   industry and region   profiles.industry_type,
 *                         .default_jurisdiction,
 *                         .primary_markets         — drives which
 *                                                    regulators and
 *                                                    obligations load
 *   sites and departments departments              — document numbering
 *                                                    and who raises
 *                                                    records
 *   module choice         company_members
 *                         .module_access           — which parts of the
 *                                                    product appear
 *
 * WHAT IS NOT HERE, AND WHY. The design asks step 1 for a CAC
 * registration number and a head office. `companies` holds id, name and
 * created_at and nothing else, so there is nowhere to put either, and a
 * form that accepted them would be a form that threw the answers away.
 * The step collects the company name, which does exist, and says so.
 * Adding those columns is a migration against a live database — a
 * deliberate act, not something to slip into a form.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';
import { appUrl } from '../routing';

export interface SetupState {
  companyName: string;
  industryType: string | null;
  jurisdiction: string | null;
  departments: { id: string; name: string }[];
  modules: string[];
  memberCount: number;
}

export const EMPTY_SETUP_STATE: SetupState = {
  companyName: '',
  industryType: null,
  jurisdiction: null,
  departments: [],
  modules: [],
  memberCount: 0,
};

/**
 * Everything the hub needs, in one round trip's worth of parallel
 * queries. A failure in any one of them leaves that part empty rather
 * than taking the screen down: a person who cannot read their
 * department list can still set their industry.
 */
export async function loadSetupState(
  companyId: string | null | undefined,
  userId: string | null | undefined,
): Promise<SetupState> {
  if (!companyId) return EMPTY_SETUP_STATE;

  const [company, profile, departments, members, membership] = await Promise.all([
    (supabase as any).from('companies').select('name').eq('id', companyId).maybeSingle(),
    userId
      ? (supabase as any)
          .from('profiles')
          .select('industry_type, default_jurisdiction')
          .eq('id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    (supabase as any)
      .from('departments')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name'),
    (supabase as any)
      .from('company_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('company_id', companyId),
    userId
      ? (supabase as any)
          .from('company_members')
          .select('module_access')
          .eq('company_id', companyId)
          .eq('user_id', userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  for (const [what, r] of [
    ['company', company], ['profile', profile], ['departments', departments],
    ['members', members], ['membership', membership],
  ] as const) {
    if (r?.error) logger.warn(`[setup] ${what} lookup failed`, r.error.message);
  }

  const rawModules = (membership?.data as any)?.module_access;

  return {
    companyName: (company?.data as any)?.name ?? '',
    industryType: (profile?.data as any)?.industry_type ?? null,
    jurisdiction: (profile?.data as any)?.default_jurisdiction ?? null,
    departments: ((departments?.data as any[]) ?? []).map((d) => ({ id: d.id, name: d.name })),
    modules: Array.isArray(rawModules) ? rawModules : [],
    memberCount: members?.count ?? 0,
  };
}

/**
 * Which steps are done, decided ONLY by what is stored.
 *
 * Nothing here records that a screen was opened. A step is done when the
 * product can show you the thing it asked for, which is the only claim a
 * progress bar is entitled to make.
 */
export function completedFromState(state: SetupState): Record<string, boolean> {
  return {
    'company-details': state.companyName.trim().length > 0,
    'industry-region': Boolean(state.industryType && state.jurisdiction),
    'sites-departments': state.departments.length > 0,
    'modules': state.modules.length > 0,
    'invite-team': state.memberCount > 1,
    //  Reviewing the pre-loaded records is an act, not a stored fact.
    //  Nothing in the database distinguishes "read and kept" from "never
    //  opened", so this one is never ticked automatically.
    'review-records': false,
  };
}

export type SaveResult = { ok: true } | { ok: false; message: string };

function failed(where: string, error: unknown): SaveResult {
  const message = (error as any)?.message ?? 'Something went wrong.';
  logger.error(`[setup] ${where} failed`, error);
  return { ok: false, message };
}

export async function saveCompanyName(companyId: string, name: string): Promise<SaveResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: 'Enter your company’s legal name.' };
  const { error } = await (supabase as any)
    .from('companies').update({ name: trimmed }).eq('id', companyId);
  return error ? failed('saveCompanyName', error) : { ok: true };
}

export async function saveIndustryRegion(
  userId: string, industryType: string, jurisdiction: string,
): Promise<SaveResult> {
  if (!industryType) return { ok: false, message: 'Choose your industry.' };
  if (!jurisdiction) return { ok: false, message: 'Choose where you operate.' };
  const { error } = await (supabase as any)
    .from('profiles')
    .update({
      industry_type: industryType,
      default_jurisdiction: jurisdiction,
      //  Kept in step with the jurisdiction so the wizard and the profile
      //  screen do not hold two different ideas of the same workspace.
      primary_markets: [jurisdiction],
    })
    .eq('id', userId);
  return error ? failed('saveIndustryRegion', error) : { ok: true };
}

export async function addDepartment(companyId: string, name: string): Promise<SaveResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: 'Enter a department name.' };
  const { error } = await (supabase as any)
    .from('departments').insert({ company_id: companyId, name: trimmed });
  return error ? failed('addDepartment', error) : { ok: true };
}

export async function removeDepartment(id: string): Promise<SaveResult> {
  const { error } = await (supabase as any).from('departments').delete().eq('id', id);
  return error ? failed('removeDepartment', error) : { ok: true };
}

export async function saveModules(
  companyId: string, userId: string, keys: string[],
): Promise<SaveResult> {
  if (keys.length === 0) {
    return { ok: false, message: 'Choose at least one part of Criateur to switch on.' };
  }
  const { error } = await (supabase as any)
    .from('company_members')
    .update({ module_access: keys })
    .eq('company_id', companyId)
    .eq('user_id', userId);
  return error ? failed('saveModules', error) : { ok: true };
}

/**
 * Marks onboarding as finished for this user.
 *
 * The hub replaces the older wizard, and the wizard is what used to set
 * this flag. Without it, leaving the hub would drop the person straight
 * into "Welcome aboard" — the screen the hub exists to replace — on
 * their next visit.
 *
 * A failure is logged and swallowed: the flag is a routing convenience,
 * and refusing to open the workspace because it could not be written
 * would be a worse outcome than seeing the wizard once.
 */
export async function markOnboardingComplete(userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('profiles').update({ onboarding_completed: true }).eq('id', userId);
  if (error) logger.warn('[setup] could not mark onboarding complete', error.message);
}

/** The roles create_company_invite accepts, in the order the team screen
 *  offers them. `viewer` is the least privileged and is the default. */
export const INVITE_ROLES = ['viewer', 'marketing', 'legal', 'admin'] as const;
export type InviteRole = typeof INVITE_ROLES[number];

/**
 * Invites someone to the company.
 *
 * Goes through create_company_invite, the same RPC the team screen uses,
 * rather than writing company_invites directly: the RPC mints and hashes
 * the token, sets the expiry and checks the caller may invite at all.
 * A second definition of "an invite" is the last thing this needs.
 *
 * Returns the acceptance link when the RPC hands one back, because on a
 * workspace with no mail configured that link is the only way the
 * invitation reaches anybody.
 */
export async function inviteTeammate(
  companyId: string,
  email: string,
  role: string,
  moduleKeys: string[],
): Promise<SaveResult & { link?: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes('@')) return { ok: false, message: 'Enter a valid email address.' };
  if (moduleKeys.length === 0) {
    return { ok: false, message: 'Choose at least one module for this person.' };
  }

  const { data, error } = await (supabase as any).rpc('create_company_invite', {
    p_company_id: companyId,
    p_email: trimmed,
    p_role: role,
    p_module_access: moduleKeys,
    p_department_id: null,
    p_expires_in_hours: 72,
  });

  if (error) return failed('inviteTeammate', error);

  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  const token = (row as any).raw_token;
  return token
    //  Through appUrl: on a site served under a path prefix, a link to
    //  /invite/accept points at the wrong host root and the invitation
    //  is dead on arrival.
    ? { ok: true, link: `${window.location.origin}${appUrl('/invite/accept')}?token=${token}` }
    : { ok: true };
}
