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
| `grant_signature_id` | uuid → electronic_signatures | required for a GMP-critical role; unique |
| `revoke_signature_id` | uuid → electronic_signatures | same, for the withdrawal; unique |
| `provenance` | text | `rpc` \| `service` \| `bootstrap_self_declared`. How this grant came to exist, and which of them nobody countersigned |
| `declaration` | text | the written statement, for a bootstrap grant only |

- `UNIQUE (company_id, user_id, role) WHERE revoked_at IS NULL` — one
  live assignment of a role per person; revoked rows are exempt, so
  the same role can be granted again and both grants stay visible.
- CHECK `operational_role_revocation_is_complete` — a half-revoked row
  (a timestamp with no reason) cannot exist.

### `work_role_resolution`

A single-row switch, `legacy_membership_bridge boolean`, seeded on.
§4 explains what it bridges and why it is a switch rather than a rule
buried in a function body.

### `gmp_critical_roles`

Which roles need a signature to grant or revoke. Seeded from
`step_permissions` and asserted against it, so a role on the list that
holds no protected step fails the migration.

### `duty_conflicts`

(renamed from `batch_duty_conflicts` by `20261122000000`, which made
it cover the material chain as well)

| Column | Notes |
|---|---|
| `scope` | `batch` \| `material_lot`; part of the PK |
| `duty_a`, `duty_b` | PK with scope, CHECK `duty_a < duty_b` so a pair is stored once |
| `enforced`, `decision_status` | an unenforced pair is recorded and not consulted — a proposal visible in the database rather than only in a document. A CHECK keeps the two fields agreeing. |
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
| `material_lot_actor_duties(lot, user)` | — | …and to this material lot |
| `duty_conflict(scope, id, duty, user)` | — | the refusal, or NULL, for either chain |
| `batch_duty_conflict(batch, duty, user)` | itself | kept as a thin call, so existing callers read the same |
| `duty_pair_is_derived(a, b)` | — | whether PM-03 already separates two sections |
| `operational_role_action_hash(...)` | — | what a role signature is taken over |
| `operational_role_sign(...)` | — | mints one, by password |
| `operational_role_signature_error(...)` | — | the refusal, or NULL |
| `operational_role_needs_signature(role)` | — | is this role GMP-critical |
| `operational_role_bootstrap(...)` | — | initial setup for a workspace of one |
| `operational_role_unsigned_grants(company)` | — | every grant no second person signed for |

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

### Initial setup for a workspace of one

Refusal 1 means **a workspace with one active member can never create
its first operational role**. Correct as a rule, unusable as a
product. `operational_role_bootstrap` is the documented exception.

**It does not independently verify authority, and nothing inside this
database can.** Independent verification means a second party who is
not the person being appointed. In a workspace of one there is no
second party: the owner controls the account, the password and the
email. A code sent by email and a signature taken with the same
password verify the same thing — that the one person is still the one
person. Treating either as independent verification would be a
pretence, and the direction asked that an impossible verification be
documented rather than faked. This is that documentation.

So instead the act is made narrow, signed, declared, marked and
reported:

| Property | How |
|---|---|
| **Narrow** | Refused the moment any *other* active owner, admin or compliance admin exists who could appoint properly. It is unavailable in any workspace where the ordinary path works. |
| **Signed** | Always — even for a role that would not otherwise need one. A self-declared grant is the weakest link and is not going to be the unsigned one as well. |
| **Declared** | The caller states in writing what authority they hold and under what appointment, minimum 20 characters. "One word is not a declaration." |
| **Marked** | `provenance = 'bootstrap_self_declared'`, permanently. The immutability trigger refuses any edit to it. |
| **Reported** | `operational_role_unsigned_grants(company)` lists it with the finding *"Authority is declared, not independently verified."* |

**The compensating control is external and belongs in the quality
system**: the registered QA person is named on the regulatory
submission, and that document — not this database — is what says
whether the declaration is true. A reviewer's job is to compare the
two, which is why the declaration has to be specific enough to compare
against.

Ordinary self-assignment stays refused, including in a one-person
workspace: `operational_role_assign` still raises
`OPERATIONAL_ROLE_SELF`. Bootstrap is a different function with its
own, narrower, conditions — not an exception bolted onto the general
path.

**Recovery** uses the same function and the same conditions. If
everyone who could appoint has left, the remaining owner is by
definition alone, the narrowing clause passes, and the grant is marked
and reported exactly as an initial one.

### Signatures — settled in `20261121000000`

Granting or withdrawing a **GMP-critical** role requires an electronic
signature, minted by password through the same throttled path as every
other signature in this schema. There is no second way to produce one
and no test-only path.

**Which roles.** Derived, not chosen: a role needs a signature when
PM-03 names it in `step_permissions`, i.e. when it carries one of the
five authorities the design singled out. That is `qa_manager`,
`qa_officer` and `compliance_admin`, seeded into `gmp_critical_roles`
with the basis recorded in words. The migration fails if a seeded role
holds no protected step, and raises a NOTICE the other way — a role
PM-03 trusts with a step that needs no signature to grant is a gap,
not a decision, and is named at deploy time.

Granting a `storekeeper` needs no signature. That asymmetry is
deliberate; §9 asks whether you want it changed.

**Bound to the exact action.** The signature is taken over
`operational_role_action_hash(company, person, role, action,
assignment)`. Change any of those five and the hash changes, so a
signature for appointing Ngozi QA Manager cannot be replayed to
appoint anyone else, to a different role, in a different company, or
to revoke rather than grant. A revocation signature additionally
names the assignment it ends.

**Not a record hash, and why.** At grant time there is no record yet —
the signature has to exist before the row it authorises. So it binds
the *action* rather than the row. For specification approval the
record already exists and a record hash is right; here it would be
impossible.

**Single use**, by unique index on `grant_signature_id` and
`revoke_signature_id` rather than by a consumed flag: a flag can be
reset and an index cannot.

**The existing signing controls are untouched.**
`electronic_signatures.meaning` carries a fixed Part 11 vocabulary and
signing a role action records `'approved'` — of the appointment, or of
the withdrawal — rather than widening that vocabulary to add a word
`action` already carries.

**Actor, reason, timestamp and history are preserved.** The grantor
and the time are set by the server on insert and the caller's values
are discarded, so a direct INSERT cannot write a false record of who
appointed whom. On revocation the grant's actor and timestamp are
frozen and the revoker, reason, time and signature are added beside
them. The row is never deleted and never edited.

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

**The material chain was audited too**, in `20261122000000`. One pair
is enforced — whoever tested a lot may not disposition it, which is
the batch rule applied where the same facts hold. Three more were
examined and are recorded as unenforced, with the reason: one is
permissible but undecided, and two are not derivable from PM-03 at
all. The full audit, including the six questions that are yours, is
[`docs/separation-of-duties.md`](separation-of-duties.md).

What it does **not** cover, stated rather than left to be found:

- Duties performed outside the recorded columns. An action that
  records no actor is invisible to the check.
- Two people conspiring. This is separation of duties, not collusion
  detection, and nothing here claims otherwise.
- Shared accounts. Everything rests on one person being one `user_id`.

---

## 5b. Revocation, and what happens to work in flight

The direction asks that revocation stop authorising new actions
immediately, including in existing sessions, that historical
attribution survive, and that in-progress work have a defined
behaviour. Each, in turn.

### Immediate, server-side

`app_work_roles` reads `operational_role_assignments` on every call
and the session holds no copy of the answer — no cached claim, no
token to re-issue, no TTL. **The next statement after the revocation
commits sees it.** Asserted in section H of the role-signature suite,
within one session: the roles before and after are compared across the
revoking call.

There is nothing to expire because nothing was stored. That is the
reason the roles were deliberately *not* put into the JWT.

### Immediate, client-side — bounded, not instant

The browser does hold a copy: the roles loaded at sign-in sit in React
state. A tab left open since before a revocation keeps drawing the
navigation of a role its owner no longer holds.

**Nothing is exposed by that.** Every write is refused server-side and
the screen was never the control. What it produces is a person
clicking something that then fails, which is a poor way to find out.
So `AuthContext` re-reads the assignments when the tab returns to the
foreground — on `visibilitychange` and `focus`.

That **bounds** the staleness to "until they next look at the tab". It
does not eliminate it, and it is **not a security boundary**. A tab
left visible and untouched keeps its stale menu until something else
re-renders it.

### Historical attribution survives

Revoking a role is not a reason to rewrite who did what. The QC result
recorded while they held `qc_analyst` still names them; the duty that
result created still blocks them from releasing that batch. Asserted
at H4–H5.

The assignment row itself survives too, with the grant's actor and
timestamp frozen and the revocation recorded beside them.

### Pending approvals and work in progress

**A signature is not a licence.** It records that a person signed
something at a moment; the authority to act on it is checked when the
action is taken, not when the signature was minted. So:

| Situation | Behaviour |
|---|---|
| A signature minted while the role was held, used after revocation | **Refused** — by the authority check, not the signature check. H8. |
| The signature row itself | **Survives.** It is evidence that somebody signed, which stays true. H9. |
| Is it consumed by the refused attempt? | **No.** Nothing used it, so a caller who *does* hold the authority could still be the one to use it — it names its signer either way. H10. |
| A batch half-executed by someone whose role is revoked | The work already recorded stands and still attributes to them. New actions are refused. Nothing is rolled back. |
| A specification signed but not yet approved | The approval is refused: `product_specification_approver_error` asks whether `qa_manager` is among their roles *now*. |

**Nothing is auto-completed and nothing is auto-cancelled.** A
half-finished workflow stays exactly where it stopped, and somebody
who holds the authority finishes it. That is the honest behaviour —
cancelling would destroy work, and completing would let a revoked
authority act.

The one thing *not* handled: there is no notification. Nobody is told
that a workflow is now stranded because its owner lost a role. Finding
it means looking. That is a gap, and it is listed in §9.

---

## 5c. Security recheck, and what it found

Item 6 of the direction: recheck the authority model, RLS, triggers,
RPCs and service-role paths; confirm that neither direct writes nor
privileged application paths can bypass assignment authority or
rewrite revocation history.

### A real finding: the rules themselves were writable

```sql
SET ROLE authenticated;
DELETE FROM public.duty_conflicts;      -- DELETE 6
DELETE FROM public.gmp_critical_roles;  -- DELETE 3
```

Both succeeded. **Any signed-in user — and `anon`, which is every
visitor — could remove every separation-of-duties rule and every
signature requirement**, after which the gates kept running and found
nothing to object to. The controls were installed, attached, and
reading an empty rulebook.

The cause: the project-wide default grant gives new tables in `public`
full DML to `anon` and `authenticated`, and `20261120000000` and
`20261121000000` created their tables without enabling RLS, on the
reasoning that the rows are not tenant data. They are not — they are
something more sensitive, and the other rule tables were being
protected by RLS without anyone having said so.

`20261123000000` fixes it in two layers: `REVOKE INSERT, UPDATE,
DELETE, TRUNCATE` from `anon` and `authenticated` on every rule table
(the real fix — a privilege that does not exist cannot be exercised),
and RLS with a read-only policy as the backstop for the next table
somebody adds and forgets. Its assertion **runs the DELETE** rather
than checking that a privilege is absent, because "the privilege looks
right" was true of the other four tables the whole time these two were
open.

Section J of the suite keeps this standing: all six rule tables, both
verbs, the privilege itself, and RLS.

### The rest of the recheck

| Path | Result |
|---|---|
| Direct INSERT into `operational_role_assignments` | Same refusals as the RPC — the authority, self-assignment and signature checks are on the **trigger**, so the route in does not matter. Tested both ways throughout section E of the role-model suite. |
| Direct UPDATE to rewrite a grant | `OPERATIONAL_ROLE_IMMUTABLE` |
| Direct UPDATE to re-revoke, moving the date | `OPERATIONAL_ROLE_IMMUTABLE` — **and this binds service contexts too** |
| Direct UPDATE to un-revoke | `OPERATIONAL_ROLE_IMMUTABLE` |
| Bolting a signature onto an existing unsigned grant | `OPERATIONAL_ROLE_IMMUTABLE` |
| DELETE | Refused for everyone; the row is evidence |
| A foreign company's member reading or writing | RLS: sees nothing, writes nothing |
| `anon` | No write privilege on any rule table; no read policy on assignments |
| **Service-role / migration paths** | Can grant without a signature — see below |

### The service-context exemption, stated plainly

A service context (a migration, a seed, a scheduler) has no password
and no second person, so it **cannot** sign. It is therefore exempt
from the authority and signature checks — and every grant it makes is
stamped `provenance = 'service'` and listed by
`operational_role_unsigned_grants()` with the finding *"No person
signed for it."*

This is a real residual: **anyone who can run a migration can appoint
a QA Manager.** It is not closable from inside the database, since a
migration is exactly the thing that defines what the database
enforces. What is closable is invisibility, and that is what the
marking does. The deployment procedure should treat a non-empty
`operational_role_unsigned_grants()` on production as a finding to
explain, not a list to skim.

The **integrity** rules are not exempt. Re-revoking, editing a grant
and un-revoking are refused for service callers as well, because who
may grant a role is a question about a person — and a migration is not
one — but what a row *means* is the same question whoever asks it. The
suite found this: with the integrity checks behind the exemption, a
service caller could silently re-date a revocation.

---

## 6. Migration order

Strictly ordered. Nothing may be reordered or applied in isolation.

| # | Migration | Depends on |
|---|---|---|
| … | `20261103000000` … `20261118000000` | as `docs/release-verification.md` §4 sets out |
| 14 | **`20261119000000`** operational role assignments | `section_permissions`, `step_permissions.section`, `access_restrictions`, `app_is_company_member`, `product_specification_approver_error` (from `20261117000000`) |
| 15 | **`20261120000000`** separation of duties | `20261119000000`; `batch_qc_results`, `batch_stages`, `batch_dispatches` |
| 16 | **`20261121000000`** role assignment signatures | 14; `step_permissions`, `electronic_signatures`, `verify_user_password`. **Drops** the 4-argument `operational_role_assign` and the 2-argument `operational_role_revoke` |
| 17 | **`20261122000000`** material separation of duties | 15; **renames** `batch_duty_conflicts` to `duty_conflicts`; `material_test_results`, `material_lot_release_records` |
| 18 | **`20261123000000`** rule tables are not writable | 16 and 17 — it locks down tables those two create |

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
| `gmp_critical_roles` | three seeded rows, derived from `step_permissions` |
| `grant_signature_id`, `revoke_signature_id`, `provenance`, `declaration` | added to an empty table; `provenance` defaults to `'rpc'` |
| `duty_conflicts` | **renamed** from `batch_duty_conflicts`; gains `scope`, `enforced`, `decision_status`, `note`; three material rows added, one enforced |
| Revoked privileges on six rule tables | no rows touched. `anon` and `authenticated` lose INSERT/UPDATE/DELETE/TRUNCATE and keep SELECT |
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

Updated 2026-10-23 for `20261121000000`–`20261123000000`:

```
TOTAL: 2538 assertions, 2538 passed, 0 failed
  role_signatures_and_duties_test.sql                  82        0
  operational_role_model_test.sql                      59        0
```

`role_signatures_and_duties_test.sql` covers: A signatures required
for GMP-critical roles and not for others; B the binding to company,
person, role, action and signer, and single use; C revocation's own
signature and the history that survives it; D initial setup, including
that it is refused where somebody else could appoint and that the mark
cannot be edited away; E one person holding QC Analyst and QA Manager;
F duties across routes, retries and role changes after work began; G
the material chain including a direct database write; H revocation's
immediacy and the in-flight signature; J the rule tables.

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
| Should `qc_analyst` and `production_supervisor` also require a signature to be granted? | **Open.** The derivation permits adding them only if PM-03 gives them a protected step, which today it does not — so this needs PM-03 changed, not just a seed. |
| Should a stranded workflow be **notified** when its owner loses a role? | **Open, and a gap.** Nothing tells anybody; finding it means looking. |
| Should the client re-read roles more often than on tab focus? | **Open.** It is not a security boundary either way; the server refuses regardless. |
| Is refusing self-assignment outright right, given it blocks a one-person workspace? | **Proposed decision**, pending confirmation. |
| Should the duty-conflict pairs be exactly these? | **Proposed**, and now audited across both chains. See [`docs/separation-of-duties.md`](separation-of-duties.md) §5 for the six questions that are yours. |
| Material-side duties | **Audited.** One pair enforced, three recorded as unenforced with the reason. Same document. |
| Who are the QA Managers, storekeepers and analysts at each of the 30 companies? | **For you.** No assignment is invented. |
| When is the legacy bridge turned off on live? | After assignments exist. It is inert there either way. |
