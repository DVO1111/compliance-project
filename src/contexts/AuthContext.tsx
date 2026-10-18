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
import { initFrameworkLibrary } from '../lib/frameworkLibraryService';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

// ✅ Extend profile with company_role and module_access from company_members
type Profile = ProfileRow & {
  company_role?: string | null;        // 'owner' | 'admin' | 'member' | etc
  module_access?: string[] | null;     // module keys assigned at invite time
  customPermissions?: Partial<Permissions> | null; // from custom_roles JSONB
};

function hasInviteCallback(): boolean {
  try {
    return isInviteCallback(window.location.search, window.location.hash);
  } catch {
    return false;
  }
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  activeBrandId: string | null;
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(INITIAL_AUTH_CALLBACK_IS_RECOVERY);
  const isRecoveryCallback = INITIAL_AUTH_CALLBACK_IS_RECOVERY;
  const [isInitialPasswordSetup, setIsInitialPasswordSetup] = useState(
    () => INITIAL_AUTH_CALLBACK_IS_INVITE || hasInviteCallback()
  );
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
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
          setProfile(null);
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
  const loadProfile = async (userId: string) => {
    // Only show the full-screen spinner on the very first load.
    // All subsequent calls (token refresh, manual refresh, window focus)
    // update profile silently without unmounting the app.
    if (!initialLoadDone.current) setLoading(true);

    try {
      await loadProfileInner(userId);
    } catch (err) {
      logger.error('loadProfile failed:', err);
      setProfile(null);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  };

  const loadProfileInner = async (userId: string) => {
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
    const [profileRes, memberRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      (supabase as any)
        .from('company_members')
        .select('company_id, role, module_access')
        .eq('user_id', userId),
    ]);

    if (profileRes.error) {
      logger.error('loadProfile error:', profileRes.error);
      setProfileLoadError(profileRes.error.message);
      setProfile(null);
      return;
    }

    const baseProfile = (profileRes.data ?? null) as ProfileRow | null;

    // If no profile row exists, stop — but say so, because "no row" and
    // "the query failed" need different answers from the person.
    if (!baseProfile) {
      setProfileLoadError('NO_PROFILE');
      setProfile(null);
      return;
    }

    let company_role: string | null = null;
    let module_access: string[] | null = null;

    if (memberRes?.error) {
      // Not fatal — the app still runs, just with no company_role attached
      logger.warn('loadProfile company_members lookup failed:', memberRes.error.message);
    } else if (baseProfile.company_id) {
      const row = ((memberRes?.data as any[]) ?? [])
        .find((m) => m.company_id === baseProfile.company_id);
      company_role = row?.role ?? null;
      const raw = row?.module_access;
      module_access = Array.isArray(raw) && raw.length > 0 ? raw : null;
    }

    //  The custom role is the one lookup that genuinely cannot start
    //  earlier: its id is a column on the profile. Most accounts have
    //  none, so most sign-ins never make this call at all.
    let customPermissions: Partial<Permissions> | null = null;
    const customRoleId = (baseProfile as any).custom_role_id;
    if (customRoleId) {
      const role = await fetchRoleById(customRoleId).catch(() => null);
      customPermissions = (role?.permissions as Partial<Permissions> | undefined) ?? null;
    }

    // ✅ Ensure system roles exist for this company (run-once per company)
    if (baseProfile.company_id) {
      const seedKey = `seeded_roles_${baseProfile.company_id}`;
      if (!localStorage.getItem(seedKey)) {
        ensureSystemRoles(baseProfile.company_id)
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

    setProfileLoadError(null);
    setProfile({ ...baseProfile, company_role, module_access, customPermissions });
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
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
      await loadProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, session, loading, activeBrandId, signUp, verifySignupCode, resendSignupCode, signIn, signOut, requestPasswordReset, completePasswordReset, isRecoveringPassword, isRecoveryCallback, isInitialPasswordSetup, refreshProfile, switchBrand, profileLoadError, provisionWorkspace }}
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
