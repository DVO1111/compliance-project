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
  isMissingFunctionError, createLoadSequencer, switchWorkspace,
  type AuthorisedCompany,
} from '../lib/auth/activeCompany';

/**
 * A promise this test resolves by hand.
 *
 * Every timing test below uses one. No sleeps, no fake timers, no
 * flakiness: the test decides exactly when the "database" answers, and can
 * inspect the world while the answer is still outstanding — which is the
 * only moment the bug being guarded against was ever visible.
 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * The smallest thing that behaves like the screen.
 *
 * `publish` is atomic on purpose — that is what AuthContext's single
 * `setWorkspace` call buys, and these tests assert the orchestration never
 * asks for anything less.
 */
function fakeScreen(initial: string) {
  const view = { header: initial, rows: initial };
  return {
    view,
    publish(company: string) { view.header = company; view.rows = company; },
    /** The state the bug produced: header one company, rows another. */
    get isTorn() { return view.header !== view.rows; },
  };
}

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

/* ===================================================================
 *  THE RACE CONDITION, AND WHY THESE TESTS EXIST
 *
 *  Shipped in #37: switchCompany set the active company immediately and
 *  the profile only after four queries returned. Between those two points
 *  the header named the new company while every page still rendered the
 *  old company's rows. Measured at over eleven seconds against a database
 *  that had just finished crash recovery.
 *
 *  React batching does not fix it — the updates are separated by `await`,
 *  and batching works within a synchronous block, not across one. The fix
 *  is that nothing is published until the load succeeds, and then all of
 *  it is published at once.
 *
 *  Every test here drives a promise the test itself resolves, so the
 *  moment "the query is still outstanding" is inspectable and the result
 *  is deterministic.
 * =================================================================== */

const ACME: AuthorisedCompany = { company_id: 'c-acme', company_name: 'Acme', role: 'owner' };
const BETA: AuthorisedCompany = { company_id: 'c-beta', company_name: 'Beta', role: 'member' };
const BOTH = [ACME, BETA];

describe('switchWorkspace — nothing changes until the load succeeds', () => {
  it('1. publishes NOTHING while a slow profile query is outstanding', async () => {
    const screen = fakeScreen('c-acme');
    const gate = deferred<boolean>();
    const busy: boolean[] = [];

    const pending = switchWorkspace({
      companyId: 'c-beta', currentCompanyId: 'c-acme', authorised: BOTH,
      setBusy: (b) => busy.push(b),
      load: async (id) => { const ok = await gate.promise; if (ok) screen.publish(id); return ok; },
    });

    //  THE MOMENT THAT USED TO BE BROKEN. The switch is in flight and the
    //  database has not answered. Before the fix the header already said
    //  "Beta" here while the rows still said "Acme".
    await Promise.resolve();
    expect(screen.view.header).toBe('c-acme');
    expect(screen.view.rows).toBe('c-acme');
    expect(screen.isTorn).toBe(false);
    expect(busy[0]).toBe(true);           // the indicator IS running

    gate.resolve(true);
    expect((await pending).error).toBeNull();
    expect(screen.view).toEqual({ header: 'c-beta', rows: 'c-beta' });
    expect(busy).toEqual([true, false]);  // and it stops
  });

  it('2. header and rows are never observed disagreeing, at any point', async () => {
    const screen = fakeScreen('c-acme');
    const gate = deferred<boolean>();
    const samples: boolean[] = [];
    const sample = () => samples.push(screen.isTorn);

    const pending = switchWorkspace({
      companyId: 'c-beta', currentCompanyId: 'c-acme', authorised: BOTH,
      setBusy: sample,
      load: async (id) => { sample(); const ok = await gate.promise; sample(); if (ok) screen.publish(id); sample(); return ok; },
    });
    sample(); await Promise.resolve(); sample();
    gate.resolve(true); await pending; sample();

    expect(samples.length).toBeGreaterThanOrEqual(6);
    expect(samples).not.toContain(true);
  });

  it('3. a successful switch leaves the new company everywhere', async () => {
    const screen = fakeScreen('c-acme');
    const r = await switchWorkspace({
      companyId: 'c-beta', currentCompanyId: 'c-acme', authorised: BOTH,
      setBusy: () => {}, load: async (id) => { screen.publish(id); return true; },
    });
    expect(r.error).toBeNull();
    expect(screen.view).toEqual({ header: 'c-beta', rows: 'c-beta' });
  });
});

describe('switchWorkspace — a failed switch keeps the previous workspace', () => {
  it('4a. a load that returns false changes nothing and reports why', async () => {
    const screen = fakeScreen('c-acme');
    const busy: boolean[] = [];
    const r = await switchWorkspace({
      companyId: 'c-beta', currentCompanyId: 'c-acme', authorised: BOTH,
      setBusy: (b) => busy.push(b),
      load: async () => false,          // publishes nothing, as keepOnFailure does
    });
    expect(r.error?.message).toMatch(/still in the previous one/i);
    expect(screen.view).toEqual({ header: 'c-acme', rows: 'c-acme' });
    expect(busy).toEqual([true, false]);   // the indicator still stops
  });

  it('4b. a load that THROWS also changes nothing', async () => {
    const screen = fakeScreen('c-acme');
    const seen: unknown[] = [];
    const r = await switchWorkspace({
      companyId: 'c-beta', currentCompanyId: 'c-acme', authorised: BOTH,
      setBusy: () => {}, onError: (e) => seen.push(e),
      load: async () => { throw new Error('connection lost'); },
    });
    expect(r.error?.message).toBe('connection lost');
    expect(seen).toHaveLength(1);
    expect(screen.view).toEqual({ header: 'c-acme', rows: 'c-acme' });
  });

  it('4c. an unauthorised company never reaches the loader', async () => {
    //  The authorisation check must happen BEFORE any work, so a company
    //  this person does not hold cannot even cause a query.
    let called = 0;
    const r = await switchWorkspace({
      companyId: 'c-stranger', currentCompanyId: 'c-acme', authorised: BOTH,
      setBusy: () => {}, load: async () => { called += 1; return true; },
    });
    expect(r.error?.message).toMatch(/do not have access/i);
    expect(called).toBe(0);
  });

  it('4d. switching to the one already open is a no-op, not a reload', async () => {
    let called = 0;
    const r = await switchWorkspace({
      companyId: 'c-acme', currentCompanyId: 'c-acme', authorised: BOTH,
      setBusy: () => {}, load: async () => { called += 1; return true; },
    });
    expect(r.error).toBeNull();
    expect(called).toBe(0);
  });
});

describe('switchWorkspace — a slow custom-role lookup is inside the atomic step', () => {
  it('5. the extra await adds no intermediate state', async () => {
    /*
     *  custom_roles is fetched by id AFTER the first four queries, so it
     *  is a second await inside the load. It used to sit between the
     *  active company being set and the profile being set — a second,
     *  smaller window of the same bug. It is now inside the single
     *  publication step, so it cannot be observed at all.
     */
    const screen = fakeScreen('c-acme');
    const queries = deferred<void>();
    const role = deferred<void>();
    const torn: boolean[] = [];

    const pending = switchWorkspace({
      companyId: 'c-beta', currentCompanyId: 'c-acme', authorised: BOTH,
      setBusy: () => {},
      load: async (id) => {
        await queries.promise; torn.push(screen.isTorn);
        await role.promise;    torn.push(screen.isTorn);
        screen.publish(id);    return true;
      },
    });

    queries.resolve(); await Promise.resolve();
    expect(screen.view.header).toBe('c-acme');   // still wholly the old one
    role.resolve();
    expect((await pending).error).toBeNull();
    expect(torn).toEqual([false, false]);
    expect(screen.view).toEqual({ header: 'c-beta', rows: 'c-beta' });
  });
});

describe('createLoadSequencer — the last choice wins', () => {
  it('6a. a slow earlier load cannot overwrite a faster later one', async () => {
    /*
     *  Two clicks in quick succession. The FIRST query is slower than the
     *  second. Without the ticket the first would publish last and the
     *  person would land in the workspace they did not choose last.
     */
    const seq = createLoadSequencer();
    const screen = fakeScreen('c-acme');
    const first = deferred<void>();
    const second = deferred<void>();

    const load = async (id: string, gate: Promise<void>) => {
      const ticket = seq.begin();
      await gate;
      if (!seq.isCurrent(ticket)) return 'dropped';
      screen.publish(id);
      return 'published';
    };

    const a = load('c-beta', first.promise);     // clicked first, answers last
    const b = load('c-acme', second.promise);    // clicked second, answers first

    second.resolve();
    expect(await b).toBe('published');
    first.resolve();
    expect(await a).toBe('dropped');

    //  The last CHOICE is what is on screen, not the last ANSWER.
    expect(screen.view).toEqual({ header: 'c-acme', rows: 'c-acme' });
  });

  it('6b. the newest ticket is the only current one', () => {
    const seq = createLoadSequencer();
    const t1 = seq.begin();
    const t2 = seq.begin();
    expect(seq.isCurrent(t1)).toBe(false);
    expect(seq.isCurrent(t2)).toBe(true);
    expect(t1).not.toBe(t2);
  });

  it('6c. invalidate() makes every load in flight stale', () => {
    //  Sign-out uses this, so a load still running cannot publish a
    //  signed-out person's workspace afterwards.
    const seq = createLoadSequencer();
    const t = seq.begin();
    expect(seq.isCurrent(t)).toBe(true);
    seq.invalidate();
    expect(seq.isCurrent(t)).toBe(false);
  });
});

describe('the tear detector itself can fail (positive control)', () => {
  /*
   *  A regression test that cannot fail protects nothing. This reproduces
   *  the ORIGINAL sequence — header first, rows after the await — and
   *  requires the detector above to notice. If this ever stops failing to
   *  be torn, the tests above have stopped testing anything.
   */
  it('catches the pre-fix sequence: header moved before the data', async () => {
    const screen = fakeScreen('c-acme');
    const gate = deferred<void>();
    const seen: boolean[] = [];

    const buggySwitch = async (id: string) => {
      screen.view.header = id;        // what switchCompany used to do, eagerly
      seen.push(screen.isTorn);       // ← the window
      await gate.promise;
      screen.view.rows = id;          // what setProfile did, four queries later
      seen.push(screen.isTorn);
    };

    const p = buggySwitch('c-beta');
    await Promise.resolve();
    //  Mid-flight the screen IS torn — header Beta, rows still Acme.
    expect(screen.view.header).toBe('c-beta');
    expect(screen.view.rows).toBe('c-acme');
    expect(screen.isTorn).toBe(true);

    gate.resolve(); await p;
    expect(seen).toEqual([true, false]);   // torn, then consistent
  });

  it('and the fixed sequence is never torn under the same timing', async () => {
    const screen = fakeScreen('c-acme');
    const gate = deferred<boolean>();
    const p = switchWorkspace({
      companyId: 'c-beta', currentCompanyId: 'c-acme', authorised: BOTH,
      setBusy: () => {},
      load: async (id) => { const ok = await gate.promise; if (ok) screen.publish(id); return ok; },
    });
    await Promise.resolve();
    expect(screen.isTorn).toBe(false);
    gate.resolve(true); await p;
    expect(screen.isTorn).toBe(false);
  });
});
