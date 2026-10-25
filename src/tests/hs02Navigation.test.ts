/**
 * HS-02 navigation regressions.
 *
 * ── WHAT THESE TESTS ARE FOR ──
 *
 * The bug this replaces was not a wrong label, it was a FALLBACK: a
 * page missing from `DB01_NAV` silently became `category: 'More'`, and
 * `More` started collapsed. Four built screens sat in that drawer while
 * being reported as never built, and `docs/navigation-audit.md` counted
 * 80 pages down there.
 *
 * A fallback cannot be caught by testing the happy path, so these tests
 * assert the two properties that make it impossible to come back:
 *
 *   1. EVERY page has a stated destination — enforced by the type, and
 *      re-checked here at run time because a type is erased.
 *   2. Every page is REACHABLE: it is a rail entry, or it resolves
 *      through its host to one, or it is standalone and says how it is
 *      reached instead.
 *
 * The rest pin the product decisions, so that re-excluding Governance
 * or Logistics breaks a test rather than quietly shipping.
 */

import { describe, it, expect } from 'vitest';
import {
  DESTINATIONS, RAIL_GROUPS, BEYOND_DESIGN,
  railEntries, railEntryFor, hostedUnder, owedDesigns, needsOwnerConfirmation,
  type Destination, type RailGroup,
} from '../lib/navigation/hs02';
import { PAGE_IDS, type PageId } from '../components/Layout/MainLayout';
import { PAGE_SECTION } from '../lib/access/roleAccess';

const ALL = PAGE_IDS as readonly PageId[];
const RAIL_KINDS = ['rail', 'pendingDesign', 'review'] as const;
const isRailKind = (d: Destination) =>
  (RAIL_KINDS as readonly string[]).includes(d.kind);

describe('every page has a stated destination', () => {
  it('covers every PAGE_ID with no extras', () => {
    const declared = Object.keys(DESTINATIONS).sort();
    const expected = [...ALL].sort();
    expect(declared).toEqual(expected);
  });

  //  The type already forbids a missing key. This asserts the other
  //  direction — that nothing was added to the map which is not a real
  //  route — because a stale entry is how a destination ends up
  //  describing a page that no longer exists.
  it('declares no destination for a page that does not route', () => {
    const routed = new Set<string>(ALL);
    for (const id of Object.keys(DESTINATIONS)) {
      expect(routed.has(id), `${id} has a destination but is not in PAGE_IDS`).toBe(true);
    }
  });

  it('has no page left in a catch-all group', () => {
    //  'More' was the catch-all. It must not be a group any more, and
    //  nothing may claim it.
    expect(RAIL_GROUPS as readonly string[]).not.toContain('More');
    for (const [id, d] of Object.entries(DESTINATIONS) as Array<[PageId, Destination]>) {
      if (isRailKind(d)) {
        const group = (d as Extract<Destination, { group: RailGroup }>).group;
        expect(RAIL_GROUPS as readonly string[], `${id} sits in an unknown group`).toContain(group);
      }
    }
  });
});

describe('every page is reachable', () => {
  it('resolves to a rail entry, or says how else it is reached', () => {
    const unreachable: string[] = [];
    for (const id of ALL) {
      const d = DESTINATIONS[id];
      if (d.kind === 'standalone') {
        //  Allowed, but it has to say HOW. An empty `via` would be the
        //  old problem wearing a different hat.
        expect(d.via.trim().length, `${id} is standalone with no route stated`).toBeGreaterThan(10);
        continue;
      }
      if (railEntryFor(id) === null) unreachable.push(id);
    }
    expect(unreachable).toEqual([]);
  });

  it('points every host at a real page, and never at itself', () => {
    for (const [id, d] of Object.entries(DESTINATIONS) as Array<[PageId, Destination]>) {
      if (d.kind === 'hosted' || d.kind === 'detail') {
        expect(DESTINATIONS[d.host], `${id} is hosted by unknown page ${d.host}`).toBeDefined();
        expect(d.host, `${id} hosts itself`).not.toBe(id);
      }
    }
  });

  it('has no host cycles', () => {
    //  railEntryFor gives up after 8 hops. A cycle would make it return
    //  null, which the reachability test above would catch — but this
    //  names the chain so a failure is diagnosable.
    for (const id of ALL) {
      const seen = new Set<string>([id]);
      let at: PageId = id;
      for (;;) {
        const d: Destination = DESTINATIONS[at];
        if (d.kind !== 'hosted' && d.kind !== 'detail') break;
        expect(seen.has(d.host), `host cycle: ${[...seen, d.host].join(' -> ')}`).toBe(false);
        seen.add(d.host);
        at = d.host;
      }
    }
  });

  it('never puts a record-detail page in the rail', () => {
    for (const [id, d] of Object.entries(DESTINATIONS) as Array<[PageId, Destination]>) {
      if (d.kind === 'detail') {
        expect(isRailKind(d), `${id} is a detail page and must not be a rail entry`).toBe(false);
      }
    }
  });
});

describe('the four HS-02 items that were buried under More', () => {
  //  These are the ones the audit found: named in HS-02's 14-item rail,
  //  built, and sitting in a collapsed drawer.
  it.each<[PageId, string]>([
    ['change-control', 'Change Control'],
    ['sop-library', 'SOP Library'],
    ['training-log', 'Training'],
    ['gmp-inspection', 'GMP Inspection'],
  ])('%s is a top-level rail entry labelled "%s"', (id, label) => {
    const d = DESTINATIONS[id];
    expect(d.kind).toBe('rail');
    expect((d as Extract<Destination, { kind: 'rail' }>).label).toBe(label);
    expect((d as Extract<Destination, { kind: 'rail' }>).group).toBe('Manufacturing & Quality');
    //  Below BEYOND_DESIGN: these are the design's own entries, not
    //  additions of ours, so they draw above the rule.
    expect((d as Extract<Destination, { kind: 'rail' }>).order).toBeLessThan(BEYOND_DESIGN);
  });
});

describe('decision 1 — Governance is in the pilot', () => {
  it.each<PageId>(['obligations', 'risk-register', 'policies'])(
    '%s is a top-level rail entry in Governance',
    (id) => {
      const d = DESTINATIONS[id];
      expect(d.kind).toBe('rail');
      expect((d as Extract<Destination, { kind: 'rail' }>).group).toBe('Governance');
    },
  );

  it('keeps the governance detail routes reachable from their lists', () => {
    expect(railEntryFor('obligation-detail')).toBe('obligations');
    expect(railEntryFor('risk-detail')).toBe('risk-register');
    expect(railEntryFor('policy-detail')).toBe('policies');
  });

  //  The previous disposition was HS-01 row 8, "leave them off the
  //  pilot rail". If anybody reinstates that, this fails.
  it('does not mark any governance page as needing owner confirmation', () => {
    const flagged = needsOwnerConfirmation().map((r) => r.id);
    expect(flagged).not.toContain('obligations');
    expect(flagged).not.toContain('risk-register');
    expect(flagged).not.toContain('policies');
  });
});

describe('decision 2 — Logistics and Customs are in the pilot', () => {
  it.each<PageId>(['shipment-event-log', 'cn-declarations', 'contraband-rejection'])(
    '%s is a top-level rail entry in Logistics',
    (id) => {
      const d = DESTINATIONS[id];
      expect(d.kind).toBe('rail');
      expect((d as Extract<Destination, { kind: 'rail' }>).group).toBe('Logistics');
      expect((d as Extract<Destination, { kind: 'rail' }>).order).toBeLessThan(BEYOND_DESIGN);
    },
  );

  it('gives the Logistics group exactly the three built pages', () => {
    const logistics = railEntries().filter((e) => e.group === 'Logistics').map((e) => e.id);
    expect(logistics.sort()).toEqual(
      ['cn-declarations', 'contraband-rejection', 'shipment-event-log'],
    );
  });
});

describe('no feature is advertised twice', () => {
  it('gives each rail label one entry', () => {
    const labels = railEntries().map((e) => e.label);
    expect(labels.length).toBe(new Set(labels).size);
  });

  //  Deviations and CAPA are ONE entry in the design. Having both as
  //  rail items is the duplication the audit warned about.
  it('hosts CAPA inside Deviation / CAPA rather than beside it', () => {
    expect(DESTINATIONS['capa-management']).toMatchObject({ kind: 'hosted', host: 'deviations' });
    expect(hostedUnder('deviations').map((c) => c.id)).toContain('capa-management');
  });

  it('hosts the CoA register inside Batch Release', () => {
    expect(DESTINATIONS['coa']).toMatchObject({ kind: 'hosted', host: 'batch-release' });
  });

  it('hosts applications, dossiers and the vault inside Registrations & Licences', () => {
    const hosted = hostedUnder('regulatory-affairs').map((c) => c.id).sort();
    expect(hosted).toEqual(['ctd-dossier', 'license-vault', 'son-compliance']);
  });

  it('puts every company-configuration page inside Settings', () => {
    const settings = hostedUnder('company-settings').map((c) => c.id);
    for (const id of [
      'company-members', 'company-invites', 'company-departments',
      'role-management', 'access-control', 'audit-trail', 'billing',
    ] as PageId[]) {
      expect(settings, `${id} should be a Settings section`).toContain(id);
    }
  });
});

describe('navigation does not touch authorization', () => {
  //  Visibility is not a security control. These assert that moving a
  //  page in the rail did not move its PM-03 section, which is what
  //  actually decides who may open it.
  it('leaves PAGE_SECTION exactly as it was', () => {
    expect(PAGE_SECTION).toEqual({
      'supplier-qualification': 'suppliers',
      'goods-receipt': 'goods_receipt',
      'materials': 'material_lots',
      'qc-testing': 'qc_testing',
      'qa-disposition': 'qa_disposition',
      'batch-execution': 'batch_records',
      'batch-release': 'batch_release',
      'deviations': 'deviation_capa',
      'capa-management': 'deviation_capa',
      'coa': 'coa_register',
      'traceability': 'traceability',
      'dispatch': 'distribution',
    });
  });

  //  capa-management is the one page that both moved (into a host) and
  //  is PM-03 governed. Its section must survive the move, or the move
  //  would have changed who may open it.
  it('keeps the PM-03 section of the one governed page that moved', () => {
    expect(DESTINATIONS['capa-management'].kind).toBe('hosted');
    expect(PAGE_SECTION['capa-management']).toBe('deviation_capa');
  });

  it('places every PM-03 governed page somewhere reachable', () => {
    for (const id of Object.keys(PAGE_SECTION) as PageId[]) {
      expect(railEntryFor(id), `${id} is PM-03 governed but unreachable`).not.toBeNull();
    }
  });
});

describe('what the design still owes', () => {
  it('states what is owed for every pendingDesign page', () => {
    const owed = owedDesigns();
    expect(owed.length).toBeGreaterThan(0);
    for (const o of owed) {
      expect(o.owed.trim().length, `${o.id} is owed a design but says nothing about what`).toBeGreaterThan(20);
      expect(o.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('gives a reason for every page awaiting owner confirmation', () => {
    for (const r of needsOwnerConfirmation()) {
      expect(r.because.trim().length, `${r.id} is flagged with no reason`).toBeGreaterThan(20);
    }
  });

  //  Decision 3: no feature is dropped for lacking a design. So an
  //  owed-design page is still a reachable rail entry.
  it('keeps every owed-design page reachable', () => {
    for (const o of owedDesigns()) {
      expect(railEntryFor(o.id), `${o.id} is owed a design and must stay reachable`).not.toBeNull();
    }
  });
});

describe('rail ordering', () => {
  it('sorts groups in the declared order', () => {
    const groups = railEntries().map((e) => e.group);
    const indices = groups.map((g) => RAIL_GROUPS.indexOf(g));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('draws Settings last', () => {
    expect(RAIL_GROUPS[RAIL_GROUPS.length - 1]).toBe('Settings');
  });

  it('orders within a group ascending', () => {
    for (const g of RAIL_GROUPS) {
      const orders = railEntries().filter((e) => e.group === g).map((e) => e.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    }
  });
});
