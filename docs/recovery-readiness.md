# Recovery readiness

The two options for being able to undo a deployment that has no
down-migrations, what each actually recovers, and what was tested.

**Decision status: AWAITING APPROVAL.** Nothing here has been
purchased, enabled or taken. The drill below validates a *procedure*;
it does not make this project recoverable.

Written 2026-10-23/24.

---

## 1. Why this document exists

No migration in this repository has a down-migration, and the
deployment is 30 migrations. The only way back is a snapshot taken
beforehand.

Confirmed from the Supabase Management API, 2026-10-23:

| | |
|---|---|
| Organization | `lgcbbmkiywvcpuffkszy` ("Compliance") |
| Plan | **`free`** (`tier_free`) |
| Project | `ovxfflilbqaxedzovgmz`, `eu-west-1`, Postgres **17.6**, `ACTIVE_HEALTHY` |

And from Supabase's current documentation:

> "We automatically back up all **Pro, Team, and Enterprise Plan**
> projects on a daily basis."

> "Database backups are **not available for download for Free Plan
> projects**."

> "We recommend that **free tier plan projects regularly export their
> data using the Supabase CLI `db dump` command** and maintain
> off-site backups."

So at this moment: **no automated backup, no downloadable backup, no
PITR.**

---

## 2. The two options, compared

| | **A — off-site dump** | **B — Pro + PITR add-on** |
|---|---|---|
| **What it is** | a logical export (`pg_dump`) taken by hand before the deployment and stored off Supabase | physical daily backups plus continuous WAL archiving |
| **Recovery scope** | schema + data of the dumped database. **Not** the project: no auth users beyond the `auth` tables included in the dump, no storage objects, no edge functions, no project settings, no custom role passwords | the whole database cluster at a chosen instant |
| **Granularity / RPO** | **one instant — the moment of the dump.** Everything written after it is lost, with no way to recover it | **second-level.** Choose any point in the retention window |
| **Expected data-loss window** | the elapsed time between the dump and the failure. For a deployment that starts an hour after the dump: **up to an hour of writes, permanently** | **seconds** |
| **Retention** | whatever you keep. No automatic expiry, and no automatic creation either — if nobody takes one, there isn't one | Pro: 7 days of daily backups; PITR window per the add-on's configured retention |
| **RTO (time to recover)** | **hours.** Provision a database, replay the dump, re-point the application, re-check. Larger databases take longer and the restore is single-threaded unless parallelised | **minutes**, initiated from the dashboard |
| **Covers operator error after deployment?** | only back to the dump | yes, anywhere in the window |
| **Cost** | free; costs operator time and discipline | paid plan + per-project add-on |
| **Available today?** | **yes, but see §4 — it needs a Postgres 17 `pg_dump`** | no — requires upgrading the plan first |

### The honest summary

**Option A is a floor, not a safety net.** It converts "no recovery"
into "recovery to one chosen instant, taking hours, losing everything
after it". That is enough to justify starting a deployment, because
the deployment itself is the risk being covered and the dump would be
taken minutes before it.

**Option B is what a regulated system normally has.** Second-level
recovery covers not just the deployment but the operational mistakes
that follow it — a bad role revocation, a mistaken disposition, a
specification approved against the wrong version.

**Recommendation: B if the plan can be upgraded; A as the minimum if
it cannot.** Deploying with neither is the one option this review will
not sign off.

---

## 3. The restore drill — what was actually tested

**A procedure was tested. Production was not.** Read §4 before
treating this as recovery readiness.

Environment: isolated local PostgreSQL **16.15** cluster, database
`criateur_local` built from all 218 migration files with every test
fixture present — 279 tables, 462 functions, 555 RLS policies, real
signature and audit rows.

```
pg_dump -d criateur_local -Fc -f criateur.dump          # 1.2 s, 2.6 MB
createdb criateur_restored
pg_restore -d criateur_restored --no-owner --no-privileges criateur.dump   # 3.8 s
```

`pg_restore` wrote **zero** lines to stderr.

### Verification: 16 checks, source versus restored

Run with the same script against both databases
(`/tmp/verify_recovery.sql`, reproduced below).

| Check | Source | Restored | |
|---|---|---|---|
| Tables | 279 | 279 | ✅ |
| Functions | 462 | 462 | ✅ |
| Triggers | 168 | 168 | ✅ |
| RLS-enabled tables | 266 | 266 | ✅ |
| Policies | 555 | 555 | ✅ |
| Companies | 45 | 45 | ✅ |
| Batch records | 54 | 54 | ✅ |
| Audit entries | 104 | 104 | ✅ |
| Audit entries unhashed | 1 | 1 | ✅ |
| Electronic signatures | 116 | 116 | ✅ |
| Signature consumptions | 85 | 85 | ✅ |
| Operational role assignments | 26 | 26 | ✅ |
| Enforced duty pairs | 6 | 6 | ✅ |
| Open policy decisions | 6 | 6 | ✅ |
| Release-signature postcondition | PASS | PASS | ✅ |
| CoA authority function | present | present | ✅ |

**Byte-identical output from both databases.** The controls survive a
restore: RLS stays on, the triggers come back, signature consumptions
are preserved (so a consumed signature cannot be replayed after a
restore), and the postcondition still holds.

### The verification script

Keep this with the dump. A restore nobody verified is not a restore.

```sql
SELECT 'tables='        || count(*) FROM information_schema.tables WHERE table_schema='public';
SELECT 'functions='     || count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
SELECT 'triggers='      || count(*) FROM pg_trigger WHERE NOT tgisinternal;
SELECT 'rls_tables='    || count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity;
SELECT 'policies='      || count(*) FROM pg_policies WHERE schemaname='public';
SELECT 'companies='     || count(*) FROM public.companies;
SELECT 'batches='       || count(*) FROM public.batch_records;
SELECT 'audit_logs='    || count(*) FROM public.audit_logs;
SELECT 'audit_unhashed='|| count(*) FROM public.audit_logs WHERE integrity_hash IS NULL;
SELECT 'signatures='    || count(*) FROM public.electronic_signatures;
SELECT 'sig_consumed='  || count(*) FROM public.electronic_signature_consumptions;
SELECT 'role_assigns='  || count(*) FROM public.operational_role_assignments;
SELECT 'duty_enforced=' || count(*) FROM public.duty_conflicts WHERE enforced;
SELECT 'open_decisions='|| count(*) FROM public.policy_decisions_outstanding();
SELECT 'postcondition=' || coalesce(public.batch_release_signature_postcondition(),'PASS');
SELECT 'coa_authority=' || coalesce(to_regprocedure('public.material_coa_verify_authority_error(uuid,uuid)')::text,'ABSENT');
```

The last four lines only work **after** deployment; before it they
return `ABSENT` or error, which is itself the expected reading.

---

## 4. What the drill does **not** establish

Three gaps, stated plainly, because the brief says not to claim
recovery readiness from an untested dump — and this dump, while
tested, was not production's.

### 4a. It was not production's data

No dump of `ovxfflilbqaxedzovgmz` has been taken. **It cannot be taken
from this session**: the Supabase connector executes SQL, it does not
hand out a database password, and `pg_dump` needs a connection string.
Taking it requires the project's database credentials and is an
operator action.

So the procedure is proven; the artefact does not exist.

### 4b. It was PostgreSQL 16, and production is 17.6

And this is not a formality. Demonstrated:

```
$ pg_dump --version
pg_dump (PostgreSQL) 16.2

$ pg_dump -d rehearsal --schema-only       # against the 17.6 server
pg_dump: error: aborting because of server version mismatch
pg_dump: detail: server version: 17.6; pg_dump version: 16.2
```

**An operator whose machine has a PostgreSQL 16 client cannot back up
this project at all.** `pg_dump` refuses rather than producing a
partial file, which is the right behaviour, but it means a concrete
prerequisite:

> **Taking the Option A dump requires a PostgreSQL 17 `pg_dump`.**
> Install `postgresql-client-17`, or run `supabase db dump`, which uses
> a matching client in a container.

No PostgreSQL 17 client tooling was reachable from this environment —
the package repositories that carry it are not available through this
network — which is why the drill ran on 16. That is a limitation of
the test rig, not of the procedure.

### 4c. A logical dump is not the project

Restoring it gives back a database. It does not give back storage
objects, edge functions, API keys, project settings, or custom role
passwords (Supabase's documentation notes daily backups exclude those
passwords too). If any of those matter to a recovery, they need their
own record.

---

## 5. The procedure, if Option A is chosen

To be run by an operator with the project's database credentials,
**before** the deployment.

```bash
# 1. A Postgres 17 client. Verify first — §4b.
pg_dump --version      # must report 17.x

# 2. Take it. supabase db dump uses a matching client itself.
supabase db dump --db-url "$PROD_URL" -f pre-deploy-$(date +%Y%m%d-%H%M).sql
#   or, for a restorable custom-format archive:
pg_dump "$PROD_URL" -Fc -f pre-deploy-$(date +%Y%m%d-%H%M).dump

# 3. Record what it is.
sha256sum pre-deploy-*.dump | tee pre-deploy.sha256
ls -lh pre-deploy-*.dump

# 4. TEST-RESTORE IT. This step is the whole point.
createdb restore_test
pg_restore -d restore_test --no-owner --no-privileges pre-deploy-*.dump
psql -d restore_test -f verify_recovery.sql > restored.txt
#   compare against the same script run on production BEFORE deploying
diff production.txt restored.txt

# 5. Store it off Supabase, and record where.
```

Then, and only then, deploy.

**Step 4 is not optional.** An untested dump has an unknown chance of
being restorable, and the moment you find out is the moment you need
it. The counts in §3 are the shape of a passing comparison.

### Expected data-loss window, concretely

If the dump is taken at 09:00, the deployment starts at 09:30 and
fails at 09:45, restoring loses everything written between 09:00 and
09:45. For this project that window is small — 30 companies, low write
volume, and the deployment would be done out of hours — but it is
**not zero**, and under Option B it would be seconds.

---

## 6. What is being asked for

**One decision, and it is not a software decision:**

| | |
|---|---|
| ☐ **Option B** | Upgrade `lgcbbmkiywvcpuffkszy` to Pro and enable the PITR add-on. Then §5 is unnecessary and recovery is minutes with second-level granularity |
| ☐ **Option A** | Stay on free. An operator takes, verifies and stores a dump per §5 before deployment, accepting hours-long recovery to a single instant |
| ☐ **Neither** | Not recommended. The deployment would be irreversible |

Until one is chosen and, for Option A, **carried out and verified**,
`docs/live-verification-checklist.md` §12 reads **FAIL** and the
deployment does not start.
