# Migration and data readiness: the Criateur project

What is actually in the live database, what this branch would do to
it, and what has to happen first.

Read-only inspection, **2026-10-23**. Nothing was applied. No row was
written. No migration was run. Every figure below is a snapshot and
**must be re-taken immediately before deployment** with
`scripts/ci/live-readiness-report.sql`, which is the query set this
document was built from and contains nothing but `SELECT`s.

The Supabase MCP server has since dropped out of this session
(`ERR_PROXY_TUNNEL`), so these figures cannot be refreshed from here.

---

## 1. Project identity

The repository names one project reference in four places
(`.env.example`, `supabase/config.toml`, the client bootstrap, and the
deployment doc): **`ovxfflilbqaxedzovgmz`**.

That project's display name is **"my-app"**, which matches nothing.
Identity was therefore confirmed from the schema rather than the
label:

| Check | Result |
|---|---|
| Public tables | 258 |
| Criateur core tables present | **8 of 8** (`companies`, `company_members`, `products`, `batch_records`, `batch_qc_results`, `raw_material_receipts`, `certificate_of_analysis`, `audit_logs`) |
| Companies | 30 |
| Batch records | 18 |
| Lifecycle definitions | match the local set exactly |

It is Criateur. The display name is wrong, not the reference.

The MCP account reachable at the time held exactly two projects:
`ovxfflilbqaxedzovgmz` and `lzuuwdtrivqvccedbivz` ("RentTruth App",
not queried beyond the listing). **Neither Nonameyet nor Traitwar was
present in the account, and neither was queried.**

### Migration position

| | |
|---|---|
| Migrations applied | 133 |
| Latest applied | `20261101000000` |
| Outstanding from this branch | **16** (`20261103000000` … `20261118000000`) |

---

## 2. The blocker: no work role can be assigned

> **Resolved in schema, 2026-10-23.** The analysis below stands as the
> finding. The answer is *not* to extend the enum:
> `20261119000000` leaves `company_members.role` untouched and adds a
> separate `operational_role_assignments` register, since the two
> columns answer different questions. See
> [`docs/operational-role-model.md`](operational-role-model.md).
>
> **What remains is data.** The table deploys empty and nothing is
> back-filled, so until somebody appoints real people, every guard
> still abstains and the enforcement layer is still inert. The three
> questions at the foot of this section are no longer blocking —
> questions 1 and 3 are answered by the model, and question 2 becomes
> "who holds which operational role", which is step 7 of §7.

This is the finding that matters most and it was not anticipated.

`company_members.role` on the live project is **enum `company_role`**,
with values:

```
owner, admin, legal, marketing, viewer
```

**None of the eight PM-03 work roles exists in that enum.** No enum
anywhere in the database contains `qa_manager`. All **21** members
across all companies hold `owner`.

### Why this is fatal to the deployment's purpose

The whole PM-03 layer resolves a member's role and looks it up in
`section_permissions`. A role the grid does not tabulate **abstains** —
`app_section_access` returns NULL, which is the design deliberately
declining to rule rather than refusing. That abstention policy is
correct and documented, and it means:

> Deploy this branch unchanged and every guard abstains for every
> member, because every member holds a role the grid has never heard
> of. The gates would be installed, exercised on every write, and
> silent.

The release gate's own checks (specification, QC results, signature)
would still bite, because they do not depend on the grid. But
separation of duties, section access, the five protected steps and
every PM-04 restriction would do nothing, while appearing to be in
force. That is worse than not deploying them.

### What is needed, and why it is not written

A migration extending `company_role` with the eight work roles, plus
an assignment of real roles to real people. Neither is in this branch,
because writing it means answering questions that are yours:

1. **What happens to the five existing values?** `legacy`, `marketing`
   and `viewer` have no PM-03 column. Do they stay as additional
   values the grid abstains on, or are they mapped?
2. **What happens to the 21 `owner` members?** `owner` is not a PM-03
   role either. If they stay `owner`, nothing changes. If they are
   reassigned, somebody must decide who is the QA Manager — and after
   `20261117000000` that person is the only one who can approve a
   specification.
3. **Is role a single value or a set?** PM-03 reads as one role per
   person. A plant where one person is both QC Analyst and QA Officer
   breaks separation of duties by design, which may be the right
   answer or may mean the model is wrong for the site.

Picking defaults here would be inventing an organisational structure.
**Question for you**, and it blocks a meaningful deployment.

Note that `ALTER TYPE … ADD VALUE` cannot run inside a transaction
block in older PostgreSQL and the new value is not usable in the same
transaction, so the enum extension must be its own migration, applied
and committed before any migration that references the new values.

---

## 3. Products and batches

| | |
|---|---|
| Products | 22 |
| Products in status `concept` | **22 — all of them** |
| Batch records | 18 |
| Batches with no product link | **0** |
| Finished-product QC results (`batch_qc_results`) | **0** |
| Distinct products among non-terminal batches | 7 |

Batches by status:

| Status | Count | Blocked by the new gate? |
|---|---|---|
| `released` | 7 | no — already terminal, left untouched and unstamped |
| `rejected` | 4 | no |
| `qc_pending` | 3 | not yet; will be when they reach release |
| `hold` | 2 | not yet |
| **`qc_in_progress`** | **2** | **yes — these are the ones awaiting release** |

**Two batches are immediately blocked.** That is a small enough number
to prepare deliberately rather than scramble through, which is the
good news in this document.

That every product is still `concept` is worth noticing separately: a
product in `concept` has not been through the registry's own
progression, yet batches have been manufactured against seven of them.
Whether that reflects demonstration data or a real gap in how the
registry is used is not something the schema can tell me.

`batch_qc_results` being **empty** means the specification gate is not
the only thing those two batches will fail — they have no finished-product
test results at all. A specification alone will not release them.

---

## 4. Audit records

| | |
|---|---|
| Entries | 192 |
| With an `integrity_hash` | 135 |
| **With no hash at all** | **57** |
| Companies with entries | 5 |
| `CHAIN_REANCHOR` entries | **1** |

Triggers on `audit_logs` today: **`trg_prevent_audit_log_deletion`
only.** `trg_block_audit_update`, `trg_block_audit_delete`,
`trg_block_audit_truncate` and `fn_block_audit_mutation` are **absent**,
although `20260225000000_immutable_audit_trail` is recorded as applied.

Audit entries on production are UPDATE-able today.

The back-dated `CHAIN_REANCHOR` entry, the script that wrote it, and
the hardcoded anon key that script carried are set out in
[`docs/audit-threat-model.md`](audit-threat-model.md) §4. Summary: it
is left in place, documented, not rewritten; the key needs rotating.

On deployment, `20261115000000` will mark the 135 hashed entries
`legacy-client-v0` and record why they cannot be verified. The 57
unhashed entries are **not** marked — they are reported as a finding,
and no hash will be computed for them.

---

## 5. Other dependencies

| Dependency | Live state | Consequence |
|---|---|---|
| `material_qa_authorities` | **empty** — 0 designated | The pre-Decision-1 approval mechanism had nobody in it. Superseded by `20261117000000` (QA Manager), which is itself blocked by §2. |
| `release` transition `requires_signature` | **false** | The signature check in the release gate is configured off today. Turning it on is a data change, not a migration; it is listed in the deployment steps. |
| `app_section_access`, `step_permissions`, `product_specifications`, `access_restrictions` | do not exist | New in this branch. Nothing to reconcile. |
| Lifecycle states | match local exactly for `batch_record`, `material_lot`, `supplier`, `deviation`, `capa_record` | No dead guards from a missing state. |
| `access_grants` | present | Unchanged by this branch. |
| Tables outside this branch's reach | 258 public tables total | Section 6 of the readiness query counts owner/admin-only write policies the sweep did not reach. **Not yet counted on live.** |

---

## 6. Schema divergence, local against live

| Thing | Local | Live | Matters? |
|---|---|---|---|
| `company_members.role` | `text` | **enum `company_role`** | **Yes — §2.** It also means the local suite has never exercised the enum path. |
| Audit immutability triggers | present | **absent** | Yes — §4 |
| Lifecycle definitions and states | — | identical | No |
| Public table count | the migration set | 258 | Unquantified risk; see §5 last row |
| `app_is_service_context()` behaviour | verified locally | **unverified** | Yes. It reads `session_user`; Supabase's `postgres` role is not `rolsuper`, which `20260918500000` exists to handle, but that has not been confirmed on this project. |

---

## 7. Deployment dependency order

Nothing in this list may be reordered.

Revised 2026-10-23, now that the role model exists. **No enum
migration is needed and none is proposed.**

| # | Step | Why here |
|---|---|---|
| 0 | Re-run `scripts/ci/live-readiness-report.sql` | Every figure above is a snapshot |
| 1 | **Review** [`docs/operational-role-model.md`](operational-role-model.md) — schema, authority rules, backward compatibility, rollback limits | Nothing is applied until this is reviewed |
| 2 | Apply `20261103000000` … `20261116000000` in filename order | Each asserts its own prerequisites |
| 3 | Apply `20261117000000`, `20261118000000` | Need `product_specifications` from step 2 |
| 4 | Apply `20261119000000`, `20261120000000` | Need the grid, and `product_specification_approver_error` from step 3 |
| 5 | Verify: the readiness query again, plus `verify_audit_chain` per company | Confirms the triggers landed and the chain reads as expected |
| 6 | **Appoint operational roles.** A workspace owner or admin assigns them to named people, each with a reason | The table deploys empty; until this, every guard abstains and the layer is inert |
| 7 | Approve specifications under the backfill plan | [`docs/specification-backfill-plan.md`](specification-backfill-plan.md) |
| 8 | Decide whether `release` requires a signature, and set it | Data change; currently false |
| 9 | Rotate the anon key — **separately**, under its own window | [`docs/key-rotation-checklist.md`](key-rotation-checklist.md). Not part of the deployment. |

Steps 1 and 6 are yours. Steps 2–4 are mechanical. Step 7 cannot start
before step 6, because only a QA Manager can approve a specification
and nobody holds that role today.

Step 6 has a constraint worth knowing before the window: **nobody can
assign themselves an operational role**, so a workspace with one
active member cannot complete it. Check the member count in §2's
output first.
