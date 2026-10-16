import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { isInviteCallback } from './auth/inviteCallback';

// Supabase can consume the auth callback fragment during client initialization.
// Capture the invite marker first so the app still knows why this page opened.
export const INITIAL_AUTH_CALLBACK_IS_INVITE = typeof window !== 'undefined'
  && isInviteCallback(window.location.search, window.location.hash);

// Support both Vite (import.meta.env) and Node.js (process.env) environments
const env: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : (typeof process !== 'undefined' ? process.env : {});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

/**
 * Whether this build was given a backend.
 *
 * WHY THIS IS A FLAG AND NO LONGER A THROW. This module used to throw at
 * import when the two variables were missing. Everything imports it, so
 * the throw happened while the bundle was still evaluating: React never
 * mounted and EVERY route rendered white — the marketing site, the login
 * screen, and /onboarding, which is a static screen that touches no data
 * and had no business being taken down by a database setting.
 *
 * One missing deploy variable should not be able to blank a whole site.
 * So the failure is now scoped to what actually needs the backend: the
 * client below still refuses to be used, loudly and by name, but the
 * pages that never call it render.
 *
 * It is NOT a silent fallback. Nothing works around a missing backend:
 * any call throws with the same message it always did, and App.tsx shows
 * a configuration screen rather than an app that half works.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const SUPABASE_CONFIG_ERROR =
  'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.';

/**
 * A stand-in that throws on first use rather than on import.
 *
 * Every property access lands here, so `supabase.from(...)`,
 * `supabase.auth.getSession()` and the rest all fail with the real
 * message — the same one the import used to throw — at the moment
 * something genuinely needs the database.
 */
function unconfiguredClient(): ReturnType<typeof createClient<Database>> {
  const fail = (): never => {
    throw new Error(SUPABASE_CONFIG_ERROR);
  };
  return new Proxy({} as ReturnType<typeof createClient<Database>>, {
    get: fail,
    apply: fail,
  });
}

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl as string, supabaseAnonKey as string)
  : unconfiguredClient();
