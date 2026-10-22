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

DB-01 and DB-02 list five destinations with no page in this codebase:
**My tasks**, **Goods receipt**, **QC testing**, **QA disposition**,
**Traceability**. DB-02 adds **Issue to production** and **Dispatch**.

Each is routed to a panel that says the screen is not built and what it
will do, rather than being omitted or pointed at the nearest existing
page.

---

## 8. There is no task register

Both dashboards draw a routed task list. Nothing in the schema holds a
work item assigned to a person; the only `assigned_to` column belongs
to `ai_incidents`, a different product area.

The list is derived: a record in a state only this role can move is a
task for this role, which is what the design's own example rows are.
The derivation has **no due date and no urgency ordering**, because
nothing records them — the design shows "Today" and "Overdue 2 days"
and the code shows a dash rather than inventing an age.

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
