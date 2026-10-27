# What the adapted demo can and cannot show

The adapted seed loads **261 rows across 19 tables**, and the application
then manufactures a further **134 records** from them. The source dataset is
882 rows across 42 tables.

Three things changed the picture since the first pass:

* the master formula's own stages, parameters and bill of materials load
  (41 rows), which is what made the formulas approvable at all;
* the facility logs load through the real model — zones, schedules and
  entries, with outcomes derived by the database (73 rows);
* batches, their stages, their in-process readings and the signatures that
  attest them are no longer seeded. They are MANUFACTURED, through
  `batch_record_initiate` and the stage execution RPCs, by real local
  accounts. See `scripts/seed/demo/manufacture.py`.

| produced by | rows |
|---|---|
| the import (`10_` + `15_`, registry-owned, resettable) | 261 |
| the application, from the import (not resettable) | 134 |

The 134 are 4 batch records, 21 batch stages, 67 in-process readings and 42
electronic signatures. They cannot be reset: `electronic_signatures` carries
`no_update` / `no_delete` / `no_truncate`, so a signature is permanent, and
`batch_records.formula_id` is `ON DELETE RESTRICT`. That is the audit trail
working. The way back to a clean database is `scripts/local/down.sh`.

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
| `master_formula_stages` | 12 |
| `master_formula_stage_parameters` | 14 |
| `master_formula_materials` | 15 |
| `material_specification_parameters` | 45 |
| `regulatory_licences` | 4 |
| `facility_zones` | 5 |
| `facility_zone_schedules` | 5 |
| `facility_log_entries` | 63 |

And then, manufactured by the application rather than imported:

| Table | Rows |
|---|---|
| `batch_records` | 4 |
| `batch_stages` | 21 |
| `batch_stage_parameter_readings` | 67 |
| `electronic_signatures` | 42 |
| `company_members` | 11 |

Two companies with their sites, lines, approved suppliers, material
catalogue, specifications, received lots, formulas, and six deviations with
the two CAPAs that came out of them. Enough to show the registers, the
supplier qualification standing, the material catalogue and the
deviation-to-CAPA chain.

## The gaps, and what each one now is

### 1. IMPORTED records have no lifecycle state; manufactured ones do

**Affects: every material lot and every deviation. No longer batches.**

The source keeps lot, batch and deviation state in `entity_current_state`
and `entity_state_history`. In this application those are the **lifecycle
engine's** own projection — it decides transitions, checks who may make
them, and consumes a signature for the ones that need one.

Seeding them directly would assert transitions that never happened and
that no signature attests. So they are not seeded, and every lot loads as
`quarantine`, which is the application's own default for a newly received
lot.

**Products and batches are the exception, because their state was
driven rather than seeded.** The pipeline moves each manufacturable
product `concept -> regulatory_preparation -> submitted -> registered ->
active` through `lifecycle_transition`, citing the source's own
registration number in the comment the engine requires, and the batch
stages run `pending -> in_progress -> awaiting_verification -> complete`
through the execution RPCs. Those states are real because the transitions
happened.

**What the demo still cannot show:** the quarantine-to-released journey for
a material lot, or a deviation being closed. Those *records* are there;
their *state* is the starting state, not the story's.

Note the source's `disposition` column is not a substitute. It is null on
25 of the 26 lots and carries a rejection disposition on the one returned
to its supplier — a different fact from the lot's status.

### 2. Batches are manufactured, not imported — 4 of the 6

**Affects: 2 of 6 batch records, and the 26 dispensing records and 75 QC
results that hang off them.**

Found by the database refusing the load:

```
BATCH_FORMULA_NOT_APPROVED: formula version 2 is "draft",
so a batch cannot be manufactured to it
```

A batch needs an **approved** master formula, and an approved formula needs
`approved_by` and `approved_at` (`master_formulas_approval_chk`), which name
a user.

**This half is now resolved, by performing the approval rather than seeding
it.** `scripts/local/demo-identities.sh` creates the eleven actors as real
local accounts, and `scripts/local/demo-approve-formulas.sh` signs in as a
QA manager and calls `master_formula_approve` — the application's own
approval API, which takes the approver from `auth.uid()` and the time from
`now()`. So the row records what actually happened instead of asserting that
a fictional QA manager approved something in August.

Two of the three formulas approve. The third is the orange drink, whose
materials are packaging and raw ingredients: it declares **no active
ingredient**, and the application requires one
(`MASTER_FORMULA_NO_ACTIVE`). Relabelling a sugar syrup as the active would
be inventing a formulation fact to defeat a correct rule, so it stays a
draft and the refusal is asserted as the expected outcome.

**What still blocks the batches themselves** is not the formula any more.
`batch_records` carries six further insert-time gates — product,
licence, initiation, status, section-role and governing-specification —
and the only legitimate way past them is `batch_record_initiate` followed
by driving each stage through the execution workflow. That is manufacturing
the batch, not importing it, and it is the next increment rather than a
mapping.

**What the demo cannot show yet:** anything downstream of a batch —
execution, in-process control, yield, QC, release.

### 3. The source's 139 signatures are still not imported — and are no longer needed

**Affects: all 139 source rows. 42 real ones now exist instead.**

The application computes a record hash server-side over its own canonical
serialisation and records which convention in `hash_convention`. The source
computed its over the generator's. Both are 64-hex SHA-256, so the
application's `CHECK` would **accept** the source values and verification
would **fail** — 139 signatures that look signed and are not.

The only legitimate path is `sign_electronic_record()`, which takes the
signer from `auth.uid()`, re-verifies their password, asks the lifecycle
engine whether they may act, and computes the hash itself.

**That path is now taken.** `scripts/local/demo-identities.sh` creates the
eleven actors as real local accounts and the pipeline signs with them, so
the database holds **42 genuine signatures**: every one a 64-hex hash under
the application's own `sha256-esig-record-v1`, every signer a real account,
none backdated, and all 21 two-person stages signed by two *different*
people — four-eyes enforced by the application, not asserted by the seed.

**What the demo can now show:** formula approval, stage execution and stage
verification, each signed.

**What it still cannot show:** batch release and QC verification, because
those need QC results against a governing specification — see gap 4.

### 4. QC, training and calibration are a reshape, not a rename

**Affects: 75 QC results, 46 training assignments, 10 calibrations, 10
equipment rows. Facility logs and specification tests are now DONE.**

Settled since the first pass:

* **environmental monitoring and cleaning** load through the real Facility
  Logs model — 5 zones, 5 schedules and 63 entries, with every outcome
  derived by `fn_facility_log_outcome` and none written by the seed. Nine of
  the 72 source readings are left out, and `FACILITY_REPORT.md` beside the
  build says exactly which and why: a schedule's `frequency` is NOT NULL
  with a daily/weekly/monthly/quarterly vocabulary, and two groups have no
  representable cadence (one single reading, and one irregular series of
  1/2/13/14-day gaps that is the story's failed swab and its re-swabs).
* **specification tests** load as `material_specification_parameters`,
  45 of 54; the other nine belong to the one source specification that is a
  *product* specification and is not imported.

One thing the model holds that the source does not: a SCHEDULE's
`sample_method` is bound to its protocol — a settle-plate schedule must
carry `protocol_exposure_minutes`, an active-air one
`protocol_volume_litres`. The source records the method but neither figure.
So the schedules leave `sample_method` null and the method goes on each
ENTRY, whose own constraint needs no protocol. The fact is kept; the
protocol is not invented.

What remains:

* **QC results (75)** key to a batch and a specification parameter in the
  application; the source keys them to a free-standing `specification_test`
  with an `entity_type` of `material_lot` or `batch`. Mapping them needs a
  decision about which of `batch_qc_results` and `batch_inprocess_qc` each
  belongs to, and the lot-keyed ones have no home at all. This is the one
  that blocks batch release, so it is the next piece worth doing.
* **Training (46)** is **responses to scenarios** in the application, not
  assignments with a due date. The two models do not describe the same
  thing and no column mapping bridges them.
* **Calibration (10)** belongs to an **instrument**, which the application
  models in its own right with due dates and alerts. The source's
  `equipment` is general production plant — a blender, a floor balance —
  and importing a blender as a calibration-bearing measuring instrument
  would misrepresent it. Both stay out.

**What the demo still cannot show:** QC history, batch release, training
records and calibration status.

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
