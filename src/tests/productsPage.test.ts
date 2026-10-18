/**
 * The product registry's rules — the ones the page depends on and would
 * otherwise only be checked by somebody looking at the screen.
 *
 * The one that matters most is release eligibility. A product that
 * cannot start a batch is the normal case on a new workspace, and the
 * page's job is to say WHY rather than leave a tick off. The binding
 * check lives in the batch_records trigger; these helpers exist so the
 * answer can be given before somebody tries and is refused at the
 * manufacturing stage.
 */
import { describe, it, expect } from 'vitest';
import {
  isReleaseEligible, eligibilityReason,
  requiresControlledSubstancePrompt, CONTROLLED_SUBSTANCE_CATEGORIES,
  PRODUCT_STATUS_LABELS, MANUFACTURING_TYPE_LABELS,
  type ProductStatus,
} from '../lib/productService';

const day = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const product = (status: ProductStatus, expiry: string | null = null) =>
  ({ status, registration_expiry_date: expiry });

describe('whether a batch may be started', () => {
  //  Registered or active, and not expired. Everything else is a no,
  //  and the no comes with a reason.
  it('allows a registered product with a future expiry', () => {
    expect(isReleaseEligible(product('registered', day(30)))).toBe(true);
    expect(isReleaseEligible(product('active', day(365)))).toBe(true);
  });

  //  No expiry date recorded is NOT treated as expired. The licence may
  //  genuinely have none, and refusing manufacture over a blank field
  //  would stop a line for a data-entry gap rather than a regulatory
  //  one. The dashboard's licence tile is where that gap is chased.
  it('allows a registered product with no expiry date recorded', () => {
    expect(isReleaseEligible(product('registered', null))).toBe(true);
    expect(eligibilityReason(product('registered', null))).toBeNull();
  });

  it('refuses a product whose registration has expired', () => {
    expect(isReleaseEligible(product('active', day(-1)))).toBe(false);
    expect(eligibilityReason(product('active', day(-1))))
      .toBe('The product registration has expired.');
  });

  //  Today is the last valid day, not the first invalid one. An expiry
  //  date is a date the licence is still good for.
  it('counts the expiry date itself as still valid', () => {
    expect(isReleaseEligible(product('registered', day(0)))).toBe(true);
  });

  it('refuses anything not yet registered, and names the state it is in', () => {
    for (const status of ['concept', 'regulatory_preparation', 'submitted'] as ProductStatus[]) {
      expect(isReleaseEligible(product(status))).toBe(false);
      expect(eligibilityReason(product(status)))
        .toBe(`The product is not yet registered (${PRODUCT_STATUS_LABELS[status]}).`);
    }
  });

  it('distinguishes suspended from discontinued', () => {
    expect(eligibilityReason(product('suspended'))).toBe('The product is suspended.');
    expect(eligibilityReason(product('discontinued'))).toBe('The product is discontinued.');
  });

  //  A reason exists for every refusal. A row that shows no tick and no
  //  explanation is the thing this page is meant not to do.
  it('never refuses without saying why', () => {
    const states: ProductStatus[] = [
      'concept', 'regulatory_preparation', 'submitted',
      'registered', 'active', 'suspended', 'discontinued',
    ];
    for (const status of states) {
      for (const expiry of [null, day(-1), day(30)]) {
        const p = product(status, expiry);
        if (!isReleaseEligible(p)) {
          expect(eligibilityReason(p), `${status}/${expiry}`).toBeTruthy();
        } else {
          expect(eligibilityReason(p), `${status}/${expiry}`).toBeNull();
        }
      }
    }
  });
});

describe('the controlled-substance prompt', () => {
  //  It appears for the categories where NAFDAC's remit makes the
  //  declaration meaningful, and nowhere else — the requirement is a
  //  relevant prompt, not a checkbox on every product.
  it('appears for ingestible categories, including food', () => {
    expect(requiresControlledSubstancePrompt('drug_pharmaceutical')).toBe(true);
    expect(requiresControlledSubstancePrompt('food')).toBe(true);
    expect(requiresControlledSubstancePrompt('veterinary')).toBe(true);
    expect(requiresControlledSubstancePrompt('biologic_vaccine')).toBe(true);
    expect(requiresControlledSubstancePrompt('herbal_nutraceutical')).toBe(true);
  });

  it('stays away from the categories where it would be noise', () => {
    expect(requiresControlledSubstancePrompt('cosmetic')).toBe(false);
    expect(requiresControlledSubstancePrompt('medical_device')).toBe(false);
    expect(requiresControlledSubstancePrompt('agro_chemical')).toBe(false);
    expect(requiresControlledSubstancePrompt('other')).toBe(false);
  });

  it('is driven by the list, not by a second copy of it', () => {
    for (const c of CONTROLLED_SUBSTANCE_CATEGORIES) {
      expect(requiresControlledSubstancePrompt(c)).toBe(true);
    }
  });
});

describe('the labels the page shows', () => {
  //  Every status the lifecycle engine can put a product in has a
  //  human label. A missing one renders as undefined in a badge.
  it('cover every status and every manufacturing type', () => {
    const states: ProductStatus[] = [
      'concept', 'regulatory_preparation', 'submitted',
      'registered', 'active', 'suspended', 'discontinued',
    ];
    for (const s of states) {
      expect(PRODUCT_STATUS_LABELS[s], s).toBeTruthy();
    }
    for (const m of ['in_house', 'contract_manufactured', 'imported'] as const) {
      expect(MANUFACTURING_TYPE_LABELS[m], m).toBeTruthy();
    }
  });
});
