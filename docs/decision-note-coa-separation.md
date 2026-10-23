# Decision note — CoA verification versus QA disposition

One divergence, for decision. The gate is currently stricter than the
permission matrix, deliberately and on your approval. This note sets
out exactly what it would take to make them agree, what that would
cost, and what happens if nothing changes.

**No permission has been changed.** PM-03 is exactly as it was.

Status: **Option B accepted, 2026-10-23, as a temporary and documented
release exception.** PM-03 is not redrawn for this release and no
verification screen is built. The divergence between the gate and the
matrix stands and is on the record.

Recorded in the database as
`policy_decisions.key = 'coa_verification_vs_disposition'` with
`temporary = true`, so it appears first in
`policy_decisions_outstanding()` rather than quietly becoming the
design. §4 below — the membership-only gap — **was closed separately
and is no longer part of this decision**; see §4 for what was done
instead.

Last reviewed: 2026-10-23.

---

## 1. The decision, and what it actually separates

Decision 2 of the finalisation brief: *independent CoA verification
and QA disposition are required for critical release decisions.*

Enforced as: **whoever verified a material lot's incoming certificate
of analysis may not then make that lot's disposition.**

### The correction this note exists because of

When decision 2 was first implemented, the conflict was recorded
against PM-03's `coa_register` column, with the justification that
`coa_register` and `qa_disposition` both give Act to `qa_manager` and
`qa_officer`, so the pair could not be derived from the matrix.

**The conclusion was right and the reason was wrong.** There are two
distinct CoA acts in this system:

| Act | Table | PM-03 column | Screen |
|---|---|---|---|
| **Outgoing** — the certificate issued from a released batch | `certificate_of_analysis` | **`coa_register`** | CoA register |
| **Incoming** — the supplier's certificate, checked against the material specification | `material_certificates_of_analysis` | **none** | none — RPC only |

Decision 2 is about the **incoming** one. `material_lot_actor_duties`
reads `material_certificates_of_analysis.verified_by`, which
`material_coa_verify()` sets from `auth.uid()`.

So the pair is not derivable for a stronger reason than the one first
recorded: **PM-03 does not tabulate the act at all.** Not a role
overlap — an absent column.

`20261129000000` corrects the label to `incoming_coa_verification`,
which is a marker and deliberately not a grid column, and asserts that
it does not become one without somebody noticing.

---

## 2. The exact PM-03 change

To make `duty_pair_is_derived()` return true for this pair — i.e. for
the matrix to express the separation itself — PM-03 would need a new
column, and its Act roles would have to be disjoint from
`qa_disposition`'s.

### Today's two columns

| Role | `coa_register` | `qa_disposition` |
|---|---|---|
| procurement | view | none |
| storekeeper | none | none |
| qc_analyst | view | none |
| qa_officer | **act** | **act** |
| qa_manager | **act** | **act** |
| production_supervisor | none | none |
| compliance_admin | view | view |
| management | view | view |

### The change, as a seed

A twelfth section, `incoming_coa_verification`, with one Act role that
is **not** a `qa_disposition` Act role. `qa_disposition`'s Act roles
are `qa_officer` and `qa_manager`, so the candidate is `qc_analyst`:

```sql
INSERT INTO public.section_permissions (section, role, access) VALUES
  ('incoming_coa_verification', 'procurement',           'view'),
  ('incoming_coa_verification', 'storekeeper',           'view'),
  ('incoming_coa_verification', 'qc_analyst',            'act'),   -- NEW AUTHORITY
  ('incoming_coa_verification', 'qa_officer',            'view'),  -- REDUCED
  ('incoming_coa_verification', 'qa_manager',            'view'),  -- REDUCED
  ('incoming_coa_verification', 'production_supervisor', 'none'),
  ('incoming_coa_verification', 'compliance_admin',      'view'),
  ('incoming_coa_verification', 'management',            'view');
```

Then `material_coa_verify()` gains
`PERFORM app_assert_section_act(company, 'incoming_coa_verification');`
and the duty pair's `authority` drops from `approved_by_quality` to
`derived_from_pm03`.

### Why splitting the two QA roles does **not** work

The obvious alternative — leave CoA verification with QA and give
`coa_register` Act to one QA role and `qa_disposition` Act to the
other — **breaks a different control**:

`step_permissions` gives the `material_disposition` step to
`qa_officer, qa_manager`. Removing either role's Act on
`qa_disposition` would leave them holding a step whose section they
may not act in. The step guard and the section guard would disagree,
and `fn_material_lots_disposition_role` asserts the **step**, so the
inconsistency would not even surface as a refusal — it would surface
later, as a screen that hides a control the database still allows.

**That is the cascade, and it is the reason this is not a one-cell
edit.**

---

## 3. Affected roles and screens

### If the PM-03 change above is made

| Role | Gains | Loses |
|---|---|---|
| **qc_analyst** | **Act on incoming CoA verification** — a new authority | — |
| **qa_officer** | — | the ability to verify an incoming CoA (view only) |
| **qa_manager** | — | the same |
| everyone else | — | — |

**Granting `qc_analyst` a new authority is the part to weigh.** The
brief says not to grant a role new permissions silently, so it is
stated plainly here and nothing has been applied. Whether a QC Analyst
is the right person to check a supplier's certificate against the
material specification is a quality judgement, not a software one. The
case for it: the act is comparing stated results against specification
limits, which is analytical work. The case against: a certificate is a
supplier-quality document and some sites treat it as QA's.

### Screens affected

**None, today.** No screen calls `material_coa_verify()` — it is
reachable only as an RPC. Adding the column would mean adding the
screen, which is work this branch has not done and is outside its
scope.

`CoaRegisterPage` is the **outgoing** register and is unaffected by
every option in this note.

---

## 4. The gap found while writing this — now closed

### What it was

`material_coa_verify()` checked **company membership and nothing
else**. Any active member of the company could verify an incoming
certificate — a storekeeper, a viewer, anyone.

Not inferred from reading the code. Demonstrated: a member of a
company holding **no operational role at all**, in a confirmed
non-service context, called the RPC and got back

```
verification_status = 'verified', verified_by = <their own id>
```

The function is `SECURITY DEFINER`, owned by `postgres`, with
`EXECUTE` granted to `authenticated` and `service_role` (not `anon`,
not `PUBLIC`). So membership was the only check between any signed-in
member and a verified certificate.

That mattered twice over: the disposition gate reads
`material_certificates_of_analysis.verified_by`, so an unauthorised
verification **both** recorded a quality judgement nobody was entitled
to make **and** created a duty conflict against the person who made
it.

This predates the branch. It was a release blocker regardless.

### What was done — `20261130000000`

The authority is derived from the columns **PM-03 already has**, so
Option B's "do not redesign PM-03" is respected:

```sql
app_section_access(company, 'qc_testing')     = 'act'
OR app_section_access(company, 'qa_disposition') = 'act'
```

That admits `qc_analyst`, `qa_officer` and `qa_manager` — every one of
which already holds Act on a quality column today. **No column is
added, no cell is changed, no role gains an authority it did not
have**, and no screen is needed. The check reads the grid at run time
rather than naming roles, so it follows PM-03 if PM-03 ever changes.

`= 'act'` rather than `<> 'none'`, so a PM-04 restriction lowering
somebody to view also refuses them here.

### No abstention, deliberately

Everywhere else, somebody holding no tabulated role **abstains**, so
that the design declining to rule never locks a workspace out of its
own work. Abstaining here would leave exactly the hole that was
demonstrated — the people with no role are the ones who could verify.
So this is the second place that does not abstain, for the same reason
`20261117000000` gave for specification approval.

### Where the guard lives, and why not inside the RPC

In a `BEFORE INSERT OR UPDATE` trigger on
`material_certificates_of_analysis`, not in the function body. Two
reasons:

1. A direct `UPDATE` setting `verification_status` and `verified_by`
   meets the **same** refusal as the RPC. A guard living only inside
   `material_coa_verify()` would have been bypassable by anyone who
   could write the table.
2. `material_coa_verify()` is ~170 lines of verification arithmetic
   with its own tests. Re-issuing it to add four lines is how an
   unrelated regression gets in.

**Filing a certificate stays clerical.** Uploading the supplier's
document, correcting its path or recording its number remain open to
any member, as before — only setting `verification_status` or
`verified_by` is gated.

### And Decision 2 is unchanged

Narrowing who may verify does not narrow what verifying costs them. A
QA Manager who verifies a lot's certificate is still refused that
lot's disposition; somebody else must make it.

### Tests

`supabase/tests/decision_enforcement_test.sql` section I, 15
assertions: the storekeeper refused (the exact call that succeeded
before), the direct write refused, a role-less member refused rather
than abstained, filing still allowed, the QC Analyst still able and
still attributed, the QA Manager not refused, Decision 2 still biting
on the verifier, `anon` still without `EXECUTE`, and a service context
still exempt without the check changing its answer about that person.

Plus migration-time assertions in `20261130000000` itself, which
attempt the original exploit and fail the migration if it succeeds.

---

## 5. Database enforcement as it stands

| | |
|---|---|
| Error | `MATERIAL_DISPOSITION_SELF_VERIFIED` |
| Read from | `material_certificates_of_analysis.verified_by` |
| Enforced at | `fn_material_lots_disposition_role` (the lifecycle guard, so any route to `approved`/`rejected`), and `fn_material_release_record_duties` (a direct INSERT naming the verifier as authoriser) |
| Authority | `approved_by_quality`, with a written `approved_reference` |
| Service contexts | exempt from the duty check, as everywhere |

The authority model, added in `20261128000000`, is what lets a rule be
enforced beyond PM-03 **without** loosening the guard that stops
migrations inventing rules:

- a pair claiming `derived_from_pm03` is still refused unless PM-03
  derives it;
- a pair claiming `approved_by_quality` is refused by a CHECK unless
  it carries a written reference, and the migration asserts that the
  reference is long enough to be one.

---

## 6. Regression tests covering it

`supabase/tests/decision_enforcement_test.sql` section C:

| Assertion | Proves |
|---|---|
| C1 | the verifier and the certificate are recorded (`verified_by`, `verified_at`) |
| C2 | the verification duty is reported for that person on that lot |
| C3 | they are refused the disposition of that lot — `MATERIAL_DISPOSITION_SELF_VERIFIED` |
| C4 | PM-03 still does not derive the pair |
| C5 | so it is enforced on a named approval |
| C5b | the pair names the **incoming** act, not the outgoing register |
| C5c | and that marker is not a PM-03 column |
| C5d | the outgoing register column is unchanged — both QA roles still hold Act |
| C6 | the approval says where the decision is recorded |
| C7 | an approval with no reference is refused by the schema |

Plus, in `role_signatures_and_duties_test.sql` section G: G6d (the
pair is enforced on a named approval), G6e and G8 (nothing claims a
derivation it does not have).

Migration-time assertions in `20261129000000`: the marker is not a
grid column, the pair is still enforced on the approval, nothing else
claims PM-03 falsely, and the outgoing register is untouched.

---

## 7. The three options

| | Option A — add the column | Option B — leave it | Option C — withdraw |
|---|---|---|---|
| PM-03 | new `incoming_coa_verification` column; qc_analyst gains Act, both QA roles reduced to view | unchanged | unchanged |
| Gate | unchanged in behaviour; authority drops to `derived_from_pm03` | unchanged | the pair is unenforced |
| Screen | a verification screen would have to be built | none | none |
| `material_coa_verify` | gains a section guard on the new column | **reserved to the quality roles PM-03 already names — §4, done** | would still need §4's fix |
| Divergence | **resolved** | **stands, documented** | n/a |
| Work | a migration, an RPC guard, a screen | none | one `UPDATE` |

**Option B was taken, 2026-10-23**, as a temporary release exception.
The control is enforced and correct either way; Option A grants a role
a new authority and requires a screen that does not exist, which is
more than a release candidate should absorb. Option C removes a
control the brief asked for.

The divergence stands, recorded in the conflict register §40 and in
`policy_decisions` with `temporary = true`, for the design to resolve
in its own time.

---

## 8. What is settled, and what is still open

### Settled

| | |
|---|---|
| **Option B** | accepted 2026-10-23 as a **temporary** exception. PM-03 is not redrawn; no verification screen is built |
| **§4, the membership-only gap** | **closed** by `20261130000000`, without choosing a new role and without touching PM-03. See §4 |

Closing §4 did not require the decision this note was asking for,
which is why it was closed separately. The authority came from the
grid's existing quality columns rather than from a new one, so no
role gained anything and nothing had to be chosen on the site's
behalf.

### Still open — and it needs a quality judgement, not a migration

**Whether to take Option A eventually, and if so which role holds
Act on incoming CoA verification.** This note will not choose it. The
case for `qc_analyst`: the act is comparing stated results against
specification limits, which is analytical work. The case against: a
certificate is a supplier-quality document and some sites treat it as
QA's.

Until that is answered:

- the gate stays stricter than the matrix, on a recorded approval;
- `duty_pair_is_derived()` keeps returning false for the pair, so the
  explicit approval keeps being required;
- `20261129000000` asserts that nobody turns
  `incoming_coa_verification` into a PM-03 column without noticing,
  because the moment it becomes one the pair silently looks derivable
  and the approval stops being demanded.

Reviewing it is tracked by `policy_decisions_outstanding()`, where the
temporary exception sorts first.
