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
