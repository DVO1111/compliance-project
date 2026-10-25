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
| dispatch | made its release decision | **enforced**, `mandatory` | PM-03 separates distribution from batch_release. Confirmed in the brief as decision 4, together with a refusal to record a dispatch dated before its release |

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
| disposition | received the lot | **enforced**, `mandatory` | Derivable from PM-03; ruled in the brief as decision 1 |
| disposition | verified its CoA | **enforced**, `mandatory` | **Not derivable.** Ruled in the brief as decision 2 and enforced on a named approval — §5.1 |
| qc_testing | sampled the lot | **not enforced** | Sampling has no PM-03 column. Decision 3 awaits the site procedure |

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

## 5. The six decisions — ruled, and what was implemented

All six were decided in the finalisation brief. What each now does,
and what it rests on.

| # | Decision | Ruling | Implemented as | Authority |
|---|---|---|---|---|
| **1** | Receiver may not disposition the lot | **Enforced** | `MATERIAL_DISPOSITION_SELF_RECEIVED` on the lifecycle guard and the release-record trigger | Derived from PM-03 |
| **2** | CoA verifier may not disposition | **Enforced** | `MATERIAL_DISPOSITION_SELF_VERIFIED`, same two points | **Approved beyond PM-03** — see below |
| **3** | Sampler may not test | **Not enforced** | Registered, unenforced, with the switch and what it takes documented on the row | Awaiting the site procedure |
| **4** | Releaser may not dispatch | **Enforced**, plus no backdating | `BATCH_DUTY_CONFLICT`, and `DISPATCH_BEFORE_RELEASE` / `DISPATCH_IN_THE_FUTURE` | Derived from PM-03 |
| **5** | Signatures on QC Analyst / Production Supervisor actions | **Enforced for the finished-product verdict**; two more registered and held | `QUALITY_VERDICT_SIGNATURE_REQUIRED` on `batch_qc_results` | The workflow model — see §5.2 |
| **6** | One in-process reading counts as execution | **Confirmed**, broad reading | `batch_actor_duties`, and the recorder is now frozen | Confirmed in the brief |

### 5.1 Decision 2 diverges from PM-03, deliberately

PM-03 gives `coa_register` **and** `qa_disposition` both to
`qa_manager` and `qa_officer`. The matrix contemplates one person
doing both; the decision says they may not, on the same lot.

So the gate is now **stricter than the permission screen**. That is
not a transcription error and it is not hidden:

- `duty_conflicts.authority` distinguishes `derived_from_pm03` from
  `approved_by_quality`;
- an `approved_by_quality` pair is refused by a CHECK unless it
  carries a written `approved_reference`, and the migration asserts
  the reference is long enough to be a reference rather than a shrug;
- the derivation guard is **narrowed, not removed** — a pair claiming
  PM-03 as its authority is still refused unless PM-03 derives it.

If PM-03 is ever changed so the two columns are disjoint, the
migration raises a NOTICE saying the special authority can be dropped.

**The permission matrix itself is unchanged.** Reducing a role's Act
on `coa_register` or `qa_disposition` would alter what those roles can
reach across the whole product, which is a larger change than this
decision asked for. Recorded in the conflict register §40 as a
standing divergence for the design to resolve.

### 5.2 Decision 5 — which actions, and which are enforced

Taken from the workflow model: an action is here when a later control
reads its result and acts on it.

| Action | Performed by | State | Why |
|---|---|---|---|
| `batch_qc_result` | QC Analyst | **Enforced** | The release gate reads `pass` and the value and refuses the batch on them |
| `material_test_result` | QC Analyst | Registered, held | The disposition gate reads it the same way. Held pending the site's testing procedure, which decides whether every result is signed or only critical parameters |
| `batch_execution_close` | Production Supervisor | Registered, held | Stage completion is **already** signed by `batch_stage_complete`. Closing is the one step that is not; on some sites it is clerical and the stage signatures are the record |

The signature is taken over the **verdict** — action, record, test,
value and pass/fail — not over a row id. Signing an id would let the
values be edited afterwards with the signature still attached.
Single-use by unique index, bound to the signer, and the Part 11
`meaning` vocabulary is not widened: a verdict is `authored`, and
`action` carries which verdict it was.

### 5.3 What the decisions cost

| # | Who it affects |
|---|---|
| 1 | Only somebody holding both storekeeper and a QA role — a storekeeper has no Act on `qa_disposition` to begin with |
| 2 | A QA Manager or QA Officer, on a lot whose certificate they verified. This one **does** bite a single role, which is why it needed an explicit approval |
| 4 | Only somebody holding both qa_manager and storekeeper |
| 5 | Every QC Analyst recording a finished-product result — one password prompt per verdict |
| 6 | Only a multi-role holder |

### 5.4 Decision 3 — sampling versus testing: EXPLICITLY UNRESOLVED

**Not enforced, and not to be enforced until two things are
confirmed.** This section says what the system does in the meantime
and exactly what would close it.

#### Safe interim behaviour

| | |
|---|---|
| Does anything refuse the sampler from testing? | **No.** `duty_conflict('material_lot', lot, 'qc_testing', sampler)` returns NULL |
| Is the pair in the database? | **Yes** — `duty_conflicts`, `scope='material_lot'`, `duty_a='qc_testing'`, `duty_b='sampling'`, `enforced = false`, `decision_status = 'awaiting_decision'` |
| Is the attribution being captured? | **Yes, and preserved.** `material_lot_sampling.sampled_by` / `sampled_on` and `material_test_results.analyst_id` / `test_date` |
| Can it be turned on later for past lots? | **Yes.** The check reads recorded actions, so lots sampled and tested before the rule is enabled become visible to it immediately |
| What is reported? | `duty_decisions_outstanding()` returns it, and it is the **only** row that query returns |

**The interim position is deliberate, not an oversight.** The brief is
explicit: *"Require different actors only where the approved quality
procedure requires independence. Do not invent a universal mandatory
separation rule without evidence from the site's procedure."* Sampling
and testing by one analyst is normal practice at many sites; a
universal rule would refuse legitimate work on no authority.

#### Exactly what is needed to close it

Two pieces of evidence, both external to this repository:

1. **A PM-03 column for sampling.** The matrix has none, so there is
   nothing to derive a separation from. Adding it means deciding which
   role performs sampling and whether that role is disjoint from
   `qc_testing`'s Act role (`qc_analyst`). If sampling is also the QC
   Analyst's, the pair can never be derived and would need the same
   explicit-approval route as decision 2.
2. **The site's written procedure**, stating that the person who draws
   a sample may not perform the analysis on it — or stating that they
   may, in which case the pair should be set to `declined` rather than
   left open.

#### How to close it, once both exist

```sql
UPDATE public.duty_conflicts
   SET enforced = true,
       decision_status = 'mandatory',
       authority = 'approved_by_quality',   -- or 'derived_from_pm03' if PM-03 now derives it
       approved_reference = '<SOP number, revision and date>'
 WHERE scope = 'material_lot' AND duty_a = 'qc_testing' AND duty_b = 'sampling';
```

The CHECK added by `20261128000000` refuses this without a reference,
so the SOP number is not optional. If the procedure says the opposite,
set `decision_status = 'declined'` instead and leave `enforced` false
— the row then records that it was considered and ruled out, which is
worth more than deleting it.

Regression tests already cover the unenforced state:
`decision_enforcement_test.sql` D1–D4 assert the activities are
distinct and attributed, that the pair is on the record, and that
**nobody is refused**. Enabling it will make D3 fail, which is the
right failure and the signal to update the test alongside the policy.

---

### 5.5 Decision 5 — two signature requirements PENDING POLICY

Enforced: `batch_qc_result`. **Held, pending policy:** two more. They
are rows in `signed_quality_actions` with `required = false`, so the
mechanism exists, the action is registered, and nothing is silently
enabled or quietly dropped.

| Action | Performed by | Why it is held | What would close it |
|---|---|---|---|
| `material_test_result` | QC Analyst | The disposition gate reads this verdict the same way the release gate reads the finished-product one, so the case for signing is the same. What is undecided is **scope**: every test result, or only critical parameters? Signing every result on a multi-parameter specification is a password prompt per row | The site's testing procedure stating which results carry a signature |
| `batch_execution_close` | Production Supervisor | Stage completion is **already signed** by `batch_stage_complete`. Closing execution may be clerical once every stage is signed, in which case a second signature adds ceremony and no evidence | The site's batch-record procedure stating whether closure is a distinct attestation |

#### Safe interim behaviour

Neither action is refused and neither is silently signed. A
`material_test_result` or an execution close recorded today carries
`signature_id IS NULL` where the column exists, which is the honest
record of an act nobody attested to — and is findable:

```sql
SELECT * FROM public.signed_quality_actions WHERE NOT required;
```

#### How to enable one

```sql
UPDATE public.signed_quality_actions
   SET required = true, decision_status = 'enforced',
       basis = basis || ' ENABLED: <SOP number, revision and date>'
 WHERE action_key = 'material_test_result';
```

A CHECK keeps `required` and `decision_status` in step, so one cannot
be set without the other. **Enabling `material_test_result` also needs
its enforcement trigger**, which is not written: only
`batch_qc_results` has one today. That is deliberate — writing a
trigger for a rule nobody has asked for is how dead guards appear.

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

| Decision 1 reachable at all — the receiver is now written | `decision_enforcement_test.sql` A1–A3, B1–B3 |
| Decision 2 on a named approval, and PM-03 still not deriving it | C1–C7 |
| Decision 3 registered and refusing nobody | D1–D4 |
| Decision 4, including backdating and future-dating | E1–E5 |
| Decision 5: required, bound to the values, single use, bound to the signer | F1–F11 |
| Decision 6: the broad reading, and attribution that cannot be edited | G1–G6 |
| Every enforced pair has an authority and claims only the one it has | H1–H2 |

Full run: **2626 assertions, 0 failed**, from a database dropped and
rebuilt from the migrations.
