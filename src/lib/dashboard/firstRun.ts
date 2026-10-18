/**
 * ONB-08 · The dashboard after setup.
 *
 * THE ONE RULE THIS SCREEN IS BUILT AROUND, written on the design
 * itself: "Fills in as you work. Nothing is shown until there is real
 * data behind it."
 *
 * So every tile on this screen has two states and no third. Either a
 * figure, computed from rows that exist, or an em-dash and one sentence
 * saying what would have to happen for a figure to appear. There is no
 * zero-as-placeholder, because "0 open deviations" and "we have never
 * looked" are different claims and a workspace on its first morning is
 * making the second one. A dashboard that rounds the second down to the
 * first is the reason people stop trusting dashboards.
 *
 * It is also why nothing here is a score, a percentage or a readiness
 * rating. ONB-07 established that (see loadReadySummary) and this screen
 * inherits it: the workspace has been set up, not used.
 *
 * WHY THE COUNTS ARE COMPANY-WIDE. The design heads the tiles "Ibadan
 * plant at a glance" with a site picker above them. None of
 * batch_records, capa_records, raw_material_receipts or
 * regulatory_licences carries a site_id yet — only the team and
 * signatory tables do. With one site the heading is simply true, so it
 * is used as drawn. With more than one, `glanceScope` says plainly that
 * the figures are the whole workspace's rather than quietly attributing
 * them to the plant that happens to be selected.
 *
 * A MISSING TABLE IS NOT AN ERROR HERE. Several of these modules install
 * with their own migration, and a workspace that has not run one yet
 * should see "appears after your first batch", not a broken dashboard.
 * Every count fails to `null`, which is the same thing the screen says
 * when the table is there and empty.
 */

import { supabase } from '../supabase';
import { logger } from '../logger';

// ── Who sees this dashboard ──────────────────────────────────────────
//
//  EVERYONE. There was a gate here that chose between this dashboard
//  and the older DashboardPage by the industry on the signed-in
//  person's profile, and it was removed rather than corrected.
//
//  It could not be made right. That field is written once, at sign-up,
//  from a list that still offers "Advertising & Marketing Agency",
//  "Financial Services" and "Logistics & Courier" — answers to a
//  question this product stopped asking when it became a NAFDAC
//  compliance tool. An account made before that carried an answer from
//  a different product, and it silently decided which dashboard the
//  whole workspace saw. Both directions of the rule failed the same
//  way: no error, no log, just a different screen than the one the
//  person expected, with nothing to suggest a reason.
//
//  Criateur onboards regulated manufacturers. This is their dashboard.

// ── What the screen is given ─────────────────────────────────────────

/** A count that could not be taken at all — no table, or no read. */
type Count = number | null;

export interface WorkspaceCounts {
  products: Count;
  batchesTotal: Count;
  batchesInProgress: Count;
  capasTotal: Count;
  capasOpen: Count;
  receiptsTotal: Count;
  receiptsQuarantined: Count;
  licencesTotal: Count;
  licencesWithExpiry: Count;
  licencesExpiring12mo: Count;
  /** Obligations, policies and risks together — what ONB-06 writes. */
  starterRecords: Count;
  invitesPending: Count;
  invitesAccepted: Count;
  /** The addresses still outstanding, for the Invitations row. */
  pendingInvitees: string[];
}

export const NO_COUNTS: WorkspaceCounts = {
  products: null,
  batchesTotal: null, batchesInProgress: null,
  capasTotal: null, capasOpen: null,
  receiptsTotal: null, receiptsQuarantined: null,
  licencesTotal: null, licencesWithExpiry: null, licencesExpiring12mo: null,
  starterRecords: null,
  invitesPending: null, invitesAccepted: null, pendingInvitees: [],
};

export interface Site { id: string; name: string }

export interface WorkspaceOverview extends WorkspaceCounts {
  companyName: string;
  /** The signed-in person's full name, for "Welcome, Ada". */
  fullName: string;
  setupComplete: boolean;
  sites: Site[];
}

// ── "Welcome, Ada" ───────────────────────────────────────────────────

/**
 * The FIRST name only, because that is what the design greets with and
 * because "Welcome, Ada Okafor" reads like a letter from a bank.
 *
 * An empty name gets "Welcome back" rather than "Welcome, " — a greeting
 * with a hole in it is worse than a greeting without a name.
 */
export function greeting(fullName: string | null | undefined): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  return first ? `Welcome, ${first}` : 'Welcome back';
}

// ── The site picker and the heading under it ─────────────────────────

export interface GlanceScope {
  /** "Ibadan plant at a glance". */
  heading: string;
  /**
   * Set only when the heading would otherwise over-claim: more than one
   * site exists but the figures below are not split by site.
   */
  caveat?: string;
}

export function glanceScope(sites: Site[], selectedSiteId: string | null): GlanceScope {
  const selected = sites.find((s) => s.id === selectedSiteId);

  //  No sites recorded: there is no plant to name, so the workspace is
  //  the scope and the heading says so.
  if (sites.length === 0) return { heading: 'Your workspace at a glance' };

  //  One site. The company's figures ARE that site's figures, so the
  //  design's heading is accurate with nothing added.
  if (sites.length === 1) return { heading: `${sites[0].name} at a glance` };

  if (!selected) return { heading: 'All sites at a glance' };

  return {
    heading: `${selected.name} at a glance`,
    caveat: 'These figures cover the whole workspace. Batches, deviations and '
      + 'materials are not yet recorded against a site, so they cannot be split by plant.',
  };
}

// ── The four tiles ───────────────────────────────────────────────────

export type TileKey = 'batches' | 'deviations' | 'quarantine' | 'licences';

export interface Tile {
  key: TileKey;
  label: string;
  /** null means "no data behind it" — the screen draws an em-dash. */
  value: number | null;
  /** One line, always present: why there is no figure, or what the figure counts. */
  caption: string;
}

/**
 * Each tile's empty caption is the design's own wording, and each one
 * names the event that would produce a figure. They are not
 * interchangeable: "None raised yet" is right for deviations, where a
 * workspace with no deviations has genuinely had none, and wrong for
 * batches, where it would be read as "no batches are running" when the
 * truth is that none has ever been started.
 */
const TILE_SPEC: { key: TileKey; label: string; empty: string }[] = [
  { key: 'batches',    label: 'Batches in progress',       empty: 'Appears after your first batch' },
  { key: 'deviations', label: 'Open deviations',           empty: 'None raised yet' },
  { key: 'quarantine', label: 'Materials in quarantine',   empty: 'Appears after first goods receipt' },
  { key: 'licences',   label: 'Licences expiring · 12 mo', empty: 'Add expiry dates to see this' },
];

/** Singular/plural without a stray "(s)". */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function tilesFrom(counts: WorkspaceCounts): Tile[] {
  //  The denominator decides whether a tile has anything behind it, and
  //  it is a DIFFERENT number from the tile's own figure. A workspace
  //  with four finished batches and none running should read "0" — it
  //  has looked and found none — while a workspace with no batch records
  //  at all should read "—". Both have batchesInProgress = 0.
  const behind: Record<TileKey, Count> = {
    batches:    counts.batchesTotal,
    deviations: counts.capasTotal,
    quarantine: counts.receiptsTotal,
    licences:   counts.licencesWithExpiry,
  };

  const figure: Record<TileKey, Count> = {
    batches:    counts.batchesInProgress,
    deviations: counts.capasOpen,
    quarantine: counts.receiptsQuarantined,
    licences:   counts.licencesExpiring12mo,
  };

  const filled: Record<TileKey, (n: number) => string> = {
    batches:    (n) => `of ${plural(n, 'batch record', 'batch records')}`,
    deviations: (n) => `of ${plural(n, 'raised', 'raised')}`,
    quarantine: (n) => `of ${plural(n, 'lot received', 'lots received')}`,
    licences:   (n) => `of ${plural(n, 'licence', 'licences')} with an expiry date`,
  };

  return TILE_SPEC.map(({ key, label, empty }) => {
    const denominator = behind[key];
    const value = figure[key];

    if (denominator === null || denominator === 0 || value === null) {
      return { key, label, value: null, caption: empty };
    }
    return { key, label, value, caption: filled[key](denominator) };
  });
}

// ── "Finish setting up" ──────────────────────────────────────────────

/**
 * The badges, and what each one means to the person reading it:
 *
 *   Waiting  — done at this end; somebody else has to act.
 *   To do    — theirs to do, and the workspace is incomplete without it.
 *   Optional — theirs to do, and nothing is missing if they never do.
 *   Done     — finished. Not in the design, because the design draws the
 *              morning after setup, when nothing is. Rows do finish.
 */
export type FinishBadge = 'Waiting' | 'To do' | 'Optional' | 'Done';

export interface FinishRow {
  key: 'invitations' | 'licence-details' | 'starter-records' | 'import';
  label: string;
  badge: FinishBadge;
  detail: string;
}

/**
 * A name to call an invitee by, from the only thing an unaccepted invite
 * holds: the address. company_invites has an email and a job title and
 * no name, because nobody has told us one yet — the person fills that in
 * when they accept.
 *
 * "tunde@…" and "ngozi.eze@…" become Tunde and Ngozi. Anything that does
 * not look like a name — initials, a role address, digits — stays the
 * address it is, rather than being capitalised into a person who does
 * not exist ("Qa" from qa@…, "T" from t.adeyemi@…).
 */
export function inviteeLabel(email: string): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const first = local.split(/[._+-]/)[0] ?? '';
  if (first.length >= 3 && /^[a-z]+$/i.test(first)) {
    return first[0].toUpperCase() + first.slice(1).toLowerCase();
  }
  return email;
}

/** "Tunde", "Tunde and Ngozi", "Tunde, Ngozi and Kunle". */
export function nameList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Past three, the sentence stops being a list and starts being a wall. */
export function inviteeSentence(emails: string[]): string {
  const labels = emails.map(inviteeLabel);
  if (labels.length <= 3) return nameList(labels);
  //  Commas, not nameList, for the names that are shown: nameList would
  //  put its own "and" between them and the sentence would read "Tunde
  //  and Ngozi and 3 others".
  return `${labels.slice(0, 2).join(', ')} and ${labels.length - 2} others`;
}

export function finishRowsFrom(counts: WorkspaceCounts): FinishRow[] {
  const rows: FinishRow[] = [];

  // ── Invitations ────────────────────────────────────────────────────
  //  "Invitations show as sent and waiting, not as joined" — ONB-07's
  //  rule, and it matters more here, a day later, when it is tempting to
  //  show a team that does not exist yet.
  const pending = counts.invitesPending ?? 0;
  const accepted = counts.invitesAccepted ?? 0;
  if (pending > 0) {
    const who = inviteeSentence(counts.pendingInvitees);
    rows.push({
      key: 'invitations', label: 'Invitations', badge: 'Waiting',
      detail: who
        ? `${pending} sent. ${who} ${counts.pendingInvitees.length === 1 ? "hasn't" : "haven't"} accepted yet.`
        : `${pending} sent, none accepted yet.`,
    });
  } else if (accepted > 0) {
    rows.push({
      key: 'invitations', label: 'Invitations', badge: 'Done',
      detail: `${plural(accepted, 'person has', 'people have')} joined.`,
    });
  } else {
    rows.push({
      key: 'invitations', label: 'Invitations', badge: 'To do',
      detail: 'Invite the people who will use this workspace.',
    });
  }

  // ── Licence details ────────────────────────────────────────────────
  //  An expiry date is not paperwork. It is what the renewal alerts are
  //  computed from, so a licence without one is a licence nobody will be
  //  warned about.
  const licences = counts.licencesTotal ?? 0;
  const withExpiry = counts.licencesWithExpiry ?? 0;
  if (licences === 0) {
    rows.push({
      key: 'licence-details', label: 'Licence details', badge: 'To do',
      detail: 'Add your licences and their expiry dates so renewals can be tracked.',
    });
  } else if (withExpiry < licences) {
    //  The design's wording — "Add certificate numbers and expiry dates
    //  to your starter licences" — says what to do; the count says how
    //  much is left. Both, because the first alone leaves you guessing
    //  whether you have finished.
    rows.push({
      key: 'licence-details', label: 'Licence details', badge: 'To do',
      detail: `Add certificate numbers and expiry dates to your starter licences. `
        + `${licences - withExpiry} of ${licences} still needs one, and renewal alerts `
        + 'are worked out from that date.',
    });
  } else {
    rows.push({
      key: 'licence-details', label: 'Licence details', badge: 'Done',
      detail: `${plural(licences, 'licence has', 'licences have')} an expiry date.`,
    });
  }

  // ── Starter records ────────────────────────────────────────────────
  const starters = counts.starterRecords ?? 0;
  rows.push(starters > 0
    ? {
      key: 'starter-records', label: 'Starter records', badge: 'Done',
      detail: `${plural(starters, 'record', 'records')} in place across obligations, policies and risks.`,
    }
    : {
      key: 'starter-records', label: 'Starter records', badge: 'To do',
      detail: 'Add your obligations, policies and risks, or pick from the suggested set.',
    });

  // ── Spreadsheet import ────────────────────────────────────────────
  //  Optional and staying optional. Everything it would bring in can be
  //  typed, and a workspace is not incomplete for having typed it.
  rows.push({
    key: 'import', label: 'Spreadsheet import', badge: 'Optional',
    detail: 'Bring products, licences or materials in from a spreadsheet.',
  });

  return rows;
}

// ── The next step ────────────────────────────────────────────────────

export interface NextStep {
  title: string;
  /** Why, not just what. A next step without a reason gets ignored. */
  reason: string;
  primaryLabel: string;
  secondaryLabel: string;
}

/**
 * PRODUCTS, for the reason ONB-07 gives: "a batch can only start for a
 * product with a valid registration, and renewal alerts need each
 * registration's expiry date". Nothing else in the product can begin
 * until a product exists, so nothing else can honestly be called the
 * next step.
 *
 * Once one exists the card goes away rather than finding something else
 * to nominate. The list below it already says what is outstanding, and a
 * permanent "next step" banner is an advertisement.
 */
export function nextStepFrom(counts: WorkspaceCounts): NextStep | null {
  if ((counts.products ?? 0) > 0) return null;
  return {
    title: 'Next step: add your products',
    reason: 'A batch can only be started for a product with a valid registration, '
      + 'and renewal alerts are worked out from each registration’s expiry date. '
      + 'Everything else waits on this.',
    primaryLabel: 'Add your first product',
    secondaryLabel: 'Upload a product spreadsheet',
  };
}

// ── Reading it all ───────────────────────────────────────────────────

/** A table this workspace has not installed yet, or may not read. */
function unavailable(error: any): boolean {
  const code = error?.code ?? '';
  return code === '42P01' || code === '42703' || code === 'PGRST205' || code === 'PGRST204';
}

/**
 * One count. Returns null rather than throwing, because a dashboard that
 * refuses to draw because one of twelve numbers did not come back is
 * worse than a dashboard with one em-dash on it.
 */
async function count(
  table: string,
  companyId: string,
  refine?: (q: any) => any,
): Promise<Count> {
  try {
    let q = (supabase as any).from(table)
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);
    if (refine) q = refine(q);
    const { count: n, error } = await q;
    if (error) {
      if (!unavailable(error)) logger.warn(`[dashboard] ${table} count failed`, error.message);
      return null;
    }
    return n ?? 0;
  } catch (err) {
    logger.warn(`[dashboard] ${table} count threw`, err);
    return null;
  }
}

/** Sums counts, and is null only if EVERY table was unreadable. */
function sum(parts: Count[]): Count {
  const got = parts.filter((p): p is number => p !== null);
  return got.length === 0 ? null : got.reduce((a, b) => a + b, 0);
}

const BATCH_IN_PROGRESS = ['in_progress', 'execution_complete', 'qc_pending', 'qc_in_progress'];

export async function loadWorkspaceOverview(
  companyId: string | null | undefined,
  userId: string | null | undefined,
): Promise<WorkspaceOverview> {
  const empty: WorkspaceOverview = {
    ...NO_COUNTS, companyName: '', fullName: '', setupComplete: false, sites: [],
  };
  if (!companyId) return empty;

  //  Twelve months from today, for the licence tile. Computed once here
  //  rather than in the query so the boundary is the same for the count
  //  and for anything the screen says about it.
  const horizon = new Date();
  horizon.setMonth(horizon.getMonth() + 12);
  const horizonISO = horizon.toISOString().slice(0, 10);
  const todayISO = new Date().toISOString().slice(0, 10);

  const [
    company, profile, sites,
    products,
    batchesTotal, batchesInProgress,
    capasTotal, capasOpen,
    receiptsTotal, receiptsQuarantined,
    licencesTotal, licencesWithExpiry, licencesExpiring12mo,
    obligations, policies, risks,
    invitesAccepted, pendingInvites,
  ] = await Promise.all([
    (supabase as any).from('companies').select('name').eq('id', companyId).maybeSingle(),
    userId
      ? (supabase as any).from('profiles')
          .select('full_name, onboarding_completed').eq('id', userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    (supabase as any).from('sites')
      .select('id, name').eq('company_id', companyId).order('created_at'),

    count('products', companyId),

    count('batch_records', companyId),
    count('batch_records', companyId, (q) => q.in('status', BATCH_IN_PROGRESS)),

    count('capa_records', companyId),
    count('capa_records', companyId, (q) => q.neq('status', 'closed')),

    count('raw_material_receipts', companyId),
    count('raw_material_receipts', companyId, (q) => q.eq('test_status', 'quarantined')),

    count('regulatory_licences', companyId),
    count('regulatory_licences', companyId, (q) => q.not('expiry_date', 'is', null)),
    count('regulatory_licences', companyId,
      (q) => q.gte('expiry_date', todayISO).lte('expiry_date', horizonISO)),

    count('regulatory_obligations', companyId),
    count('policies', companyId),
    count('risks', companyId),

    count('company_invites', companyId, (q) => q.not('accepted_at', 'is', null)),
    (supabase as any).from('company_invites')
      .select('email')
      .eq('company_id', companyId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at'),
  ]);

  for (const [what, r] of [
    ['company', company], ['profile', profile], ['sites', sites], ['invites', pendingInvites],
  ] as const) {
    if (r?.error && !unavailable(r.error)) {
      logger.warn(`[dashboard] ${what} unavailable`, r.error.message);
    }
  }

  const pending: { email: string }[] = Array.isArray(pendingInvites?.data) ? pendingInvites.data : [];

  return {
    companyName: (company?.data as any)?.name ?? '',
    fullName: (profile?.data as any)?.full_name ?? '',
    setupComplete: (profile?.data as any)?.onboarding_completed === true,
    sites: Array.isArray(sites?.data)
      ? sites.data.map((s: any) => ({ id: String(s.id), name: String(s.name ?? '') }))
      : [],

    products,
    batchesTotal, batchesInProgress,
    capasTotal, capasOpen,
    receiptsTotal, receiptsQuarantined,
    licencesTotal, licencesWithExpiry, licencesExpiring12mo,
    starterRecords: sum([obligations, policies, risks]),
    invitesPending: pendingInvites?.error ? null : pending.length,
    invitesAccepted,
    pendingInvitees: pending.map((p) => String(p.email ?? '')).filter(Boolean),
  };
}
