# What the adapted demo can and cannot show

The adapted seed loads **98 rows across 11 tables** from a source dataset of
882 rows across 42. This is what that costs the demonstration story, stated
per gap rather than as a total.

Build it with `scripts/seed/demo/build.ts`; the machine-generated
`BUILD_REPORT.md` beside the output lists every unemitted table with its
class and reason.

## What loads, and is real

| Table | Rows |
|---|---|
| `companies` | 2 |
| `sites` | 2 |
| `production_lines` | 3 |
| `suppliers` | 12 |
| `materials` | 19 |
| `products` | 4 |
| `material_specifications` | 19 |
| `material_lots` | 26 |
| `master_formulas` | 3 |
| `deviations` | 6 |
| `capa_records` | 2 |

Two companies with their sites, lines, approved suppliers, material
catalogue, specifications, received lots, formulas, and six deviations with
the two CAPAs that came out of them. Enough to show the registers, the
supplier qualification standing, the material catalogue and the
deviation-to-CAPA chain.

## The four gaps, and why each one is a gap

### 1. Nothing has a lifecycle state

**Affects: every material lot, every batch, every deviation.**

The source keeps lot, batch and deviation state in `entity_current_state`
and `entity_state_history`. In this application those are the **lifecycle
engine's** own projection — it decides transitions, checks who may make
them, and consumes a signature for the ones that need one.

Seeding them directly would assert transitions that never happened and
that no signature attests. So they are not seeded, and every lot loads as
`quarantine`, which is the application's own default for a newly received
lot.

**What the demo cannot show:** the quarantine-to-released journey, a
batch moving through its stages, a deviation being closed. The *records*
are there; their *state* is the starting state, not the story's state.

Note the source's `disposition` column is not a substitute. It is null on
25 of the 26 lots and carries a rejection disposition on the one returned
to its supplier — a different fact from the lot's status.

### 2. No batches

**Affects: 6 batch records, 30 batch stages, 75 parameter readings, 26
dispensing records, 75 QC results.**

Found by the database refusing the load:

```
BATCH_FORMULA_NOT_APPROVED: formula version 2 is "draft",
so a batch cannot be manufactured to it
```

A batch needs an **approved** master formula. An approved formula needs
`approved_by` and `approved_at` (`master_formulas_approval_chk`), which
name a user. The demo has no Auth accounts, so the chain cannot be
completed — and a formula approval is a signed act, not a column to fill
in.

**The trigger is correct and was not touched.** It exists to stop exactly
this: a batch manufactured against a formula nobody approved.

**What the demo cannot show:** anything downstream of a batch — execution,
in-process control, yield, QC, release. That is the largest single piece of
the ten-minute story.

### 3. No electronic signatures

**Affects: all 139.**

The application computes a record hash server-side over its own canonical
serialisation and records which convention in `hash_convention`. The source
computed its over the generator's. Both are 64-hex SHA-256, so the
application's `CHECK` would **accept** the source values and verification
would **fail** — 139 signatures that look signed and are not.

The only legitimate path is `sign_electronic_record()`, which takes the
signer from `auth.uid()`, re-verifies their password, asks the lifecycle
engine whether they may act, and computes the hash itself. None of that can
happen without a real Auth session.

**What the demo cannot show:** any signed act — formula approval, batch
release, QC verification, deviation closure. This is the same blocker as
gap 2 seen from the other end.

### 4. Facility logs, QC and training are a reshape, not a rename

**Affects: 60 environmental readings, 12 cleaning records, 75 QC results,
54 specification tests, 46 training assignments, 10 calibrations.**

The application models these, differently enough that adapting them is real
work rather than a column mapping:

* environmental monitoring and cleaning are **facility log entries**
  against a **zone schedule** that carries the limits and the sampling
  method — the scaffolding has to be created first, and the outcome is
  derived by a trigger, never supplied;
* QC results key to a batch and a specification parameter, not to a
  free-standing test;
* training is **responses to scenarios**, not assignments with due dates;
* calibration belongs to an **instrument**, and the source's general
  production equipment has no counterpart.

**What the demo cannot show:** the facility-log registers with real
readings, the trend charts, the QC history.

## What it would take to close them

In dependency order, because each unblocks the next:

1. **Demo Auth identities** in a non-production environment — see
   `DEMO_IDENTITIES.md`. Unblocks `company_members`.
2. **Approve the three master formulas through the application**, signing
   as a demo QA user. Unblocks batches.
3. **Load batches and stages** — the mapping is already written and
   settled; it is only waiting on (2).
4. **Drive the lifecycle engine** to move lots and batches into their story
   states, signing where it asks. Closes gap 1 and gap 3 together, because
   the signatures are produced as a by-product of the transitions actually
   happening.
5. **Adapt the facility, QC and training data** — the largest remaining
   piece, and the one that is genuinely new modelling rather than
   sequencing.

Steps 1–4 are mostly sequencing and could be scripted against a demo
environment. Step 5 is the one to scope separately.

## One simplification worth knowing about

The source's deviations carry a `source_type` of `facility`, `qc_result`,
`equipment`, `material_lot` or `batch`, with `source_id` set on five of the
six. The application's `source_type` vocabulary is `process` or `facility`,
and `deviations_source_id_required` requires `source_id` to be null for
both.

Since most of those source entities are not loaded, all six deviations are
recorded as `process` with entry point `manual`. **The deviation's
provenance — which QC result or which lot it came from — is not preserved.**
The deviations are real and their text is intact; what they point back to
is not.
