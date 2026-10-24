# Deployment rehearsal on PostgreSQL 17

The migrations run against a PostgreSQL 17.6 database with the real
Supabase CLI, from production's ledger position, in production's
order.

**This document records the rehearsal that found the duplicate-version
blocker, when the sequence was 30 migrations.** The sequence is now
**31** — `20261202000000` was added to close the gaps that finding
exposed — and it was re-rehearsed the same way with the same result:
[`migration-history-reconciliation.md`](migration-history-reconciliation.md)
§5. [`deployment-plan.md`](deployment-plan.md) is authoritative for
counts, order and ledger states.

**It found a blocker that would have stopped the deployment on first
contact with production, and it is not in the migrations.** §3.

Written 2026-10-23/24. Production was not touched: every statement
against `ovxfflilbqaxedzovgmz` was a `SELECT`.

---

## 1. The environment

| | |
|---|---|
| Server | **PostgreSQL 17.6** on `x86_64-pc-linux-gnu` |
| `server_version_num` | **170006** |
| Production | **PostgreSQL 17.6** on `aarch64-unknown-linux-gnu` |
| Migration tool | **Supabase CLI 2.122.0** — the tool `docs/DATABASE_DEPLOYMENT.md` names |
| Client for the suites | `psql` 16.15 against the 17.6 server |
| Isolation | a separate cluster on its own data directory; no connection to any Supabase project |

**Same minor version as production, different architecture.** The
architecture difference is not a SQL-compatibility factor for anything
these migrations do — no platform-specific types, no C extensions
beyond `pgcrypto` and `dblink`, no assumptions about word size or byte
order — but it is a difference and it is recorded rather than glossed.

Binaries came from the `@embedded-postgres/linux-x64@17.6.0-beta.15`
package, which ships an official 17.6 build with the full contrib set:
`pgcrypto`, `dblink`, `uuid-ossp`, `pg_trgm` and the rest are all
present, so no suite was skipped for a missing extension.

### One rig artefact, found and fixed — not a PG17 finding

The first run came back **2447 assertions instead of 2668**, with
`dispensing_test.sql` and `inprocess_control_test.sql` reporting
`could not establish connection`. Those two open a second connection
through `dblink` with only `dbname=` in the connection string, so
libpq falls back to its **compiled-in default socket directory**. This
build's default is `/tmp`; the cluster had been configured to listen
only on `/var/run/postgresql`.

Fixed by listening on both:

```
unix_socket_directories = '/var/run/postgresql,/tmp'
```

90 + 131 = **221**, exactly the shortfall. **This was my test rig, not
PostgreSQL 17**, and it is written down because a 221-assertion gap
that looks like a version incompatibility is worth being able to rule
out.

---

## 2. PostgreSQL 17 compatibility result

| | |
|---|---|
| Migration files present | **218** |
| Applied | **203** |
| Failed | **15** |
| Failed set | **exactly** `scripts/ci/expected-migration-failures.txt` |
| SQL assertions | **2668** at the time of this run; **2687** on the current baseline |
| Passed | all |
| **Failed** | **0** |
| Runner exit code | **0** |

**Identical to PostgreSQL 16 on every figure.**

The failed set is not merely the same size — it is the same set. The
runner compares actual failures against the pinned baseline **in both
directions** and prints a section for each discrepancy:
"MIGRATIONS THAT FAILED AND ARE NOT IN THE BASELINE" and
"MIGRATIONS IN THE BASELINE THAT NOW APPLY CLEANLY". Neither section
appears in the PG17 log, and the baseline holds 15 entries. Set
equality is therefore enforced, not eyeballed.

Those 15 fail for environmental reasons that have nothing to do with
the version: missing `pg_net` and `pg_cron` extensions, no
`storage.buckets` schema, and seed files that need a company row.
They fail the same way on 16.

**Conclusion: the migration set and the whole regression suite are
compatible with PostgreSQL 17.6.** This closes the second of the two
blockers in the previous review.

---

## 3. The rehearsal — and the blocker it found

### 3a. Starting position

Built to production's exact ledger position rather than from zero:

| | |
|---|---|
| Pre-boundary files applied | 169 of 184 |
| Pre-boundary failures | **15 — the baseline set** |
| Ledger rows seeded | 179 |
| Ledger latest | **`20261101000000`** — production's position |

(179 rather than 184 because five versions are shared by two files
each — which is the whole of §3b. Production's ledger holds 133 rows
because it never pushed some repo files at all.)

### 3b. BLOCKER: plain `supabase db push` refuses to run

```
$ supabase db push --db-url <rehearsal>
Connecting to remote database...
{"error":{"code":"DbPushMissingRemoteError",
  "message":"Found local migration files to be inserted before the last migration on remote database.",
  "suggestion":"Rerun the command with --include-all flag to apply these migrations:
    supabase/migrations/20260226200000_team_chat.sql
    supabase/migrations/20260227100000_fix_dash_rpcs.sql
    supabase/migrations/20260301000000_update_activity_feed_limit.sql
    supabase/migrations/20260305100000_policy_attestation_enhancements.sql
    supabase/migrations/20260306190000_retention_legal_hold.sql"}}
```

**Nothing was applied.** The CLI stops before the first migration.

The cause is five pairs of files sharing one version string:

| Version | Both files | In production's ledger |
|---|---|---|
| `20260226200000` | `content_calendar`, **`team_chat`** | `content_calendar` only |
| `20260227100000` | `fix_custom_roles_403`, **`fix_dash_rpcs`** | `fix_custom_roles_403` only |
| `20260301000000` | `calendar_deadline_reminders`, **`update_activity_feed_limit`** | `calendar_deadline_reminders` only |
| `20260305100000` | `create_legal_partner_tables`, **`policy_attestation_enhancements`** | `create_legal_partner_tables` only |
| `20260306190000` | `ai_asset_inventory`, **`retention_legal_hold`** | `ai_asset_inventory` only |

The ledger's primary key is `version`, so it can hold only one row per
version. The bolded file of each pair is therefore permanently
"outstanding and older than the newest applied migration", which is
the condition the CLI refuses.

**This reproduces on production.** Verified read-only: production's
ledger holds exactly the first of each pair (the right-hand column
above is a live reading).

### 3c. And the CLI's own suggested remedy fails too

```
$ supabase db push --include-all --dry-run     # 35 migrations, not 30
$ supabase db push --include-all
Applying migration 20260226200000_team_chat.sql...
{"error":{"code":"DbPushApplyError",
  "message":"ERROR: relation \"idx_chat_channels_company\" already exists (SQLSTATE 42P07)
             At statement: 1
             CREATE INDEX idx_chat_channels_company ON chat_channels(company_id)"}}
```

**Nothing was applied** — the ledger stayed at 179 rows, latest
`20261101000000`.

`--include-all` widens the set from 30 to **35** and then dies on the
first of the five, because the objects those migrations create already
exist on the target. Verified on production, read-only:
`idx_chat_channels_company` exists, and so do `chat_channels`,
`chat_messages`, `integration_connections`, `policy_versions`,
`retention_policies` and `ai_assets`. Their SQL has been run; only
their version rows are missing.

**So both documented paths fail, and the migrations cannot be deployed
with `supabase db push` at all without the remediation below.** This is the
finding that justified the rehearsal.

`supabase migration repair --status applied <version>` does **not**
fix it: the version it would insert is already in the ledger under the
sibling's name.

### 3d. The fix, demonstrated

Give the second file of each pair a version of its own, and mark those
versions applied without running their SQL — their objects already
exist.

Done in an isolated copy of `supabase/` (`--workdir`), so **no file in
this repository was renamed**:

| From | To |
|---|---|
| `20260226200000_team_chat.sql` | `20260226200002_team_chat.sql` |
| `20260227100000_fix_dash_rpcs.sql` | `20260227100001_fix_dash_rpcs.sql` |
| `20260301000000_update_activity_feed_limit.sql` | `20260301000001_update_activity_feed_limit.sql` |
| `20260305100000_policy_attestation_enhancements.sql` | `20260305100001_policy_attestation_enhancements.sql` |
| `20260306190000_retention_legal_hold.sql` | `20260306190001_retention_legal_hold.sql` |

Then five ledger rows marking them applied — the effect of
`supabase migration repair --status applied`, which is a **write to
the production ledger** and therefore needs approval.

Result: duplicate versions remaining **0**, and

```
$ supabase db push --dry-run
Would push these migrations:         ← exactly 30, 20261103000000 … 20261201000000
```

### 3e. The deployment, executed

```
$ supabase db push
Applying migration 20261103000000_access_sections_from_pm03.sql...
… all 30, in filename order …
Applying migration 20261201000000_batch_release_signature_postcondition.sql...
{"upToDate":false,"dryRun":false,"migrations":[… 30 …],"message":"Finished supabase db push."}

real    0m2.239s
```

| | |
|---|---|
| Migrations applied | **30 of 30** |
| Order | filename order, `20261103000000` → `20261201000000` |
| Duration | **2.2 s** |
| Ledger after | **214 rows**, latest **`20261201000000`** |
| `batch_release_signature_postcondition()` | **PASS** |
| Errors | none |

Post-deployment state verified in the rehearsal database:

| | |
|---|---|
| `operational_role_assignments` | present |
| `product_specifications` | present |
| `duty_conflicts` | present, **6 enforced** |
| `policy_decisions` | present, **6 open, 1 temporary** |
| `material_coa_verify_authority_error(uuid,uuid)` | present |
| `audit_logs` triggers | 5 |

---

## 4. The postcondition fails closed — demonstrated

`20261201000000` is last in the sequence and asserts that
`20261107000000`'s four-way `UPDATE` actually landed. Each failure mode
was induced in the rehearsal database, the ledger row for
`20261201000000` deleted, and `supabase db push` re-run.

| Induced fault | CLI result | Ledger row inserted? |
|---|---|---|
| `requires_signature = false` | `DbPushApplyError` — `BATCH_RELEASE_POSTCONDITION_FAILED: UNSIGNED: the qc_in_progress --(release)--> released transition exists but requires_signature is false …` | **no** |
| action renamed to `release_batch` | `… MISMATCHED: the transition into released is qc_in_progress --(release_batch)--> released, but 20261107000000 matches on qc_in_progress --(release)--> released.` | **no** |
| no transition reaches `released` | `… MISSING: no transition reaches the released state for a batch record.` | **no** |
| **fault repaired** | `Finished supabase db push.` | **yes** — 214 rows, postcondition `PASS` |

**The deployment halts, names the reason, and does not record itself
as applied.** That is fail-closed at the level that matters: not an
assertion inside a function nobody calls, but the migration run
itself stopping.

Also covered by 11 assertions in
`supabase/tests/batch_release_gate_test.sql` section J, which induce
the same four faults, confirm each is caught, and prove the schema was
restored afterwards — plus E2b/E2c, a real authenticated negative
test: a QA Manager releasing a batch with nothing else objecting is
refused with `LIFECYCLE_SIGNATURE_REQUIRED` and the batch does not
move.

---

## 5. What the rehearsal does not establish

- **It was not production.** Same version, same tool, same ordering,
  same starting ledger position — but a different database, with the
  test fixtures rather than production's 30 companies and 54 batches.
- **The starting schema was approximate.** The ledger position was
  exact; the schema was built locally, so the 15 environmentally
  failing migrations left their objects absent. None of the set depends
  on them — the suite passing proves that — but production's schema is
  not identical to the rehearsal's.
- **Architecture differs** (x86_64 versus aarch64).
- **The five ledger repairs are a production write** and have not been
  made.

---

## 6. What this adds to the deployment sequence

The order in `migration-verification.md` §7 gains a step, and it comes
before everything else technical:

> **Resolve the duplicate-version blocker (§3b–3d) before the
> deployment window.** Rename the five files in the repository, push
> that change, and run `supabase migration repair --status applied`
> for the five new versions against production. Only then will
> `supabase db push` see exactly the 31.

That is a repository change plus five ledger writes, and both need
approval. The alternative — applying the 31 with `psql` and inserting
the ledger rows by hand — avoids renaming anything but abandons the
documented tool and the ordering guarantees it enforces, so it is the
worse option and is recorded only for completeness.
