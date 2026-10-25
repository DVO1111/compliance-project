# Navigation audit — every item under **More**

Read-only reconciliation of the sidebar's collapsed **More** group against the approved
Criateur Compliance Figma file ([`wSj81KWfoy7rS8u9CDcqtY`](https://figma.com/design/wSj81KWfoy7rS8u9CDcqtY)) and the current implementation.

**Nothing in the application was changed to produce this report.** No code, label, route,
access rule, permission or Figma design was modified, and the More fallback is untouched.

> Scope note: this audit covers the **80 items that can render under More**. It is not a
> full navigation audit — the 21 items the rail already places and the 8 routes with no
> sidebar entry are listed in §6 for completeness but were not classified.

---

## 1. How an item ends up under More

`MainLayout.tsx` builds one flat list of sidebar items, runs every `hidden` test, then
**re-groups** the survivors against `DB01_NAV`:

```ts
const regrouped = navItems.map((item) => {
  const placed = DB01_NAV[item.id];
  return placed
    ? { ...item, category: placed.group, label: placed.label ?? item.label, order: placed.order }
    : { ...item, category: item.category === 'Hidden' ? 'Hidden' : 'More', order: 99 };
});
```
`src/components/Layout/MainLayout.tsx:669-676`

So **More is a fallback, not a category**: any item absent from `DB01_NAV` lands there, and
`DEFAULT_COLLAPSED = ['More']` (`:413`) means it starts closed. The authored `category` on
each item is discarded at this point — it survives only as provenance, which is why the
table below reports both.

| | Count |
|---|---|
| Sidebar item definitions in `MainLayout.tsx` | **102** |
| Placed into a DB-01 group by `DB01_NAV` | 21 |
| `category: 'Hidden'` (never rendered) | 1 — `correction-editor` |
| **Falls through to More** | **80** |
| `PAGE_IDS` with no sidebar item at all | 8 — `profile`, `notifications`, and 6 `*-detail` routes |

### Role gating, precisely

Two independent gates apply, and for More items they are lopsided:

- **PM-03** applies only where `PAGE_SECTION[id]` exists. It has 13 entries, 12 of which are
  already placed in the rail — so **exactly one** More item is PM-03 governed:
  `capa-management` (section `deviation_capa`).
- For the other **79**, `canOpenPage` returns `true` for an unmapped page
  (`roleAccess.ts:216`), so the only effective gate is the legacy `hidden: !perms.*` test.
  The per-item expression is in the table.

That asymmetry matters for disposition: moving a non-PM-03 item into the rail changes
*where it appears*, not *who may open it*.

---

## 2. The design's own answer

The file already contains two boards that decide this question, and they are the primary
evidence throughout this audit:

- **HS-02 · "One navigation rail: what is live, what is gone, how excluded modules are mentioned"** — [`455:427`](https://figma.com/design/wSj81KWfoy7rS8u9CDcqtY?node-id=455-427)
- **HS-01 · "Dead-end register: every control that does nothing or goes nowhere"** — [`454:427`](https://figma.com/design/wSj81KWfoy7rS8u9CDcqtY?node-id=454-427), 35 numbered rows each carrying a decision (BUILD / REMOVE / LABEL / FIXED / KEEP)
- **CF-01 · "Configuration audit"** — [`441:422`](https://figma.com/design/wSj81KWfoy7rS8u9CDcqtY?node-id=441-422), 15 configuration areas and where each lives

Three findings from them frame everything below.

**(a) HS-02 supersedes DB-01 as the navigation authority.** HS-01 row 1 reads: *"Navigation
rail has four versions … An engineer builds whichever rail they last saw → **BUILD**: One
rail for every page and role (HS-02). A role hides items it can't open. It never renames or
adds items."* The implementation deliberately follows **DB-01** (`MainLayout.tsx:347-354`),
which HS-01 names as one of the four rails to be replaced. This is the single most
consequential finding in this audit and it is a decision for the lead, not a code change.

**(b) The approved rail is 14 items.** HS-02 draws it: Dashboard, My tasks · Materials,
Batch Records, Batch Release, Genealogy trace, Deviation / CAPA, Change Control, SOP
Library, Training, GMP Inspection, Facility logs · Products, Registrations & Licences ·
plus Settings and Log Out. Four of those 14 — **Change Control, SOP Library, Training,
GMP Inspection** — are currently under collapsed More.

**(c) HS-02 carries an explicit "Where each old name goes" table**, which is why several
items below are DESIGNED_ELSEWHERE rather than NOT_DESIGNED: the design did not forget
them, it relocated them into Settings (CF-02) or into tabs.

---

## 3. Inventory — one row per item

`Gate` is the item's `hidden` expression verbatim. `Src` is the line in
`src/components/Layout/MainLayout.tsx`. Every item's effective category is **More**;
`Authored as` is the category it carries before re-grouping.

### DESIGNED_ELSEWHERE — a matching approved design exists — 13 items

#### `capa-management` — CAPA

| | |
|---|---|
| Route / page id | `capa-management` |
| Label on screen | CAPA |
| Authored as | Quality Operations |
| Src | `MainLayout.tsx:549` |
| Gate | `!perms.canViewCapaManagement || !usesManufacturingQuality` |
| PM-03 | **governed** — section `deviation_capa` |
| Figma | DV-01 `327:425`, DV-13 `334:2336` |
| Evidence | The design has **one** combined register, DV-01 "Deviation / CAPA register", and raises CAPAs from a deviation (DV-13). HS-02 lists a single **Deviation / CAPA** rail item. No standalone CAPA register is drawn anywhere in the file, and HS-02 notes "CAPA has no 'effectiveness' tab". MainLayout already comments "ONE entry in the design. CAPA keeps its own page under More." This is the only More item PM-03 governs (`PAGE_SECTION[capa-management] = deviation_capa`). |
| Disposition | Fold into the existing Deviation / CAPA entry rather than adding a second rail item. Do not delete the page — decide whether it becomes a tab or a filter. |

#### `change-control` — Change Control

| | |
|---|---|
| Route / page id | `change-control` |
| Label on screen | Change Control |
| Authored as | Quality Operations |
| Src | `MainLayout.tsx:550` |
| Gate | `!usesManufacturingQuality` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | SR-01…SR-07 `479:71149`–`479:71868`, HS-01 row 5 |
| Evidence | HS-01 row 5: "Change Control — Record designed (SR-01 to SR-07); register not redesigned → **BUILD**. Carry over the old register (MFG-03) with state chips. Variations and regulatory-impact depth are not in this release." HS-02 lists **Change Control** in the one rail. ONB-04 enables "Changes". |
| Disposition | Promote to rail. Record designed; register is a carry-over. |

#### `company-departments` — Departments

| | |
|---|---|
| Route / page id | `company-departments` |
| Label on screen | Departments |
| Authored as | Administration |
| Src | `MainLayout.tsx:641` |
| Gate | `!perms.canInvite` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | ONB-03 `27:687`, CF-02 `442:422` |
| Evidence | CF-01: "departments drive document numbering, so a wrong department gives wrong numbers"; designed at ONB-03, afterwards Settings › Company & sites. |
| Disposition | Section inside Settings (CF-02). |

#### `company-invites` — Invites

| | |
|---|---|
| Route / page id | `company-invites` |
| Label on screen | Invites |
| Authored as | Administration |
| Src | `MainLayout.tsx:640` |
| Gate | `!perms.canInvite` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | ONB-05 `28:989`, PM-01 `81:885` |
| Evidence | CF-01 same area as members. ONB-05 designs the invite table; PM-01 is the admin access-request inbox. |
| Disposition | Section inside Settings (CF-02). |

#### `company-members` — Members

| | |
|---|---|
| Route / page id | `company-members` |
| Label on screen | Members |
| Authored as | Administration |
| Src | `MainLayout.tsx:639` |
| Gate | `!perms.canViewMembers` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | PM-04 `86:1180`, ONB-05 `28:989` |
| Evidence | CF-01 area "People and invitations → ONB-05 invite; PM-04 person access (W2-0)". HS-02 "Where each old name goes": "Roles & permissions, People, Sites … → Settings (CF-02)". |
| Disposition | Section inside Settings (CF-02). |

#### `company-settings` — Company Settings

| | |
|---|---|
| Route / page id | `company-settings` |
| Label on screen | Company Settings |
| Authored as | Administration |
| Src | `MainLayout.tsx:638` |
| Gate | `!perms.canManageRoles` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | CF-02 `442:422`, CF-01 `441:422`, ONB-01 `26:548` |
| Evidence | CF-01 area "Company, sites and departments → Onboarding ONB-01 to ONB-03 (W1·14); afterwards Settings › Company & sites". CF-01 header: "Every area is now reachable from one Settings home (CF-02)". |
| Disposition | Becomes Settings (CF-02), one rail item, not a More entry. |

#### `ctd-dossier` — CTD Dossier Tracker

| | |
|---|---|
| Route / page id | `ctd-dossier` |
| Label on screen | CTD Dossier Tracker |
| Authored as | Regulatory |
| Src | `MainLayout.tsx:593` |
| Gate | `isLogisticsProfile` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | RA-04 `57:1097` |
| Evidence | RA-04 "CTD dossier with screening query" is designed in full, desktop and phone. HS-01 row 13 places it as a tab. |
| Disposition | Tab inside Registrations & Licences. |

#### `gmp-inspection` — GMP Inspection

| | |
|---|---|
| Route / page id | `gmp-inspection` |
| Label on screen | GMP Inspection |
| Authored as | Quality Operations |
| Src | `MainLayout.tsx:553` |
| Gate | `isLogisticsProfile || !usesManufacturingQuality` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | HS-01 row 7 `454:427` |
| Evidence | HS-01 row 7: "GMP Inspection — Rail; Facility logs sits under it. Old readiness checklist (MFG-06), not redesigned → **BUILD**. Carry over MFG-06 as is: 53 items in 9 areas." HS-02 lists **GMP Inspection** in the one rail. ONB-04 enables "Inspections". |
| Disposition | Promote to rail. Carry-over spec is explicit. |

#### `regulatory-affairs` — Regulatory Affairs

| | |
|---|---|
| Route / page id | `regulatory-affairs` |
| Label on screen | Regulatory Affairs |
| Authored as | Regulatory |
| Src | `MainLayout.tsx:591` |
| Gate | `isLogisticsProfile` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | RA-01 `58:1405`, RA-02 `54:341`, RA-03 `56:738`, RA-05 `58:1830` |
| Evidence | W2·10 designs the applications list and submission flow. HS-02: "Applications, CTD Dossiers, Licence Vault → Registrations & Licences (tabs)". HS-01 row 13 → **BUILD** "Three tabs inside Registrations & Licences. No separate rail items." |
| Disposition | Becomes a tab inside Registrations & Licences, not a More entry. |

#### `role-management` — Role Management

| | |
|---|---|
| Route / page id | `role-management` |
| Label on screen | Role Management |
| Authored as | Administration |
| Src | `MainLayout.tsx:642` |
| Gate | `!perms.canManageRoles` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | PM-03 `84:1077`, PM-01 `81:885`, PM-02 `83:970`, PM-04 `86:1180` |
| Evidence | CF-01 area "Roles and permissions → PM-03 role matrix (W2-0)", found via "Settings home › Roles & permissions", with one recorded fix: the matrix note shows the internal name "canViewAuditTrail" and should read "Audit trail (read only)". ONB-05 refers users to "Role Management". |
| Disposition | Section inside Settings (CF-02). Carry the CF-01 wording fix. |

#### `son-compliance` — SON Compliance

| | |
|---|---|
| Route / page id | `son-compliance` |
| Label on screen | SON Compliance |
| Authored as | Regulatory |
| Src | `MainLayout.tsx:592` |
| Gate | `isLogisticsProfile` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | LV-01 `60:341`, RG-05 `432:1098`, CF-06 `444:831` |
| Evidence | SON appears throughout the approved designs as a **certificate type inside the vault**, never as a page: "SON MANCAP certificate renewal" on the dashboard task list (`479:2467`), "SON MANCAP certificate" in CF-06/CF-07 licence types (`479:30982`), and the CA-01 design note "Tabs, tiles and empty-state language follow the existing **SON certificates tab (REG-04c: Active · Expiring · Expired)**" (`479:50420`). CF-01 area "Licence types" → CF-06 sets a type's renewal tasks and what its expiry blocks. |
| Disposition | Fold into Registrations & Licences / Licence Vault as a certificate type, with its renewal rules in CF-06. Not a separate rail item. |

#### `sop-library` — SOP Library

| | |
|---|---|
| Route / page id | `sop-library` |
| Label on screen | SOP Library |
| Authored as | Quality Operations |
| Src | `MainLayout.tsx:551` |
| Gate | `!usesManufacturingQuality` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | HS-01 row 6 `454:427`, TN-02 `396:796` |
| Evidence | HS-01 row 6: "SOP Library — Document reader designed; library list not redesigned → **BUILD**. Carry over the old list (MFG-04): number, title, version, effective date, and how many people still need to acknowledge it." HS-02 lists **SOP Library** in the one rail. |
| Disposition | Promote to rail. Register needs the MFG-04 carry-over spec; reader is designed. |

#### `training-log` — Training Records

| | |
|---|---|
| Route / page id | `training-log` |
| Label on screen | Training Records |
| Authored as | *(dynamic: `usesManufacturingQuality ? 'Quality Operations' : 'Administration'`)* |
| Src | `MainLayout.tsx:557` |
| Gate | `!perms.canViewTraining` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | TN-09 `399:1195`, TN-10 `399:1562`, TN-12 `401:1566`, TN-13 `401:1995`, TN-14 `402:1767` |
| Evidence | W6·28 designs the register, person view and three reports. HS-02 lists **Training** as one of the 14 one-rail items ("Training and Facility logs added for every page"). ONB-04 enables SOPs/training as one of the 8 default areas. |
| Disposition | Promote to rail (Manufacturing & Quality). Confirmed match. |

### LEGACY_OR_EXTRA — the design records an explicit removal or exclusion decision — 5 items

#### `compliance-reporting` — Compliance Report

| | |
|---|---|
| Route / page id | `compliance-reporting` |
| Label on screen | Compliance Report |
| Authored as | Home |
| Src | `MainLayout.tsx:513` |
| Gate | `!perms.canViewComplianceReporting` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | HS-01 row 11 `454:427` |
| Evidence | HS-01 row 11: "Reports — DB-01 administrator rail. No page → **REMOVE**. Reports live where the data is: training reports TN-12 to TN-14, trace export TR-09." |
| Disposition | Remove from navigation; surface reporting where the data lives. Confirm this page is the "Reports" item row 11 means. |

#### `enterprise-dashboard` — Group Overview

| | |
|---|---|
| Route / page id | `enterprise-dashboard` |
| Label on screen | Group Overview |
| Authored as | Home |
| Src | `MainLayout.tsx:515` |
| Gate | `!profile?.organization_id || !perms.canViewComplianceReporting` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | HS-02 `455:427` |
| Evidence | HS-02 "Excluded from the MVP: never in navigation" lists "Group-level roll-up — Not mentioned". "Group Overview" is a cross-site roll-up. |
| Disposition | Out of pilot navigation per the exclusion list. Confirm the item maps to "group-level roll-up". |

#### `obligations` — Obligations

| | |
|---|---|
| Route / page id | `obligations` |
| Label on screen | Obligations |
| Authored as | Controls & Frameworks |
| Src | `MainLayout.tsx:575` |
| Gate | `!perms.canViewObligations` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | HS-01 row 8 `454:427`, HS-02 `455:427` |
| Evidence | HS-01 row 8: "Governance: Obligations, Risk Register, Policies — ONB-08 rail only. Old GOV-07, GOV-08 and GOV-01 **work**, but are not in the W1–W6 designs or the walkthrough → **REMOVE**. Leave them off the pilot rail unless item 25 walks them in the demonstration company with no breaks. **Decision for the lead.**" HS-02 repeats: "Removed for the pilot unless item 25 clears them". |
| Disposition | Off the pilot rail pending the lead's item-25 decision. The design explicitly records the page works — do not delete. |

#### `policies` — Policies

| | |
|---|---|
| Route / page id | `policies` |
| Label on screen | Policies |
| Authored as | Policies |
| Src | `MainLayout.tsx:600` |
| Gate | `!perms.canViewPolicies` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | HS-01 row 8 `454:427`, HS-02 `455:427` |
| Evidence | HS-01 row 8: "Governance: Obligations, Risk Register, Policies — ONB-08 rail only. Old GOV-07, GOV-08 and GOV-01 **work**, but are not in the W1–W6 designs or the walkthrough → **REMOVE**. Leave them off the pilot rail unless item 25 walks them in the demonstration company with no breaks. **Decision for the lead.**" HS-02 repeats: "Removed for the pilot unless item 25 clears them". |
| Disposition | Off the pilot rail pending the lead's item-25 decision. The design explicitly records the page works — do not delete. |

#### `risk-register` — Risk Register

| | |
|---|---|
| Route / page id | `risk-register` |
| Label on screen | Risk Register |
| Authored as | Risk |
| Src | `MainLayout.tsx:578` |
| Gate | `!perms.canViewRiskRegister` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | HS-01 row 8 `454:427`, HS-02 `455:427` |
| Evidence | HS-01 row 8: "Governance: Obligations, Risk Register, Policies — ONB-08 rail only. Old GOV-07, GOV-08 and GOV-01 **work**, but are not in the W1–W6 designs or the walkthrough → **REMOVE**. Leave them off the pilot rail unless item 25 walks them in the demonstration company with no breaks. **Decision for the lead.**" HS-02 repeats: "Removed for the pilot unless item 25 clears them". |
| Disposition | Off the pilot rail pending the lead's item-25 decision. The design explicitly records the page works — do not delete. |

### UNCERTAIN — evidence is insufficient to decide — 3 items

#### `cn-declarations` — CN22/CN23 Declarations

| | |
|---|---|
| Route / page id | `cn-declarations` |
| Label on screen | CN22/CN23 Declarations |
| Authored as | Logistics Operations |
| Src | `MainLayout.tsx:563` |
| Gate | `!isLogisticsProfile` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | ONB-04 design notes `28:976` |
| Evidence | ONB-04 design note: "A pharmaceutical manufacturer never sees logistics or customs modules: they are **not offered at all** (J9.1)." So the audited file deliberately scopes these out rather than judging them. They are industry-gated in code (`isLogisticsProfile`), and this file designs only the pharmaceutical product — so it is not evidence either way about a logistics workspace. |
| Disposition | Product-owner decision: is a logistics workspace in pilot scope? If not, they stay gated off; if yes, they need their own designs. Not legacy. |

#### `contraband-rejection` — Contraband Rejection

| | |
|---|---|
| Route / page id | `contraband-rejection` |
| Label on screen | Contraband Rejection |
| Authored as | Logistics Operations |
| Src | `MainLayout.tsx:562` |
| Gate | `!isLogisticsProfile` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | ONB-04 design notes `28:976` |
| Evidence | ONB-04 design note: "A pharmaceutical manufacturer never sees logistics or customs modules: they are **not offered at all** (J9.1)." So the audited file deliberately scopes these out rather than judging them. They are industry-gated in code (`isLogisticsProfile`), and this file designs only the pharmaceutical product — so it is not evidence either way about a logistics workspace. |
| Disposition | Product-owner decision: is a logistics workspace in pilot scope? If not, they stay gated off; if yes, they need their own designs. Not legacy. |

#### `shipment-event-log` — Shipment Event Log

| | |
|---|---|
| Route / page id | `shipment-event-log` |
| Label on screen | Shipment Event Log |
| Authored as | Logistics Operations |
| Src | `MainLayout.tsx:561` |
| Gate | `!isLogisticsProfile` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | ONB-04 design notes `28:976` |
| Evidence | ONB-04 design note: "A pharmaceutical manufacturer never sees logistics or customs modules: they are **not offered at all** (J9.1)." So the audited file deliberately scopes these out rather than judging them. They are industry-gated in code (`isLogisticsProfile`), and this file designs only the pharmaceutical product — so it is not evidence either way about a logistics workspace. |
| Disposition | Product-owner decision: is a logistics workspace in pilot scope? If not, they stay gated off; if yes, they need their own designs. Not legacy. |

### NOT_DESIGNED — searched, no matching design found — 59 items

#### `agency-portal` — Agency Portal

| | |
|---|---|
| Route / page id | `agency-portal` |
| Label on screen | Agency Portal |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:622` |
| Gate | `!perms.canViewAgencyPortal` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `ai-assets` — AI Systems Register

| | |
|---|---|
| Route / page id | `ai-assets` |
| Label on screen | AI Systems Register |
| Authored as | AI Governance |
| Src | `MainLayout.tsx:630` |
| Gate | `!perms.canViewAIGovernance` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `ai-dashboard` — AI Dashboard

| | |
|---|---|
| Route / page id | `ai-dashboard` |
| Label on screen | AI Dashboard |
| Authored as | AI Governance |
| Src | `MainLayout.tsx:629` |
| Gate | `!perms.canViewAIDashboard` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `ai-incidents` — AI Incidents

| | |
|---|---|
| Route / page id | `ai-incidents` |
| Label on screen | AI Incidents |
| Authored as | AI Governance |
| Src | `MainLayout.tsx:634` |
| Gate | `!perms.canViewAIIncidents` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `ai-insights` — AI Insights

| | |
|---|---|
| Route / page id | `ai-insights` |
| Label on screen | AI Insights |
| Authored as | Home |
| Src | `MainLayout.tsx:514` |
| Gate | ungated |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. No AI surface exists anywhere in the file. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `ai-prompts` — AI Prompts

| | |
|---|---|
| Route / page id | `ai-prompts` |
| Label on screen | AI Prompts |
| Authored as | AI Governance |
| Src | `MainLayout.tsx:633` |
| Gate | `!perms.canViewAIPrompts` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `ai-reviews` — AI Reviews

| | |
|---|---|
| Route / page id | `ai-reviews` |
| Label on screen | AI Reviews |
| Authored as | AI Governance |
| Src | `MainLayout.tsx:632` |
| Gate | `!perms.canViewAIReviews` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `ai-usage` — AI Usage

| | |
|---|---|
| Route / page id | `ai-usage` |
| Label on screen | AI Usage |
| Authored as | AI Governance |
| Src | `MainLayout.tsx:631` |
| Gate | `!perms.canViewAIUsage` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `archive` — Content Archive

| | |
|---|---|
| Route / page id | `archive` |
| Label on screen | Content Archive |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:616` |
| Gate | `!perms.canViewArchive` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `audit-prep` — AI Audit Prep

| | |
|---|---|
| Route / page id | `audit-prep` |
| Label on screen | AI Audit Prep |
| Authored as | Audit & Evidence |
| Src | `MainLayout.tsx:607` |
| Gate | `!perms.canViewAuditPrep` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Not referenced in HS-01/HS-02. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `audit-sessions` — Audit Workspace

| | |
|---|---|
| Route / page id | `audit-sessions` |
| Label on screen | Audit Workspace |
| Authored as | Audit & Evidence |
| Src | `MainLayout.tsx:606` |
| Gate | `!perms.canViewAuditWorkspace` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No AU/audit-workspace screen in any page. HS-01 row 12 designs an **audit trail** (read-only list), which is a different thing and is already placed in the rail. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `billing` — Billing & Plan

| | |
|---|---|
| Route / page id | `billing` |
| Label on screen | Billing & Plan |
| Authored as | Administration |
| Src | `MainLayout.tsx:637` |
| Gate | `!perms.canViewBilling` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. CF-01 audits 15 configuration areas and billing is not among them. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `channel-rules` — Channel Rules

| | |
|---|---|
| Route / page id | `channel-rules` |
| Label on screen | Channel Rules |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:619` |
| Gate | `!perms.canViewChannelRules` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `claim-extraction` — Claim NLP

| | |
|---|---|
| Route / page id | `claim-extraction` |
| Label on screen | Claim NLP |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:620` |
| Gate | `!perms.canViewClaimExtraction` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `command-center` — Command Center

| | |
|---|---|
| Route / page id | `command-center` |
| Label on screen | Command Center |
| Authored as | Home |
| Src | `MainLayout.tsx:512` |
| Gate | `!perms.canViewGrcDashboard` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. DB-01/DB-02 are the designed dashboards and are already in the rail. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `compliance-alerting` — Compliance Alerts

| | |
|---|---|
| Route / page id | `compliance-alerting` |
| Label on screen | Compliance Alerts |
| Authored as | Risk |
| Src | `MainLayout.tsx:580` |
| Gate | `!perms.canViewComplianceAlerts` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | CF-01 area "Alerts and escalation → Set per area (FL-02 block, licence alerts fixed at 12/6/3) … Designed in place · listed on CF-02" — alerting is designed **inside each area**, not as a page. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `consent-management` — Consent Mgmt

| | |
|---|---|
| Route / page id | `consent-management` |
| Label on screen | Consent Mgmt |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:623` |
| Gate | `!perms.canViewConsentManagement` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `content-blocks` — Content Blocks

| | |
|---|---|
| Route / page id | `content-blocks` |
| Label on screen | Content Blocks |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:618` |
| Gate | `!perms.canViewContentBlocks` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `content-calendar` — Content Calendar

| | |
|---|---|
| Route / page id | `content-calendar` |
| Label on screen | Content Calendar |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:617` |
| Gate | `!perms.canUpload` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `control-monitoring` — Control Health

| | |
|---|---|
| Route / page id | `control-monitoring` |
| Label on screen | Control Health |
| Authored as | Controls & Frameworks |
| Src | `MainLayout.tsx:573` |
| Gate | ungated |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `crisis-response` — Crisis Response

| | |
|---|---|
| Route / page id | `crisis-response` |
| Label on screen | Crisis Response |
| Authored as | Risk |
| Src | `MainLayout.tsx:583` |
| Gate | `!perms.canViewCrisisResponse` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. HS-02 excludes Recall and Complaints; crisis response is not mentioned. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `drift-monitor` — Drift Monitor

| | |
|---|---|
| Route / page id | `drift-monitor` |
| Label on screen | Drift Monitor |
| Authored as | Regulatory |
| Src | `MainLayout.tsx:595` |
| Gate | `!perms.canViewDriftMonitor` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | REG-09 cited at `479:61409` |
| Evidence | No screen for it in the approved file. But the FL-01 design note cites it as a live old-product screen whose pattern was reused: "Layout follows the old GMP Inspection page (MFG-06 …) and **the Drift Monitor's red alert banner (REG-09)**." So the feature exists and the designer treated it as working — there is **no removal decision** for it anywhere. |
| Disposition | Needs a product-owner decision. The REG-09 citation is positive evidence it is a working feature, so it must **not** be treated as legacy. |

#### `framework-library` — Framework Library

| | |
|---|---|
| Route / page id | `framework-library` |
| Label on screen | Framework Library |
| Authored as | Controls & Frameworks |
| Src | `MainLayout.tsx:570` |
| Gate | ungated |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `governance-timeline` — Governance Timeline

| | |
|---|---|
| Route / page id | `governance-timeline` |
| Label on screen | Governance Timeline |
| Authored as | Audit & Evidence |
| Src | `MainLayout.tsx:608` |
| Gate | `!perms.canViewGovernanceTimeline` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Governance cluster is row-8 territory but this item is not named there. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `grc-automation` — Automated Testing

| | |
|---|---|
| Route / page id | `grc-automation` |
| Label on screen | Automated Testing |
| Authored as | Controls & Frameworks |
| Src | `MainLayout.tsx:574` |
| Gate | `!perms.canViewGrcAutomation` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `grc-controls` — Controls

| | |
|---|---|
| Route / page id | `grc-controls` |
| Label on screen | Controls |
| Authored as | Controls & Frameworks |
| Src | `MainLayout.tsx:572` |
| Gate | `!perms.canViewGrcControls` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `grc-dashboard` — Control Posture

| | |
|---|---|
| Route / page id | `grc-dashboard` |
| Label on screen | Control Posture |
| Authored as | Controls & Frameworks |
| Src | `MainLayout.tsx:569` |
| Gate | `!perms.canViewGrcDashboard` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. No controls/frameworks surface in the file. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `grc-frameworks` — GRC Frameworks

| | |
|---|---|
| Route / page id | `grc-frameworks` |
| Label on screen | GRC Frameworks |
| Authored as | Controls & Frameworks |
| Src | `MainLayout.tsx:571` |
| Gate | `!perms.canViewGrcFrameworks` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `horizon-scanning` — Horizon Scan

| | |
|---|---|
| Route / page id | `horizon-scanning` |
| Label on screen | Horizon Scan |
| Authored as | Regulatory |
| Src | `MainLayout.tsx:594` |
| Gate | `!perms.canViewHorizonScanning` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen, and no old-product code cited for it anywhere in the file (0 textual hits for "horizon" other than the CSS word "horizontal"). (Searched: all 26 top-level pages and the 238-screen MVP prototype.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `identity-providers` — Single Sign-On

| | |
|---|---|
| Route / page id | `identity-providers` |
| Label on screen | Single Sign-On |
| Authored as | Administration |
| Src | `MainLayout.tsx:650` |
| Gate | `!perms.canViewIdentity` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. CF-01 does not list SSO; HS-01 row 32 removes an "MFA coming soon" banner from the old product. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `integrations` — Integrations

| | |
|---|---|
| Route / page id | `integrations` |
| Label on screen | Integrations |
| Authored as | Administration |
| Src | `MainLayout.tsx:651` |
| Gate | `!perms.canViewIntegrations` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. CF-01 does not list integrations among the 15 areas. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `legal-holds` — Legal Holds

| | |
|---|---|
| Route / page id | `legal-holds` |
| Label on screen | Legal Holds |
| Authored as | Audit & Evidence |
| Src | `MainLayout.tsx:610` |
| Gate | `!perms.canViewLegalHold` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen anywhere in the file. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `legal-marketplace` — Legal Marketplace

| | |
|---|---|
| Route / page id | `legal-marketplace` |
| Label on screen | Legal Marketplace |
| Authored as | External Partners |
| Src | `MainLayout.tsx:661` |
| Gate | `profile?.role === 'legal_partner'` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. HS-02 excludes a "Regulator portal"; a legal marketplace is not mentioned at all. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `legal-partner-dashboard` — Partner Console

| | |
|---|---|
| Route / page id | `legal-partner-dashboard` |
| Label on screen | Partner Console |
| Authored as | External Partners |
| Src | `MainLayout.tsx:662` |
| Gate | `profile?.role !== 'legal_partner'` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Same cluster as legal-marketplace. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `legal-review` — Legal Review

| | |
|---|---|
| Route / page id | `legal-review` |
| Label on screen | Legal Review |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:615` |
| Gate | `!perms.canViewLegalReview` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `my-policies` — My Policies

| | |
|---|---|
| Route / page id | `my-policies` |
| Label on screen | My Policies |
| Authored as | Policies |
| Src | `MainLayout.tsx:601` |
| Gate | `!perms.canViewMyPolicies` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Belongs to the governance cluster HS-01 row 8 removes, but is not named in that row. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `org-management` — Org Management

| | |
|---|---|
| Route / page id | `org-management` |
| Label on screen | Org Management |
| Authored as | Administration |
| Src | `MainLayout.tsx:649` |
| Gate | `!profile?.organization_id || !perms.canManageRoles` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. CF-01 covers company/sites/departments only. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `partner-verification` — Partner Verification

| | |
|---|---|
| Route / page id | `partner-verification` |
| Label on screen | Partner Verification |
| Authored as | Administration |
| Src | `MainLayout.tsx:657` |
| Gate | `!perms.canManageRoles` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. VP-D01/VP-M01 design public **certificate** verification, not partner verification. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `pharma-integrations` — Pharma Integrations

| | |
|---|---|
| Route / page id | `pharma-integrations` |
| Label on screen | Pharma Integrations |
| Authored as | Administration |
| Src | `MainLayout.tsx:652` |
| Gate | `!perms.canViewPharmaIntegrations` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Same as integrations. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `platform-ecosystem` — Partner Ecosystem

| | |
|---|---|
| Route / page id | `platform-ecosystem` |
| Label on screen | Partner Ecosystem |
| Authored as | Administration |
| Src | `MainLayout.tsx:655` |
| Gate | `!perms.canViewEcosystem` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Related to the partner concepts HS-02 excludes, but not named there. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `platform-evidence-ingestions` — Evidence Ingestions

| | |
|---|---|
| Route / page id | `platform-evidence-ingestions` |
| Label on screen | Evidence Ingestions |
| Authored as | Audit & Evidence |
| Src | `MainLayout.tsx:609` |
| Gate | `!perms.canViewEvidenceIngestions` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. TR-09/TR-10 design an evidence **package export**, not an ingestion pipeline. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `platform-jobs` — Platform Jobs

| | |
|---|---|
| Route / page id | `platform-jobs` |
| Label on screen | Platform Jobs |
| Authored as | Administration |
| Src | `MainLayout.tsx:654` |
| Gate | `!perms.canViewPlatformJobs` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Not in CF-01's 15 areas. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `platform-webhooks` — Outbound Webhooks

| | |
|---|---|
| Route / page id | `platform-webhooks` |
| Label on screen | Outbound Webhooks |
| Authored as | Administration |
| Src | `MainLayout.tsx:653` |
| Gate | `!perms.canViewWebhooks` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Not in CF-01's 15 areas. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `policy-assistant` — Policy Assistant

| | |
|---|---|
| Route / page id | `policy-assistant` |
| Label on screen | Policy Assistant |
| Authored as | Policies |
| Src | `MainLayout.tsx:602` |
| Gate | ungated |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Same cluster as my-policies. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `predictive-risk` — Risk Modeling

| | |
|---|---|
| Route / page id | `predictive-risk` |
| Label on screen | Risk Modeling |
| Authored as | Risk |
| Src | `MainLayout.tsx:579` |
| Gate | `!perms.canViewPredictiveRisk` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `programmatic-ad` — Ad Compliance

| | |
|---|---|
| Route / page id | `programmatic-ad` |
| Label on screen | Ad Compliance |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:626` |
| Gate | `!perms.canViewProgrammaticAd` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `regulations` — Regulations Ledger

| | |
|---|---|
| Route / page id | `regulations` |
| Label on screen | Regulations Ledger |
| Authored as | Regulatory |
| Src | `MainLayout.tsx:596` |
| Gate | ungated |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. The approved regulatory surfaces are registrations (RG-01…RG-12), applications (RA-01…RA-05) and the licence vault (LV-01, LV-02); none is a regulations ledger. (Searched: all 26 top-level pages and the 238-screen MVP prototype.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `regulatory-library` — Reg Library

| | |
|---|---|
| Route / page id | `regulatory-library` |
| Label on screen | Reg Library |
| Authored as | Regulatory |
| Src | `MainLayout.tsx:597` |
| Gate | `!perms.canViewRegulatoryLibrary` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen, and no old-product code cited. Distinct from the SOP Library (which is designed and carried over). (Searched: all 26 top-level pages and the 238-screen MVP prototype.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `retention-policies` — Data Retention

| | |
|---|---|
| Route / page id | `retention-policies` |
| Label on screen | Data Retention |
| Authored as | Audit & Evidence |
| Src | `MainLayout.tsx:611` |
| Gate | `!perms.canViewRetention` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen anywhere in the file. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `secret-vault` — Secret Vault

| | |
|---|---|
| Route / page id | `secret-vault` |
| Label on screen | Secret Vault |
| Authored as | Administration |
| Src | `MainLayout.tsx:656` |
| Gate | `!perms.canManageRoles && profile?.role !== 'admin'` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Distinct from LV-01 **Licence** vault, which is designed and already in the rail — a name-only resemblance, not a match. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `social-listening` — Social Listening

| | |
|---|---|
| Route / page id | `social-listening` |
| Label on screen | Social Listening |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:624` |
| Gate | `!perms.canViewSocialListening` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `team-chat` — Team Chat

| | |
|---|---|
| Route / page id | `team-chat` |
| Label on screen | Team Chat |
| Authored as | Home |
| Src | `MainLayout.tsx:516` |
| Gate | ungated |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Collaboration is not designed in this file. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `training-simulation` — Training Sim

| | |
|---|---|
| Route / page id | `training-simulation` |
| Label on screen | Training Sim |
| Authored as | *(dynamic: `usesManufacturingQuality ? 'Quality Operations' : 'Administration'`)* |
| Src | `MainLayout.tsx:558` |
| Gate | `!perms.canViewTrainingSimulation` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | W6·28 designs training **records** — acknowledge, refuse-to-sign, register, person view, reports. Nothing in the file designs a simulation or assessment. Searched all 26 pages plus the 238-screen MVP prototype. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `translation-compliance` — Translation

| | |
|---|---|
| Route / page id | `translation-compliance` |
| Label on screen | Translation |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:621` |
| Gate | `!perms.canViewTranslationCompliance` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `upload` — Upload Content

| | |
|---|---|
| Route / page id | `upload` |
| Label on screen | Upload Content |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:614` |
| Gate | `!perms.canUpload` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Content compliance is absent from the file. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `vendor-scorecard` — Vendor Scorecard

| | |
|---|---|
| Route / page id | `vendor-scorecard` |
| Label on screen | Vendor Scorecard |
| Authored as | Risk |
| Src | `MainLayout.tsx:582` |
| Gate | `!perms.canViewVendorScorecard` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. Same as vendors. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `vendors` — Vendors

| | |
|---|---|
| Route / page id | `vendors` |
| Label on screen | Vendors |
| Authored as | Risk |
| Src | `MainLayout.tsx:581` |
| Gate | `!perms.canViewVendors` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. HS-01 row 9 removes **Suppliers** and keeps the approved-supplier list in Settings › Materials and suppliers; vendors in the GRC sense is not designed. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `website-monitoring` — Web Monitoring

| | |
|---|---|
| Route / page id | `website-monitoring` |
| Label on screen | Web Monitoring |
| Authored as | Content Compliance |
| Src | `MainLayout.tsx:625` |
| Gate | `!perms.canViewWebsiteMonitoring` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

#### `whistleblower` — Internal Reports

| | |
|---|---|
| Route / page id | `whistleblower` |
| Label on screen | Internal Reports |
| Authored as | Risk |
| Src | `MainLayout.tsx:584` |
| Gate | `!perms.canViewWhistleblower` |
| PM-03 | not governed (`canOpenPage` returns true) |
| Figma | — |
| Evidence | No screen anywhere in the file. (Searched: all 26 top-level pages listed, and the 238-screen MVP prototype — full journey.) |
| Disposition | Needs a new design, or a product-owner decision that it is out of pilot scope. **Absence of a design is not authorisation to remove it.** |

---

## 4. Summary

| Classification | Count |
|---|---|
| DESIGNED_ELSEWHERE | **13** |
| LEGACY_OR_EXTRA | **5** |
| UNCERTAIN | **3** |
| NOT_DESIGNED | **59** |
| **Total audited** | **80** |

### 4a. Proposed navigation moves — confirmed design matches

These four are named items in HS-02's 14-item rail and are currently under collapsed More.
Each has a design and an explicit engineering decision in HS-01:

| Item | Rail group (HS-02) | HS-01 | Design state |
|---|---|---|---|
| `change-control` | Manufacturing & Quality | row 5 BUILD | record designed SR-01…SR-07; register is a carry-over of MFG-03 |
| `sop-library` | Manufacturing & Quality | row 6 BUILD | reader designed; list is a carry-over of MFG-04 |
| `training-log` | Manufacturing & Quality | — | fully designed, W6·28 (TN-09…TN-14) |
| `gmp-inspection` | Manufacturing & Quality | row 7 BUILD | carry over MFG-06 as is: 53 items in 9 areas |

These nine are designed, but **not** as rail items — the design relocates them, so the move
is *into another screen*, not *up the sidebar*:

| Items | Design destination | Authority |
|---|---|---|
| `company-settings`, `company-members`, `company-invites`, `company-departments`, `role-management` | **Settings (CF-02)** sections | HS-02 "Where each old name goes"; CF-01 areas 1–3 |
| `regulatory-affairs`, `ctd-dossier` | tabs inside **Registrations & Licences** | HS-01 row 13 BUILD: "Three tabs … No separate rail items" |
| `son-compliance` | a certificate **type** in the vault, renewal rules in CF-06 | CF-01 area "Licence types"; CA-01 note citing the SON certificates tab |
| `capa-management` | folded into the single **Deviation / CAPA** entry | HS-02 rail has one combined item; DV-01 / DV-13 |

> None of these moves should be made from this audit alone. (a) above is unresolved: if the
> lead adopts HS-02's one rail, the DB-01 grouping this code implements is replaced
> wholesale and these moves happen as part of that, not as nine separate edits.

### 4b. Features requiring new designs or a product-owner decision

**59 items** have no matching design in the file. They are not one undifferentiated pile —
they cluster, and the clusters tell you what kind of decision each needs:

| Cluster | Items | What the absence probably means |
|---|---|---|
| Content compliance | 13 | an adjacent product line (upload, legal review, archive, calendar, blocks, channel rules, claim NLP, translation, agency portal, consent, social listening, web monitoring, ad compliance). The audited file designs only the pharmaceutical product. |
| Administration / platform | 10 | `billing`, `org-management`, `identity-providers`, `integrations`, `pharma-integrations`, `platform-webhooks`, `platform-jobs`, `platform-ecosystem`, `secret-vault`, `partner-verification`. CF-01 audits 15 configuration areas and none of these is among them. |
| AI governance | 6 | no AI surface exists anywhere in the file. |
| Controls & frameworks | 6 | `grc-dashboard`, `framework-library`, `grc-frameworks`, `grc-controls`, `control-monitoring`, `grc-automation`. |
| Audit & evidence | 6 | `audit-sessions`, `audit-prep`, `governance-timeline`, `platform-evidence-ingestions`, `legal-holds`, `retention-policies`. Note HS-01 row 12 designs an **audit trail**, which is a different thing and is already in the rail. |
| Risk & vendor | 6 | `predictive-risk`, `compliance-alerting`, `vendors`, `vendor-scorecard`, `crisis-response`, `whistleblower`. CF-01 does design alerting, but "in place" inside each area rather than as a page. |
| Regulatory remainder | 4 | `horizon-scanning`, `regulations`, `regulatory-library`, `drift-monitor`. |
| Home / misc | 5 | `command-center`, `ai-insights`, `team-chat`, `my-policies`, `policy-assistant`. |
| Training | 1 | `training-simulation` — W6·28 designs training *records*, not simulation or assessment. |
| External partners | 2 | `legal-marketplace`, `legal-partner-dashboard`. |

**One of these deserves singling out.** `drift-monitor` has no new design, but the FL-01
design note cites it as a working old-product screen whose pattern was reused: *"Layout
follows the old GMP Inspection page (MFG-06 …) and the Drift Monitor's red alert banner
(REG-09)."* That is positive evidence the feature works and the designer knew it — so it is
the clearest case in this audit of **absence of design ≠ legacy**.

### 4c. Possible legacy items requiring explicit confirmation

Five items, and in each case the design records a **positive decision**, not merely a
missing screen. That is the only basis on which anything here is called legacy:

| Items | Decision | Exact wording |
|---|---|---|
| `obligations`, `risk-register`, `policies` | HS-01 row 8 **REMOVE** | *"Old GOV-07, GOV-08 and GOV-01 **work**, but are not in the W1–W6 designs or the walkthrough → REMOVE. Leave them off the pilot rail unless item 25 walks them in the demonstration company with no breaks. **Decision for the lead.**"* |
| `compliance-reporting` | HS-01 row 11 **REMOVE** | *"Reports — No page → REMOVE. Reports live where the data is: training reports TN-12 to TN-14, trace export TR-09."* |
| `enterprise-dashboard` | HS-02 MVP exclusion | listed under *"Excluded from the MVP: never in navigation"* as *"Group-level roll-up — Not mentioned"*. |

Two cautions on this table. Row 8 explicitly says those three pages **work** — "remove" there
means *off the pilot rail*, not *delete the feature*, and it is conditional on item 25.
And the mapping of `compliance-reporting` → row 11 "Reports" and `enterprise-dashboard` →
"group-level roll-up" is my inference from the labels; both need confirming against what
those pages actually do.

### 4d. Items where the evidence is incomplete

| Items | Why UNCERTAIN |
|---|---|
| `shipment-event-log`, `contraband-rejection`, `cn-declarations` | ONB-04's design note says *"A pharmaceutical manufacturer never sees logistics or customs modules: they are **not offered at all** (J9.1)."* So the audited file deliberately scopes them out rather than judging them, and they are industry-gated in code. This file is evidence about the pharmaceutical product only — it says nothing either way about a logistics workspace. |

---

## 5. Confirmed vs assumed

**Confirmed** — read directly from the file or the code:

- the 102 / 21 / 1 / 80 counts, and the 8 routes with no sidebar item (parsed from source);
- that exactly one More item is PM-03 governed (`PAGE_SECTION` has 13 entries, 12 placed);
- HS-01's 35 rows and their decisions, HS-02's 14-item rail, its "Where each old name goes"
  table and its MVP exclusion list, and CF-01's 15 configuration areas — all quoted verbatim;
- that the file has 26 top-level pages, and that the MVP prototype contains 238 named screens
  spanning ONB, DB, PM, CF, MT, MF, BR, LC, DS, CAL, IP, YR, DV, RL, CA, VP, TR, TN, FL, RA,
  LV, PR, BL, RG, SR and HS — and **no** content-compliance, AI, GRC, risk, policy, vendor,
  logistics or platform-administration screen.

**Assumed, and flagged as such:**

- that `compliance-reporting` is the "Reports" of HS-01 row 11, and `enterprise-dashboard`
  the "group-level roll-up" of HS-02 — label-based inferences, not stated in the file;
- that a NOT_DESIGNED item is genuinely undesigned rather than designed in a file outside
  this one. I searched this file exhaustively by page list and by full-text; I cannot rule
  out another file;
- that `son-compliance` as built corresponds to the SON certificate handling the designs
  draw. The design evidence is clear; what the page does was not opened.

**Not done, so not claimed:** no screen was rendered or screenshotted, no page was opened in
a browser, and no item's runtime behaviour was exercised. This audit compares *design*
against *navigation wiring*, not against working screens.

---

## 6. Context — the 21 items the rail already places

Not classified here, but two carry design conflicts worth recording because they are the
mirror image of this audit:

| Item | Placed as | Conflict |
|---|---|---|
| `supplier-qualification` | Materials › "Suppliers" | HS-01 row 9 **REMOVE**: *"Supplier qualification is excluded from the MVP … The approved-supplier list stays in Settings › Materials and suppliers."* HS-02 lists "Supplier qualification and portal" as never in navigation. |
| `dispatch` | Traceability › "Dispatch" | HS-01 row 10 **REMOVE**: *"No dispatch module in the MVP. The storekeeper sees Materials. Release says 'can be dispatched' and stops there."* |
| `audit-trail` | Traceability › "Audit trail" | HS-02 maps it to **Settings › Audit trail** plus "View audit trail" on each record, not a rail item. HS-01 row 12 BUILD. |
| `coa` | Quality › "CoA register" | HS-02 maps it to **Batch Release › Certificates**. |
| `traceability` | Traceability › "Traceability" | HS-02 renames it **Genealogy trace**. |
| `license-vault` | Regulatory › "Licence Vault" | HS-01 row 13: a **tab** inside Registrations & Licences, not a rail item. |

So the rail currently shows two items the design says to remove, and names four others
differently from HS-02. Any decision on More should be taken together with these.

---

## 7. Decisions needed before any implementation

1. **One rail or DB-01?** HS-01 row 1 says build HS-02's single 14-item rail; the code
   implements DB-01's six-group role rail. Everything else depends on this, and it should be
   settled first — adopting HS-02 makes most of §4a moot as separate edits.
2. **Promote the four designed rail items** — `change-control`, `sop-library`, `training-log`,
   `gmp-inspection`. Confirm the three carry-over specs (MFG-03, MFG-04, MFG-06) are
   accepted as the design for their registers.
3. **Settings (CF-02).** Approve folding the five company/role items into one Settings
   destination, including the CF-01 wording fix ("Audit trail (read only)", not
   `canViewAuditTrail`).
4. **Registrations & Licences tabs.** Approve `regulatory-affairs` + `ctd-dossier` +
   `license-vault` becoming three tabs, per HS-01 row 13.
5. **`capa-management`:** tab, filter, or kept page under the single Deviation / CAPA entry?
6. **Item 25 / governance cluster.** HS-01 row 8 defers `obligations`, `risk-register` and
   `policies` to the lead. They work today; confirm whether they stay off the pilot rail.
7. **The 59 undesigned items.** Which clusters are in pilot scope at all? This is a product
   -scope question, not a navigation one, and the answer decides whether they need designs or
   an explicit out-of-scope decision. **None of them is authorised for removal by this audit.**
8. **Logistics (3 items).** Is a logistics workspace in pilot scope?
9. **The two rail items the design removes** — `supplier-qualification` and `dispatch` (§6).

Until these are answered the More fallback stays exactly as it is, which is the safe state:
every page remains reachable and no permission changes.

