# Implementation matrix

**Generated** by `npx tsx scripts/docs/nav-matrix.ts` from
`src/lib/navigation/hs02.ts`. Do not edit by hand — the destination,
scope and authorization columns are read out of the code, so this file
matching the code is a property of how it is produced rather than
something to keep up.

Columns that cannot be derived — services, data model, functional
status, tests — are filled in only for pages a phase has actually
examined. Everything else says _not assessed in this phase_. A matrix
that guesses reads as evidence, which is worse than one with gaps.

## Totals

| Destination kind | Pages |
|---|---|
| `rail` — a top-level entry | 21 |
| `hosted` — inside another entry | 53 |
| `detail` — a record page of its list | 6 |
| `pendingDesign` — in scope, design owed (D3) | 24 |
| `review` — works, needs owner confirmation | 4 |
| `standalone` — reachable outside the rail | 4 |
| **Total** | **112** |

Every page has exactly one destination, enforced by the type
`Record<PageId, Destination>`: a page with none does not compile.
There is no fallback group, and `More` is not a group any more.

## Pages, by the rail group they are reachable under

### Overview — 7 pages

#### `dashboard`

| | |
|---|---|
| Destination | Rail: **Overview › Dashboard** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `enterprise-dashboard`

| | |
|---|---|
| Destination | Rail: Overview › Group Overview (flagged) |
| Pilot scope | **Needs owner confirmation** |
| Design | Existing page; HS-02 lists "Group-level roll-up" under "Excluded from the MVP: never in navigation". The page works; the owner has not overridden this exclusion. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `ai-insights`

| | |
|---|---|
| Destination | Rail: Overview › AI Insights (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No AI surface anywhere in the design file. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `team-chat`

| | |
|---|---|
| Destination | Rail: Overview › Team Chat (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — Collaboration is not designed in the file. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `compliance-reporting`

| | |
|---|---|
| Destination | Rail: Overview › Compliance Report (flagged) |
| Pilot scope | **Needs owner confirmation** |
| Design | Existing page; HS-01 row 11 REMOVE: "Reports live where the data is: training reports TN-12 to TN-14, trace export TR-09." Mapping this page to that row is an inference from its label. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `my-tasks`

| | |
|---|---|
| Destination | Rail: **Overview › My tasks** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `command-center`

| | |
|---|---|
| Destination | Rail: Overview › Command Center (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No screen in the design file. DB-01/DB-02 are the designed dashboards; what this adds over them is undecided. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |


### Manufacturing & Quality — 22 pages

#### `training-log`

| | |
|---|---|
| Destination | Rail: **Manufacturing & Quality › Training** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `capa-management`

| | |
|---|---|
| Destination | Inside **deviations** as “CAPA” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | PM-03 section `deviation_capa`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `deviations`

| | |
|---|---|
| Destination | Rail: **Manufacturing & Quality › Deviation / CAPA** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | PM-03 section `deviation_capa`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `materials`

| | |
|---|---|
| Destination | Rail: **Manufacturing & Quality › Materials** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | PM-03 section `material_lots`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `in-process`

| | |
|---|---|
| Destination | Inside **batch-execution** as “In-process checks” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `instruments`

| | |
|---|---|
| Destination | Rail: Manufacturing & Quality › Instruments (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — CAL-01/CAL-02 design the calibration register and instrument record, but HS-02 gives it no rail entry. Needs a destination decision: rail item, or a section of Batch Records. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `goods-receipt`

| | |
|---|---|
| Destination | Inside **materials** as “Goods receipt” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | PM-03 section `goods_receipt`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `qc-testing`

| | |
|---|---|
| Destination | Inside **materials** as “QC testing” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | PM-03 section `qc_testing`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `qa-disposition`

| | |
|---|---|
| Destination | Inside **materials** as “QA disposition” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | PM-03 section `qa_disposition`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `traceability`

| | |
|---|---|
| Destination | Rail: **Manufacturing & Quality › Genealogy trace** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | PM-03 section `traceability`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `dispatch`

| | |
|---|---|
| Destination | Rail: Manufacturing & Quality › Dispatch (flagged) |
| Pilot scope | **Needs owner confirmation** |
| Design | Existing page; HS-01 row 10 REMOVE: "No dispatch module in the MVP. The storekeeper sees Materials." But PM-03 gives the Storekeeper Act on Distribution and 20261111000000 built the page for it, so removing it would strand a tabulated permission. |
| Authorization | PM-03 section `distribution`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `batch-execution`

| | |
|---|---|
| Destination | Rail: **Manufacturing & Quality › Batch Records** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | PM-03 section `batch_records`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `master-formulas`

| | |
|---|---|
| Destination | Inside **batch-execution** as “Master formulas” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `training-simulation`

| | |
|---|---|
| Destination | Rail: Manufacturing & Quality › Training Sim (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — W6·28 designs training RECORDS — acknowledge, refuse-to-sign, register, reports. Simulation and assessment are not drawn. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `batch-release`

| | |
|---|---|
| Destination | Rail: **Manufacturing & Quality › Batch Release** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | PM-03 section `batch_release`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `change-control`

| | |
|---|---|
| Destination | Rail: **Manufacturing & Quality › Change Control** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `sop-library`

| | |
|---|---|
| Destination | Rail: **Manufacturing & Quality › SOP Library** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `supplier-qualification`

| | |
|---|---|
| Destination | Rail: Manufacturing & Quality › Suppliers (flagged) |
| Pilot scope | **Needs owner confirmation** |
| Design | Existing page; HS-01 row 9 REMOVE: "Supplier qualification is excluded from the MVP … The approved-supplier list stays in Settings › Materials and suppliers." The page works. |
| Authorization | PM-03 section `suppliers`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `gmp-inspection`

| | |
|---|---|
| Destination | Rail: **Manufacturing & Quality › GMP Inspection** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `coa`

| | |
|---|---|
| Destination | Inside **batch-release** as “Certificates” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | PM-03 section `coa_register`, plus the page's own `perms` gate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `product-specifications`

| | |
|---|---|
| Destination | Rail: Manufacturing & Quality › Specifications (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No frame for a specification screen; 20261113000000 made one necessary because a batch cannot be released without an approved specification. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `facility-logs`

| | |
|---|---|
| Destination | Rail: **Manufacturing & Quality › Facility logs** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | `facilityLogService` — listRegister, listZones, listSchedules, listZoneHistory, recordEntry, listSiteOptions, createZone, updateZone, setZoneActive, createSchedule, updateSchedule, setScheduleActive |
| Data model / RLS | `facility_zones`, `facility_zone_schedules`, `facility_log_entries` — RLS enabled, company-isolation policies; all three carry a `company_id` FK to `companies` |
| Functional status | Working, both screens. FL-01 is the register (triage order, tabs, record, per-zone history) and FL-02 sets zones and scheduled tests up. `outcome` is derived by a BEFORE trigger and whatever a caller sends is discarded. |
| Tests | SQL: 31 (`facility_logs_test.sql`) + 33 (`facility_zone_setup_test.sql`) — isolation, the outcome rule, zone/site and schedule/zone agreement in both the RLS and the RLS-bypassing posture. Unit: 33 + 46. |
| Outstanding | FL-06/FL-07 trend charts and FL-13/FL-14 finding-to-task are not built; the latter needs a rule W6·29 does not state. No sign-off or automatic deviation, neither being drawn in the design. |


### Regulatory — 10 pages

#### `regulations`

| | |
|---|---|
| Destination | Rail: Regulatory › Regulations Ledger (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — The designed regulatory surfaces are registrations, applications and the licence vault. None is a regulations ledger. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `license-vault`

| | |
|---|---|
| Destination | Inside **regulatory-affairs** as “Licence Vault” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `drift-monitor`

| | |
|---|---|
| Destination | Rail: Regulatory › Drift Monitor (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No new screen, but FL-01 cites "the Drift Monitor's red alert banner (REG-09)" as a working screen whose pattern it borrowed — so the feature is live and only the new design is missing. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `horizon-scanning`

| | |
|---|---|
| Destination | Rail: Regulatory › Horizon Scan (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No screen in the file. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `regulatory-library`

| | |
|---|---|
| Destination | Rail: Regulatory › Reg Library (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No screen, and no old-product code cited for it. Distinct from the SOP Library. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `products`

| | |
|---|---|
| Destination | Rail: **Regulatory › Products** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `regulatory-affairs`

| | |
|---|---|
| Destination | Rail: **Regulatory › Registrations & Licences** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `son-compliance`

| | |
|---|---|
| Destination | Inside **regulatory-affairs** as “SON Compliance” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `ctd-dossier`

| | |
|---|---|
| Destination | Inside **regulatory-affairs** as “CTD Dossiers” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `compliance-alerting`

| | |
|---|---|
| Destination | Rail: Regulatory › Compliance Alerts (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — CF-01 designs alerting "in place" inside each area (FL-02 blocks, licence alerts at 12/6/3) rather than as a page. Whether a central alert page is wanted is undecided. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |


### Governance — 28 pages

#### `crisis-response`

| | |
|---|---|
| Destination | Rail: Governance › Crisis Response (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No screen. HS-02 excludes Recall and Complaints; crisis response is not mentioned either way. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `whistleblower`

| | |
|---|---|
| Destination | Rail: Governance › Internal Reports (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No screen anywhere in the file. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `predictive-risk`

| | |
|---|---|
| Destination | Inside **risk-register** as “Risk Modeling” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `vendor-scorecard`

| | |
|---|---|
| Destination | Inside **vendors** as “Vendor Scorecard” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `legal-marketplace`

| | |
|---|---|
| Destination | Rail: Governance › Legal Marketplace (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No screen. HS-02 excludes a "Regulator portal"; a legal marketplace is not mentioned at all. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `policy-assistant`

| | |
|---|---|
| Destination | Inside **policies** as “Policy Assistant” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `grc-frameworks`

| | |
|---|---|
| Destination | Inside **grc-dashboard** as “GRC Frameworks” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `grc-controls`

| | |
|---|---|
| Destination | Inside **grc-dashboard** as “Controls” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `grc-automation`

| | |
|---|---|
| Destination | Inside **grc-dashboard** as “Automated Testing” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `grc-dashboard`

| | |
|---|---|
| Destination | Rail: Governance › Control Posture (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No controls/frameworks surface in the file. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `policies`

| | |
|---|---|
| Destination | Rail: **Governance › Policies** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `policy-detail`

| | |
|---|---|
| Destination | Record page of **policies** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `my-policies`

| | |
|---|---|
| Destination | Inside **policies** as “My Policies” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `vendors`

| | |
|---|---|
| Destination | Rail: Governance › Vendors (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No screen. HS-01 row 9 keeps an approved-SUPPLIER list in Settings, which is a narrower thing than vendor management. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `vendor-detail`

| | |
|---|---|
| Destination | Record page of **vendors** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `audit-sessions`

| | |
|---|---|
| Destination | Rail: Governance › Audit Workspace (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No audit-workspace screen. HS-01 row 12 designs an audit TRAIL, which is a different thing and lives in Settings. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `audit-session-detail`

| | |
|---|---|
| Destination | Record page of **audit-sessions** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `risk-register`

| | |
|---|---|
| Destination | Rail: **Governance › Risk Register** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `risk-detail`

| | |
|---|---|
| Destination | Record page of **risk-register** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `obligations`

| | |
|---|---|
| Destination | Rail: **Governance › Obligations** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `obligation-detail`

| | |
|---|---|
| Destination | Record page of **obligations** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `retention-policies`

| | |
|---|---|
| Destination | Rail: Governance › Data Retention (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No screen anywhere in the file. Data retention is likewise outside CF-01's fifteen areas, so the retention rules themselves are undefined as well as undrawn. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `legal-holds`

| | |
|---|---|
| Destination | Rail: Governance › Legal Holds (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No screen anywhere in the file. Legal hold is outside CF-01's fifteen configuration areas, so neither the surface nor the rules it should expose are established. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `governance-timeline`

| | |
|---|---|
| Destination | Rail: Governance › Governance Timeline (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No screen. The designed history surfaces are the audit trail (HS-01 row 12) and per-record history; a cross-cutting governance timeline is not among them. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `platform-evidence-ingestions`

| | |
|---|---|
| Destination | Rail: Governance › Evidence Ingestions (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — TR-09/TR-10 design an evidence PACKAGE EXPORT, not an ingestion pipeline. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `framework-library`

| | |
|---|---|
| Destination | Inside **grc-dashboard** as “Framework Library” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `control-monitoring`

| | |
|---|---|
| Destination | Inside **grc-dashboard** as “Control Health” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `audit-prep`

| | |
|---|---|
| Destination | Rail: Governance › AI Audit Prep (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No screen. Audit preparation is not drawn anywhere in the file; W6·32 designs the dead-end and honest-state patterns, not a preparation workflow. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |


### Logistics — 3 pages

#### `contraband-rejection`

| | |
|---|---|
| Destination | Rail: **Logistics › Contraband Rejection** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | `contrabandService` — listRejections, createRejection, updateRejectionStatus, listCustomerFlags, flagCustomer, clearCustomerFlag, checkSenderFlag |
| Data model / RLS | `contraband_rejection_log`, `customer_flags` — RLS enabled; both carry CHECK constraints on status and type |
| Functional status | Working against real tables. No mock data. |
| Tests | SQL: A/B/C (RLS, cross-tenant, anon). Unit: rejection-reason list shape. |

#### `shipment-event-log`

| | |
|---|---|
| Destination | Rail: **Logistics › Shipment Event Log** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | `shipmentEventService` — listShipments, createShipment, getShipmentEvents, addShipmentEvent |
| Data model / RLS | `shipments`, `shipment_events` — RLS enabled, company-isolation policy |
| Functional status | Working against real tables. No mock data. |
| Tests | SQL: A/B/C/F (RLS, cross-tenant, anon, event_type CHECK). Unit: event-type parity with the DB constraint. |
| Outstanding | `company_id` has no FK to `companies`. The read-only preflight is now written — `scripts/preflight/logistics-company-id.sql` — and has been run on a local build only. It has NOT been run against production, which is what the decision needs. |

#### `cn-declarations`

| | |
|---|---|
| Destination | Rail: **Logistics › CN22/CN23 Declarations** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | `customsDeclarationService` — listDeclarations, createDeclaration, resolveDeclarationFlag |
| Data model / RLS | `cn_declarations` — RLS enabled; flag rule and resolution enforced by `20261203000000` |
| Functional status | Working. Two rules moved out of the browser: the CN22/vague-description flag is now a BEFORE trigger, and clearing a flag is attributable and keeps its reason. |
| Tests | SQL: A/B/C/D/E/G — 49 assertions including "a CN22 over the threshold is flagged even when filed as clean". Unit: 19 tests including TS/SQL constant parity. |
| Outstanding | Same missing `company_id` FK; same preflight, same caveat. |


### Content — 13 pages

#### `upload`

| | |
|---|---|
| Destination | Rail: Content › Upload Content (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — Content compliance is absent from the design file. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `archive`

| | |
|---|---|
| Destination | Inside **upload** as “Content Archive” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `legal-review`

| | |
|---|---|
| Destination | Inside **upload** as “Legal Review” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `content-calendar`

| | |
|---|---|
| Destination | Inside **upload** as “Content Calendar” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `consent-management`

| | |
|---|---|
| Destination | Inside **upload** as “Consent Mgmt” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `content-blocks`

| | |
|---|---|
| Destination | Inside **upload** as “Content Blocks” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `agency-portal`

| | |
|---|---|
| Destination | Inside **upload** as “Agency Portal” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `channel-rules`

| | |
|---|---|
| Destination | Inside **upload** as “Channel Rules” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `translation-compliance`

| | |
|---|---|
| Destination | Inside **upload** as “Translation” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `programmatic-ad`

| | |
|---|---|
| Destination | Inside **upload** as “Ad Compliance” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `social-listening`

| | |
|---|---|
| Destination | Inside **upload** as “Social Listening” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `website-monitoring`

| | |
|---|---|
| Destination | Inside **upload** as “Web Monitoring” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `claim-extraction`

| | |
|---|---|
| Destination | Inside **upload** as “Claim NLP” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |


### AI Governance — 7 pages

#### `ai-assets`

| | |
|---|---|
| Destination | Inside **ai-dashboard** as “AI Systems Register” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `ai-asset-detail`

| | |
|---|---|
| Destination | Record page of **ai-assets** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `ai-usage`

| | |
|---|---|
| Destination | Inside **ai-dashboard** as “AI Usage” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `ai-incidents`

| | |
|---|---|
| Destination | Inside **ai-dashboard** as “AI Incidents” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `ai-reviews`

| | |
|---|---|
| Destination | Inside **ai-dashboard** as “AI Reviews” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `ai-prompts`

| | |
|---|---|
| Destination | Inside **ai-dashboard** as “AI Prompts” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `ai-dashboard`

| | |
|---|---|
| Destination | Rail: AI Governance › AI Dashboard (below the rule) |
| Pilot scope | In pilot (D3) — design owed |
| Design | None — No AI surface anywhere in the design file. |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |


### Settings — 18 pages

#### `company-members`

| | |
|---|---|
| Destination | Inside **settings-home** as “Members” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `company-invites`

| | |
|---|---|
| Destination | Inside **settings-home** as “Invites” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `company-departments`

| | |
|---|---|
| Destination | Inside **settings-home** as “Departments” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `company-settings`

| | |
|---|---|
| Destination | Inside **settings-home** as “Company profile” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `integrations`

| | |
|---|---|
| Destination | Inside **settings-home** as “Integrations” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `audit-trail`

| | |
|---|---|
| Destination | Inside **settings-home** as “Audit trail” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `role-management`

| | |
|---|---|
| Destination | Inside **settings-home** as “Role Management” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `org-management`

| | |
|---|---|
| Destination | Inside **settings-home** as “Org Management” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `access-control`

| | |
|---|---|
| Destination | Inside **settings-home** as “Roles & Access” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `pharma-integrations`

| | |
|---|---|
| Destination | Inside **settings-home** as “Pharma Integrations” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `secret-vault`

| | |
|---|---|
| Destination | Inside **settings-home** as “Secret Vault” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `partner-verification`

| | |
|---|---|
| Destination | Inside **settings-home** as “Partner Verification” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `identity-providers`

| | |
|---|---|
| Destination | Inside **settings-home** as “Single Sign-On” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `platform-jobs`

| | |
|---|---|
| Destination | Inside **settings-home** as “Platform Jobs” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `platform-webhooks`

| | |
|---|---|
| Destination | Inside **settings-home** as “Outbound Webhooks” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `platform-ecosystem`

| | |
|---|---|
| Destination | Inside **settings-home** as “Partner Ecosystem” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `billing`

| | |
|---|---|
| Destination | Inside **settings-home** as “Billing & Plan” |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `settings-home`

| | |
|---|---|
| Destination | Rail: **Settings › Settings** |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |


### Outside the rail — 4 pages

#### `correction-editor`

| | |
|---|---|
| Destination | Not in the rail — Opened from a legal-review finding by id. It was `category: Hidden` before and is still not a rail entry — now by statement rather than by a flag. |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `profile`

| | |
|---|---|
| Destination | Not in the rail — The avatar menu in the top bar. |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `legal-partner-dashboard`

| | |
|---|---|
| Destination | Not in the rail — The external partner console. It is shown only to a `legal_partner` account, which sees this instead of the rail, so it is not a rail entry for anybody else. |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |

#### `notifications`

| | |
|---|---|
| Destination | Not in the rail — Routed, but not in the rail: HS-01 row 3 removes the notifications bell and sends what is due to My tasks and the dashboard. |
| Pilot scope | In pilot |
| Design | Approved design, or placed by HS-02’s own table |
| Authorization | Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate |
| Services | _not assessed in this phase_ |
| Data model / RLS | _not assessed in this phase_ |
| Functional status | _not assessed in this phase_ |
| Tests | _navigation only: covered by `src/tests/hs02Navigation.test.ts`_ |
