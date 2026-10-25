# Migration verification

What the branch's migrations depend on, in what order they have to
run, what they would do to the live database, and which steps cannot
be taken back.

Written 2026-10-23. **Two different claims are kept apart throughout,
because conflating them is how a deployment goes wrong:**

| | |
|---|---|
| **Installed** | the migration ran to completion on a database built from the repository's own migration history. Verified here, repeatedly, by the test harness. |
| **Compatible** | the migration will run to completion on the live database as it actually stands. **Partly verified — see below.** |

### What changed on 2026-10-23, 21:06 UTC

The Supabase connector, which had been failing with
`ERR_PROXY_TUNNEL`, recovered. The live **preconditions** in §3 have
since been read directly from `ovxfflilbqaxedzovgmz` and are now
measurements rather than predictions; the readings and their timestamp
are in [`deployment-manifest.md`](deployment-manifest.md). Nothing was
written — every statement was a `SELECT`.

**That verifies the preconditions, not compatibility.** Three things
remain unverified and no amount of reading can settle them:

1. **The migrations have never been executed against this database.**
   Reading that a table exists is not the same as a `CREATE` landing
   on it.
2. **Production runs Postgres 17.6; the local harness runs Postgres
   16.** Every "installed" result in this repository is a PG16 result.
3. **Live data could still refuse a constraint** — §5 covers where,
   and concludes the risk is low for the three it adds.

Every remaining "compatible" claim below is still a prediction. The
pass/fail checks in
[`live-verification-checklist.md`](live-verification-checklist.md) are
how the rest gets confirmed, and the **after**-deployment pass has not
been run.

---

## 1. What is actually being deployed

**Not 18, not 28, not 30. Thirty-one.**

Both earlier figures in this document were wrong: the count rose as
work continued and this section was written before the last two files
existed. Corrected, and cross-checked against the live ledger in
[`deployment-manifest.md`](deployment-manifest.md):

| | Files | Range | On `main`? |
|---|---|---|---|
| Already on `main`, not yet live | **10** | `20261103000000` … `20261112000000` | yes |
| New on this branch | **21** | `20261113000000` … `20261202000000` | no |
| **Total to apply** | **31** | `20261103000000` … `20261202000000` | — |

The per-migration manifest, with each one's live applied status, is in
[`deployment-manifest.md`](deployment-manifest.md). That document
supersedes this section's counts if the two ever disagree again.

This is the single most important fact in this document. The branch's
migrations **cannot** be deployed on their own: §2 shows that most of
what they build on arrives in those ten.

Counted from `git diff --name-only origin/main...HEAD` for the 18, and
from the applied-migration position recorded in the live snapshot for
the boundary. If the live position has moved since that snapshot, this
table is wrong and must be recomputed — which is check 1 of the
operator checklist.

---

## 2. Dependencies: what the branch builds on

Each of these objects is created by one of the **ten already-on-`main`**
migrations, and every one of them is read or altered by the branch's
own migrations. None of them exists on the live database today.

| Object | Created by | Used by the branch for |
|---|---|---|
| `step_permissions` | `20261104000000` | `20261114000000` adds its `section` column; `20261121000000` derives `gmp_critical_roles` from it |
| `section_permissions` (PM-03) | `20261106000000` | the whole operational-role model: `duty_pair_is_derived`, `app_section_access`, every section guard |
| `app_section_access` | `20261106000000` | rewritten by `20261119000000`; read by `20261130000000` |
| `batch_release_block_reason` | `20261107000000` | `20261120000000` rewrites the release gate around it |
| `verify_audit_chain` | `20261108000000` | `20261115000000` redefines it for the legacy-entry convention |
| `access_restrictions` | `20261110000000` | PM-04 lowering, read through `app_section_access` |
| `batch_dispatches` | `20261111000000` | `20261120000000` (dispatch duty gate), `20261126000000` (backdating guard) |

**Within the branch**, the order is a chain, not a set. The
dependencies that matter:

```
20261113000000  product_specifications
      └── 20261117000000  adds approved_by_role, approval_signature_id
      └── 20261118000000  stamps batch_records.governing_specification_id

20261119000000  operational_role_assignments, app_work_roles
      └── 20261120000000  batch duty conflicts (needs app_section_access rewrite)
      └── 20261121000000  signatures on grants (ALTERs the table from 19)
      └── 20261122000000  renames batch_duty_conflicts -> duty_conflicts
            └── 20261123000000  RLS on duty_conflicts (by its NEW name)
            └── 20261125000000  duty_definitions, conservative defaults
                  └── 20261128000000  authority + approved_reference
                        └── 20261129000000  corrects the CoA pair's label
20261124000000  stranded work (needs the assignment register from 19)
20261126000000  attribution (prerequisite for 27: the guards read it)
      └── 20261127000000  signed verdicts
20261130000000  CoA verification authority (needs app_section_access from 19)
```

`20261122000000` → `20261123000000` is the one that would fail loudest
if reordered: the second names `public.duty_conflicts`, which does not
exist under that name until the first has run.

### Installation, verified

All 30 apply in filename order on a database built from the
repository's migration history. Verified by
`scripts/ci/run-sql-tests.sh`, which drops and rebuilds the database
from scratch on every run and refuses to run the suites if the result
does not match the baseline. Latest run: **201 of 216 migration files
applied, 15 failed, all 15 pre-existing baseline failures** dated
February–July 2026 (missing `pg_net`, `pg_cron`, `storage.buckets`,
and seed files that need a company) — none of them on this branch, all
listed in `scripts/ci/expected-migration-failures.txt` with reasons.

**That is "installed", not "compatible."**

---

## 3. Preconditions against the live schema

What has to be true of `ovxfflilbqaxedzovgmz` for the 31 to apply.
Every row was **predicted** here and has since been **measured** live —
see [`deployment-manifest.md`](deployment-manifest.md), which carries
the readings and the timestamp.
Each row says how it was established.

| Precondition | Status | How |
|---|---|---|
| Applied position is exactly `20261101000000` | **Snapshot only** | observed 2026-10-23, before the MCP dropped. Re-check first. |
| The 8 Criateur core tables exist | **Snapshot** | 8 of 8 present |
| `lifecycle_definitions` match the local set | **Snapshot** | reported as matching exactly |
| `company_members.role` is enum `company_role` | **Snapshot** | `owner, admin, legal, marketing, viewer` |
| No branch migration touches that enum | **Verified in the repo** | `ALTER TYPE`, `CREATE TYPE`: **zero occurrences** across all 18 |
| No branch migration drops a column or a table | **Verified in the repo** | `DROP COLUMN`, `DROP TABLE`: **zero occurrences** across all 18 |
| `pg_net` / `pg_cron` not required by the branch | **Verified in the repo** | the extension-dependent migrations are all pre-branch |

The enum result is worth stating plainly, because an enum change was
the blocker this work started from: **the branch does not alter
`company_role` at all.** `20261119000000` deliberately left it alone
and added a separate `operational_role_assignments` register instead,
so the two columns answer different questions. That removes the whole
class of enum-compatibility risk from this deployment.

### The known gap in this analysis

A snapshot tells us the tables are there. It does **not** tell us:

- whether any **live trigger, policy or function** was changed by hand
  outside the migration history, which is the usual reason a
  `CREATE OR REPLACE` lands differently than expected;
- whether **live data** violates a constraint the branch adds. This is
  the realistic failure mode, and §5 lists the three places it could
  happen.

Neither can be settled from here. Both are checks in the operator
checklist.

---

## 4. Irreversible steps

Four. **All four act on objects that this same deployment creates**,
which is why the exposure is far smaller than the list first suggests.

| Step | Migration | Target created by | Live exposure |
|---|---|---|---|
| `ALTER TABLE batch_duty_conflicts RENAME TO duty_conflicts` | `20261122000000` | `20261120000000`, same deployment | **none** — the table does not exist live |
| `DROP FUNCTION product_specification_approve(uuid, date)` | `20261117000000` | `20261113000000`, same deployment | **none** |
| `DROP FUNCTION operational_role_assign(uuid, uuid, text, text)` | `20261121000000` | `20261119000000`, same deployment | **none** |
| `DROP FUNCTION operational_role_revoke(uuid, text)` | `20261121000000` | `20261119000000`, same deployment | **none** |

Verified by locating the first `CREATE` of each object in the
migration history. The three dropped functions are arity changes: an
earlier migration in the set defines the function, a later one drops
that signature and defines a wider one. On a live database at
`20261101000000` none of the four targets exists, so **no object that
exists on the live database today is dropped or renamed by this
deployment.**

### Data writes, which are not reversible either

These write rows rather than change shape. All of them write to **rule
tables**, not to anybody's records:

| Migration | Writes |
|---|---|
| `20261115000000` | one row in `audit_hash_conventions` describing the legacy-entry convention |
| `20261119000000` | one row in `work_role_resolution` (the legacy bridge switch) |
| `20261121000000` | `gmp_critical_roles`, derived from `step_permissions` |
| `20261122000000`, `20261125000000`, `20261128000000`, `20261129000000` | `duty_conflicts` and `duty_definitions` — the separation-of-duties register |
| `20261124000000` | `lifecycle_entity_sections` |
| `20261127000000` | `signed_quality_actions` |

**No migration on this branch writes to a company's operational
records.** No batch, lot, specification, certificate, deviation or
audit entry is inserted, updated or deleted. The audit history —
including the documented `CHAIN_REANCHOR` event and the unhashed
legacy entries — is read and described, never rewritten:
`20261115000000` records the convention those entries fall under and
`20261116000000` restores the immutability triggers over them.

---

## 5. Where live data could still refuse the deployment

Three constraints are added over tables that already hold live rows.
A migration that adds a constraint fails if an existing row violates
it, and that is the most likely way this deployment stops halfway.

| Added by | Over | Fails if |
|---|---|---|
| `signature_id` + the signature trigger | `batch_qc_results` | **it cannot fail on existing rows** — the column is nullable and the trigger fires `BEFORE INSERT OR UPDATE`, so historic rows are untouched until somebody edits one. Then it refuses, by design. |
| `signature_id` | `material_test_results` | same shape; nullable, no backfill |
| `governing_specification_id` | `batch_records` | nullable, stamped forward only |

So the schema additions are safe over existing rows. **The behaviour
change is not**: after deployment, editing a historic
`batch_qc_results` row requires a signature it does not have. That is
the intended control, and it is the single most likely source of a
"this used to work" report in the first week. It is listed in the
operator checklist so it is a known consequence rather than a
surprise.

The 18 live batch records are the population to watch. Their current
state and whether any is mid-release is check 7 of the checklist.

---

## 6. Rollback, realistically

**There is no down-migration, for any of the 31.** The repository has
never had them and this branch did not add them. Saying so plainly
matters more than a plan that would not survive contact.

### The prerequisite is not met, and cannot be met on this plan

This was checked rather than assumed, and the answer is worse than
this section originally claimed.

| | |
|---|---|
| Organization | `lgcbbmkiywvcpuffkszy` ("Compliance") |
| Plan | **`free`** (`tier_free`) — read from the Supabase Management API, 2026-10-23 |
| Project | `ovxfflilbqaxedzovgmz`, region `eu-west-1`, Postgres 17.6, `ACTIVE_HEALTHY` |

From Supabase's own current documentation:

> "We automatically back up all **Pro, Team, and Enterprise Plan**
> projects on a daily basis. […] We recommend that **free tier plan
> projects regularly export their data using the Supabase CLI
> `db dump` command** and maintain off-site backups."

> "Database backups are **not available for download for Free Plan
> projects**."

And PITR is a **paid add-on configured per project** and billed on top
of a Pro subscription — not something a free-plan project can enable.

So, stated without hedging:

> **There is no automated backup, no downloadable backup, and no
> point-in-time recovery for this project as it stands. Combined with
> the absence of down-migrations, a 30-migration deployment would have
> no rollback path of any kind.**

This earlier read "Point-in-time restore — the only genuine rollback
… confirming it is available is a prerequisite". It is not available.
That correction is the most consequential finding of the
deployment-readiness review.

### What has to happen before deployment

One of these two, and it is a decision for the project owner:

| Option | What it gives | Cost |
|---|---|---|
| **A — take a manual dump first** | `supabase db dump --db-url … -f pre-deploy-YYYYMMDD.sql`, held off-site. A logical snapshot to rebuild from. Restoring means creating a database and replaying it: **hours, not minutes**, and anything written after the dump is lost | free; needs doing by hand, and verifying the dump restores |
| **B — upgrade to Pro and enable PITR** | daily backups, 7-day retention, and PITR to second-level granularity | a paid plan plus a per-project add-on |

**Option A is the minimum.** Deploying 31 migrations to a regulated
system with no recoverable snapshot is not a risk this review can
sign off, and it is not a software problem — it is a plan decision.

A dump is not equivalent to PITR and this document will not pretend it
is: it has no granularity, it is only as good as the moment it was
taken, and **a dump that has never been test-restored is a hope, not a
backup.**

### Then, in descending order of preference

1. **Restore from whichever snapshot exists** (Option A's dump, or
   PITR under Option B). Cost: everything written after the restore
   point is lost. Under Option A, also hours of downtime.

2. **Forward-fix.** Write a new migration that undoes what needs
   undoing. Workable for the rule tables — an `UPDATE` setting
   `enforced = false` turns a duty conflict off without dropping
   anything, and that is deliberately how the register was designed.
   Workable for the triggers: dropping
   `z_trg_batch_qc_results_require_signature` lifts the signature
   requirement. **Not** workable for the four irreversible steps in
   §4, because recreating a dropped function signature means
   reconstructing its body.

3. **Leave it and disable.** For most of this branch, the inert state
   *is* the safe state: `operational_role_assignments` deploys empty,
   so every section guard abstains and the enforcement layer does
   nothing until somebody is appointed. A deployment that lands and is
   then left alone changes very little about how the product behaves.
   That is a property of the design, and it is the most realistic
   mitigation available.

### What rollback cannot recover

- Signatures recorded after deployment are single-use by a partial
  unique index. A restore loses them; it does not free them.
- Role assignments granted after deployment carry signatures. Rolling
  back to before `20261121000000` orphans the signature rows.
- `duty_conflicts` rows written by the deployment are rule data, not
  user data, so re-applying is harmless. This is the one part that is
  genuinely idempotent.

### Partial application

The migrations run in one psql session per file, not one transaction
across all 31. If number *n* fails, numbers 1…*n*−1 are applied and
committed. Most of this branch's migrations are individually
transactional (each is a single file psql runs top to bottom, with
`DO` blocks that raise on their own assertions), so a failure leaves a
**clean boundary at a file**, not a half-built table.

Recovery from a partial application is: fix the failing migration,
re-run from that file onward. The `CREATE TABLE IF NOT EXISTS` /
`DROP ... IF EXISTS` / `ADD COLUMN IF NOT EXISTS` style used
throughout makes re-running an already-applied file largely harmless,
**except** for the four irreversible steps in §4 — `RENAME TO` is not
idempotent and will fail the second time, which is itself a reasonable
signal that the file already ran.

---

## 7. The order to deploy in

1. Confirm the live applied position is still `20261101000000` (it was
   at 21:06 UTC on 2026-10-23). If it has moved, recompute §1 and the
   manifest before going further.
2. **Resolve the backup question — this is the blocking step.** §6:
   there is no PITR and no downloadable backup on the free plan, so
   either take a verified `supabase db dump` and hold it off-site, or
   upgrade the plan and enable PITR. **A dump that has not been
   test-restored does not count.**
3. Take the pre-deployment snapshot
   (`scripts/ci/live-readiness-report.sql`, read-only) and record it
   with a date.
4. Apply `20261103000000` … `20261202000000` **in filename order**, in
   one pass, stopping at the first failure. `20261201000000` is last
   deliberately: it refuses to complete unless `20261107000000`'s
   signature `UPDATE` actually landed.
5. Re-run the snapshot and work the checklist's **after** pass,
   recording a verdict against every pass/fail criterion.
6. Appoint operational roles — **signed**, and not by self-assignment.
   Until this happens the enforcement layer is inert.
7. Approve product specifications. Until this happens no batch is
   releasable.

Step 2 is the one that is not currently satisfiable without a decision
from the project owner. Steps 6 and 7 are the ones that make the
deployment mean anything, and both need a person with authority, not a
migration.
