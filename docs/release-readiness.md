# Release readiness

One report. What is built, what is proved, what is still yours to
decide, and what would have to happen for this branch to be deployed.

**Nothing has been applied to production. No key has been rotated. No
staging infrastructure exists.** All three are on hold pending your
approval of the deployment plan.

Branch `claude/project-remodel-review-5e064v`, unmerged.
Compiled 2026-10-23 from a local PostgreSQL dropped and rebuilt from
all 156 migrations.

Nothing in this document, or in the product, establishes regulatory
compliance or validation.

---

## 1. Verification, in one place

| | |
|---|---|
| SQL assertions | **2577, 0 failed** |
| Suites | 50 |
| Database | dropped and rebuilt from the migration files, every run |
| Frontend unit tests | **1057, 0 failed** |
| TypeScript | clean |
| Production build | clean |
| Render check | every PM-03 page drawn against an empty database, no page errors |
| Applied to the Criateur project | **nothing** |

### The suites this branch added

| Suite | Assertions | Covers |
|---|---|---|
| `role_signatures_and_duties_test.sql` | 84 | signatures on role grants, bootstrap, multi-role holders, duties across routes, revocation, the rule tables |
| `operational_role_model_test.sql` | 59 | membership preserved, abstention, several roles, revocation, authority by RPC **and** direct write, the legacy bridge |
| `product_specification_test.sql` | 38 | the specification model and its criterion limits |
| `stranded_work_and_service_grants_test.sql` | 37 | work left by a revocation, the notice, reassignment, unsigned service grants |
| `decisions_and_step_restrictions_test.sql` | 33 | QA Manager approval, governing version, PM-04 on all five protected steps |

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

---

## 3. The four findings that were not in the brief

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

## 4. Decisions waiting on you

Nothing below is blocked on engineering. Each has a default
implemented; what is missing is your ruling.

### 4.1 Separation of duties — six decisions

The full table, with PM-03 impact and what each default costs, is
[`docs/separation-of-duties.md`](separation-of-duties.md) §5.

| # | Question | Default | Needs |
|---|---|---|---|
| 1 | Receiver may not disposition the lot | **enforced** | confirm |
| 2 | CoA verifier may not disposition | **not enforced** | decide **+ PM-03 change** |
| 3 | Sampler may not test | **not enforced** | decide **+ PM-03 column** |
| 4 | Releaser may not dispatch | **enforced** | confirm |
| 5 | qc_analyst / production_supervisor need a signature to be granted | **no** | decide **+ PM-03 change** |
| 6 | One in-process reading counts as having executed the batch | **yes (broad)** | confirm |

Three are *confirm or overturn*; three need PM-03 changed before they
could be enforced at all. **I will not enforce a rule the permission
matrix contradicts.**

### 4.2 Proposed defaults from earlier rounds, still pending

| Decision | Status |
|---|---|
| Specification approval reserved to the QA Manager | implemented; **pending quality/regulatory confirmation** |
| Governing version = effective at manufacture | implemented; **pending confirmation** |
| Self-assignment refused outright, so a one-person workspace needs bootstrap | implemented; **pending confirmation** |
| Should a role assignment need a second approver? | **open** — currently one signature |
| Should `release` require a signature? | **open** — `requires_signature` is `false` on production today |

### 4.3 Acknowledged residuals

Not defects, and not closable from inside the database. They need a
decision about whether they are acceptable.

| Residual | Why it cannot be closed here |
|---|---|
| **Anyone who can run a migration can appoint a QA Manager** | A service context has no password and cannot sign. A migration is what defines what the database enforces. **Mitigated**: every such grant is stamped `provenance = 'service'` and listed — see §5 |
| **The audit chain has no external anchor** | Nothing is signed by a key the database does not hold. The chain shows records are internally consistent; it cannot show they were not replaced |
| **Bootstrap does not independently verify authority** | In a workspace of one there is no second party. The compensating control is the regulatory submission, outside this database |
| **A database owner can rewrite the chain** | Tamper-evident against careless alteration, not against deliberate alteration by whoever holds the credentials |

---

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

### 5.4 Data readiness

`scripts/ci/live-readiness-report.sql` — SELECTs only. Re-run it; the
figures in `docs/live-readiness.md` are a snapshot of 2026-10-23 and
the Supabase connector has since dropped out of the session that took
them.

---

## 6. Deployment order

Not to be started until you approve this plan.

| # | Step | Who |
|---|---|---|
| 0 | Re-run `scripts/ci/live-readiness-report.sql` | engineer |
| 1 | Review and approve: the role model, the six decisions, the deployment plan | **you** |
| 2 | Apply `20261103000000` … `20261118000000` in filename order | engineer |
| 3 | Apply `20261119000000` … `20261125000000` | engineer |
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
| [`separation-of-duties.md`](separation-of-duties.md) | Both chains, what is enforced and on whose authority, **the six decisions** |
| [`screen-audit.md`](screen-audit.md) | Placeholders, empty and failure states, role-specific actions, Figma coverage |
| [`audit-threat-model.md`](audit-threat-model.md) | Who can alter an audit record, and the absence of an external anchor |
| [`live-readiness.md`](live-readiness.md) | What the Criateur project actually contains |
| [`specification-backfill-plan.md`](specification-backfill-plan.md) | How the missing specifications get written, without inventing criteria |
| [`key-rotation-checklist.md`](key-rotation-checklist.md) | The dependency map, and the procedure |
| [`release-verification.md`](release-verification.md) | The four original verification areas, and the blocker list |
| [`figma-conflicts.md`](figma-conflicts.md) | 36 entries: every conflict, silence and decision, in order |
