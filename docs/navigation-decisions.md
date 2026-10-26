# Navigation and scope — decisions of record

What was decided, by whom, and what it changed in the code. Short on
purpose: the detail lives in `src/lib/navigation/hs02.ts`, where it is
next to the thing it governs, and in `docs/implementation-matrix.md`,
which is generated from that file.

## Product decisions — settled by the product owner

| # | Decision | Where it lands |
|---|---|---|
| **D1** | **Obligations, Risk Register and Policies are in the pilot.** Users must be able to find and use them; their functionality is preserved and verified. | Three rail entries in a new `Governance` group. Supersedes HS-01 row 8, which had left them off "unless item 25 walks them in the demonstration company". |
| **D2** | **Logistics and Customs are in the pilot**, designed, implemented and reachable by authorised users. | A new `Logistics` group with the three built pages. Supersedes HS-02's exclusion list for this product. |
| **D3** | **Missing designs are created and the features built.** No feature is deleted for lacking a design; no feature is called done because a screen renders. | `kind: 'pendingDesign'` — a real destination now, plus a recorded statement of what the design still owes. 24 pages carry it. |
| **D4** | **HS-02 is the navigation standard**, replacing DB-01, with D1–D3 folded into its baseline. | `DB01_NAV` deleted. `DESTINATIONS` in `hs02.ts` replaces it. |

## Engineering decisions taken to implement them

**1. The fallback is gone, and the type is what removes it.**
`DESTINATIONS` is `Record<PageId, Destination>`, so a page with no
stated destination does not compile. The old bug was not a wrong label;
it was a `: 'More'` default on a map lookup. A default cannot be fixed
by a better default, only by not having one.

**2. Hosted pages are nested under their host, for now.**
HS-02 draws a flat rail of 14 entries and relocates much of the rest
into Settings (CF-02) or into tabs — "CoA register → Batch Release ›
Certificates", "Applications, CTD Dossiers, Licence Vault →
Registrations & Licences (tabs)". Those tabs do not exist yet.

Rendering only the 14 would have orphaned about sixty working pages, so
a hosted page is drawn as a named child under its host, collapsed, with
a count. This is a transitional step and deliberately not a second
"More": More was one anonymous bucket of 80 unrelated pages; these are
named children of the entry they belong to, and a host holding the
current page opens itself. Phase 2 replaces the nesting with the real
tabs, host by host.

**3. An orphaned child is promoted, not hidden.**
If a permission hides a host but not its child, the child is drawn at
top level in the host's group. Losing a page because its parent was
hidden is the same class of bug this change exists to remove.

**4. Visibility is still not a security control.**
Nothing in `hs02.ts` grants or refuses anything. `PAGE_SECTION`,
`pageOpenableBy` and the database's policies are untouched, and
`src/tests/hs02Navigation.test.ts` asserts `PAGE_SECTION` byte for byte
so a navigation change cannot quietly move an authorisation boundary.
`capa-management` is the one page that both moved and is PM-03
governed; its section is asserted separately.

**5. The industry gate stays on Logistics.**
ONB-04's note — "a pharmaceutical manufacturer never sees logistics or
customs modules: they are not offered at all" — describes module
*enablement per workspace*, which is what `isLogisticsProfile`
implements. D2 makes the domain real, tested and intentionally placed;
it does not show customs screens to a pharmaceutical workspace. Keeping
that gate is also what keeps tenant isolation unchanged.

**6. Four pages are flagged `review` rather than moved or removed.**
Each works, and each has a design-side decision against it that the
owner has *not* overridden: `supplier-qualification` (HS-01 row 9),
`dispatch` (row 10), `compliance-reporting` (row 11) and
`enterprise-dashboard` (HS-02's MVP exclusions). They stay reachable and
carry a stated reason.
Deciding them needs the owner, and two of the mappings are inferences
from labels rather than statements in the design — said so at the entry.

`dispatch` is worth a sentence: HS-01 removes it, but PM-03 gives the
Storekeeper `Act` on Distribution and `20261111000000` built the page
for exactly that. Removing it would strand a tabulated permission, so it
is flagged rather than dropped.

## Logistics and Customs — what the domain review found

The three pages are real: `CN2223DeclarationPage`,
`ShipmentEventLogPage` and `ContrabandRejectionPage`, backed by
`customsDeclarationService`, `shipmentEventService` and
`contrabandService` against five tables with company-isolation RLS. No
mock data. The gap was not the interface — it was that **none of it was
tested**, and two rules were enforced only in the browser.

`20261203000000` fixes both:

**The CN22 flag was computed in the browser.** `autoFlag()` decided
whether a declaration was flagged — a CN22 above £270, or a contents
description too vague for customs — and the client then inserted
`is_flagged` and `flag_reason` as ordinary columns. A direct API call
could file a £5,000 CN22 with `is_flagged: false` and the row would read
as checked. The rule now lives in `cn_declaration_flag_reason()` with a
BEFORE trigger that ignores what the caller sends. The client keeps its
copy so the form can warn early; the two sets of constants are asserted
equal from both sides.

**Clearing a flag erased why it was raised.** The old call set
`is_flagged = false, flag_reason = NULL`, losing the only record of what
was wrong and of who accepted it. A resolution now requires
`flag_resolved_by`, keeps `flag_reason`, refuses outright on a
declaration that was never flagged, and cannot be un-recorded.

**`shipment_events.event_type` had no constraint.** Sixteen types were
declared in TypeScript and nowhere else, so a shipment's custody history
would accept any string. A CHECK now holds the same sixteen, added
`NOT VALID` then validated, so a pre-existing odd row surfaces instead
of aborting a deployment.

E10 of the new SQL suite caught a real bug in my own trigger while it
was being written: the branches were ordered so that a caller sending
`flag_resolved_by = NULL` on a resolved row re-raised the flag and wiped
the resolution. The already-resolved case is now tested first.

## Outstanding, and not attempted here

- **`company_id` has no foreign key** on `shipments`, `shipment_events`
  or `cn_declarations` — they were created as a bare `uuid NOT NULL`.
  Adding the constraint could fail on live rows that were never checked
  against it, so it is recorded rather than attempted blind. It needs a
  preflight count against production first.
- **Facility logs** is one of HS-02's fourteen rail entries and **has no
  page**. It is not invented into the rail; it is listed here as owed.
- **`correction-editor`, `notifications`, `profile`,
  `legal-partner-dashboard`** are reachable outside the rail by
  statement (`kind: 'standalone'`), each with its route recorded.
- The four `review` pages above need the owner's call.

---

## Phase 2 — the qa_manager gap, and Settings consolidation

### D5 — `qa_manager` gets a dedicated least-privilege preset

The owner refused the obvious repair (pointing `qa_manager` at the
existing `quality` preset) because that preset carries unrelated
capability including administration. So:

| Change | Detail |
|---|---|
| `canonicalRole()` | `"qa_manager"`, `"qa manager"` and `"qa-manager"` now resolve to a new `qa_manager` key. `norm()` only trims and lower-cases, so each separator variant had to be listed; all three occur in this codebase. **`norm()` was not widened**, because folding separators globally would start matching other roles (`"quality manager"` → the broader `quality` preset) — a widening nobody asked for. |
| `SYSTEM_ROLE_DEFAULTS.qa_manager` | A new preset, all eighty keys written out, **four** set true. |

**Granted:** `canViewObligations`, `canViewRiskRegister`, `canViewPolicies` (D1's three) — plus `canViewMyPolicies`.

That fourth key needs its justification stated, because it is beyond the
three the instruction listed. `canViewMyPolicies` is referenced in
**exactly one place** in the application: the `hidden` test on the My
Policies nav item. It gates no route, no write and no service call, and
the *route* for that page is guarded by `canViewPolicies`, which this
role has. Withholding it would therefore deny nothing — it would leave a
page the role is authorised to open and unable to find. Every other
preset granting `canViewPolicies` also grants it. A test asserts the
key's single usage, so if it ever starts gating something real, the
grant fails and has to be re-argued.

**Explicitly not granted:** `canManagePolicies`, `canPublishPolicies`,
`canManageRoles`, `canViewMembers`, `canInvite`, `canViewBilling`,
`canViewIntegrations`, `canManageApiKeys`, `canViewAuditTrail`,
`canManageVendors`, `canManageAuditWorkspace`, `canViewAIDashboard`, and
the remaining 66 keys. Asserted both by name and by count.

Operational access is unaffected and does not come from here: PM-03
governs it through `PAGE_SECTION`, and for a page the grid tabulates the
grid is the sole authority.

**Verified rather than inferred.** Rendering the three spellings before
and after: `qa_manager` saw none of the three pages, now sees all three;
`quality_manager` and `compliance` are unchanged.

### D6 — Settings is a home, not the company-profile page

`company-settings` is guarded by `canManageRoles` and *was* the rail
entry called "Settings". Consolidating behind it would have put every
configuration area behind role administration — a person allowed to see
Billing and nothing else would have needed role-admin to reach Billing.

So a new page, `settings-home`, is the rail entry, and
`company-settings` becomes one section inside it. The home is gated by
the **union of the sections' own existing checks** and lists only the
sections the viewer holds. It has no permission of its own, and no new
permission key was added — asserted.

Rendered per role: `qa_manager` sees one card (the ungated role matrix)
and no configuration area; `marketing` two; `executive` twelve.

One behaviour preserved deliberately: `access-control` carried **no
gate** as a sidebar entry and keeps none, so the home is never empty
today and every viewer still reaches the role matrix exactly as before.
Consolidating is not the place to start refusing something.

### Outstanding after Phase 2

- **`qa_officer` has the same defect `qa_manager` had.** PM-03 names it;
  `canonicalRole()` does not know it, so it resolves to
  `EMPTY_PERMISSIONS`. Out of scope here — the instruction covered
  `qa_manager` — and asserted in a test so the gap is recorded rather
  than merely described.
- **`quality_manager` and `qa_manager` name one job and resolve
  differently** (the broader `quality` preset versus the narrow one).
  Kept on purpose: changing the former was explicitly out of scope.
- The nesting under each host is still transitional. Settings now has a
  real home; the other hosts (Materials tabs, Batch Release ›
  Certificates, Registrations & Licences tabs) do not yet.

---

## Phase 3, batch 1 — Facility logs

### D7 — Facility logs is built from W6·29, not invented

Phase 1 recorded this as the one HS-02 rail entry with **no page at
all**, and deliberately did not fabricate a rail entry for it. The
design was never missing: W6·29 draws fourteen screens (FL-01 to
FL-14). Only the implementation was.

What the design establishes, and is therefore implemented:

- **Logs belong to the facility, not to a batch** — FL-01 says so in as
  many words, which is why nothing in the schema references a batch.
- A zone carries a grade, a line, equipment, an owner and a cleaning
  SOP (FL-02's edit panel).
- Each zone has its own scheduled tests, each with a frequency and
  **two** thresholds: FL-01 shows "alert 25, action 50".
- The log types are FL-01's tabs: environmental air and surface,
  cleaning routine and deep, water, pest control.
- Overdue escalation is a per-zone **field**, not a constant —
  "Alert the owner after (days overdue)" and "Escalate to QA Manager
  after (days)", tagged in the design "SAME RULE AS CAPA OVERDUE".

What is **not** established anywhere, and so was not invented:

- **No sign-off.** FL-03 and FL-08 show one person recording a reading;
  no second signature appears in W6·29. Adding one to a GMP record is a
  quality decision, so the signature machinery is untouched.
- **No automatic deviation.** FL-05 shows a deviation *linked* to a
  zone's history, but not what raises it or on which rule.
  `linked_deviation_id` exists so the link can be recorded; nothing
  creates one.
- **Grade is open text, not an enum.** The design shows Grade C, D and
  Unclassified; EU GMP also has A and B and a company may classify
  differently. Constraining it to three values seen on one screen would
  be inventing a rule. `log_type` and `frequency` *are* constrained,
  because the tabs are the vocabulary.

### The one rule the database does enforce

`outcome` is **derived, never accepted**. A reading's standing against
its limits is the evidential content of an environmental log, and a
client that computes it can be made to report 112 CFU against an action
limit of 100 as fine — the same defect found in the customs flag one
migration earlier. `facility_log_outcome()` plus a BEFORE trigger
decide it, and the service sends no `outcome` at all.

`not_assessed` is deliberately distinct from `within_limits`: a reading
taken where no limit is configured has not passed anything. FL-01 draws
exactly that row.

Two integrity checks come with it: an entry cannot be attached to a
zone belonging to another company (even with your own `company_id`),
and a schedule from a different zone is refused because its limits
would be the wrong ones.

### Permissions — nothing new

Gated by the same industry check the rest of the manufacturing-quality
cluster uses (`isLogisticsProfile || !usesManufacturingQuality`), which
is how `gmp-inspection` is gated. PM-03 does not tabulate facility
logs, so no section check applies and **no permission key was
invented**. HS-01 row 7 supports the placement: "GMP Inspection — Rail;
Facility logs sits under it."

### Deferred, and recorded rather than part-built

- **FL-06 / FL-07 trends** (rising counts with limit lines) — the data
  supports it; the chart is not built.
- **FL-13 / FL-14 finding → corrective-action task** — needs the rule
  that turns a finding into a task, which the design does not state.
- **FL-02's zone editing UI.** Zones and schedules are readable and the
  register depends on them, but creating one is not yet a screen; the
  empty state says so rather than pretending otherwise.

### Still outstanding from earlier phases

`qa_officer`'s permission mapping, the logistics `company_id` foreign
keys and `rejection_reason` validation (items 7A–7C) are **not** in this
batch. The three new facility tables do each carry a `company_id`
foreign key to `companies`, asserted in A3 of the new suite — the gap
found on the logistics tables was not repeated.

---

## Phase 3, batch 2 — FL-02, and the two logistics preflights

### D8 — Facility logs gets the screen that makes it usable

Batch 1 built FL-01, the register, and left one thing out. The
omission made the feature **unusable rather than incomplete**: there
was no way to create a zone or a scheduled test, so a company that had
never been seeded saw FL-01's empty state for ever. FL-01 itself told
the reader to "add them under Zones & schedules" — naming a screen
that did not exist.

FL-02 is drawn in W6·29, so nothing in this batch is invented. The
zone panel's fields, the two per-zone escalation days, and the
scheduled tests with their frequency and two limits are all read off
the design.

**Reached from FL-01, not given a rail entry.** HS-02 lists one
"Facility logs" and no second item beside it, so FL-02 is a view of
the same destination rather than a new one. The matrix still reports
112 pages.

**Retire, never delete.** `facility_log_entries.zone_id` is
`ON DELETE CASCADE`, so deleting a zone would take its GMP records
with it, and `schedule_id` is `ON DELETE SET NULL`, so deleting a
schedule would strand every past reading with no record of which test
produced it. FL-02 offers no delete either. Both FK rules are now
asserted (E1/E2 of the new suite) so the reasoning cannot go stale.

### A defect this batch's own tests found

The first version of `fn_facility_zone_integrity()` raised
`FACILITY_SITE_WRONG_COMPANY` when a zone named another company's
site. The suite reported `FACILITY_SITE_NOT_FOUND` instead, and the
test was right.

The trigger is `SECURITY INVOKER`, so its lookup on `sites` runs under
the caller's own RLS, and another company's site is not merely wrong to
that caller — it is **invisible**. The lookup finds nothing to compare,
so the NOT_FOUND branch is the one that refuses the write. The refusal
was always correct; the diagnosis was not.

Two things changed rather than one:

- The message now says what was actually checked — "No site of this
  company has that id" — instead of "That site no longer exists",
  which was a guess about which of two causes applied. The same
  correction was made to `FACILITY_ZONE_NOT_FOUND`, and a batch-1 test
  that pinned the old wording was updated with it.
- `WRONG_COMPANY` is **kept**, because it is not dead code: in a
  context that bypasses RLS — the service role, a migration, anything
  running as the table owner — the row *is* visible and the company
  mismatch is what has to stop the write. Section H of the new suite
  asserts both branches in the posture where each one fires. An
  untested branch in a refusal path is one nobody knows still works.

The alternative was a `SECURITY DEFINER` helper so the trigger could
always tell "does not exist" from "belongs to someone else". It was
rejected: it would read every company's sites in order to improve an
error message, and the message would then confirm to any caller
whether an arbitrary site id exists in somebody else's company.

### What is enforced, and what is deliberately not

Enforced server-side: a zone's site must belong to the zone's company;
a schedule's zone must belong to the schedule's company; neither a
zone name nor a test description may be blank; `log_type` and
`frequency` stay inside FL-01's vocabulary; an action limit may not sit
below its alert limit.

**Not** enforced: any ordering between "alert the owner after" and
"escalate to QA after". FL-02 draws them as two fields and states no
rule, and a company that wants QA told first is not obviously wrong.
The column defaults (0 and 1) read as though escalation follows the
alert, which is exactly why the absence of a constraint is recorded
here and asserted by a test — so that imposing the rule later has to
be a decision rather than a slip.

### Items 7B and 7C — preflights written and run locally

Both are **read-only** scripts. Neither creates, alters or writes
anything, and a test asserts the second one contains no DDL outside
its quoted proposal.

**`scripts/preflight/logistics-company-id.sql`** (item 7B). Checked
live rather than assumed, and it found **four** tables missing the
foreign key, not the three reported: `shipments`, `shipment_events`,
`cn_declarations` and **`contraband_rejection_log`**. It reports
orphan counts, the offending company ids, nil/placeholder ids, and
separately the child rows whose parent shipment belongs to a different
company — which the FK would not catch but is the same class of
defect.

**`scripts/preflight/rejection-reason-vocabulary.sql`** (item 7C). The
vocabulary is **not** invented: `REJECTION_REASONS` in
`contrabandService.ts` holds eleven values and the page renders them as
a `<select>`, refusing to submit without one. That is the only evidence
that exists — W6 does not draw this screen. The script reports every
distinct value stored, which of them fall outside the eleven, and
whether a mismatch is merely case or spacing (normalisable) or a
genuinely new reason (a decision). Because the script must hardcode the
list, a unit test now asserts it equals `REJECTION_REASONS`, so the two
cannot drift.

The proposal is recorded and **not applied**: `ADD CONSTRAINT … NOT
VALID` then `VALIDATE CONSTRAINT`, the pattern already used for
`shipment_events_event_type_check`. The weaker option —
`CHECK (btrim(rejection_reason) <> '')`, following
`material_rejection_reason_chk` — is recommended if the owner has not
decided whether the list is closed, because `Other Policy Violation`
already exists as its tail and a closed list means every new reason
needs a migration.

> **Both preflights have been run on a LOCAL build only**, whose
> logistics tables hold between one and four fixture rows. They
> reported zero orphans and zero unrecognised reasons. That proves the
> scripts work. It says **nothing** about production, and must not be
> quoted as though it did. Neither constraint should be added until the
> scripts have been run against the real database by someone with
> authority to do so.

### A finding about the 24 "design-owed" pages

`pendingDesign` has been conflating two different things, and the
matrix has been understating the product because of it. The kind means
"no Figma frame", not "not built".

Tracing all 24 pages' service imports to the tables they actually
read: **22 are backed by real tables with RLS**. Two are not —
`regulatory-library` and `legal-marketplace` have no data layer at all,
and those are the genuine placeholder screens.

This does not change any classification in `navigation-audit.md`,
whose job was design evidence, and it is not grounds for removing
anything. It does mean the remaining Priority 2 work is far smaller
than 24 pages, and that the two hollow screens are where it starts.
Facility logs was never in this set: its design existed, which is why
batch 1 could build it from W6·29.

---

## Phase 3, batch 3 — FL-06/FL-07 trends, and the review-page reassessment

> **Note on provenance.** No Batch 3 brief was issued. This batch works
> the outstanding list as restated by the owner — trends, the review
> pages, the Regulatory Library, Legal Marketplace scope — under the
> Batch 2 constraints. Nothing here was inferred from a prompt that
> does not exist.

### D9 — Trends are built from FL-06, including its accessibility rules

FL-06 and FL-07 are drawn, and FL-06 states its own aggregation in its
subtitle:

> "Highest settle-plate count per zone per week. Each chart has its own
> limits drawn as labelled lines."

So a series is a weekly **maximum**, computed by
`facility_log_trend()`. This is not a stylistic preference: a week of
10, 10, 10 and 112 has a mean of 35.5, which sits under an action limit
of 100 and would draw as comfortable. Section B of the new SQL suite
turns on exactly that row, and the assertion was mutation-tested — a
mean returns `35.5000000000000000` and the test fails.

FL-07 is not a second feature. It is FL-06 **checked in greyscale**,
which makes the design's note a hard constraint rather than advice:

> "One series per chart, no colour-only meaning: points change shape
> (filled circle, hollow square, solid square) and the limits differ by
> dash pattern and are labelled at the line end. Axes are labelled.
> 'Show as table' gives the same numbers for screen readers and print."

Every clause is implemented, and the reason each is load-bearing is
recorded at the code. The point's **shape** is the meaning and colour
is only reinforcement; the two limit lines differ by dash pattern and
are labelled at their right-hand end, so neither needs a legend swatch;
the legend names the shape in words, so it reads correctly aloud; and
"Show as table" renders a real `<table>` built from the same series the
chart draws, so the two cannot disagree.

`bandFor` tests the action limit **before** the alert limit, matching
the order in `facility_log_outcome()`. Reversed, a reading of 112
against 50/100 would draw as a hollow square — "above alert" — while
the row it came from is recorded as outside the action limit, so the
chart would contradict the record. Six tests fail if that order is
swapped; this was mutation-tested.

### Two things FL-06 does not establish, and were not guessed

**Where a week starts.** FL-06's x-axis reads 04 Aug, 11 Aug, 18 Aug …
and in 2026 the 4th of August is a **Tuesday**, so the mock's buckets
are not Monday-aligned and no rule is stated anywhere.
`date_trunc('week', …)` is used, which is ISO-8601 and therefore
Monday. That is a choice, not a reading of the design, and section G
pins it.

**The three sub-tabs.** FL-06 offers "Settle plates", "Surface swabs"
and "Active air", but `log_type` has only `environmental_air` and
`environmental_surface`: settle plates and active air are both **air**
methods and the schema cannot tell them apart — only the schedule's
`description` does ("Air · settle plates, 4 positions"). Adding a third
enum value, or a `method` column, would be deciding how a company
classifies its own air monitoring.

> **Decision needed.** Should air monitoring distinguish settle plates
> from active air as a stored field, or is the schedule description
> sufficient? Until that is answered, the trend screen offers two tabs
> rather than FL-06's three.

**Which limits a chart draws.** A zone may carry several schedules of
one log type, and FL-06 draws one pair of limit lines. The **tightest**
is used, so a reading is never drawn as comfortable against a looser
limit than one of its own schedules imposes; the alternative — the
newest schedule's limits — would redraw history whenever a limit was
relaxed. Per-entry judgement is unaffected either way, because
`outcome` was decided against that entry's own schedule when it was
written and is never recomputed.

**What counts as "rising"** is also unstated. FL-06 prints a "rising"
narrative and a "Flat, except …" one but never says where the line
falls. Three points (two consecutive increases) is the choice, because
two points is only "the last reading was higher than the one before",
which happens constantly in environmental data. `RISING_RUN_MIN_POINTS`
names it and a test pins it.

**Export.** FL-06 carries an Export button and W6·29 notes that
"environmental logs go into evidence export". What is implemented is a
CSV of the numbers on screen, labelled **Download CSV** rather than
Export, because wiring this into the formal evidence package (TR-09 /
TR-10) is a different piece of work with its own approval. Calling a
CSV "evidence export" would overstate it.

### The four review pages — reassessed, with one decisive finding

This was a reassessment, and it produced a result rather than a
restatement. The deciding evidence is PM-03 itself, queried rather than
recalled:

| Section | Role | Access |
|---|---|---|
| `distribution` | storekeeper | **act** |
| `distribution` | compliance_admin, management, qa_manager, qa_officer | view |
| `suppliers` | procurement | **act** |
| `suppliers` | qa_manager | **act** |
| `suppliers` | compliance_admin, management, qa_officer, storekeeper | view |

And the page map: **`dispatch` is the only page serving
`distribution`, and `supplier-qualification` is the only page serving
`suppliers`.** Nine of PM-03's eleven sections have exactly one page,
so for them "remove the page" and "remove the section" are the same
act.

- **`dispatch` — recommend KEEP.** HS-01 row 10 says remove, giving as
  its reason "the storekeeper sees Materials". PM-03 contradicts that
  directly: the Storekeeper has `act` on Distribution, not on Materials
  alone. Removing the page leaves a tabulated permission pointing at
  nothing. Two approved sources conflict, so the owner decides — but
  the cost of removal is now concrete.

- **`supplier-qualification` — recommend KEEP, and row 9 cannot be
  executed as written.** HS-01 row 9 does not simply say remove; it
  says the approved-supplier list "stays in Settings › Materials and
  suppliers", presupposing a home. **CF-02's Settings home has
  seventeen sections and none is suppliers or materials.** So following
  row 9 today would delete the only supplier page and move its contents
  to a page that has never been built, while Procurement and the QA
  Manager hold `act` on the section. Building that Settings section is
  a prerequisite, not a detail.

- **`compliance-reporting` — recommend KEEP.** Nothing is stranded: it
  carries no PM-03 section. Its case rests entirely on HS-01 row 11,
  and the destination note already concedes that mapping this page to
  that row "is an inference from its label". The brief's own rule — a
  missing or inferred design is not grounds for deletion — settles it.

- **`enterprise-dashboard` — the strongest case for removal, still a
  recommendation.** HS-02 lists "Group-level roll-up" under "Excluded
  from the MVP: never in navigation", which under D4 is authority.
  Nothing is stranded. What stops this being done rather than
  recommended is that *this page is that item* remains an
  identification: the page is labelled "Group Overview". The owner
  should confirm the identification, after which removing it from the
  rail follows from D4 without further decision.

All four stay `kind: 'review'` and all four still render as top-level
rail entries, so nothing was hidden while the question is open.
`src/tests/reviewPages.test.ts` holds the facts the reassessment rests
on — including an invariant that **every PM-03 section has at least one
page**, which fails if either load-bearing page is deleted.

### The Regulatory Library — a correction to batch 2's shorthand

Batch 2 reported `regulatory-library` and `legal-marketplace` as "the
two genuinely hollow screens". That is accurate for
`legal-marketplace` and **not accurate** for the library, so the
earlier wording is withdrawn.

`regulatoryLibraryService` holds a corpus of **real regulatory
reference text** — the NAFDAC Act (Cap N1 LFN 2004) among others, with
summaries, full text, source URLs and jurisdictions — and the page's
search genuinely filters it by query, jurisdiction and document type.
A library of statutes is legitimately static content; it is not mock
operational data standing in for a feature.

What it lacks is any company-scoped state: no way to record that a
document has been reviewed, to bookmark one, to link one to an
obligation, or to add a circular the company has received. None of that
is drawn anywhere, and inventing a regulatory review workflow is
exactly the kind of regulated procedure this project does not invent.

One real defect was found and fixed: the service imported `supabase`
and never used it, which ESLint reported as an error. Removing it is
the whole change.

> **Decision needed.** Is the Regulatory Library meant to stay a
> read-only reference corpus, or to become a company-scoped register
> with review state? The first needs nothing; the second needs its
> rules stated before a table is designed.

### Legal Marketplace — still unresolved, and still untouched

HS-02 excludes a "Regulator portal" and does not mention a marketplace
either way. There is no design, no backing table, and no approved
statement of what it is for. Nothing was built.

> **Decision needed.** Is a legal marketplace in the pilot at all? If
> yes, what does it list and who may act in it?

### `qa_officer` — unchanged, and one new data point

Still unresolved, and deliberately untouched during this batch. One
observation from the PM-03 query above that bears on it: `qa_officer`
**does** appear in `section_permissions`, with `view` on both
`distribution` and `suppliers`. So the role is tabulated in the
database matrix while resolving to the empty permission set on the
TypeScript side — which is further evidence that the gap is a mapping
defect rather than a deliberate absence, but still does not state what
its permission keys should be.

> **Decision needed, unchanged.** The PM-03 row for `qa_officer`, or a
> statement that it mirrors another role's cell.

---

## Phase 3, batch 4 — pest control, and the supplier register

> **Provenance.** The brief for this batch asked to continue from
> `69aaf47` and included FL-06/FL-07 trends and the review-page
> reassessment, both of which had already landed in `461c8cf`. Those
> were not redone. This batch covers what was genuinely outstanding:
> FL-13/FL-14, the two missing data layers, and the route and
> authorisation half of the review-page question.

### D10 — Pest control is built; the corrective-action task is not, and cannot be

W6·29's note on FL-13 is both the specification and the rule:

> "Fields are those PRD G3.9 names: provider, method, date, findings
> and corrective actions. A finding marked as needing action can't be
> closed by a note; it becomes a task with an owner and a due date,
> alerted through the same overdue rule as every facility log."

`pest_control` had been one of the six facility log types since the
first facility migration, but a pest visit is not shaped like a
reading: FL-13 draws a contracted **provider**, a **visit** by a named
technician with a report file, and **many per-station findings** inside
that one visit. Three tables now hold that, each with a `company_id`
foreign key to `companies`.

**The first half of the rule is enforced.** A finding whose
`needs_action` is true cannot have `resolved_at` set unless
`corrective_task_id` names a task. C2 of the new suite writes a
plausible, detailed resolution note onto such a finding and requires
the refusal; the rule was mutation-tested, and breaking it makes C2
and C3 fail.

The same trigger closes the loophole from the other side: a finding
that was marked as needing action **and already closed** cannot have
the flag cleared afterwards, which would retrospectively turn a
corrective action into a note. Un-marking a finding that is still open
*is* allowed, because a mistake on the day should be correctable.

**The second half cannot be built, and this is the decision.**

> ### Decision required — the task register
>
> "It becomes a task with an owner and a due date" presupposes a task
> register. **This product has none.**
> `src/lib/tasks/taskSources.ts` opens by saying so — *"My tasks —
> derived, because there is no task register"* — and continues: *"It
> has no due date and no urgency ordering, because nothing records
> them."* A derived task is a record sitting in a state only one role
> can move; it has no owner and no due date, which is precisely what
> this rule requires.
>
> Two candidates were considered and both rejected:
>
> - **A free-text task reference** would *be* a note, which is the one
>   thing the design forbids.
> - **`capa_actions`** has `assigned_to` and `due_date` and would fit
>   mechanically, but it hangs off `capa_records`. Making every pest
>   finding a CAPA classifies a bait station as a formal
>   corrective-and-preventive-action record. That is a quality
>   decision, not a schema convenience — and FL-14 shows
>   "TASK-2026-0161", a task, not a CAPA number.
>
> **The decision needed is one of:** (a) a general task register with
> an owner and a due date, which is a product capability well beyond
> facility logs; or (b) an explicit ruling that a pest finding needing
> action *is* a CAPA, in which case `capa_records` is the right home
> and the classification is the owner's to make.
>
> Until one is taken, `corrective_task_id` is a bare uuid with no
> foreign key and nothing in the product can set it. **The consequence
> is intended:** a finding marked as needing action can be recorded
> and shown, and cannot be closed. That is the design's instruction —
> it may not be closed by a note — rather than a gap left open. The
> screen says so in words next to the disabled control, rather than
> offering a button the database will refuse.

**Not invented.** No disposition enum: FL-13's ACTION column shows
"—", "Normal level · no action" and "Watch at next visit", and only
the needs-action flag is load-bearing, so the rest is free text. No
visit-frequency enum either: FL-13 says "Fortnightly visits" and
`facility_zone_schedules.frequency` allows only daily / weekly /
monthly / quarterly, so widening that CHECK to fit a pest contract was
refused and pest visits carry their own free text. No automatic
deviation, and no signature.

### D11 — The approved-supplier register, and a correction

**Batch 3 said all four `review` pages were working features. That was
wrong about one of them**, and the error is worth stating plainly:
`supplier-qualification` rendered a **`ComingSoonPage`**. The claim was
made from the destination model and PM-03 without reading the route.

What the route reading found, converging from three approved sources:

- `public.suppliers` is a real table — name, code,
  `qualification_status`, `qualified_until`, country, contact — with
  RLS enabled and company-isolation policies on **all four verbs**.
  Only `materialLotService` read it, as a lookup for lots.
- PM-03 grants `act` on section `suppliers` to **Procurement** and the
  **QA Manager**, and `view` to four more roles. Those grants had no
  page to be exercised on: **a permission already stranded**, not one
  that would be stranded if something were removed.
- HS-01 row 9 keeps the approved-supplier **list** in the product.

So the list is in scope and is now built. **The qualification workflow
is not** — the same HS-01 row 9 excludes supplier qualification from
the MVP, so there are no questionnaires, no audit scheduling, no CMO
assessment and no scoring.

No migration was needed: the table and its policies already existed.
The status vocabulary is read off `suppliers_qualification_chk`, which
has constrained the column to five values since the table was created,
so nothing was invented there either. Authorisation is
`canAct(role, 'suppliers')` — PM-03's own grid, not a new permission
key. Rendered as Procurement the standing control appears on all five
rows; as Storekeeper (view) and QC Analyst (no cell) it appears on
none, and the page says why rather than looking broken.

**One piece of reasoning the data does not state.** A `qualified_until`
in the past means the approval has run out, and the register reports
that **without rewriting `qualification_status`** — a date passing is
not somebody deciding to disqualify a supplier. So a lapsed supplier
still reads "Qualified" in its own column while `isUsable` returns
false and the row sorts to the top. That is the silent failure the
screen exists to surface, and two tests fail if the lapse stops
blocking usability.

### The other two review pages — route and authorisation

- **`dispatch`** has **no permission guard on its route at all**. That
  is nonetheless correct, because `DispatchPage` consults the grid
  itself — `canAct(role, 'distribution')`. A test now pins that call,
  because removing it would open the page to anyone while the route
  looks unchanged.
- **`compliance-reporting`** is guarded by
  `perms.canViewComplianceReporting` behind a `FeatureGate`, and
  **`enterprise-dashboard`** by the same key plus
  `profile.organization_id`. Both are correct and unchanged.

All four remain `kind: 'review'`. The recommendations from batch 3
stand, with `supplier-qualification`'s strengthened: it is no longer a
question of whether to keep a working page, because the page was a stub
and the register that replaces it is what row 9 asked for.

### The Regulatory Library — the evidence trace came up empty

The brief's condition was to implement a real data model *if* the page
is within approved scope **and** its behaviour can be established from
evidence. It traced to nothing:

- **No Figma screen.** `navigation-audit.md` established this, and it
  is distinct from the SOP Library.
- **No product requirement.** `docs/ROADMAP.md` does not mention a
  regulatory library; its only "libraries" reference is to code
  libraries. No PRD in the repository names one — note that PRD G3.9,
  which FL-13's design quotes, is **not in the repository either**, so
  the pest field list is established only by the design's quotation of
  it.
- **No old-product code cited** for it anywhere.

What exists is a static corpus of **real regulatory reference text**
with working search. A library of statutes is legitimately static, and
batch 3 already withdrew the "hollow screen" description. What it
lacks is any company-scoped state — no review record, no bookmark, no
link to an obligation — and inventing a regulatory review workflow is
exactly the kind of regulated procedure this project does not invent.

> **Decision required.** Is the Regulatory Library a read-only
> reference corpus, or a company-scoped register with review state? The
> first is finished. The second needs its rules stated — what is
> recorded, by whom, and what a review means — before a table is worth
> designing. **No data model was built, because the condition the brief
> set was not met.**

### Legal Marketplace — unchanged, as instructed

Nothing was built and nothing was removed. The evidence available:

- HS-02 excludes a "Regulator portal" from navigation and **does not
  mention a marketplace either way**.
- No Figma frame, no roadmap entry, no backing table, no service.
- `LegalMarketplacePage` is 252 lines with no data access of any kind —
  the one page in the owed set that is a genuine placeholder.

> **The smallest precise decision needed:** is a legal marketplace in
> the pilot at all — yes or no? Everything else (what it lists, who may
> act in it, whether money changes hands) follows from that answer and
> cannot be usefully specified before it. If the answer is no, the page
> should be removed from the rail by the same D4 reasoning that applies
> to `enterprise-dashboard`.

### `qa_officer` — untouched

Unchanged, as instructed, and no shortcut was taken. The `quality`
preset was not granted. The decision required is still the PM-03 row
for `qa_officer`, or an explicit statement of role equivalence.

---

## Phase 3, batch 5 — water treatment (FL-10 / FL-11)

### D12 — Water results are judged by their own rule, and here is why

`water` has been one of the six facility log types since the first
facility migration, and FL-01 could always show a water reading. What
it could not show is FL-11, because **FL-11's limits are not the shape
the environmental model assumes**.

`facility_log_outcome()` asks one question: is the result ABOVE its
limit. That is right for a settle plate, where more growth is worse.
FL-11 draws four different shapes:

| Test | Limit | Shape |
|---|---|---|
| Free chlorine after carbon | `0.00` | maximum, at zero |
| Conductivity, RO permeate | `1.3 or less` | maximum |
| pH, loop return | `5.0 – 7.0` | **range** |
| Total viable count, PW-03 | `100 or less` | maximum |
| Coliforms, PW-03 | `Absent in 100 mL` | **qualitative** |

**The defect this avoids was confirmed, not assumed.** Before writing
the migration, the existing function was run against a pH range
expressed as an upper bound of 7.0:

```
 pH 4.0 too acidic   | facility_log_outcome: within_limits
 pH 6.1 correct      | facility_log_outcome: within_limits
 pH 9.0 too alkaline | facility_log_outcome: outside_action
```

A pH of 4.0 — far too acidic to release purified water on — comes back
`within_limits`, because 4.0 is not greater than 7.0. **Section B3 of
the new suite asserts that the old function really does say this**, so
the reason this second derivation exists is a recorded fact rather
than a claim in a comment. If `facility_log_outcome` ever learns about
ranges, B3 fails and this model should be revisited.

Coliforms are the other half: "Absent in 100 mL" is not a number and
no arithmetic makes it one.

So `facility_water_outcome()` switches on `limit_kind` and returns one
of `within_limits`, `outside_limits`, `awaiting_laboratory` or
`not_assessed`. As everywhere else in this feature the **database**
decides and the client sends no `outcome` at all.

**`awaiting_laboratory` is checked first**, before any limit. FL-11
draws "Not received · due 15 Oct" on the monthly analysis: the sample
was taken and the laboratory has not reported. That is neither a pass
nor a failure nor a missed test, and treating it as a pass would be
the worst available default.

### What establishes the fields

FL-11's own note, which also names the requirement:

> "Fields are those PRD G3.8 names: source, treatment method, testing
> frequency, results and testing laboratory. Lab reports attach to the
> result. The overdue monthly analysis uses the same alert rule as
> environmental tests (FL-02), as engineering item 22 requires."

All five are implemented. The treatment method is drawn as an **ordered
train** — "Borehole BH-1 → Sand filter → Carbon filter → Softener →
Reverse osmosis RO-1 → UV lamp UV-1 → Purified water loop" — so it is
a table with a position, not a text field, and a position cannot repeat
within a source.

Note that **PRD G3.8 is not in the repository**, exactly as PRD G3.9
was not for pest control. The field list is established by the approved
design's quotation of it, which is the only evidence available.

Because FL-11 says the overdue rule is FL-02's, and FL-02 keeps its
escalation days per zone, a water source may name a zone. It is
nullable — FL-01's borehole row sits at the site rather than in a
graded room — and where it is null no escalation is configured rather
than a default being invented.

### Not invented

**No pharmacopoeial or WHO figures are written into the schema.** A
limit here is always data. Which brings up the one thing building this
screen revealed:

> **Decision required — a limit judged against an external document.**
>
> FL-11's monthly row reads "Per WHO drinking-water list". That is not
> a maximum, a range or a qualitative expectation: it is a reference to
> somebody else's document containing dozens of parameters, and none of
> the three `limit_kind` values can express it. The fixture used in
> rendering had to stand a placeholder ceiling in its place, which
> prints as "9999 or less" — visibly wrong, and left visible rather
> than hidden.
>
> A fourth kind — something like `reference`, carrying the document's
> name and deriving `not_assessed` so that a person records the verdict
> — would fit the honesty principle the rest of this model follows. But
> adding it decides how a company records conformance to an external
> standard, so it is **recorded here rather than invented**.
>
> **The decision:** should a water test be able to name an external
> specification document instead of a numeric limit, and if so does a
> person record the verdict, or does the product expect the individual
> parameters to be entered as separate tests?

No automatic deviation, no sign-off, no second signature — none is
drawn in W6·29.

### FL-04 and FL-09, still outstanding

Of W6·29's fourteen screens, twelve are now built. The two that are
not:

- **FL-04 "Floor: settle plate outside action limit"** — the breach
  variant of FL-03's recording flow. The recording path already
  derives and displays `outside_action` correctly, so what FL-04 adds
  is whatever the design shows happening *next* after a breach. That
  needs reading before it is built, and it may well turn out to
  overlap the corrective-action question that D10 left open.
- **FL-09 "Deep cleaning schedule and cleaning records"** — the
  Cleaning tab. `cleaning_routine` and `cleaning_deep` are already
  log types and FL-01's register handles them, and `deepCleanOverdue`
  is already a tile on it. What FL-09 adds beyond that is a dedicated
  schedule view, which is a smaller piece of work than water or pest
  and is the natural next batch.

---

# Phase 2 — the six authorised decisions

The product owner settled the six open items. They are recorded here as
the working direction, each with what it changes and what it still
rules out.

## P2-1 — Pest control: a general auditable action register

**Authorised:** implement a general, auditable action register for
findings requiring action; link or escalate to formal CAPA when the
approved severity, recurrence or product-impact criteria require it;
never allow a finding requiring action to be closed without its
required action and closure evidence; **define the escalation criteria
explicitly rather than inventing hidden rules.**

This supersedes D10's blocker. D10 refused to build the task half
because no task register existed and because making every pest finding
a CAPA would have classified a bait station as a formal CAPA record.
Both objections are answered: a register is now authorised, and
escalation to CAPA is to be *criteria-driven* rather than automatic.

The last clause is the design constraint that matters. "Explicitly
rather than hidden" means the criteria are **stored, readable rows** —
not thresholds compiled into a trigger where nobody can see which rule
fired. So escalation is evaluated against criteria the company can
read, and every evaluation records which criterion it matched.

## P2-2 — QA Officer: one key, derived from the row

**Authorised:** correct the mapping from the existing PM-03 row; do not
equate `qa_officer` with `qa_manager`; do not grant the legacy
`quality` preset; implement only the fine-grained permissions the
approved duties need; add regression tests for access and denial.

Done. The row was read from `section_permissions`:

| Access | Sections |
|---|---|
| `act` | `coa_register`, `deviation_capa`, `qa_disposition` |
| `view` | `batch_records`, `batch_release`, `distribution`, `goods_receipt`, `material_lots`, `qc_testing`, `suppliers`, `traceability` |

Each of the eleven was checked against its page's route guard and its
nav entry. **Ten are gated by PM-03 alone** and consult no
`Permissions` key. The exception is `deviation_capa`, whose two pages
are guarded by `perms.canViewCapaManagement` on the route and hidden
from the rail by the same key.

So the fix is **one key**. `permissions.ts` is 132 insertions and zero
deletions; PM-03 is untouched; a test pins the row by reading it back
through `canAct`/`canView` so the preset must be re-derived if the grid
ever changes. Both halves — access and denial — were mutation-tested.

## P2-3 — Preflights: run, and they came back clean

**Authorised:** run the documented read-only preflights against the
real database; capture aggregate results and incompatible values
without exposing sensitive records; no DDL, no repair, no migration;
report for review before preparing any production-facing migration.

Done, and recorded in full in
[`docs/preflight-results-2026-10-26.md`](./preflight-results-2026-10-26.md).

The short version: **all four tables are empty in production**, so
there are no orphans, no incompatible `rejection_reason` values, and
nothing for a constraint to abort on. The constraints can be added
without touching data.

Two things in that report are worth carrying forward:

- The result establishes that the migration **cannot fail on existing
  data**. It does **not** establish that the data is clean, because
  there is no data — the logistics feature has never been used in
  production. If those tables are populated before deployment, the
  preflight should be run again.
- **`section_permissions` does not exist in production.** The PM-03
  migrations have not been deployed, so `app_section_access()` is
  reading a table that is not there. Found while establishing context;
  reported rather than acted on, being outside what was authorised.

No migration was written. The results go for review first.

## P2-4 — Environmental monitoring: settle plate and active air as distinct methods

**Authorised:** support both sampling methods as distinct methods in
the facility-log model and the FL-06 workflow; preserve
method-specific measurement metadata and configurable, protocol-based
limits; reuse existing schema and services where appropriate;
**do not assume universal alert thresholds.**

This answers the gap batch 3 reported: FL-06 offers three sub-tabs
("Settle plates", "Surface swabs", "Active air") while `log_type` has
only `environmental_air` and `environmental_surface`, because settle
plates and active air are both *air* methods and only the schedule
description told them apart.

The last clause is again the constraint that matters. Settle plates are
measured in CFU per plate per exposure period; active air in CFU per
cubic metre of sampled air. **They are not the same quantity**, so a
single alert threshold across both would be meaningless — which is
exactly what "do not assume universal alert thresholds" rules out.
Limits stay per schedule, as they already are, and the method carries
its own measurement metadata.

## P2-5 — Regulatory Library: reference corpus, and that is the scope

**Authorised:** retain the current reference-corpus scope for the
pilot; do not introduce company-scoped review states or approvals into
the corpus in this phase; record company-specific controlled review as
a separate future capability if justified.

Settled, and it confirms the conclusion the evidence trace reached: the
page works as a read-only reference library over real statutory text,
and a library of statutes is legitimately static. **Nothing is being
built here, and nothing is being removed.**

Recorded as a separate future capability, if it is ever justified:

> **Company-scoped controlled review of reference material.** Would
> need its own tables (which document, reviewed by whom, when, against
> what), its own rules (what a review *means* and what it permits),
> and a decision about whether a review expires. None of that is drawn
> or specified anywhere today, and it is a records-management
> capability rather than a change to the corpus. It must not be grafted
> onto the corpus: the corpus is shared reference text, and review
> state is company data, so mixing them would put one company's
> workflow inside a shared library.

## P2-6 — Legal Marketplace: deferred, preserved, unchanged

**Authorised:** defer promotion into the initial pilot navigation;
preserve the existing implementation and routes; do not delete it or
change its permissions; record the scope decision and the work
required for a future phase.

Settled. **No code changes.** The page, its route and its permissions
stay exactly as they are, and it keeps its current navigation
destination — it is not promoted, and it is not removed.

The evidence, for the record: HS-02 excludes a "Regulator portal" from
navigation and does not mention a marketplace either way; there is no
Figma frame, no roadmap entry, no backing table and no service;
`LegalMarketplacePage` is 252 lines with no data access of any kind.

What bringing it into a future phase would require, in order:

1. **A scope statement** — what the marketplace lists, who the
   counterparties are, and what a user can actually do in it. Nothing
   else can be specified before this.
2. **A data model** — providers or offerings, and whether engagements
   are tracked. None exists.
3. **An authorisation decision** — whether PM-03 should tabulate it at
   all, or whether it sits outside the operational matrix like the
   administrative pages do.
4. **A commercial decision** — whether money or contracts change hands
   through the product, which carries obligations well beyond
   navigation.
5. **A design** — FL-style screens for whatever 1 to 4 settle on.

Until step 1 exists the rest cannot be estimated, which is why this is
recorded as deferred rather than scheduled.

---

## P2-1 implemented — the action register

### The criteria are a table, which is the whole design

"Define the escalation criteria explicitly rather than inventing
hidden rules" is why `facility_escalation_criteria` is a table and not
a `CASE` expression. A threshold compiled into a trigger is a rule
nobody can list, nobody can show an inspector and nobody can change
without a migration.

Each row is one rule the company has adopted: a `code` they quote, a
`description` in their own words, a `basis` (one of the three the
instruction names), its own values, and `requires_capa`. Every
evaluation returns the rows that fired with the detail of why — so
"why does this need a CAPA?" is answered with the company's own rule,
quoted, and the refusal itself names the criterion:

```
ERROR:  ACTION_NEEDS_CAPA: ESC-SEV
```

**The migration seeds no criteria at all**, and a test asserts that. A
shipped default would be a hidden rule by another route: the company
would be escalating on a threshold somebody else chose.

**No severity scale was invented.** `match_values` is `text[]` and the
migration names no labels. W6·29 draws no severity scale and the
instruction states none, so "1 to 5" or "minor/major/critical" would
be deciding how a company grades its own findings. They enumerate
their own labels; a test asserts the migration mentions none.

### The three closure gates

A finding marked as needing action may be closed only when:

1. an action exists in the register for it;
2. that action is **completed and carries closure evidence**;
3. if any matching criterion requires a CAPA, the action **links to
   one**.

(2) is the instruction's "required action and closure evidence", and
the register's own CHECK ties evidence to the completed status, so an
action cannot be completed without it. (3) is the escalation half.
Mutation-tested: disabling the escalation gate fails D5 and D6.

A **Minor** finding closes with an action and evidence and **no CAPA**,
because no matching criterion requires one. The rule escalates where
the criteria say so and not everywhere — which is what "link OR
escalate … when the criteria require it" means.

### Two defects the tests found in this batch's own work

**The integrity trigger re-validated the source on every UPDATE.**
Deleting a profile sets `completed_by` to NULL through its foreign
key, which fired the trigger, which then failed because the source
finding had been deleted earlier in the same cascade. That is not a
test artefact: in production the same shape would make removing a user
fail whenever one of their completed actions pointed at a source that
had since gone. The source is now validated only when it is written,
which is the only time it can become wrong.

**`ON DELETE SET NULL` was the wrong rule** on the finding's link to
its action. It let an action be deleted out from under a *closed*
finding, silently stripping the evidence it was closed on — and then
the closure invariant refused the cascade anyway, with an error from
two tables away. It is `ON DELETE RESTRICT` now, which states the real
rule: the completed action **is** the closure evidence, so it cannot be
removed while the finding relies on it.

### What was not widened

> **Observation, not a change.** `capa_records.source` is constrained
> to six values — `audit_finding`, `compliance_failure`, `near_miss`,
> `customer_complaint`, `regulatory_action`, `internal_review` — and
> **none of them names facility or pest monitoring.** So escalating a
> pest finding means classifying it as one of the six;
> `internal_review` is the closest honest fit, since the finding came
> from the company's own contracted inspection.
>
> A seventh value was **not** added. That vocabulary governs a
> regulated record, and widening it so a link reads better would be a
> quality decision taken in a migration. **If the owner wants a
> facility source on CAPA records, that is a decision to take
> deliberately.**

Two superseded assertions were updated rather than deleted, both of
which had been written to flip when this day came:

- `facility_pest_control_test.sql` A5 said `corrective_task_id` had no
  foreign key "because no task register exists", and added that it
  "should be revisited" if one were added. It now pins the reference
  **and** the RESTRICT delete rule.
- Its C5a stood a random uuid in that column; it now raises and
  completes a real action, which is the point of the change.

---

## P2-4 implemented — settle plates and active air as distinct methods

### The two are not the same measurement

Both report a colony count and both are "air", which is exactly why
the previous model merged them. A settle plate counts colonies that
land on an exposed plate over a stated exposure — 1 CFU per plate per
4 h. An active-air sampler counts colonies recovered from a stated
volume drawn through it — 5 CFU per m³. The numbers share a unit name
and nothing else: not the denominator, not the limit, not the
sampling event they belong to.

So a count alone is not a result. "3 CFU" means nothing until it is
"3 per plate over four hours" or "3 per cubic metre", and the same
figure of 3 is a breach on the first reading and comfortable on the
second.

### What the model now carries

`facility_zone_schedules` gained `sample_method` and the protocol
columns that give the count its denominator — `protocol_positions`,
`protocol_exposure_minutes`, `protocol_volume_litres` — with a CHECK
that matches each method to the shape it can have: a settle plate may
state an exposure and no volume, an active-air sample a volume and no
exposure, a swab neither. `facility_log_entries` inherits the method
and its protocol from the schedule the reading was taken under, so a
recorded result carries the terms it was measured on.

**No universal threshold was introduced**, which the instruction
forbids and which is also the point: the limits already live on the
schedule, per method, and a zone monitored by two methods carries two
schedules with two sets of limits. `facility_log_trend` was widened
with an optional `p_sample_method` and now returns the method and its
protocol per series. Sections E and F of
`supabase/tests/environmental_sample_methods_test.sql` hold the case
this exists for: one Grade A room, both air methods, and each chart
carrying its own limits — neither borrowed, and no average of the two.

### FL-06

The screen's log-type selector became three method tabs — settle
plates, surface swabs, active air — because log type cannot separate
the two air methods. Each chart captions its denominator next to the
zone name ("· 4 h exposure", "· 1 m³ sampled"); a swab shows none,
because a swab has no denominator to state.

### A defect this found in the batch's own work

`groupTrend` keyed its series on `zone_id` alone. With a method
filter applied that is invisible — one method comes back, one series
per zone. But an unfiltered call returns **both** air methods for the
same zone, and the two row sets were being merged into one series: a
plate reading of 3 against an action limit of 2 would have been
plotted on an axis carrying the active-air limits of 5 and 10, and
drawn as comfortable. A breach would have been displayed as a
passing reading.

The key is now the zone and the method. The unit test that caught it
is kept as the regression: one zone, both methods, same figure, and
the two series must come back with different verdicts.

### Still open for the owner

A limit named against an external specification document (for
example "Per WHO drinking-water list") is still not representable;
limits are numbers on the schedule. Raised with the water work and
unchanged here.
