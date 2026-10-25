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
  'facility-logs': {
    services: '`facilityLogService` — listRegister, listZones, listSchedules, listZoneHistory, recordEntry, listSiteOptions, createZone, updateZone, setZoneActive, createSchedule, updateSchedule, setScheduleActive',
    data: '`facility_zones`, `facility_zone_schedules`, `facility_log_entries` — RLS enabled, company-isolation policies; all three carry a `company_id` FK to `companies`',
    status: 'Working, both screens. FL-01 is the register (triage order, tabs, record, per-zone history) and FL-02 sets zones and scheduled tests up. `outcome` is derived by a BEFORE trigger and whatever a caller sends is discarded.',
    tests: 'SQL: 31 (`facility_logs_test.sql`) + 33 (`facility_zone_setup_test.sql`) — isolation, the outcome rule, zone/site and schedule/zone agreement in both the RLS and the RLS-bypassing posture. Unit: 33 + 46.',
    outstanding: 'FL-06/FL-07 trend charts and FL-13/FL-14 finding-to-task are not built; the latter needs a rule W6·29 does not state. No sign-off or automatic deviation, neither being drawn in the design.',
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
