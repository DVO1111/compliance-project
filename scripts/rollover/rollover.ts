/**
 * Safe account rollover — the Auth Admin API half.
 *
 *   npx tsx scripts/rollover/rollover.ts              plan only (the default)
 *   npx tsx scripts/rollover/rollover.ts --apply      perform it
 *
 * DRY RUN IS THE DEFAULT. --apply is the only thing that changes anything,
 * and it is irreversible for the addresses it frees.
 *
 * ── WHAT THIS DOES, AND IN WHAT ORDER ─────────────────────────────────────
 *
 * Per user, and the order is load-bearing:
 *
 *   1. app_rollover_revoke(id)   records who they were, captures their
 *                                memberships, removes them. ENDS DATA
 *                                ACCESS AT ONCE, because every RLS policy
 *                                reads company_members and a policy is
 *                                evaluated per statement.
 *   2. updateUserById            email -> tombstone, email_confirm: true,
 *                                and a permanent ban in the same call.
 *                                FREES THE ADDRESS — `users_email_partial_key`
 *                                is the unique index that was holding it —
 *                                and bars sign-in even to someone who knows
 *                                the password.
 *                                It ALSO rewrites identity_data.email, which
 *                                this script used to try to do itself; see
 *                                below.
 *
 * Step 1 first because it is the one that matters within the hour, and the
 * one that can be rolled back. If a later step fails, access is already
 * gone and the record of what was taken is already written.
 *
 * ── THE IDENTITY STEP WAS DEAD CODE, AND GOTRUE DOES IT ───────────────────
 *
 * There used to be a third step that updated `identity_data.email` through
 * `db.from('identities')`. PostgREST serves the `public` schema, there is no
 * `public.identities`, and the `auth` schema is not exposed — so the call
 * answered PGRST205 "Could not find the table 'public.identities'" on every
 * run. It was handled as a warning, which is why it went unnoticed.
 *
 * Checked whether anything needed to replace it, on local GoTrue, by
 * renaming a probe account through the Admin API and nothing else:
 *
 *   identity_data->>'email' before -> identityprobe@criateur.test
 *   PUT /admin/users/<id> {"email": ...} -> 200
 *   identity_data->>'email' after  -> renamed.probe@criateur.invalid
 *
 * GoTrue maintains it. The step was removed rather than reimplemented
 * against an RPC: the outcome it existed for already happens, and the
 * rollover test asserts that outcome directly so a future GoTrue that
 * stopped doing it would fail the suite rather than pass it quietly.
 *
 * ── THERE IS NO STEP 5, AND THERE USED TO BE ──────────────────────────────
 *
 * An earlier version called `auth.admin.signOut(t.id, 'global')` as a fifth
 * step and claimed it "deletes sessions and refresh tokens". It did neither.
 * That method takes a user's ACCESS TOKEN, not a user id, and posts to a
 * route this rollover has no token for; against GoTrue v2.197.0 the admin
 * form 404s outright. It failed on every run and was reported as a warning,
 * so the rollover looked complete while the step had never happened.
 *
 * Checked against local GoTrue to find out what the ban alone is worth,
 * because that decides whether anything needs to replace it:
 *
 *   refresh_token grant, after the ban -> 400 user_banned
 *   GET /user with a token issued before the ban -> 403
 *
 * So the ban IS the revocation. The rows left in `auth.sessions` and
 * `auth.refresh_tokens` grant nothing — GoTrue refuses to mint from them
 * and refuses the tokens already minted. This GoTrue exposes no admin route
 * to delete another user's sessions (`DELETE /admin/users/<id>/sessions` and
 * `POST /admin/users/<id>/logout` are both 404), and deleting the rows by
 * hand would mean this tooling writing into auth.*, which it deliberately
 * does not do. So the rows are left, and the one thing that is NOT covered
 * is named below rather than papered over with a call that fails quietly.
 *
 * ── THE ONE HOUR THIS DOES NOT COVER ──────────────────────────────────────
 *
 * An access token issued before the rollover stays cryptographically valid
 * until it expires, and PostgREST checks the signature, not the ban. What
 * stops it reading anything is step 1: every RLS policy in this schema is
 * written against company_members, that row is gone, and policies are
 * evaluated per statement. GoTrue's own endpoints reject the token at once.
 *
 * ── WHAT WAS VERIFIED RATHER THAN ASSUMED ─────────────────────────────────
 *
 * Against the live project, before this was written:
 *
 *   users_email_partial_key              UNIQUE (email) WHERE NOT is_sso_user
 *   identities_provider_id_provider_unique  UNIQUE (provider_id, provider)
 *
 * The second looks like it would block re-registration and does not: on
 * this project all twenty identities use provider 'email' with provider_id
 * = the USER UUID, not the address. A fresh signup gets a new uuid, so
 * there is no collision. That is a property of this GoTrue version and not
 * a general fact, so `verifyAssumptions()` re-reads it from the database on
 * every run — including dry runs — and REFUSES to proceed if any identity
 * row has come to be keyed by address instead. Confirmed against local
 * GoTrue v2.197.0 as well: 0 of 3 identities keyed by email.
 *
 * ── WHAT THIS DELIBERATELY WILL NOT DO ────────────────────────────────────
 *
 *   * It never deletes an auth.users row. Three users are referenced by NO
 *     ACTION foreign keys from batch_records, regulatory_licences and
 *     regulatory_submissions; deletion is refused by the database and would
 *     destroy GMP authorship if it were not.
 *   * It refuses to roll over the last access_approvers row. The database
 *     trigger refuses it too; this check exists so the script says so
 *     before touching anything rather than failing halfway.
 *   * It will not run without --apply.
 *
 * Secrets come from the environment and are never printed:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

/** Permanent in practice: a hundred years. GoTrue takes a Go duration. */
const BAN_FOREVER = '876000h';

interface Target { id: string; email: string }

function env(name: string): string {
  const v = process.env[name] ?? '';
  if (!v) {
    console.error(`${name} is not set. It must come from the environment — `
      + 'never from a committed file and never from a VITE_ variable.');
    process.exit(2);
  }
  return v;
}

/**
 * Re-check the two uniqueness constraints before doing anything.
 *
 * If a GoTrue upgrade ever moves the address into `identities.provider_id`,
 * renaming `auth.users.email` stops being enough and this script would free
 * an address that is still taken — producing a signup failure nobody could
 * explain. Better to refuse to run.
 */
async function verifyAssumptions(db: SupabaseClient): Promise<void> {
  const { data, error } = await db.rpc('app_rollover_preflight');
  if (error) {
    console.error(
      'Could not run the preflight. Apply 20261213000000_account_rollover.sql '
      + `first.\n  ${error.message}`,
    );
    process.exit(2);
  }
  const row = (data as unknown as { identities_keyed_by_email: number }[] | null)?.[0];
  if (row && row.identities_keyed_by_email > 0) {
    console.error(
      `REFUSING TO RUN: ${row.identities_keyed_by_email} identity row(s) are keyed `
      + 'by email address rather than by user id.\n'
      + 'On this GoTrue version, renaming auth.users.email alone does NOT free the '
      + 'address — auth.identities still holds it under a unique index. The rollover '
      + 'needs the identity row updated in the same operation, which this script '
      + 'does not do blind. Stop and re-plan.',
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await verifyAssumptions(db);

  const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) { console.error(listErr.message); process.exit(1); }

  const targets: Target[] = (list?.users ?? [])
    .filter((u) => !!u.email)
    //  Already tombstoned: a re-run must be a no-op, not a second rollover.
    .filter((u) => !u.email!.endsWith('.invalid'))
    .filter((u) => (ONLY ? u.email!.toLowerCase() === ONLY.toLowerCase() : true))
    .map((u) => ({ id: u.id, email: u.email!.toLowerCase() }));

  const { data: approvers } = await db.from('access_approvers').select('user_id');
  const approverIds = new Set((approvers ?? []).map((a) => (a as { user_id: string }).user_id));
  const remaining = [...approverIds].filter((id) => !targets.some((t) => t.id === id));

  console.log(`\n${targets.length} account(s) in scope.`);
  if (approverIds.size > 0 && remaining.length === 0) {
    //  Said before anything is touched, rather than discovered halfway.
    console.error(
      '\nREFUSING TO RUN: this would roll over every access approver, leaving nobody '
      + 'able to approve an access request or administer the allowlist.\n'
      + 'Create the replacement owner account first, promote it with '
      + 'admin_bootstrap_approver(<email>), then re-run.',
    );
    process.exit(1);
  }

  for (const t of targets) {
    const tag = approverIds.has(t.id) ? ' [approver]' : '';
    if (!APPLY) { console.log(`  would roll over ${t.email}${tag}`); continue; }

    //  1. Access ends here, and this is the step that can be undone.
    const { error: revErr } = await db.rpc('app_rollover_revoke', {
      p_user_id: t.id, p_reason: 'fresh onboarding cycle',
    });
    if (revErr) { console.error(`  x ${t.email}: ${revErr.message}`); process.exit(1); }

    const tombstone = `rolled-over+${t.id.replace(/-/g, '').slice(0, 8)}@criateur.invalid`;

    //  2. Free the address and bar sign-in, in one call. GoTrue rewrites
    //  identity_data.email as part of this; see the header.
    const { error: upErr } = await db.auth.admin.updateUserById(t.id, {
      email: tombstone,
      email_confirm: true,
      ban_duration: BAN_FOREVER,
      user_metadata: { rolled_over_at: new Date().toISOString() },
    });
    if (upErr) {
      console.error(
        `  x ${t.email}: access was revoked but the address was NOT freed — `
        + `${upErr.message}\n    Re-run to retry; the revoke step is idempotent.`,
      );
      process.exit(1);
    }

    //  Nothing further. The ban above is what ends sign-in; see the header
    //  for why the sign-out call that used to be here was removed rather
    //  than fixed.
    console.log(`  + ${t.email} -> ${tombstone}${tag}`);
  }

  if (!APPLY) {
    console.log(
      '\nPlan only. Re-run with --apply to perform it.\n'
      + 'Note: an access token already issued stays valid until it expires '
      + '(one hour by default), but every row it can reach is gone the moment '
      + 'step 1 commits.',
    );
    return;
  }

  console.log(
    `\nDone. Approved addresses are free to register again.\n`
    + `Remaining approvers: ${remaining.length}.`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
