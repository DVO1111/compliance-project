/**
 * Safe account rollover — the properties that live outside SQL.
 *
 * The database half is `account_rollover_test.sql`, 33 assertions,
 * mutation-tested. What is checked here is the script and the migration as
 * TEXT: the order of operations, the refusals, and the things that must NOT
 * be in them.
 *
 * That is a weaker kind of test than exercising the code, and it is used
 * deliberately: the script's operations are Auth Admin API calls, and there
 * is no GoTrue in this environment to run them against. Asserting the shape
 * is honest about what it proves. The alternative — a mock of the Admin API
 * — would assert that my mock does what I wrote, which is worth nothing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = readFileSync(
  join(process.cwd(), 'scripts/rollover/rollover.ts'), 'utf8',
);
const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261213000000_account_rollover.sql'), 'utf8',
);

/** Prose explains what the code refuses to do, so it must not be searched. */
const CODE = SCRIPT
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const SQL = MIGRATION
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*--.*$/gm, '');

describe('nothing is deleted', () => {
  it('the script never deletes an auth user', () => {
    /*
     *  The whole design rests on this. Three users are referenced by NO
     *  ACTION foreign keys from batch_records, regulatory_licences and
     *  regulatory_submissions; deleting them is refused by the database
     *  and would destroy GMP authorship if it were not.
     */
    expect(CODE).not.toMatch(/deleteUser/);
    expect(CODE).not.toMatch(/\.delete\(\)/);
  });

  it('the migration never deletes a user or a business record', () => {
    expect(SQL).not.toMatch(/DELETE\s+FROM\s+auth\.users/i);
    expect(SQL).not.toMatch(/TRUNCATE/i);
    for (const t of ['batch_records', 'regulatory_licences', 'regulatory_submissions',
                     'material_lots', 'companies', 'sites']) {
      expect(SQL).not.toMatch(new RegExp(`DELETE\\s+FROM\\s+public\\.${t}`, 'i'));
    }
  });

  it('only removes the two things that are the account\'s own', () => {
    //  Membership and approver status. Nothing else.
    const deletes = SQL.match(/DELETE\s+FROM\s+public\.(\w+)/gi) ?? [];
    const tables = deletes.map((d) => d.split('.').pop()!.toLowerCase());
    expect(new Set(tables)).toEqual(new Set(['access_approvers', 'company_members']));
  });
});

describe('the order of operations', () => {
  it('revokes access before freeing the address', () => {
    /*
     *  Revocation is the step that matters within the hour and the only
     *  one that can be undone. If the rename ran first and the revoke
     *  failed, the address would be gone and the access would remain.
     */
    const revoke = CODE.indexOf('app_rollover_revoke');
    const rename = CODE.indexOf('updateUserById');
    expect(revoke).toBeGreaterThan(-1);
    expect(rename).toBeGreaterThan(-1);
    expect(revoke).toBeLessThan(rename);
  });

  it('bans in the same call that frees the address', () => {
    //  One call, so an account cannot end up renamed but still able to
    //  sign in if the second of two calls failed.
    expect(CODE).toMatch(/ban_duration/);
    const upd = CODE.indexOf('updateUserById');
    const ban = CODE.indexOf('ban_duration: BAN_FOREVER');
    expect(upd).toBeGreaterThan(-1);
    expect(ban).toBeGreaterThan(upd);
  });

  /*
   *  THESE TWO TESTS REPLACE ONES THAT ASSERTED THE OPPOSITE.
   *
   *  The suite used to require `signOut(` and `identity_data` in the
   *  source. Both were there, and both were inert — which is precisely
   *  what a test that greps the source cannot tell. Run against real
   *  GoTrue v2.197.0:
   *
   *    auth.admin.signOut() takes an ACCESS TOKEN, not a user id, and the
   *    admin form of the route 404s. It failed on every run, as a warning.
   *
   *    db.from('identities') resolves to public.identities, which does not
   *    exist; PostgREST answered PGRST205 every run, also as a warning.
   *
   *  So the outcomes are now asserted where they can actually be observed
   *  — scripts/local/test-rollover.sh checks auth.identities and the token
   *  refusals against a live Auth server — and what is pinned here is only
   *  that the two broken calls do not come back.
   */
  it('does not call signOut, which cannot work with a user id', () => {
    expect(CODE).not.toMatch(/signOut\(/);
    //  The ban is what ends access, so it must still be there.
    expect(CODE).toMatch(/BAN_FOREVER/);
  });

  it('does not reach for auth.identities through PostgREST', () => {
    //  GoTrue maintains identity_data.email on an admin email change;
    //  measured, and asserted end-to-end in the rollover integration test.
    expect(CODE).not.toMatch(/from\(['"]identities['"]\)/);
  });
});

describe('the refusals', () => {
  it('is a dry run unless --apply is given', () => {
    expect(CODE).toMatch(/--apply/);
    expect(CODE).toMatch(/if\s*\(!APPLY\)/);
  });

  it('refuses to roll over every approver', () => {
    /*
     *  Otherwise the project is left with nobody who can approve an access
     *  request or administer the allowlist, and the failure is silent —
     *  everything keeps working until somebody tries.
     */
    expect(CODE).toMatch(/REFUSING TO RUN[\s\S]{0,200}approver/i);
    expect(CODE).toMatch(/remaining\.length === 0/);
  });

  it('refuses when identities are keyed by email', () => {
    //  On this GoTrue version provider_id is the user uuid, so renaming
    //  frees the address. If an upgrade changes that, renaming would free
    //  an address still held under another unique index.
    expect(CODE).toMatch(/identities_keyed_by_email/);
    expect(CODE).toMatch(/app_rollover_preflight/);
  });

  it('skips an account that is already tombstoned, so a re-run is a no-op', () => {
    expect(CODE).toMatch(/endsWith\('\.invalid'\)/);
  });

  it('the migration refuses a second rollover of the same account', () => {
    expect(SQL).toMatch(/ROLLOVER_ALREADY_DONE/);
  });
});

describe('privilege', () => {
  it('every rollover function is service-role only, checked in the body', () => {
    //  Not left to the GRANT: a future grant widened by accident would
    //  still be refused.
    for (const fn of ['app_rollover_revoke', 'app_rollover_restore_membership',
                      'admin_bootstrap_approver']) {
      const body = SQL.slice(SQL.indexOf(`FUNCTION public.${fn}`));
      expect(body.slice(0, 2000)).toMatch(/service_role/);
    }
    expect(SQL).toMatch(/ROLLOVER_SERVICE_ROLE_ONLY/);
    expect(SQL).toMatch(/BOOTSTRAP_APPROVER_SERVICE_ROLE_ONLY/);
  });

  it('grants the privileged functions to nobody but service_role', () => {
    expect(SQL).not.toMatch(/GRANT EXECUTE[^;]*app_rollover_revoke[^;]*authenticated/);
    expect(SQL).not.toMatch(/GRANT EXECUTE[^;]*admin_bootstrap_approver[^;]*authenticated/);
    expect(SQL).not.toMatch(/GRANT EXECUTE[^;]*app_rollover_preflight[^;]*authenticated/);
  });

  it('keeps the rollover record out of the browser', () => {
    //  A list of real people's former addresses.
    expect(SQL).toMatch(/REVOKE ALL ON public\.account_rollovers FROM PUBLIC, anon, authenticated/);
    expect(SQL).toMatch(/ALTER TABLE public\.account_rollovers ENABLE ROW LEVEL SECURITY/);
    expect(SQL).not.toMatch(/CREATE POLICY[^;]*account_rollovers/i);
  });

  it('refuses to promote a tombstoned account', () => {
    //  It would hand administration to an account nobody can sign in to —
    //  a lockout that looks like a successful bootstrap.
    expect(SQL).toMatch(/BOOTSTRAP_APPROVER_NO_LIVE_USER/);
    expect(SQL).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.account_rollovers/);
  });
});

describe('attribution and recoverability', () => {
  it('records who the account was before the address is freed', () => {
    //  Otherwise "who signed this batch record" resolves to a tombstone
    //  and has no answer anywhere.
    expect(SQL).toMatch(/original_email\s+text NOT NULL/);
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.account_rollovers/);
  });

  it('keeps the rollover record even if the user is later deleted', () => {
    expect(SQL).toMatch(/old_user_id\s+uuid PRIMARY KEY REFERENCES auth\.users \(id\) ON DELETE RESTRICT/);
  });

  it('captures what it revoked, so an error can be undone', () => {
    expect(SQL).toMatch(/revoked_memberships\s+jsonb/);
    expect(SQL).toMatch(/app_rollover_restore_membership/);
  });

  it('tombstones into a domain that can never receive mail', () => {
    //  RFC 2606 reserves .invalid, so a tombstoned account cannot be
    //  recovered by someone who acquires a domain.
    expect(SQL).toMatch(/criateur\.invalid/);
    expect(SQL).toMatch(/account_rollovers_tombstone_invalid_chk/);
  });
});

describe('the allowlist survives', () => {
  it('is asserted at deploy time, not just hoped for', () => {
    expect(SQL).toMatch(/DEPLOY GUARD: allowed_signins has a CASCADE foreign key/);
  });

  it('nothing in the rollover touches allowed_signins', () => {
    expect(SQL).not.toMatch(/DELETE\s+FROM\s+public\.allowed_signins/i);
    expect(SQL).not.toMatch(/UPDATE\s+public\.allowed_signins/i);
    expect(CODE).not.toMatch(/allowed_signins/);
  });
});

describe('secrets', () => {
  it('reads credentials from the environment only', () => {
    expect(CODE).toMatch(/process\.env\[name\]/);
    expect(CODE).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('never prints a credential', () => {
    const logs = CODE.match(/console\.(log|warn|error)\([\s\S]{0,300}?\)/g) ?? [];
    for (const line of logs) {
      expect(line).not.toMatch(/SERVICE_ROLE_KEY|process\.env\./);
    }
  });

  it('carries no hard-coded key, url or token', () => {
    expect(CODE).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(CODE).not.toMatch(/https:\/\/[a-z0-9]{20}\.supabase\.co/);
  });
});
