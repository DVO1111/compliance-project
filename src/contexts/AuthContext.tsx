import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useJurisdictionStore } from '../stores/jurisdictionStore';
import { toJurisdictionId } from '../lib/regulatoryProfile';
import type { Database } from '../lib/database.types';
import type { Permissions } from '../lib/permissions';
import { fetchRoleById, ensureSystemRoles } from '../lib/roleService';
import { logger } from '../lib/logger';
import { reauthenticateWithPassword, type ReauthenticationClient } from '../lib/reauthentication';
import { initFrameworkLibrary } from '../lib/frameworkLibraryService';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];

// ✅ Extend profile with company_role and module_access from company_members
type Profile = ProfileRow & {
  company_role?: string | null;        // 'owner' | 'admin' | 'member' | etc
  module_access?: string[] | null;     // module keys assigned at invite time
  customPermissions?: Partial<Permissions> | null; // from custom_roles JSONB
};

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
  /**
   * Re-verify the signed-in user's password without disturbing the session.
   *
   * NOT for electronic signatures. Those go through
   * electronicSignatureService.signRecord(), whose RPC records every
   * attempt in electronic_signature_attempts and throttles repeated
   * failures. This helper does neither, so use it only to re-confirm
   * identity before an ordinary sensitive action.
   */
  reauthenticate: (password: string) => Promise<{ success: boolean; error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchBrand: (brandId: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  // Track whether the initial profile load has completed. After that,
  // background refreshes (token refresh, window focus) must NEVER set
  // loading=true — that unmounts the entire app and loses all page state.
  const initialLoadDone = useRef(false);

  const switchBrand = (brandId: string | null) => setActiveBrandId(brandId);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);

        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          // Genuine sign-in or profile change — reload profile
          if (session?.user) {
            await loadProfile(session.user.id);
          }
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
          setLoading(false);
        }
        // TOKEN_REFRESHED and INITIAL_SESSION: silently update session/user
        // without calling loadProfile (avoids setLoading(true) remount loop)
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    // Only show the full-screen spinner on the very first load.
    // All subsequent calls (token refresh, manual refresh, window focus)
    // update profile silently without unmounting the app.
    if (!initialLoadDone.current) setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      logger.error('loadProfile error:', error);
      setProfile(null);
      setLoading(false);
      initialLoadDone.current = true;
      return;
    }

    const baseProfile = (data ?? null) as ProfileRow | null;

    // If no profile row exists, stop
    if (!baseProfile) {
      setProfile(null);
      setLoading(false);
      initialLoadDone.current = true;
      return;
    }

    // ✅ Fetch company authority role + module_access from company_members
    let company_role: string | null = null;
    let module_access: string[] | null = null;

    if (baseProfile.company_id) {
      const { data: memberRow, error: memberErr } = await (supabase as any)
        .from('company_members')
        .select('role, module_access')
        .eq('company_id', baseProfile.company_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (memberErr) {
        // Not fatal — app can still run, just no company_role attached
        logger.warn('loadProfile company_members role lookup failed:', memberErr.message);
      } else {
        company_role = (memberRow as any)?.role ?? null;
        const raw = (memberRow as any)?.module_access;
        module_access = Array.isArray(raw) && raw.length > 0 ? raw : null;
      }

      // ✅ Ensure system roles exist for this company (run-once per company)
      const seedKey = `seeded_roles_${baseProfile.company_id}`;
      if (!localStorage.getItem(seedKey)) {
        ensureSystemRoles(baseProfile.company_id)
          .then(() => localStorage.setItem(seedKey, '1'))
          .catch(() => { /* RPC not available yet — will retry next login */ });
      }
    }

    // ✅ Load custom role permissions if assigned
    let customPermissions: Partial<Permissions> | null = null;
    const customRoleId = (baseProfile as any).custom_role_id;
    if (customRoleId) {
      try {
        const role = await fetchRoleById(customRoleId);
        if (role) {
          customPermissions = role.permissions as Partial<Permissions>;
        }
      } catch {
        // Not fatal — falls back to legacy role
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

    setProfile({ ...baseProfile, company_role, module_access, customPermissions });
    setLoading(false);
    initialLoadDone.current = true;
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

  //  Verified server-side by verify_user_password(), which hashes the
  //  candidate against auth.users for auth.uid() and returns a boolean.
  //
  //  Deliberately NOT supabase.auth.signInWithPassword(): that mints a
  //  fresh session and fires SIGNED_IN, so a re-auth prompt would rotate
  //  the caller's tokens and trigger a profile reload as a side effect of
  //  merely asking "is this really you". It would also move the decision
  //  into the browser, where the anon key already lives.
  const reauthenticate = (password: string) =>
    reauthenticateWithPassword(supabase as unknown as ReauthenticationClient, user, password);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, session, loading, activeBrandId, signUp, verifySignupCode, resendSignupCode, signIn, reauthenticate, signOut, refreshProfile, switchBrand }}
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
