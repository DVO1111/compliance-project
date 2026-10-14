/**
 * ONB-04 · the areas a workspace can switch on.
 *
 * THE RULES THIS FILE EXISTS TO KEEP, straight from the notes:
 *
 *   "Plain language, never technical module names (checklist W1·14
 *    VERIFY). Each card says what the team will do, not the module it
 *    maps to."
 *    → every `title` is a verb phrase — "Run batch records on the
 *      floor", not "Batch Execution". The module keys are in
 *      `grants`, which is never rendered.
 *
 *   "A pharmaceutical manufacturer never sees logistics or customs
 *    modules: they are not offered at all (J9.1)."
 *    → `offeredTo` is a list of industries, and an area not offered to
 *      yours is not rendered anywhere on the screen, in any section.
 *      Greying it out would still be showing it.
 *
 *   "'Coming later' cards are dashed, have no checkbox and carry the
 *    draft badge. Nothing on screen looks functional when it is not
 *    (MVP 'solidified' rule)."
 *    → `state: 'coming-later'`, and the screen gives those cards no
 *      input element at all rather than a disabled one.
 *
 * WHY `grants` EXISTS. company_members.module_access carries permission
 * bundles, and several areas grant the same bundle — switching on
 * "Manage changes" and "Release batches" both unlock quality_operations.
 * So the ticks cannot be recovered from module_access, which is why the
 * area ids are stored separately in company_members.onboarding_areas.
 * `grants` is the one-way mapping from what the person chose to what
 * the permission system reads.
 */

import type { ModuleKey } from '../moduleAccess';

export type AreaState = 'available' | 'coming-later';

export interface OnboardingArea {
  id: string;
  title: string;
  description: string;
  /** Icon name from the toolkit (src/lib/design/icons.ts). */
  iconName: string;
  state: AreaState;
  /** Industries this area is offered to at all. Absent from the screen
   *  entirely for any other industry (J9.1). */
  offeredTo: readonly string[];
  /** Industries where it starts ticked. A subset of offeredTo. */
  recommendedFor: readonly string[];
  /** The permission bundles it unlocks. Never shown on screen. */
  grants: readonly ModuleKey[];
  /** The PRD sections it implements, for the engineering mapping in the
   *  notes. Documentation, not behaviour. */
  prd: string;
}

const ALL_MAKERS = ['pharma', 'food', 'other'] as const;
const EVERYONE = ['pharma', 'food', 'importer', 'other'] as const;

export const ONBOARDING_AREAS: readonly OnboardingArea[] = [
  {
    id: 'materials',
    title: 'Receive, test and release materials',
    description: 'Goods receipt, quarantine, sampling, QC results and supplier CoA checks.',
    iconName: 'quality/material-receipt',
    state: 'available',
    offeredTo: EVERYONE,
    recommendedFor: ALL_MAKERS,
    grants: ['quality_operations'],
    prd: '3D.1–3D.2',
  },
  {
    id: 'floor',
    title: 'Run batch records on the floor',
    description: 'Master formulas, line clearance, dispensing and in-process checks, with sign-offs.',
    iconName: 'nav/batch-release',
    state: 'available',
    //  An importer or distributor manufactures nothing, so a batch
    //  record is not something they will ever raise.
    offeredTo: ALL_MAKERS,
    recommendedFor: ALL_MAKERS,
    grants: ['quality_operations'],
    prd: '3C.1–3C.7',
  },
  {
    id: 'release',
    title: 'Release batches and issue CoAs',
    description: 'Release decisions with every block shown up front, and certificates in one click.',
    iconName: 'quality/release',
    state: 'available',
    offeredTo: ALL_MAKERS,
    recommendedFor: ALL_MAKERS,
    grants: ['quality_operations'],
    prd: '3C.8–3C.10',
  },
  {
    id: 'deviations',
    title: 'Handle deviations and CAPAs',
    description: 'Raise, investigate and close quality events, and see what they block.',
    iconName: 'nav/deviation-capa',
    state: 'available',
    offeredTo: EVERYONE,
    recommendedFor: EVERYONE,
    grants: ['quality_operations', 'risk_governance'],
    prd: '3B.1–3B.2',
  },
  {
    id: 'sops',
    title: 'Control SOPs, documents and training',
    description: 'Versioned SOPs, read-and-acknowledge, and retraining when documents change.',
    iconName: 'nav/sop-library',
    state: 'available',
    offeredTo: EVERYONE,
    recommendedFor: EVERYONE,
    grants: ['policy_management', 'quality_operations'],
    prd: '3E',
  },
  {
    id: 'changes',
    title: 'Manage changes',
    description: 'Change requests with risk, quality and regulatory impact assessments.',
    iconName: 'nav/change-control',
    state: 'available',
    offeredTo: EVERYONE,
    recommendedFor: ALL_MAKERS,
    grants: ['quality_operations'],
    prd: '3B.3',
  },
  {
    id: 'registrations',
    title: 'Keep registrations and licences current',
    description: 'NAFDAC applications, CTD dossiers and renewals from 12 months out.',
    iconName: 'regulatory/licence',
    state: 'available',
    offeredTo: EVERYONE,
    recommendedFor: EVERYONE,
    grants: ['compliance_reporting', 'quality_operations'],
    prd: '3A',
  },
  {
    id: 'inspections',
    title: 'Prepare for inspections',
    description: 'GMP readiness checklist, evidence packs and the audit trail.',
    iconName: 'nav/gmp-inspection',
    state: 'available',
    offeredTo: EVERYONE,
    recommendedFor: EVERYONE,
    grants: ['compliance_reporting', 'quality_operations'],
    prd: '3G.1, 3H.4',
  },

  // ── Offered, off by default ───────────────────────────────────────
  {
    id: 'son',
    title: 'Keep SON certification current',
    description: 'MANCAP applications, NIS standards and quarterly SON inspections.',
    iconName: 'access/regulator',
    state: 'available',
    offeredTo: EVERYONE,
    //  MANCAP is a standards-organisation scheme, so a food and
    //  beverage maker is the one who usually holds it. A pharmaceutical
    //  manufacturer is offered it, unticked, because some do.
    recommendedFor: ['food'],
    grants: ['compliance_reporting'],
    prd: '3A',
  },
  {
    id: 'import-permits',
    title: 'Track import permits',
    description: 'Permits for imported materials and finished products.',
    iconName: 'regulatory/import-permit',
    state: 'available',
    offeredTo: EVERYONE,
    recommendedFor: ['importer'],
    grants: ['compliance_reporting'],
    prd: '3A',
  },

  // ── Coming later: the deliberate MVP exclusions ───────────────────
  //  PV, supplier portal, allergens and recall. Dashed, no checkbox,
  //  draft badge — "nothing on screen looks functional when it is not".
  {
    id: 'pharmacovigilance',
    title: 'Report adverse drug reactions',
    description: 'Pharmacovigilance case handling and NAFDAC ADR reporting.',
    iconName: 'quality/risk',
    state: 'coming-later',
    //  All four coming-later areas are offered to everyone. J9.1 is
    //  about not OFFERING an irrelevant module, and these are offered
    //  to nobody — they are the roadmap, which the notes give as one
    //  set ("PV, supplier portal, allergens, recall") and the design
    //  shows in full on the pharmaceutical screen.
    offeredTo: EVERYONE,
    recommendedFor: [],
    grants: [],
    prd: '—',
  },
  {
    id: 'supplier-portal',
    title: 'Qualify suppliers through a portal',
    description: 'Supplier assessments and a portal suppliers use themselves.',
    iconName: 'nav/supplier-qual',
    state: 'coming-later',
    offeredTo: EVERYONE,
    recommendedFor: [],
    grants: [],
    prd: '—',
  },
  {
    id: 'allergens',
    title: 'Allergen controls',
    description: 'Allergen register, segregation and production sequencing.',
    iconName: 'quality/environmental',
    state: 'coming-later',
    offeredTo: EVERYONE,
    recommendedFor: [],
    grants: [],
    prd: '—',
  },
  {
    id: 'recalls',
    title: 'Recalls and complaints',
    description: 'Recall scoping and complaint handling, linked to batches.',
    iconName: 'quality/crisis',
    state: 'coming-later',
    offeredTo: EVERYONE,
    recommendedFor: [],
    grants: [],
    prd: '—',
  },
];

/** Everything this industry is allowed to see, in any section. */
export function areasForIndustry(industryId: string): OnboardingArea[] {
  return ONBOARDING_AREAS.filter((a) => a.offeredTo.includes(industryId));
}

/** The three sections of the screen, in order. */
export function sectionsForIndustry(industryId: string): {
  recommended: OnboardingArea[];
  alsoAvailable: OnboardingArea[];
  comingLater: OnboardingArea[];
} {
  const offered = areasForIndustry(industryId);
  return {
    recommended: offered.filter(
      (a) => a.state === 'available' && a.recommendedFor.includes(industryId)),
    alsoAvailable: offered.filter(
      (a) => a.state === 'available' && !a.recommendedFor.includes(industryId)),
    comingLater: offered.filter((a) => a.state === 'coming-later'),
  };
}

/** Ticked when the screen first opens. */
export function defaultAreasFor(industryId: string): string[] {
  return sectionsForIndustry(industryId).recommended.map((a) => a.id);
}

/**
 * The permission bundles a set of areas unlocks.
 *
 * A coming-later area grants nothing, and could not be ticked anyway.
 * Duplicates are collapsed, because several areas share a bundle.
 */
export function modulesForAreas(areaIds: readonly string[]): ModuleKey[] {
  const keys = new Set<ModuleKey>();
  for (const id of areaIds) {
    const area = ONBOARDING_AREAS.find((a) => a.id === id);
    if (!area || area.state !== 'available') continue;
    for (const k of area.grants) keys.add(k);
  }
  return [...keys];
}

/** The line under the footer: "8 areas switched on." */
export function switchedOnLine(count: number): string {
  return `${count} ${count === 1 ? 'area' : 'areas'} switched on. ` +
    'You can change this any time in Company Settings › Modules.';
}

/**
 * The heading over the first section, which names the industry.
 *
 * Takes the industry's `plural` rather than pluralising its title:
 * "pharmaceutical manufacturing" + "s" is not a word, and the design
 * says "Recommended for pharmaceutical manufacturers".
 */
export function recommendedHeading(industryPlural: string): string {
  return `Recommended for ${industryPlural}`;
}
