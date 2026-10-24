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
