/**
 * HS-02 — the one navigation rail.
 *
 * ── WHY THIS FILE REPLACES `DB01_NAV` ──
 *
 * `MainLayout` used to decide the sidebar with a map called `DB01_NAV`
 * and a FALLBACK: any page absent from that map became
 * `category: 'More'`, and `More` started collapsed. That is how four
 * built screens — Change Control, SOP Library, Training and GMP
 * Inspection — came to sit in a closed drawer while being reported as
 * missing, and why `docs/navigation-audit.md` found 80 items down
 * there.
 *
 * The design file already decided against that arrangement. HS-01 row 1
 * ("Navigation rail has four versions") carries the decision:
 *
 *   BUILD — One rail for every page and role (HS-02). A role hides
 *   items it can't open. It never renames or adds items.
 *
 * and names DB-01 as one of the four rails being replaced. So this
 * module is HS-02, and `DB01_NAV` is gone.
 *
 * ── THE RULE THAT MAKES "MORE" IMPOSSIBLE ──
 *
 * `DESTINATIONS` is typed `Record<PageId, Destination>`. A new page id
 * therefore FAILS TO COMPILE until somebody states where it belongs.
 * There is no default branch and no catch-all group. That is the whole
 * mechanism: the old bug was a fallback, so the fix is the absence of
 * one.
 *
 * ── PRODUCT DECISIONS BAKED IN HERE ──
 *
 * HS-02's own baseline excluded some things that the product owner has
 * since put back. Where the two disagree, the owner wins and the
 * disagreement is noted at the entry. See
 * `docs/navigation-decisions.md`:
 *
 *   D1 — Obligations, Risk Register and Policies are IN the pilot.
 *        HS-01 row 8 had left them off pending "item 25".
 *   D2 — Logistics and Customs are IN the pilot. HS-02's exclusion
 *        list ("a pharmaceutical manufacturer never sees logistics or
 *        customs modules") describes module ENABLEMENT, not deletion,
 *        and is kept as a per-workspace gate rather than a ban.
 *   D3 — A feature with no approved design is designed and built, not
 *        removed.
 *   D4 — HS-02 is the navigation standard.
 *
 * ── WHAT THIS MODULE DOES NOT DO ──
 *
 * It does not grant or refuse anything. Visibility is not a security
 * control: `pageRefused` / `pageOpenableBy` in `../access/roleAccess`
 * and the database's own policies decide who may open a page, and they
 * are untouched by this file. A page can have a rail entry here and
 * still be refused on open, which is correct.
 */

import type { PageId } from '../../components/Layout/MainLayout';

/**
 * The rail's groups, in the order they are drawn.
 *
 * The first three are HS-02's own. `Governance` and `Logistics` are
 * added for D1 and D2. `Content` and `AI Governance` hold domains the
 * design file never covered at all — they are grouped rather than left
 * loose so that "no approved design" does not quietly become "no
 * destination". `Settings` is drawn last, below a rule, as HS-02 draws
 * it.
 */
export const RAIL_GROUPS = [
  'Overview',
  'Manufacturing & Quality',
  'Regulatory',
  'Governance',
  'Logistics',
  'Content',
  'AI Governance',
  'Settings',
] as const;

export type RailGroup = (typeof RAIL_GROUPS)[number];

/**
 * Items the design file does not name sort after this mark, and the
 * rail draws a rule above the first of them.
 *
 * Carried over deliberately from the previous implementation, which
 * used the same constant for the same purpose: a reader can see at a
 * glance which entries are the design's and which are ours.
 */
export const BEYOND_DESIGN = 50;

export type Destination =
  /**
   * A top-level entry in the rail. `label` is what the design calls it,
   * which is not always what the page calls itself — HS-02 renames
   * Traceability to "Genealogy trace" and Regulatory Affairs to
   * "Registrations & Licences".
   */
  | { kind: 'rail'; group: RailGroup; label: string; order: number }
  /**
   * Belongs INSIDE another destination — a tab, a section, or a panel
   * on the host's page. HS-02's "Where each old name goes" table is
   * full of these: CoA register into Batch Release › Certificates,
   * Applications and CTD Dossiers into Registrations & Licences.
   *
   * Until the host grows that tab, a hosted page is drawn nested under
   * its host in the rail so it stays reachable. That nesting is a
   * deliberate transitional step, recorded in the decisions document,
   * and it is what keeps this change from orphaning working pages.
   */
  | { kind: 'hosted'; host: PageId; label?: string }
  /** A record page reached from its host's list. Never in the rail. */
  | { kind: 'detail'; host: PageId }
  /**
   * Reachable, but not from the rail: the avatar menu, the top bar, or
   * a deep link. Naming them here is the point — it distinguishes
   * "deliberately not in the rail" from "forgotten".
   */
  | { kind: 'standalone'; via: string }
  /**
   * In pilot scope per D3, with no approved design yet. It gets a real
   * group now so it is reachable and intentional, and `owed` records
   * what the design has to answer. Phase 3 turns these into designed
   * screens.
   */
  | { kind: 'pendingDesign'; group: RailGroup; label: string; order: number; owed: string }
  /**
   * Works today, but a design-side decision says it should not be in
   * the pilot rail — and the owner has not overridden that one. Kept
   * REACHABLE and flagged rather than hidden, because
   * `docs/navigation-audit.md` established that several of these pages
   * work and "absence of a design is not authorisation to remove".
   * Each needs an explicit owner confirmation.
   */
  | { kind: 'review'; group: RailGroup; label: string; order: number; because: string };

/**
 * Destinations for every page the application routes.
 *
 * Grouped by rail group, in rail order, so this reads top-to-bottom
 * the way the sidebar does.
 */
export const DESTINATIONS: Record<PageId, Destination> = {
  // ── OVERVIEW ──────────────────────────────────────────────────────
  'dashboard': { kind: 'rail', group: 'Overview', label: 'Dashboard', order: 1 },
  'my-tasks': { kind: 'rail', group: 'Overview', label: 'My tasks', order: 2 },

  //  HS-01 row 4 designs My tasks as "a full-width list using the
  //  dashboard task rows, grouped Overdue, Today, This week" — the page
  //  exists, so it is a rail item rather than something owed.

  'command-center': {
    kind: 'pendingDesign', group: 'Overview', label: 'Command Center',
    order: BEYOND_DESIGN + 1,
    owed: 'No screen in the design file. DB-01/DB-02 are the designed dashboards; what this adds over them is undecided.',
  },
  'ai-insights': {
    kind: 'pendingDesign', group: 'Overview', label: 'AI Insights',
    order: BEYOND_DESIGN + 2,
    owed: 'No AI surface anywhere in the design file.',
  },
  'team-chat': {
    kind: 'pendingDesign', group: 'Overview', label: 'Team Chat',
    order: BEYOND_DESIGN + 3,
    owed: 'Collaboration is not designed in the file.',
  },
  'enterprise-dashboard': {
    kind: 'review', group: 'Overview', label: 'Group Overview',
    order: BEYOND_DESIGN + 4,
    because: 'HS-02 lists "Group-level roll-up" under "Excluded from the MVP: never in navigation". The page works; the owner has not overridden this exclusion.',
  },
  'compliance-reporting': {
    kind: 'review', group: 'Overview', label: 'Compliance Report',
    order: BEYOND_DESIGN + 5,
    because: 'HS-01 row 11 REMOVE: "Reports live where the data is: training reports TN-12 to TN-14, trace export TR-09." Mapping this page to that row is an inference from its label.',
  },

  // ── MANUFACTURING & QUALITY ───────────────────────────────────────
  //  HS-02 draws ten items here. Materials carries tabs (Lots, Receive,
  //  Tests), which is where goods receipt, QC testing and QA
  //  disposition go per "Where each old name goes".
  'materials': { kind: 'rail', group: 'Manufacturing & Quality', label: 'Materials', order: 1 },
  'goods-receipt': { kind: 'hosted', host: 'materials', label: 'Goods receipt' },
  'qc-testing': { kind: 'hosted', host: 'materials', label: 'QC testing' },
  'qa-disposition': { kind: 'hosted', host: 'materials', label: 'QA disposition' },

  'batch-execution': { kind: 'rail', group: 'Manufacturing & Quality', label: 'Batch Records', order: 2 },
  'in-process': { kind: 'hosted', host: 'batch-execution', label: 'In-process checks' },
  'master-formulas': { kind: 'hosted', host: 'batch-execution', label: 'Master formulas' },

  'batch-release': { kind: 'rail', group: 'Manufacturing & Quality', label: 'Batch Release', order: 3 },
  //  HS-02: "CoA register → Batch Release › Certificates".
  'coa': { kind: 'hosted', host: 'batch-release', label: 'Certificates' },

  //  HS-02 renames this. The page lists genealogy either way.
  'traceability': { kind: 'rail', group: 'Manufacturing & Quality', label: 'Genealogy trace', order: 4 },

  //  ONE entry in the design, so CAPA is hosted rather than a second
  //  rail item. This is the only hosted page PM-03 governs
  //  (`deviation_capa`), so the move changes where it appears and not
  //  who may open it.
  'deviations': { kind: 'rail', group: 'Manufacturing & Quality', label: 'Deviation / CAPA', order: 5 },
  'capa-management': { kind: 'hosted', host: 'deviations', label: 'CAPA' },

  //  The four HS-02 names that were sitting under collapsed More.
  'change-control': { kind: 'rail', group: 'Manufacturing & Quality', label: 'Change Control', order: 6 },
  'sop-library': { kind: 'rail', group: 'Manufacturing & Quality', label: 'SOP Library', order: 7 },
  'training-log': { kind: 'rail', group: 'Manufacturing & Quality', label: 'Training', order: 8 },
  'gmp-inspection': { kind: 'rail', group: 'Manufacturing & Quality', label: 'GMP Inspection', order: 9 },

  'training-simulation': {
    kind: 'pendingDesign', group: 'Manufacturing & Quality', label: 'Training Sim',
    order: BEYOND_DESIGN + 1,
    owed: 'W6·28 designs training RECORDS — acknowledge, refuse-to-sign, register, reports. Simulation and assessment are not drawn.',
  },
  'instruments': {
    kind: 'pendingDesign', group: 'Manufacturing & Quality', label: 'Instruments',
    order: BEYOND_DESIGN + 2,
    owed: 'CAL-01/CAL-02 design the calibration register and instrument record, but HS-02 gives it no rail entry. Needs a destination decision: rail item, or a section of Batch Records.',
  },
  'product-specifications': {
    kind: 'pendingDesign', group: 'Manufacturing & Quality', label: 'Specifications',
    order: BEYOND_DESIGN + 3,
    owed: 'No frame for a specification screen; 20261113000000 made one necessary because a batch cannot be released without an approved specification.',
  },
  'supplier-qualification': {
    kind: 'review', group: 'Manufacturing & Quality', label: 'Suppliers',
    order: BEYOND_DESIGN + 4,
    because: 'HS-01 row 9 REMOVE: "Supplier qualification is excluded from the MVP … The approved-supplier list stays in Settings › Materials and suppliers." The page works.',
  },
  'dispatch': {
    kind: 'review', group: 'Manufacturing & Quality', label: 'Dispatch',
    order: BEYOND_DESIGN + 5,
    because: 'HS-01 row 10 REMOVE: "No dispatch module in the MVP. The storekeeper sees Materials." But PM-03 gives the Storekeeper Act on Distribution and 20261111000000 built the page for it, so removing it would strand a tabulated permission.',
  },

  // ── REGULATORY ────────────────────────────────────────────────────
  'products': { kind: 'rail', group: 'Regulatory', label: 'Products', order: 1 },
  //  HS-01 row 13 BUILD: "Three tabs inside Registrations & Licences.
  //  No separate rail items." This page is the Applications list (it
  //  extends old REG-03), so it hosts the other two.
  'regulatory-affairs': { kind: 'rail', group: 'Regulatory', label: 'Registrations & Licences', order: 2 },
  'ctd-dossier': { kind: 'hosted', host: 'regulatory-affairs', label: 'CTD Dossiers' },
  'license-vault': { kind: 'hosted', host: 'regulatory-affairs', label: 'Licence Vault' },
  //  SON appears in the designs only as a certificate TYPE in the
  //  vault ("SON MANCAP certificate"), never as a page of its own.
  'son-compliance': { kind: 'hosted', host: 'regulatory-affairs', label: 'SON Compliance' },

  'regulations': {
    kind: 'pendingDesign', group: 'Regulatory', label: 'Regulations Ledger',
    order: BEYOND_DESIGN + 1,
    owed: 'The designed regulatory surfaces are registrations, applications and the licence vault. None is a regulations ledger.',
  },
  'regulatory-library': {
    kind: 'pendingDesign', group: 'Regulatory', label: 'Reg Library',
    order: BEYOND_DESIGN + 2,
    owed: 'No screen, and no old-product code cited for it. Distinct from the SOP Library.',
  },
  'horizon-scanning': {
    kind: 'pendingDesign', group: 'Regulatory', label: 'Horizon Scan',
    order: BEYOND_DESIGN + 3,
    owed: 'No screen in the file.',
  },
  'drift-monitor': {
    kind: 'pendingDesign', group: 'Regulatory', label: 'Drift Monitor',
    order: BEYOND_DESIGN + 4,
    owed: 'No new screen, but FL-01 cites "the Drift Monitor\'s red alert banner (REG-09)" as a working screen whose pattern it borrowed — so the feature is live and only the new design is missing.',
  },
  'compliance-alerting': {
    kind: 'pendingDesign', group: 'Regulatory', label: 'Compliance Alerts',
    order: BEYOND_DESIGN + 5,
    owed: 'CF-01 designs alerting "in place" inside each area (FL-02 blocks, licence alerts at 12/6/3) rather than as a page. Whether a central alert page is wanted is undecided.',
  },

  // ── GOVERNANCE — D1 ───────────────────────────────────────────────
  //  HS-01 row 8 had left these off the pilot rail "unless item 25
  //  walks them in the demonstration company", and recorded that the
  //  underlying pages WORK. The owner has now included them, so they
  //  are rail items.
  'obligations': { kind: 'rail', group: 'Governance', label: 'Obligations', order: 1 },
  'obligation-detail': { kind: 'detail', host: 'obligations' },
  'risk-register': { kind: 'rail', group: 'Governance', label: 'Risk Register', order: 2 },
  'risk-detail': { kind: 'detail', host: 'risk-register' },
  'policies': { kind: 'rail', group: 'Governance', label: 'Policies', order: 3 },
  'policy-detail': { kind: 'detail', host: 'policies' },
  'my-policies': { kind: 'hosted', host: 'policies', label: 'My Policies' },
  'policy-assistant': { kind: 'hosted', host: 'policies', label: 'Policy Assistant' },

  'audit-sessions': {
    kind: 'pendingDesign', group: 'Governance', label: 'Audit Workspace',
    order: BEYOND_DESIGN + 1,
    owed: 'No audit-workspace screen. HS-01 row 12 designs an audit TRAIL, which is a different thing and lives in Settings.',
  },
  'audit-session-detail': { kind: 'detail', host: 'audit-sessions' },
  'audit-prep': {
    kind: 'pendingDesign', group: 'Governance', label: 'AI Audit Prep',
    order: BEYOND_DESIGN + 2, owed: 'No screen. Audit preparation is not drawn anywhere in the file; W6·32 designs the dead-end and honest-state patterns, not a preparation workflow.',
  },
  'governance-timeline': {
    kind: 'pendingDesign', group: 'Governance', label: 'Governance Timeline',
    order: BEYOND_DESIGN + 3, owed: 'No screen. The designed history surfaces are the audit trail (HS-01 row 12) and per-record history; a cross-cutting governance timeline is not among them.',
  },
  'legal-holds': {
    kind: 'pendingDesign', group: 'Governance', label: 'Legal Holds',
    order: BEYOND_DESIGN + 4, owed: 'No screen anywhere in the file. Legal hold is outside CF-01\'s fifteen configuration areas, so neither the surface nor the rules it should expose are established.',
  },
  'retention-policies': {
    kind: 'pendingDesign', group: 'Governance', label: 'Data Retention',
    order: BEYOND_DESIGN + 5, owed: 'No screen anywhere in the file. Data retention is likewise outside CF-01\'s fifteen areas, so the retention rules themselves are undefined as well as undrawn.',
  },
  'platform-evidence-ingestions': {
    kind: 'pendingDesign', group: 'Governance', label: 'Evidence Ingestions',
    order: BEYOND_DESIGN + 6,
    owed: 'TR-09/TR-10 design an evidence PACKAGE EXPORT, not an ingestion pipeline.',
  },
  'vendors': {
    kind: 'pendingDesign', group: 'Governance', label: 'Vendors',
    order: BEYOND_DESIGN + 7,
    owed: 'No screen. HS-01 row 9 keeps an approved-SUPPLIER list in Settings, which is a narrower thing than vendor management.',
  },
  'vendor-detail': { kind: 'detail', host: 'vendors' },
  'vendor-scorecard': { kind: 'hosted', host: 'vendors', label: 'Vendor Scorecard' },
  'grc-dashboard': {
    kind: 'pendingDesign', group: 'Governance', label: 'Control Posture',
    order: BEYOND_DESIGN + 8, owed: 'No controls/frameworks surface in the file.',
  },
  'grc-frameworks': {
    kind: 'hosted', host: 'grc-dashboard', label: 'GRC Frameworks',
  },
  'grc-controls': { kind: 'hosted', host: 'grc-dashboard', label: 'Controls' },
  'grc-automation': { kind: 'hosted', host: 'grc-dashboard', label: 'Automated Testing' },
  'framework-library': { kind: 'hosted', host: 'grc-dashboard', label: 'Framework Library' },
  'control-monitoring': { kind: 'hosted', host: 'grc-dashboard', label: 'Control Health' },
  'predictive-risk': { kind: 'hosted', host: 'risk-register', label: 'Risk Modeling' },
  'crisis-response': {
    kind: 'pendingDesign', group: 'Governance', label: 'Crisis Response',
    order: BEYOND_DESIGN + 9,
    owed: 'No screen. HS-02 excludes Recall and Complaints; crisis response is not mentioned either way.',
  },
  'whistleblower': {
    kind: 'pendingDesign', group: 'Governance', label: 'Internal Reports',
    order: BEYOND_DESIGN + 10, owed: 'No screen anywhere in the file.',
  },

  // ── LOGISTICS & CUSTOMS — D2 ──────────────────────────────────────
  //  All three are BUILT and functional against real tables
  //  (shipment_events, cn_declarations, contraband_rejection_log,
  //  customer_flags), with company-isolation RLS. They were reachable
  //  only by a workspace whose industry_type is "logistics & courier",
  //  and then only from collapsed More.
  //
  //  ONB-04's note — "a pharmaceutical manufacturer never sees
  //  logistics or customs modules: they are not offered at all" — is
  //  about module ENABLEMENT per workspace, which is exactly what the
  //  industry gate implements. D2 does not change that; it makes the
  //  destination intentional and the domain tested. A pharmaceutical
  //  workspace still does not see these.
  'shipment-event-log': { kind: 'rail', group: 'Logistics', label: 'Shipment Event Log', order: 1 },
  'cn-declarations': { kind: 'rail', group: 'Logistics', label: 'CN22/CN23 Declarations', order: 2 },
  'contraband-rejection': { kind: 'rail', group: 'Logistics', label: 'Contraband Rejection', order: 3 },

  // ── CONTENT COMPLIANCE ────────────────────────────────────────────
  //  An adjacent product line. The design file covers only the
  //  pharmaceutical product, so every one of these is owed a design.
  //  Grouped rather than left loose: a group with a name is a
  //  destination, a collapsed "More" is not.
  'upload': {
    kind: 'pendingDesign', group: 'Content', label: 'Upload Content',
    order: 1, owed: 'Content compliance is absent from the design file.',
  },
  'legal-review': { kind: 'hosted', host: 'upload', label: 'Legal Review' },
  'archive': { kind: 'hosted', host: 'upload', label: 'Content Archive' },
  'content-calendar': { kind: 'hosted', host: 'upload', label: 'Content Calendar' },
  'content-blocks': { kind: 'hosted', host: 'upload', label: 'Content Blocks' },
  'channel-rules': { kind: 'hosted', host: 'upload', label: 'Channel Rules' },
  'claim-extraction': { kind: 'hosted', host: 'upload', label: 'Claim NLP' },
  'translation-compliance': { kind: 'hosted', host: 'upload', label: 'Translation' },
  'agency-portal': { kind: 'hosted', host: 'upload', label: 'Agency Portal' },
  'consent-management': { kind: 'hosted', host: 'upload', label: 'Consent Mgmt' },
  'social-listening': { kind: 'hosted', host: 'upload', label: 'Social Listening' },
  'website-monitoring': { kind: 'hosted', host: 'upload', label: 'Web Monitoring' },
  'programmatic-ad': { kind: 'hosted', host: 'upload', label: 'Ad Compliance' },
  'correction-editor': {
    kind: 'standalone',
    via: 'Opened from a legal-review finding by id. It was `category: Hidden` before and is still not a rail entry — now by statement rather than by a flag.',
  },

  // ── AI GOVERNANCE ─────────────────────────────────────────────────
  'ai-dashboard': {
    kind: 'pendingDesign', group: 'AI Governance', label: 'AI Dashboard',
    order: 1, owed: 'No AI surface anywhere in the design file.',
  },
  'ai-assets': { kind: 'hosted', host: 'ai-dashboard', label: 'AI Systems Register' },
  'ai-asset-detail': { kind: 'detail', host: 'ai-assets' },
  'ai-usage': { kind: 'hosted', host: 'ai-dashboard', label: 'AI Usage' },
  'ai-reviews': { kind: 'hosted', host: 'ai-dashboard', label: 'AI Reviews' },
  'ai-prompts': { kind: 'hosted', host: 'ai-dashboard', label: 'AI Prompts' },
  'ai-incidents': { kind: 'hosted', host: 'ai-dashboard', label: 'AI Incidents' },

  // ── SETTINGS — CF-01 / CF-02 ──────────────────────────────────────
  //  CF-01 audits 15 configuration areas and states the conclusion:
  //  "Every area is now reachable from one Settings home (CF-02)".
  //  HS-02's table agrees — "Roles & permissions, People, Sites,
  //  Specifications & forms, Approval rules → Settings (CF-02)" and
  //  "Audit trail → Settings › Audit trail".
  //
  //  So Settings is ONE rail item and these are its sections. Phase 2
  //  turns the nesting into CF-02's actual sections.
  'company-settings': { kind: 'rail', group: 'Settings', label: 'Settings', order: 1 },
  'company-members': { kind: 'hosted', host: 'company-settings', label: 'Members' },
  'company-invites': { kind: 'hosted', host: 'company-settings', label: 'Invites' },
  'company-departments': { kind: 'hosted', host: 'company-settings', label: 'Departments' },
  'role-management': { kind: 'hosted', host: 'company-settings', label: 'Role Management' },
  'access-control': { kind: 'hosted', host: 'company-settings', label: 'Roles & Access' },
  //  HS-01 row 12 BUILD: a read-only list filtered to one record or
  //  one area, reached from Settings and from "View audit trail" on a
  //  record. It was a Traceability rail item, which HS-02 does not do.
  'audit-trail': { kind: 'hosted', host: 'company-settings', label: 'Audit trail' },
  'billing': { kind: 'hosted', host: 'company-settings', label: 'Billing & Plan' },
  'org-management': { kind: 'hosted', host: 'company-settings', label: 'Org Management' },
  'identity-providers': { kind: 'hosted', host: 'company-settings', label: 'Single Sign-On' },
  'integrations': { kind: 'hosted', host: 'company-settings', label: 'Integrations' },
  'pharma-integrations': { kind: 'hosted', host: 'company-settings', label: 'Pharma Integrations' },
  'platform-webhooks': { kind: 'hosted', host: 'company-settings', label: 'Outbound Webhooks' },
  'platform-jobs': { kind: 'hosted', host: 'company-settings', label: 'Platform Jobs' },
  'platform-ecosystem': { kind: 'hosted', host: 'company-settings', label: 'Partner Ecosystem' },
  'secret-vault': { kind: 'hosted', host: 'company-settings', label: 'Secret Vault' },
  'partner-verification': { kind: 'hosted', host: 'company-settings', label: 'Partner Verification' },

  // ── STANDALONE AND EXTERNAL ───────────────────────────────────────
  'profile': { kind: 'standalone', via: 'The avatar menu in the top bar.' },
  //  HS-01 row 3 removes the notifications BELL ("My tasks and the
  //  dashboard carry what is due"). The page itself still routes, so it
  //  is named here rather than deleted.
  'notifications': {
    kind: 'standalone',
    via: 'Routed, but not in the rail: HS-01 row 3 removes the notifications bell and sends what is due to My tasks and the dashboard.',
  },
  'legal-marketplace': {
    kind: 'pendingDesign', group: 'Governance', label: 'Legal Marketplace',
    order: BEYOND_DESIGN + 11,
    owed: 'No screen. HS-02 excludes a "Regulator portal"; a legal marketplace is not mentioned at all.',
  },
  'legal-partner-dashboard': {
    kind: 'standalone',
    via: 'The external partner console. It is shown only to a `legal_partner` account, which sees this instead of the rail, so it is not a rail entry for anybody else.',
  },
};

// ── Derived helpers ─────────────────────────────────────────────────

/** Every page that draws a top-level rail entry, grouped and ordered. */
export function railEntries(): Array<{ id: PageId; group: RailGroup; label: string; order: number; kind: Destination['kind'] }> {
  const out: Array<{ id: PageId; group: RailGroup; label: string; order: number; kind: Destination['kind'] }> = [];
  for (const [id, d] of Object.entries(DESTINATIONS) as Array<[PageId, Destination]>) {
    if (d.kind === 'rail' || d.kind === 'pendingDesign' || d.kind === 'review') {
      out.push({ id, group: d.group, label: d.label, order: d.order, kind: d.kind });
    }
  }
  return out.sort(
    (a, b) =>
      RAIL_GROUPS.indexOf(a.group) - RAIL_GROUPS.indexOf(b.group) ||
      a.order - b.order ||
      a.label.localeCompare(b.label),
  );
}

/** The pages hosted inside `host`, in declaration order. */
export function hostedUnder(host: PageId): Array<{ id: PageId; label?: string }> {
  return (Object.entries(DESTINATIONS) as Array<[PageId, Destination]>)
    .filter(([, d]) => d.kind === 'hosted' && d.host === host)
    .map(([id, d]) => ({ id, label: (d as { label?: string }).label }));
}

/**
 * The rail entry a page appears under, following `hosted` and `detail`
 * to their host. `null` for a standalone page, which has no rail entry
 * by design.
 *
 * Resolves transitively, because a detail page can hang off a hosted
 * page (`ai-asset-detail` → `ai-assets` → `ai-dashboard`), and guards
 * against a cycle rather than hanging.
 */
export function railEntryFor(page: PageId): PageId | null {
  let at: PageId = page;
  for (let hops = 0; hops < 8; hops += 1) {
    const d = DESTINATIONS[at];
    if (!d) return null;
    if (d.kind === 'rail' || d.kind === 'pendingDesign' || d.kind === 'review') return at;
    if (d.kind === 'standalone') return null;
    at = d.host;
  }
  return null;
}

/** Pages owed a design, for the implementation matrix and Phase 3. */
export function owedDesigns(): Array<{ id: PageId; group: RailGroup; label: string; owed: string }> {
  return (Object.entries(DESTINATIONS) as Array<[PageId, Destination]>)
    .filter(([, d]) => d.kind === 'pendingDesign')
    .map(([id, d]) => {
      const p = d as Extract<Destination, { kind: 'pendingDesign' }>;
      return { id, group: p.group, label: p.label, owed: p.owed };
    });
}

/** Pages whose pilot inclusion still needs the owner's confirmation. */
export function needsOwnerConfirmation(): Array<{ id: PageId; label: string; because: string }> {
  return (Object.entries(DESTINATIONS) as Array<[PageId, Destination]>)
    .filter(([, d]) => d.kind === 'review')
    .map(([id, d]) => {
      const r = d as Extract<Destination, { kind: 'review' }>;
      return { id, label: r.label, because: r.because };
    });
}
