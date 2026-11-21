import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Let the DEV SERVER ONLY talk to a Supabase stack on loopback.
 *
 * index.html carries a Content-Security-Policy whose `connect-src` allows
 * `'self'` and `https://*.supabase.co`. That is right for the deployed site
 * and it makes the app unusable against the local stack: every call to
 * `http://127.0.0.1:54321` is refused by the browser before it is sent, and
 * the only symptom is "Failed to fetch" on the sign-in form —
 *
 *   Refused to connect to 'http://127.0.0.1:54321/auth/v1/health' because
 *   it violates the following Content Security Policy directive:
 *   "connect-src 'self' https://*.supabase.co ..."
 *
 * which looks like a broken database and is not.
 *
 * `apply: 'serve'` is the whole safeguard: this runs for `vite dev` and
 * NEVER for `vite build`, so the CSP in `dist/index.html` is untouched and
 * the deployed site keeps exactly the policy it has today. The additions
 * are loopback literals only — no wildcard host, no `*`.
 */
function allowLoopbackSupabaseInDev(): Plugin {
  const LOOPBACK = [
    'http://127.0.0.1:*', 'ws://127.0.0.1:*',
    'http://localhost:*', 'ws://localhost:*',
  ].join(' ');
  return {
    name: 'criateur-dev-csp-loopback',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(/connect-src ([^;"]*)/, (_m, sources: string) =>
        `connect-src ${sources.trim()} ${LOOPBACK}`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  //  WHERE THE SITE IS SERVED FROM.
  //
  //  '/' for criateur.com and for any host that serves the app at the
  //  root. GitHub Pages serves a project site under /<repo>/ instead, so
  //  that build passes VITE_BASE_PATH=/compliance-project/ and every
  //  asset URL is written with the prefix. Getting this wrong is not
  //  subtle: the page loads and every script 404s.
  //
  //  The routes read it back through import.meta.env.BASE_URL — see
  //  appPath() in src/lib/routing.ts — so /onboarding keeps working
  //  whichever prefix the site is under.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), allowLoopbackSupabaseInDev()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // Never inline font files as data: URIs. The app's CSP has no `font-src`
    // beyond `default-src 'self'`, so an inlined font is refused by the browser
    // and that subset silently falls back to a system face.
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined),
  },
});
