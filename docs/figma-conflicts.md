# Conflicts and silences in the Figma file

What this repair found in the design that cannot be resolved by reading
it harder. Nothing here has been settled by implementation; each entry
says what the code does in the meantime and why.

**PM-03 is the provisional authority on permissions.** It is the screen
an administrator uses to grant access, so where another frame draws a
different cell, the code follows PM-03 and the difference is recorded
below rather than split.

Last reviewed: 2026-10-22, against file `wSj81KWfoy7rS8u9CDcqtY`.

---

## 1. Flow chips that disagree with the permissions matrix

The "Material and batch flow" card on DB-01 and DB-02 draws an access
chip per stage. Four of them contradict PM-03's grid.

| Stage | Role | PM-03 says | The frame draws | Code follows |
|---|---|---|---|---|
| 01 Procurement | QA Manager | `Act` on suppliers | `View` | PM-03 (`Act`) |
| 03 QC testing | QA Manager | `View` on qc_testing | `Act` | PM-03 (`View`) |
| 04 QA disposition | Storekeeper | no access | `View` | PM-03 (no access) |
| 07 QA release | Storekeeper | no access | `View` | PM-03 (no access) |

**Row 4 is a frame disagreeing with itself.** DB-02 draws `View` on
stage 07 while its own "Sections you can't open" card, on the same
screen, lists *Batch release decision* as not openable and not even
requestable. Following the drawn chip would show a Storekeeper "View"
on QA release beside a card telling them they cannot open it.

*Decision needed:* whether the drawn chips are illustrative or whether
PM-03's cells are wrong for these four.

---

## 2. A stage with no column anywhere

PM-03 tabulates one **QC testing** column. The flow splits testing in
two: `03 · QC TESTING` (incoming material) and `06 · FINISHED QC`
(finished product). No column for finished-product QC exists anywhere
in the file.

Stage 06 therefore reads the `qc_testing` cell. The card labels that
chip "from QC testing" so a reader can see which one is inferred.

*Decision needed:* whether finished-product QC is its own permission or
genuinely the same one.

---

## 3. The rail is drawn per role, not derived

DB-01's and DB-02's sidebars are not the same list filtered by access.

- A Storekeeper has `View` on **suppliers** and on **batch records** in
  PM-03, and DB-02's rail shows neither.
- A QA Manager has `View` on **distribution**, and DB-01's rail has no
  Dispatch item — while DB-02, where the Storekeeper has `Act`, does.
- DB-02 carries **Issue to production**, a page with no column in PM-03
  and no frame of its own.

So rail membership is a design decision per role, not a rule. The code
derives the rail from PM-03 (plus the industry gate), which is close
but not identical to either drawn rail.

*Decision needed:* the rule for rail membership, or a drawn rail per
role.

---

## 4. Audit trail is outside the grid

PM-03 annotates audit trail as "a separate switch" and gives it no
cells. Nothing in the file says who holds that switch by default.

The code leaves the existing `canViewAuditTrail` navigation permission
in charge and does not derive it from the grid.

*Decision needed:* which roles see the audit trail.

---

## 5. Roles the matrix does not cover

This codebase carries `production_operator`, `regulatory_affairs` and
`other`. PM-03 has no row for any of them.

They are given **nothing** — the grid fails closed — and the page guard
abstains for a member whose role it does not recognise, so existing
workspaces are not locked out of their own steps on a silence.

The same silence is handled the same way in the database:
`app_assert_step` abstains for a role outside PM-03's eight. Two
existing SQL suites create members as `admin` and `member` and then
dispose of material; refusing them would have been enforcing a rule the
design does not contain.

*Decision needed:* whether these three map onto PM-03 roles or are
retired.

---

## 6. Six roles have no dashboard

The file draws DB-01 (QA Manager) and DB-02 (Storekeeper). Procurement,
QC Analyst, QA Officer, Production supervisor, Compliance admin and
Management have no frame, on desktop or mobile.

They get a dashboard **derived** from the structure both drawn frames
share and from their own row in PM-03. The screen says so on itself, in
a banner, so nobody mistakes it for a specified design.

What the derivation cannot supply is what each role should *lead* with.
DB-01 leads with dispositions and releases because that is a QA
Manager's morning; nobody has written down a Procurement lead's.

*Decision needed:* the leading metric for each of the six.

---

## 7. Screens the rail names and no page answers

DB-01 and DB-02 listed seven destinations with no page in this
codebase. Five are now built — **Goods receipt**, **QC testing**,
**QA disposition**, **Traceability** and **My tasks** — leaving
DB-02's **Issue to production** and **Dispatch**.

Those two are still routed to a panel that says the screen is not built
and what it will do, rather than being omitted or pointed at the
nearest existing page. Neither has a frame of its own, and
*Issue to production* has no column in PM-03 either (entry 3).

---

## 8. There is no task register

Both dashboards draw a routed task list. Nothing in the schema holds a
work item assigned to a person; the only `assigned_to` column belongs
to `ai_incidents`, a different product area.

The list is derived: a record in a state only this role can move is a
task for this role, which is what the design's own example rows are.
The derivation has **no due date and no urgency ordering**, because
nothing records them — the design shows "Today" and "Overdue 2 days"
and the code shows a dash rather than inventing an age. The My tasks
screen says on itself that it is derived, because "my tasks" and
"records waiting on my role" are different promises.

**Two of the first derivation's three sources were dead**, and this is
worth recording beside the design questions because it is how a
derivation fails quietly:

| Source | Why it never returned a row |
|---|---|
| `batch_records WHERE status = 'pending_qa'` | no such state — the batch lifecycle has `qc_in_progress` |
| `deviations WHERE status <> 'closed'` | `deviations` has no status column; its state is in the lifecycle engine and `closed_at` is the mirror |

The second errored on every call into a `logger.debug`. A QA Manager's
dashboard showed material dispositions and never a batch release, for
the life of the feature. The sources are now data in one module, and
`src/tests/taskSources.test.ts` checks every state key and column they
name against the migrations — proven to fail by reinstating
`pending_qa`.

*Decision needed:* whether a task register is being built, or whether
derivation is the intended behaviour.

---

## 9. Transitions the design does not rule on

PM-03 names five steps and who may perform them. The lifecycle engine
has **ten** entity types that reach a protected terminal state.

| Entity | Reaches | Guarded? |
|---|---|---|
| `material_lot` | approved, rejected | yes — `material_disposition` |
| `batch_record` | released, rejected | yes — `batch_release` |
| `deviation` | closed | yes — `deviation_close` |
| `supplier` | qualified, conditional | yes — `supplier_approve` |
| `capa_record` | closed | yes — **derived** from `deviation_close` |
| `change_control` | approved, closed, rejected | **no rule** |
| `sop_document` | approved, effective | **no rule** |
| `regulatory_submission` | approved, rejected | **no rule** |
| `regulatory_licence` | active | **no rule** |
| `licence_variation` | approved, rejected | **no rule** |
| `product` | active | **no rule** |

**CAPA is a derivation and is marked as one.** PM-03 has no "Close a
CAPA" row, but it puts Deviation / CAPA in one column and reserves
"Close a deviation" to the QA Officer and QA Manager. Closing the
corrective action that came out of a deviation is the same decision by
the same people in the same section.

**The six with no rule are left unguarded on purpose.** PM-03
tabulates none of those sections — no column, no step row. Guarding
them would mean inventing a permission and enforcing it against
working features.

Failing closed is right where authorisation is *ambiguous*. It is
wrong where the design simply does not reach, because the result is
removing a feature on a rule nobody wrote.

*Decision needed:* who approves a change control, makes an SOP
effective, and approves a regulatory submission.

---

## 10. A guard can name a state that does not exist

Not a Figma conflict — a hazard this repair walked into and is worth
recording beside them.

`20261104000000` guarded suppliers on the state `approved`. The
supplier lifecycle has `pending · qualified · conditional · suspended
· disqualified`. The trigger was installed, attached, and never fired,
so a PM-03 step read as enforced while it was not. A test asserting
the trigger *existed* passed throughout.

`20261105000000` fixes the states and adds a `DO` block that refuses
to apply if any guarded entity/state pair is absent from
`lifecycle_definitions`. `F1` asserts the same thing in the suite.

---

## 11. Traceability sees only what was dispensed

W5·13 (Genealogy trace) has a frame and was never implemented, and no
genealogy function exists in the schema. The screen is built from the
relationships that do exist: `dispensing_records` links a lot to a
batch stage, and a stage to its batch.

So a lot consumed any other way — reworked, sampled to destruction,
transferred between sites — leaves no dispensing record and does not
appear in a trace. **That limit is printed on the screen**, because
somebody scoping a recall has to know the difference between "nothing
used this lot" and "nothing we can see used this lot".

*Decision needed:* whether other consumption paths must be traceable,
which would need either a genealogy function or consumption records
that do not exist yet.

---

## 12. Nothing says which finished-product tests a batch needs

There is no finished-product specification anywhere in this schema.
`material_specifications` covers incoming material; no table says which
tests a *product* requires before its batch can be released, and PM-03
has no screen for one.

So a batch with no rows in `batch_qc_results` is ambiguous in the worst
possible way: it is either a product that genuinely requires no
finished testing, or a batch nobody tested.

`20261107000000` **refuses both**, because only one of the two readings
is survivable — releasing an untested batch is the failure a quality
system exists to prevent, and holding a batch whose product needs no
testing costs one row. The refusal says in words that the system cannot
tell the two apart, so nobody reads it as a bug.

*Decision needed:* whether finished-product specifications are being
built. Until they are, every product needs at least one recorded
result before any of its batches can be released.

---

## 13. QC completion and release authorisation are not the same thing

Recorded here because it is the rule most likely to be "simplified"
back out by someone reading the two screens side by side.

PM-03 holds them in **different columns with different holders**:

| | QC testing | Batch release |
|---|---|---|
| QC Analyst | **Act** | no access |
| QA Officer | View | **Act** |
| QA Manager | View | **Act** |

and its step table narrows the release further still — "Release a
batch — QA Manager — E-signature". Nobody holds Act on both columns.

So completing QC **authorises nothing**. It removes an objection. The
release is a separate decision by a separate person, and
`20261107000000` additionally refuses a releaser who recorded the
batch's own results.

Note the section and the step disagree in scope: the QA Officer has Act
on the batch-release *section* and is not a holder of the release
*step*. The code follows the narrower rule and treats the section as
covering everything else in that area — putting a batch on hold,
reviewing it — while the release itself stays with the QA Manager.

*Decision needed:* confirm that the QA Officer's Act on the section is
meant to exclude the release itself.

---

## 14. The schema cannot record a test that is still running

`batch_qc_results.pass` is `NOT NULL`. A result exists only once it has
a verdict, so there is no way to record a finished-product test that is
under way, inconclusive, or awaiting a repeat.

`qc_in_progress` is therefore a batch state with **no test-level
counterpart**: a batch that nobody has started testing and a batch
mid-analysis look identical.

A draft of `20261107000000` blocked release on `pass IS NULL`. That
branch could never have fired — a guard installed, attached and
silently dead, which is entry 10 happening again. It was removed, and
the migration now *asserts* that `pass` is not nullable so the omission
is re-examined if that ever changes.

*Decision needed:* whether an in-progress or inconclusive result needs
to be recordable.

---

## 15. Closing execution happens two ways and they disagree

`batch_record_close()` stamps `batch_records.execution_closed_at` and
moves the lifecycle state. A bare
`lifecycle_transition(..., 'close_execution')` moves the state and
leaves the column null.

The column is what locks readings (`20261011000000`); the state is what
the lifecycle gates read. A batch can sit in `qc_in_progress` with
`execution_closed_at` still null, which is why the release gate checks
the lifecycle path rather than the column — a column check there would
refuse a batch that followed a route the engine itself permits.

*Decision needed:* whether `close_execution` should stamp the column
too, or whether the bare transition should be withdrawn.

---

## 16. Rejecting a batch has no row in PM-03

PM-03's step table has "Release a batch — QA Manager — E-signature" and
nothing about rejecting one. `fn_batch_release_role` already treats
both states the same for the role question, but `20261107000000` set
`requires_signature` on the **release** transition only.

So releasing a batch takes a signature and rejecting one does not —
which follows the design exactly and is almost certainly not what
anybody intends, since a rejection destroys product.

*Decision needed:* whether rejecting a batch requires its own
signature.

---

## 17. A trace stops at release and the schema cannot take it further

Entry 11 recorded that traceability sees only what was dispensed. The
other end is worse: **nothing links a released batch to where it went.**

`shipments` carries a sender, a recipient, two countries, a weight and
a declared value. It has no `batch_id`, and no other table connects a
batch to a customer, an order or a consignment.

So a recall can be scoped backwards — batch to lot to supplier, which
`traceService` now walks in full — and cannot be scoped forwards past
the loading bay. The screen says so rather than leaving the silence to
be read as "it went nowhere".

What the trace *can* now reach, which it could not before:

| Direction | Reaches |
|---|---|
| back from a batch | its lots, their internal numbers, **the supplier and the supplier's own lot reference**, the quantity dispensed |
| forward from a lot | the batches, **the product each makes**, each batch's state, the quantity |

The supplier half was the gap that mattered: `material_lots.supplier_id`
has always been populated and nothing read it, so a backward trace
stopped at our own lot number — a shelf rather than somebody who can be
telephoned.

*Decision needed:* whether batch distribution is being recorded. Until
it is, "which customers received this batch" has no answer in this
system.
