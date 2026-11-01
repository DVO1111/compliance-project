/**
 * The dev server may talk to a loopback Supabase. The built site may not.
 *
 * index.html carries a Content-Security-Policy whose `connect-src` allows
 * `'self'` and `https://*.supabase.co`. That is correct for the deployed
 * site, and it makes the app unusable against the local stack: every call
 * to http://127.0.0.1:54321 is refused by the browser before it is sent,
 * and the only symptom on screen is "Failed to fetch" on the sign-in form.
 *
 * vite.config.ts adds the loopback origins back for `vite dev` only. These
 * tests pin BOTH halves of that, because the half that matters is the one
 * that is easy to lose: the production policy must not widen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const INDEX = readFileSync(join(root, 'index.html'), 'utf8');
const CONFIG = readFileSync(join(root, 'vite.config.ts'), 'utf8');

const connectSrc = (html: string) => {
  const m = html.match(/connect-src ([^;"]*)/);
  return m ? m[1].trim() : '';
};

describe('the committed CSP', () => {
  it('allows only self and the hosted Supabase', () => {
    const cs = connectSrc(INDEX);
    expect(cs).toContain("'self'");
    expect(cs).toContain('https://*.supabase.co');
  });

  it('does NOT allow loopback in the committed file', () => {
    //  The source of truth stays strict; the dev server is what relaxes it.
    const cs = connectSrc(INDEX);
    expect(cs).not.toContain('127.0.0.1');
    expect(cs).not.toContain('localhost');
  });

  it('has no wildcard host', () => {
    //  `*` anywhere in connect-src would make every other check here moot.
    expect(connectSrc(INDEX).split(/\s+/)).not.toContain('*');
  });
});

describe('the dev-only relaxation', () => {
  it("is applied by a plugin scoped to 'serve'", () => {
    /*
     *  `apply: 'serve'` IS the safeguard. Without it the transform would
     *  run during `vite build` and the deployed site would carry the
     *  loopback origins — which is the one outcome this must never have.
     */
    expect(CONFIG).toMatch(/allowLoopbackSupabaseInDev/);
    expect(CONFIG).toMatch(/apply:\s*'serve'/);
  });

  it('adds loopback literals and nothing broader', () => {
    //  No wildcard host, no scheme-only source, no `*`.
    const block = CONFIG.slice(CONFIG.indexOf('const LOOPBACK'), CONFIG.indexOf('transformIndexHtml'));
    expect(block).toContain('http://127.0.0.1:*');
    expect(block).toContain('http://localhost:*');
    expect(block).not.toMatch(/'\*'|https:\/\/\*[^.]/);
  });

  it('extends connect-src rather than replacing the policy', () => {
    //  Rewriting the whole meta tag would drop every other directive.
    expect(CONFIG).toMatch(/connect-src \$\{sources\.trim\(\)\} \$\{LOOPBACK\}/);
  });
});

describe('the built output, when one is present', () => {
  //  Not every checkout has run `npm run build`; when it has, the built
  //  policy is the thing that actually ships and is worth asserting.
  const dist = join(root, 'dist', 'index.html');
  it.runIf(existsSync(dist))('carries no loopback origin', () => {
    const cs = connectSrc(readFileSync(dist, 'utf8'));
    expect(cs).not.toContain('127.0.0.1');
    expect(cs).not.toContain('localhost');
    expect(cs).toContain('https://*.supabase.co');
  });
});
