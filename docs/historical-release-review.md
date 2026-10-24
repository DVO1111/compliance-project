# Historical release review

The batch records that are in `released` state on the live project
today, and what evidence exists for each.

**Read-only. Nothing was altered.** No judgement is offered on whether
any of these releases was proper. **Disposition is for the authorised
QA process**, not for this document and not for the software.

| | |
|---|---|
| Project | `ovxfflilbqaxedzovgmz` |
| Read | **2026-10-23 21:06–21:40 UTC** |
| Method | Supabase MCP, `SELECT` only |
| Rows written | **none** |

---

## 1. Why these were flagged

The live release transition reads **`requires_signature = false`**
(confirmed 2026-10-23). The migration that sets it to `true`,
`20261107000000`, is unapplied on production. So no release recorded
so far passed through an electronic-signature check, because no such
check existed.

That is a statement about the **schema**, not about any person's
conduct.

---

## 2. First correction: seven rows, four batch numbers

The previous review reported "7 released batches". The count of rows
is right; "batches" is not. Three batch numbers appear **twice each**,
in **two different companies**:

| Batch number | Rows | Distinct ids | Companies |
|---|---|---|---|
| `BT-2024-0041` | 2 | 2 | HealthBridge HMO, Muy Ent |
| `BT-2024-0042` | 2 | 2 | HealthBridge HMO, Muy Ent |
| `BT-2024-0043` | 2 | 2 | HealthBridge HMO, Muy Ent |
| `FT-9767` | 1 | 1 | Sam and Co Ltd |

Seven rows, **four** distinct batch numbers, across **three**
companies.

---

## 3. The evidence, per row

| Batch | Company | Mfg date | Released at | `released_by` | Release notes | QC results | Audit entries | Signatures |
|---|---|---|---|---|---|---|---|---|
| `BT-2024-0041` | HealthBridge HMO | 2024-10-01 | 2026-04-20 14:52 | **absent** | present | **0** | **0** | **0** |
| `BT-2024-0041` | Muy Ent | 2024-10-01 | 2026-04-20 17:58 | **absent** | present | **0** | **0** | **0** |
| `BT-2024-0042` | HealthBridge HMO | 2024-10-08 | 2026-04-27 14:52 | **absent** | present | **0** | **0** | **0** |
| `BT-2024-0042` | Muy Ent | 2024-10-08 | 2026-04-27 17:58 | **absent** | present | **0** | **0** | **0** |
| `BT-2024-0043` | HealthBridge HMO | 2024-10-15 | 2026-05-05 14:52 | **absent** | present | **0** | **0** | **0** |
| `BT-2024-0043` | Muy Ent | 2024-10-15 | 2026-05-05 17:58 | **absent** | present | **0** | **0** | **0** |
| `FT-9767` | Sam and Co Ltd | 2026-07-23 | 2026-07-23 14:52 | **Samuel Balogun** | absent | **0** | **3** | **0** |

Columns read: `batch_records.released_at`, `.released_by`,
`.release_notes`, `.qc_completed_at`, `.execution_closed_at`;
`batch_qc_results` by `batch_id`; `audit_logs` by `entity_id`;
`electronic_signatures` by `entity_id`.

`qc_completed_at` and `execution_closed_at` are **null on all seven**.

---

## 4. The six `BT-2024-*` rows carry the marks of seeded data

Stated as observations, each independently checkable:

1. **`created_by` is null** on all six. A record created through the
   application carries its creator.
2. **`created_at` is identical in two clusters** — three rows at
   `2026-06-04 14:52:00.290752+00`, three at
   `2026-06-04 17:58:07.228323+00`, to the microsecond within each
   cluster. Three batches created in the same microsecond is a bulk
   insert.
3. **The same three batch numbers exist in two unrelated companies**,
   with `released_at` values differing by the same 3h06m offset as
   their `created_at` values.
4. **Zero audit entries.** Every application write path emits one.
5. The product names — NASCO Cornflakes, NASCO Biscuits, NASCO Noodles
   — match the demo seed migration
   `20260603600000_seed_nasco_demo_data.sql`.

The most economical reading is that a demo seed ran twice, three
hours apart, landing in two companies. **This is an inference from the
data, not a record of what happened**, and it is offered so the QA
process can confirm or reject it quickly rather than investigate seven
releases as though all seven were manufacturing events.

---

## 5. `FT-9767` is different

One row, one company, and it looks like a person using the
application:

- `created_by` is populated; `released_by` is **Samuel Balogun**.
- **Three audit entries, all hashed, in sequence** — a complete
  lifecycle trail:

| Seq | When (UTC) | Action | Hashed | Actor |
|---|---|---|---|---|
| 10 | 2026-07-23 14:51:15 | `create_batch_record` | yes | Samuel Balogun |
| 11 | 2026-07-23 14:51:26 | `batch_status_qc_in_progress` | yes | Samuel Balogun |
| 12 | 2026-07-23 14:52:46 | `batch_status_released` | yes | Samuel Balogun |

What the record also shows, factually:

- **No finished-product QC results** (`batch_qc_results` = 0).
- **No electronic signature** on the batch.
- `qc_completed_at` null — the batch moved through `qc_in_progress`
  without a recorded completion.
- Elapsed time from creation to release: **1 minute 31 seconds**.
- The same person performed all three recorded actions.

The product name is `mANGO` and the batch number format differs from
the others, which may indicate a test record. **This review does not
determine that.**

---

## 6. What the branch would and would not have changed

For completeness, and **not** as a statement about these records:

| | |
|---|---|
| `20261107000000` | would have refused all seven: no finished-product QC result means `batch_release_block_reason` objects before any signature question arises |
| `20261127000000` | would have required a signed QC verdict to exist at all |
| `20261120000000` | would have refused a single person performing QC and release on the same batch |
| `20261201000000` | asserts the signature requirement is actually installed |

**None of this can be applied backwards.** A signature means a person
attested at a moment; creating one now would be a fabrication, and the
controls exist to prevent exactly that. These records stand as they
are.

---

## 7. What is needed, and from whom

**Nothing from engineering.** This report is the deliverable.

For the authorised QA process:

1. **Confirm or reject the seeded-data reading** for the six
   `BT-2024-*` rows (§4). If confirmed, the question becomes whether
   demo data should sit in companies named *HealthBridge HMO* and
   *Muy Ent* on a production project — a data-hygiene question, not a
   release question.
2. **Determine the status of `FT-9767`** (§5): a genuine release, or a
   test record. The audit trail is intact and hashed either way.
3. **Record the determination** in the quality system. The seven rows
   are not alterable from the application after deployment —
   `BATCH_STATUS_READ_ONLY` makes `batch_records.status` derived — and
   they should not be altered to make a report look tidier.

### Two things to avoid

- **Do not create retrospective signatures or QC results.** It is the
  forgery the signature control exists to prevent.
- **Do not treat seven rows as seven manufacturing events** before
  §4 is settled. Six of them very likely never existed as batches.

Duplicate batch numbers across companies are possible because no
unique constraint spans `(company_id, batch_number)` for released
records. Whether one should exist is a separate design question,
**recorded here, not acted on**, since adding a constraint over
existing data is a change to historical records.

---

## 8. QA review package

For the authorised QA process. **Nothing below is a determination.**
Each item states what the record shows, what is absent, and the
question to answer. The read-only queries are given so the reviewer
can reproduce every figure rather than take this document's word.

### Package A — `FT-9767`, "mANGO", Sam and Co Ltd

| Field | Value |
|---|---|
| Batch number | `FT-9767` |
| Company | Sam and Co Ltd |
| Manufacturing date | 2026-07-23 |
| Released at | 2026-07-23 14:52:45 UTC |
| Released by | **Samuel Balogun** |
| Created by | populated (same person) |
| Release notes | **absent** |
| `qc_completed_at` | **null** |
| `execution_closed_at` | **null** |
| Finished-product QC results | **0** |
| Electronic signatures on the batch | **0** |
| Audit entries | **3, all hashed**, sequence 10–12 |
| Elapsed, creation → release | **1 min 31 s** |

Audit trail, complete and intact:

| Seq | UTC | Action | Hashed | Actor |
|---|---|---|---|---|
| 10 | 14:51:15 | `create_batch_record` | yes | Samuel Balogun |
| 11 | 14:51:26 | `batch_status_qc_in_progress` | yes | Samuel Balogun |
| 12 | 14:52:46 | `batch_status_released` | yes | Samuel Balogun |

**Questions for QA**

1. Was `FT-9767` a genuine manufacturing batch, or a test record
   created while evaluating the system? The batch-number format
   (`FT-` + 4 digits) differs from the other rows, and the product
   name `mANGO` has irregular capitalisation.
2. If genuine: the record shows no finished-product QC results and no
   signature. What, outside the system, evidenced the release
   decision?
3. One person created, progressed and released it. Was any
   independent check performed outside the system?
4. Should the record be annotated to say which of 1–3 applies? **The
   software cannot annotate it** — after deployment
   `batch_records.status` is derived and `BATCH_STATUS_READ_ONLY`
   refuses direct writes — so any annotation belongs in the quality
   system.

**Reproduce:**

```sql
SELECT b.batch_number, b.product_name, b.manufacturing_date, b.released_at,
       p.full_name AS released_by, b.release_notes,
       b.qc_completed_at, b.execution_closed_at,
       (SELECT count(*) FROM public.batch_qc_results q WHERE q.batch_id=b.id) AS qc_results,
       (SELECT count(*) FROM public.electronic_signatures s WHERE s.entity_id=b.id) AS signatures
  FROM public.batch_records b
  LEFT JOIN public.profiles p ON p.id=b.released_by
 WHERE b.batch_number='FT-9767';

SELECT a.sequence_number, a.created_at, a.action,
       a.integrity_hash IS NOT NULL AS hashed, pr.full_name AS actor
  FROM public.audit_logs a
  LEFT JOIN public.profiles pr ON pr.id=a.user_id
 WHERE a.entity_id=(SELECT id FROM public.batch_records WHERE batch_number='FT-9767')
 ORDER BY a.sequence_number;
```

### Package B — the six `BT-2024-*` rows

| | |
|---|---|
| Rows | 6 |
| Batch numbers | `BT-2024-0041`, `BT-2024-0042`, `BT-2024-0043` — **each twice** |
| Companies | HealthBridge HMO and Muy Ent — **one copy of each batch in each** |
| Products | NASCO Cornflakes 500g, NASCO Biscuits Original 200g, NASCO Noodles Chicken 70g |
| `created_by` | **null on all six** |
| `created_at` | three at `2026-06-04 14:52:00.290752+00`, three at `2026-06-04 17:58:07.228323+00` — identical to the microsecond within each cluster |
| `released_at` | April–May 2026, offset by the same 3 h 06 m between clusters |
| Release notes | present on all six |
| QC results / signatures / audit entries | **0 / 0 / 0** |

**The inference, offered for confirmation or rejection:** these are
demo-seed records. The five supporting observations are in §4. The
product names match
`20260603600000_seed_nasco_demo_data.sql`, which is **not** in the
production ledger — so if that is the source, it was run outside the
migration tooling.

**Questions for QA**

1. Confirm or reject the seeded-data reading. One answer settles all
   six.
2. If seeded: should demo data exist on a production project at all,
   and in companies named *HealthBridge HMO* and *Muy Ent* —
   neither of which is the demo company the seed names? That is a
   data-hygiene question, not a release question.
3. If **not** seeded: six releases with no creator, no QC results, no
   signature and no audit entry need a different conversation, and
   this package is the start of it.
4. Either way: is the absence of audit entries itself reportable? The
   application emits one on every write path, so six batch records
   with none did not arrive through the application.

**Reproduce:**

```sql
SELECT b.batch_number, c.name AS company, b.created_by, b.created_at,
       b.released_at, b.released_by,
       (SELECT count(*) FROM public.audit_logs a WHERE a.entity_id=b.id) AS audit_entries
  FROM public.batch_records b
  LEFT JOIN public.companies c ON c.id=b.company_id
 WHERE b.batch_number LIKE 'BT-2024-%' AND b.status='released'
 ORDER BY b.batch_number, b.created_at;
```

### What QA is not being asked to do

- **Not** to make these records compliant. They cannot be
  retrospectively signed, and attempting it is the forgery the
  signature control exists to prevent.
- **Not** to delete or amend them. After deployment the application
  cannot, and doing it at the database level would destroy the audit
  evidence in Package A.
- **Not** to decide anything before §4's reading is settled. Treating
  six probable seed rows as six manufacturing events would waste the
  investigation.

### What engineering will do with the answer

Nothing automatic. If QA determines the six are seed data and should
not be on a production project, removing them is a **data** change
requiring its own approval, its own backup, and its own record — and
`FT-9767` must not be swept up with them, because its audit trail is
intact and is evidence.
