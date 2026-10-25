# Deployment manifest

Every migration that would be applied to `ovxfflilbqaxedzovgmz`, in the
order the tooling applies it, with what it does, what it needs, and
whether the live ledger has it.

---

## Provenance of the "applied" column

**This column is live-verified, not inferred.** Read directly from the
project's own migration ledger:

| | |
|---|---|
| Project | `ovxfflilbqaxedzovgmz` |
| Read at | **2026-10-23 21:06:41 UTC**, from the database's own `now()` |
| Tool | Supabase MCP, `list_migrations` and read-only `SELECT` against `supabase_migrations.schema_migrations` |
| Migrations applied | **133** |
| Latest applied | **`20261101000000`** |
| Applied with version `> 20261101000000` | **0** |
| Production Postgres | **17.6** (`aarch64-unknown-linux-gnu`) |
| Writes performed | **none.** Every statement was a `SELECT` |

Because the count of applied migrations above the boundary is **zero**,
every one of the 31 rows below reads `OUTSTANDING`, and that is a
measured result rather than an assumption.

**Re-read it immediately before deploying.** A ledger position is true
at an instant. The §0/§1 checks in
[`live-verification-checklist.md`](live-verification-checklist.md) are
the same queries.

---

## Scope: 31 migrations

Earlier figures in this repository said 18, 28 and 30. All were
correct when written and all are superseded: the count rose as work
continued. **31 is the final number**, and
[`deployment-plan.md`](deployment-plan.md) is the authoritative source
for the sequence, the ledger states and the postconditions. If any
document disagrees with it, the plan is right.

| | Files | Range |
|---|---|---|
| Already on `main`, **not** live | **10** | `20261103000000` … `20261112000000` |
| New on this branch | **21** | `20261113000000` … `20261202000000` |
| **Total to apply** | **31** | `20261103000000` … `20261202000000` |

The ten already on `main` are not optional. §2 of
[`migration-verification.md`](migration-verification.md) shows that
most of what the branch builds on — PM-03's section grid, the step
permissions, the release gate, the dispatch table — arrives in them.
Deploying the branch alone would fail on the first missing object.

---

## Ordering, validated with the real tool

Not reasoned about. The actual Supabase CLI (**v2.122.0**, the tool
`docs/DATABASE_DEPLOYMENT.md` names) was run against a scratch local
database:

```
supabase db push --db-url <local scratch> --include-all --dry-run
supabase migration list --db-url <local scratch>
```

Findings:

1. **The order is filename order**, and all 31 appear last, in the
   sequence tabulated below.
2. **Four files are silently skipped** by the tool, in every
   environment, because their names carry no version prefix:
   `backfill_automation_platform.sql`,
   `integration_infrastructure_migration.sql`,
   `license_vault_migration.sql`, `profile_system_migration.sql`.
   Pre-existing, not on this branch, and **they have never been
   applied by `db push` anywhere** — worth knowing, because a file
   sitting in `supabase/migrations/` looks deployed and is not.
3. **`20260305_vendor_risk_management.sql`** is accepted with the
   8-digit version `20260305`, sorting before `20260305000000`.
   Pre-existing.

### `20261131000000` — investigated specifically, and left alone

`20261131000000` parses as **2026-11-31**, a date that does not exist.
The question was whether the tool accepts it and sorts it correctly.

**It does both.** Evidence from `supabase migration list`:

```
{"local":"20261130000000", "remote":"", "time":"2026-11-30 00:00:00"}
{"local":"20261131000000", "remote":"", "time":"20261131000000"}   ← raw string
```

The CLI takes the leading digits as an opaque version and does **not**
validate them as a calendar date. When the version happens to parse as
a timestamp it pretty-prints it; when it does not, the `time` field
falls back to the raw string. That is a **display** fallback and
nothing more: the version is well-formed for the tool, `db push` lists
it in the correct final position, and ordering is lexicographic on the
14-character string, where `20261131000000` > `20261130000000`
correctly and any later real timestamp (`20261201000000` and beyond)
sorts after it correctly.

**It is also not unusual in this repository.** Nineteen other
migrations carry impossible timestamps — impossible *hours* rather
than days, `30:00:00` through `80:00:00`, the `HHMMSS` field used as a
within-day sequence number:

```
20260228300000  20260228400000  20260228500000  20260228600000
20260228700000  20260228800000  20260305300000  20260305400000
20260305500000  20260305600000  20260305700000  20260305800000
20260603300000  20260603400000  20260603500000  20260603600000
20260610300000  20260610400000  20260918500000
```

Each shows the same raw-string fallback, and **several are on the live
ledger right now** — `20260228300000`, `20260305300000`,
`20260603300000` and `20260918500000` among them. So the platform has
already accepted and applied this exact shape of version against this
exact project.

**Decision: no rename.** Renaming would change the version string of a
file whose content is unchanged, which is the one thing the brief said
to avoid — it risks a duplicate version if any environment has
recorded the old one, and it would make this branch's history
disagree with itself for a cosmetic gain. The follow-on migration
`20261201000000` uses a valid timestamp, so the convention is correct
going forward without rewriting what exists.

**One residual, recorded not fixed:** the 20 impossible timestamps
display as raw strings in `supabase migration list` and in the
dashboard. Harmless, and tidying it would mean renaming migrations
already applied in production, which is a worse trade.

---

## The manifest

`OUTSTANDING` throughout, live-verified at the timestamp above.
"Needs" lists only the dependencies that are not simply "everything
before it".

### Already on `main`, awaiting deployment

| # | Version | Purpose | Needs | Effect |
|---|---|---|---|---|
| 1 | `20261103000000` | PM-03's five missing sections, added to the request catalogue | — | Rows in the section catalogue. No enforcement yet |
| 2 | `20261104000000` | PM-03's step permissions, enforced by the database | — | Creates `step_permissions`; step guards begin refusing |
| 3 | `20261105000000` | A guard naming a state the lifecycle does not have, and the one PM-03 entity nothing guarded | 2 | Fixes a dead guard; extends cover to CAPA |
| 4 | `20261106000000` | PM-03's **section** grid, enforced, starting with batch execution | 1 | Creates `section_permissions` and `app_section_access` — **the grid everything later reads** |
| 5 | `20261107000000` | Finished QC and batch release as two workflows | 4 | `batch_release_block_reason`; sets `requires_signature` on the release transition |
| 6 | `20261108000000` | The audit chain, computed where the client cannot reach it | — | Server-side sealing; redefines `verify_audit_chain` |
| 7 | `20261109000000` | PM-03's `CoA register` column, enforced | 4 | Section guard on the outgoing certificate register |
| 8 | `20261110000000` | PM-04's individual restrictions, with somewhere to live and teeth | 4 | Creates `access_restrictions`; lowers access per person |
| 9 | `20261111000000` | Where a released batch went — PM-03's `Distribution` column | 4, 5 | Creates `batch_dispatches` |
| 10 | `20261112000000` | Write policies that admit the roles the work is assigned to | 2, 4 | RLS write policies across the quality tables |

### New on this branch

| # | Version | Purpose | Needs | Effect |
|---|---|---|---|---|
| 11 | `20261113000000` | Finished-product specifications, and a release gate that reads them | 4, 5 | Creates `product_specifications`, `product_specification_tests`. **Deploys empty → every open batch blocked until a specification is approved** |
| 12 | `20261114000000` | PM-04 restrictions, on the five steps they did not reach | 2, 8 | Adds `step_permissions.section`; restrictions reach the steps |
| 13 | `20261115000000` | Pre-sealing audit entries, marked for what they are | 6 | Creates `audit_hash_conventions`; **describes** the 57 unhashed entries. Rewrites nothing |
| 14 | `20261116000000` | The audit immutability controls, restored where they went missing | 6 | **Adds the three block triggers that are absent live** (update/delete/truncate) |
| 15 | `20261117000000` | Specification approval: the QA Manager, with evidence | 11 | Signed approval; approver cannot abstain. **Policy pending confirmation (Decision A)** |
| 16 | `20261118000000` | The governing specification, preserved against the batch | 11 | Stamps and locks `batch_records.governing_specification_id`. **Policy pending confirmation (Decision B)** |
| 17 | `20261119000000` | Operational roles, separate from membership | 4 | Creates `operational_role_assignments`, `app_work_roles`; rewrites `app_section_access`. **`company_members.role` untouched.** Deploys empty → guards abstain |
| 18 | `20261120000000` | Separation of duties, per batch | 5, 9, 17 | Creates the duty-conflict register; rewrites the release and dispatch gates |
| 19 | `20261121000000` | Signing a role assignment | 17, 18 | `gmp_critical_roles`; grants of QA/compliance roles need a signature. **Drops two function signatures created by 17** |
| 20 | `20261122000000` | The material chain has the same problem | 18 | **Renames `batch_duty_conflicts` → `duty_conflicts`**; adds material-side duties |
| 21 | `20261123000000` | The rules themselves were writable | 20 | RLS + `REVOKE` on six rule tables. **Closes a real hole: `DELETE FROM duty_conflicts` succeeded as `authenticated`** |
| 22 | `20261124000000` | Work left stranded by a revocation | 17 | `lifecycle_entity_sections`, `stranded_work_reassignments`, revocation notices |
| 23 | `20261125000000` | The six decisions, settled conservatively | 20 | `duty_definitions`; `duty_decisions_outstanding()` |
| 24 | `20261126000000` | The columns the duty guards read, actually written | 17 | Four attribution triggers; server-written actors, frozen. **Prerequisite for 25** |
| 25 | `20261127000000` | Signing a quality verdict | 24 | `signed_quality_actions`; finished-product verdicts need a signature. Two requirements registered and held |
| 26 | `20261128000000` | Separations PM-03 does not derive, approved explicitly | 23 | `authority` + `approved_reference` with CHECKs; enforces Decision 2 |
| 27 | `20261129000000` | The CoA pair was labelled with the wrong column | 26 | Corrects `section_a` to `incoming_coa_verification`. Label only |
| 28 | `20261130000000` | Verifying an incoming certificate needs a quality role | 17, 27 | **Closes the release blocker.** Reserves verification to PM-03's existing `qc_testing`/`qa_disposition` Act holders. No PM-03 change |
| 29 | `20261131000000` | The policy decisions, in one place, with their kind of open | 23, 25, 26 | `policy_decisions` register; Option B recorded `temporary` |
| 30 | `20261201000000` | The batch-release signature requirement, asserted rather than hoped | 5 | **Refuses to apply unless 5's UPDATE actually landed.** Adds `batch_release_signature_postcondition()` |
| 31 | `20261202000000` | The effects five stranded migrations never delivered | — | Adds the absent `policy_acknowledgements` uniqueness constraint and the four absent legal-hold indexes; records why five files are marked applied without execution. **Makes the ledger repairs honest** — [`migration-history-reconciliation.md`](migration-history-reconciliation.md) |

---

## Live preconditions, verified

Read at the timestamp above. These were predictions in
`migration-verification.md` §3 and are now measurements.

| Precondition | Predicted | **Live** | |
|---|---|---|---|
| Applied position | `20261101000000` | `20261101000000` | ✅ |
| Migrations applied | 133 | 133 | ✅ |
| Public tables | 258 | 258 | ✅ |
| Companies | 30 | 30 | ✅ |
| Batch records | 18 | 18 | ✅ |
| Finished-product QC results | 0 | 0 | ✅ |
| `company_role` enum | `owner, admin, legal, marketing, viewer` | identical | ✅ |
| `company_members` rows | 21 | 21 | ✅ |
| Audit entries / unhashed / re-anchor | — / 57 / 1 | 194 / **57** / **1** | ✅ |
| `entity_current_state` write grants to app roles | 0 | **0** | ✅ |
| `operational_role_assignments` | absent | absent | ✅ |
| `product_specifications` | absent | absent | ✅ |

### Four live findings worth stating separately

**1. The release transition matches `20261107000000` exactly.** This
was the open risk — that the migration's four-way `UPDATE` would match
zero rows, report success, and leave the signature requirement
silently absent. Live:

| entity_type | from_state | to_state | action_key | requires_signature |
|---|---|---|---|---|
| `batch_record` | `qc_in_progress` | `released` | `release` | **false** |

One row, and all four match conditions satisfied. **The UPDATE will
match exactly one row.** The hazard is ruled out by measurement.
`requires_signature = false` is the expected pre-deployment reading —
and it means **production permits an unsigned batch release today**.
Deploying is what installs the requirement; `20261201000000` then
refuses to complete if it did not take.

**2. The three audit block triggers are absent live.** Only
`trg_prevent_audit_log_deletion` exists, confirming the documented
finding that `20260225000000` is recorded as applied while its
triggers are gone. `20261116000000` (#14) restores them.

**3. All 21 members hold `owner`.** Measured, not assumed. This is the
fact the no-abstention rules rest on: if specification approval or CoA
verification abstained for untabulated roles, all 21 would be
permitted. Both deliberately refuse instead.

**4. `material_certificates_of_analysis` is empty — 0 rows, 0
verified.** The membership-only CoA hole exists on production (the RPC
is there, `authenticated` holds `EXECUTE`, `anon` does not) but **has
never been exercised.** So #28 needs no data remediation: there is no
unauthorised verification to investigate, and the fix is purely
forward-looking.

### The one gap this manifest cannot close

**Production runs Postgres 17.6. The local verification ran on
Postgres 16.** Every "applies cleanly" result in this repository is a
PG16 result. Nothing in the 31 uses version-specific syntax as far as
review found, and PG17 is backward-compatible for everything they do,
but **that is an argument, not a test.** The honest statement is that
these migrations have been proven to install on PG16 and have never
been executed on PG17.

Mitigation: a scratch PG17 database, or accept it as deployment risk
with `20261201000000` and the checklist as the detection. It is the
largest remaining unverified assumption and it is not resolvable from
here.
