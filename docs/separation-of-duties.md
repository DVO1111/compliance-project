# Separation of duties: what is enforced, and on whose authority

The batch chain and the material chain, audited together. For each
pair of duties: whether one person may do both, what that conclusion
rests on, and whether it is mine to draw or yours.

Nothing here establishes regulatory compliance or validation.

Last reviewed: 2026-10-23. Nothing applied to production.

---

## 1. What I could validate against, and what I could not

The direction asks that the conflicts be validated "against the actual
quality procedures". **Those procedures are not available to me.**
Concretely:

- there is no quality manual, SOP or procedure document in the
  repository;
- `sop_documents` on the local build is **empty**, and no migration
  seeds one;
- the Figma file carries PM-03 (the permission matrix) and the screen
  designs, not written procedures.

So the validation below rests on two sources, both of which are in the
product and neither of which is a site SOP:

| Source | What it can settle |
|---|---|
| **PM-03**, the permission matrix | Which duties the *design* already separates, by giving two sections' Act to role sets that do not overlap |
| **Existing product decisions** | Rules the product already made and shipped, which extend to the same facts elsewhere |

Anything that needs a third source — the site's own written procedure,
or a regulatory requirement — is listed in §5 as **yours to decide**,
and is implemented as an unenforced row rather than as an assumption.

**If any of this contradicts the site's actual procedures, the
procedures win and the table changes.** That is why the rules are rows
and not code.

---

## 2. The derivation rule

A conflict pair is **derivable** when PM-03 gives the two sections'
Act to role sets that do not overlap — i.e. when the design had
already arranged that one person could not do both.

`duty_pair_is_derived(section_a, section_b)` computes it, and both
`20261122000000` and the suite refuse to let an enforced pair exist
that fails it. So a rule the matrix does not contain cannot be seeded
into existence by editing a seed.

PM-03's Act columns, for reference:

| Section | Act |
|---|---|
| goods_receipt | storekeeper |
| material_lots | storekeeper |
| qc_testing | qc_analyst |
| qa_disposition | qa_manager, qa_officer |
| coa_register | qa_manager, qa_officer |
| batch_records | production_supervisor |
| batch_release | qa_manager |
| distribution | storekeeper |

Derivable is not the same as required. It means enforcing the pair
would *read* the design rather than *overrule* it. Whether to enforce
it is still a decision.

---

## 3. The batch chain

| Attempting | Blocked if they already | Status | Rests on |
|---|---|---|---|
| release | recorded its QC results | **enforced** | An existing product decision: `BATCH_RELEASE_SELF_TESTED` predates this branch |
| release | executed it | **enforced** | PM-03 separates batch_records (Production Supervisor) from batch_release (QA Manager) |
| dispatch | made its release decision | **enforced** | PM-03 separates distribution (Storekeeper) from batch_release (QA Manager) |

### Why these three are mine to draw and not yours

The first was already the product's rule; this branch only moved it
into a table. The second and third are readings of PM-03: the design
gave those columns to roles nobody could hold at once, so one person
doing both was never contemplated by it. Multiple role assignment made
it possible, and these restore the arrangement the matrix described.

### Where I would flag the weakest of the three

**Dispatch after release** is the one I would most expect a quality
system to disagree with. The other two separate a *decision* from the
*work it judges*; this one separates a decision from a physical
movement that happens afterwards. It is derivable, and it is a real
control (the same person cannot both authorise and ship), but if your
procedure puts dispatch under the QA who released, this is the row to
delete.

### What "executed it" means

`batch_actor_duties` reads `batch_stages.started_by`,
`batch_stage_parameter_readings.recorded_by` and
`batch_records.execution_closed_by`. Someone who started one stage of
a batch is treated as having executed it. That is deliberate — a
narrower reading would let a supervisor record one reading and still
release — but it is a judgement, and a plant where supervisors
routinely record a reading on batches they later release will find it
strict.

---

## 4. The material chain

Receive → sample → test → verify the CoA → disposition → release.

| Attempting | Blocked if they already | Status | Rests on |
|---|---|---|---|
| disposition | recorded its test results | **enforced** | The product's own `BATCH_RELEASE_SELF_TESTED` decision, applied where the same facts hold |
| disposition | received the lot | **not enforced — your decision** | Derivable from PM-03, but no product decision requires it |
| disposition | verified its CoA | **not enforced — not derivable** | PM-03 gives *both* columns to qa_manager and qa_officer |
| qc_testing | sampled the lot | **not enforced — not derivable** | Sampling has no PM-03 column at all |

### The one that is enforced

Whoever recorded test results on a material lot may not make its
disposition decision — `MATERIAL_DISPOSITION_SELF_TESTED`. This is the
batch rule applied to the other chain: the product already decided
that a tester does not judge their own results, and a material lot is
the same situation with different tables. Applying an existing
decision to the place it obviously reaches is not inventing a rule.

Enforced at three points, because the route must not matter:

- `fn_material_lots_disposition_role` — the lifecycle guard, so any
  transition to `approved` or `rejected` is covered whatever RPC
  caused it;
- `fn_material_release_record_duties` — a direct INSERT into
  `material_lot_release_records`, checking the `authorised_by` and
  `released_by` named **on the row** rather than `auth.uid()`, because
  a row can name somebody else;
- `material_lot_release()` reaches both.

### The one PM-03 forbids me from enforcing

**CoA verification and disposition.** PM-03 gives `coa_register` and
`qa_disposition` both to `qa_manager` and `qa_officer`. The matrix
contemplates one person doing both. Enforcing a split here would
*contradict* the design rather than read it, so I have not, and
`duty_pair_is_derived('coa_register','qa_disposition')` returns false
to say so.

If your procedure does require the split, it needs PM-03 changed
first — otherwise the matrix and the gate would disagree, and the
assertion in `20261122000000` would fail the deployment, which is the
behaviour I would want.

---

## 5. What needs your decision

Each of these is a row in `duty_conflicts` with `enforced = false` and
`decision_status = 'awaiting_decision'`, so it is visible in the
database rather than only in this file. Accepting one is an `UPDATE`
in a migration, not new code.

| # | Question | If yes |
|---|---|---|
| 1 | Should the storekeeper who **received** a material lot be barred from its disposition? | `UPDATE duty_conflicts SET enforced = true, decision_status = 'mandatory' WHERE scope='material_lot' AND duty_a='disposition' AND duty_b='receipt'` |
| 2 | Should the person who **verified the CoA** be barred from the disposition? | Needs PM-03 changed first — see §4 |
| 3 | Should **sampling** be separated from testing? | Needs a PM-03 column for sampling, which does not exist |
| 4 | Is **dispatch after release** right for your site? | If not, delete that row |
| 5 | Should `qc_analyst` and `production_supervisor` also require a **signature** to be granted? | Add them to `gmp_critical_roles` — the derivation assertion permits it only if PM-03 gives them a protected step, which today it does not |
| 6 | Does "executed it" include recording a single in-process reading? | §3; narrowing it means editing `batch_actor_duties` |

I have not guessed at any of these.

---

## 6. What this does not cover

Stated because a control described only by what it catches is a claim,
not a control.

- **Actions that record no actor.** Both readers work from the actor
  columns. An action written by a path that leaves them NULL is
  invisible to the check.
- **Collusion.** Two people defeat every rule here, by design. This is
  separation of duties, not fraud detection.
- **Shared accounts.** Everything rests on one person being one
  `user_id`. Nothing in the database can tell otherwise.
- **The same person in two companies.** Duties are scoped to the batch
  or lot, so a conflict in one workspace says nothing about another.
  That is correct, and it means a contractor serving two sites is
  separately unconstrained in each.
- **Retrospective change.** If a pair is enforced later, batches and
  lots already completed under the old arrangement are not revisited.
  The check runs when an action is attempted.

---

## 7. Test evidence

`supabase/tests/role_signatures_and_duties_test.sql`, sections E–G,
plus `operational_role_model_test.sql` section F.

| What | Where |
|---|---|
| One person holding **QC Analyst and QA Manager**, with Act on both columns | E1–E3 |
| …and refused release on the batch they tested | F2 |
| …and permitted on a batch they did not | F3 |
| A **retry** is refused identically, not rate-limited into success | F4 |
| A **role change after work began** moves nothing — the duty is what they did, not what they hold | F5 |
| Whoever closed execution may not release | F6–F7 |
| Every gate **consults** the check (the dead-guard test) | F8–F10 |
| Material: the analyst's duty is seen, and refused at disposition | G1, G3 |
| …and somebody else may, so it is not an outage | G4 |
| The **unenforced** pairs refuse nobody | G5–G6 |
| The CoA pair is **not derivable**, asserted | G7 |
| Every enforced pair **is** derivable, asserted | G8 |
| Through the **lifecycle engine** | G9 |
| Through a **direct database write** naming someone else | G10 |
| End-to-end through the real release gate | `batch_release_gate_test.sql` §H (predates this branch) |

Full run: **2538 assertions, 0 failed**, from a database dropped and
rebuilt from the migrations.
