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
