# Decision note — CoA verification versus QA disposition

One divergence, for decision. The gate is currently stricter than the
permission matrix, deliberately and on your approval. This note sets
out exactly what it would take to make them agree, what that would
cost, and what happens if nothing changes.

**No permission has been changed.** PM-03 is exactly as it was.

Status: **open, awaiting your decision.** The control is enforced
either way; what is open is whether the matrix should be redrawn to
match it.

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

## 4. A gap found while writing this, recorded not closed

`material_coa_verify()` checks **company membership and nothing
else**. Any active member of the company can verify an incoming
certificate today — a storekeeper, a viewer, anyone.

That is not a regression; it predates this branch. It is listed here
because the PM-03 change in §2 is also the fix: whichever role gets
the column, the RPC should assert it.

**Not closed here**, because closing it means choosing the role, which
is the decision this note is asking for. Closing it without the
decision would be granting the authority to whoever happened to be
convenient.

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
| `material_coa_verify` | gains a section guard — closes §4 | stays membership-only | stays membership-only |
| Divergence | **resolved** | **stands, documented** | n/a |
| Work | a migration, an RPC guard, a screen | none | one `UPDATE` |

**Recommendation: Option B for this release.** The control is enforced
and correct either way; Option A grants a role a new authority and
requires a screen that does not exist, which is more than a release
candidate should absorb. Option C removes a control the brief asked
for.

If you take Option B, the divergence stands and is recorded in the
conflict register §40 for the design to resolve in its own time.

---

## 8. What I need from you

1. **A, B or C.**
2. If A: **which role** gets Act on incoming CoA verification. I will
   not choose it.
3. Either way: whether `material_coa_verify()`'s membership-only guard
   (§4) should be closed in this release or listed as a known gap.
