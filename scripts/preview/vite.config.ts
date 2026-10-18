import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const STUB = path.resolve(__dirname, 'stub-supabase.ts');

export default defineConfig({
  root: __dirname,
  build: { outDir: path.resolve(__dirname, 'out'), emptyOutDir: true },
  plugins: [
    {
      //  Intercept the client at resolve time. firstRun.ts imports it as
      //  '../supabase', not as a path an alias string would match, which
      //  is why this is a resolver and not resolve.alias.
      name: 'stub-supabase',
      enforce: 'pre',
      resolveId(source: string) {
        return /(^|\/)supabase$/.test(source) ? STUB : null;
      },
    },
    react(),
  ],
});
