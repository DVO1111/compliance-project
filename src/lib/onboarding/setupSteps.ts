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
  /** Invitations sent and not yet accepted. ONB-05 says people who
   *  haven't accepted "show as pending", so a sent invitation is what
   *  completes the step — waiting on someone else's inbox is not an
   *  unfinished setup task. */
  pendingInviteCount: number;
}

export const EMPTY_SETUP_STATE: SetupState = {
  companyName: '',
  industryType: null,
  jurisdiction: null,
  departments: [],
  siteCount: 0,
  modules: [],
  memberCount: 0,
  pendingInviteCount: 0,
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

  const [company, profile, departments, members, membership, sites, invites] = await Promise.all([
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
    (supabase as any)
      .from('company_invites')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('accepted_at', null)
      .is('revoked_at', null),
  ]);

  for (const [what, r] of [
    ['company', company], ['profile', profile], ['departments', departments],
    ['members', members], ['membership', membership], ['sites', sites],
    ['invites', invites],
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
    pendingInviteCount: invites?.count ?? 0,
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
    //  A sent invitation counts. Someone else accepting it is not a
    //  setup task this person can finish, and leaving the row unticked
    //  until they do would read as "your invitation did not send".
    'invite-team': state.memberCount > 1 || state.pendingInviteCount > 0,
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
  /** Public URL of the company logo stored in the avatars bucket. */
  logoUrl?: string;
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
      logo_url: input.logoUrl || null,
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

  // Company Settings is the other place that displays this logo. Keep its
  // existing record in sync, but do not make onboarding fail if an older
  // database does not have that settings table yet: the company profile is
  // still the source used by generated company documents.
  const { error: settingsError } = await (supabase as any)
    .from('company_settings')
    .upsert({
      company_id: companyId,
      logo_url: input.logoUrl || null,
      updated_at: new Date().toISOString(),
    });
  if (settingsError) logger.warn('[setup] company settings logo mirror failed', settingsError.message);

  return { ok: true };
}

/** Reads ONB-01 back, tolerating a database without the new columns. */
export async function loadCompanyDetails(
  companyId: string | null | undefined,
  userId: string | null | undefined,
): Promise<Partial<CompanyDetailsInput>> {
  if (!companyId || !userId) return {};

  const [wide, profile, settings] = await Promise.all([
    (supabase as any).from('companies')
      .select('name, trading_name, cac_registration_number, head_office_address, country, phone, logo_url')
      .eq('id', companyId).maybeSingle(),
    (supabase as any).from('profiles')
      .select('full_name, job_title, phone').eq('id', userId).maybeSingle(),
    (supabase as any).from('company_settings')
      .select('logo_url').eq('company_id', companyId).maybeSingle(),
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
    logoUrl: (company as any)?.logo_url ?? (settings?.data as any)?.logo_url ?? '',
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

// ── ONB-04 · Choose what you'll manage ───────────────────────────────

/**
 * Saves ONB-04.
 *
 * TWO COLUMNS, NOT ONE. `module_access` is what the permission system
 * reads (moduleAccessToPermissions); `onboarding_areas` is what the
 * person actually ticked. They are not the same list and neither can be
 * derived from the other — several areas grant quality_operations, so a
 * screen rebuilt from module_access would tick areas nobody chose.
 *
 * A database without onboarding_areas still gets the permissions, which
 * is the half that changes what the product does. The ticks are what is
 * lost, and they are recoverable by opening the step again.
 */
export async function saveAreas(
  companyId: string,
  userId: string,
  areaIds: string[],
  moduleKeys: string[],
): Promise<SaveResult> {
  if (areaIds.length === 0) {
    return { ok: false, message: 'Switch on at least one area.' };
  }

  const { error } = await (supabase as any)
    .from('company_members')
    .update({ module_access: moduleKeys })
    .eq('company_id', companyId)
    .eq('user_id', userId);

  if (error) return failed('saveAreas.modules', error);

  const areas = await (supabase as any)
    .from('company_members')
    .update({ onboarding_areas: areaIds })
    .eq('company_id', companyId)
    .eq('user_id', userId);

  if (areas.error) {
    if (MISSING_SCHEMA(areas.error)) {
      logger.warn('[setup] onboarding_areas not stored', areas.error.message);
    } else {
      return failed('saveAreas.areas', areas.error);
    }
  }

  return { ok: true };
}

/** Reads back which areas are ticked, or null where nothing is stored. */
export async function loadAreas(
  companyId: string | null | undefined,
  userId: string | null | undefined,
): Promise<string[] | null> {
  if (!companyId || !userId) return null;

  const { data, error } = await (supabase as any)
    .from('company_members')
    .select('onboarding_areas')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    //  Missing column, or no membership row to read. Either way the
    //  screen falls back to the industry's defaults, which is the right
    //  starting point for someone who has not been here before.
    logger.warn('[setup] areas lookup failed', error.message);
    return null;
  }

  const raw = (data as any)?.onboarding_areas;
  return Array.isArray(raw) && raw.length > 0 ? raw : null;
}

// ── ONB-05 · Invite your team ────────────────────────────────────────

export interface TeamInviteInput {
  email: string;
  /** The PRD job title shown on the screen — "QC Analyst". */
  jobTitle: string;
  /** Empty means every site, which is what "All sites" means. */
  siteIds: string[];
  signsApplications: boolean;
}

export interface TeamInviteResult {
  email: string;
  ok: boolean;
  /** Present when the workspace has no mail configured, so the link is
   *  the only way the invitation reaches anybody. */
  link?: string;
  message?: string;
}

/**
 * Sends the invitations ONB-05 collected.
 *
 * EACH PERSON IS SENT INDEPENDENTLY AND REPORTED INDEPENDENTLY. One bad
 * address, or an admin seat limit reached on the third invitee, must not
 * discard the two that worked — the screen shows which went and which
 * did not, and the ones that went are not sent twice when the person
 * fixes the failure and presses the button again.
 *
 * The role passed to create_company_invite is the PERMISSION level, and
 * it is derived from the job title rather than taken from the screen:
 * nothing a person types in a form should decide what they may approve.
 */
export async function sendTeamInvites(
  companyId: string,
  people: TeamInviteInput[],
  moduleKeys: string[],
  permissionRoleFor: (jobTitle: string) => string,
): Promise<TeamInviteResult[]> {
  const results: TeamInviteResult[] = [];

  for (const person of people) {
    const email = person.email.trim().toLowerCase();
    if (!email) continue;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ email, ok: false, message: 'That doesn’t look like an email address.' });
      continue;
    }
    if (!person.jobTitle) {
      results.push({ email, ok: false, message: 'Choose a role for this person.' });
      continue;
    }

    const { data, error } = await (supabase as any).rpc('create_company_invite', {
      p_company_id: companyId,
      p_email: email,
      p_role: permissionRoleFor(person.jobTitle),
      p_module_access: moduleKeys,
      p_department_id: null,
      p_expires_in_hours: 72,
    });

    if (error) {
      logger.error('[setup] invite failed', error);
      results.push({
        email, ok: false,
        message: error.code === '23505'
          ? 'This person has already been invited.'
          : (error.message ?? 'The invitation could not be created.'),
      });
      continue;
    }

    const row = (Array.isArray(data) ? data[0] : data) ?? {};
    const inviteId = (row as any).invite_id;
    const token = (row as any).raw_token;

    //  The sites, the job title and the signatory flag are not
    //  parameters of create_company_invite. They are written onto the
    //  invite it just made, and a trigger carries them onto the
    //  membership when the person accepts.
    if (inviteId) {
      const extras = await (supabase as any)
        .from('company_invites')
        .update({
          site_ids: person.siteIds,
          job_title: person.jobTitle,
          signs_applications: person.signsApplications,
        })
        .eq('id', inviteId);

      if (extras.error) {
        logger.warn('[setup] invite extras not stored', extras.error.message);
      }
    }

    results.push({
      email, ok: true,
      link: token
        ? `${window.location.origin}${appUrl('/invite/accept')}?token=${token}`
        : undefined,
    });
  }

  return results;
}

/**
 * The admin's own row on ONB-05 — "Ada Okafor (you) · admin".
 *
 * They are already a member, so there is nothing to invite. What the row
 * holds is their sites and whether they sign applications, and the
 * second of those is a real control: the signatory register decides
 * whose signature a submission will accept.
 *
 * Adding themselves is allowed because they are an admin, which is the
 * same check the register's own policy makes. Taking themselves off is
 * `removed_at`, never a delete — a register that forgets cannot answer
 * "was this letter signed by someone authorised at the time".
 */
export async function saveOwnTeamRow(
  companyId: string,
  userId: string,
  email: string,
  fullName: string,
  jobTitle: string,
  siteIds: string[],
  signsApplications: boolean,
): Promise<SaveResult> {
  const member = await (supabase as any)
    .from('company_members')
    .update({ site_ids: siteIds, job_title: jobTitle || null })
    .eq('company_id', companyId)
    .eq('user_id', userId);

  if (member.error && !MISSING_SCHEMA(member.error)) {
    return failed('saveOwnTeamRow.member', member.error);
  }

  const existing = await (supabase as any)
    .from('authorised_signatories')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .is('removed_at', null)
    .maybeSingle();

  if (existing.error) {
    if (MISSING_SCHEMA(existing.error)) {
      logger.warn('[setup] signatory register unavailable', existing.error.message);
      return { ok: true };
    }
    return failed('saveOwnTeamRow.read', existing.error);
  }

  const onRegister = Boolean((existing.data as any)?.id);

  if (signsApplications && !onRegister) {
    const { error } = await (supabase as any).from('authorised_signatories').insert({
      company_id: companyId,
      user_id: userId,
      email: email.trim().toLowerCase(),
      full_name: fullName.trim() || null,
      job_title: jobTitle || null,
      added_by: userId,
    });
    if (error) return failed('saveOwnTeamRow.add', error);
  }

  if (!signsApplications && onRegister) {
    const { error } = await (supabase as any)
      .from('authorised_signatories')
      .update({ removed_at: new Date().toISOString(), removed_by: userId })
      .eq('id', (existing.data as any).id);
    if (error) return failed('saveOwnTeamRow.remove', error);
  }

  return { ok: true };
}

/** The sites ONB-05's dropdown offers, newest last. */
export async function loadSiteOptions(
  companyId: string | null | undefined,
): Promise<{ id: string; name: string }[]> {
  if (!companyId) return [];
  const { data, error } = await (supabase as any)
    .from('sites').select('id, name').eq('company_id', companyId).order('created_at');
  if (error) {
    logger.warn('[setup] site options unavailable', error.message);
    return [];
  }
  return ((data as any[]) ?? []).map((s) => ({ id: s.id, name: s.name }));
}

// ── ONB-06 · Review your starting records ────────────────────────────

/**
 * Writes the starter records the person kept.
 *
 * INTO THE ORDINARY TABLES, as ordinary rows. "Seeded records are a
 * starting point, not a constraint: editable and deletable (J3.5)" —
 * so there is no seeded flag, no protection and nothing that
 * re-creates them. Once written they are indistinguishable from
 * records someone typed, which is the point.
 *
 * Each tab is written separately and a failure on one is reported
 * without discarding the others: a workspace whose risk register is
 * missing a column should still get its obligations.
 *
 * NOTHING IS WRITTEN TWICE. The caller passes the ids the person kept
 * and this runs once, on Finish setup. Re-running it would duplicate
 * every row, because these are ordinary records with no natural key.
 */
export async function createStarterRecords(
  companyId: string,
  userId: string,
  records: { tab: string; title: string; write: Record<string, unknown> }[],
): Promise<SaveResult & { written: number }> {
  if (records.length === 0) return { ok: true, written: 0 };

  const byTable = new Map<string, Record<string, unknown>[]>();

  for (const r of records) {
    const table = STARTER_TABLES[r.tab];
    if (!table) continue;

    const row: Record<string, unknown> = { company_id: companyId, ...r.write };

    //  The title column differs by table, and so does whether the table
    //  records who created the row.
    row.title = r.title;
    if (table === 'regulatory_licences') {
      delete row.title;
      row.name = r.title;
      row.created_by = userId;
    }
    if (table === 'risks') row.created_by = userId;

    byTable.set(table, [...(byTable.get(table) ?? []), row]);
  }

  let written = 0;
  const problems: string[] = [];

  for (const [table, rows] of byTable) {
    const { error } = await (supabase as any).from(table).insert(rows);
    if (error) {
      logger.error(`[setup] starter ${table} failed`, error);
      problems.push(table);
      continue;
    }
    written += rows.length;
  }

  if (problems.length > 0 && written === 0) {
    return {
      ok: false, written: 0,
      message: 'None of the starter records could be saved. You can add them later '
        + 'from the dashboard — nothing else in your setup is affected.',
    };
  }

  if (problems.length > 0) {
    logger.warn('[setup] some starter tables were skipped', problems.join(', '));
  }

  return { ok: true, written };
}

/** Tab → table. Kept here so the data file holds no database names. */
const STARTER_TABLES: Record<string, string> = {
  obligations: 'regulatory_obligations',
  licences:    'regulatory_licences',
  policies:    'policies',
  risks:       'risks',
};

// ── ONB-07 · Your workspace is ready ─────────────────────────────────

export interface ReadySummary {
  companyName: string;
  industryTitle: string;
  country: string;
  regulators: string[];
  siteCount: number;
  departmentCount: number;
  productCategoryCount: number;
  areaCount: number;
  starterRecordsKept: number;
  invitesSent: number;
}

/**
 * What ONB-07 says.
 *
 * "No metrics are shown. The summary repeats only what the user
 * entered." So every number here is a count of something the person
 * typed or ticked on one of the six steps. Nothing is computed about
 * their compliance, because they have not used the product yet and any
 * such number would be made up.
 *
 * A failed read leaves its line at zero rather than taking the screen
 * down: this is the last page of setup, and refusing to show it because
 * a count did not come back would be the worst possible moment to fail.
 */
export async function loadReadySummary(
  companyId: string | null | undefined,
  userId: string | null | undefined,
): Promise<Partial<ReadySummary>> {
  if (!companyId) return {};

  const [company, profile, departments, sites, invites, membership] = await Promise.all([
    (supabase as any).from('companies')
      .select('name, country, product_categories').eq('id', companyId).maybeSingle(),
    userId
      ? (supabase as any).from('profiles')
          .select('industry_type, default_jurisdiction, regulators').eq('id', userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    (supabase as any).from('departments')
      .select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    (supabase as any).from('sites')
      .select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    (supabase as any).from('company_invites')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).is('accepted_at', null).is('revoked_at', null),
    userId
      ? (supabase as any).from('company_members')
          .select('onboarding_areas, module_access')
          .eq('company_id', companyId).eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  for (const [what, r] of [
    ['company', company], ['profile', profile], ['departments', departments],
    ['sites', sites], ['invites', invites], ['membership', membership],
  ] as const) {
    if (r?.error) logger.warn(`[setup] ready summary: ${what} unavailable`, r.error.message);
  }

  const c = (company?.data as any) ?? {};
  const p = (profile?.data as any) ?? {};
  const m = (membership?.data as any) ?? {};

  const areas = Array.isArray(m.onboarding_areas) && m.onboarding_areas.length > 0
    ? m.onboarding_areas
    : (Array.isArray(m.module_access) ? m.module_access : []);

  return {
    companyName: c.name ?? '',
    industryTitle: p.industry_type ?? '',
    country: c.country ?? p.default_jurisdiction ?? '',
    regulators: Array.isArray(p.regulators) ? p.regulators : [],
    siteCount: sites?.count ?? 0,
    departmentCount: departments?.count ?? 0,
    productCategoryCount: Array.isArray(c.product_categories) ? c.product_categories.length : 0,
    areaCount: areas.length,
    invitesSent: invites?.count ?? 0,
  };
}
