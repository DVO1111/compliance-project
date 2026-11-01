import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import {
  supabase, isSupabaseConfigured, INITIAL_AUTH_CALLBACK_IS_INVITE,
  INITIAL_AUTH_CALLBACK_IS_RECOVERY,
} from '../lib/supabase';
import { useJurisdictionStore } from '../stores/jurisdictionStore';
import { toJurisdictionId } from '../lib/regulatoryProfile';
import type { Database } from '../lib/database.types';
import type { Permissions } from '../lib/permissions';
import { fetchRoleById, ensureSystemRoles } from '../lib/roleService';
import { logger } from '../lib/logger';
import { isAccountEnumerationError, passwordResetRedirectTo } from '../lib/auth/passwordReset';
import { canRestoreAuthSession, isEmailAllowedToSignIn, SIGNIN_NOT_ALLOWED_MESSAGE } from '../lib/auth/allowlist';
import { isInviteCallback } from '../lib/auth/inviteCallback';
import {
  activeCompanyStorageKey, resolveActiveCompany,
  isMissingFunctionError, createLoadSequencer, switchWorkspace,
  type AuthorisedCompany,
} from '../lib/auth/activeCompany';
import { appUrl, SIGN_OUT_DESTINATION } from '../lib/routing';
import { initFrameworkLibrary } from '../lib/frameworkLibraryService';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

/**
 * One workspace this person may open, as the SERVER reports it.
 *
 * It comes from `app_my_companies()` and from nowhere else — not from a
 * list of ids the client happens to hold, not from storage. See
 * supabase/migrations/20261215000000_my_companies.sql.
 */
export type CompanyMembership = AuthorisedCompany;

/**
 * WHICH WORKSPACE AM I LOOKING AT — AS ONE VALUE.
 *
 * These five used to be five separate `useState` calls, and that was the
 * bug. `switchCompany` set the active company immediately and the profile
 * only after four queries returned, so between those two points the header
 * named the new company while every page still rendered the old company's
 * rows. On a fast local database that window was milliseconds; on a slow
 * one it was measured at over eleven seconds.
 *
 * Batching does not fix it, because the updates are separated by `await`:
 * React batches within a synchronous block, not across one. Holding them in
 * a single state value does fix it, structurally — there is exactly one
 * setter, so a render either has the whole new workspace or the whole old
 * one. No intermediate state exists to be observed.
 */
interface WorkspaceView {
  profile: Profile | null;
  companies: CompanyMembership[];
  activeCompanyId: string | null;
  defaultCompanyId: string | null;
  companiesError: string | null;
}

const EMPTY_WORKSPACE: WorkspaceView = {
  profile: null,
  companies: [],
  activeCompanyId: null,
  defaultCompanyId: null,
  companiesError: null,
};

/** One row of `app_my_companies()`, as PostgREST returns it. */
interface MyCompaniesRow {
  company_id: string;
  company_name: string | null;
  role: string | null;
}

/**
 * Just enough of the Supabase client to call `app_my_companies()`.
 *
 * The generated `Database` type is older than 20261215000000 and so does
 * not carry the function's name, which is why this is a cast rather than a
 * typed call. It goes through `unknown` and names the exact return shape,
 * so what is given up is the function NAME being checked — not the data.
 */
interface MyCompaniesRpc {
  rpc(fn: 'app_my_companies'): Promise<{
    data: MyCompaniesRow[] | null;
    error: { message?: string; code?: string } | null;
  }>;
}


// ✅ Extend profile with company_role and module_access from company_members
type Profile = ProfileRow & {
  /**
   * THE WORKSPACE THE PERSON IS LOOKING AT, which is not always the one
   * their profile row names.
   *
   * `company_id` is overwritten with the ACTIVE company so that the 80-odd
   * places which already read `profile.company_id` scope themselves to the
   * chosen workspace without each needing to learn about switching. The
   * profile's own stored value — their default — is kept below, and the
   * profile row in the database is never rewritten to switch.
   */
  company_id: string | null;
  /** `profiles.company_id` as STORED: the default workspace, untouched by switching. */
  default_company_id?: string | null;
  company_role?: string | null;        // 'owner' | 'admin' | 'member' | etc
  module_access?: string[] | null;     // module keys assigned at invite time
  //  PM-03's operational roles, from operational_role_assignments — a
  //  different register from company_role above, and the only one the
  //  permission grid reads. Several, because one person may hold more
  //  than one. Empty means they hold none, which abstains.
  operational_roles?: string[];
  customPermissions?: Partial<Permissions> | null; // from custom_roles JSONB
};

function hasInviteCallback(): boolean {
  try {
    return isInviteCallback(window.location.search, window.location.hash);
  } catch {
    return false;
  }
}

/*
 *  ── REMEMBERING THE CHOSEN WORKSPACE ──
 *
 *  Keyed BY USER ID, so signing out and in as somebody else cannot inherit
 *  the previous person's workspace: the new session looks under a different
 *  key and finds nothing.
 *
 *  What is stored here is a PREFERENCE and is treated as one. On every load
 *  it is checked against the server's `app_my_companies()` answer and
 *  dropped if it is not in it, so a membership that has been revoked since
 *  the value was written cannot come back through storage. Even if that
 *  check were removed, the value would buy nothing: every company-scoped
 *  table is guarded by app_is_company_member(), which re-reads the
 *  membership table on every statement.
 */
function readStoredCompany(userId: string): string | null {
  //  Storage throws in a private window and in some embedded views, and
  //  is simply absent during server-side rendering. A missing preference
  //  is not an error — the profile's default is used instead.
  try {
    return window.localStorage.getItem(activeCompanyStorageKey(userId));
  } catch {
    return null;
  }
}

function writeStoredCompany(userId: string, companyId: string | null): void {
  try {
    const key = activeCompanyStorageKey(userId);
    if (companyId) window.localStorage.setItem(key, companyId);
    else window.localStorage.removeItem(key);
  } catch { /* nothing to remember is survivable */ }
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  activeBrandId: string | null;
  /**
   * Every workspace this person may open, as the server reports them.
   * Empty until the profile has loaded, and empty for anyone with a single
   * membership is NOT how that case shows — a single membership returns one
   * row, and the selector hides itself.
   */
  companies: CompanyMembership[];
  /** The workspace being looked at. Mirrors `profile.company_id`. */
  activeCompanyId: string | null;
  /** `profiles.company_id` as stored — the default, which switching never rewrites. */
  defaultCompanyId: string | null;
  /** Why the workspace list could not be read, if it could not. */
  companiesError: string | null;
  /** True while a switch is in flight, so the selector can say so. */
  switchingCompany: boolean;
  /**
   * Opens another of the person's workspaces.
   *
   * Refuses any company that is not in `companies` — which is the server's
   * own answer, not a client-held list. A refusal changes nothing; a failure
   * part-way restores the workspace that was active before, so the app is
   * never left showing one company's name over another company's data.
   */
  switchCompany: (companyId: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    organization: string,
    inviteToken?: string,
    /** Industry and regulator, chosen at sign-up and fixed thereafter. */
    industryType?: string,
    jurisdiction?: string
  ) => Promise<{ needsVerification: boolean }>;
  verifySignupCode: (email: string, token: string) => Promise<void>;
  resendSignupCode: (email: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  /**
   * Sends the reset email for the login design's "Forgot password?" state.
   *
   * Resolves without an error even when the address has no account:
   * reporting "no such user" here would turn the form into an account
   * enumerator, and the screen's copy is written for that — "If that email
   * has a Criateur account, a reset link is on its way." A genuine
   * transport failure still comes back as an error.
   */
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  /** Sets the new password once the emailed link has opened a recovery session. */
  completePasswordReset: (password: string) => Promise<{ error: Error | null }>;
  /**
   * True between the emailed link opening a recovery session and the new
   * password being saved. App.tsx shows the reset screen while it holds, so
   * the link does not drop someone into the product with a session they got
   * without a password.
   */
  isRecoveringPassword: boolean;
  /** Recovery callback URL was opened, even if Supabase rejects its token. */
  isRecoveryCallback: boolean;
  /** True when Supabase redirects an invited user back to create a password. */
  isInitialPasswordSetup: boolean;
  refreshProfile: () => Promise<void>;
  switchBrand: (brandId: string | null) => void;
  /**
   * Why there is a session but no profile. Null while loading, and null
   * when the profile loaded fine. A string here is the database's own
   * message — the screen shows it instead of guessing at a cause.
   */
  profileLoadError: string | null;
  /**
   * Creates the company and the profile for a signed-in user who has
   * neither. This is the way out of "signed in, but the product does not
   * know who you are": before it existed, that state had a spinner, a
   * guess about email verification, and a sign-out button.
   */
  provisionWorkspace: (companyName: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(INITIAL_AUTH_CALLBACK_IS_RECOVERY);
  const isRecoveryCallback = INITIAL_AUTH_CALLBACK_IS_RECOVERY;
  const [isInitialPasswordSetup, setIsInitialPasswordSetup] = useState(
    () => INITIAL_AUTH_CALLBACK_IS_INVITE || hasInviteCallback()
  );
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  //  ONE value, so the header and the pages can never disagree — see
  //  WorkspaceView above for why this is not five useState calls.
  const [workspace, setWorkspace] = useState<WorkspaceView>(EMPTY_WORKSPACE);
  const { profile, companies, activeCompanyId, defaultCompanyId, companiesError } = workspace;
  //  The profile alone, for the paths that only learn it could not be read.
  //  Everything else about the workspace is left as it was: failing to read
  //  a profile is not a reason to forget which companies the person holds.
  const setProfileOnly = (p: Profile | null) =>
    setWorkspace((w) => (w.profile === p ? w : { ...w, profile: p }));
  const [switchingCompany, setSwitchingCompany] = useState(false);
  //  A ref as well as state, because the auth listener and the
  //  visibility-change refresh below are registered once and would
  //  otherwise close over the active company as it was when they were
  //  registered — a background refresh would then silently reload the
  //  profile for the workspace the person had already switched away from.
  const activeCompanyIdRef = useRef<string | null>(null);
  /**
   * Which profile load is the current one.
   *
   * Two switches in quick succession start two loads, and they can finish
   * in either order. Without this the slower one would publish last and the
   * person would end up in the workspace they did NOT choose last. Each
   * load takes a ticket on the way in and throws its result away if a newer
   * load has started since.
   */
  const loadSeq = useRef(createLoadSequencer()).current;
  // Track whether the initial profile load has completed. After that,
  // background refreshes (token refresh, window focus) must NEVER set
  // loading=true — that unmounts the entire app and loses all page state.
  const initialLoadDone = useRef(false);

  const switchBrand = (brandId: string | null) => setActiveBrandId(brandId);

  useEffect(() => {
    //  No backend in this build: there is no session to restore and
    //  touching supabase.auth would throw. App.tsx shows the
    //  configuration screen; this just makes sure it is not shown behind
    //  a spinner that never ends.
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    //  THE SPLASH MUST COME DOWN EVEN WHEN THIS CALL DOES NOT ANSWER.
    //  getSession() reads the stored session and, if the access token has
    //  expired, refreshes it over the network — so on a bad connection it
    //  can hang, and it can reject. With neither a .catch nor a deadline
    //  this promise was the app's only way out of the loading state: a
    //  refresh that never came back meant a spinner that never left, with
    //  no error, no login form and nothing to click. Now the worst case
    //  is the sign-in screen, which is recoverable.
    //
    //  The deadline is not a cancellation — a late answer still arrives
    //  through onAuthStateChange and signs the user in.
    let settled = false;
    const deadline = setTimeout(() => {
      if (settled) return;
      settled = true;
      logger.warn('getSession did not answer within 8s — showing the sign-in screen');
      setLoading(false);
    }, 8000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        //  A session can outlive the allowlist: it is stored in the
        //  browser, so an address removed from the list would otherwise
        //  keep walking back in until its token expired. Checked on
        //  restore as well as at sign-in, so the list governs who is
        //  inside and not merely who may knock.
        //  INVITE AS WELL AS RECOVERY. approve-signup allowlists the
        //  address in the database and emails an invite, but it cannot
        //  edit the array compiled into this bundle — so comparing an
        //  invite arrival against that array alone signed out every
        //  newly approved user the moment their password screen drew.
        const fromEmailedLink =
          INITIAL_AUTH_CALLBACK_IS_RECOVERY || INITIAL_AUTH_CALLBACK_IS_INVITE || hasInviteCallback();

        if (session?.user && !canRestoreAuthSession(session.user.email, fromEmailedLink)) {
          logger.warn('restored session is not on the sign-in allowlist — signing out');
          void supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          loadProfile(session.user.id);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        logger.error('getSession failed:', err);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);

        if (event === 'SIGNED_IN' && (INITIAL_AUTH_CALLBACK_IS_INVITE || hasInviteCallback())) {
          setIsInitialPasswordSetup(true);
        }

        //  A recovery link signs the user in before they have proved they
        //  know a password, so the flag goes up BEFORE the profile loads.
        //  App.tsx keys the reset screen off it; without this the link would
        //  land straight in the product.
        if (event === 'PASSWORD_RECOVERY') {
          setIsRecoveringPassword(true);
          if (session?.user) {
            await loadProfile(session.user.id);
          }
          setLoading(false);
          return;
        }

        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          // Genuine sign-in or profile change — reload profile
          if (session?.user) {
            await loadProfile(session.user.id);
          }
        } else if (event === 'SIGNED_OUT') {
          setProfileOnly(null);
          //  Also reached when the session expires or is revoked from
          //  another tab, which is why it is not enough to clear this in
          //  signOut() alone.
          clearCompanyState(user?.id ?? null);
          setIsRecoveringPassword(false);
            setIsInitialPasswordSetup(false);
          setLoading(false);
        }
        // TOKEN_REFRESHED and INITIAL_SESSION: silently update session/user
        // without calling loadProfile (avoids setLoading(true) remount loop)
      })();
    });

    return () => {
      clearTimeout(deadline);
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Loads the profile, and GUARANTEES the splash comes down afterwards.
   *
   * Every path inside already cleared `loading` by hand, which worked
   * right up until something threw: a dropped connection mid-query
   * rejects rather than returning `{ error }`, and the app was then left
   * on the full-screen spinner with nothing arriving and no way out.
   * The `finally` is the fix — the loading flag is released by the
   * structure of the function rather than by remembering to.
   */
  const loadProfile = async (userId: string, preferredCompanyId?: string | null) => {
    // Only show the full-screen spinner on the very first load.
    // All subsequent calls (token refresh, manual refresh, window focus)
    // update profile silently without unmounting the app.
    if (!initialLoadDone.current) setLoading(true);

    try {
      await loadProfileInner(userId, preferredCompanyId);
    } catch (err) {
      logger.error('loadProfile failed:', err);
      setProfileOnly(null);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  };

  /**
   * Loads the profile for ONE workspace — the active one.
   *
   * Returns true when the workspace was published. `switchCompany` needs
   * that answer: a switch whose profile could not be read must leave the
   * previous workspace exactly as it was rather than half-apply.
   *
   * `keepOnFailure` is what makes a failed switch harmless. On the initial
   * load, failing to read a profile has to be shown — that is the "signed
   * in, but the product does not know who you are" screen. On a SWITCH it
   * must not be: the person already has a working workspace on screen, and
   * blanking it because the other one could not be read would turn a failed
   * click into a broken session.
   */
  const loadProfileInner = async (
    userId: string,
    preferredCompanyId?: string | null,
    opts?: { keepOnFailure?: boolean },
  ): Promise<boolean> => {
    //  Take a ticket. Checked again just before publishing, so a load that
    //  has been overtaken by a newer one discards its result instead of
    //  overwriting the workspace the person actually chose.
    const seq = loadSeq.begin();
    const keepOnFailure = opts?.keepOnFailure === true;
    const failed = (reason: string | null): boolean => {
      if (keepOnFailure) return false;
      if (reason !== null) setProfileLoadError(reason);
      setProfileOnly(null);
      return false;
    };
    //  THE MEMBERSHIP IS FETCHED ALONGSIDE THE PROFILE, NOT AFTER IT.
    //  It used to wait for the profile so it could filter on company_id —
    //  but company_members is keyed on user_id too, so the row can be
    //  fetched on the user alone and matched to the company afterwards.
    //  That is one fewer round trip between pressing Sign in and seeing
    //  anything, on the path where the person is watching a spinner.
    //
    //  Several rows come back for someone in more than one company, which
    //  is why the profile's company_id still decides which one counts
    //  rather than "the first one".
    //  operational_role_assignments is fetched in the same round as the
    //  other two. It is a different register from company_members: that
    //  one says what somebody is to the workspace (owner, admin,
    //  viewer), this one says what they may do on the floor. Since
    //  20261119000000 the second is the only one PM-03 reads.
    //  app_my_companies() joins the same memberships to their company NAMES,
    //  which the browser cannot read for itself: `companies` has RLS on and
    //  no policy, so a plain select returns nothing. It is fetched in the
    //  same round as the rest — the switcher is part of the shell, so
    //  waiting for it would delay the whole app for one dropdown.
    const [profileRes, memberRes, roleRes, companiesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      (supabase as any)
        .from('company_members')
        .select('company_id, role, module_access')
        .eq('user_id', userId),
      (supabase as any)
        .from('operational_role_assignments')
        .select('company_id, role')
        .eq('user_id', userId)
        .is('revoked_at', null),
      //  Cast through `unknown` rather than `any`: app_my_companies() is
      //  newer than the generated database.types.ts, so the typed client
      //  does not know the name, but the SHAPE of what comes back is known
      //  exactly and is worth stating.
      (supabase as unknown as MyCompaniesRpc).rpc('app_my_companies'),
    ]);

    if (profileRes.error) {
      logger.error('loadProfile error:', profileRes.error);
      return failed(profileRes.error.message);
    }

    const baseProfile = (profileRes.data ?? null) as ProfileRow | null;

    // If no profile row exists, stop — but say so, because "no row" and
    // "the query failed" need different answers from the person.
    if (!baseProfile) {
      return failed('NO_PROFILE');
    }

    // ── WHICH WORKSPACE IS THIS LOAD FOR? ──────────────────────────────
    //
    //  Three candidates, in order of specificity: the one just asked for,
    //  the one remembered from last time, the profile's own default. The
    //  first that the SERVER agrees the person is a member of wins.
    const authorisedRows: CompanyMembership[] = (companiesRes?.data ?? [])
      .filter((r): r is MyCompaniesRow => !!r?.company_id)
      .map((r) => ({
        company_id: String(r.company_id),
        //  The function already substitutes a placeholder for a blank name;
        //  this is the belt to that braces, so the switcher can never draw
        //  an unlabelled row.
        company_name: r.company_name?.trim() || 'Untitled workspace',
        role: r.role ?? null,
      }));
    let companyListError: string | null = null;
    if (companiesRes?.error) {
      /*
       *  TWO VERY DIFFERENT FAILURES, and telling them apart is the whole
       *  point of this block.
       *
       *  "The function is not installed" is not a fault — it is every
       *  database that has not had 20261215000000 applied yet, which on the
       *  day this ships is all of them. Reporting it would put a warning
       *  badge in the header of every single user's screen to tell them
       *  about a feature they have not been given, so it is logged and
       *  otherwise treated as "there is no list": no switcher, profile's own
       *  company, behaviour identical to before this existed.
       *
       *  Anything else — a dropped connection, a permission refusal — IS
       *  worth surfacing, because somebody with two workspaces would
       *  otherwise be shown a single-workspace product and could reasonably
       *  conclude their other company had been taken away from them.
       */
      const message = companiesRes.error.message ?? 'The workspace list could not be read.';
      if (isMissingFunctionError(companiesRes.error)) {
        logger.warn('app_my_companies is not installed — workspace switching is unavailable');
      } else {
        companyListError = message;
        logger.warn('loadProfile app_my_companies failed:', message);
      }
    }

    //  The decision itself is in lib/auth/activeCompany.ts, where it can be
    //  tested without a browser. Its rules, in short: asked-for beats
    //  remembered beats default, every candidate must be in the server's
    //  list, and a list that could not be read falls back to the profile's
    //  own company rather than guessing.
    const activeCompany = resolveActiveCompany({
      preferred: preferredCompanyId,
      stored: readStoredCompany(userId),
      profileCompanyId: baseProfile.company_id,
      authorised: authorisedRows,
      listFailed: !!companiesRes?.error,
    });

    /*
     *  NOTHING IS PUBLISHED HERE.
     *
     *  This block used to set the companies, the default and the active
     *  company at this point — before the role lookups below, and before
     *  the profile. That is precisely what let the header run ahead of the
     *  page content. Every one of those values is now carried to the single
     *  `setWorkspace` at the end of this function, so the whole workspace
     *  becomes visible in one render or not at all.
     */

    let company_role: string | null = null;
    let module_access: string[] | null = null;

    if (memberRes?.error) {
      // Not fatal — the app still runs, just with no company_role attached
      logger.warn('loadProfile company_members lookup failed:', memberRes.error.message);
    } else if (activeCompany) {
      //  Keyed on the ACTIVE company, not the profile's. Being an owner of
      //  one workspace says nothing about what you are in another, and this
      //  is the row the whole permission grid is built from.
      const row = ((memberRes?.data as any[]) ?? [])
        .find((m) => m.company_id === activeCompany);
      company_role = row?.role ?? null;
      const raw = row?.module_access;
      module_access = Array.isArray(raw) && raw.length > 0 ? raw : null;
    }

    //  Empty, not null, when there are none. "Holds no operational role"
    //  is a fact the screens act on — it abstains rather than refuses —
    //  and it must not be confused with "we could not find out".
    let operational_roles: string[] = [];
    if (roleRes?.error) {
      //  Before 20261119000000 is deployed the table does not exist, and
      //  a workspace signing in against an older database should still
      //  work. Logged rather than thrown, and left empty.
      logger.warn('loadProfile operational roles lookup failed:', roleRes.error.message);
    } else if (activeCompany) {
      operational_roles = ((roleRes?.data as any[]) ?? [])
        .filter((r) => r.company_id === activeCompany)
        .map((r) => String(r.role));
    }

    //  The custom role is the one lookup that genuinely cannot start
    //  earlier: its id is a column on the profile. Most accounts have
    //  none, so most sign-ins never make this call at all.
    //
    //  AND IT BELONGS TO ONE COMPANY. `custom_roles.company_id` is NOT
    //  NULL, but `profiles.custom_role_id` is a single profile-level
    //  column, so the role it names was defined in one particular
    //  workspace. Applying its permissions while another workspace is open
    //  would carry a grant across a tenant boundary — "Head of Quality at
    //  Sterlin Glams" is not a thing you are at Ibadan Pharmaceuticals.
    //  So it applies only where it was defined.
    let customPermissions: Partial<Permissions> | null = null;
    const customRoleId = (baseProfile as any).custom_role_id;
    if (customRoleId) {
      const role = await fetchRoleById(customRoleId).catch(() => null);
      const roleCompanyId = role?.company_id ?? null;
      if (role && roleCompanyId && activeCompany && roleCompanyId !== activeCompany) {
        logger.warn('custom role belongs to another workspace — not applying it here');
      } else {
        customPermissions = (role?.permissions as Partial<Permissions> | undefined) ?? null;
      }
    }

    // ✅ Ensure system roles exist for this company (run-once per company)
    if (activeCompany) {
      const seedKey = `seeded_roles_${activeCompany}`;
      if (!localStorage.getItem(seedKey)) {
        ensureSystemRoles(activeCompany)
          .then(() => localStorage.setItem(seedKey, '1'))
          .catch(() => { /* RPC not available yet — will retry next login */ });
      }
    }

    // Warm the framework library rule cache in the background after sign-in.
    // Idempotent — subsequent calls return immediately once warmed.
    initFrameworkLibrary().catch(() => {});

    // The workspace's regulatory jurisdiction was fixed at sign-up — publish it
    // to the store the widgets and the compliance engine read, so nothing has
    // to guess or offer a picker.
    useJurisdictionStore.getState().hydrate(
      toJurisdictionId((baseProfile as any).default_jurisdiction ?? (baseProfile as any).primary_markets?.[0])
    );

    /*
     *  SUPERSEDED BY A LATER SWITCH?
     *
     *  Two clicks in quick succession start two loads. They can finish in
     *  either order, and without this check the SLOWER one would publish
     *  last — leaving the person in the workspace they did not choose last,
     *  with the header to match. The ticket is taken at the top of this
     *  function; if it is no longer the current one, this result is stale
     *  and is dropped. Returning true is right: this load did not fail, it
     *  was simply overtaken, and the newer one owns the outcome.
     */
    if (!loadSeq.isCurrent(seq)) {
      logger.warn('a newer workspace load superseded this one — discarding the stale result');
      return true;
    }

    //  THE ONE PUBLICATION POINT. Everything the interface reads about the
    //  active workspace changes here, in a single render: the profile the
    //  pages scope their queries by, the name the header draws, the list
    //  the menu offers, and which of them is the profile's own default.
    //  There is no ordering between them to get wrong.
    activeCompanyIdRef.current = activeCompany;
    //  Remember what was settled on, so a refresh comes back to the same
    //  workspace. Written only after it has been validated above.
    writeStoredCompany(userId, activeCompany);
    setProfileLoadError(null);
    setWorkspace({
      companies: authorisedRows,
      companiesError: companyListError,
      activeCompanyId: activeCompany,
      defaultCompanyId: baseProfile.company_id ?? null,
      profile: {
        ...baseProfile,
        //  THE ACTIVE WORKSPACE IS PUBLISHED AS `company_id`, deliberately.
        //  Every company-scoped query and effect in the app already reads
        //  this field; overwriting it here is what makes switching reach all
        //  of them without 84 call sites having to know switching exists.
        //  The stored default is kept beside it and is never written back.
        company_id: activeCompany,
        default_company_id: baseProfile.company_id ?? null,
        company_role, module_access, operational_roles, customPermissions,
      },
    });
    return true;
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    organization: string,
    inviteToken?: string,
    industryType?: string,
    jurisdiction?: string,
  ) => {
    // Create the auth user. With "Confirm email" enabled in Supabase, this sends
    // a verification code and returns NO session — the user is not signed in yet.
    // The signup details are stashed in user_metadata so we can create the profile
    // and company AFTER the code is verified (and so they survive a page refresh).
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          organization,
          invite_token: inviteToken ?? null,
          // Regulatory scope is chosen at sign-up and is a property of the
          // workspace from then on — stashed here so it survives the email
          // verification round trip.
          industry_type: industryType ?? null,
          default_jurisdiction: jurisdiction ?? null,
        },
      },
    });

    if (authError) {
      logger.error('Signup failed:', authError);
      throw authError;
    }

    // If "Confirm email" is DISABLED in Supabase, signUp returns a live session
    // and no code is emailed — so provision the profile now, exactly like before.
    // If it's ENABLED, session is null and we must wait for the emailed code.
    if (data.session && data.user) {
      await completeSignupProfile(
        data.user.id,
        data.user.email!,
        fullName,
        organization,
        inviteToken
      );
      return { needsVerification: false };
    }

    // Verification required — profile/company are created in verifySignupCode
    // once the emailed code is confirmed.
    return { needsVerification: true };
  };

  const resendSignupCode = async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
  };

  const verifySignupCode = async (email: string, token: string) => {
    // Confirm the emailed 6-digit code. On success Supabase establishes a session,
    // so the client-side inserts below run authenticated (RLS-safe).
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: token.trim(),
      type: 'signup',
    });

    if (error) throw error;

    const verifiedUser = data.user;
    if (!verifiedUser?.id || !verifiedUser.email) {
      throw new Error('Verification succeeded but user data is missing.');
    }

    const meta = verifiedUser.user_metadata ?? {};
    const fullName = (meta.full_name as string) ?? '';
    const organization = (meta.organization as string) ?? '';
    const inviteToken =
      (meta.invite_token as string | null) ??
      localStorage.getItem('pending_invite_token') ??
      undefined;

    await completeSignupProfile(
      verifiedUser.id,
      verifiedUser.email,
      fullName,
      organization,
      inviteToken || undefined,
      (meta.industry_type as string | null) ?? undefined,
      (meta.default_jurisdiction as string | null) ?? undefined
    );
  };

  // Creates the profile / company / membership rows for a freshly verified user.
  const completeSignupProfile = async (
    userId: string,
    userEmail: string,
    fullName: string,
    organization: string,
    inviteToken?: string,
    industryType?: string,
    jurisdiction?: string
  ) => {
    // Regulatory scope, set once here. `primary_markets` is seeded with the
    // same jurisdiction so the onboarding wizard and the profile screen agree
    // rather than each holding their own idea of the workspace's market.
    //
    // The profile is created by provision_profile(), never by a table
    // INSERT. The id, role and custom_role_id are decided by the database
    // from the session — there is no argument for any of them — so nothing
    // this file sends can choose a privilege. See
    // 20260916000000_secure_profile_provisioning.sql.
    const provisionArgs = {
      p_email: userEmail,
      p_full_name: fullName,
      p_organization: organization,
      p_onboarding_completed: false,
      p_industry_type: industryType ?? null,
      p_default_jurisdiction: jurisdiction ?? null,
      p_primary_markets: jurisdiction ? [jurisdiction] : null,
    };

    try {
      if (inviteToken) {
        // ── Invite path: skip company creation ──
        // The invite acceptance flow (accept_company_invite RPC) will
        // set company_id on the profile and create the company_members row.
        const { error: profileError } = await (supabase as any).rpc('provision_profile', {
          ...provisionArgs,
          p_company_id: null,
        });

        // provision_profile is idempotent, so a retried signup no longer
        // surfaces a duplicate-key error to swallow here.
        if (profileError) throw profileError;
      } else {
        // ── Normal signup path: create the company ──
        // 3) Create the company. This deliberately does NOT join an
        //    existing company that happens to share the name: matching by
        //    name used to make the caller its owner, which meant typing a
        //    customer's company name here took over their tenant. A name
        //    is a label, not a credential. Joining an existing company
        //    happens only by invite.
        const { data: companyId, error: companyError } = await (supabase as any).rpc('create_company', {
          p_name: organization,
        });

        if (companyError) throw companyError;

        if (!companyId) {
          throw new Error('Company setup failed: company id was not returned.');
        }

        // 4) Create the profile row through the provisioning RPC.
        //    Naming companyId here is safe because create_company() has
        //    already written the caller's active owner membership; the RPC
        //    refuses any company the caller is not an active member of.
        const { error: profileError } = await (supabase as any).rpc('provision_profile', {
          ...provisionArgs,
          p_company_id: companyId,
        });

        if (profileError) throw profileError;

        // create_company() already registered the caller as owner inside
        // its own transaction. The client-side upsert that used to sit
        // here was redundant, and the direct INSERT privilege it relied on
        // has been revoked — anyone could otherwise write themselves into
        // any company, which defeated tenancy everywhere.
      }

      // IMPORTANT: load the profile immediately so onboarding shows consistently
      await loadProfile(userId);
    } catch (err) {
      logger.error('Profile setup after verification failed:', err);
      throw err;
    }
  };

  const signIn = async (email: string, password: string) => {
    //  Refused BEFORE the password is sent, so a closed beta does not
    //  quietly accept credentials it is going to reject anyway. The
    //  allowlist is a front door, not a lock — see allowlist.ts for what
    //  it does and does not protect, and for the migration that puts the
    //  same rule in the database where it cannot be skipped.
    if (!isEmailAllowedToSignIn(email)) {
      return { error: new Error(SIGNIN_NOT_ALLOWED_MESSAGE) };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  /**
   * Forgets everything about the workspace that was open.
   *
   * The remembered preference goes too. Leaving it would be harmless to
   * security — it is validated against the server on every load and RLS
   * does not consult it — but it would mean a shared machine shows the
   * previous person's workspace NAME in the header for the moment between
   * the next sign-in and the first profile load. There is no reason to
   * keep it.
   */
  const clearCompanyState = (userId?: string | null) => {
    if (userId) writeStoredCompany(userId, null);
    activeCompanyIdRef.current = null;
    //  Any load still in flight is now stale: bump the ticket so it cannot
    //  publish a signed-out person's workspace after the fact.
    loadSeq.invalidate();
    setWorkspace(EMPTY_WORKSPACE);
    setSwitchingCompany(false);
  };

  const signOut = async () => {
    const leavingUserId = user?.id ?? null;
    await supabase.auth.signOut();
    clearCompanyState(leavingUserId);
    //  THE ADDRESS CHANGES BEFORE THE SESSION DOES, and the order is the
    //  whole point. App decides what a signed-out visitor sees from
    //  window.location, so clearing `user` first would render one frame
    //  at the old address — /dashboard, which is not a sign-in path —
    //  and that frame is the marketing landing page. Setting /login
    //  first means the render in which the session disappears is already
    //  the sign-in screen, with no flash of the website in between.
    //
    //  Signing out is a request to leave the product, not a request to
    //  read about it. The way back in is the screen it should land on.
    try { window.history.replaceState({}, '', appUrl(SIGN_OUT_DESTINATION)); }
    catch { /* history is unavailable in some embedded views */ }
    setUser(null);
    setProfileOnly(null);
    setSession(null);
    setIsRecoveringPassword(false);
  };

  /**
   * Requests the reset email.
   *
   * `redirectTo` is the app's own origin: Supabase appends the recovery
   * token, the SDK exchanges it on load and fires PASSWORD_RECOVERY, which
   * the listener above turns into the reset screen. The redirect has to be
   * on Supabase's allow-list for the project or the link will refuse to
   * open — an operator setting, noted here because it is the one part of
   * this flow that cannot be fixed in the codebase.
   */
  const requestPasswordReset = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: passwordResetRedirectTo(window.location.origin),
      });
      //  A rejected address must not be distinguishable from an accepted
      //  one, so an error that only means "no such user" is swallowed and
      //  anything else is surfaced. The predicate is in
      //  lib/auth/passwordReset.ts with its own tests, because getting it
      //  wrong in either direction is a real fault: too broad and a failed
      //  send is reported as success, too narrow and the form enumerates
      //  accounts.
      if (error && !isAccountEnumerationError(error.message)) {
        throw error;
      }
      return { error: null };
    } catch (error) {
      logger.error('Password reset request failed:', error);
      return { error: error as Error };
    }
  };

  /**
   * Saves the new password, then clears the recovery flag so the app
   * proceeds normally with the session the link already established.
   */
  const completePasswordReset = async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setIsRecoveringPassword(false);
      setIsInitialPasswordSetup(false);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  /**
   * The way out of a session with no profile.
   *
   * It runs exactly what verified sign-up runs — create_company, then
   * provision_profile — because the gap it fills is a sign-up that got
   * as far as an auth user and no further. Reusing that path rather than
   * writing a second one means there is one definition of what a new
   * workspace is.
   */
  const provisionWorkspace = async (companyName: string) => {
    if (!user?.id || !user.email) {
      return { error: new Error('You are not signed in.') };
    }
    const name = companyName.trim();
    if (name.length < 2) {
      return { error: new Error('Enter your company name.') };
    }

    //  WHY THIS DOES NOT SIMPLY CALL THE TWO RPCs.
    //
    //  The repository's migrations and the deployed database are not
    //  known to match — Supabase's own preview check has failed on this
    //  repository since before any of this work, on a policy that
    //  "already exists", which is what a diverged migration history
    //  looks like. So create_company and provision_profile may or may
    //  not be installed on the database this build is talking to, and a
    //  bare RPC call fails with "function does not exist" and strands
    //  the person exactly where this function exists to rescue them.
    //
    //  Each step therefore tries the RPC and, ONLY when the database
    //  says that function is not there, does the same work directly.
    //  The direct path is not a way around a control: where the
    //  hardening migration has been applied the client INSERT is
    //  revoked and will fail, and where it has not been applied the
    //  direct INSERT is exactly what this application used to do. Role
    //  is written as 'content_creator' either way — the least
    //  privileged value, the same one provision_profile writes — so
    //  nothing here can ask for a privilege.
    const missingFunction = (e: any) =>
      e?.code === '42883' || e?.code === 'PGRST202' ||
      /(does not exist|could not find the function)/i.test(e?.message ?? '');

    try {
      const meta = user.user_metadata ?? {};
      const fullName = (meta.full_name as string) ?? '';

      // ── 1. the company ──────────────────────────────────────────────
      let companyId: string | null = null;
      const created = await (supabase as any).rpc('create_company', { p_name: name });

      if (!created.error) {
        companyId = created.data as string;
      } else if (missingFunction(created.error)) {
        logger.warn('create_company is not installed; creating the company directly');
        const ins = await (supabase as any)
          .from('companies').insert({ name }).select('id').single();
        if (ins.error) throw ins.error;
        companyId = ins.data.id as string;
        //  Ownership has to be written too, or the profile step below is
        //  refused for naming a company the caller is not a member of.
        const mem = await (supabase as any).from('company_members').insert({
          company_id: companyId, user_id: user.id, role: 'owner', status: 'active',
        });
        if (mem.error) throw mem.error;
      } else {
        throw created.error;
      }

      if (!companyId) throw new Error('The company was created but no id came back.');

      // ── 2. the profile ──────────────────────────────────────────────
      const provisionArgs = {
        p_email: user.email,
        p_full_name: fullName,
        p_organization: name,
        p_onboarding_completed: false,
        p_industry_type: (meta.industry_type as string | null) ?? null,
        p_default_jurisdiction: (meta.default_jurisdiction as string | null) ?? null,
        p_primary_markets: meta.default_jurisdiction ? [meta.default_jurisdiction] : null,
        p_company_id: companyId,
      };

      const provisioned = await (supabase as any).rpc('provision_profile', provisionArgs);

      if (provisioned.error) {
        if (!missingFunction(provisioned.error)) throw provisioned.error;

        logger.warn('provision_profile is not installed; writing the profile directly');
        const ins = await (supabase as any).from('profiles').insert({
          id: user.id,
          email: user.email,
          full_name: fullName || null,
          organization: name,
          company_id: companyId,
          onboarding_completed: false,
          role: 'content_creator',
        });

        //  A duplicate key here is the single most useful diagnostic this
        //  screen can produce: the row EXISTS and this session cannot
        //  read it. That is row-level security, not a missing profile,
        //  and it needs a policy fixed rather than another attempt.
        if (ins.error?.code === '23505') {
          throw new Error(
            'A profile already exists for this account but this session cannot read it. ' +
            'That is a row-level security policy on `profiles`, not a missing record — ' +
            'the policy that lets someone read their own row is not matching.',
          );
        }
        if (ins.error) throw ins.error;
      }

      await loadProfile(user.id);
      return { error: null };
    } catch (err) {
      logger.error('provisionWorkspace failed', err);
      const e = err as any;
      //  The code is worth showing: 42501 is a refused privilege, 23505 a
      //  duplicate, 42883 a missing function. They lead to different
      //  fixes and the message alone often does not distinguish them.
      const detail = e?.code ? ` (${e.code})` : '';
      return { error: new Error(`${e?.message ?? 'Something went wrong.'}${detail}`) };
    }
  };

  const refreshProfile = async () => {
    if (user) {
      //  Stays in the workspace the person is in. Without the explicit
      //  argument a refresh would fall back to the stored preference,
      //  which is the same value today but would diverge the moment
      //  storage is unavailable — and silently reverting somebody to
      //  another company's data on a background refresh is the worst
      //  shape this bug could take.
      await loadProfile(user.id, activeCompanyIdRef.current);
    }
  };

  /**
   * Opens another of the person's workspaces.
   *
   * The sequence matters. The company is validated against the server's own
   * list FIRST, so a request for a company this person does not hold never
   * changes any state at all.
   *
   * THEN IT CHANGES NOTHING UNTIL THE NEW WORKSPACE IS READY. This function
   * used to move the active company immediately and leave the profile to
   * catch up when four queries returned, which is exactly how the header
   * came to name one company over another company's rows. It now moves
   * nothing: `loadProfileInner` publishes the whole workspace in a single
   * render when it succeeds, and publishes nothing at all when it does not.
   *
   * That makes rollback trivial rather than delicate — there is no partial
   * state to undo. A failed switch leaves the previous workspace on screen,
   * untouched, and returns the error for the selector to show.
   *
   * Note what this does NOT do: it does not write `profiles.company_id`.
   * Switching is a view of a workspace, not a change of which workspace is
   * yours by default, and rewriting the profile row would make an
   * accidental click permanent and would race between two open tabs.
   */
  const switchCompany = async (companyId: string): Promise<{ error: Error | null }> => {
    if (!user?.id) return { error: new Error('You are not signed in.') };

    //  The decisions live in lib/auth/activeCompany.ts, where controlled
    //  promises can reproduce the timing this has to get right. Membership
    //  is judged against `companies` — the server's own answer — before the
    //  loader is reached at all. Belt and braces: even a forged id past
    //  this point reads nothing, because app_is_company_member() guards
    //  every company-scoped table on every statement.
    return switchWorkspace({
      companyId,
      currentCompanyId: activeCompanyIdRef.current,
      authorised: companies,
      setBusy: setSwitchingCompany,
      onError: (err) => logger.error('switchCompany failed:', err),
      //  `keepOnFailure` is the whole of the rollback: a workspace that
      //  cannot be read publishes nothing, so the previous profile,
      //  companies, header and pages all stay exactly as they were.
      load: (id) => loadProfileInner(user.id, id, { keepOnFailure: true }),
    });
  };

  //  ── A REVOKED ROLE AND AN OPEN TAB ──
  //
  //  The server stops authorising a revoked role on the next
  //  statement: app_work_roles reads the table and the session carries
  //  no copy of the answer. The CLIENT does carry a copy — the roles
  //  loaded at sign-in sit in React state — so a tab left open since
  //  before a revocation keeps drawing the navigation of a role its
  //  owner no longer holds.
  //
  //  Nothing is exposed by that: every write is refused server-side
  //  and the screen was never the control. What it produces is a
  //  person clicking something that then fails, which is a bad way to
  //  find out. So the roles are re-read when the tab comes back to
  //  the foreground, which is when somebody returns to a screen they
  //  left open.
  //
  //  It bounds the staleness; it does not eliminate it, and it is not
  //  a security boundary. docs/operational-role-model.md says so.
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        //  The workspace the person is in, read from the ref — this
        //  listener is registered once and must not reload the profile for
        //  whichever company was active when it was registered.
        loadProfile(user.id, activeCompanyIdRef.current)
          .catch(() => { /* a failed refresh keeps the last answer */ });
      }
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id]);

  return (
    <AuthContext.Provider
      value={{ user, profile, session, loading, activeBrandId, companies, activeCompanyId, defaultCompanyId, companiesError, switchingCompany, switchCompany, signUp, verifySignupCode, resendSignupCode, signIn, signOut, requestPasswordReset, completePasswordReset, isRecoveringPassword, isRecoveryCallback, isInitialPasswordSetup, refreshProfile, switchBrand, profileLoadError, provisionWorkspace }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
