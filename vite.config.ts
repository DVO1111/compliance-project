import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  plugins: [react()],
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
