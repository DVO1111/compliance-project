/**
 * The current path, with the site's base prefix removed.
 *
 * WHY THIS EXISTS. The app reads window.location.pathname directly to
 * decide between the sign-in screen, the onboarding hub and the invite
 * flow. That works while the site is served from the root, and breaks
 * silently the moment it is not: on a GitHub Pages project site the
 * same screen is at /compliance-project/onboarding, the comparison
 * against '/onboarding' fails, and the visitor lands on the marketing
 * page with no error anywhere.
 *
 * Vite writes the base it built with into import.meta.env.BASE_URL, so
 * the prefix is known at runtime and can be stripped once, here, rather
 * than remembered at four call sites.
 */

/** The base the bundle was built with, normalised to start and end with
 *  a slash: '/' at the root, '/compliance-project/' on a project site. */
export function basePath(): string {
  const raw = (import.meta as any)?.env?.BASE_URL ?? '/';
  const withLead = raw.startsWith('/') ? raw : `/${raw}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
}

/**
 * The path within the app: lower-cased, no trailing slash, no base
 * prefix. '/' when at the app's root.
 *
 *   base '/'                    /onboarding/  → '/onboarding'
 *   base '/compliance-project/' /compliance-project/onboarding → '/onboarding'
 */
export function appPath(pathname?: string): string {
  let path: string;
  try {
    path = (pathname ?? window.location.pathname).toLowerCase();
  } catch {
    return '/';
  }

  const base = basePath().toLowerCase();
  if (base !== '/' && (path === base.slice(0, -1) || path.startsWith(base))) {
    path = path.slice(base.length - 1);
  }

  //  Trailing slashes are stripped so '/onboarding/' and '/onboarding'
  //  are the same route; the root stays '/' rather than becoming ''.
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** An in-app path as a URL the browser can be sent to, base included. */
export function appUrl(path: string): string {
  const base = basePath();
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${clean}`;
}
