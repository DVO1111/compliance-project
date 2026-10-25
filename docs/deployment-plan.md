# Deployment plan

The exact command sequence, what must be true before each step, what
the ledger should read before and after, what to verify, and when to
stop.

**Nothing in this document has been executed against production.**
Every command is written out so it can be reviewed before it is run,
not run and then explained.

| | |
|---|---|
| Target | `ovxfflilbqaxedzovgmz` (Criateur), `eu-west-1`, PostgreSQL **17.6** |
| Migrations | **31** — `20261103000000` … `20261202000000` |
| Rehearsed on | PostgreSQL 17.6, Supabase CLI 2.122.0, production's ledger position |
| Expected duration | push itself ~2 s; the window is dominated by backup and verification |

## 0. The package, and which document governs what

**This document is authoritative** for the migration count, the
filenames, the order, the ledger states and the postconditions. Where
any other document disagrees, this one is right.

| Document | Governs | Agreed figures |
|---|---|---|
| [`APPROVAL-PACKAGE.md`](APPROVAL-PACKAGE.md) | **the approval decision**: rename diffs, repair preconditions, ledger integrity, abort proof | 5 renames, 5 repairs, fingerprint `ebbd113e…` |
| **this plan** | sequence, commands, ledger, abort criteria | 31 migrations; ledger 133 → 138 → 169 |
| [`migration-history-reconciliation.md`](migration-history-reconciliation.md) | the five pairs, effect-by-effect equivalence, the renames and repairs | 5 renames, 5 repairs, 31st migration |
| [`deployment-manifest.md`](deployment-manifest.md) | per-migration purpose, dependencies, live applied status | 31 rows, all `OUTSTANDING` at 2026-10-23 21:06 UTC |
| [`live-verification-checklist.md`](live-verification-checklist.md) | the read-only before/after checks and their pass/fail | 31 versions; before-pass partially run, after-pass NOT RUN |
| [`recovery-readiness.md`](recovery-readiness.md) | Option A vs B, tools, operator evidence | 31 migrations, no down-migrations, **neither option ready** |
| [`historical-release-review.md`](historical-release-review.md) | the seven released rows, QA packages | read-only; **no engineering action** |
| [`migration-verification.md`](migration-verification.md) | dependency chain, irreversible steps, rollback limits | 31 migrations, 21 new on this branch |

Two things are deliberately **outside** this plan and must not be
folded into it:

- **The historical-release review** is a QA matter. No step here
  touches those seven rows.
- **The open quality decisions** — six, one of them temporary — are
  site-procedure questions. No step here resolves one.

---

## 1. Preconditions — all must hold

| # | Precondition | How to confirm | Status today |
|---|---|---|---|
| P1 | **Recovery in place** | Option A dump taken, hashed, stored off-site **and test-restored**; or Option B plan upgraded with PITR enabled. [`recovery-readiness.md`](recovery-readiness.md) | ❌ **awaiting approval** |
| P2 | A **PostgreSQL 17** `pg_dump` on the operator's machine | `pg_dump --version` reports 17.x | ❌ unverified |
| P3 | **Five files renamed** and pushed to the branch | `ls supabase/migrations` shows no duplicate 14-digit prefixes | ❌ awaiting approval |
| P4 | **Five ledger repairs** applied | §3 | ❌ awaiting approval |
| P5 | Ledger at `20261101000000`, 133 rows | §2 | ✅ at 21:06 UTC 2026-10-23 |
| P6 | Full suite green on PG17.6 | `scripts/ci/run-sql-tests.sh` | ✅ **2687 assertions, 0 failed** |
| P7 | Branch reviewed and approved for deployment | — | ❌ awaiting approval |
| P8 | A maintenance window; nobody mid-batch | §2 last query | — |

**P1 and P2 together are the hard gate.** Without them the deployment
is irreversible.

---

## 2. Step 0 — pre-flight, read-only

```bash
export PROD_URL='postgresql://…'     # from the Supabase dashboard
```

```sql
-- 0a. Identity and ledger position. ABORT if these have moved.
SELECT current_database(),
       (SELECT count(*) FROM supabase_migrations.schema_migrations)   AS applied,
       (SELECT max(version) FROM supabase_migrations.schema_migrations) AS latest,
       (SELECT count(*) FROM information_schema.tables
         WHERE table_schema='public')                                 AS public_tables,
       version()                                                      AS pg;

-- 0b. Nobody mid-release.
SELECT batch_number, status FROM public.batch_records
 WHERE status IN ('qc_in_progress','qc_pending');

-- 0c. The data the new constraints will cover must be clean.
SELECT (SELECT count(*) FROM (SELECT policy_id,version_id,user_id
          FROM public.policy_acknowledgements
         GROUP BY 1,2,3 HAVING count(*)>1) d)                         AS ack_dups,
       (SELECT count(*) FROM (SELECT legal_hold_id,entity_type,entity_id
          FROM public.legal_hold_items
         GROUP BY 1,2,3 HAVING count(*)>1) d)                         AS hold_dups;
```

**Expected:** `applied = 133`, `latest = 20261101000000`,
`public_tables = 258`, `pg` reports 17.6, `ack_dups = 0`,
`hold_dups = 0`.

**ABORT if** `applied ≠ 133` or `latest ≠ 20261101000000` — the
manifest and this plan were computed from that boundary. Recompute
first.
**ABORT if** either duplicate count is non-zero —
`20261202000000` will refuse, and the duplicates are a quality matter,
not a deployment one.

---

## 3. Step 1 — the ledger repairs (P4)

**Five writes to the production ledger. They need explicit approval
and they are the only production writes in this plan that are not a
migration.**

Each marks a version applied **without executing its SQL**, which is
sound only because [`migration-history-reconciliation.md`](migration-history-reconciliation.md)
§2 proved each file's effects are already present, superseded, or
supplied by `20261202000000` later in the same deployment.

```bash
supabase migration repair --db-url "$PROD_URL" --status applied 20260226200002
supabase migration repair --db-url "$PROD_URL" --status applied 20260227100001
supabase migration repair --db-url "$PROD_URL" --status applied 20260301000001
supabase migration repair --db-url "$PROD_URL" --status applied 20260305100001
supabase migration repair --db-url "$PROD_URL" --status applied 20260306190001
```

### 3a. Why all five renames remain necessary

The forward migration `20261202000000` does **not** reduce the rename
count. The renames exist to break a **version collision**, and
`20261202000000` changes no file's version string. Each of the five
File Bs is stranded for the same reason after it as before.

**All five renames stand.**

### 3b. Why all five repairs remain necessary

Without a ledger row for the new version, `db push` would not skip the
renamed file — it would **execute** it. For every one of the five that
is wrong, and for three of them it would fail outright:

| File | What executing it would do |
|---|---|
| `20260226200002_team_chat` | **FAIL** — `CREATE INDEX idx_chat_channels_company` has no `IF NOT EXISTS` and the index exists. Also strips `SET search_path` from `ensure_default_chat_channels` |
| `20260227100001_fix_dash_rpcs` | **Regress** `get_decisions_summary` to a body superseded by `20260305200000`, and strip `SET search_path` from all four functions |
| `20260301000001_update_activity_feed_limit` | **Strip** `SET search_path` from `get_company_activity_feed` |
| `20260305100001_policy_attestation_enhancements` | **FAIL** — two `CREATE POLICY` statements reference `policy_acknowledgements.company_id`, which does not exist |
| `20260306190001_retention_legal_hold` | **FAIL** — its four `CREATE INDEX` statements have no `IF NOT EXISTS` and `20261202000000` has just created them. Its six `CREATE POLICY` names differ from the live ones, so if it did run it would **add six more policies** — an unintended permission change |

**All five repairs stand.** The forward migration does not change
*how many* are needed; it changes *whether two of them are true*.

### 3c. What `20261202000000` changes about the repairs

| File | Repair justified by | Before `20261202000000` | After |
|---|---|---|---|
| `20260226200002` | effects already present | ✅ true | ✅ true |
| `20260227100001` | effects superseded | ✅ true | ✅ true |
| `20260301000001` | effects already present | ✅ true | ✅ true |
| `20260305100001` | effects completed by `20261202000000` | ❌ **false** — the uniqueness constraint was absent | ✅ true |
| `20260306190001` | effects completed by `20261202000000` | ❌ **false** — all four indexes absent | ✅ true |

Three of the five repairs are honest on their own. **Two are honest
only because `20261202000000` runs in the same deployment**, and
`public.migration_reconciliations` records exactly that, per file,
with its evidence — so the ledger's claim is never left unexplained.

### 3d. The ordering window, and how it is closed

The repairs must precede the push, or `db push` sees 36 outstanding
instead of 31. So between step 1 and step 2 completing, the ledger
asserts `20260305100001` and `20260306190001` applied while their
effects are still absent.

**That window is minutes, inside one maintenance operation, and it
must not be left open.** If step 2 fails for any reason, revert the
five repairs before doing anything else:

```bash
supabase migration repair --db-url "$PROD_URL" --status reverted 20260226200002
supabase migration repair --db-url "$PROD_URL" --status reverted 20260227100001
supabase migration repair --db-url "$PROD_URL" --status reverted 20260301000001
supabase migration repair --db-url "$PROD_URL" --status reverted 20260305100001
supabase migration repair --db-url "$PROD_URL" --status reverted 20260306190001
```

**A restored row count does not prove a restored ledger.**
`migration repair` was tested against a faithful ledger model on
PostgreSQL 17.6 and two of its behaviours are destructive:

| Case | Effect |
|---|---|
| `--status applied` on a version that **already exists** | **overwrites** that row's `statements` with whatever the current file holds |
| `--status reverted` on a version that **already exists** | **deletes the row**, evidence and all |
| `--status applied` on a version with **no file** | fails closed, writes nothing |

Every one of the five *original* versions has a file and holds real
`statements` evidence (20, 2, 5, 12 and 20 statements), so a single
transposed digit — `…00` for `…02` — is destructive and does **not**
fail closed.

So the abort is verified by fingerprint, not by counting:

```sql
SELECT count(*) AS rows,
       md5(string_agg(version||'|'||coalesce(name,'')||'|'||
           coalesce(array_length(statements,1)::text,'0'), E'\n' ORDER BY version)) AS fingerprint
  FROM supabase_migrations.schema_migrations;
```

**Must return `133` and `ebbd113e5966eaa1e934bba790e9860a`** — the
pre-deployment ledger exactly. A matching count with a different
fingerprint is a **failed abort**.

And none of this is attempted without the full ledger capture taken
first, which is the only recovery for a destroyed row short of PITR.
The capture command, the per-command preconditions and the integrity
check are in [`APPROVAL-PACKAGE.md`](APPROVAL-PACKAGE.md) §§2–3, which
is the operative document for this step.

Then confirm, read-only:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260226200002','20260227100001','20260301000001',
                   '20260305100001','20260306190001')
 ORDER BY version;
```

**Expected ledger:** 133 → **138 rows**. Latest still
`20261101000000` (all five sort below it).

**ABORT if** fewer than five rows appear, or if any repair errors.

---

## 4. Step 2 — the migration push

```bash
# Confirm the plan before executing it. Expect exactly 31.
supabase db push --db-url "$PROD_URL" --dry-run

# Then, with no --include-all:
supabase db push --db-url "$PROD_URL"
```

**Expected:** 31 migrations, `20261103000000` … `20261202000000`, in
filename order. **Ledger 138 → 169 rows, latest `20261202000000`.**

| ABORT if | Meaning |
|---|---|
| `DbPushMissingRemoteError` | P3/P4 incomplete — a duplicate version remains. Do **not** reach for `--include-all`: it widens the set to 35 and fails |
| the CLI suggests `--include-all` | same. `--include-all` is **never** correct here |
| `BATCH_RELEASE_POSTCONDITION_FAILED` | `20261107000000`'s signature `UPDATE` did not land. Stop; the deployment has halted itself and recorded nothing for that file |
| `RECONCILE_FAILED` | `20261202000000` could not supply a missing effect. Stop |
| `POLICY_ACK_DUPLICATES_EXIST` / `LEGAL_HOLD_ITEM_DUPLICATES_EXIST` | data violates a constraint M4/M5 intended. Stop; this is step 0c's check firing late |
| any other `DbPushApplyError` | stop at the named file. Earlier files are committed; the boundary is a file, not a half-built table |

**On abort:** do not re-run with different flags.

1. **Revert the five repairs** — §3d. This is not optional: leaving
   them in place leaves the ledger claiming two migrations applied
   whose effects are absent.
2. Record the ledger position and the exact error.
3. Decide. Recovery is §1 P1 and it is hours, not minutes.

A partial push leaves a **clean boundary at a file**: migrations
before the failure are applied and committed, the failing one is not
recorded. Note which file, because resuming means pushing from that
file onward once the cause is fixed — and the five repairs must be
re-applied first if they were reverted.

---

## 5. Step 3 — postconditions

All read-only. Full criteria in
[`live-verification-checklist.md`](live-verification-checklist.md);
this is the deployment-gating subset.

```sql
-- 3a. THE TWO SELF-ASSERTING CONTROLS
SELECT coalesce(public.batch_release_signature_postcondition(),'PASS') AS release_gate;
SELECT count(*) AS reconciled,
       count(*) FILTER (WHERE verdict='effects_completed_by_this_migration') AS completed
  FROM public.migration_reconciliations;

-- 3b. THE BATCH-RELEASE SIGNATURE REQUIREMENT, directly
SELECT fs.state_key AS from_state, ts.state_key AS to_state,
       t.action_key, t.requires_signature
  FROM public.lifecycle_transitions t
  JOIN public.lifecycle_definitions d ON d.id=t.definition_id
  JOIN public.lifecycle_states fs ON fs.id=t.from_state_id
  JOIN public.lifecycle_states ts ON ts.id=t.to_state_id
 WHERE d.entity_type='batch_record' AND ts.state_key='released';

-- 3c. AUDIT PROTECTIONS
SELECT t.tgname, CASE t.tgenabled WHEN 'D' THEN 'DISABLED' ELSE 'enabled' END
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE c.relname='audit_logs' AND NOT t.tgisinternal ORDER BY 1;
SELECT count(*) AS entries,
       count(*) FILTER (WHERE integrity_hash IS NULL) AS unhashed,
       count(*) FILTER (WHERE action='CHAIN_REANCHOR') AS reanchor
  FROM public.audit_logs;

-- 3d. THE CoA AUTHORISATION GUARD
SELECT t.tgname, CASE t.tgenabled WHEN 'D' THEN 'DISABLED' ELSE 'enabled' END
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE c.relname='material_certificates_of_analysis' AND NOT t.tgisinternal
   AND t.tgname='trg_material_coa_verification_authority';
SELECT has_function_privilege('anon','public.material_coa_verify(uuid)','EXECUTE') AS anon_may;

-- 3e. THE RECONCILED EFFECTS
SELECT (SELECT count(*) FROM pg_constraint
         WHERE conname='policy_acknowledgements_version_user_unique')      AS ack_unique,
       (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
         AND indexname='idx_legal_hold_items_unique'
         AND indexdef ILIKE '%UNIQUE%')                                    AS hold_unique,
       (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
         AND indexname IN ('idx_legal_hold_items_lookup',
                           'idx_retention_policies_company',
                           'idx_legal_holds_company'))                     AS hold_idx;

-- 3f. THE RULE TABLES ARE STILL CLOSED
SELECT count(*) AS writable_rule_tables
  FROM information_schema.role_table_grants
 WHERE table_schema='public'
   AND table_name IN ('duty_conflicts','gmp_critical_roles','duty_definitions',
                      'signed_quality_actions','lifecycle_entity_sections',
                      'policy_decisions','migration_reconciliations')
   AND grantee IN ('anon','authenticated')
   AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');

-- 3g. THE POLICY REGISTER
SELECT key, state, enforced, temporary FROM public.policy_decisions_outstanding();
```

| Check | PASS | FAIL |
|---|---|---|
| 3a release gate | `PASS` | anything else — **blocker** |
| 3a register | 5 rows, 2 completed | otherwise — blocker |
| 3b | **one** row: `qc_in_progress → released`, `release`, `requires_signature = true` | `false`, missing, or >1 row — **blocker** |
| 3c triggers | 4 present, all enabled | any absent or `DISABLED` — **blocker** |
| 3c counts | 57 unhashed, **1** `CHAIN_REANCHOR` | fewer unhashed or no re-anchor means **history was tidied** — blocker |
| 3d trigger | present, enabled | absent/disabled — **blocker** |
| 3d `anon_may` | `false` | `true` — **blocker** |
| 3e | `1, 1, 3` | anything less — blocker |
| 3f | **0** | non-zero — blocker |
| 3g | 6 rows, 1 `temporary` | otherwise — explain |

---

## 6. Step 4 — the CoA guard, negative and positive

Production is **not** protected by this correction until both pass.
Full queries in [`live-verification-checklist.md`](live-verification-checklist.md)
§10a–10c.

- **Negative:** a member holding no quality role gets
  `COA_VERIFY_FORBIDDEN` from
  `material_coa_verify_authority_error()`. **FAIL if null.**
- **Positive:** every member with Act on `qc_testing` or
  `qa_disposition` is permitted — the query returns zero rows.
- **Unchanged:** the `coa_verification`/`disposition` duty pair is
  still `enforced`, `approved_by_quality`.

Immediately after deployment the positive test passes trivially —
nobody holds a role yet. **Re-run both after step 5.**

---

## 7. Step 5 — operational roles (signed)

Until this happens every PM-03 guard abstains and the enforcement
layer is installed but inert.

- Appoint at least one **QA Manager** per company that will release
  anything, through `operational_role_assign` with a signature.
- **No self-assignment.** `operational_role_bootstrap` is for a
  one-person workspace, is self-declared, is permanently marked, and
  is reported.
- Then: `operational_role_unsigned_grants()` must be **empty**, or
  every row explained in writing.
- Watch for one person holding two roles that collide on a duty pair —
  allowed, but then somebody else must be available for the second
  step.

---

## 8. Step 6 — approved specifications

Until this happens no batch is releasable, and that is the control
working.

- A **QA Manager** approves a product specification per product with
  open batches, signed.
- `effective_date` must reach back to the earliest open batch's
  manufacturing date — Decision B stamps the version effective at
  manufacture, so a specification that post-dates a batch does not
  govern it.
- Then `batch_release_block_reason(id)` should return NULL for
  batches intended for release.

**Do not** switch a gate off to make a batch releasable.

---

## 8b. Known defects carried into production

These deploy **as they are**. None is fixed by this package and none
is pretended away.

### The M4 schema defect

`20260305100000_policy_attestation_enhancements.sql` declares three
RLS policies on `policy_acknowledgements`, two of which reference a
**`company_id` column that does not exist** on that table — not on
production, not locally. Its own comment admits the assumption
(*"Assuming policy_acknowledgements already has company_id based on
previous sprint context"*). It was wrong.

Consequences, stated plainly:

| | |
|---|---|
| **Its three policies were never installed.** The live table carries two, `users_read_own_acks` and `users_insert_own_acks`, created elsewhere | The register says so; nothing in this package claims otherwise |
| The file **cannot be executed** against production in its current form | Which is why the repair in §3 is the only route, not a convenience |
| The third intended policy — compliance staff reading other people's attestations — **does not exist and is not created here** | It would need a `company_id` column plus a backfill, and it grants a read over other people's records. That is a decision, not a repair |
| `requires_ack` defaults to `false`, where the file intended `true` | Left as production has it. Flipping it would make every future policy version require acknowledgement |
| `published_by` references `profiles(id) ON DELETE SET NULL`, where the file said `auth.users(id)` | Left as production has it |
| `due_days` is `NOT NULL` where the file allowed null | Left as production has it; live is stricter |

**What `20261202000000` does supply** is the one missing *integrity*
effect: `UNIQUE (policy_id, version_id, user_id)`, which stops the
same person attesting to the same policy version twice. Constraints
and indexes only — no policy, no default, no foreign key.

### Also carried forward

- **Five rule tables have `ENABLE` without `FORCE` row-level
  security** (`duty_conflicts`, `duty_definitions`,
  `gmp_critical_roles`, `signed_quality_actions`,
  `lifecycle_entity_sections`). `policy_decisions` and
  `migration_reconciliations` set both. Changing RLS on tables the
  guards already read is a behaviour change, not a reconciliation.
- **`anon` holds `SELECT` on every rule table**, from the project's
  default privileges. RLS is what protects the rows — every read
  policy is `TO authenticated`, so `anon` sees none. Unchanged, and
  asserted so a widened policy would fail a test.
- **M5's policy predicates were not compared clause by clause.** Six
  policies, two per table, names differing from the file's, intent
  apparently equivalent. Recorded as unverified.
- **Four files in `supabase/migrations/` are silently skipped** by the
  CLI for having no version prefix, and have never been applied
  anywhere.

---

## 9. Expected ledger, end to end

| Point | Rows | Latest |
|---|---|---|
| Now | **133** | `20261101000000` |
| After step 1 (repairs) | **138** | `20261101000000` |
| After step 2 (push) | **169** | `20261202000000` |

169 = 133 + 5 + 31. If the count after step 2 is not 169, something
was applied or skipped outside this plan.

---

## 10. Abort criteria, consolidated

Stop immediately, change nothing further, and report, on any of:

1. Pre-flight ledger ≠ 133 / `20261101000000`.
2. P1 (recovery) or P2 (PG17 `pg_dump`) not satisfied.
3. Any `migration repair` fails or fewer than five rows appear.
4. `db push` reports `DbPushMissingRemoteError`, or suggests
   `--include-all`.
5. `BATCH_RELEASE_POSTCONDITION_FAILED` or `RECONCILE_FAILED`.
6. Duplicate-data exceptions from `20261202000000`.
7. Any postcondition in §5 marked blocker.
8. Audit history reads fewer than 57 unhashed entries, or no
   `CHAIN_REANCHOR` row.
9. Anything that would need a gate switched off to proceed.

**Never** on abort: re-run with `--include-all`; create a signature or
QC result retrospectively; edit a historical migration already
applied; delete rows to make a constraint pass.

---

## 11. Approvals required before step 0

| | |
|---|---|
| ☐ | **Recovery**: Option A (verified dump) or Option B (Pro + PITR) — [`recovery-readiness.md`](recovery-readiness.md) §6 |
| ☐ | **Rename the five migration files** in the repository (content unchanged) |
| ☐ | **Five `migration repair` ledger writes** against production — §3 |
| ☐ | **Apply the 31 migrations** — §4 |
| ☐ | Branch reviewed; merge decision separate and still not requested |

Three further decisions are recorded and **do not block**:
`requires_ack` default, whether compliance may read others'
attestations, and whether M5's policy predicates need clause-level
comparison — [`migration-history-reconciliation.md`](migration-history-reconciliation.md)
§6.
