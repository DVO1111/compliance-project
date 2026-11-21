/**
 * Generates docs/implementation-matrix.md from the navigation model.
 *
 * GENERATED, NOT MAINTAINED. The acceptance criterion for this work is
 * that "the implementation matrix matches the actual code", and a
 * hand-kept table of 110 rows does not stay matching anything. So the
 * destination, domain and scope columns are read out of
 * `src/lib/navigation/hs02.ts` every time this runs.
 *
 * The columns that cannot be derived — what a page's services and
 * tables are, whether its workflow actually works, what tests cover it
 * — are filled in from VERIFIED below, for the pages a phase has
 * actually examined. Everything else says "not assessed in this phase"
 * rather than guessing, because a matrix that guesses is worse than one
 * with gaps: it reads as evidence.
 *
 *   npx tsx scripts/docs/nav-matrix.ts
 */

import { writeFileSync } from 'node:fs';
import {
  DESTINATIONS, RAIL_GROUPS, railEntryFor,
  type Destination, type RailGroup,
} from '../../src/lib/navigation/hs02';
import { PAGE_IDS, type PageId } from '../../src/components/Layout/MainLayout';
import { PAGE_SECTION } from '../../src/lib/access/roleAccess';

interface Verified {
  services: string;
  data: string;
  status: string;
  tests: string;
  outstanding?: string;
}

/**
 * Pages a phase has actually inspected, with what was found.
 *
 * Phase 1 examined the navigation of every page (that is what the
 * generated columns are) and the Logistics and Customs domain in full.
 * Nothing else is claimed.
 */
const VERIFIED: Partial<Record<PageId, Verified>> = {
  'supplier-qualification': {
    services: '`supplierRegisterService` — listSuppliers, updateQualification, hasLapsed, daysUntilLapse, isUsable, summarise, triage, search',
    data: '`suppliers` — RLS enabled with company-isolation policies on select, insert, update and delete; `qualification_status` constrained by `suppliers_qualification_chk` to five values',
    status: 'The approved-supplier register. Replaced a `ComingSoonPage`: the table, its policies and the PM-03 grants all already existed, so two roles held `act` on a section whose only page was a stub. A lapsed approval is reported as its own fact and does NOT rewrite the standing, because a date passing is not a decision to disqualify.',
    tests: 'Unit: 33, including that a qualified-but-lapsed supplier is not usable while its standing still reads Qualified. Rendered per role: Procurement sees the standing control on every row, Storekeeper (view) and QC Analyst (no cell) see none.',
    outstanding: 'Supplier QUALIFICATION — questionnaires, audits, CMO assessment, scoring — remains excluded from the MVP by HS-01 row 9 and is not built. The page is still `kind: review` pending the owner\'s confirmation.',
  },
  'regulatory-library': {
    services: '`regulatoryLibraryService` — searchLibrary, getJurisdictionStats; no database access',
    data: 'None. `LIBRARY_DATA` is a static corpus of regulatory reference text held in the module.',
    status: 'Working as a read-only reference library: search filters real statutory text by query, jurisdiction and document type. A library of statutes is legitimately static, so this is NOT a mock standing in for a feature. It holds no company-scoped state of any kind.',
    tests: 'None specific to this page.',
    outstanding: 'Whether it should stay a reference corpus or become a company-scoped register with review state is undecided, and no screen is drawn for the latter. An unused `supabase` import was removed.',
  },
  'facility-logs': {
    services: '`facilityLogService` — listRegister, listZones, listSchedules, listZoneHistory, recordEntry, listSiteOptions, createZone, updateZone, setZoneActive, createSchedule, updateSchedule, setScheduleActive, listTrend, groupTrend, summariseTrend, trendToCsv, describeProtocol`; `facilityCleaningService` — listDeepCleanSchedule, listCleaningRecords, recordClean, verifyCleaningRecord, validateCleaningDraft',
    data: '`facility_zones`, `facility_zone_schedules`, `facility_log_entries` — RLS enabled, company-isolation policies; all three carry a `company_id` FK to `companies`. A schedule states its `sample_method` and the protocol the count is read against; an entry inherits both from the schedule it was taken under. A cleaning entry also carries PRD G3.6’s fields — method, chemicals, contact time and line — and the verification pair FL-09 prints, which a trigger makes final once written',
    status: 'Working, five screens. FL-01 is the register (triage order, tabs, record, per-zone history), FL-02 sets zones and scheduled tests up, FL-06/FL-07 are the trends — weekly maxima per zone with both limits drawn as labelled lines, point shapes carrying the meaning so it survives greyscale, and a "Show as table" view of the same numbers — FL-13/FL-14 are pest control with a general auditable action register behind them \u2014 a finding needing action cannot be closed without a completed action carrying closure evidence, and escalates to a formal CAPA where the company\u2019s own stored criteria require it, and FL-10/FL-11 are water treatment, whose limits are judged by their own rule because a pH RANGE expressed as an upper bound would pass a reading far below it. Settle plates and active air are distinct sampling methods, each carrying its own protocol denominator and its own limits from its own schedule, so one zone monitored by both charts as two series and never as an average. FL-09 is the Cleaning tab: the deep cleaning schedule with its overdue alerting, and the recent cleaning records. A deep clean satisfies its schedule only once VERIFIED — which is what makes FL-09’s own two tables agree, since it draws a zone as overdue with an unverified deep clean against it on the same screen. `outcome` is derived by a BEFORE trigger and whatever a caller sends is discarded.',
    tests: 'SQL: 31 + 33 + 24 + 39 + 57 + 45 + 33 + 54 (`facility_logs_test.sql`, `facility_zone_setup_test.sql`, `facility_log_trend_test.sql`, `facility_pest_control_test.sql`, `facility_water_treatment_test.sql`, `facility_action_register_test.sql`, `environmental_sample_methods_test.sql`, `facility_cleaning_test.sql`) — isolation, the outcome rule, zone/site and schedule/zone agreement in both the RLS and RLS-bypassing postures, and the weekly maximum. Unit: 33 + 46 + 44 + 40 + 46 + 41 + 46.',
    outstanding: 'FL-13 is built and the closure rule is enforced — a finding marked as needing action cannot be closed by a note. FL-13/FL-14 are complete: the action register was authorised in Phase 2 and escalation is criteria-driven. Remaining: FL-04 (the breach variant of the recording flow). `capa_records.source` has no facility value, so an escalated finding is classified `internal_review` \u2014 whether a facility source should be added is an open decision. FL-04 (the breach variant of the recording flow) is the one remaining screen of the fourteen. FL-09 states no rule that a verifier must differ from the operator and the product has no supervisor role to bind one to, so none was imposed — an open decision. FL-09’s “due soon” window is constrained by the design to 3–10 days and stated nowhere; seven is a named choice, passed as a parameter rather than hidden. A water limit stated as \'Per WHO drinking-water list\' fits none of the three limit kinds and needs a product decision. Export is a CSV of the numbers on screen, not the formal TR-09/TR-10 evidence package. No sign-off or automatic deviation, neither being drawn in the design.',
  },
  'shipment-event-log': {
    services: '`shipmentEventService` — listShipments, createShipment, getShipmentEvents, addShipmentEvent',
    data: '`shipments`, `shipment_events` — RLS enabled, company-isolation policy',
    status: 'Working against real tables. No mock data.',
    tests: 'SQL: A/B/C/F (RLS, cross-tenant, anon, event_type CHECK). Unit: event-type parity with the DB constraint.',
    outstanding: '`company_id` has no FK to `companies`. The read-only preflight is now written — `scripts/preflight/logistics-company-id.sql` — and has been run on a local build only. It has NOT been run against production, which is what the decision needs.',
  },
  'cn-declarations': {
    services: '`customsDeclarationService` — listDeclarations, createDeclaration, resolveDeclarationFlag',
    data: '`cn_declarations` — RLS enabled; flag rule and resolution enforced by `20261203000000`',
    status: 'Working. Two rules moved out of the browser: the CN22/vague-description flag is now a BEFORE trigger, and clearing a flag is attributable and keeps its reason.',
    tests: 'SQL: A/B/C/D/E/G — 49 assertions including "a CN22 over the threshold is flagged even when filed as clean". Unit: 19 tests including TS/SQL constant parity.',
    outstanding: 'Same missing `company_id` FK; same preflight, same caveat.',
  },
  'contraband-rejection': {
    services: '`contrabandService` — listRejections, createRejection, updateRejectionStatus, listCustomerFlags, flagCustomer, clearCustomerFlag, checkSenderFlag',
    data: '`contraband_rejection_log`, `customer_flags` — RLS enabled; both carry CHECK constraints on status and type',
    status: 'Working against real tables. No mock data.',
    tests: 'SQL: A/B/C (RLS, cross-tenant, anon). Unit: rejection-reason list shape.',
  },
};

const KIND_SCOPE: Record<Destination['kind'], string> = {
  rail: 'In pilot',
  hosted: 'In pilot',
  detail: 'In pilot',
  standalone: 'In pilot',
  pendingDesign: 'In pilot (D3) — design owed',
  review: '**Needs owner confirmation**',
};

function design(d: Destination): string {
  if (d.kind === 'pendingDesign') return `None — ${d.owed}`;
  if (d.kind === 'review') return `Existing page; ${d.because}`;
  return 'Approved design, or placed by HS-02’s own table';
}

function destination(id: PageId, d: Destination): string {
  switch (d.kind) {
    case 'rail': return `Rail: **${d.group} › ${d.label}**`;
    case 'pendingDesign': return `Rail: ${d.group} › ${d.label} (below the rule)`;
    case 'review': return `Rail: ${d.group} › ${d.label} (flagged)`;
    case 'hosted': return `Inside **${d.host}**${d.label ? ` as “${d.label}”` : ''}`;
    case 'detail': return `Record page of **${d.host}**`;
    case 'standalone': return `Not in the rail — ${d.via}`;
  }
}

const rows: string[] = [];
const byGroup = new Map<string, PageId[]>();
for (const id of PAGE_IDS as readonly PageId[]) {
  const rail = railEntryFor(id);
  const railDest = rail ? DESTINATIONS[rail] : undefined;
  const group =
    railDest && (railDest.kind === 'rail' || railDest.kind === 'pendingDesign' || railDest.kind === 'review')
      ? (railDest.group as RailGroup)
      : 'Outside the rail';
  if (!byGroup.has(group)) byGroup.set(group, []);
  byGroup.get(group)!.push(id);
}

const order = [...RAIL_GROUPS, 'Outside the rail'];
for (const group of order) {
  const ids = byGroup.get(group);
  if (!ids || ids.length === 0) continue;
  rows.push(`\n### ${group} — ${ids.length} page${ids.length === 1 ? '' : 's'}\n`);
  for (const id of ids) {
    const d = DESTINATIONS[id];
    const v = VERIFIED[id];
    const section = PAGE_SECTION[id];
    rows.push(`#### \`${id}\`\n`);
    rows.push('| | |');
    rows.push('|---|---|');
    rows.push(`| Destination | ${destination(id, d)} |`);
    rows.push(`| Pilot scope | ${KIND_SCOPE[d.kind]} |`);
    rows.push(`| Design | ${design(d)} |`);
    rows.push(`| Authorization | ${section ? `PM-03 section \`${section}\`, plus the page's own \`perms\` gate` : 'Legacy `perms.*` gate only — `canOpenPage` returns true for a page PM-03 does not tabulate'} |`);
    rows.push(`| Services | ${v?.services ?? '_not assessed in this phase_'} |`);
    rows.push(`| Data model / RLS | ${v?.data ?? '_not assessed in this phase_'} |`);
    rows.push(`| Functional status | ${v?.status ?? '_not assessed in this phase_'} |`);
    rows.push(`| Tests | ${v?.tests ?? '_navigation only: covered by `src/tests/hs02Navigation.test.ts`_'} |`);
    if (v?.outstanding) rows.push(`| Outstanding | ${v.outstanding} |`);
    rows.push('');
  }
}

const counts = (Object.values(DESTINATIONS) as Destination[]).reduce<Record<string, number>>(
  (acc, d) => { acc[d.kind] = (acc[d.kind] ?? 0) + 1; return acc; }, {},
);

const out = `# Implementation matrix

**Generated** by \`npx tsx scripts/docs/nav-matrix.ts\` from
\`src/lib/navigation/hs02.ts\`. Do not edit by hand — the destination,
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
| \`rail\` — a top-level entry | ${counts.rail ?? 0} |
| \`hosted\` — inside another entry | ${counts.hosted ?? 0} |
| \`detail\` — a record page of its list | ${counts.detail ?? 0} |
| \`pendingDesign\` — in scope, design owed (D3) | ${counts.pendingDesign ?? 0} |
| \`review\` — works, needs owner confirmation | ${counts.review ?? 0} |
| \`standalone\` — reachable outside the rail | ${counts.standalone ?? 0} |
| **Total** | **${PAGE_IDS.length}** |

Every page has exactly one destination, enforced by the type
\`Record<PageId, Destination>\`: a page with none does not compile.
There is no fallback group, and \`More\` is not a group any more.

## Pages, by the rail group they are reachable under
${rows.join('\n')}`;

writeFileSync('docs/implementation-matrix.md', out);
console.log(`wrote docs/implementation-matrix.md — ${PAGE_IDS.length} pages`);
