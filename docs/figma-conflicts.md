# Conflicts and silences in the Figma file

What this repair found in the design that cannot be resolved by reading
it harder. Nothing here has been settled by implementation; each entry
says what the code does in the meantime and why.

**PM-03 is the provisional authority on permissions.** It is the screen
an administrator uses to grant access, so where another frame draws a
different cell, the code follows PM-03 and the difference is recorded
below rather than split.

Last reviewed: 2026-10-23, against file `wSj81KWfoy7rS8u9CDcqtY`.

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

**DECIDED (2026-10-23).** Finished-product specifications are being
built, and `20261113000000` builds them: an approved, versioned
specification with acceptance criteria and required tests is required
before release; where none exists the gate fails closed and the
refusal names what is missing; no criteria are invented and there is
no bypass.

The model mirrors `material_specifications` — same statuses, same
limit vocabulary (`range`, `min`, `max`, `exact_text`, `complies`,
`absent`) — plus `is_required`, which is what the gate counts. A
specification is frozen on approval; the way on is a new version,
which supersedes the old one going forward while the old one goes on
governing the batches made under it.

See `docs/release-verification.md` §2 for what is enforced and §4 for
the deployment consequence: **in an existing workspace there are no
specifications, so every batch awaiting release is blocked until one
is approved per product**, back-dated for batches already made.

*Still open:* who may approve one. PM-03 has no column for
specifications and no step for approving one, so the database uses the
designated QA authority register — the mechanism that already approves
a master formula and releases a material lot. That is an existing
convention rather than an invented rule, and it is one predicate to
change if the answer differs.

*Still open:* that a batch is judged against the version in force on
its **manufacturing date** rather than at release. Chosen so a
specification tightened later does not retrospectively fail material
made to the older standard. This is a quality judgement with a
regulatory flavour and it has not been confirmed.

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

**DECIDED (2026-10-23).** Preserve them and mark them.
`20261115000000` sets `hash_algo = 'legacy-client-v0'` on every entry
that carries a hash and no convention, and records in
`audit_hash_conventions` — once, authoritatively — why their contents
cannot be verified. `verify_audit_chain` returns that reason, so the
screen prints the database's sentence rather than its own.

No hash, sequence number or timestamp is altered, and **no hash is
computed for them after the fact**: a hash calculated now over content
nobody can vouch for would turn an unverifiable entry into one that
looks verified, which is the worst available outcome.

A row with **no hash at all** is deliberately not marked legacy — it
is reported as `unhashed`, which is a finding. Conflating the two
would hide it.

See `docs/release-verification.md` §1, which also states plainly who
can still alter an audit record: not the application, not a
`service_role` holder, but **yes** a database superuser or anyone who
can restore a dump. There is no external anchor.

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

---

## 23. The owner/admin sweep, and what it turned up

Entry 19 asked whether other tables carried `certificate_of_analysis`'
shape — a write policy admitting only `owner`/`admin`, which excludes
every PM-03 work role and makes an excluded caller's `UPDATE` succeed
having changed nothing. They did, identically:

| Table | INSERT | UPDATE / DELETE |
|---|---|---|
| `batch_records` | any member | owner/admin |
| `batch_qc_results` | any member | owner/admin |
| `raw_material_receipts` | any member | owner/admin |
| `batch_inprocess_qc` | any member | owner/admin |

**`batch_records` was the sharp one.** `updateBatchStatus()` moves the
state through `lifecycle_transition` — `SECURITY DEFINER`, so it
bypasses row level security and succeeds — and then writes the side
columns the screens read with a plain `UPDATE` from the browser:
`released_at`, `released_by`, `release_notes`, `qc_started_at`,
`hold_reason`. For anyone holding a work role that write matched zero
rows. **The batch released and nothing recorded when, by whom, or on
what notes.** The service even has a comment explaining that a failure
there is logged rather than thrown — but it was not a failure, it was
a successful statement that changed nothing.

`20261112000000` widens those policies to admit the relevant cell
beside the owner/admin clause.

**`batch_inprocess_qc` is deliberately left alone.** In-process QC has
its own authority model (`isQaAuthority`, not the grid) and no PM-03
column, so widening it would mean choosing a cell for it — a decision,
not a sweep. Section F of `write_path_audit_test.sql` asserts both the
widened set and this omission, so neither reads as an oversight.

*Decision needed:* which PM-03 column, if any, governs in-process QC.

---

## 24. A QC verdict was editable, and the release gate read it

Found by the same sweep and worse than the policy question.

`20261107000000` made a failed finished-product test block a release.
That gate is only as good as the row it reads, and **nothing stopped a
recorded `pass = false` being `UPDATE`d to true** — after which the
batch releases and the failure has left no trace.

The schema already had an answer for this shape of problem and used it
for batch readings: there is no edit. A correction is a new row
pointing at the one it replaces, both survive, and the log carries who,
when, from what, to what and why. "A correction overwrites the original
value" is one of item 07's NOT DONE IF clauses, and a QC verdict
deserves at least what a mixing speed gets.

So `batch_qc_results` gains `corrected_from_id` and
`correction_reason`; `pass` and `result` are refused to `UPDATE` **in
every context, service callers included**, because there is no
legitimate caller for that edit; and the release gate counts only
results nothing has superseded — otherwise the correction would be
pointless and the original failure would block the batch forever.

The screen shows superseded results, marked, rather than hiding them:
a list of only the standing verdicts would hide the correction, which
is the thing worth recording.


---

## 25. Restrictions reached the sections and not the steps

Found while verifying that PM-04 restrictions apply on every
server-side mutation path, which was the right question to ask.

`20261110000000` made a restriction real by having
`app_section_access` apply it, so six guards honoured one without
knowing restrictions existed. **Five did not.**
`fn_batch_release_role`, `fn_material_lots_disposition_role`,
`fn_deviation_close_role`, `fn_capa_close_role` and
`fn_supplier_approve_role` go through `app_assert_step`, which read
`step_permissions` and `app_work_role` and had never heard of a
restriction.

Those five are PM-03's named steps — releasing a batch, dispositioning
material, closing a deviation, closing a CAPA, approving a supplier.
They are the most consequential actions in the system and they were
exactly the ones a restriction could not touch. **A compliance admin
who restricted a QA Manager's `QA disposition` to none would have
watched them release material anyway.**

`20261114000000` gives `step_permissions` a `section` column — PM-03's
own mapping, stored beside the roles rather than written into a CASE —
and has `app_assert_step` consult the restriction on it.

Two choices worth recording:

- The restriction is checked **before** the role, and read **directly**
  from `access_restrictions` rather than through `app_section_access`.
  The grid returns NULL for a role PM-03 does not tabulate, and that
  abstention is the design declining to rule; an individual
  restriction is not a silence but a named person, a named section and
  a reason, so it applies regardless. Asserted.
- `roles_change` has **no** section, deliberately: changing roles and
  permissions is administration and PM-03 gives it no column. A second
  step appearing with no section fails the migration, because it would
  be a step no restriction could reach, silently.

---

## 26. A verdict that contradicts its own specification

Not a design conflict — a control that only became possible once
specifications existed, recorded because it changes what "pass" means.

`batch_qc_results.pass` is typed by a person. The limits now come from
an approved specification. Where the two can be compared and disagree —
a result of `97.2 %` recorded as a pass against a 99–101 range — the
**specification wins** and the batch waits.

The comparison has a limit that is asserted rather than hoped for:
`product_test_meets_criterion` reads the first number out of a result,
so a textual result against a numeric limit returns NULL, meaning *not
judged*, and the recorded verdict stands alone. **Somebody can still
pass a batch by typing words where a number belongs.** `complies` and
`absent` limits are never machine-checked at all, because they are
judgements.

*Decision needed:* whether a result against a numeric limit should be
refused unless it parses as a number. That would close the gap and
would also refuse legitimate entries like `"< 0.1"`, which is why it
has not been done unasked.

---

## 27. Who may approve a specification

Not a design conflict — PM-03 has no *Specifications* column at all,
which is the silence. §12 recorded that nothing says which
finished-product tests a batch needs; this records who is allowed to
say it.

**Decision, taken 2026-10-23: the QA Manager, and nobody else.**
Enforced server-side in
`20261117000000_specification_approval_by_qa_manager.sql`:

- `product_specification_approve` resolves the caller's work role and
  raises `PRODUCT_SPEC_FORBIDDEN` unless it is `qa_manager`. The
  message names the caller's actual role, and the hint says
  **"Administrative access does not carry this authority."**
- `owner` and `admin` are refused by the same clause as any other
  role. There is no administrative bypass, and the assertion that
  there is none is in section A of
  `supabase/tests/decisions_and_step_restrictions_test.sql`.
- The approval records `approved_by`, `approved_by_role`,
  `approved_at` (server clock, never supplied by the caller),
  `effective_date`, the specification `version`, and
  `approval_signature_id`.
- The signature is bound to `product_specification_record_hash`, a
  hash over the version and its ordered tests, so **a signature
  cannot survive an edit to the criteria** — change a limit after
  signing and approval is refused as stale.
- `fn_product_spec_approval_evidence` refuses any `effective` row that
  lacks the evidence, so the status cannot be reached by a side door.

The 2-argument overload of `product_specification_approve` was
**dropped**, deliberately: leaving it would leave a callable path with
no signature argument.

**Pending final quality/regulatory confirmation.** Whether a single
QA Manager approval is sufficient, or whether a second authorised
signature is required, is a quality-system question this branch does
not settle. One predicate changes if the answer differs.

Two things this exposed on the way:

- `lifecycle_consume_signature` could not be used. It reads
  `entity_current_state`, which returns NULL for a specification,
  so **every human approval would have been refused
  `LIFECYCLE_SIGNATURE_STALE`** — a control that refuses everyone is
  not a control. Hence the specification-specific hash and
  `product_specification_sign`.
- `material_qa_authorities`, the register the earlier mechanism read,
  is **empty on the live project**. The pre-decision approval path had
  nobody in it and would have refused every approval. Recorded in
  `docs/live-readiness.md` §5.

---

## 28. Which version governs, and what happens when it changes

§12 left this open and §26 inherited it. Now decided.

**Decision, taken 2026-10-23: the approved specification effective at
the time of manufacture**, implemented in
`20261118000000_governing_specification_preserved.sql`.

What that means concretely:

- `batch_governing_specification` looks for the specification whose
  `effective_date` is on or before the batch's `manufacturing_date`,
  taking the latest such version.
- The lookup reads `status IN ('effective', 'superseded')`, which is
  the clause that matters: filtering on `'effective'` alone meant a
  batch made under version 1.0 **found no specification the moment 2.0
  was approved**, and the batch that had been releasable yesterday was
  blocked today by someone else's paperwork. Caught by assertion, not
  by reasoning.
- At release, `fn_batch_stamp_governing_specification` writes the
  resolved version into `batch_records.governing_specification_id`
  with a `governing_specification_stamped_at`. From then on the batch
  carries the criteria it was judged against, rather than re-deriving
  them each time anyone looks.
- `fn_batch_governing_spec_locked` refuses to change that stamp. The
  only way past it is `batch_specification_review(batch, to_spec,
  reason, signature)`, which records the old version, the new version,
  the reason and the signer in the immutable
  `batch_specification_reviews`, and sets a session flag the lock
  recognises. **A reassessment is therefore a visible controlled
  review, never a silent replacement of historical criteria.**

**Pending final quality/regulatory confirmation.** "Effective at
manufacture" is the proposed rule, subject to confirmation against the
applicable regulatory requirements and the site's quality procedures.
The alternative readings — effective at release, or effective at test
— would each change which version a batch is judged by, and the choice
is not the software's to make.

**Batches released before this existed carry no stamp**, and none is
back-filled. Stamping one would assert a judgement that never took
place; the effective-date lookup still answers for them.

---

## 29. The live project cannot hold a work role

Not a Figma conflict. Recorded here because it decides whether
anything in this register is enforced.

`company_members.role` on the Criateur project is enum `company_role`
= `owner, admin, legal, marketing, viewer`. **None of PM-03's eight
roles is in it**, no enum anywhere contains `qa_manager`, and all 21
members hold `owner`.

The abstention policy — a role PM-03 does not tabulate abstains rather
than being refused — is deliberate and documented, and here it has a
consequence: deploy as-is and **every guard abstains for every member,
so the whole layer is installed and silent.** §27's QA Manager
requirement would refuse everyone, because nobody can hold the role.

Extending the enum is not in this branch, because it means deciding
what becomes of the five existing values and of the 21 people holding
`owner`, and whether a person may hold more than one role. Those are
organisational answers. Set out in
[`docs/live-readiness.md`](live-readiness.md) §2 as release blocker 1.

---

## 30. A migration recorded as applied that left nothing behind

`20260225000000_immutable_audit_trail` is in the live migration ledger
as applied. Its triggers are **not on the table**, and
`fn_block_audit_mutation` does not exist. Only
`trg_prevent_audit_log_deletion` is there.

Audit entries on the live project are UPDATE-able today.

Two findings, not one. The second is the more useful: **the migration
ledger records what was run, not what survived.** A later `DROP …
CASCADE`, a restore from an earlier dump, or a manual drop would each
produce this, and the ledger distinguishes none of them. Any assertion
of the form "control X is present because migration Y is applied"
is unsound on this database, and several such assertions were being
made before this was checked — including §1 of
`docs/release-verification.md`, now corrected.

`20261116000000_restore_audit_immutability.sql` recreates the function
and the three triggers, and **self-tests them by attempting the
refused writes** inside a rolled-back subtransaction rather than
checking that a trigger exists — precisely because existence turned
out not to imply effect.

Related and separate: `scripts/repair_audit_chain.mjs` **ran against
this project**, inserting a `CHAIN_REANCHOR` entry with a back-dated
`created_at` and rewriting the next entry's `previous_hash`. The
script is withdrawn and now throws; the entry is left in place and
documented rather than rewritten again. Full account in
[`docs/audit-threat-model.md`](audit-threat-model.md) §4.

---

## 31. Two registers, because they answer two questions

§29 recorded that the live project cannot hold a PM-03 role, and left
extending the `company_role` enum as the open question. The answer is
that the enum should not be extended at all.

`company_members.role` says what somebody **is to the workspace** —
owner, admin, legal, marketing, viewer. PM-03's eight say what they
**may do on the floor**. Merging them would make an operational role
as casual as an invitation, and make withdrawing one destroy the
record that it was ever held.

`20261119000000` therefore leaves that column untouched — not a value,
not a constraint, not a row — and adds
`operational_role_assignments`: company-scoped, several per person,
each with a reason, an assigner and a timestamp, revoked rather than
deleted.

Four decisions worth recording, all **pending final
quality/regulatory confirmation**:

- **Access is the union across held roles.** Two roles granted on
  purpose grant both columns; taking the lesser would mean adding a
  role removes access, which nobody intends when they add one. An
  individual PM-04 restriction still lowers the result, because a
  restriction names one person and outranks any of their roles.
- **Assignment is the workspace owner's or admin's, or a compliance
  admin's** — PM-03's own *Change roles and permissions*. The first
  authority exists so a first operational role can ever be granted;
  it appoints a QA Manager without becoming one.
- **Never yourself.** An admin who can grant themselves `qa_manager`
  can release their own batches. The consequence is real and
  deliberate: **a one-person workspace cannot create its first
  operational role.** Recorded as a constraint rather than worked
  around, because the only way around it is self-assignment.
- **Standing down is not self-elevation.** You may always revoke your
  own role, never grant one.

What the suite found, because none of it was visible by reading:

- `app_assert_section_act` still resolved a single role. The
  migration's own assertion refused to install until it did not.
- The first draft's write policies made the authority trigger
  **unreachable**: RLS refused before it ran, so every refusal was
  dead for application callers and exempted for service ones — the
  dead-guard hazard of §10 and §25, a third time. The policies now
  ask only the membership question and the trigger asks the authority
  question, so a direct INSERT and the RPC meet the same refusals.
- A service caller could **re-stamp a revocation**, moving the date
  somebody lost an authority. The integrity checks now run ahead of
  the service exemption. Authority is a question about a person and a
  migration is not one; what a row means is the same question whoever
  asks it.

---

## 32. The grid was being read twice, and the two readings disagreed

Not a Figma conflict. A divergence between the design's rule and the
screen's reading of it, found while wiring §31.

`resolveWorkRole` in `src/lib/access/roleAccess.ts` mapped `owner`,
`admin` and `compliance_officer` to `compliance_admin`. On the live
project, where all 21 members hold `owner`, **every one of them was
being shown the compliance admin's navigation and dashboards** while
the server abstained for them and granted nothing.

Nothing was exposed by it — the database refused the writes — but the
screen and the database were telling the person different things
about what they could do, and the screen was the one they believed.

The three mappings are removed. Genuine spelling normalisations
(`QA Manager`, `qa-manager`, `quality_manager` → `qa_manager`) stay:
three spellings of one job is data to read, not a conversion.
`resolveWorkRoles` now mirrors `app_work_roles`, `pageRefused` reads
the whole set rather than a sole role that would be NULL for anyone
holding two, and `AuthContext` loads the assignments alongside the
profile.

*Decision taken:* a failed assignments lookup is logged and read as
"holds none" rather than thrown. A client signing in against a
database where `20261119000000` is not yet applied still works, and
holding no role abstains — so the failure mode is the inert state, not
a locked-out workspace.

---

## 33. PM-03 separated duties by arithmetic, and that stopped being true

§31 lets one person hold both `qc_analyst` and `qa_manager`. PM-03
never contemplated it: QC testing is the Analyst's column alone and
batch release the Manager's alone, so "nobody holds both" used to be
true by construction rather than by any rule.

`20261120000000` enforces it against the **batch** instead. Whoever
recorded a batch's QC results or executed it may not release it;
whoever released it may not dispatch it.

The property that makes this reviewable: **the pairs are derived from
PM-03, not chosen.** A pair is admissible only where the matrix gives
the two sections Act to role sets that do not overlap — where the
design had already separated them. The migration computes that from
`section_permissions` and refuses to install if any seeded pair shares
an Act role, so a rule the design does not contain cannot be seeded
into existence.

Three limits, asserted rather than hoped for:

- It reads the recorded actor columns (`tested_by`, `started_by`,
  `recorded_by`, `execution_closed_by`, `released_by`,
  `dispatched_by`). **An action that records no actor is invisible to
  it.**
- It is separation of duties, not collusion detection. Two people
  defeat it and nothing here claims otherwise.
- It is batch-scoped. The material-side equivalent — QA disposition of
  a lot against its own QC test — is **not addressed**, and is a
  question still open.

*Decision needed:* whether these three pairs are the right three. They
are a table precisely so that a quality system which disagrees deletes
a row rather than editing a function.

---

## 34. Appointing a QA Manager is itself a GMP act

§31 required a reason, an assigner and a timestamp for every
operational role. For the roles that carry a quality authority that is
not enough: appointing a QA Manager is the act that decides who may
release batches, and it should be signed by the same mechanism that
signs the release.

`20261121000000` requires an electronic signature to grant or revoke a
**GMP-critical** role, minted by password through the existing
throttled path. No second way to produce one, and no test-only path.

**Which roles is derived, not chosen.** A role needs a signature when
PM-03 names it in `step_permissions` — when it carries one of the five
authorities the design singled out. That is `qa_manager`, `qa_officer`
and `compliance_admin`. The migration fails if a seeded role holds no
protected step, and raises a NOTICE the other way, because a role
PM-03 trusts with a step that needs no signature to grant is a gap
rather than a decision.

The binding is to the **action**, not the record: at grant time there
is no row yet, so the hash covers company, person, role, action and —
for a revocation — the assignment. A signature for appointing one
person cannot be replayed to appoint another, in another company, to
another role, or in the other direction.

*Decision needed:* whether `qc_analyst` and `production_supervisor`
should join the list. The derivation permits it only if PM-03 gives
them a protected step, which today it does not — so this needs the
matrix changed, not just a seed.

**No existing signing control was weakened.**
`electronic_signatures.meaning` carries a fixed Part 11 vocabulary;
signing a role action records `approved` — of the appointment, or of
the withdrawal — rather than widening the vocabulary to add a word
`action` already carries.

---

## 35. A workspace of one cannot verify itself

§31 refused self-assignment outright, which means a workspace with one
active member can never create its first operational role. Correct as
a rule, unusable as a product.

**The honest finding first: independent verification is impossible
here, and the design does not pretend otherwise.** Independent
verification means a second party who is not the person being
appointed. In a workspace of one there is no second party — the owner
controls the account, the password and the email. A code sent by email
and a signature taken with the same password verify the same thing.

So `operational_role_bootstrap` makes the act narrow, signed,
declared, marked and reported instead:

- **narrow** — refused the moment any other owner, admin or compliance
  admin exists who could appoint properly, so it is unavailable
  wherever the ordinary path works;
- **signed** — always, even for a role that would not otherwise need
  one;
- **declared** — a written statement of what authority is held and
  under what appointment;
- **marked** — `provenance = 'bootstrap_self_declared'`, permanently,
  and the immutability trigger refuses to edit it;
- **reported** — listed with the finding *"Authority is declared, not
  independently verified."*

The compensating control is **external**: the registered QA person is
named on the regulatory submission, and that document says whether the
declaration is true. A reviewer compares the two.

Ordinary self-assignment stays refused everywhere, including here.
Bootstrap is a separate function with its own conditions, not an
exception bolted onto the general path.

---

## 36. The rules themselves were writable

Found by the security recheck, not by design, and the most serious
thing in this register.

```sql
SET ROLE authenticated;
DELETE FROM public.duty_conflicts;      -- DELETE 6
DELETE FROM public.gmp_critical_roles;  -- DELETE 3
```

Both succeeded. Any signed-in user — and `anon`, which is every
visitor — could have removed every separation-of-duties rule and every
signature requirement. The gates would then have run on every write
and found nothing to object to.

The cause is the project-wide default grant: a new table in `public`
arrives with full DML for `anon` and `authenticated`, and §33's and
§34's migrations created their tables without RLS on the reasoning
that the rows are not tenant data. They are not — they are something
more sensitive, and the other rule tables had been protected by RLS
without anyone having said so.

`20261123000000` revokes the write privileges on all six rule tables
and adds RLS with a read-only policy as a backstop. Its assertion
**runs the DELETE** rather than checking that a privilege is absent,
because "the privilege looks right" was true of four of those tables
the whole time the other two were open.

The lesson worth keeping: **a control is only as strong as the table
it reads its rule from.** Moving a rule out of a function body and
into a table — which §31 and §33 both did, for good reasons — moves
the thing that has to be protected, and that move was not noticed
until somebody went looking.

---

## 37. Work that nobody is left to finish

§31 decided what happens to work in progress when its owner loses a
role: nothing is auto-completed and nothing is auto-cancelled. The
work stands, still attributed to whoever did it, and somebody who
holds the authority finishes it.

The gap that left, and §34 recorded it as a gap: **nobody is told.** A
half-finished batch whose supervisor left sits in `in_progress` and
the only way to find it is to go looking.

`20261124000000` closes it with three parts, in this order:

- **a report** — `operational_role_stranded_work(company)` reads the
  lifecycle history that already exists. Stranded means all three: the
  record is unfinished, its last actor has lost an operational role
  *in this company*, and what they have left does not let them carry
  on. That middle condition is what keeps it from listing every record
  ever touched by somebody without a role;
- **a notice** — one per person who could act on it, emitted when the
  revocation happens. Not one per stranded record: a revocation that
  strands forty batches should produce a sentence, not forty. Not to
  the person who lost the role, who by definition cannot act on it;
- **a reassignment** — authorised, auditable, and **additive**.

The third is where the care went. A reassignment never touches the
record's own attribution: who did the work is a fact, and who carries
it on from here is a second fact recorded beside it. It is refused
unless the caller administers roles or can act in the section, refused
if the target cannot act in that section — reassigning to somebody
equally unable moves the problem and closes the report entry, which is
worse than leaving it open — and refused for anything that is not
actually stranded, so it cannot become a general transfer-of-ownership
tool beside the lifecycle guards.

*Not built:* this is not a task register. §8 records that the design
has none, and inventing one here would be inventing a workflow.

---

## 38. The six duty decisions, answered conservatively

§33 left six questions. Each now has a **conservative default** — the
reading that refuses more — except where refusing more would have
meant inventing a rule PM-03 does not contain.

`20261125000000` adds a third `decision_status`, because "enforced"
was carrying two different meanings:

| | |
|---|---|
| `mandatory` | an existing product decision requires it |
| `conservative_default` | enforced as the safe reading, **pending confirmation** |
| `awaiting_decision` | not enforced; needs an answer, and in two cases PM-03 changed first |

Three pairs are now enforced as conservative defaults: the receiver
may not disposition a lot, the releaser may not dispatch a batch, and
"executed it" keeps its broad reading. Three are not enforced, and
**two of those cannot be** without changing PM-03 first — the CoA pair
because the matrix gives both columns to the same roles, sampling
because it has no column at all.

Two things worth recording about the shape of this:

- **Every conservative default costs nothing except to somebody
  holding two roles at once.** Not a coincidence: that is the case
  PM-03's arithmetic used to make impossible, and the only case this
  layer exists for.
- `duty_decisions_outstanding()` lists everything still open, so a
  default cannot become permanent by being forgotten. A reclassified
  row is a visible row.

`20261125000000` also adds `duty_definitions`, which says in words
which recorded actions count as having performed each duty. That lived
only inside two PL/pgSQL function bodies, where a reviewer would have
had to read code to find out whether one in-process reading counts as
executing a batch. It does, and that is a judgement, so it belongs
beside the rule it feeds.

---

## 39. A search box that discarded what people typed

HS-01 row 2 of the design's own dead-end register, still live in the
code: the top-bar field *"Search batches, lots, records…"* had no
`value`, no `onChange` and no handler. It took typing and threw it
away, in the old product and in this one.

The register's instruction is conditional — build a number lookup, *"or
if it isn't ready by Thursday, remove the field"* — and it is not
ready: a lookup across lots, batches, deviations, certificates and
licences with its own not-found state is a piece of work, not a patch.

**Removed.** A search box that silently discards what somebody types
is worse than no search box, because they believe they have searched,
and on a compliance system that belief can end an investigation early.
Restoring it means building the lookup, not re-adding the input.

Two related findings from the same audit:

- The **notifications bell**, which row 3 says to remove because there
  was nothing to put in it, is wired and now carries §37's notice. The
  register entry is out of date and the bell stays — a disagreement
  with the design file, recorded rather than silently taken.
- **Traceability** drew a dropdown holding one disabled line and a
  Trace button that could never be pressed, on a workspace with no
  lots. Identical to the defect found on the specifications screen in
  an earlier round, in a different file — which suggests the pattern
  rather than the page was the problem. Both now say which register is
  empty and where the first record comes from.

`docs/screen-audit.md` has the full pass, including the three pages
that had no branch at all for a load that fails.

---

## 40. The gate is now stricter than the matrix, on purpose

Decision 2 of the finalisation brief: the person who verified a
material lot's certificate of analysis may not then make its
disposition.

PM-03 does not derive that. It gives `coa_register` **and**
`qa_disposition` both to `qa_manager` and `qa_officer`, so the matrix
contemplates one person doing both — which is why §33 recorded the
pair as unenforceable without a ruling.

The ruling came, so `20261128000000` adds a second, narrower authority
rather than loosening the first:

| `duty_conflicts.authority` | Means |
|---|---|
| `derived_from_pm03` | the matrix already separates the two columns |
| `approved_by_quality` | a named decision that goes beyond the matrix, and must carry a written reference |

A CHECK refuses an `approved_by_quality` pair with no reference, the
migration asserts the reference is long enough to be one, and the
original guard still refuses any pair that *claims* PM-03 as its
authority without being derivable from it. The second route cannot be
used to smuggle a rule in; it can only be used to record one that
somebody signed for.

**The matrix itself is unchanged**, and that is the standing
divergence: the permission screen will go on showing a QA Officer able
to do both while the gate refuses it on the same lot. Changing PM-03
instead would alter what those two roles reach across the whole
product, which is a larger change than the decision asked for. If the
design is ever updated to separate the columns, the migration raises a
NOTICE saying the special authority can be dropped.

*For the design to resolve:* whether PM-03 should be redrawn so the
matrix and the gate agree.

---

## 41. Three columns the guards read, and nobody was writing

The most serious thing found in this round, and it was found by
checking the columns rather than trusting them.

`material_lots.received_by` was **never set by the application**.
`receiveLot()` inserts a lot without it. So decision 1 —
`MATERIAL_DISPOSITION_SELF_RECEIVED`, enforced since §38 — read NULL
for every lot the product created and could not fire. A guard
installed, attached and unreachable: the fourth time this schema has
produced one.

Two more were being written by whoever was asking:

- `batch_qc_results.tested_by`, supplied by the client on a direct
  INSERT. The release gate refuses a releaser who recorded the batch's
  results, and that refusal is worth nothing if the recorder chooses
  the name on the row.
- `material_test_results.analyst_id`, defaulted to `auth.uid()` by
  `material_test_record_result` — so the default was right and any
  caller could override it.

`20261126000000` writes all four from the session (the fourth is
`batch_stage_parameter_readings.recorded_by`, for decision 6) and
freezes each once set. The gate is on `app_is_service_context()` and
not on `auth.uid()` being null — the first draft used the latter and
broke four suites, because `request.jwt.claims` survives a `RESET
ROLE` and fixtures running as postgres were having their attribution
rewritten to the last person impersonated.

**A separation-of-duties rule is exactly as good as the attribution it
reads.** None of this was new policy; it was existing policy made
reachable, and the proof is that seven test fixtures then had to stop
using one person for two jobs.

---

## 42. Signing the verdict the gate reads

Decision 5. §34 required a signature to *grant* a GMP-critical role;
this is a signature on the *actions* those roles perform.

Taken from the workflow model rather than from a list of things that
sound important: an action needs a signature when a later control
reads its result and acts on it. That is the finished-product QC
verdict — the release gate reads `pass` and the recorded value and
refuses the batch on them — and it is now enforced.

Two more are registered and **held**: the material test result, held
pending the site's testing procedure, which decides whether every
result is signed or only critical parameters; and closing batch
execution, held because stage completion is already signed by
`batch_stage_complete` and on some sites closing is clerical. Both are
rows in `signed_quality_actions` with `required = false`, so "we
looked at this and are waiting" is distinguishable from "nobody
considered it".

The signature is taken over the **verdict** — action, record, test,
value and pass/fail — not over a row id. Signing an id would let the
values be edited afterwards with the signature still attached; signing
the values means an edit invalidates it, which is the property that
makes a signature worth taking. Single use by unique index, bound to
its signer, and the Part 11 `meaning` vocabulary is **not widened**: a
verdict is `authored` and `action` carries which verdict it was.

One ordering lesson, caught by the suite: the signature check must
fire **after** the section guard and the validity rules. Asking
somebody to sign a result they are not allowed to record, or one with
no verdict in it, answers the wrong question — four assertions about
authority began failing on a missing signature instead. BEFORE
triggers run alphabetically, so the trigger is named to sort last and
says why.

---

## 43. Two certificates, one column name

§40 recorded decision 2 — the CoA verifier may not make the
disposition — as diverging from PM-03 because `coa_register` and
`qa_disposition` both give Act to `qa_manager` and `qa_officer`.

The conclusion was right and the reason was wrong, which matters
because the reason is what a reviewer reads and what
`duty_pair_is_derived()` consults.

There are **two** certificate acts in this system:

| Act | Table | PM-03 column | Screen |
|---|---|---|---|
| **Outgoing** — issued from a released batch | `certificate_of_analysis` | `coa_register` | CoA register |
| **Incoming** — the supplier's, checked against the material specification | `material_certificates_of_analysis` | **none** | none |

Decision 2 is about the incoming one. So the pair is not derivable for
a stronger reason than the one recorded: **PM-03 does not tabulate the
act at all.** Not a role overlap — an absent column.

`20261129000000` corrects the label to `incoming_coa_verification`, a
marker that is deliberately not a grid column, and asserts that it
does not quietly become one — if it ever did, the pair would turn
"derivable" and stop demanding its explicit approval.

Two things found while establishing this, both recorded rather than
acted on:

- **`material_coa_verify()` is guarded by company membership and
  nothing else.** Any active member can verify an incoming
  certificate. It predates this branch, no screen calls the RPC, and
  closing it means choosing which role owns the act — which is the
  decision itself.
- **The obvious PM-03 fix does not work.** Splitting the two QA roles
  across `coa_register` and `qa_disposition` would leave one of them
  holding the `material_disposition` step whose section they may not
  act in. `fn_material_lots_disposition_role` asserts the step, so the
  inconsistency would not surface as a refusal — it would surface as a
  screen hiding a control the database still allows.

The real change is a twelfth PM-03 column, and granting it to somebody
means granting a role a new authority.
[`docs/decision-note-coa-separation.md`](decision-note-coa-separation.md)
sets out the exact seed, the affected roles and screens, and three
options. *For the design to resolve.*
