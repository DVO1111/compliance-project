/**
 * The company switcher's two decisions.
 *
 * These are the parts of multi-workspace access that can be wrong in a way
 * somebody would notice: which workspace opens, and whether a workspace may
 * be opened at all. The real tenant boundary is RLS —
 * app_is_company_member() on every company-scoped table — so none of this
 * is what stops a determined client reading another company's data. What it
 * stops is the INTERFACE lying: a header naming one company over another
 * company's rows, a revoked membership still on offer, a workspace appearing
 * because its id was lying around in storage.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveActiveCompany, isSwitchAuthorised, activeCompanyStorageKey,
  isMissingFunctionError, type AuthorisedCompany,
} from '../lib/auth/activeCompany';

const STERLIN = '3b08610c-9262-46a4-863d-72751fe0ee13';
const IBADAN = '43ff9447-0022-5109-b9bf-edea7cc884df';
const STRANGER = '00000000-0000-4000-8000-000000000999';

const both: AuthorisedCompany[] = [
  { company_id: IBADAN, company_name: 'Ibadan Pharmaceuticals Ltd', role: 'owner' },
  { company_id: STERLIN, company_name: 'Sterlin Glams Limited', role: 'owner' },
];
const onlySterlin: AuthorisedCompany[] = [
  { company_id: STERLIN, company_name: 'Sterlin Glams Limited', role: 'owner' },
];

describe('resolveActiveCompany — precedence', () => {
  it('opens the workspace just asked for, over the remembered and default ones', () => {
    expect(resolveActiveCompany({
      preferred: IBADAN, stored: STERLIN, profileCompanyId: STERLIN, authorised: both,
    })).toBe(IBADAN);
  });

  it('opens the remembered workspace when nothing was asked for', () => {
    expect(resolveActiveCompany({
      stored: IBADAN, profileCompanyId: STERLIN, authorised: both,
    })).toBe(IBADAN);
  });

  it('opens the profile default when nothing is remembered', () => {
    expect(resolveActiveCompany({
      profileCompanyId: STERLIN, authorised: both,
    })).toBe(STERLIN);
  });
});

describe('resolveActiveCompany — an unauthorised candidate is never honoured', () => {
  it('ignores a company that was asked for but is not granted', () => {
    /*
     *  This is the localStorage-tampering case, and the one the
     *  requirement is explicit about: a company id in client state is not
     *  an authorisation. The server's list is the only input that decides.
     */
    expect(resolveActiveCompany({
      preferred: STRANGER, stored: null, profileCompanyId: STERLIN, authorised: onlySterlin,
    })).toBe(STERLIN);
  });

  it('ignores a remembered company whose membership has since been revoked', () => {
    //  Yesterday this person could open Ibadan. The stored preference still
    //  says so; the server no longer does, and the server wins.
    expect(resolveActiveCompany({
      stored: IBADAN, profileCompanyId: STERLIN, authorised: onlySterlin,
    })).toBe(STERLIN);
  });

  it('never returns a company that is absent from the list', () => {
    const picked = resolveActiveCompany({
      preferred: STRANGER, stored: STRANGER, profileCompanyId: STRANGER, authorised: onlySterlin,
    });
    expect(picked).not.toBe(STRANGER);
    expect(onlySterlin.map((c) => c.company_id)).toContain(picked);
  });
});

describe('resolveActiveCompany — sensible defaults', () => {
  it('falls back to a held workspace when even the profile default is gone', () => {
    //  The profile points at a company this person has been removed from.
    //  Opening it would show an empty product and look like data loss; the
    //  workspace they still hold is the better answer.
    expect(resolveActiveCompany({
      profileCompanyId: STRANGER, authorised: onlySterlin,
    })).toBe(STERLIN);
  });

  it('is deterministic when nothing at all is proposed', () => {
    expect(resolveActiveCompany({ authorised: both })).toBe(both[0].company_id);
  });

  it('returns null for a session with no workspace and no list', () => {
    expect(resolveActiveCompany({ authorised: [] })).toBeNull();
  });
});

describe('resolveActiveCompany — a database without the function', () => {
  /*
   *  app_my_companies() arrives in 20261215000000. Until that migration is
   *  applied the RPC fails, and an app talking to such a database must
   *  behave EXACTLY as it did before the switcher existed: the profile's
   *  own company, no second-guessing. Getting this wrong would break every
   *  existing deployment on the day this ships, which is why "the list
   *  failed" and "the list is empty" are different inputs.
   */
  it('uses the profile company when the list could not be read', () => {
    expect(resolveActiveCompany({
      stored: IBADAN, profileCompanyId: STERLIN, authorised: [], listFailed: true,
    })).toBe(STERLIN);
  });

  it('does not honour a remembered company it cannot verify', () => {
    //  No list means nothing can be checked against it. An unverifiable
    //  preference is not acted on.
    expect(resolveActiveCompany({
      stored: IBADAN, profileCompanyId: STERLIN, authorised: [], listFailed: true,
    })).not.toBe(IBADAN);
  });

  it('ignores a stale list if the refresh failed', () => {
    expect(resolveActiveCompany({
      preferred: IBADAN, profileCompanyId: STERLIN, authorised: both, listFailed: true,
    })).toBe(STERLIN);
  });
});

describe('isSwitchAuthorised', () => {
  it('permits a workspace the server listed', () => {
    expect(isSwitchAuthorised(IBADAN, both)).toBe(true);
    expect(isSwitchAuthorised(STERLIN, both)).toBe(true);
  });

  it('refuses a workspace the server did not list', () => {
    expect(isSwitchAuthorised(IBADAN, onlySterlin)).toBe(false);
    expect(isSwitchAuthorised(STRANGER, both)).toBe(false);
  });

  it('refuses everything when there is no list', () => {
    expect(isSwitchAuthorised(STERLIN, [])).toBe(false);
  });

  it('refuses an absent id rather than treating it as "any"', () => {
    expect(isSwitchAuthorised(null, both)).toBe(false);
    expect(isSwitchAuthorised(undefined, both)).toBe(false);
    expect(isSwitchAuthorised('', both)).toBe(false);
  });
});

describe('isMissingFunctionError — an un-migrated database is not a fault', () => {
  /*
   *  This predicate decides whether a warning badge appears in the header
   *  of every user's screen. app_my_companies() arrives in
   *  20261215000000, so until that is applied the RPC fails on every
   *  sign-in on every deployment — and telling every user about a feature
   *  they have not been given is not a warning, it is noise.
   */
  it('recognises the Postgres undefined_function code', () => {
    expect(isMissingFunctionError({ code: '42883' })).toBe(true);
  });

  it('recognises the PostgREST schema-cache miss', () => {
    expect(isMissingFunctionError({ code: 'PGRST202' })).toBe(true);
  });

  it('recognises both wordings', () => {
    expect(isMissingFunctionError({
      message: 'function public.app_my_companies() does not exist',
    })).toBe(true);
    expect(isMissingFunctionError({
      message: 'Could not find the function public.app_my_companies without parameters',
    })).toBe(true);
  });

  it('does NOT swallow a genuine failure', () => {
    //  These must surface. Somebody with two workspaces being shown a
    //  single-workspace product would reasonably conclude that one of
    //  their companies had been taken away from them.
    expect(isMissingFunctionError({ message: 'Failed to fetch' })).toBe(false);
    expect(isMissingFunctionError({ code: '42501', message: 'permission denied for function' }))
      .toBe(false);
    expect(isMissingFunctionError({ code: '57014', message: 'canceling statement due to statement timeout' }))
      .toBe(false);
    expect(isMissingFunctionError({ message: 'JWT expired' })).toBe(false);
  });

  it('treats no error as no error', () => {
    expect(isMissingFunctionError(null)).toBe(false);
    expect(isMissingFunctionError(undefined)).toBe(false);
    expect(isMissingFunctionError({})).toBe(false);
  });
});

describe('the remembered workspace is scoped to one account', () => {
  it('gives two users different keys', () => {
    //  Signing out and in as somebody else must not inherit the previous
    //  person's workspace. Different key, nothing found, profile default.
    const a = activeCompanyStorageKey('95f784f3-b9a6-4f57-8c64-1da313e78e3d');
    const b = activeCompanyStorageKey('11111111-2222-3333-4444-555555555555');
    expect(a).not.toBe(b);
    expect(a).toContain('95f784f3-b9a6-4f57-8c64-1da313e78e3d');
  });

  it('is not a bare shared key', () => {
    expect(activeCompanyStorageKey('u1')).not.toBe('criateur_active_company_');
  });
});
