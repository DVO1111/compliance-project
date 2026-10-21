import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

//  Import specifier -> stand-in. Matched at resolve time because the
//  real modules are imported by relative path from several depths, so
//  one alias string cannot catch them all.
const STUBS: [RegExp, string][] = [
  [/(^|\/)supabase$/,            'stub-supabase.ts'],
  [/(^|\/)contexts\/AuthContext$/, 'stub-auth.tsx'],
  [/(^|\/)hooks\/usePlan$/,      'stub-plan.ts'],
];

export default defineConfig({
  root: __dirname,
  //  Relative, so the built harness works wherever it is served from:
  //  file://, http-server on :8099, or a /preview/ subdirectory of the
  //  deployed site. An absolute base would make the asset URLs depend
  //  on the host, which is how a preview that works locally 404s once
  //  it is published.
  base: './',
  build: { outDir: path.resolve(__dirname, 'out'), emptyOutDir: true },
  plugins: [
    {
      name: 'preview-stubs',
      enforce: 'pre',
      resolveId(source: string) {
        const hit = STUBS.find(([re]) => re.test(source));
        return hit ? path.resolve(__dirname, hit[1]) : null;
      },
    },
    react(),
  ],
});
