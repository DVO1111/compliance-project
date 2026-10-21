/**
 * What a product's lifecycle stage permits — W2·11, PR-01 and PR-02.
 *
 * The notes frame states the requirement twice, once as a feature and
 * once as a thing to verify:
 *
 *   "Product registry view showing lifecycle stage and what it
 *    permits: PR-01 adds a 'What it permits' column (allowed / blocked
 *    with reason / limited) and a 'What each stage permits' strip."
 *
 *   "VERIFY: no action unavailable without an explanation. Every
 *    blocked row and the disabled Start batch carry the reason and a
 *    next step."
 *
 * So this module's whole job is that no caller can render "blocked"
 * without also having the reason to render beside it. `Permit` makes
 * that structural: the blocked and limited shapes carry a `reason`
 * field that is not optional, so a screen cannot show the state
 * without the explanation — the same approach as
 * eligibilityReason in productService, which this builds on rather
 * than duplicating.
 *
 * TWO GATES, NOT ONE. The stage gates downstream actions (L2.3) AND a
 * valid licence is required for batch start and release (A5.6, C2.8).
 * A Marketed product with an expired licence is blocked even though
 * its stage permits everything — which is exactly the case PR-02 and
 * BL-01 are drawn for, and why the licence has to be an input here.
 */

import type { ProductStatus } from '../productService';
import type { BadgeState } from '../../components/Common/StateBadge';

/** The five stages the design's strip names, in its order. */
export type ProductStage =
  | 'concept' | 'registration_pending' | 'registered' | 'marketed' | 'discontinued';

export interface StageDescription {
  stage: ProductStage;
  /** The words on the badge. */
  label: string;
  /** Which of the six state colours it takes. */
  badge: BadgeState;
  /** One line, from the design. */
  permits: string;
}

/**
 * The strip, verbatim from node 65:1650. The parenthesised references
 * are the PRD clauses the design cites and are kept: they are how
 * somebody checks the sentence against the requirement.
 */
export const STAGE_PERMITS: StageDescription[] = [
  {
    stage: 'concept', label: 'Concept · Development', badge: 'draft',
    permits: 'Formulation and pilot work. No batch release.',
  },
  {
    stage: 'registration_pending', label: 'Registration pending', badge: 'pending',
    permits: 'Application and dossier work. No batch release.',
  },
  {
    stage: 'registered', label: 'Registered', badge: 'released',
    permits: 'Batches can start and be released while the licence is valid.',
  },
  {
    stage: 'marketed', label: 'Marketed', badge: 'released',
    permits: 'Same as Registered. An expired licence blocks batches (A5.6).',
  },
  {
    stage: 'discontinued', label: 'Discontinued', badge: 'draft',
    permits: 'Also Withdrawn. No new batches; renewal alerts off (A5.3).',
  },
];

export const STAGE_FOOTNOTE =
  'Stage gates downstream actions (L2.3). A valid licence is also required for '
  + 'batch start and release (A5.6, C2.8).';

/**
 * products.status → the design's five stages.
 *
 * The product table has seven statuses and the strip shows five,
 * because two pairs mean the same thing to a person deciding whether
 * they may start a batch: preparation and submission are both
 * "registration pending", and suspended is a blocked Marketed rather
 * than a stage of its own. The mapping is here, once, rather than in
 * each screen.
 */
export function stageOf(status: ProductStatus): ProductStage {
  switch (status) {
    case 'concept':                return 'concept';
    case 'regulatory_preparation':
    case 'submitted':              return 'registration_pending';
    case 'registered':             return 'registered';
    case 'active':                 return 'marketed';
    //  Suspended is NOT discontinued: a suspension can be lifted and
    //  the renewal alerts stay on. It is marketed-but-blocked, and the
    //  permit below says so rather than filing it under a stage that
    //  would turn its alerts off.
    case 'suspended':              return 'marketed';
    case 'discontinued':           return 'discontinued';
  }
}

export function describeStage(status: ProductStatus): StageDescription {
  const stage = stageOf(status);
  const found = STAGE_PERMITS.find((s) => s.stage === stage)!;
  //  Suspended borrows Marketed's stage but not its badge or its
  //  sentence, because it permits nothing.
  if (status === 'suspended') {
    return {
      ...found, label: 'Suspended', badge: 'on_hold',
      permits: 'Suspended by the regulator or by the company. No new batches until it is lifted.',
    };
  }
  return found;
}

// ── What it permits, for one product ─────────────────────────────────

export type Permit =
  | { kind: 'allowed'; summary: string }
  /** Both of these carry a reason. It is not optional, by design. */
  | { kind: 'limited'; summary: string; reason: string; nextStep?: string }
  | { kind: 'blocked'; summary: string; reason: string; nextStep?: string };

/** What the caller knows about the licence a product depends on. */
export interface LicenceStanding {
  /** Absent when no licence is recorded at all. */
  name?: string;
  expiryDate?: string | null;
  /** True while a renewal is under way. */
  renewalInProgress?: boolean;
  /**
   * The configurable lift. "BL-02 shows the configurable lift while
   * renewal is in progress" — a company may allow batches to start
   * during a renewal, and whether it does is configuration, not code.
   */
  allowStartDuringRenewal?: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

/** Whole days until expiry; negative once past. */
export function daysUntil(date: string, now: Date = new Date()): number {
  const end = new Date(date + 'T00:00:00Z').getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - today) / DAY);
}

/**
 * The "What it permits" cell.
 *
 * Order matters: the stage is checked first because a Concept product
 * is blocked whatever its licence says, and reporting an expired
 * licence on a product that could not start a batch anyway would send
 * somebody to renew a licence that is not the problem.
 */
export function permitFor(
  status: ProductStatus,
  licence: LicenceStanding = {},
  now: Date = new Date(),
): Permit {
  const stage = stageOf(status);

  if (status === 'suspended') {
    return {
      kind: 'blocked',
      summary: 'No new batches',
      reason: 'The product is suspended.',
      nextStep: 'A suspension is lifted by the regulator or by whoever applied it.',
    };
  }

  if (stage === 'concept' || stage === 'registration_pending') {
    return {
      kind: 'blocked',
      summary: 'No batch release',
      reason: stage === 'concept'
        ? 'The product is still in development and has no registration.'
        : 'The registration has been applied for but not granted.',
      nextStep: 'Batches can start once the registration is granted.',
    };
  }

  if (stage === 'discontinued') {
    return {
      kind: 'blocked',
      summary: 'No new batches',
      reason: 'The product is discontinued.',
      nextStep: 'Renewal alerts are off for discontinued products.',
    };
  }

  //  Registered or Marketed. Now the licence decides.
  if (!licence.expiryDate) {
    return {
      kind: 'limited',
      summary: 'Batches allowed · expiry unknown',
      reason: licence.name
        ? `${licence.name} has no expiry date recorded.`
        : 'No licence expiry date is recorded for this product.',
      nextStep: 'Add the expiry date so renewal alerts can be worked out.',
    };
  }

  const left = daysUntil(licence.expiryDate, now);

  if (left < 0) {
    const expired = `${licence.name ?? 'The licence'} expired on ${licence.expiryDate}`;
    //  The configurable lift. Note it only applies to STARTING a batch;
    //  release still needs a valid licence, so this is 'limited' and
    //  never 'allowed'.
    if (licence.renewalInProgress && licence.allowStartDuringRenewal) {
      return {
        kind: 'limited',
        summary: 'Batches may start · release blocked',
        reason: `${expired}. A renewal is in progress and this workspace allows batches to start during renewal.`,
        nextStep: 'Release still requires the renewed licence.',
      };
    }
    return {
      kind: 'blocked',
      summary: 'No batches',
      reason: licence.renewalInProgress
        ? `${expired}. A renewal is in progress.`
        : `${expired}. No renewal has been started.`,
      nextStep: licence.renewalInProgress
        ? 'Batches resume when the renewed licence is recorded.'
        : 'Start the renewal from the licence record.',
    };
  }

  if (left <= 90) {
    return {
      kind: 'limited',
      summary: `Batches allowed · ${left} ${left === 1 ? 'day' : 'days'} left`,
      reason: `${licence.name ?? 'The licence'} expires on ${licence.expiryDate}.`,
      nextStep: licence.renewalInProgress
        ? 'A renewal is already in progress.'
        : 'Start the renewal before it expires.',
    };
  }

  return { kind: 'allowed', summary: 'Batches allowed' };
}

/** The badge colour a permit takes, so the column and the row agree. */
export function permitBadge(permit: Permit): BadgeState {
  return permit.kind === 'allowed' ? 'released'
    : permit.kind === 'limited' ? 'pending'
      : 'overdue';
}
