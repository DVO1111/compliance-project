/**
 * Shown when the build has no Supabase configuration.
 *
 * It replaces a white screen. Everything in the product that reads or
 * writes anything needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY,
 * and Vite reads those at BUILD time — so a deploy that was built
 * without them cannot be repaired by setting them afterwards. It has to
 * be rebuilt. That is the one fact this screen exists to communicate,
 * because it is the part that costs people an hour.
 *
 * The onboarding hub at /onboarding is served before this check, since
 * it is a static screen that never touches the database.
 */

import { appUrl } from '../lib/routing';

export default function ConfigurationNeeded() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--onboarding-glow)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'var(--nv-font-body)',
      }}
    >
      <div style={{ maxWidth: 560 }}>
        <img
          src={appUrl("/criateur-logo-ondark.svg")}
          alt="Criateur"
          style={{ width: 132, height: 'auto', marginBottom: 28 }}
        />
        <h1 style={{
          margin: '0 0 12px',
          fontFamily: 'var(--nv-font-display)', fontWeight: 600,
          fontSize: 20, lineHeight: '28px',
          color: 'var(--nv-text-primary)',
        }}>
          This build is missing its configuration
        </h1>
        <p style={{
          margin: '0 0 16px',
          fontSize: 14, lineHeight: '21px',
          color: 'var(--nv-text-secondary)',
        }}>
          It was built without <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, so there is no backend to sign in to.
          Vite reads those values at build time: setting them on an existing deploy
          does nothing until the site is rebuilt.
        </p>
        <ol style={{
          margin: 0, paddingLeft: 20,
          fontSize: 14, lineHeight: '22px',
          color: 'var(--nv-text-secondary)',
        }}>
          <li>Netlify → Site configuration → Environment variables → Add a variable</li>
          <li>Add both keys, scoped to all deploy contexts</li>
          <li>Deploys → Trigger deploy → Clear cache and deploy site</li>
        </ol>
        <p style={{
          margin: '20px 0 0',
          fontSize: 13, lineHeight: '20px',
          color: 'var(--nv-text-tertiary)',
        }}>
          The onboarding hub needs no backend and is at{' '}
          <a href={appUrl("/onboarding")} style={{ color: 'var(--nv-action-primary-bg)' }}>/onboarding</a>.
        </p>
      </div>
    </div>
  );
}
