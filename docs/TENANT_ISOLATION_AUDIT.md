# Tenant Isolation Audit

Scope: every read/access path touching `audit_logs`, evidence and evidence
snapshots, compliance records, submissions, licences and products.

Performed against a local Postgres 16 instance with all 155 migrations applied.
Findings were confirmed by live probe — a real, signed-in admin of company B
attempting to read company A's data — not by reading code alone. Regression
tests live in `supabase/tests/tenant_isolation_test.sql`.

---

## 1. The enforcement model

**Row-level security is the primary control, and remains so.** All 33 in-scope
tables have RLS enabled. Application-level `company_id` filtering is defence in
depth and is treated as such throughout: nothing below relies on it as the only
barrier.

There is a third layer that is easy to miss and caused every real finding here:

> **RLS does not apply inside a `SECURITY DEFINER` function.** The function runs
> as its owner, so every policy on every table it reads is bypassed. A DEFINER
> function that accepts an id and returns data about it is a read path in its own
> right, and must carry its own tenancy check.

The repository has **92** `SECURITY DEFINER` functions in `public`. They exist for
good reason — chiefly to avoid a recursive policy on `profiles` — but each is a
hole punched through RLS by design.

## 2. Findings

### 2.1 `audit_logs` readable across every tenant — **critical, fixed**

The `SELECT` policy from the original schema (`20260206145116`) read:

```sql
EXISTS (SELECT 1 FROM profiles
         WHERE profiles.id = auth.uid()
           AND profiles.role IN ('admin','compliance_officer'))
```

with **no reference to `company_id`**. PostgreSQL ORs permissive policies, so this
one overrode the correctly-scoped policy added later in `20260225000000`. Any user
whose profile role was `admin` or `compliance_officer` — an ordinary company
admin, which every tenant has — could read the audit trail of **every tenant on
the platform**.

`audit_logs` carries `evidence_snapshot`, so the exposure was other companies'
sealed regulatory evidence, their integrity hashes and their action history — not
merely metadata.

Confirmed by probe: company B's admin read company A's entry, its
`integrity_hash`, and the snapshot payload.

A second, narrower hole in the same table: the members' policy carried
`company_id IS NULL OR …`, making every un-attributed legacy row readable by
every authenticated user of every tenant.

**Fixed** in `20260922000000`. The role check is kept but ANDed with company
membership; the `IS NULL` escape is removed. Membership resolves through
`company_members` *or* `profiles.company_id`, so no legitimate reader loses
access to their own tenant's trail.
Covered by tests `B1`, `B2`, `C1`–`C4`, `E4`.

### 2.2 Three `SECURITY DEFINER` functions leaked across tenants — **fixed**

| Function | Leaked | Now |
|---|---|---|
| `submission_missing_documents()` | Another tenant's checklist item names | Raises `SUBMISSION_FORBIDDEN` |
| `submission_time_breakdown()` | Status, timings, directive counts | Raises `SUBMISSION_FORBIDDEN` |
| `electronic_signature_record_hash()` | Record hash, given the victim's company id | Returns `NULL` |

The third is the instructive one: it was scoped by its `p_company_id` **argument**
rather than by the caller's membership, so passing the victim's company id was
enough. *An argument is not an authorisation.*

Two of these refuse rather than returning empty, deliberately:
`submission_missing_documents()` feeds the submit gate, which reads an empty
result as "nothing missing" — a quiet refusal there would be a fail-open that let
an incomplete dossier through. `electronic_signature_record_hash()` stays
NULL-returning because its consumer compares the value and reports a mismatch.

Covered by tests `D1`–`D3`, with `E1`–`E3` confirming the owner is not locked out.

### 2.3 Previously fixed, now held by regression tests

Seven functions were found and fixed during the D05/D06 work. They are covered
here so the leak cannot silently return: `licence_block_reason`,
`licence_alerting_suppressed`, `licence_renewal_policy`,
`licence_alert_milestones`, `licence_renewal_dashboard`,
`licence_generate_renewal_steps`, `product_is_release_eligible`.
Tests `D4`–`D11`.

## 3. Per-area summary

| Area | RLS | App-level `company_id` | DEFINER paths |
|---|---|---|---|
| `audit_logs` | ✅ (**fixed** 2.1) | Partial — 10 of 20 reads RLS-only | `licence_audit_step` (service_role only) |
| Evidence / snapshots | ✅ via `audit_logs.evidence_snapshot`, `product_documents`, `grc_control_evidence`, `framework_evidence` | Partial | `product_available_documents` ✅ scoped |
| Submissions | ✅ | 5 of 10 reads RLS-only | **fixed** 2.2 |
| Licences | ✅ | 5 of 11 reads RLS-only | **fixed** in D06 |
| Products | ✅ | mostly scoped | **fixed** in D05 |
| Compliance records | ✅ | partial | none unscoped |

Application-layer statistics: **155** queries against in-scope tables, **87** with
an explicit `company_id` in the chain, **68** relying on RLS alone.

Those 68 are **not** defects — RLS is the control, and it holds. They are listed
so the gap is visible and can be narrowed deliberately rather than discovered.
The highest-value candidates are the audit/evidence reads, where a second barrier
is cheapest to justify:

```
src/lib/governance/policyService.ts      6 reads of audit_logs
src/lib/audit/auditExportEngine.ts:235   audit_logs
src/lib/dossierService.ts:68             audit_logs
src/lib/grc/grcEvidenceService.ts:201    grc_control_evidence
src/lib/controlMonitoringService.ts:633  framework_evidence
src/components/Profile/DataPrivacyTab.tsx:60
src/components/LegalReview/LegalReviewDetailPanel.tsx:172
```

`exportSealedEvidence()` was the one evidence path already given an explicit
filter; it is retained and now distinguishes "no trail" from "trail predates
company scoping" rather than reporting the two identically.

## 4. Deliberately not changed

- **`electronic_signature_consumptions`** has RLS enabled and **zero** policies.
  That is deny-all for any non-superuser, which is correct: it is written only
  through `SECURITY DEFINER` and never read by clients.
- **The 68 RLS-only application reads.** Adding filters across seven modules
  would be a broad change with its own regression risk, and RLS already holds.
  Recorded above as follow-up work, to be done deliberately.
- **A backfill of `audit_logs.company_id`.** Legacy rows are now unreadable
  rather than readable by everyone, which is the safe direction. Backfilling
  them is a data migration on an append-only, hash-chained table and needs its
  own change with its own review.

## 5. Verification

```
supabase/tests/tenant_isolation_test.sql     31 assertions, 0 failures
full SQL suite (16 suites)                  650 assertions, 0 failures, 0 errors
vitest                                      135/135
tsc --noEmit                                clean
production build                            succeeds
```

The isolation suite uses a real signed-in admin of another company, not an
anonymous caller: "anon is refused" proves far less than "a legitimate user of
another tenant is refused". Section `E` asserts the owner still has access, so a
passing run means isolation rather than an outage.
