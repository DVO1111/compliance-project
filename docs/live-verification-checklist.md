# Live verification checklist — READ ONLY

For an operator with database access to the Criateur project. Every
statement is a `SELECT`. Nothing here creates, changes or deletes
anything.

## Status

This checklist has two passes. **They have different statuses and the
distinction is the whole point.**

| Pass | Status | |
|---|---|---|
| **Before deployment** | **PARTIALLY RUN** — 2026-10-23 21:06 UTC | §§0, 1, 6a, 6b, 7a, 7d, 9, 10 (grants), 11(a)(b) read live against `ovxfflilbqaxedzovgmz`. Evidence recorded below |
| **After deployment** | **NOT RUN** | Nothing has been deployed. Every section must be re-run and recorded |

**The after pass is what "live verification" means, and it has not
happened.** Most sections cannot even be attempted yet: they call
functions that arrive with the migrations
(`operational_role_unsigned_grants`, `operational_role_stranded_work`,
`duty_decisions_outstanding`, `policy_decisions_outstanding`,
`material_coa_verify_authority_error`,
`batch_release_signature_postcondition`), and none of those exists on
production today.

**Do not report live verification as complete** until the after pass
has been run in full against project `ovxfflilbqaxedzovgmz`, every
criterion has a recorded verdict, and the sign-off at the foot of this
document is filled in. A passing local test suite is not a substitute
for any line of it: the local harness runs **Postgres 16** and
production runs **Postgres 17.6**, on different data, with different
history.

### Dated evidence — before pass, 2026-10-23 21:06 UTC

Read-only. Every statement was a `SELECT`; nothing was written. Source:
Supabase MCP against `ovxfflilbqaxedzovgmz`, timestamp taken from the
database's own `now()`.

| Reading | Value | Verdict |
|---|---|---|
| Migrations applied / latest | **133** / **`20261101000000`** | PASS — matches the expected boundary |
| Applied with version `> 20261101000000` | **0** | PASS — all 31 outstanding |
| Public tables | **258** | PASS |
| Companies / members / batches | **30** / **21** / **18** | PASS |
| `company_role` enum | `owner, admin, legal, marketing, viewer` | PASS — unchanged |
| Membership roles held | **21 × `owner`**, nothing else | Expected; the reason two guards refuse rather than abstain |
| Batch statuses | 7 released, 4 rejected, 3 `qc_pending`, 2 `hold`, 2 `qc_in_progress` | PASS |
| Finished-product QC results | **0** | Expected — no batch is releasable on data alone |
| Audit entries / unhashed / `CHAIN_REANCHOR` | **194** / **57** / **1** | PASS — the documented history, intact |
| `audit_logs` triggers | only `trg_prevent_audit_log_deletion` | **Expected before deployment**; the three block triggers arrive with `20261116000000` |
| `entity_current_state` write grants to app roles | **0** | PASS |
| Transition into `released` | one row: `batch_record`, `qc_in_progress → released`, `release`, **`requires_signature = false`** | **Expected before deployment.** All four of `20261107000000`'s match conditions hold, so its `UPDATE` will match exactly one row |
| `material_certificates_of_analysis` | **0 rows, 0 verified** | The membership-only CoA hole has **never been exercised**; no data remediation needed |
| `material_coa_verify` EXECUTE to `anon` | **false** | PASS |
| `operational_role_assignments`, `product_specifications` | absent | Expected — they arrive with the deployment |
| Organization plan | **`free`** (`tier_free`) | **FAIL — see §12.** No PITR, no downloadable backup. **Decision awaiting approval** |
| Production Postgres | **17.6** | **Now verified.** The 31 migrations and the full suite pass on PostgreSQL 17.6 — [`deployment-rehearsal.md`](deployment-rehearsal.md) §2 |

Of those two, the **Postgres version gap is closed** and the **free
plan remains open**: see [`recovery-readiness.md`](recovery-readiness.md),
where the decision is still marked awaiting approval.

---

## Before you start

| | |
|---|---|
| Project | `ovxfflilbqaxedzovgmz` — confirm it in §0 before trusting anything else |
| Other projects | **Do not connect to any other project.** Nonameyet and Traitwar are out of scope |
| Permissions needed | read access to `public` and `supabase_migrations` |
| Expected duration | a few minutes; every query is bounded |
| When to run | **twice** — once before applying any migration, once after |

Record the output of each section. A section with findings is not a
blocker by itself; it is something to explain before release.

### The verdicts, on one page

Each section below carries its own PASS / FAIL block. This is the
summary, so an operator can see what the run has to produce before
starting it.

| § | Check | PASS | FAIL = do not release |
|---|---|---|---|
| 0 | Identity and position | it is Criateur: 8 of 8 core tables | a core table missing, or a project reference other than `ovxfflilbqaxedzovgmz` |
| 1 | Migration position | 31 outstanding before, 31 applied after (ledger 133 → 138 → 169, incl. 5 repairs) | any applied before, or any outstanding after |
| 2 | **Role assignments** | every live grant of a GMP-critical role carries a signature **or** a recorded explanation | an unexplained `provenance = 'service'` or `rpc`-with-no-signature grant |
| 3 | **Stranded work** | empty immediately after deployment | a row with `still_stranded` and no reassignment or explanation |
| 4 | Outstanding duty decisions | exactly 1 duty row open (sampling); 6 enforced, 1 not | any other count, in either direction |
| 4b | **Policy register** | 6 open decisions; exactly 1 marked `temporary` (the CoA exception) | the register disagrees with the table that enforces it |
| 5 | **Outstanding signatures** | no **released** batch rests on an unsigned verdict | a released batch with `signature_id IS NULL` on a QC result |
| 6 | **Audit immutability** | 3 block triggers present and enabled; findings limited to the 57 known unhashed entries and the 1 `CHAIN_REANCHOR` | a trigger absent or `DISABLED`, or a **contents** mismatch |
| 7 | **Missing specifications** | every product with a batch awaiting release has an approved, effective specification | a batch blocked only for want of a specification nobody has approved |
| 8 | Operational roles | at least one QA Manager appointed per active company, signed | none appointed — the enforcement layer is inert and nothing is releasable |
| 9 | Membership untouched | `company_role` enum unchanged; `company_members` row count unchanged | either changed |
| 10 | **Incoming CoA authorisation** | a member with no quality role is **refused** | the refusal does not fire — the release blocker is back |
| 11 | **Unsigned release attempt** | refused on every path tried | any path moves a batch to `released` without a signature |

The seven in bold are the ones the release brief named explicitly.

---

## §0 — Identity and position

Run first. If this does not match, stop.

```sql
SELECT current_database() AS db,
       (SELECT count(*) FROM information_schema.tables
         WHERE table_schema='public')                        AS public_tables,
       (SELECT count(*) FROM supabase_migrations.schema_migrations)
                                                             AS migrations_applied,
       (SELECT max(version) FROM supabase_migrations.schema_migrations)
                                                             AS latest_applied,
       (SELECT count(*) FROM public.companies)               AS companies;
```

**Expected before deployment:** 258 public tables, 133 migrations,
latest `20261101000000`, 30 companies. Different numbers are not
wrong — they are newer — but they mean `docs/live-readiness.md` is
stale and §7 below matters more.

---

## §1 — Which of this branch's migrations are outstanding

```sql
WITH expected(version) AS (VALUES
  ('20261103000000'),('20261104000000'),('20261105000000'),('20261106000000'),
  ('20261107000000'),('20261108000000'),('20261109000000'),('20261110000000'),
  ('20261111000000'),('20261112000000'),('20261113000000'),('20261114000000'),
  ('20261115000000'),('20261116000000'),('20261117000000'),('20261118000000'),
  ('20261119000000'),('20261120000000'),('20261121000000'),('20261122000000'),
  ('20261123000000'),('20261124000000'),('20261125000000'),('20261126000000'),
  ('20261127000000'),('20261128000000'),('20261129000000'),('20261130000000'),
  ('20261131000000'),('20261201000000'),('20261202000000')
)
SELECT e.version,
       CASE WHEN m.version IS NULL THEN 'OUTSTANDING' ELSE 'applied' END AS state
  FROM expected e
  LEFT JOIN supabase_migrations.schema_migrations m ON m.version = e.version
 ORDER BY e.version;
```

| | |
|---|---|
| **PASS, before deployment** | all **31** rows read `OUTSTANDING`. **Verified live 2026-10-23 21:06 UTC:** 0 migrations applied above the boundary |
| **PASS, after deployment** | all **31** read `applied`, and §§2–12 re-run |
| **FAIL** | any row `applied` in the before pass — the live position is not `20261101000000`, so `docs/live-readiness.md` and `docs/migration-verification.md` §1 are both computed from a stale boundary and must be recomputed before going further |
| **FAIL** | any row `OUTSTANDING` in the after pass — the deployment stopped partway. `docs/migration-verification.md` §6 covers recovery; the boundary is a file, not a half-built table |

### BLOCKER before this check can even be run

**`supabase db push` will refuse to apply anything against production
as it stands.** Five local migration files share a version string with
another file, and the ledger holds one row per version, so the CLI
reports `DbPushMissingRemoteError` and stops before the first
migration. Its suggested remedy, `--include-all`, widens the set from
30 to 35 and then fails on the first of the five because their objects
already exist on the target.

Both failures were reproduced with the real CLI, and production was
confirmed read-only to hold the first file of each pair in its ledger
and the five migrations' objects in its schema. Full evidence and the
fix in [`deployment-rehearsal.md`](deployment-rehearsal.md) §3.

The fix is a repository change (rename five files) plus five
`supabase migration repair --status applied` calls, which **write to
the production ledger and need approval.** Do not start the
deployment window before it is done.

Only 21 of these 31 are new on this branch. The first ten
(`20261103000000`…`20261112000000`) are already on `main` and are
**also** unapplied live, and most of what the branch builds on arrives
in them — so the branch cannot be deployed without them. See
`docs/migration-verification.md` §§1–2.

---

## §2 — Unsigned service-context role grants

**Mandatory. A non-empty result is a finding to explain, not a list to
skim.**

```sql
SELECT co.name AS company, g.*
  FROM public.companies co,
       LATERAL public.operational_role_unsigned_grants(co.id) g
 WHERE g.still_live
 ORDER BY co.name, g.assigned_at;
```

Every row is an operational role somebody holds that **no person
signed for**. The `finding` column says which kind:

| `provenance` | Means |
|---|---|
| `service` | a migration, seed or scheduler granted it. No password, no second person |
| `bootstrap_self_declared` | a sole owner declared it during initial setup. Authority is declared, **not independently verified** |
| `rpc` with no signature | a GMP-critical grant that reached the table without one — should be impossible after deployment; investigate |

For each row: revoke and re-grant through the signed path, or record
in the quality system why it stands.

**This listing is the entire mitigation for "anyone who can run a
migration can appoint a QA Manager".** Skipping it removes the
mitigation and leaves the residual.

| | |
|---|---|
| **PASS** | the query returns **no rows**; or every row has been revoked and re-granted through the signed path; or every row has a written explanation filed in the quality system, naming the grant and why it stands |
| **FAIL** | any row with `provenance = 'service'` or `bootstrap_self_declared` that nobody has explained. These are roles people hold that no person signed for |
| **FAIL, and investigate before anything else** | a row with `provenance = 'rpc'` and no signature. After deployment that should be impossible — `operational_role_sign()` is required for every GMP-critical grant — so such a row means either the trigger is not firing or the grant predates it |

Also confirm the requirement is still on. Membership of this table
**is** the requirement — a role listed here cannot be granted without
a signature, and the `basis` column says which PM-03 cell put it
there:

```sql
SELECT role, left(basis, 70) AS basis FROM public.gmp_critical_roles
 ORDER BY role;
```

**PASS:** exactly three rows — `compliance_admin`, `qa_manager`,
`qa_officer` — each with a `basis` naming the PM-03 authority it
derives from.

**FAIL:** fewer than three. A role removed from this table can be
granted unsigned, and `20261123000000` is supposed to have made the
table unwritable by any app role, so a missing row means either a
later migration changed it or the REVOKE did not hold. Check §2's
first query for grants made while it was missing.

*Before deployment this query does not exist — the function arrives
with `20261121000000`. Run it in the after pass.*

---

## §3 — Stranded work

```sql
SELECT co.name AS company, w.*
  FROM public.companies co,
       LATERAL public.operational_role_stranded_work(co.id) w
 WHERE w.still_stranded
 ORDER BY co.name, w.last_acted_at;
```

Unfinished records whose last actor lost an operational role and can
no longer carry on. Each needs either

```sql
SELECT public.stranded_work_reassign(
  '<company>', '<entity_type>', '<entity_id>', '<to_user>', '<reason>');
```

to somebody who can act in that section, or a recorded explanation.

| | |
|---|---|
| **PASS, after deployment** | **empty.** No role has been revoked yet, so nothing can be stranded |
| **PASS, later** | every row either reassigned through `stranded_work_reassign()` — which records who authorised it and why — or carrying a written explanation. Rows appearing later are the mechanism working, not a defect |
| **FAIL** | a row with `still_stranded` that has been sitting since before the last release, with neither a reassignment nor an explanation. That is unfinished regulated work with nobody accountable for it |
| **FAIL** | a non-empty result in the **after-deployment** pass. The table deploys empty and no revocation has happened, so rows here mean the report is reading something other than what it is meant to |

Reassignment preserves the original attribution: the first actor stays
on the record and the reassignment is a new row, not an edit. If a row
here was reassigned by overwriting the original actor instead, that is
a finding in its own right.

*Arrives with `20261124000000`.*

---

## §4 — Outstanding duty decisions

```sql
SELECT * FROM public.duty_decisions_outstanding();
```

**Expected: exactly one row — sampling versus testing.** Anything else
means the database and the approved decisions have drifted.

Cross-check the enforced set:

```sql
SELECT scope, duty_a, duty_b, enforced, decision_status, authority,
       left(coalesce(approved_reference,''), 60) AS reference
  FROM public.duty_conflicts
 ORDER BY scope, duty_a, duty_b;
```

| | |
|---|---|
| **PASS** | `duty_decisions_outstanding()` returns **exactly one row**, and it is sampling versus testing. `duty_conflicts` has **6 enforced, 1 not** — five `derived_from_pm03`, one (`coa_verification`/`disposition`) `approved_by_quality` with a reference |
| **FAIL** | more than one outstanding row — a decision was reopened, or a new pair was added without being approved |
| **FAIL** | fewer than 6 enforced — **a control was switched off.** Check which, and against what approval |
| **FAIL** | a row with `authority = 'derived_from_pm03'` that PM-03 does not in fact derive. `20261128000000` asserts this at migration time, so a live failure here means PM-03 was edited afterwards |

See `docs/decision-note-coa-separation.md`.

*Arrives with `20261125000000` / `20261128000000`.*

---

## §4b — The policy register

One query for every policy decision that is still open, whatever kind
of open it is. This replaces reading three tables and a document.

```sql
SELECT key, state, enforced, temporary, left(needs, 80) AS needs
  FROM public.policy_decisions_outstanding();
```

| | |
|---|---|
| **PASS** | **6 rows**, and exactly **one** has `temporary = true`: `coa_verification_vs_disposition`. It sorts first |
| **PASS** | three rows `enforced_pending_confirmation` (the CoA exception and specification Decisions A and B), one `awaiting_decision` (sampling), two `awaiting_procedure` (the material-test and batch-execution-close signatures) |
| **FAIL** | `coa_verification_vs_disposition` absent, or `temporary = false`. Option B was accepted as a **temporary** release exception; a register that stops saying so is how an exception becomes the design |
| **FAIL** | any row where `state LIKE 'awaiting_%'` and `enforced = true`, or `state = 'enforced_pending_confirmation'` and `enforced = false`. The register has drifted from the table that enforces it, and it is believed, so drift is worse than absence |
| **FAIL** | more than one `temporary` row. A second temporary exception was accepted without passing through this document |

**The CoA exception is not a control that is off.** The duty conflict
is enforced and biting — §4's count of 6 includes it. What is
temporary is that PM-03 is not redrawn to match it and no verification
screen was built. Closing it means the Option A work in
`docs/decision-note-coa-separation.md` §7.

*Arrives with `20261131000000`.*

---

## §5 — Unsigned quality verdicts

```sql
SELECT b.company_id, q.batch_id, b.batch_number, q.test_name,
       q.result, q.pass, q.tested_by, q.tested_at
  FROM public.batch_qc_results q
  JOIN public.batch_records b ON b.id = q.batch_id
 WHERE q.signature_id IS NULL
 ORDER BY q.tested_at DESC;
```

Finished-product verdicts nobody signed for. After deployment the
application cannot create one; rows here are seeds, migrations, or
results recorded before the control existed.

**A released batch resting on an unsigned verdict is a finding.** To
find those specifically:

```sql
SELECT b.batch_number, b.status, b.released_at, q.test_name, q.pass
  FROM public.batch_records b
  JOIN public.batch_qc_results q ON q.batch_id = b.id
 WHERE b.status = 'released' AND q.signature_id IS NULL
 ORDER BY b.released_at DESC;
```

And the two signature requirements still held pending policy:

```sql
SELECT action_key, required, decision_status, left(basis, 70) AS basis
  FROM public.signed_quality_actions ORDER BY action_key;
```

| | |
|---|---|
| **PASS** | **no released batch** rests on an unsigned QC verdict — the second query returns empty |
| **PASS** | `batch_qc_result` is `required = true` / `enforced`; `material_test_result` and `batch_execution_close` are `required = false` / `awaiting_procedure`. Three rows, no more |
| **Explain, do not block** | unsigned verdicts on batches that are **not** released. These are seeds, migrations, or results recorded before the control existed. They cannot be signed retrospectively — a signature means somebody attested at a moment, and backdating one is the forgery the control exists to prevent. Record which they are and that they predate the requirement |
| **FAIL** | a **released** batch with `signature_id IS NULL` on any QC result. The release decision rests on a verdict nobody attested to. Do not sign it after the fact; record the finding and decide whether the release stands |
| **FAIL** | `batch_qc_result` reads `required = false` — the finished-product verdict requirement was switched off |
| **FAIL** | either held action reads `required = true` without an approval recorded in `policy_decisions`. Those two are pending a procedural answer the site has not given (§4b); switching one on without it is inventing the requirement |

See `docs/separation-of-duties.md` §5.5.

*Arrives with `20261127000000`.*

---

## §6 — Audit-chain findings

Three separate questions. Run all three.

### 6a. Are the immutability controls present?

```sql
SELECT t.tgname,
       CASE t.tgenabled WHEN 'D' THEN 'DISABLED' ELSE 'enabled' END AS state
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relname = 'audit_logs' AND NOT t.tgisinternal
 ORDER BY t.tgname;
```

**Before deployment, expect only `trg_prevent_audit_log_deletion`** —
`20260225000000` is recorded as applied and its triggers are absent.
**After, expect `trg_block_audit_update`, `trg_block_audit_delete` and
`trg_block_audit_truncate` as well**, all enabled.

### 6b. Entries, hashes and the re-anchor

```sql
SELECT count(*)                                       AS entries,
       count(*) FILTER (WHERE integrity_hash IS NOT NULL) AS hashed,
       count(*) FILTER (WHERE integrity_hash IS NULL)     AS unhashed,
       count(*) FILTER (WHERE action = 'CHAIN_REANCHOR')  AS reanchor_entries,
       count(DISTINCT company_id)                     AS companies
  FROM public.audit_logs;
```

**Known and expected:** 57 unhashed entries and 1 `CHAIN_REANCHOR`
row. Both are documented in `docs/audit-threat-model.md` §4 and are
**left in place deliberately**. Do not compute hashes for the
unhashed entries and do not remove the re-anchor row — rewriting
history to tidy a rewrite of history is the same act twice.

### 6c. Does the chain verify?

```sql
SELECT co.name, v.*
  FROM public.companies co,
       LATERAL public.verify_audit_chain(co.id) v
 ORDER BY co.name;
```

Expect `unsealed` / `unhashed` findings corresponding to 6b.

### Audit immutability — the verdict

| | |
|---|---|
| **PASS, 6a** | all four triggers present and **enabled**: `trg_prevent_audit_log_deletion`, `trg_block_audit_update`, `trg_block_audit_delete`, `trg_block_audit_truncate` |
| **PASS, 6b** | **57 unhashed** entries and **exactly 1** `CHAIN_REANCHOR` row — the documented history, left in place |
| **PASS, 6c** | findings are `unsealed` / `unhashed` only, and their count reconciles with 6b |
| **FAIL** | any of the three block triggers absent, or present with state `DISABLED`. A disabled immutability trigger is worse than a missing one, because the schema looks right |
| **FAIL** | **more** unhashed entries than 6b records. New unhashed entries mean something is writing audit rows past the sealing path |
| **FAIL** | **more than one** `CHAIN_REANCHOR` row. The chain was re-anchored again, which is a second rewrite of history and must be explained before release |
| **FAIL, blocker** | a **contents** mismatch from `verify_audit_chain()`. That is an entry whose recorded hash does not match its own content — tampering or corruption, not a known gap |
| **FAIL** | fewer unhashed entries than 6b records, or no `CHAIN_REANCHOR` row. **Somebody tidied the history.** Do not treat a cleaner result as an improvement: the 57 and the re-anchor are the evidence that a rewrite happened, and removing them removes the evidence |

That last row is the one to read twice. The instruction throughout has
been to preserve this history, including the parts of it that look
untidy. Do not compute hashes for the unhashed entries and do not
delete the re-anchor row.

---

## §7 — Missing specifications and batches awaiting release

### 7a. What is waiting

```sql
SELECT status, count(*) AS batches
  FROM public.batch_records GROUP BY status ORDER BY 2 DESC;
```

**Snapshot of 2026-10-23:** 7 released, 4 rejected, 3 `qc_pending`,
2 `hold`, 2 `qc_in_progress`. The `qc_in_progress` ones are those
immediately blocked by the specification gate.

### 7b. Which products need a specification

```sql
SELECT p.id, p.trade_name, p.status,
       count(b.id) FILTER (WHERE b.status NOT IN ('released','rejected','archived'))
         AS open_batches,
       min(b.manufacturing_date) FILTER (WHERE b.status NOT IN ('released','rejected','archived'))
         AS earliest_open_manufacture,
       (SELECT count(*) FROM public.product_specifications s
         WHERE s.product_id = p.id AND s.status IN ('effective','superseded'))
         AS approved_specifications
  FROM public.products p
  LEFT JOIN public.batch_records b ON b.product_id = p.id
 GROUP BY p.id, p.trade_name, p.status
HAVING count(b.id) > 0
 ORDER BY open_batches DESC;
```

`earliest_open_manufacture` is the date each specification's
`effective_date` must reach back to. **A product with open batches and
zero approved specifications cannot release any of them.**

### 7c. Why a specific batch is blocked

```sql
SELECT b.batch_number, public.batch_release_block_reason(b.id) AS blocked_because
  FROM public.batch_records b
 WHERE b.status NOT IN ('released','rejected','archived')
 ORDER BY b.manufacturing_date;
```

NULL means nothing in the gate objects.

### 7d. Finished-product QC data

```sql
SELECT count(*) AS finished_qc_results FROM public.batch_qc_results;
```

**Snapshot: 0.** A specification alone will not release a batch that
has no results against it.

### Missing specifications — the verdict

| | |
|---|---|
| **PASS** | every product in 7b with `open_batches > 0` has `approved_specifications >= 1`, and that specification's `effective_date` reaches back to `earliest_open_manufacture` |
| **PASS** | 7c returns NULL — nothing in the gate objects — for every batch intended for release in this round |
| **Expected, not a failure** | immediately after deployment, **zero** approved specifications and every open batch blocked. Nothing is back-filled: approving a specification is a signed quality act and a migration cannot perform one. See `docs/specification-backfill-plan.md` |
| **FAIL** | a batch whose only block reason is a missing specification, **and** somebody intends to release it this round. Approve the specification through the signed path first; do not switch the gate off |
| **FAIL** | a specification whose `effective_date` was set **later** than a batch it is meant to govern. Decision B stamps the version effective at manufacture, so a specification that post-dates the batch does not govern it and the gate will keep refusing — correctly |
| **FAIL, do not work around** | a batch with 0 finished-product QC results that somebody wants released. There is nothing to judge it against. This is not a gate to be loosened |

The specification gate refusing everything on day one is the control
working, not a deployment defect. What turns it off is step 7 of
`docs/migration-verification.md` §7: a QA Manager approving real
specifications.

---

## §8 — Operational roles

```sql
SELECT (SELECT count(*) FROM public.operational_role_assignments
         WHERE revoked_at IS NULL)                        AS live_assignments,
       (SELECT count(DISTINCT user_id) FROM public.operational_role_assignments
         WHERE revoked_at IS NULL)                        AS people_with_a_role,
       (SELECT count(*) FROM public.operational_role_assignments
         WHERE revoked_at IS NULL AND role = 'qa_manager') AS qa_managers,
       (SELECT legacy_membership_bridge
          FROM public.work_role_resolution)               AS bridge_on;
```

**Immediately after deployment: all zero.** The table deploys empty
and nothing is back-filled — inventing an assignment would assert an
authority nobody granted.

**Until `qa_managers` is at least 1, no specification can be approved
and no batch can be released.** And until anybody holds a role, every
PM-03 guard abstains: the controls are installed, exercised on every
write, and silent.

Companies that cannot appoint anybody, because nobody may assign
themselves a role:

```sql
SELECT company_id, count(*) AS active_members
  FROM public.company_members
 WHERE coalesce(status::text,'active') = 'active'
 GROUP BY 1 HAVING count(*) < 2;
```

Each needs `operational_role_bootstrap(...)`, which is self-declared,
signed, permanently marked and reported by §2.

### Role assignments — the verdict

| | |
|---|---|
| **PASS, immediately after deployment** | all four figures zero, `bridge_on` as `20261119000000` left it. The register deploys empty because inventing an assignment would assert an authority nobody granted |
| **PASS, before go-live** | `qa_managers >= 1` for every company that intends to release anything, every live assignment carries a grant signature (§2 empty), and no assignment names the same person as both grantor and grantee outside a recorded bootstrap |
| **FAIL** | `qa_managers = 0` while somebody expects to approve a specification or release a batch. Nothing will work, and the reason will look like a bug rather than a missing appointment |
| **FAIL** | a live assignment of `qa_manager`, `qa_officer` or `compliance_admin` with no `grant_signature_id` and no `provenance` explaining why — that is §2's finding, restated from the other side |
| **FAIL** | a person holding two roles whose Act cells collide on a duty pair in `duty_conflicts`. This is **allowed** by the role model — multiple roles are the point — but it means that person will be refused at the second step of a pair, so somebody else must be available for it. A single-person workspace holding every role can perform no separated duty at all. Check it now rather than discovering it at a release |
| **Explain** | any `provenance = 'bootstrap_self_declared'` grant. Authority is declared, not independently verified; in a workspace of one there is no second party. The compensating control is the regulatory submission, not the database |

---

## §9 — Membership is untouched

A safety check, not a finding. Confirms the deployment did what it
said.

```sql
SELECT format_type(a.atttypid, a.atttypmod) AS role_column_type,
       (SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder)
          FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'company_role')  AS enum_values,
       (SELECT count(*) FROM public.company_members) AS members
  FROM pg_attribute a
 WHERE a.attrelid = 'public.company_members'::regclass AND a.attname = 'role';
```

**Expected, before and after, unchanged:** `company_role`, with
`owner, admin, legal, marketing, viewer`, and the same member count.
No migration on this branch alters the enum or the table — verified
against the branch, not assumed.

| | |
|---|---|
| **PASS** | `company_role`, exactly `owner, admin, legal, marketing, viewer`, and the member count unchanged from the before pass |
| **FAIL** | the enum gained a value. `20261119000000` deliberately left `company_members.role` alone and added a separate register, so a new enum value came from somewhere else |
| **FAIL** | the member count changed across the deployment. No migration on this branch writes to `company_members` |

---

## §10 — Incoming CoA authorisation

**The release blocker found on 2026-10-23, and the check that it is
closed.**

Before `20261130000000`, `material_coa_verify()` checked company
membership and nothing else. It is `SECURITY DEFINER` with `EXECUTE`
granted to `authenticated`, so **any signed-in member of a company
could record a verification of an incoming supplier certificate** — a
storekeeper, a viewer, anyone. The material disposition gate reads
`material_certificates_of_analysis.verified_by`, so such a
verification both recorded a quality judgement nobody was entitled to
make and created a duty conflict against the person who made it.

This is settled read-only, which is why it is a check and not a
drill. `material_coa_verify_authority_error()` is `STABLE` and returns
the refusal reason without writing anything:

```sql
--  For every active member of every company: may they verify an
--  incoming certificate, and do they hold a quality role?
SELECT co.name AS company,
       p.full_name,
       --  app_work_roles returns an EMPTY ARRAY, not NULL, for
       --  somebody holding nothing — so nullif, not coalesce alone.
       coalesce(nullif(array_to_string(
                  public.app_work_roles(co.id, m.user_id), ', '), ''),
                '(no operational role)')                       AS roles_held,
       public.app_section_access(co.id, 'qc_testing',     m.user_id) AS qc_testing,
       public.app_section_access(co.id, 'qa_disposition', m.user_id) AS qa_disposition,
       CASE WHEN public.material_coa_verify_authority_error(co.id, m.user_id) IS NULL
            THEN 'MAY VERIFY' ELSE 'refused' END               AS verdict
  FROM public.company_members m
  JOIN public.companies co ON co.id = m.company_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
 WHERE coalesce(m.status::text,'active') = 'active'
 ORDER BY co.name, verdict DESC, p.full_name;
```

| | |
|---|---|
| **PASS** | every row reading `MAY VERIFY` has `act` in `qc_testing` **or** `qa_disposition`. Every row with `(no operational role)` reads `refused` |
| **PASS** | the trigger is present: `trg_material_coa_verification_authority` on `material_certificates_of_analysis` |
| **FAIL, release blocker** | any row with `(no operational role)` reading `MAY VERIFY`. The membership-only hole is back — the authority function is abstaining where it must refuse |
| **FAIL, release blocker** | the trigger is absent or `DISABLED`. The RPC's guard lives in the trigger precisely so a direct `UPDATE` meets the same refusal; without it, writing `verification_status` and `verified_by` by hand bypasses everything |

Confirm the trigger and the grants:

```sql
SELECT t.tgname,
       CASE t.tgenabled WHEN 'D' THEN 'DISABLED' ELSE 'enabled' END AS state
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relname = 'material_certificates_of_analysis' AND NOT t.tgisinternal
 ORDER BY t.tgname;

SELECT has_function_privilege('anon',
         'public.material_coa_verify(uuid)','EXECUTE')          AS anon_may,
       has_function_privilege('authenticated',
         'public.material_coa_verify(uuid)','EXECUTE')          AS authenticated_may;
```

**PASS:** `anon_may` is `false`; `authenticated_may` is `true` — and
the authority check above is what makes that safe.
**FAIL:** `anon_may` is `true`. An unauthenticated caller could reach
the RPC, and membership would be the only thing between them and a
verified certificate.

**Filing a certificate is deliberately still open to any member.**
Uploading the supplier's document, correcting its path or recording
its number are clerical. Only setting `verification_status` or
`verified_by` is the quality judgement. If an operator reports that
goods-in can no longer attach certificates, that is a defect, not this
control.

*Arrives with `20261130000000`.*

### Production is NOT protected by this correction yet

Stated plainly because it is easy to misread the local evidence:

| | |
|---|---|
| **Live state, 2026-10-23** | `material_coa_verify(uuid)` exists on production with `EXECUTE` to `authenticated`, and **its only authorisation is company membership.** `20261130000000` is unapplied |
| **Live exposure** | `material_certificates_of_analysis` holds **0 rows, 0 verified** — the gap has never been exercised, so there is no unauthorised verification to investigate and no data to remediate |
| **When protection begins** | when `20261130000000` is applied **and** the two tests below pass against `ovxfflilbqaxedzovgmz` |

Until both have happened, no document, report or conversation should
describe production as protected against unauthorised CoA
verification. The local suite passing is not that.

### 10a. Post-deployment NEGATIVE test — a member with no quality role

Read-only, and conclusive on its own:
`material_coa_verify_authority_error()` is `STABLE` and returns the
refusal reason without writing.

```sql
--  Pick any active member who holds no operational role, in any
--  company, and ask whether they may verify.
WITH candidate AS (
  SELECT m.company_id, m.user_id
    FROM public.company_members m
   WHERE coalesce(m.status::text,'active') = 'active'
     AND coalesce(array_length(public.app_work_roles(m.company_id, m.user_id), 1), 0) = 0
   LIMIT 1
)
SELECT c.company_id, c.user_id,
       coalesce(array_to_string(public.app_work_roles(c.company_id,c.user_id), ', '),
                '(none)')                                           AS roles_held,
       public.app_section_access(c.company_id,'qc_testing',     c.user_id) AS qc_testing,
       public.app_section_access(c.company_id,'qa_disposition', c.user_id) AS qa_disposition,
       public.material_coa_verify_authority_error(c.company_id, c.user_id) AS refusal
  FROM candidate c;
```

| | |
|---|---|
| **PASS** | `refusal` begins `COA_VERIFY_FORBIDDEN:` and names "QC testing or QA disposition". `roles_held` is `(none)` and both access columns are null or `none` |
| **FAIL, release blocker** | `refusal` is **null**. A member with no quality role may verify, and the correction is not in force |
| **Inconclusive** | the query returns no rows — every active member holds a role. Then pick a member whose roles give Act on neither column (a storekeeper or production supervisor) and run the same three expressions for them |

Then confirm the guard is where it has to be, so that a direct write
meets the same refusal as the RPC:

```sql
SELECT t.tgname,
       CASE t.tgenabled WHEN 'D' THEN 'DISABLED' ELSE 'enabled' END AS state
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relname = 'material_certificates_of_analysis'
   AND NOT t.tgisinternal
 ORDER BY t.tgname;
```

**PASS:** `trg_material_coa_verification_authority` present and
**enabled**.
**FAIL, release blocker:** absent or `DISABLED` — the RPC's guard
lives in that trigger precisely so `UPDATE … SET verification_status`
cannot go round it.

### 10b. Post-deployment POSITIVE test — the quality roles still can

A control that refuses everybody is an outage, not a control. **This
test matters as much as the negative one** and is the reason a blanket
`REVOKE` was not the fix.

```sql
--  Every active member who holds Act on either quality column should
--  be permitted. Expect zero rows: anyone listed here is a quality
--  role being wrongly refused.
SELECT co.name AS company, p.full_name,
       array_to_string(public.app_work_roles(co.id, m.user_id), ', ') AS roles_held,
       public.app_section_access(co.id,'qc_testing',     m.user_id)   AS qc_testing,
       public.app_section_access(co.id,'qa_disposition', m.user_id)   AS qa_disposition,
       public.material_coa_verify_authority_error(co.id, m.user_id)    AS wrongly_refused
  FROM public.company_members m
  JOIN public.companies co ON co.id = m.company_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
 WHERE coalesce(m.status::text,'active') = 'active'
   AND (public.app_section_access(co.id,'qc_testing',     m.user_id) = 'act'
     OR public.app_section_access(co.id,'qa_disposition', m.user_id) = 'act')
   AND public.material_coa_verify_authority_error(co.id, m.user_id) IS NOT NULL;
```

| | |
|---|---|
| **PASS** | **zero rows.** Everyone with Act on a quality column is permitted |
| **FAIL** | any row. A QC Analyst, QA Officer or QA Manager is being refused work they are entitled to — a functional regression, not a security finding, and it will be reported as "the CoA check is broken" |

**Expected immediately after deployment: the negative test passes and
the positive test returns zero rows trivially**, because no
operational role has been appointed yet, so nobody holds Act on
anything. Re-run **both** after roles are appointed (§8) — that is the
first moment the positive test means something.

### 10c. And the duty conflict it must not have weakened

```sql
SELECT enforced, authority, left(approved_reference, 60) AS reference
  FROM public.duty_conflicts
 WHERE scope='material_lot' AND duty_a='coa_verification' AND duty_b='disposition';
```

**PASS:** `enforced = true`, `authority = approved_by_quality`, with a
reference. Narrowing *who may verify* must not narrow *what verifying
costs them*: whoever verifies a lot's certificate is still refused
that lot's disposition.
**FAIL:** `enforced = false`, or no row.

---

## §11 — Unsigned release attempt

A batch must not reach `released` without an electronic signature.

### The one query to run

```sql
SELECT coalesce(public.batch_release_signature_postcondition(), 'PASS') AS verdict;
```

| | |
|---|---|
| **PASS** | the word `PASS` |
| **FAIL, release blocker** | anything else. The return value *is* the finding, in words: `MISSING`, `AMBIGUOUS`, `MISMATCHED`, `UNSIGNED` or `BYPASSABLE` |

**Why a function and not the obvious query.** The natural check —
"select the transitions into `released`" — returns **zero rows** when
the transition is missing or misnamed, and an operator reading
`(0 rows)` ticks the box. That is precisely the failure this section
exists to catch, so it is reported as the word `MISSING` instead,
which cannot be misread as a pass. The function is `STABLE` and
read-only.

`20261201000000` also asserts the same condition at deployment time
and **refuses to apply** if it does not hold, so a deployment that
completes has already proven this once. Run it anyway: the deployment
proves it at one instant, and this proves it now.

*Arrives with `20261201000000`. Before deployment, use the three
queries below.*

### The underlying readings

Use these before deployment, or to diagnose a non-`PASS` verdict.

```sql
--  (a) Which transitions reach `released`, and which demand a
--  signature. Only one transition should reach it at all.
--
--  The entity type is `batch_record`, not `batch`, and the transition
--  table stores state IDs rather than keys — hence the joins.
SELECT d.entity_type,
       fs.state_key AS from_state,
       ts.state_key AS to_state,
       t.action_key,
       t.requires_signature
  FROM public.lifecycle_transitions t
  JOIN public.lifecycle_definitions d ON d.id = t.definition_id
  JOIN public.lifecycle_states fs     ON fs.id = t.from_state_id
  JOIN public.lifecycle_states ts     ON ts.id = t.to_state_id
 WHERE ts.state_key = 'released'
 ORDER BY d.entity_type, fs.state_key;

--  (b) Can an application role write the state table directly?
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema='public' AND table_name='entity_current_state'
   AND grantee IN ('anon','authenticated')
 ORDER BY grantee, privilege_type;

--  (c) Is the status column still derived rather than writable?
SELECT t.tgname,
       CASE t.tgenabled WHEN 'D' THEN 'DISABLED' ELSE 'enabled' END AS state
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relname = 'batch_records' AND NOT t.tgisinternal
   AND t.tgname LIKE '%status%'
 ORDER BY t.tgname;
```

| | |
|---|---|
| **PASS, (a)** | **exactly one** row: `batch_record`, `qc_in_progress → released`, action `release`, `requires_signature` **`true`** |
| **PASS, (b)** | **no `INSERT`, `UPDATE` or `DELETE`** granted to `anon` or `authenticated`. Six rows are expected — `SELECT`, `REFERENCES` and `TRIGGER` for each of the two roles — and none of those three can change a row |
| **PASS, (c)** | `trg_batch_records_guard_status` present and **enabled**, so `batch_records.status` stays derived from the lifecycle engine |
| **FAIL, release blocker** | `requires_signature` is **`false`** on the release transition. `lifecycle_transition()` then never calls `lifecycle_consume_signature`, so `p_signature_id` is ignored entirely and **any permitted caller can release a batch without signing**. See the note below — this is the state production is in today |
| **FAIL, release blocker** | a second transition reaches `released`, especially one with `requires_signature = false`. That is a second door into the same state, and the signature requirement is attached to transitions, not to the state |
| **FAIL, release blocker** | `authenticated` holds `UPDATE` on `entity_current_state`. The state could then be written directly, skipping the engine and its signature check |

### What `requires_signature = false` actually means, and why production reads it

`20261107000000` is the migration that sets `requires_signature =
true`, and it sets it for **one** transition only —
`qc_in_progress → released`. That migration is **unapplied on
production**, which is why production reads `false`.

**Confirmed live, 2026-10-23 21:06 UTC**, and this resolves the risk
the rest of this section was written about:

| entity_type | from_state | to_state | action_key | requires_signature |
|---|---|---|---|---|
| `batch_record` | `qc_in_progress` | `released` | `release` | **false** |

One row, and **all four of the migration's match conditions are
satisfied**, so its `UPDATE` will match exactly one row. The
silent-zero-rows hazard described below is ruled out by measurement
for this deployment. Re-check after deploying anyway — that is what
the function above is for.

It also means something plainer: **production permits an unsigned
batch release today.** Seven batches are already released under that
condition. The deployment is what installs the requirement; it cannot
retroactively attest to releases made before it.

So the `false` reading on production today is **not a bypass in a
deployed control**. It is the absence of the control, and deploying
the migration set is what installs it. Read in the **before** pass,
`false` is expected. Read in the **after** pass, `false` is a
blocker.

**The subtle failure to watch for.** `20261107000000` sets the flag
with an `UPDATE` matched on `from_state = 'qc_in_progress'`,
`to_state = 'released'`, `action = 'release'`. If production's
transition row differs in any of those three values, **the `UPDATE`
matches zero rows and reports success**, and the signature
requirement is silently absent afterwards. Query (a) in the after pass
is what catches that, and it is the single most important line in this
section. The local schema was verified to have exactly one matching
transition; **production's transition rows have not been compared.**

### The active demonstration, if you want one

Queries (a)–(c) are conclusive and read-only, and are enough. If a
reviewer wants the refusal demonstrated rather than inferred, it can
only be done by attempting it — which means **this document's
read-only guarantee stops here.** Do it inside a transaction that is
rolled back, on a batch the gate does not otherwise object to, and
read the result before committing anything:

```sql
BEGIN;
  --  Pick a batch the gate has no other objection to, so a refusal
  --  can only be about the signature.
  SELECT b.id, b.batch_number,
         coalesce(public.batch_release_block_reason(b.id),'(none)') AS gate_objection
    FROM public.batch_records b
   WHERE b.status = 'qc_in_progress'
   ORDER BY b.manufacturing_date;

  --  Then, as a QA Manager, with no signature. The entity type is
  --  `batch_record`:
  --    SELECT public.lifecycle_transition(
  --             'batch_record','<batch id>','release','<company id>');
ROLLBACK;
```

**PASS:** it raises `LIFECYCLE_SIGNATURE_REQUIRED`.
**FAIL, release blocker:** the batch moves to `released`.

`ROLLBACK`, not `COMMIT`, and do not leave the transaction open — an
idle transaction holds locks on `batch_records`. On the local schema
all three routes were tried (the engine with no signature, a direct
`UPDATE` on `entity_current_state`, a direct `UPDATE` on
`batch_records.status`) and all three were refused, with the batch
still `qc_in_progress` afterwards.

---

## §12 — Backup and recovery, before anything is applied

**Run this before the deployment, not as part of verifying it.** It is
the one check whose failure stops the deployment from starting rather
than from finishing.

Not a SQL query — a plan and billing question:

| | |
|---|---|
| Organization | `lgcbbmkiywvcpuffkszy` ("Compliance") |
| Checked | **2026-10-23**, Supabase Management API |
| Plan | **`free`** (`tier_free`) |

| | |
|---|---|
| **PASS** | either (a) the plan is Pro or above **and** the PITR add-on is enabled with a window covering the deployment; or (b) a `supabase db dump` has been taken, held off-site, **and test-restored into a scratch database** |
| **Status** | **AWAITING APPROVAL.** The two options are compared, and the restore procedure plus its 16-check verification script are tested, in [`recovery-readiness.md`](recovery-readiness.md). No dump of this project has been taken and no plan change has been made |
| **Note** | Taking the Option A dump needs a **PostgreSQL 17** `pg_dump`. Demonstrated: a PG16 client refuses outright (`aborting because of server version mismatch; server version: 17.6; pg_dump version: 16.2`), so an operator on a PG16 toolchain cannot back this project up at all |
| **FAIL — as read on 2026-10-23** | the project is on the free plan. Supabase's documentation is explicit: daily backups cover "Pro, Team, and Enterprise Plan projects", "database backups are **not available for download for Free Plan projects**", and PITR is a paid per-project add-on. **There is no automated backup, no downloadable backup and no PITR for this project.** |

Combined with the fact that **no migration in this repository has a
down-migration**, the position is:

> A 30-migration deployment to this project currently has **no
> rollback path of any kind.**

Resolve it one of two ways before applying anything — see
[`recovery-readiness.md`](recovery-readiness.md), which compares both
options on scope, retention, data-loss window and recovery time, and
records the tested procedure. A dump is the minimum; it is not
equivalent to PITR, and **an untested dump is a hope, not a backup.**

### A separate observation from the same pass

Production holds **7 released batch rows** — which are **four**
distinct batch numbers across three companies, six of them bearing the
marks of seeded demo data — and **0 finished-product QC results**. The
read-only report is [`historical-release-review.md`](historical-release-review.md);
disposition is for the authorised QA process. Those releases were made before the gate in
`20261107000000` and the signature requirement existed, and
`requires_signature` is `false` live today.

**Nothing in this deployment can retroactively attest to them**, and
nothing should try: a signature means somebody attested at a moment,
and creating one afterwards is the forgery the control exists to
prevent. Record the seven as predating the control. Whether they need
anything further is a quality decision, not a software one.

---

## Recording the result

| Section | Run? | Findings | Explained / actioned |
|---|---|---|---|
| §0 identity | ☐ | | |
| §1 migrations | ☐ | | |
| §2 unsigned grants | ☐ | | |
| §3 stranded work | ☐ | | |
| §4 duty decisions | ☐ | | |
| §4b policy register | ☐ | | |
| §5 unsigned verdicts | ☐ | | |
| §6 audit chain | ☐ | | |
| §7 specifications and batches | ☐ | | |
| §8 operational roles | ☐ | | |
| §9 membership untouched | ☐ | | |
| §10 incoming CoA authorisation | ☐ | | |
| §11 unsigned release attempt | ☐ | | |
| §12 backup / PITR (**before** applying) | ☐ | | |

Live verification is complete when every box is ticked **against
project `ovxfflilbqaxedzovgmz`** and every finding has an entry in the
last column. Until then it is not complete, however much of the local
suite passes.

### Operator sign-off

Fill this in on the **after** pass. Keep the before-pass evidence
above; do not overwrite it — the two readings together are what show
what the deployment changed.

| | |
|---|---|
| Project ref confirmed | `ovxfflilbqaxedzovgmz` ☐ |
| Backup taken (§12), method | …………………………………………… |
| Backup **test-restored** | ☐ yes ☐ no — if no, do not proceed |
| Deployment started (UTC) | …………………………………………… |
| Deployment finished (UTC) | …………………………………………… |
| Migrations applied, before → after | ……… → ……… (expect **133 → 138** after the 5 ledger repairs, then **→ 169** after the push) |
| `20261201000000` applied without raising | ☐ |
| All 12 sections run and recorded | ☐ |
| Release blockers outstanding | …………………………………………… |
| Name / role | …………………………………………… |
| Date | …………………………………………… |

**Signed by a person, not by a pipeline.** This document records that
somebody with authority looked at a live regulated database and said
what they found. A green CI run is not that, and nothing in this
repository should be read as claiming otherwise.

### What this checklist does not establish

Stated so the sign-off is not read as more than it is:

- It does not make Criateur validated, or compliant with 21 CFR
  Part 11 or any other regulation. It records what a database
  contains.
- It does not confirm the migrations run on production's **data**.
  They are confirmed to run on **PostgreSQL 17.6** — the version
  gap is closed ([`deployment-rehearsal.md`](deployment-rehearsal.md)
  §2) — but on the test fixtures, on x86_64 rather than aarch64, and
  against a schema built locally.
- It does not resolve the open quality decisions. Six remain, one of
  them a temporary exception — §4b, and
  `docs/decision-note-coa-separation.md` §8.

### The four that are release blockers if they fail

Everything above is worth knowing. These four stop a release:

1. **§10** — a member with no quality role reads `MAY VERIFY`, or the
   authority trigger is missing or disabled.
2. **§11** — `requires_signature` is `false` on the release transition
   in the **after** pass, a second transition reaches `released`, or
   `authenticated` holds `UPDATE` on `entity_current_state`.
3. **§6** — a **contents** mismatch in the audit chain, a block
   trigger absent or disabled, or the known history (57 unhashed
   entries, 1 `CHAIN_REANCHOR`) tidied away.
4. **§5** — a **released** batch resting on a QC verdict nobody
   signed.

The rest are findings to explain. §§7 and 8 reading "nothing is
releasable" immediately after deployment is the expected state, not a
failure: the controls are installed and inert until somebody with
authority appoints roles and approves specifications.
