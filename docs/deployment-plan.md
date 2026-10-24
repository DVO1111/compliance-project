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

---

## 1. Preconditions — all must hold

| # | Precondition | How to confirm | Status today |
|---|---|---|---|
| P1 | **Recovery in place** | Option A dump taken, hashed, stored off-site **and test-restored**; or Option B plan upgraded with PITR enabled. [`recovery-readiness.md`](recovery-readiness.md) | ❌ **awaiting approval** |
| P2 | A **PostgreSQL 17** `pg_dump` on the operator's machine | `pg_dump --version` reports 17.x | ❌ unverified |
| P3 | **Five files renamed** and pushed to the branch | `ls supabase/migrations` shows no duplicate 14-digit prefixes | ❌ awaiting approval |
| P4 | **Five ledger repairs** applied | §3 | ❌ awaiting approval |
| P5 | Ledger at `20261101000000`, 133 rows | §2 | ✅ at 21:06 UTC 2026-10-23 |
| P6 | Full suite green on PG17.6 | `scripts/ci/run-sql-tests.sh` | ✅ 2686/0 |
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

**On abort:** do not re-run with different flags. Record the ledger
position, read the error, and decide. Recovery is §1 P1 and it is
hours, not minutes.

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
