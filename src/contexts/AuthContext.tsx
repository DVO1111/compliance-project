import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import type { Permissions } from '../lib/permissions';
import { fetchRoleById, ensureSystemRoles } from '../lib/roleService';
import { logger } from '../lib/logger';
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
    inviteToken?: string
  ) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
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

    setProfile({ ...baseProfile, company_role, module_access, customPermissions });
    setLoading(false);
    initialLoadDone.current = true;
  };

  const signUp = async (email: string, password: string, fullName: string, organization: string, inviteToken?: string) => {
    try {
      // 1) Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      // 2) Get the user id + email
      const userId = authData.user?.id;
      const userEmail = authData.user?.email;

      if (!userId || !userEmail) {
        throw new Error('Signup succeeded but user session/user data is missing.');
      }

      if (inviteToken) {
        // ── Invite path: skip company creation ──
        // The invite acceptance flow (accept_company_invite RPC) will
        // set company_id on the profile and create the company_members row.
        const { error: profileError } = await supabase.from('profiles').insert({
          id: userId,
          email: userEmail,
          full_name: fullName,
          organization: organization,
          onboarding_completed: false,
        });

        if (profileError && (profileError as any).code !== '23505') throw profileError;
      } else {
        // ── Normal signup path: create or join company ──
        // 3) Get or create the company id from the organization/company name
        const { data: companyId, error: companyError } = await (supabase as any).rpc('get_or_create_company', {
          p_name: organization,
        });

        if (companyError) throw companyError;

        if (!companyId) {
          throw new Error('Company setup failed: company id was not returned.');
        }

        // 4) Create profile row (client-side insert)
        const { error: profileError } = await supabase.from('profiles').insert({
          id: userId,
          email: userEmail,
          full_name: fullName,
          organization: organization,
          company_id: companyId,
          onboarding_completed: false,
        });

        if (profileError) throw profileError;

        // 5) Register the founding user as owner in company_members
        //    Use a real upsert (not ignoreDuplicates) so the role is always
        //    set to 'owner' even if get_or_create_company already inserted a row.
        await (supabase as any).from('company_members').upsert({
          company_id: companyId,
          user_id: userId,
          role: 'owner',
          status: 'active',
          joined_at: new Date().toISOString(),
        }, { onConflict: 'company_id,user_id' });
      }

      // IMPORTANT: load the profile immediately so onboarding shows consistently
      await loadProfile(userId);

      return authData as any;
    } catch (err) {
      logger.error('Signup failed:', err);
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
      value={{ user, profile, session, loading, activeBrandId, signUp, signIn, signOut, refreshProfile, switchBrand }}
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
