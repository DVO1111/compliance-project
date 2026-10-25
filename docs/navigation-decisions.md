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
