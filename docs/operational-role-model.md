# The operational role model

The proposed schema for PM-03's eight roles, kept separate from
workspace membership. Written for review **before** anything is
applied to staging or production.

Nothing here has been deployed. Every result below comes from a local
PostgreSQL dropped and rebuilt from the migrations.

Last reviewed: 2026-10-23.

---

## 1. The problem this answers

`company_members.role` on the Criateur project is enum `company_role`
with five values: `owner, admin, legal, marketing, viewer`. All 21
members hold `owner`. PM-03's enforcement resolved a person's work
role from that column, so after deployment every guard would have
abstained for every member — the whole layer installed, exercised on
every write, and silent.

The obvious fix was to add the eight roles to that enum. The direction
rejects it, and rightly: the two things answer different questions.

| | `company_members.role` | operational role |
|---|---|---|
| Question | what is this person to the workspace | what may they do on the floor |
| Values | owner, admin, legal, marketing, viewer | PM-03's eight |
| How many per person | one | **several** |
| Granted by | invitation / workspace admin | a named someone, for a recorded reason |
| Withdrawn | by removing the member | by revocation, which leaves the record |
| Evidence? | no | **yes** — it says who could have done what, when |

Merging them would have made an operational role as casual as an
invitation, and made withdrawing one destroy the record of it.

---

## 2. Proposed schema

### `operational_role_assignments`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `company_id` | uuid → companies | company-scoped, cascade on company delete |
| `user_id` | uuid | |
| `role` | text | CHECK: one of `app_operational_roles()` |
| `reason` | text NOT NULL | non-empty. An assignment nobody explained is one nobody can review |
| `assigned_by` | uuid | **set by the server**, never accepted from the caller |
| `assigned_at` | timestamptz | server clock |
| `revoked_by` | uuid | server clock/actor, on revocation |
| `revoked_at` | timestamptz | NULL while live |
| `revoke_reason` | text | required when revoked |

- `UNIQUE (company_id, user_id, role) WHERE revoked_at IS NULL` — one
  live assignment of a role per person; revoked rows are exempt, so
  the same role can be granted again and both grants stay visible.
- CHECK `operational_role_revocation_is_complete` — a half-revoked row
  (a timestamp with no reason) cannot exist.

### `work_role_resolution`

A single-row switch, `legacy_membership_bridge boolean`, seeded on.
§4 explains what it bridges and why it is a switch rather than a rule
buried in a function body.

### `batch_duty_conflicts`

| Column | Notes |
|---|---|
| `duty_a`, `duty_b` | PK, CHECK `duty_a < duty_b` so a pair is stored once |
| `section_a`, `section_b` | the PM-03 columns the duties are performed under |
| `error_code` | so a refusal somebody already handles keeps its code |
| `reason` | the sentence the refusal shows |

Seeded with three pairs, each asserted at deploy time to be one PM-03
already separates — see §5.

### Functions

| Function | Replaces | What it answers |
|---|---|---|
| `app_operational_roles()` | — | the eight, named once |
| `app_work_roles(company, user)` | `app_work_role` | **every** role held, sorted, empty when none |
| `app_has_work_role(company, role, user)` | — | does this person hold this one role |
| `app_work_role(company, user)` | itself | **deprecated**: the sole role, or NULL when none or several |
| `app_section_access` | itself | the most permissive cell across held roles, lowered by a restriction |
| `app_assert_section_act` | itself | unchanged decision; the refusal now names the roles held |
| `app_assert_step` | itself | holds if **any** held role holds the step |
| `app_may_assign_operational_roles` | — | owner/admin by membership, or compliance_admin |
| `operational_role_assign` / `_revoke` | — | the two RPCs |
| `product_specification_approver_error` | itself | is `qa_manager` among their roles |
| `batch_actor_duties(batch, user)` | — | what they already did to this batch |
| `batch_duty_conflict(batch, duty, user)` | — | the refusal, or NULL |

---

## 3. Who may assign, change and revoke

Two independent authorities, because neither alone works:

- **A workspace owner or admin**, read from `company_members.role`.
  This is the authority that already exists and the only way a first
  operational role can ever be granted. It does not make them a QA
  Manager; it lets them appoint one.
- **Anyone holding `compliance_admin`** — PM-03's own *Change roles
  and permissions*.

And three refusals:

1. **Never yourself.** An admin who can give themselves `qa_manager`
   can release their own batches, and every separation downstream
   becomes decoration. A second person must act.
2. **Never edited.** Only revocation may change an existing row.
3. **Never deleted.** The row is the evidence.

Refusals 2 and 3 bind **service contexts too**, which refusal 1 does
not. The distinction: who may grant a role is a question about a
person, and a migration is not a person — but what an assignment row
*means* is the same question whoever asks. The suite found this the
hard way: with the integrity checks behind the service exemption, a
service caller could re-revoke an already-revoked assignment and
silently move the date somebody lost an authority.

### The consequence worth deciding on

**A one-person workspace cannot create its first operational role**,
because nobody else is there to grant it. That is a real constraint
and it follows directly from refusal 1.

It is deliberate, and it is **a proposed decision, pending final
quality/regulatory confirmation**. Relaxing it means allowing
self-assignment, which is the single failure the model exists to
prevent, so it has not been relaxed unasked.

### Still open

Whether an assignment should require an **electronic signature**, as
specification approval does. It currently requires a reason, an actor
and a timestamp, but no signature. Granting someone release authority
is arguably as significant as approving a specification. Not decided
here, because it is a Part 11 question rather than a software one.

---

## 4. Backward compatibility

### What does not change

- `company_members` is **untouched**. No column, no constraint, no
  row. The enum is not extended. No owner or admin is converted.
- `app_section_access`, `app_assert_section_act` and `app_assert_step`
  keep their signatures and the meaning of their returns, so every
  guard, policy and RPC that calls them is unaffected except that they
  now see the union.
- The abstention policy is unchanged: holding no tabulated role is a
  silence, not a refusal.
- `BATCH_RELEASE_SELF_TESTED` keeps its error code, now as a row in
  `batch_duty_conflicts` rather than a clause in the release gate.

### The compatibility bridge

`app_work_roles` reads the assignment table **and**, while
`legacy_membership_bridge` is on, `company_members.role` where that
column already holds one of the eight.

This exists because every test fixture in the repository and every
from-scratch development build puts an operational role in that
column — it is where the role lived until now. Without the bridge,
2397 existing assertions would have had to be rewritten to assert the
new table, which would have replaced a regression suite with a new
one at exactly the moment the regression suite was most useful.

**On the live project the bridge admits nothing.** Its only filter is
membership of the eight, and `company_role` cannot hold any of them.
It cannot promote an owner. Asserted three ways: in the migration at
deploy time, in section A of the role-model suite, and in section G
with the bridge deliberately switched on.

It is a switch so that it can be turned off once real assignments
exist, and so that "is the bridge on" is a question with an answer
rather than a reading of a function body.

### `app_work_role`, narrowed rather than dropped

It returns the sole role when there is exactly one and **NULL
otherwise** — never a wrong answer, only sometimes no answer.
Dropping it would have broken callers silently at deploy time;
returning one of several would have made their behaviour depend on
which. The migration asserts that **no function body still calls it**,
and the suite asserts the same, so it cannot creep back into
enforcement.

### The frontend conversion this exposed

`resolveWorkRole` in `src/lib/access/roleAccess.ts` mapped `owner`,
`admin` and `compliance_officer` to `compliance_admin`. On the live
project, where all 21 members hold `owner`, **the entire workspace was
being shown the compliance admin's navigation and dashboards while the
server abstained for them and granted nothing.** The screen said one
thing and the database another.

Those three mappings are removed. Genuine spelling normalisations
(`QA Manager`, `qa-manager`, `quality_manager` → `qa_manager`) are
kept, because reading three spellings of one job is reading the data,
not converting it. `resolveWorkRoles` now mirrors `app_work_roles`,
and `AuthContext` loads the assignments alongside the profile — with
the lookup's failure logged and treated as "holds none", so a client
signing in against a database where the table does not exist yet still
works.

---

## 5. Separation of duties

PM-03 separated duties by arithmetic: QC testing is the QC Analyst's
column alone, batch release the QA Manager's alone, so one person
could not hold both. **Multiple assignment removes that arithmetic**,
and the separation has to be enforced against the batch instead.

The question stops being *may this person release batches* and becomes
*may this person release **this** batch, given what they already did
to it*.

| Attempting | Blocked if they already | Code |
|---|---|---|
| release | recorded QC results on it | `BATCH_RELEASE_SELF_TESTED` |
| release | executed it (started a stage, recorded a reading, closed execution) | `BATCH_DUTY_CONFLICT` |
| dispatch | made the release decision on it | `BATCH_DUTY_CONFLICT` |

**Each pair is derived, not chosen.** A pair is admissible only where
PM-03 gives the two sections Act to role sets that do not overlap —
i.e. where the design had already separated them. The migration
computes that from `section_permissions` and fails if any seeded pair
shares an Act role, so a rule the matrix does not contain cannot be
seeded into existence. The suite asserts it again, in case a later
seed adds one.

What it does **not** cover, stated rather than left to be found:

- Duties performed outside the recorded columns. The reader uses
  `tested_by`, `started_by`, `recorded_by`, `execution_closed_by`,
  `released_by`, `dispatched_by`. An action that records no actor is
  invisible to it.
- Two people conspiring. This is separation of duties, not collusion
  detection, and nothing here claims otherwise.
- Material-side duties. The pairs are batch-scoped; QA disposition of
  a material lot against its QC test is a separate question and is not
  addressed here.

---

## 6. Migration order

Strictly ordered. Nothing may be reordered or applied in isolation.

| # | Migration | Depends on |
|---|---|---|
| … | `20261103000000` … `20261118000000` | as `docs/release-verification.md` §4 sets out |
| 14 | **`20261119000000`** operational role assignments | `section_permissions`, `step_permissions.section`, `access_restrictions`, `app_is_company_member`, `product_specification_approver_error` (from `20261117000000`) |
| 15 | **`20261120000000`** separation of duties | `20261119000000`; `batch_qc_results`, `batch_stages`, `batch_dispatches` |

`20261117000000` was amended in this branch to extract its QA Manager
check into `product_specification_approver_error`, a seam
`20261119000000` then replaces. The function is otherwise unchanged.
It has never been applied to any database, so amending it rewrites
nothing that exists.

Both new migrations are idempotent: `CREATE TABLE IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before
`CREATE TRIGGER`, `ON CONFLICT DO UPDATE` on the seed.

### Effect on existing data

| Change | Existing rows |
|---|---|
| `operational_role_assignments` | new table, **empty**. No backfill, deliberately — see below |
| `work_role_resolution` | one seeded row |
| `batch_duty_conflicts` | three seeded rows |
| `company_members` | **nothing** |
| Replaced functions | no rows touched |

**No assignment is backfilled.** There is nobody to backfill from:
the membership column holds no operational role on live, and inventing
an assignment would be asserting that somebody was given an authority
they were never given. Assignments are made deliberately, by a named
person, after deployment — which is why §8 of
`docs/live-readiness.md` puts it as its own step.

---

## 7. Rollback, and what it cannot undo

| Migration | Rolling back |
|---|---|
| `20261120000000` | restore the two trigger functions from git and drop `batch_duty_conflicts`. **Reversible.** The release gate reverts to its own qc-only clause. |
| `20261119000000` | restore `app_section_access`, `app_assert_section_act`, `app_assert_step`, `app_work_role` and `product_specification_approver_error` from git. Dropping `operational_role_assignments` **destroys every assignment and every revocation**, which is the record of who held which authority and when. |

**The limitation to be clear about:** `operational_role_assignments` is
evidence, and a rollback that drops it loses evidence created after
deployment. The table has no equivalent elsewhere — the membership
column cannot hold these roles, so there is nothing for the history to
fall back to.

If a rollback is ever contemplated, **export the table first**. The
same applies to `batch_specification_reviews` and the governing
specification stamps from `20261118000000`.

Rolling back `20261119000000` while leaving `20261120000000` in place
would leave the duty checks calling functions that still exist, so the
order is: 20261120000000 first, then 20261119000000.

A partial rollback has one more consequence: with the assignment table
dropped and the bridge gone, every member resolves to no operational
role and every guard abstains — the same inert state the live project
is in today. That is a regression to be chosen knowingly, not a safe
resting place.

---

## 8. Test results

Local PostgreSQL, database dropped and rebuilt from all 151
migrations, 2026-10-23.

```
TOTAL: 2456 assertions, 2456 passed, 0 failed
  operational_role_model_test.sql                      59        0
  decisions_and_step_restrictions_test.sql             33        0
  work_role_authorisation_test.sql                     33        0
  product_specification_test.sql                       38        0
  batch_release_gate_test.sql                          34        0
  … 44 further suites
```

Frontend: **1057 unit tests passed**, typecheck clean, production
build clean.

### What the new suite covers

| Section | Assertions | What it proves |
|---|---|---|
| A | 5 | membership roles preserved; no owner or admin converted |
| B | 5 | holding no operational role **abstains**, and yet specification approval still refuses them |
| C | 11 | several roles at once: the union, the restriction that lowers it, the deprecated singular, and that no guard calls it |
| D | 8 | revocation takes effect, the row survives, re-revocation refused, re-granting allowed |
| E | 15 | who may assign — **each refusal attempted by RPC and by direct table write**, and required to agree |
| F | 11 | separation of duties on one batch, including that the pairs are derived from PM-03 |
| G | 4 | the bridge: on, off, and unable to promote an owner either way |

Section E is the one that answers *"direct RPC attempts"*: every
refusal is attempted twice, because a control only the RPC applies is
one that anyone with a database session walks around.

### Three things the tests found

1. **`app_assert_section_act` still resolved a single role.** The
   migration's own assertion caught it at deploy time — a guard that
   would have named one of several roles in its refusal.
2. **The write policies made the trigger unreachable.** With no INSERT
   policy, RLS refused before the trigger ran, so every authority
   message was dead for application callers and exempted for service
   ones. The policies now ask only the membership question and the
   trigger asks the authority question, which is what makes a direct
   INSERT and the RPC meet the same refusals.
3. **A service caller could re-stamp a revocation.** Found by
   assertion D6. Fixed by moving the integrity checks ahead of the
   service exemption.

---

## 9. Open questions

| Question | Status |
|---|---|
| Should assignment require an electronic signature? | **Open.** Currently reason + actor + timestamp. |
| Is refusing self-assignment outright right, given it blocks a one-person workspace? | **Proposed decision**, pending confirmation. |
| Should the three duty-conflict pairs be exactly these three? | **Proposed.** Derived from PM-03 and asserted as such; a quality system that disagrees deletes a row. |
| Should material-side duties be separated too? | **Not addressed.** Batch-scoped only. |
| Who are the QA Managers, storekeepers and analysts at each of the 30 companies? | **For you.** No assignment is invented. |
| When is the legacy bridge turned off on live? | After assignments exist. It is inert there either way. |
