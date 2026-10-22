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
| QA Officer | View | View |
| QA Manager | View | **Act** |

and its step table says the same thing again — "Release a batch — QA
Manager — E-signature". Nobody holds Act on both columns.

So completing QC **authorises nothing**. It removes an objection. The
release is a separate decision by a separate person, and
`20261107000000` additionally refuses a releaser who recorded the
batch's own results.

An earlier version of this entry said the section and the step
disagreed, with the QA Officer holding Act on the batch-release
section. **That was a transcription error in the SQL seed, not
something in the design** — `roleAccess.ts` has View for that cell, and
for `distribution` too, and the seed had Act for both. Two cells,
transposed while re-typing the same grid into a second language.

It was found by rendering the Dispatch page and noticing a QA Officer
shown a read-only notice where the seeded grid said they could act.
`src/tests/sectionGrid.test.ts` now parses the seed out of the
migration and compares it with the TypeScript grid cell by cell, so
the two cannot drift again.

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

---

## 18. The audit chain was computed by the browser

Not a Figma conflict — a finding, recorded beside entry 10 and entry 14
because it is the same shape: a control that looked like one.

`audit_logs` refuses `UPDATE`, `DELETE` and `TRUNCATE`. That part was
real and still holds. The **integrity chain** was not:

- `integrity_hash`, `previous_hash` and `sequence_number` were all
  written by the browser. `src/lib/auditService.ts` read the last row,
  took its hash and its sequence number, and computed a SHA-256 over a
  payload it assembled itself. The browser holds the anon key.
- `verify_audit_chain` compared each row's `previous_hash` to the prior
  row's `integrity_hash` and **recomputed nothing**, so an entry whose
  hash never matched its own contents passed.
- It also filtered on `integrity_hash IS NOT NULL`, so an entry written
  with no hash was not merely unverified — it was **invisible to
  verification**, and the chain closed over the gap.
- The screen's "Hash-Chained" tile counted rows that carry a hash. A
  tampered row carries one too.
- `verifyChainIntegrity`'s own comment said it "re-computes every hash
  in the chain". It did not, and neither did the RPC.

`20261108000000` moves sealing into a `BEFORE INSERT` trigger that
assigns the sequence number, links the previous hash and computes the
integrity hash from the row's contents, discarding whatever the client
sent. `verify_audit_chain` now recomputes the contents of every sealed
entry, checks the linkage of every entry, and treats an unhashed entry
as a finding. The banner says which of those it is reporting.

**Entries written before sealing are not retro-hashed.** Recomputing a
hash over content nobody can vouch for turns an unverifiable entry into
one that looks verified. They are counted separately as `unsealed`, and
the screen says their contents cannot be checked.

Two things are still true and should not be overstated: a sealed chain
is self-consistent, not proof of what happened; and none of this makes
the system validated or establishes regulatory compliance.

*Decision needed:* what to do about pre-sealing entries in existing
workspaces, which can never become content-verifiable.

---

## 19. Two role models, one table further on

The repair started from an application with two disconnected role
models. `certificate_of_analysis` shows the same split in the database:

- Its **update policy** was `app_has_company_role(company_id,
  ARRAY['owner','admin'])` — the platform's legacy pair, unrelated to
  PM-03's eight work roles. In a workspace using work roles, **nobody
  could approve a certificate**: not the QA Officer, not the QA
  Manager, not the compliance admin. The screen offered the button and
  the row silently did not change.
- Its **insert policy** was `app_is_company_member(company_id)`, so
  **any member could issue one** — a statement about a batch made to
  somebody outside the company.
- The **screen** gated approval on `canManageGrcControls ||
  canManageAuditWorkspace`, which is a third model again.

`20261109000000` guards the table on PM-03's `CoA register` column
(Act: QA Officer, QA Manager) and widens the update policy to admit
that cell **beside** the owner/admin clause rather than instead of it —
AND-ing two role models can only subtract, which is how Deviation /
CAPA went missing for every role earlier in this work.

**A refusal on this table is silent, and that is worth knowing.** Row
level security filters the caller's row out before the trigger runs, so
an excluded caller's `UPDATE` succeeds having changed nothing. Every
other table guarded by this work raises `SECTION_FORBIDDEN`. A screen
that reads "no error" as "it worked" will report an approval that did
not happen. Issuing a certificate goes through the trigger instead and
does raise.

*Decision needed:* whether other tables still carry owner/admin
policies that exclude the work roles. This one was found because a test
asserted a refusal and got silence.

---

## 20. PM-04's restrictions now exist, and they bite

PM-04 draws individual restrictions and a per-person history. Both were
passed as empty arrays.

The **history** needed no table: `access_grants` already carries
`granted_at`, `granted_by`, `revoked_at`, `revoked_by`,
`revoke_reason` and `valid_until`, which is the whole of what the panel
prints. A second record of the same events is how two records start
disagreeing.

**Restrictions** needed one, and `20261110000000` adds it with the
property that makes it a feature rather than a row: `app_section_access`
applies an active restriction, so **every section guard honours it
without knowing restrictions exist**. A guard written in
`20261106000000` refuses a person restricted in `20261110000000`.

The alternative — a table the access screen reads and nothing else does
— produces a system that displays a restriction it is not applying,
which is worse than having none, because somebody believes it.

Three choices worth recording:

- A restriction only ever **lowers** (`view` or `none`). Raising
  somebody above their role is what a grant is, and grants have a
  request, an approver and an expiry behind them. A restriction that
  could raise access would be a second, unreviewed route to the same
  place.
- Where two overlap, the **strictest** applies, so adding a gentler one
  cannot loosen an existing one.
- A restriction is **lifted, not deleted**, and what it says cannot be
  edited. The row is the record of a decision; its reversal is another
  decision with its own reason.

Who may set one comes from PM-03's existing step row — "Change roles
and permissions — Compliance admin" — rather than a new rule invented
for the table.

---

## 21. Distribution had a column and no page

PM-03 tabulates eleven sections. Ten had a page. The eleventh,
`Distribution`, is **Act for the Storekeeper** and View for five more
roles — and nothing answered to it, so a storekeeper held Act on a
section they could not open. DB-02's drawn rail carries a *Dispatch*
item and the derived rail had nowhere to send it.

That is the same gap as entry 17. Giving Distribution a record gives
the trace its other end: `batch_dispatches` records which batch went
where, in what quantity, on whose reference, and **only a released
batch may be dispatched** — read from the lifecycle mirror, which is
read-only to direct writes.

It is deliberately small. There is no Figma frame for a dispatch
screen, so it records the few facts a recall needs and nothing more. It
is not an order model and should not become one without a design.

*Decision needed:* whether dispatch needs customers, orders or part
shipments as first-class records. Until somebody says so, a destination
is free text and their reference is a string.

---

## 22. `Issue to production` is still not built, and should not be guessed

DB-02 draws it. It has **no frame of its own and no column in PM-03**,
so there is nothing to build it from: no screen says what it shows, and
no cell says who may use it.

Nothing is routed to it. Issuing material to production is partly
covered by dispensing, which is a step inside running a batch and has
both a design and a gate — so inventing a second, ungoverned route to
the same place would be the worse of the two available mistakes.

*Decision needed:* whether *Issue to production* is dispensing under
another name, or a warehouse step before it.
