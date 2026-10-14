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
  /** ONB-03 makes the site the thing that completes step 3, not the
   *  department: "at least one manufacturing or warehouse site is
   *  required to continue". */
  siteCount: number;
  modules: string[];
  memberCount: number;
}

export const EMPTY_SETUP_STATE: SetupState = {
  companyName: '',
  industryType: null,
  jurisdiction: null,
  departments: [],
  siteCount: 0,
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

  const [company, profile, departments, members, membership, sites] = await Promise.all([
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
    //  Counted, not listed: the hub only needs to know whether step 3
    //  has been done. A database without the sites table reports the
    //  error, which is logged below and leaves the count at zero.
    (supabase as any)
      .from('sites')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
  ]);

  for (const [what, r] of [
    ['company', company], ['profile', profile], ['departments', departments],
    ['members', members], ['membership', membership], ['sites', sites],
  ] as const) {
    if (r?.error) logger.warn(`[setup] ${what} lookup failed`, r.error.message);
  }

  const rawModules = (membership?.data as any)?.module_access;

  return {
    companyName: (company?.data as any)?.name ?? '',
    industryType: (profile?.data as any)?.industry_type ?? null,
    jurisdiction: (profile?.data as any)?.default_jurisdiction ?? null,
    departments: ((departments?.data as any[]) ?? []).map((d) => ({ id: d.id, name: d.name })),
    siteCount: sites?.count ?? 0,
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
    //  A site, not a department. ONB-03 requires at least one
    //  manufacturing site or warehouse to continue, and departments come
    //  pre-ticked — so ticking on a department would mark the step done
    //  for a workspace that has entered nothing.
    'sites-departments': state.siteCount > 0,
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


// ── ONB-01 · Company details ─────────────────────────────────────────

export interface CompanyDetailsInput {
  legalName: string;
  tradingName: string;
  cacNumber: string;
  headOffice: string;
  country: string;
  phone: string;
  fullName: string;
  jobTitle: string;
}

/**
 * Saves ONB-01.
 *
 * THE COLUMNS IT WRITES DO NOT ALL EXIST ON EVERY DATABASE. `companies`
 * shipped with id, name and created_at only; trading_name,
 * cac_registration_number, head_office_address, country and phone come
 * from 20261018000000_company_profile_fields.sql, and profiles.job_title
 * comes from the same migration.
 *
 * So the write is in two parts. The legal name and the person's own
 * name go first, because those columns are always there. The rest
 * follows, and if the database has not been migrated that second write
 * fails with "column does not exist" — which is reported as what it is,
 * naming the migration, rather than losing the whole step.
 *
 * Half a step saved is the right outcome here: the name is what every
 * other screen shows, and making someone retype it because an address
 * column is missing would be punishing them for a deploy they did not
 * do.
 */
export async function saveCompanyDetails(
  companyId: string,
  userId: string,
  input: CompanyDetailsInput,
): Promise<SaveResult> {
  const legal = input.legalName.trim();
  if (!legal) return { ok: false, message: 'Enter your legal company name.' };

  const base = await (supabase as any)
    .from('companies').update({ name: legal }).eq('id', companyId);
  if (base.error) return failed('saveCompanyDetails.name', base.error);

  const person = await (supabase as any)
    .from('profiles')
    .update({ full_name: input.fullName.trim(), phone: input.phone.trim() || null })
    .eq('id', userId);
  if (person.error) return failed('saveCompanyDetails.profile', person.error);

  const extended = await (supabase as any)
    .from('companies')
    .update({
      trading_name: input.tradingName.trim() || null,
      cac_registration_number: input.cacNumber.trim(),
      head_office_address: input.headOffice.trim(),
      country: input.country,
      phone: input.phone.trim() || null,
    })
    .eq('id', companyId);

  const title = await (supabase as any)
    .from('profiles').update({ job_title: input.jobTitle }).eq('id', userId);

  const missingColumn = (e: any) =>
    e?.code === '42703' || /column .* does not exist|could not find the .* column/i.test(e?.message ?? '');

  if (extended.error || title.error) {
    const e = extended.error ?? title.error;
    if (missingColumn(e)) {
      return {
        ok: false,
        message:
          'Your company name was saved, but the registration number, address and role have ' +
          'nowhere to go on this database yet. Run ' +
          'scripts/fix/add-company-profile-fields.sql in the Supabase SQL editor, then press ' +
          'Continue again.',
      };
    }
    return failed('saveCompanyDetails.extended', e);
  }

  return { ok: true };
}

/** Reads ONB-01 back, tolerating a database without the new columns. */
export async function loadCompanyDetails(
  companyId: string | null | undefined,
  userId: string | null | undefined,
): Promise<Partial<CompanyDetailsInput>> {
  if (!companyId || !userId) return {};

  const [wide, profile] = await Promise.all([
    (supabase as any).from('companies')
      .select('name, trading_name, cac_registration_number, head_office_address, country, phone')
      .eq('id', companyId).maybeSingle(),
    (supabase as any).from('profiles')
      .select('full_name, job_title, phone').eq('id', userId).maybeSingle(),
  ]);

  //  A database without the migration rejects the whole select, so fall
  //  back to the one column that is certainly there rather than showing
  //  an empty form.
  const company = wide?.error
    ? (await (supabase as any).from('companies').select('name').eq('id', companyId).maybeSingle())?.data
    : wide?.data;

  const p = profile?.error ? null : profile?.data;

  return {
    legalName: (company as any)?.name ?? '',
    tradingName: (company as any)?.trading_name ?? '',
    cacNumber: (company as any)?.cac_registration_number ?? '',
    headOffice: (company as any)?.head_office_address ?? '',
    country: (company as any)?.country ?? 'Nigeria',
    phone: (company as any)?.phone ?? (p as any)?.phone ?? '',
    fullName: (p as any)?.full_name ?? '',
    jobTitle: (p as any)?.job_title ?? '',
  };
}

// ── ONB-02 · Industry and where you operate ──────────────────────────

/**
 * Saves ONB-02.
 *
 * industry_type is what the compliance engine reads to decide which
 * obligations apply, and default_jurisdiction what the regulatory
 * profile reads — so this step is the one that makes a workspace stop
 * being generic. primary_markets is kept in step with the jurisdiction
 * so the two cannot disagree.
 *
 * The regulator list needs a column of its own; where that column is
 * missing the rest of the step still saves, because industry and region
 * are what the seeding actually turns on.
 */
export async function saveIndustryAndRegion(
  userId: string,
  industryValue: string,
  jurisdiction: string,
  regulators: string[],
): Promise<SaveResult> {
  const { error } = await (supabase as any)
    .from('profiles')
    .update({
      industry_type: industryValue,
      default_jurisdiction: jurisdiction,
      primary_markets: [jurisdiction],
    })
    .eq('id', userId);

  if (error) return failed('saveIndustryAndRegion', error);

  const withRegulators = await (supabase as any)
    .from('profiles').update({ regulators }).eq('id', userId);

  if (withRegulators.error) {
    //  Not fatal and not worth stopping the flow for: the regulators
    //  follow from the industry, which did save.
    logger.warn('[setup] regulators not stored', withRegulators.error.message);
  }

  return { ok: true };
}

// ── ONB-03 · Sites, departments and products ─────────────────────────

export interface SiteInput {
  /** Absent on a site that has not been saved yet. */
  id?: string;
  name: string;
  siteType: string;
  address: string;
  productCategories: string[];
  notes: string;
}

export interface DepartmentInput {
  id?: string;
  name: string;
  /** Upper-case, 2–8 characters. Goes into CC-{CODE}-{YYYY}-{NNNN}. */
  code: string;
}

export interface SitesStepState {
  sites: SiteInput[];
  departments: DepartmentInput[];
  productCategories: string[];
  /** True when this database has no `sites` table yet. */
  sitesUnavailable: boolean;
}

/**
 * The error PostgREST gives for a table or column this database has not
 * been migrated to have. The sites table and the department code arrive
 * in 20261019000000; a workspace that has not run it must be told what
 * to run, not shown a blank screen.
 */
const MISSING_SCHEMA = (e: any): boolean =>
  e?.code === '42P01' || e?.code === '42703' || e?.code === 'PGRST205' ||
  /does not exist|could not find the/i.test(e?.message ?? '');

export const SITES_MIGRATION_HINT =
  'This workspace’s database doesn’t have the sites table yet. Run ' +
  'scripts/fix/add-sites-and-department-codes.sql in the Supabase SQL editor, then reload.';

/** Reads back everything ONB-03 shows. */
export async function loadSitesStep(
  companyId: string | null | undefined,
): Promise<SitesStepState> {
  const empty: SitesStepState = {
    sites: [], departments: [], productCategories: [], sitesUnavailable: false,
  };
  if (!companyId) return empty;

  const [sites, departments, company] = await Promise.all([
    (supabase as any).from('sites')
      .select('id, name, site_type, address, product_categories, notes')
      .eq('company_id', companyId).order('created_at'),
    (supabase as any).from('departments')
      .select('id, name, code').eq('company_id', companyId).order('name'),
    (supabase as any).from('companies')
      .select('product_categories').eq('id', companyId).maybeSingle(),
  ]);

  if (sites?.error) logger.warn('[setup] sites lookup failed', sites.error.message);
  if (departments?.error) logger.warn('[setup] departments lookup failed', departments.error.message);

  //  A department list read without the code column still has names, so
  //  fall back rather than losing the whole card.
  const deptRows = departments?.error
    ? ((await (supabase as any).from('departments').select('id, name')
        .eq('company_id', companyId).order('name'))?.data ?? [])
    : (departments?.data ?? []);

  return {
    sites: ((sites?.data as any[]) ?? []).map((s) => ({
      id: s.id,
      name: s.name ?? '',
      siteType: s.site_type ?? 'manufacturing',
      address: s.address ?? '',
      productCategories: Array.isArray(s.product_categories) ? s.product_categories : [],
      notes: s.notes ?? '',
    })),
    departments: (deptRows as any[]).map((d) => ({
      id: d.id, name: d.name ?? '', code: d.code ?? '',
    })),
    productCategories: Array.isArray((company?.data as any)?.product_categories)
      ? (company!.data as any).product_categories
      : [],
    sitesUnavailable: Boolean(sites?.error && MISSING_SCHEMA(sites.error)),
  };
}

/**
 * Saves ONB-03 in one act.
 *
 * The screen holds the whole list while it is being edited — adding a
 * site, changing its type, removing one — and writes the result on
 * Continue. So this RECONCILES rather than appends: rows the person
 * removed are deleted, rows they changed are updated, new rows are
 * inserted.
 *
 * A reconcile is the right shape here because the alternative, saving
 * each edit as it happens, leaves half a site in the database when
 * someone closes the tab mid-form — and a site is the axis that batch
 * records hang off, so a half-made one is worse than none.
 *
 * Departments are the same list, with one difference: a department that
 * already exists is never deleted here. It may already have issued
 * document numbers, and deleting it would orphan them. Unticking a
 * suggested chip that was never saved simply does not create it.
 */
export async function saveSitesStep(
  companyId: string,
  sites: SiteInput[],
  departments: DepartmentInput[],
  productCategories: string[],
  existing: SitesStepState,
): Promise<SaveResult> {
  const named = sites.filter((s) => s.name.trim().length > 0);

  // ── sites ──────────────────────────────────────────────────────────
  const keptIds = new Set(named.map((s) => s.id).filter(Boolean) as string[]);
  const removed = existing.sites
    .map((s) => s.id)
    .filter((id): id is string => typeof id === 'string' && !keptIds.has(id));

  if (removed.length > 0) {
    const { error } = await (supabase as any).from('sites').delete().in('id', removed);
    if (error) return failed('saveSitesStep.delete', error);
  }

  for (const site of named) {
    const row = {
      company_id: companyId,
      name: site.name.trim(),
      site_type: site.siteType,
      address: site.address.trim() || null,
      product_categories: site.productCategories,
      notes: site.notes.trim() || null,
    };
    const { error } = site.id
      ? await (supabase as any).from('sites').update(row).eq('id', site.id)
      : await (supabase as any).from('sites').insert(row);

    if (error) {
      if (MISSING_SCHEMA(error)) return { ok: false, message: SITES_MIGRATION_HINT };
      if (error.code === '23505') {
        return { ok: false, message: `You already have a site called “${row.name}”.` };
      }
      return failed('saveSitesStep.site', error);
    }
  }

  // ── departments ────────────────────────────────────────────────────
  const known = new Map(existing.departments.map((d) => [d.name.trim().toLowerCase(), d]));

  for (const dept of departments) {
    const name = dept.name.trim();
    if (!name) continue;
    const code = dept.code.trim().toUpperCase();
    const already = known.get(name.toLowerCase());

    const { error } = already?.id
      ? await (supabase as any).from('departments').update({ code: code || null }).eq('id', already.id)
      : await (supabase as any).from('departments')
          .insert({ company_id: companyId, name, code: code || null });

    if (error) {
      //  A database without departments.code: the department itself is
      //  what matters, so store it with the name alone and carry on.
      if (MISSING_SCHEMA(error)) {
        if (!already?.id) {
          const retry = await (supabase as any).from('departments')
            .insert({ company_id: companyId, name });
          if (retry.error && retry.error.code !== '23505') {
            return failed('saveSitesStep.department', retry.error);
          }
        }
        logger.warn('[setup] department code not stored', error.message);
        continue;
      }
      if (error.code === '23505') continue;  // already there, nothing to do
      return failed('saveSitesStep.department', error);
    }
  }

  // ── what the company makes ─────────────────────────────────────────
  const categories = await (supabase as any).from('companies')
    .update({ product_categories: productCategories }).eq('id', companyId);

  if (categories.error) {
    if (MISSING_SCHEMA(categories.error)) {
      //  Not fatal: the sites and departments, which is what the next
      //  steps read, are stored.
      logger.warn('[setup] product categories not stored', categories.error.message);
    } else {
      return failed('saveSitesStep.categories', categories.error);
    }
  }

  return { ok: true };
}
