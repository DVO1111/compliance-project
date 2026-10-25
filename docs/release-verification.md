# Release verification

The four checks asked for before this branch is considered
release-ready, each answered with what is enforced, what is *not*, and
where the evidence is.

Nothing here establishes regulatory compliance or validation, and
nothing in the product claims it.

**Everything below was verified against a local PostgreSQL rebuilt from
the migrations.** No check in this document has been run against the
Criateur Supabase project. The section *What still needs the live
project* at the foot says which of them can only be settled there.

Last reviewed: 2026-10-23.

---

## 1. Audit-chain integrity: guarantees and limits

> **Correction, 2026-10-23.** This section originally described the
> controls below as holding. They hold *in this branch*. Read-only
> inspection of the Criateur project found that
> `trg_block_audit_update`, `trg_block_audit_delete` and
> `trg_block_audit_truncate` are **absent from production**, together
> with `fn_block_audit_mutation`, although migration
> `20260225000000_immutable_audit_trail` is recorded as applied. Only
> `trg_prevent_audit_log_deletion` is on the table there. Audit
> entries on production are therefore UPDATE-able today.
> `20261116000000_restore_audit_immutability.sql` recreates them.
> The full picture, including an entry that was back-dated by a
> script that ran against production, is in
> [`docs/audit-threat-model.md`](audit-threat-model.md).

### What holds

| Control | Mechanism |
|---|---|
| An entry cannot be changed | `trg_block_audit_update` on `audit_logs` |
| An entry cannot be removed | `trg_block_audit_delete`, `trg_prevent_audit_log_deletion` |
| The table cannot be truncated | `trg_block_audit_truncate` |
| Sequence, previous hash and integrity hash are assigned by the server | `trg_audit_logs_seal` (`20261108000000`), which **discards whatever the client sent** |
| Concurrent writers cannot fork the chain | `pg_advisory_xact_lock` per company inside the sealer |
| Contents are re-computed on verification | `verify_audit_chain` rebuilds each sealed row's hash from the row itself |
| An entry with no hash is a finding | it is counted and named, not filtered out of the query |

Evidence: `supabase/tests/audit_chain_seal_test.sql`, 37 assertions,
including a simulated tamper — the immutability trigger is switched
off, a row's contents are edited with its hashes left alone, and the
verifier names that row and says the contents disagree with the hash.

### Who can still alter records

This is the part that matters and it is not "nobody".

| Actor | Can they alter an audit record? |
|---|---|
| An application user (anon/authenticated key) | **No.** The triggers refuse update, delete and truncate, and the seal overwrites any hash they supply. |
| A `service_role` key holder | **No**, by the same triggers — they have no service exemption. |
| **A database superuser, or the table's owner** | **Yes.** They can `ALTER TABLE … DISABLE TRIGGER`, change rows, and re-enable it. The suite does exactly this to simulate a tamper, which is proof the route exists. |
| **Anyone who can restore a dump** | **Yes.** A doctored backup restored over the table carries whatever it carries. |

So the chain is **tamper-evident against the application**, and
**tamper-evident but not tamper-proof against the database owner** —
with one qualification in their favour: a superuser who edits a row's
contents and leaves the hashes alone is *detected*, because the
contents are recomputed. To go undetected they must recompute every
subsequent hash in that company's chain, which `audit_log_payload`
makes mechanically possible for anyone with the function definition.

**There is no detection of a wholesale chain rewrite.** Nothing is
signed by a key the database does not hold, and nothing is anchored
outside it. If that matters, the remedy is an external anchor —
periodically exporting the latest `integrity_hash` per company to
somewhere the database owner does not control — and that is not built.

### Pre-sealing entries

Entries written before `20261108000000` carry a hash the **browser**
computed from a payload it assembled. `20261115000000` marks them
`legacy-client-v0` and records, once, in `audit_hash_conventions`, why
their contents cannot be verified.

Their linkage is still checked. Their contents are not, and **no hash
has been computed for them after the fact** — doing so would turn an
unverifiable entry into one that looks verified. `verify_audit_chain`
returns them as `unsealed` with the reason, and the screen prints it.

A row with **no hash at all** is deliberately *not* marked legacy: it
is reported as `unhashed`, which is a finding.

---

## 2. Batch release: what is enforced

A release is `lifecycle_transition('batch_record', …, 'release', …)`.
Every one of the following must hold, and each is enforced in the
database rather than by the screen.

| Requirement | Enforced by | Refusal |
|---|---|---|
| The product is registered and eligible | D05 product gate | `BATCH_PRODUCT_NOT_ELIGIBLE` |
| Its licence has not lapsed | `trg_batch_records_licence_gate` | `LICENCE_EXPIRED` |
| The batch reached `qc_in_progress` by the lifecycle path | `lifecycle_transitions` | the action is not available |
| **An approved specification was in force when it was made** | `batch_release_block_reason` → `batch_governing_specification` | `BATCH_RELEASE_BLOCKED` |
| **Every required test in that specification has a standing result** | same, named test by test | `BATCH_RELEASE_BLOCKED` |
| **No standing result failed** | same | `BATCH_RELEASE_BLOCKED` |
| **No pass contradicts the specification's own limits** | same, via `product_test_meets_criterion` | `BATCH_RELEASE_BLOCKED` |
| The actor holds the release step | `fn_batch_release_role` → `app_assert_step` | `STEP_FORBIDDEN` |
| No individual restriction covers batch release | `app_assert_step` (`20261114000000`) | `STEP_RESTRICTED` |
| **An electronic signature, bound to this signer, record and action** | `lifecycle_transitions.requires_signature` → `lifecycle_consume_signature` | `LIFECYCLE_SIGNATURE_REQUIRED` / `_MISMATCH` / `_SPENT` / `_STALE` |
| **The releaser did not record the batch's QC results** | `fn_batch_records_release_gate` | `BATCH_RELEASE_SELF_TESTED` |

Separation of duties holds in two independent ways: PM-03 gives
`QC testing` **Act** to the QC Analyst alone and `Batch release`
**Act** to the QA Manager alone, so **nobody holds both columns**; and
the gate additionally refuses a releaser who recorded any of that
batch's results, which covers the case of someone recording results
through a route their role did permit.

Evidence: `batch_release_gate_test.sql` (34), `product_specification_test.sql`
(36), `write_path_audit_test.sql` (22).

### Limits worth stating

- **A verdict on a non-numeric result is not checked against its
  limit.** `product_test_meets_criterion` reads the first number out of
  a result; given `"white powder"` against a 98–102 range it returns
  NULL — *not judged* — and the analyst's recorded verdict stands
  alone. Someone can still pass a batch by typing words where a number
  belongs. Asserted as a limitation in section G of the specification
  suite rather than left to be discovered.
- **`complies` and `absent` limits are never machine-checked.** They are
  judgements, and the recorded verdict is the only evidence.
- **Which version governs** — the one in force on the manufacturing
  date — is now a **proposed decision**, implemented in
  `20261118000000`: the governing specification is stamped onto the
  batch at release and locked, and any later reassessment must go
  through `batch_specification_review` with a reason and a signature,
  which records a controlled review rather than silently swapping the
  criteria. It remains **pending final quality/regulatory
  confirmation** — whether "effective at manufacture" is the right
  rule is a regulatory question, not one this branch settles. The
  lookup reads `status IN ('effective', 'superseded')` deliberately,
  so approving version 2.0 does not orphan a batch made under 1.0.
- **A specification is approved by the QA Manager and nobody else.**
  `20261117000000` refuses the approval with `PRODUCT_SPEC_FORBIDDEN`
  for any other role, **including `owner` and `admin`**, and requires
  an electronic signature over a hash of the version and its ordered
  tests, so a signature cannot be reused after the criteria change.
  Also **pending final quality/regulatory confirmation**.
- **Existing released batches carry no stamp.** The column was added
  NULL and nothing back-fills it; for those batches the effective-date
  lookup still answers. Back-stamping would assert a review that never
  took place.

---

## 3. PM-04 restrictions across every server-side path

A restriction is applied by `app_section_access`, so **every guard that
reaches the grid honours it without knowing restrictions exist.**

`20261114000000` closed the gap that mattered. Five guards —
`fn_batch_release_role`, `fn_material_lots_disposition_role`,
`fn_deviation_close_role`, `fn_capa_close_role`,
`fn_supplier_approve_role` — go through `app_assert_step`, which read
`step_permissions` and `app_work_role` and had never heard of a
restriction. Those five are PM-03's named steps: a compliance admin who
restricted a QA Manager's `QA disposition` **would have watched them
release material anyway**.

| Path | Reaches restrictions |
|---|---|
| Direct table writes (batch records, stages, readings, dispensings, CoA, dispatch, QC results) | yes, via `app_assert_section_act` |
| RPCs that transition the lifecycle (`material_lot_release`, `batch_stage_*`, `material_dispense`, supplier/deviation/CAPA closure) | yes — the guards are on `entity_current_state`, not inside the RPCs, so the route in does not matter |
| PM-03's five named steps | yes, since `20261114000000` |
| Row-level policies on `certificate_of_analysis`, `batch_records`, `raw_material_receipts`, `batch_qc_results` | yes — they call `app_section_access`, so a restricted caller is filtered |

**Immediate**: there is no cache. `app_active_restriction` is read on
every assertion, so a restriction applies to the next statement.

**An explicit restriction bites even where the grid abstains.**
`app_assert_step` abstains for a role PM-03 does not tabulate — the
design declining to rule — but a restriction is a named person, a named
section and a reason, so it applies regardless. Asserted (I9, I10).

Evidence: `access_restrictions_test.sql`, 59 assertions.

### Limit

A refusal on `certificate_of_analysis`, `batch_records`,
`raw_material_receipts` and `batch_qc_results` is **silent**: row-level
security filters the caller's row out before the trigger runs, so the
statement succeeds having changed nothing. Every other guarded table
raises. A screen that reads "no error" as "it worked" will report
something that did not happen. Asserted, not assumed (G1 in the access
suite).

---

## 4. Migration safety

### Deployment order

The migrations added by this branch are strictly ordered and several
assert their own prerequisites rather than trusting the filename sort:

| Order | Migration | Depends on |
|---|---|---|
| 1 | `20261106000000` section grid | `app_work_role` (`20261104000000`) |
| 2 | `20261107000000` release gate + signature | the grid |
| 3 | `20261108000000` audit sealing | `pgcrypto` reachable as `extensions.digest` |
| 4 | `20261109000000` CoA column | the grid |
| 5 | `20261110000000` restrictions | the grid; replaces `app_section_access` |
| 6 | `20261111000000` dispatch | the grid; `batch_record.released` state |
| 7 | `20261112000000` write policies + QC corrections | the grid |
| 8 | `20261113000000` specifications | **asserts** `batch_qc_results.corrected_from_id` exists, i.e. 7 applied |
| 9 | `20261114000000` restrictions on steps | `step_permissions`, `access_restrictions` |
| 10 | `20261115000000` legacy audit marking | `audit_logs.hash_algo` (3) |
| 11 | `20261116000000` audit immutability restored | `audit_logs`; must come **after** 10, which disables the update trigger for one statement |
| 12 | `20261117000000` specification approval by QA Manager | `product_specifications` (8); `electronic_signatures` |
| 13 | `20261118000000` governing specification preserved | `product_specifications` (8); `batch_records` |
| 14 | `20261119000000` operational role assignments | the grid; `access_restrictions`; `app_is_company_member`; `product_specification_approver_error` (12) |
| 15 | `20261120000000` separation of duties per batch | 14; `batch_qc_results`, `batch_stages`, `batch_dispatches` |
| 16 | `20261121000000` role assignment signatures | 14; `step_permissions`, `electronic_signatures`, `verify_user_password` |
| 17 | `20261122000000` material separation of duties | 15; renames `batch_duty_conflicts` to `duty_conflicts` |
| 18 | `20261123000000` rule tables are not writable | 16 and 17 — it locks down tables those two create |

Each is idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before
`CREATE TRIGGER`, and `ON CONFLICT DO UPDATE` on every seed. Re-running
the set is safe and was done repeatedly during development.

### Effect on existing data

| Change | Existing rows |
|---|---|
| `section_permissions`, `step_permissions.section` | seed/backfill only |
| `batch_qc_results.corrected_from_id`, `correction_reason` | added NULL; no row changes meaning |
| `audit_logs.hash_algo` | **one UPDATE**, setting a column that did not exist before, on rows that have a hash. No hash, sequence number or timestamp is touched. The immutability trigger is disabled for that single statement and an assertion fails the migration if it is left off. |
| `product_specifications`, `product_specification_tests`, `access_restrictions`, `batch_dispatches` | new tables, empty |
| Widened RLS policies | strictly additive — the `owner`/`admin` clause is kept and the grid clause OR-ed beside it |
| `fn_block_audit_mutation` + three triggers (`20261116000000`) | no rows touched. On the Criateur project these are **absent today**, so this is a restoration, not a re-statement; see [`docs/audit-threat-model.md`](audit-threat-model.md) §4. |
| `product_specifications.approval_signature_id`, `approved_by_role` (`20261117000000`) | added NULL on an empty table |
| `batch_records.governing_specification_id`, `governing_specification_stamped_at` (`20261118000000`) | added NULL. **Existing released batches are left unstamped** — the stamp is applied at release, and back-stamping a batch released before the control existed would assert a review that never happened. `batch_governing_specification` falls back to the effective-date lookup for them. |
| `batch_specification_reviews` | new table, empty |
| `operational_role_assignments`, `work_role_resolution`, `batch_duty_conflicts` (`20261119000000`, `20261120000000`) | new tables. The first deploys **empty and is not back-filled** — there is nobody to back-fill from, and inventing an assignment would assert an authority nobody granted. The other two carry a config row and three derived conflict pairs. |
| `company_members` | **nothing.** Not a column, not a constraint, not a row, and the enum is not extended. |

**The one behaviour change that affects live data is the release
gate.** After `20261113000000`, a batch cannot be released unless an
approved specification was in force on its manufacturing date. **In an
existing workspace there will be none**, so *every* batch currently
awaiting release is blocked until a specification is approved for its
product — and for batches already manufactured, that specification must
be back-dated to on or before the manufacturing date.

That is the decided behaviour (fail closed, no silent bypass), but it
is a **deployment-day operational step, not a surprise to discover
afterwards**. See *Release blockers*.

### Rollback

| Migration | Rolling back |
|---|---|
| 1, 2, 4, 5, 6, 7, 9, 12–14 | drop the triggers and restore the prior function bodies from git; data added is additive and can be left |
| `20261113000000` | dropping the two tables loses every specification written; the gate reverts by restoring the previous `batch_release_block_reason` |
| `20261115000000` | the marking is **not reversible to "unknown"** by design — but it changed no hash, so nothing is lost; set `hash_algo` back to NULL if required |
| `20261108000000` | **sealed entries cannot be unsealed.** Rolling the sealer back leaves rows sealed under `sha256-auditlog-v1`, which the older `verify_audit_chain` ignores. Not destructive; verification becomes weaker. |
| `20261116000000` | dropping the triggers returns the database to the state production is in today, i.e. audit entries become mutable again. Reversible, and a regression. |
| `20261117000000` | dropping the two columns loses the recorded approver role and the signature link. The 2-arg `product_specification_approve` overload was **dropped**, so a rollback must restore it from git or approval stops working. |
| `20261118000000` | dropping `governing_specification_id` loses the stamp on any batch released after deployment — the one rollback in this branch that **does** lose data created after it. `batch_specification_reviews` likewise. Both should be exported before any such rollback. |
| `20261120000000` | restore the two trigger function bodies from git and drop `batch_duty_conflicts`. Reversible. Roll this back **before** 14, not after. |
| `20261119000000` | restore five function bodies from git. Dropping `operational_role_assignments` **destroys every assignment and revocation** — the record of who held which authority and when, with no equivalent elsewhere, since the membership column cannot hold these roles. Export it first. A rollback also returns every member to holding no operational role, i.e. the inert state the live project is in today. |

No migration drops a column or a table, so **no rollback loses data
that existed before this branch**. Rolling back `20261118000000` does
lose governing-specification stamps and controlled reviews recorded
*after* deployment, which is the one exception and the reason to
export those two before considering it.

---

## What still needs the live Criateur project

**Updated 2026-10-23.** Read-only inspection of project
`ovxfflilbqaxedzovgmz` has now answered most of what this section
listed as unanswerable. The findings are in
[`docs/live-readiness.md`](live-readiness.md); the five items are
re-stated here with what is now known.

1. **That the migrations apply to the real database in order.** Still
   unproven — nothing has been applied. The divergence that worried
   this entry is real and worse than expected: `company_members.role`
   is enum `company_role` with values `owner, admin, legal, marketing,
   viewer`, and **not one of the eight PM-03 work roles exists in it.**
   This is now release blocker 1.
2. **How many existing audit entries are marked legacy, and whether
   any are `unhashed`.** Answered: 192 entries, 135 hashed, **57 with
   no hash at all** — a finding. Plus one back-dated `CHAIN_REANCHOR`
   entry; see [`docs/audit-threat-model.md`](audit-threat-model.md) §4.
3. **How many batches are blocked by the specification gate.**
   Answered: **2** batches in `qc_in_progress`, across 7 distinct
   products with non-terminal batches. `batch_qc_results` is **empty**
   (0 rows), so finished-product QC results do not exist for any of
   them either. Small enough to prepare deliberately.
4. **Whether `app_is_service_context()` behaves as expected** on the
   managed platform. **Still unverified** — it cannot be settled
   without executing on the project, and it is a read of
   `session_user`, so inspection of the schema does not answer it.
5. **Whether any other table carries an owner/admin-only write policy**
   that the sweep did not reach. **Still open**; the live project has
   258 public tables against the subset this branch touches. Section 6
   of `scripts/ci/live-readiness-report.sql` counts them.

Still requiring live execution, not just live reading: 1, 4, 5, and
every assertion in §§2–3 of this document, all of which were proved
against a local rebuild only.

The Supabase MCP account reachable from this session held two
projects: `ovxfflilbqaxedzovgmz` (Criateur, display name "my-app",
identity confirmed by schema — 258 public tables, all 8 Criateur core
tables, 30 companies, 18 batch records) and `lzuuwdtrivqvccedbivz`
(RentTruth App, not queried beyond the listing). **Nonameyet and
Traitwar were not present in the account and were not queried.** The
MCP server has since dropped out of this session, so the figures above
are a snapshot of 2026-10-23 and must be re-taken before deployment
with `scripts/ci/live-readiness-report.sql`.

---

## Release blockers

Re-ordered 2026-10-23 after live inspection. 1 is new and is the one
that stops deployment being useful at all.

1. **No operational role has been assigned on the live project.**
   *Downgraded 2026-10-23: the mechanism now exists.*
   `company_members.role` is still enum `company_role` =
   `owner, admin, legal, marketing, viewer`, untouched and not
   extended. `20261119000000` adds a separate, company-scoped
   `operational_role_assignments` register for PM-03's eight roles,
   so the enum no longer blocks anything.
   **What remains is data, not schema**: the table deploys empty and
   nothing is back-filled, because inventing an assignment would
   assert an authority nobody granted. Until a workspace owner or
   admin appoints real people, every guard still abstains and the
   layer is still inert — including specification approval, which
   nobody can perform until somebody holds `qa_manager`.
   See [`docs/operational-role-model.md`](operational-role-model.md).
2. **Audit immutability is absent on production** despite its
   migration being recorded as applied, so audit entries are mutable
   there today. `20261116000000` restores it.
   [`docs/audit-threat-model.md`](audit-threat-model.md) §4.
3. **A script back-dated an audit entry on production.** One
   `CHAIN_REANCHOR` row at sequence 7 carries a `created_at` of
   2026-02-25 that is not when it was written, and the next entry's
   `previous_hash` was rewritten to link through it. The script is
   withdrawn; the entry is left in place and documented rather than
   rewritten again. The anon key it hardcoded is in git history and
   **must be rotated**.
4. **No specification exists in any live workspace**, so the 2 batches
   in `qc_in_progress` will be blocked on deployment, as will any new
   release. A specification must be approved per product and
   back-dated for batches already made — under the controlled plan in
   [`docs/specification-backfill-plan.md`](specification-backfill-plan.md),
   not by hand. The screen exists (*Quality → Specifications*) and the
   blocked release links to it.
5. **Nothing has been executed against the live project.** Every
   assertion in this document comes from a local rebuild. Items 1, 4
   and 5 of the section above can only be settled by running there.
6. **The audit chain has no external anchor**, so a database owner can
   rewrite it undetectably with enough effort. Acceptable or not is a
   decision, not a bug.

7. **Four conflict pairs are proposed and unenforced, awaiting your
   decision.** One material pair is enforced (whoever tested a lot may
   not disposition it — the batch rule applied where the same facts
   hold). Three more are recorded in `duty_conflicts` with
   `enforced = false`: one is permissible under PM-03 but required by
   no product decision, and two are **not derivable** — PM-03 gives
   both columns to the same roles, so enforcing them would contradict
   the matrix rather than read it. The site's own written procedures
   are not in the repository or the database, so these could not be
   validated against them. Six questions in
   [`docs/separation-of-duties.md`](separation-of-duties.md) §5.

8. **Anyone who can run a migration can appoint a QA Manager.** A
   service context has no password and cannot sign, so it is exempt
   from the authority and signature checks. Not closable from inside
   the database — a migration is what defines what the database
   enforces. What is closable is invisibility: every such grant is
   stamped `provenance = 'service'` and listed by
   `operational_role_unsigned_grants()`. **Treat a non-empty result on
   production as a finding to explain, not a list to skim.**

9. **Separation of duties now depends on the per-batch check, not on
   PM-03's arithmetic.** One person may hold several operational
   roles, so "nobody holds both columns" is no longer true by
   construction. `20261120000000` enforces it against the batch
   instead: whoever recorded its QC results or executed it may not
   release it, and whoever released it may not dispatch it. The three
   pairs are derived from PM-03 and asserted to be, but **which pairs
   are right is a quality-system question** and the table is where
   that answer lives.

### Resolved since the last revision

- **Approval authority for a specification.** Was blocker 3. Decided:
  QA Manager, enforced server-side in
  `20261117000000_specification_approval_by_qa_manager.sql`, with an
  administrator explicitly unable to bypass it. **Pending final
  quality/regulatory confirmation**, and dependent on blocker 1 — the
  role it names cannot be held by anyone on production today.
