/**
 * The base-prefix stripping.
 *
 * This is worth tests because its failure mode is silent. If appPath()
 * returns '/compliance-project/onboarding' where the caller compares
 * against '/onboarding', nothing throws and nothing logs — the visitor
 * just lands on the marketing page, which is indistinguishable from the
 * route not existing.
 */
import { describe, it, expect } from 'vitest';
import {
  appPath, appUrl, basePath, isProductPath,
  SIGN_IN_PATHS, SIGN_OUT_DESTINATION, WORKSPACE_PATH,
} from '../lib/routing';

describe('where signing out leaves you', () => {
  //  THE INVARIANT THAT MAKES SIGNING OUT WORK. AuthContext sets the
  //  address to SIGN_OUT_DESTINATION; App decides what a signed-out
  //  visitor sees by testing the address against SIGN_IN_PATHS. If the
  //  two ever disagree, signing out puts people on the marketing
  //  landing page and the way back into the product is a URL they have
  //  to know to type. Nothing throws and nothing logs when that
  //  happens, which is why it is asserted here.
  it('is an address that shows the sign-in screen', () => {
    expect(SIGN_IN_PATHS).toContain(SIGN_OUT_DESTINATION);
  });

  //  appPath lower-cases and strips trailing slashes before comparing,
  //  so an entry that is not already in that form would never match the
  //  address it is meant to describe.
  it('lists its paths in the form appPath returns', () => {
    for (const p of SIGN_IN_PATHS) {
      expect(p).toBe(appPath(p));
    }
  });

  //  signOut navigates to appUrl(SIGN_OUT_DESTINATION) and App reads the
  //  result back with appPath. Those two have to be inverses of each
  //  other for the destination to be recognised on arrival.
  it('survives the round trip signOut and App make of it', () => {
    expect(appPath(appUrl(SIGN_OUT_DESTINATION))).toBe(SIGN_OUT_DESTINATION);
  });
});

describe('where signing in leaves you', () => {
  //  The same invariant in the other direction: App navigates to
  //  WORKSPACE_PATH on sign-in and reads the address back with appPath.
  it('survives the round trip App makes of it', () => {
    expect(appPath(appUrl(WORKSPACE_PATH))).toBe(WORKSPACE_PATH);
  });

  //  THE TWO DESTINATIONS MUST DIFFER. If the workspace address were
  //  also a sign-in address, signing in would move you to a path that
  //  renders the sign-in screen — a loop with no error in it.
  it('is not an address that shows the sign-in screen', () => {
    expect(SIGN_IN_PATHS).not.toContain(WORKSPACE_PATH);
    expect(WORKSPACE_PATH).not.toBe(SIGN_OUT_DESTINATION);
  });

  //  Asking for the workspace signed out is a request to sign in. The
  //  marketing root is deliberately NOT one of these: "/" stays the
  //  website for everybody, signed in or not.
  it('is a product address, and "/" is not', () => {
    expect(isProductPath(WORKSPACE_PATH)).toBe(true);
    expect(isProductPath(SIGN_OUT_DESTINATION)).toBe(true);
    expect(isProductPath('/')).toBe(false);
    expect(isProductPath('/about')).toBe(false);
  });
});

describe('basePath', () => {
  //  Tests run with the default base, so this pins the root case. The
  //  prefixed cases are exercised through appPath's explicit argument.
  it('is the root in this build', () => {
    expect(basePath()).toBe('/');
  });
});

describe('appPath at the root', () => {
  it('passes a path through', () => {
    expect(appPath('/onboarding')).toBe('/onboarding');
  });

  it('drops a trailing slash, but keeps the root as "/"', () => {
    expect(appPath('/onboarding/')).toBe('/onboarding');
    expect(appPath('/')).toBe('/');
    expect(appPath('//')).toBe('/');
  });

  it('lower-cases, because a typed URL is not reliably lower-case', () => {
    expect(appPath('/Onboarding')).toBe('/onboarding');
    expect(appPath('/PORTAL')).toBe('/portal');
  });

  it('leaves a nested path intact', () => {
    expect(appPath('/invite/accept')).toBe('/invite/accept');
    expect(appPath('/design/onboarding')).toBe('/design/onboarding');
  });

  //  The near-misses that decide whether a route matches at all.
  it('does not confuse a longer path for the route', () => {
    expect(appPath('/onboarding-old')).toBe('/onboarding-old');
    expect(appPath('/onboarding/step')).toBe('/onboarding/step');
  });
});

describe('appUrl', () => {
  it('returns a path the browser can be sent to', () => {
    expect(appUrl('/onboarding')).toBe('/onboarding');
    expect(appUrl('/')).toBe('/');
  });

  it('accepts a path with or without its leading slash', () => {
    expect(appUrl('onboarding')).toBe('/onboarding');
  });
});
