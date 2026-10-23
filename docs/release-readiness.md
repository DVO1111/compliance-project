# Release readiness

One report. What is built, what is proved, what is still yours to
decide, and what would have to happen for this branch to be deployed.

**Nothing has been applied to production. No key has been rotated. No
staging infrastructure exists.** All three are on hold pending your
approval of the deployment plan.

Branch `claude/project-remodel-review-5e064v`, unmerged.
Compiled from a local PostgreSQL dropped and rebuilt from all 214
migrations. Revised after the finalisation brief ruled on all nine
decisions.

Nothing in this document, or in the product, establishes regulatory
compliance or validation.

---

## 1. Verification, in one place

| | |
|---|---|
| SQL assertions | **2629, 0 failed** |
| Suites | 52 |
| Branch migrations applying cleanly on a bare build | **17 of 17**, in filename order |
| Database | dropped and rebuilt from the migration files, every run |
| Frontend unit tests | **1057, 0 failed** |
| TypeScript | clean |
| Production build | clean |
| Lint on changed files | no new errors against the `HEAD` baseline |
| Render check | **17 pages × empty database, 0 errors, 0 blank**; the rail rendered for all eight roles, for a two-role holder, and for somebody holding none |
| Applied to the Criateur project | **nothing** |

### The suites this branch added

| Suite | Assertions | Covers |
|---|---|---|
| `role_signatures_and_duties_test.sql` | 84 | signatures on role grants, bootstrap, multi-role holders, duties across routes, revocation, the rule tables |
| `operational_role_model_test.sql` | 59 | membership preserved, abstention, several roles, revocation, authority by RPC **and** direct write, the legacy bridge |
| `product_specification_test.sql` | 38 | the specification model and its criterion limits |
| `stranded_work_and_service_grants_test.sql` | 37 | work left by a revocation, the notice, reassignment, unsigned service grants |
| `decisions_and_step_restrictions_test.sql` | 33 | QA Manager approval, governing version, PM-04 on all five protected steps |
| `decision_enforcement_test.sql` | 47 | all nine decisions enforced: attribution, both material separations, dispatch ordering and backdating, signed verdicts, correction laundering |

---

## 2. What this branch built

Grouped by the problem each solved, oldest first.

| Area | State |
|---|---|
| PM-03 section grid, and the guards that read it | Built, with the grid transcription checked cell-by-cell against the migration seed |
| PM-04 individual restrictions, reaching all five protected steps | Built; restrictions bite before the role check, so they apply where the grid abstains |
| Finished-product specifications, and release gated on them | Built; fail closed, no silent bypass |
| Specification approval reserved to the QA Manager | Built, signed, **pending quality/regulatory confirmation** |
| Governing specification stamped at release and locked | Built; reassessment goes through a controlled review, **pending confirmation** |
| Audit sealing, and immutability restored | Built; `20261116000000` self-tests by attempting the refused writes |
| Operational roles as their own register | Built; `company_members` untouched |
| Signatures on GMP-critical role grants | Built; bound to the exact action, single use |
| Initial setup for a workspace of one | Built; narrow, signed, declared, marked, reported — and **does not independently verify** |
| Separation of duties, batch and material | Built; three pairs enforced, three recorded unenforced |
| Stranded work after a revocation | Built; report, notice, and an auditable reassignment |
| The rule tables locked down | Built, after finding them world-writable |
| **Attribution the guards read** | Built, after finding three columns unwritten or forgeable — §3.5 |
| **Decision 2**, beyond PM-03 on a named approval | Built; the divergence is recorded, not hidden |
| **Decision 5**, signatures on the verdict the gate reads | Built and enforced for the finished-product verdict; two more registered and held |
| **Decision 4**, dispatch ordering | Built; a dispatch cannot be dated before its release or in the future |

---

## 3. The five findings that were not in the brief

Each was found by checking rather than by being told, and each changed
something.

### 3.1 The rule tables were writable by anyone signed in

```sql
SET ROLE authenticated;
DELETE FROM public.duty_conflicts;      -- DELETE 6
DELETE FROM public.gmp_critical_roles;  -- DELETE 3
```

Both succeeded. Any signed-in user, and `anon`, could have emptied
every separation-of-duties rule and every signature requirement, after
which the gates ran on every write and found nothing to object to.

Cause: the project-wide default grant gives new `public` tables full
DML, and two rule tables were created without RLS on the reasoning
that their rows are not tenant data. They are not — they are more
sensitive. **Closed** by `20261123000000`, privileges revoked and RLS
added, with an assertion that runs the DELETE rather than checking a
privilege.

### 3.2 Audit immutability was absent on production

`20260225000000` is recorded in the live migration ledger as applied
and **its triggers are not on the table**. Audit entries on the
Criateur project are UPDATE-able today.

The second-order finding matters more: **the ledger records what was
run, not what survived.** Any claim of the form "control X holds
because migration Y is applied" is unsound on that database, and
`release-verification.md` §1 was making one.

### 3.3 A script back-dated an audit entry on production

`scripts/repair_audit_chain.mjs` ran. One `CHAIN_REANCHOR` row at
sequence 7 carries a `created_at` chosen to sit in the historical
record, and the next entry's `previous_hash` was rewritten.

The script is withdrawn and throws. **The entry is left in place** —
rewriting history to tidy up a rewrite of history is the same act
twice — and is documented in `docs/audit-threat-model.md` §4.

### 3.4 The screen and the database disagreed about roles

`resolveWorkRole` mapped `owner`, `admin` and `compliance_officer` to
`compliance_admin`. On the live project, where all 21 members hold
`owner`, **the entire workspace was being shown a compliance admin's
navigation and dashboards** while the server granted them nothing.

Fixed, and a second round of the same class found four more callers
that had stopped consulting the grid once roles became a set — one of
them the rail filter itself. `docs/screen-audit.md` §5.

---

### 3.5 Three columns the guards read, and nobody was writing them

`material_lots.received_by` was **never set by the application**, so
decision 1's conflict read NULL for every lot the product created and
could not fire — a guard installed, attached and unreachable.
`batch_qc_results.tested_by` and `material_test_results.analyst_id`
were both supplied by the caller, so whoever recorded a result could
name somebody else as the analyst, which defeats the release gate's
self-tested rule.

All four actor columns (including the in-process reading's recorder,
for decision 6) are now written from the session and frozen once set.
Seven test fixtures then had to stop using one person for two jobs,
which is the control proving itself.

## 4. What is decided, and what is still open

### 4.1 The nine decisions — all ruled

| # | Decision | State |
|---|---|---|
| 1 | Receiver may not disposition | **Enforced** |
| 2 | CoA verifier may not disposition | **Enforced**, beyond PM-03 on a named approval. Option B accepted 2026-10-23 as a **temporary** exception — PM-03 is not redrawn this release |
| 3 | Sampler may not test | **Not enforced** — the one still open |
| 4 | Releaser may not dispatch; no backdating | **Enforced** |
| 5 | Signatures on QC/Production actions | **Enforced** for the finished-product verdict; two registered and held |
| 6 | One reading counts as execution | **Confirmed**, broad reading |
| A | Specification approval is the QA Manager's | **Enforced**, signed |
| B | Governing version = effective at manufacture | **Enforced**, stamped and locked |
| C | Self-assignment refused; bootstrap narrow | **Enforced**, marked and reported |

Detail, PM-03 impact and what each costs:
[`docs/separation-of-duties.md`](separation-of-duties.md) §5.

### 4.2 Still open — one decision and two held actions

| Item | Needs |
|---|---|
| **Decision 3**, sampler versus tester | A PM-03 column for sampling, **and** a site procedure requiring independence. The brief forbids inventing a universal rule without one. The attribution it would read already exists and is preserved. |
| `material_test_result` signature | The site's testing procedure: every result, or only critical parameters |
| `batch_execution_close` signature | Procedure: whether closing is clerical, given stage completion is already signed |
| Should a role assignment need a second approver? | Currently one signature |
| Whether to take Option A for incoming CoA verification eventually, and **which role** holds it | A quality judgement about supplier certificates. `docs/decision-note-coa-separation.md` §8 |

`SELECT * FROM duty_decisions_outstanding();` returns exactly one row,
and it is sampling. `SELECT * FROM signed_quality_actions WHERE NOT
required;` returns the two held actions. **One query covers all of
them**, with which kind of open each one is:

```sql
SELECT key, state, enforced, temporary FROM public.policy_decisions_outstanding();
```

Six rows, the temporary exception first. Added by `20261131000000`;
pass/fail criteria in
[`docs/live-verification-checklist.md`](live-verification-checklist.md)
§4b.

### 4.2b Resolved since this report was first written

| Item | Resolution |
|---|---|
| **Should `release` require a signature?** | **Not an open question — it already does.** `20261107000000` sets `requires_signature = true` for the one transition that reaches `released`. Production reads `false` only because that migration is **unapplied there**; deploying installs the requirement. Demonstrated locally: three routes tried (the engine with no signature, a direct write of `entity_current_state`, a direct write of `batch_records.status`), all three refused, batch unmoved. The residual risk is that `20261107000000`'s `UPDATE` matches zero rows on production if its transition row differs — checklist §11 |
| **`material_coa_verify()` membership-only authorisation** | **Closed** by `20261130000000`. Was a release blocker: a member with no operational role could record a verification. Now reserved to PM-03's existing `qc_testing` / `qa_disposition` Act holders, with no abstention, enforced by a trigger so direct writes meet the same refusal. 15 regression assertions |

### 4.3 Subject to quality/regulatory confirmation before production

Decisions A and B are implemented and enforced, and remain proposed
defaults pending confirmation against the site's approved quality
procedures and the applicable regulations. Nothing in the product
claims otherwise.

### 4.4 Acknowledged residuals

Not defects, and not closable from inside the database.

| Residual | Why it cannot be closed here |
|---|---|
| **Anyone who can run a migration can appoint a QA Manager** | A service context has no password and cannot sign. A migration defines what the database enforces. **Mitigated**: every such grant is stamped `provenance = 'service'` and listed — §5.1 |
| **A service context can record an unsigned verdict** | Same reasoning. Such rows carry `signature_id IS NULL`, which is the honest record of a verdict nobody attested to, and they are findable |
| **The audit chain has no external anchor** | Nothing is signed by a key the database does not hold |
| **Bootstrap does not independently verify authority** | In a workspace of one there is no second party. The compensating control is the regulatory submission |
| **A database owner can rewrite the chain** | Tamper-evident against careless alteration, not against deliberate alteration by whoever holds the credentials |

## 5. The pre-release checks — mandatory

Run these against the target database **immediately before
deployment** and again immediately after. They are read-only.

### 5.1 Unsigned grants — must be empty, or explained

```sql
SELECT co.name, g.*
  FROM public.companies co,
       LATERAL public.operational_role_unsigned_grants(co.id) g
 WHERE g.still_live
 ORDER BY co.name, g.assigned_at;
```

Every row is an operational role somebody holds that **no person
signed for**: a migration or seed granted it, or a sole owner declared
it during initial setup.

**A non-empty result is a finding to explain, not a list to skim.**
For each row, either revoke and re-grant through the signed path, or
record in the quality system why the unsigned grant stands. The
`finding` column says which kind it is.

This check is the entire mitigation for residual 1 in §4.3. Skipping
it removes the mitigation and leaves the residual.

### 5.2 Stranded work — must be empty, or reassigned

```sql
SELECT co.name, w.*
  FROM public.companies co,
       LATERAL public.operational_role_stranded_work(co.id) w
 WHERE w.still_stranded
 ORDER BY co.name, w.last_acted_at;
```

Unfinished records whose last actor lost a role and can no longer
carry on. Each needs `stranded_work_reassign(...)` to somebody who
can, or an explanation.

### 5.3 Outstanding duty decisions — must match what you approved

```sql
SELECT * FROM public.duty_decisions_outstanding();
```

Every conservative default still unconfirmed, and every pair not
enforced. If this does not match §4.1 as you ruled on it, the database
and the decision have drifted.

### 5.4 Unsigned verdicts — the new one

```sql
SELECT b.company_id, q.batch_id, q.test_name, q.result, q.pass, q.tested_at
  FROM public.batch_qc_results q
  JOIN public.batch_records b ON b.id = q.batch_id
 WHERE q.signature_id IS NULL
 ORDER BY q.tested_at DESC;
```

Finished-product verdicts nobody signed for. After deployment there
should be none from the application; rows here are seeds, migrations
or results predating the control. A released batch resting on an
unsigned verdict is a finding to explain.

### 5.5 Data readiness

`scripts/ci/live-readiness-report.sql` — SELECTs only. Re-run it; the
figures in `docs/live-readiness.md` are a snapshot of 2026-10-23 and
the Supabase connector has since dropped out of the session that took
them, so **no live check in this document has been repeated since**.

Everything in §§5.1–5.4 is written to be run by an engineer with
database access. None of it has been run against the Criateur
project.

---

### 5.6 The operator checklist

Everything in §§5.1–5.5 is collected, with expected values and a
sign-off table, in
[`docs/live-verification-checklist.md`](live-verification-checklist.md).
That is the document to hand to whoever has database access. It is
read-only throughout.

## 5b. Migration sequence — verified against this branch

Checked empirically, not asserted.

| Claim | How it was checked | Result |
|---|---|---|
| All branch migrations apply in filename order | A database created from nothing, bootstrap applied, then every migration in `supabase/migrations` in order | **17 of 17 applied.** The 15 that fail are dated Feb–Jul 2026 and predate this branch — the runner's pinned baseline |
| The suite runs from that schema | `scripts/ci/run-sql-tests.sh` drops and rebuilds every run | 2629 assertions, 0 failed |
| `company_role` enum untouched | `grep` for `ALTER TYPE` and `company_role` across the branch's migrations | Four mention it; **all four are comments or read-only predicates**. No `ALTER TYPE` anywhere |
| `company_members` untouched | `grep` for `ALTER TABLE public.company_members` | **None** |
| Audit immutability restored | Count the three triggers on a migrations-only build | **3 present** |
| Role assignments deploy empty | Count on a migrations-only build | **0** — nothing back-filled |
| Specifications deploy empty | Same | **0** — no seeded criteria |
| Enforced duty pairs | Same | **6**, one of them on an explicit approval |
| Outstanding decisions | Same | **1** — sampling |
| Signed actions enforced | Same | **1** — `batch_qc_result` |

The counts above come from a database built from **migrations only**,
not from the post-suite database — the test suites create roles and
specifications of their own, and reading those would have reported
seeded data that does not exist.

### Ordering constraints that matter

| Pair | Why the order is fixed |
|---|---|
| `20261115000000` → `20261116000000` | 15 disables the audit update trigger for one statement; 16 creates it. Reversed, 16's self-test would run against a disabled trigger |
| `20261117000000` → `20261119000000` | 19 replaces `product_specification_approver_error`, which 17 creates as a seam |
| `20261119000000` → `20261121000000` | 21 extends `fn_operational_role_authority` and drops the 4-argument `operational_role_assign` |
| `20261120000000` → `20261122000000` | 22 **renames** `batch_duty_conflicts` to `duty_conflicts` |
| `20261122000000` → `20261125000000` → `20261128000000` → `20261129000000` | each narrows or relabels rows the previous one created |
| `20261126000000` after `20261122000000` | the attribution it writes is what the duty guards read; applied earlier it would have nothing to attach to |

### Rollback limitations, restated

| Migration | What a rollback destroys |
|---|---|
| `20261119000000` | **every assignment and revocation** — the record of who held which authority and when. No equivalent elsewhere, since the membership column cannot hold these roles |
| `20261121000000` | the link between an appointment and the signature that authorised it. The signatures survive in `electronic_signatures`; which one authorised which grant does not |
| `20261124000000` | every reassignment of stranded work |
| `20261126000000` | nothing stored — but dropping it makes decision 1 unreachable again, silently |
| `20261127000000` | the link between a verdict and its signature |
| `20261118000000` | governing-specification stamps and controlled reviews created after deployment |

**Export those tables before contemplating any rollback.** Everything
else on this branch is additive and reversible by restoring function
bodies from git.

---

## 6. Deployment order

Not to be started until you approve this plan.

| # | Step | Who |
|---|---|---|
| 0 | Re-run `scripts/ci/live-readiness-report.sql` | engineer |
| 1 | Review and approve: the role model, the six decisions, the deployment plan | **you** |
| 2 | Apply `20261103000000` … `20261118000000` in filename order | engineer |
| 3 | Apply `20261119000000` … `20261129000000` | engineer |
| 4 | Verify: §5.1, §5.2, §5.3, plus `verify_audit_chain` per company | engineer |
| 5 | **Appoint operational roles** — a workspace owner or admin assigns them to named people, with a reason and, for a GMP-critical role, a signature | **you / QA** |
| 6 | Approve specifications under the backfill plan | **QA Manager** |
| 7 | Decide whether `release` requires a signature, and set it | **you** |
| 8 | Rotate the anon key, under its own window | **separate** — see §7 |

Step 6 cannot start before step 5: only a QA Manager may approve a
specification and nobody holds that role today. Step 5 has a
constraint worth knowing first — **nobody can assign themselves a
role**, so a workspace with one active member must use the bootstrap
path, which is marked and reported.

### What deploying without step 5 produces

Every guard abstains, because nobody holds a tabulated role. The
controls are installed, exercised on every write, and **silent**. That
is worse than not deploying them, and it is why step 5 is not
optional.

---

## 7. On hold until you say otherwise

| | Status |
|---|---|
| Production changes | **on hold** — nothing applied |
| Staging infrastructure | **not created** — a Supabase branch would be billable |
| Key rotation | **not performed** — `docs/key-rotation-checklist.md` maps it. All three committed literals are anon keys; no `service_role` key is in the tree or its history. On the legacy key scheme, rotating one invalidates the other, which decides the window |
| Branch | **unmerged** |

---

## 8. Where everything is written down

| Document | What it answers |
|---|---|
| [`operational-role-model.md`](operational-role-model.md) | The role schema, authority, signatures, bootstrap, revocation, backward compatibility, rollback limits |
| [`separation-of-duties.md`](separation-of-duties.md) | Both chains, what is enforced and on whose authority, the six decisions, and §§5.4–5.5 — what is **explicitly unresolved** and what would close it |
| [`decision-note-coa-separation.md`](decision-note-coa-separation.md) | **The one divergence from PM-03**: the exact column change, affected roles and screens, enforcement, tests, and three options |
| [`live-verification-checklist.md`](live-verification-checklist.md) | **Operator-ready, read-only.** Every live check with expected values and a sign-off table |
| [`screen-audit.md`](screen-audit.md) | Placeholders, empty and failure states, role-specific actions, Figma coverage |
| [`audit-threat-model.md`](audit-threat-model.md) | Who can alter an audit record, and the absence of an external anchor |
| [`live-readiness.md`](live-readiness.md) | What the Criateur project actually contains |
| [`specification-backfill-plan.md`](specification-backfill-plan.md) | How the missing specifications get written, without inventing criteria |
| [`key-rotation-checklist.md`](key-rotation-checklist.md) | The dependency map, and the procedure |
| [`release-verification.md`](release-verification.md) | The four original verification areas, and the blocker list |
| [`figma-conflicts.md`](figma-conflicts.md) | 36 entries: every conflict, silence and decision, in order |
