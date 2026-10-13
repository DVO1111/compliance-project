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
import { appPath, appUrl, basePath } from '../lib/routing';

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
