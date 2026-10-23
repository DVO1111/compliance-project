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
  date — is a quality judgement with a regulatory flavour. It is
  flagged in the conflict register, not settled here.

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

No migration drops a column or a table, so **no rollback loses data
that existed before this branch**.

---

## What still needs the live Criateur project

None of the following can be settled from a local rebuild:

1. **That the migrations apply to the real database in order.** Local
   is built from the same files, but the live project has three years
   of history and `company_members.role` is an **enum** there and
   `text` locally — the divergence that broke an apply once already.
2. **How many existing audit entries are marked legacy,** and whether
   any are found `unhashed` — which would be a finding.
3. **How many batches are currently blocked by the specification
   gate,** which is the number that decides whether deployment needs a
   data-preparation step first.
4. **Whether `app_is_service_context()` behaves as expected** on the
   managed platform. It is known to differ: `rolsuper` is false for
   `postgres` on Supabase, which `20260918500000` exists to handle.
5. **Whether any other table carries an owner/admin-only write policy**
   that this sweep did not reach, in schemas or tables that only exist
   live.

The Supabase MCP credentials available to this session hold two
projects, **Nonameyet** and **Traitwar**, neither of which is Criateur.
Neither has been queried.

---

## Release blockers

1. **No specification exists in any live workspace**, so every batch
   awaiting release will be blocked on deployment. A specification must
   be approved per product, back-dated for batches already made. The
   screen exists (*Quality → Specifications*) and the blocked release
   links to it.
2. **Nothing has been run against the live project** — see above.
3. **Approval authority for a specification is unconfirmed.** It uses
   the designated QA authority register because PM-03 names no role.
   One predicate to change if the answer differs.
4. **The audit chain has no external anchor**, so a database owner can
   rewrite it undetectably with enough effort. Acceptable or not is a
   decision, not a bug.
