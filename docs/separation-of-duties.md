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
| release | recorded its QC results | **enforced**, `mandatory` | An existing product decision: `BATCH_RELEASE_SELF_TESTED` predates this branch |
| release | executed it | **enforced**, `mandatory` | PM-03 separates batch_records (Production Supervisor) from batch_release (QA Manager) |
| dispatch | made its release decision | **enforced**, `conservative_default` | PM-03 separates distribution (Storekeeper) from batch_release (QA Manager), but this separates a decision from a physical movement rather than from the work it judges — the weakest of the three. §5 decision 4 |

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
| disposition | recorded its test results | **enforced**, `mandatory` | The product's own `BATCH_RELEASE_SELF_TESTED` decision, applied where the same facts hold |
| disposition | received the lot | **enforced**, `conservative_default` | Derivable from PM-03; no product decision requires it, so it is the safe reading pending §5 decision 1 |
| disposition | verified its CoA | **not enforced** — not derivable | PM-03 gives *both* columns to qa_manager and qa_officer |
| qc_testing | sampled the lot | **not enforced** — not derivable | Sampling has no PM-03 column at all |

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

## 5. The six decisions

Each is now **implemented with a conservative default** — the reading
that refuses more — except where refusing more would have meant
inventing a rule PM-03 does not contain, which is the one thing that
must not happen here.

A conservative default is not an answer. It is a position held until
there is one, chosen so that being wrong costs a conversation rather
than a release. The database distinguishes the two:

| `decision_status` | Means |
|---|---|
| `mandatory` | an existing product decision requires it |
| `conservative_default` | enforced as the safe reading, **pending your confirmation** |
| `awaiting_decision` | not enforced; needs your answer, and in two cases a PM-03 change first |

`SELECT * FROM duty_decisions_outstanding();` lists everything still
open, so a default cannot become permanent by being forgotten.

---

### The list to approve

| # | Decision | Default implemented | PM-03 impact | Database enforcement | Needs |
|---|---|---|---|---|---|
| **1** | May the storekeeper who **received** a material lot make its disposition? | **No — enforced** (`conservative_default`) | None. PM-03 already gives goods_receipt to the Storekeeper and qa_disposition to QA, with no overlap | `MATERIAL_DISPOSITION_SELF_TESTED`'s sibling `MATERIAL_DISPOSITION_SELF_RECEIVED`, on the lifecycle guard and the release-record trigger | **Your confirmation** |
| **2** | May the person who **verified the CoA** make the disposition? | **Yes — not enforced** (`awaiting_decision`) | **Blocking.** PM-03 gives `coa_register` *and* `qa_disposition` both to qa_manager and qa_officer, so the matrix contemplates one person doing both | None. Enforcing it would make the gate contradict the permission screen | **Your decision AND a PM-03 change** |
| **3** | Must the person who **sampled** a lot be different from the one who tests it? | **Not enforced** (`awaiting_decision`) | **Blocking.** Sampling has no PM-03 column at all | None | **Your decision AND a PM-03 column** |
| **4** | May the QA who **released** a batch also dispatch it? | **No — enforced**, reclassified from `mandatory` to `conservative_default` | None. PM-03 separates distribution (Storekeeper) from batch_release (QA Manager) | `BATCH_DUTY_CONFLICT` on the dispatch gate | **Your confirmation** |
| **5** | Should **qc_analyst** and **production_supervisor** also need a signature to be granted? | **No — unchanged** | **Blocking.** `20261121000000` derives the signature list from `step_permissions` and fails if a seeded role holds no protected step. Neither role has one | None | **Your decision AND a PM-03 change** |
| **6** | Does *"executed the batch"* include recording a single in-process reading? | **Yes — the broad reading**, `conservative_default` | None | `batch_actor_duties` reads `batch_stages.started_by`, `batch_stage_parameter_readings.recorded_by`, `batch_records.execution_closed_by` | **Your confirmation** |

### How to answer

Three of the six (**1, 4, 6**) are *confirm or overturn* — they are
enforced now and you are agreeing or not. Overturning 1 or 4 is one
`UPDATE` in a migration; overturning 6 is an edit to
`batch_actor_duties`.

Three (**2, 3, 5**) are *decide*, and all three need PM-03 changed
before they could be enforced at all. **That is the honest position:
I will not enforce a rule the permission matrix contradicts, because a
gate that disagrees with the screen granting the permission is worse
than no gate.** If you want any of them, the matrix changes first and
the enforcement follows.

### What each default costs if it is wrong

| # | If the default is wrong |
|---|---|
| 1 | A person holding **both** storekeeper and a QA role cannot disposition a lot they booked in. Nobody else is affected — a storekeeper has no Act on qa_disposition to begin with |
| 4 | A person holding **both** qa_manager and storekeeper cannot dispatch a batch they released |
| 6 | A production supervisor who recorded one reading cannot release that batch — and they could not anyway, since production_supervisor has no Act on batch_release. It bites only a multi-role holder |

**Every conservative default costs nothing except to somebody holding
two roles at once.** That is not a coincidence: it is the case PM-03's
arithmetic used to make impossible, and the only case this layer
exists for.

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

| Conservative defaults are listed, so one cannot become permanent by being forgotten | G6c, `duty_decisions_outstanding()` |
| An unenforced pair refuses nobody | G6b |

Full run: **2577 assertions, 0 failed**, from a database dropped and
rebuilt from the migrations.
