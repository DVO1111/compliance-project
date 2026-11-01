/**
 * Which workspace is open, and may it be?
 *
 * These two decisions are the whole of the company switcher that can be got
 * wrong in a way that matters, so they live here rather than inside
 * AuthContext where nothing can reach them. There is no React in this file
 * and no Supabase client: it is given the server's answer and the person's
 * preference and returns a company id.
 *
 * NEITHER FUNCTION IS A SECURITY BOUNDARY, and it is worth being exact
 * about why they are still worth testing. The boundary is
 * `app_is_company_member(company_id)` in the database, consulted by the RLS
 * policy on every company-scoped table on every statement; a client that
 * forges an active company reads nothing and writes nothing. What these
 * functions protect is the INTERFACE being truthful — that the name in the
 * header matches the data on the page, that a revoked membership stops
 * being offered, and that a workspace nobody granted is never shown as
 * though it were available.
 */

/** One workspace, as `app_my_companies()` reports it. */
export interface AuthorisedCompany {
  company_id: string;
  company_name: string;
  role: string | null;
}

/**
 * Where a person's chosen workspace is remembered.
 *
 * KEYED BY USER ID. A shared browser must not let the next person inherit
 * the previous person's workspace, and a key that did not name the user
 * would do exactly that.
 */
export const ACTIVE_COMPANY_PREFIX = 'criateur_active_company_';

export function activeCompanyStorageKey(userId: string): string {
  return ACTIVE_COMPANY_PREFIX + userId;
}

/**
 * "That function is not on this database" as opposed to "the call failed".
 *
 * This distinction decides whether a warning appears in the header of every
 * user's screen. `app_my_companies()` arrives in 20261215000000, so until
 * that migration is applied the RPC fails on every sign-in, on every
 * deployment. Treating that as an error would tell every user about a
 * feature they have not been given; treating a GENUINE failure as "no
 * list" would show somebody with two workspaces a single-workspace product
 * and let them conclude a company had been taken away from them. Hence a
 * narrow test, and a test with a test.
 *
 * 42883 is Postgres's undefined_function; PGRST202 is PostgREST failing to
 * find the function in its schema cache.
 */
export function isMissingFunctionError(
  e: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!e) return false;
  return e.code === '42883' || e.code === 'PGRST202'
    || /(does not exist|could not find the function)/i.test(e.message ?? '');
}

export interface ResolveActiveCompanyInput {
  /** Just asked for, by a switch. Highest precedence. */
  preferred?: string | null;
  /** Remembered from last time. A preference, and checked like one. */
  stored?: string | null;
  /** `profiles.company_id` — the person's default workspace. */
  profileCompanyId?: string | null;
  /** What the SERVER says this person may open. */
  authorised: readonly AuthorisedCompany[];
  /**
   * True when the workspace list could not be read at all — the function
   * is missing on an older database, or the call failed. NOT the same as
   * an empty list, and the difference decides the answer below.
   */
  listFailed?: boolean;
}

/**
 * Picks the workspace to open.
 *
 * Three candidates in order of specificity — asked for, remembered,
 * default — and the first one the server agrees to wins. If none of them
 * is authorised the person is put in a workspace they DO hold rather than
 * one that would read as empty; a profile pointing at a company somebody
 * has been removed from is a real state, and showing them an empty product
 * is a worse answer than showing them their remaining workspace.
 *
 * WHEN THE LIST COULD NOT BE READ the profile's own company is used and
 * nothing is second-guessed. That is the pre-switcher behaviour exactly,
 * which is what a database without 20261215000000 must keep getting.
 */
export function resolveActiveCompany(input: ResolveActiveCompanyInput): string | null {
  const { preferred, stored, profileCompanyId, authorised, listFailed } = input;

  if (listFailed || authorised.length === 0) {
    return profileCompanyId ?? null;
  }

  const permitted = new Set(authorised.map((c) => c.company_id));
  const chosen = [preferred, stored, profileCompanyId]
    .find((candidate): candidate is string => !!candidate && permitted.has(candidate));

  return chosen ?? authorised[0].company_id;
}

/**
 * LATEST-WINS, for loads that can finish out of order.
 *
 * Two clicks in quick succession start two profile loads. They can resolve
 * in either order, and without this the slower one publishes last — leaving
 * the person in the workspace they did NOT choose last, header and all.
 *
 * Each load takes a ticket on the way in and checks it again just before it
 * publishes. A ticket that is no longer current means a newer load has
 * started, so the older result is dropped. `invalidate()` exists for
 * sign-out: it makes every load in flight stale, so none of them can
 * publish a signed-out person's workspace after the fact.
 */
export interface LoadSequencer {
  begin(): number;
  isCurrent(ticket: number): boolean;
  invalidate(): void;
}

export function createLoadSequencer(): LoadSequencer {
  let current = 0;
  return {
    begin: () => ++current,
    isCurrent: (ticket: number) => ticket === current,
    invalidate: () => { current += 1; },
  };
}

/**
 * Opening another workspace, as a sequence of decisions.
 *
 * This is the orchestration AuthContext performs, lifted out so it can be
 * tested without a browser — the repository has no React renderer, and the
 * failure this guards against is a timing one that only a controlled
 * promise can reproduce reliably.
 *
 * THE RULE IT ENFORCES: nothing about the workspace changes until `load`
 * has succeeded. `load` either publishes the whole workspace — profile,
 * companies, active company, default — in one go, or publishes nothing.
 * So there is no partial state, which in turn means there is nothing to
 * roll back when a switch fails: the previous workspace simply stays.
 */
export interface SwitchWorkspaceOptions {
  /** The workspace being asked for. */
  companyId: string | null | undefined;
  /** The one currently open, so a no-op switch stays a no-op. */
  currentCompanyId: string | null;
  /** The server's list. The ONLY thing membership is judged against. */
  authorised: readonly AuthorisedCompany[];
  /** Publishes the whole workspace on success; publishes nothing on failure. */
  load: (companyId: string) => Promise<boolean>;
  /** Drives the selector's in-progress indicator. */
  setBusy: (busy: boolean) => void;
  /** Reported, never shown raw. */
  onError?: (err: unknown) => void;
}

export async function switchWorkspace(
  opts: SwitchWorkspaceOptions,
): Promise<{ error: Error | null }> {
  const { companyId, currentCompanyId, authorised, load, setBusy, onError } = opts;

  if (!companyId) return { error: new Error('No workspace was chosen.') };
  //  Already there. Not an error, and not worth a round trip.
  if (companyId === currentCompanyId) return { error: null };

  //  Judged against the server's answer, before anything else happens, so
  //  a company this person does not hold never reaches the loader at all.
  if (!isSwitchAuthorised(companyId, authorised)) {
    return { error: new Error('You do not have access to that workspace.') };
  }

  setBusy(true);
  try {
    const ok = await load(companyId);
    if (!ok) {
      return {
        error: new Error('That workspace could not be opened. You are still in the previous one.'),
      };
    }
    return { error: null };
  } catch (err) {
    //  Nothing was published, so there is nothing to undo.
    onError?.(err);
    return { error: err as Error };
  } finally {
    setBusy(false);
  }
}

/**
 * May this session open that workspace?
 *
 * Answered ONLY from the server's list. The caller's own belief about which
 * companies exist — an id in storage, in a URL, in React state — is not an
 * input, because that is the whole point: `switchCompany` must refuse a
 * company that was never granted instead of trying it and letting the
 * screen fill with empty tables.
 */
export function isSwitchAuthorised(
  companyId: string | null | undefined,
  authorised: readonly AuthorisedCompany[],
): boolean {
  if (!companyId) return false;
  return authorised.some((c) => c.company_id === companyId);
}
