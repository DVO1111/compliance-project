# Controlled specification backfill

How the finished-product specifications that the release gate requires
get into the live database, for products that already have batches.

The hard rule this plan exists to hold: **no criterion in this
database may originate from this plan, from a script, or from me.**
Every limit must come from the company's own approved quality
documentation. A backfill that invents limits produces a system that
releases batches against numbers nobody authorised, which is worse
than a system that releases nothing.

Nothing here establishes regulatory compliance or validation.

Last reviewed: 2026-10-23.

---

## 1. What the gate requires

After `20261113000000`, a batch cannot be released unless:

1. a `product_specifications` row exists for its product, and
2. that row is `effective` or `superseded`, with `approved_at`,
   `approved_by` and `effective_date` all set, and
3. its `effective_date` is on or before the batch's
   `manufacturing_date`, and
4. every `product_specification_tests` row with `is_required` has a
   standing result in `batch_qc_results`, and
5. no standing result failed, and no recorded pass contradicts the
   specification's own limits.

Points 4 and 5 are the reason a specification alone will not unblock
anything on the live project: **`batch_qc_results` is empty there.**

---

## 2. Scope on the live project

From [`docs/live-readiness.md`](live-readiness.md), snapshot
2026-10-23:

| | |
|---|---|
| Products | 22 |
| Products with non-terminal batches | **7** |
| Batches in `qc_in_progress` (blocked now) | **2** |
| Batches in `qc_pending` / `hold` (blocked later) | 5 |
| Released / rejected batches | 11 — **out of scope, see §6** |
| Finished-product QC results in the database | **0** |

So the backfill is **7 products**, of which **2** are urgent. It is a
week of quality work, not a data-migration exercise.

Re-take these numbers with `scripts/ci/live-readiness-report.sql`
section 4 before starting; it lists the products and their earliest
open manufacturing date, which is the date each specification must
reach back to.

---

## 3. Who does what

| Step | Who | Why not someone else |
|---|---|---|
| Supply the criteria | **The QA Manager**, from the registered product dossier, the NAFDAC submission, or the applicable pharmacopoeial monograph | These are the only authoritative sources. Nobody else holds them. |
| Enter the draft | QA Manager, or a QA Officer preparing it | Entry is clerical; it is `draft` and binds nothing |
| Check the entry against the source document | A second person | A transcription error in a limit is indistinguishable from an invented limit once it is in the table |
| **Approve** | **The QA Manager, and only the QA Manager** | `20261117000000` refuses every other role, `owner` and `admin` included. This is enforced server-side, not by convention. |

**Blocked prerequisite:** nobody on the live project can hold
`qa_manager` today, because the role does not exist in the
`company_role` enum. See [`docs/live-readiness.md`](live-readiness.md)
§2. **Step 3 of the backfill cannot begin until that is resolved.**

---

## 4. The procedure, per product

Done through *Quality → Specifications* in the application. Not
through SQL — the screen exists so that the approval goes through the
signature path rather than around it.

1. **Identify the source document.** Record its identifier in the
   specification's `reference` field: the dossier section, monograph
   name and edition, or internal SOP number. A specification with a
   blank `reference` is a specification nobody can trace, and the
   review in step 5 should reject it.

2. **Create the version.** Use the version designation from the source
   document (`1.0`, `REV-02`, whatever it actually says), not a number
   invented for this exercise. The row is created `draft`; drafts bind
   nothing.

3. **Enter each test** with its `test_name`, `test_method`, `unit`,
   and limit, choosing the `limit_type` that matches what the source
   document states:

   | The document says | `limit_type` | Fields |
   |---|---|---|
   | 98.0 % – 102.0 % | `range` | `min_value`, `max_value` |
   | not less than 95 % | `min` | `min_value` |
   | not more than 0.5 % | `max` | `max_value` |
   | "White crystalline powder" | `exact_text` | `expected_text` |
   | "Complies with the test" | `complies` | — |
   | "Absent in 10 g" | `absent` | — |

   Mark `is_required` on the tests that must have a result before
   release. **A test marked not-required still holds no batch**, so
   this flag is a decision about what release depends on, not a
   convenience. `is_critical` is recorded and reported; it does not
   change the gate.

   `complies` and `absent` limits are **never machine-checked** — they
   are judgements, and the analyst's recorded verdict is the only
   evidence. Choose them knowing that.

4. **Set the effective date.** This is the legitimate part of
   back-dating and the distinction matters:

   > **`effective_date` may be historical. `approved_at` may not.**

   An effective date is a property of the specification — the date from
   which the criteria applied — and stating that a specification took
   effect on 1 March is an assertion the approver is entitled to make,
   provided it is true. `approved_at` is the moment the approval
   happened, which is today, and it is set by the server from `now()`.
   Nothing in this plan writes `approved_at`, and nothing may.

   The effective date must be **on or before the earliest open
   batch's manufacturing date** for that product, or the gate still
   refuses. Section 4 of the readiness query prints that date per
   product.

   **If the criteria did not in fact apply on that date, do not set it
   there.** The honest outcome is then that the batch cannot be
   released under a specification that did not exist when it was made
   — which is a quality decision about that batch, not a problem with
   the gate. Raise it as a deviation.

5. **Second-person check** against the source document, before
   approval. Not enforced by the software; the gate cannot tell a
   correct transcription from an incorrect one.

6. **Approve, with signature.** The QA Manager enters their password
   on the specifications screen. The server:
   - refuses unless the caller's role is `qa_manager`
   - computes `product_specification_record_hash` over the version and
     its ordered tests, and binds the signature to that hash
   - records `approved_by`, `approved_by_role`, `approved_at` (server
     clock), `approval_signature_id` and `effective_date`
   - sets the status to `effective` and supersedes the prior effective
     version for that product

   Because the signature is bound to a hash of the criteria, **a
   signature cannot be carried across an edit**: change a limit after
   signing and the approval is refused as stale. That is deliberate.

7. **Record the QC results** for the blocked batches, through the
   normal QC route and by the analyst who performed the test. The
   release gate refuses a releaser who recorded any of the batch's
   results, so the QA Manager must not enter them.

---

## 5. What this plan will not do

Stated explicitly, because each was available and rejected:

- **No criteria are generated, inferred, or copied from a similar
  product.** A limit that is right for one product is not evidence
  about another.
- **No approval is recorded on behalf of anyone.** There is no
  service-context path to `product_specification_approve`, by design;
  the function reads the caller's role.
- **No `approved_at` is back-dated.** It is `now()`, server-side, and
  the only way to change it is to edit the row directly as the
  database owner, which is the thing this branch exists to prevent.
- **No batch is released by adjusting a specification to fit it.**
  Writing the limits to match results already recorded is fabrication
  with extra steps. If a result is out of specification, the batch is
  out of specification.
- **No seed migration ships specifications.** Not for live, and not
  as "examples to edit" — a draft nobody wrote is a draft somebody
  will approve without reading.
- **No gate is relaxed for the backfill period.** There is no bypass
  flag, and adding one would make every later assertion about release
  control untrue.

---

## 6. Batches already released

**Nothing is done to them.** The 11 released and rejected batches
predate the control; they carry no `governing_specification_id` and
none is back-filled.

Stamping a governing specification onto a batch released before the
specification existed would assert that it was judged against criteria
that were not there — a claim about the past, written today. The same
objection as a back-dated approval.

`batch_governing_specification` falls back to the effective-date
lookup for an unstamped batch, so those batches still resolve to a
specification for reporting. They are simply not claimed to have been
released against one.

---

## 7. After the backfill

A later revision of a product's criteria is **not** a backfill. It is:

- a new `product_specifications` row with a new version
- approved by the QA Manager, taking effect from its own date
- which automatically supersedes the prior version

Batches already released keep their stamp, because
`fn_batch_governing_spec_locked` refuses to change it outside a
controlled review. If a released batch genuinely needs reassessing
against different criteria — a retrospective review, a recalled
revision — that goes through `batch_specification_review(batch,
to_spec, reason, signature)`, which records the old version, the new
version, the reason and the signer in `batch_specification_reviews`
and leaves both visible.

That is the mechanism for changing the past honestly, and it is the
only one.

---

## 8. Open questions

| Question | Status |
|---|---|
| Is "the specification effective at manufacture" the right governing rule? | **Proposed decision, pending final quality/regulatory confirmation.** Implemented in `20261118000000`. |
| Is the QA Manager the right approver, and should any second approval be required? | **Proposed decision, pending final quality/regulatory confirmation.** Implemented in `20261117000000`; single approval today. |
| Should a numeric limit refuse a non-numeric result? | **Open.** It would close the "type words where a number belongs" gap and would also refuse legitimate entries like `"< 0.1"`. Not done unasked. See `docs/figma-conflicts.md` §26. |
| Who are the QA Managers at each of the 30 companies? | **Blocked on the role enum.** See `docs/live-readiness.md` §2. |
