import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
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
