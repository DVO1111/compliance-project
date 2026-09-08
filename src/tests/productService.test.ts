/**
 * Product Registry — service-layer unit tests.
 *
 * These cover the parts that are pure TypeScript: eligibility reasoning,
 * the controlled-substance relevance rule, CTD administrative document
 * selection, and category vocabulary completeness. Anything that is
 * actually a database property — the code uniqueness rule, the status
 * mirror, the batch release gate — is tested for real in
 * `supabase/tests/product_registry_test.sql`, because asserting it
 * against a mock would prove nothing.
 */

import { describe, it, expect } from 'vitest';
import {
  isReleaseEligible,
  eligibilityReason,
  requiresControlledSubstancePrompt,
  getCtdAdministrativeDocuments,
  CTD_ADMINISTRATIVE_DOCUMENTS,
  PRODUCT_STATUS_LABELS,
  MANUFACTURING_TYPE_LABELS,
  type ProductStatus,
} from '../lib/productService';
import {
  PRODUCT_CATEGORY_LABELS,
  getChecklist,
  getLabellingRequirements,
  type ProductCategory,
} from '../lib/regulatoryAffairsService';

const FUTURE = '2099-01-01';
const PAST = '2000-01-01';

describe('product eligibility', () => {
  it.each<[ProductStatus, boolean]>([
    ['concept', false],
    ['regulatory_preparation', false],
    ['submitted', false],
    ['registered', true],
    ['active', true],
    ['suspended', false],
    ['discontinued', false],
  ])('%s is eligible: %s', (status, expected) => {
    expect(isReleaseEligible({ status, registration_expiry_date: null })).toBe(expected);
  });

  it('an expired registration is not eligible even when active', () => {
    expect(isReleaseEligible({ status: 'active', registration_expiry_date: PAST })).toBe(false);
  });

  it('a future expiry is eligible', () => {
    expect(isReleaseEligible({ status: 'active', registration_expiry_date: FUTURE })).toBe(true);
  });

  it('no expiry date means no expiry constraint', () => {
    expect(isReleaseEligible({ status: 'registered', registration_expiry_date: null })).toBe(true);
  });

  it('explains why an ineligible product is blocked', () => {
    expect(eligibilityReason({ status: 'suspended', registration_expiry_date: null }))
      .toContain('suspended');
    expect(eligibilityReason({ status: 'discontinued', registration_expiry_date: null }))
      .toContain('discontinued');
    expect(eligibilityReason({ status: 'concept', registration_expiry_date: null }))
      .toContain('not yet registered');
    expect(eligibilityReason({ status: 'active', registration_expiry_date: PAST }))
      .toContain('expired');
  });

  it('gives no reason when the product is eligible', () => {
    expect(eligibilityReason({ status: 'active', registration_expiry_date: null })).toBeNull();
  });
});

describe('controlled substances are asked about only where relevant', () => {
  it.each<[ProductCategory, boolean]>([
    ['drug_pharmaceutical', true],
    ['veterinary', true],
    ['biologic_vaccine', true],
    // food must prompt: a drugs-only prompt is an acceptance failure
    ['food', true],
    ['herbal_nutraceutical', true],
    ['cosmetic', false],
    ['agro_chemical', false],
    ['medical_device', false],
    ['other', false],
  ])('%s prompts: %s', (category, expected) => {
    expect(requiresControlledSubstancePrompt(category)).toBe(expected);
  });
});

describe('CTD administrative documents', () => {
  it('omits the controlled-substance permit for an ordinary product', () => {
    const docs = getCtdAdministrativeDocuments({
      is_controlled_substance: false, manufacturing_type: 'in_house',
    });
    expect(docs.find((d) => d.key === 'controlled_substance_permit')).toBeUndefined();
  });

  it('includes it when the product declares a controlled substance', () => {
    const docs = getCtdAdministrativeDocuments({
      is_controlled_substance: true, manufacturing_type: 'in_house',
    });
    expect(docs.find((d) => d.key === 'controlled_substance_permit')).toBeDefined();
  });

  it('asks for a power of attorney only on imported products', () => {
    const local = getCtdAdministrativeDocuments({
      is_controlled_substance: false, manufacturing_type: 'in_house',
    });
    const imported = getCtdAdministrativeDocuments({
      is_controlled_substance: false, manufacturing_type: 'imported',
    });
    expect(local.find((d) => d.key === 'power_of_attorney')).toBeUndefined();
    expect(imported.find((d) => d.key === 'power_of_attorney')).toBeDefined();
  });

  it('marks the reusable company-level documents as company scope', () => {
    // this is what stops a CAC certificate being re-uploaded per product
    const companyScoped = CTD_ADMINISTRATIVE_DOCUMENTS
      .filter((d) => d.scope === 'company').map((d) => d.key);
    expect(companyScoped).toContain('cac_certificate');
    expect(companyScoped).toContain('manufacturing_licence');
    expect(companyScoped).toContain('gmp_certificate');
  });

  it('keeps product-specific documents at product scope', () => {
    const productScoped = CTD_ADMINISTRATIVE_DOCUMENTS
      .filter((d) => d.scope === 'product').map((d) => d.key);
    expect(productScoped).toContain('labelling_artwork');
    expect(productScoped).toContain('cover_letter');
  });
});

describe('herbal_nutraceutical is a first-class category', () => {
  it('has a display label', () => {
    expect(PRODUCT_CATEGORY_LABELS.herbal_nutraceutical).toBe('Herbal / Nutraceutical');
  });

  it('has a local-manufacture checklist with the herbal-specific tests', () => {
    const items = getChecklist('herbal_nutraceutical', 'local_manufacture');
    expect(items.length).toBeGreaterThan(0);
    const names = items.map((i) => i.name);
    expect(names).toContain('Heavy Metal Analysis Report');
    expect(names).toContain('Microbial Limit Test Report');
    expect(names).toContain('Safety and Efficacy Evidence');
  });

  it('has an importation checklist requiring a power of attorney', () => {
    const items = getChecklist('herbal_nutraceutical', 'importation');
    expect(items.map((i) => i.name)).toContain('Power of Attorney');
  });

  it('has labelling requirements including the mandatory herbal advisory', () => {
    const fields = getLabellingRequirements('herbal_nutraceutical').map((r) => r.field);
    expect(fields).toContain('Botanical names of all constituents');
    expect(fields.some((f) => f.includes('advisory'))).toBe(true);
  });

  it('did not disturb the existing categories', () => {
    expect(getChecklist('food', 'local_manufacture').length).toBeGreaterThan(0);
    expect(getChecklist('drug_pharmaceutical', 'importation').length).toBeGreaterThan(0);
    expect(getLabellingRequirements('cosmetic').length).toBeGreaterThan(0);
  });
});

describe('display vocabularies are complete', () => {
  it('every product status has a label', () => {
    const statuses: ProductStatus[] = [
      'concept', 'regulatory_preparation', 'submitted',
      'registered', 'active', 'suspended', 'discontinued',
    ];
    for (const s of statuses) expect(PRODUCT_STATUS_LABELS[s]).toBeTruthy();
  });

  it('every manufacturing arrangement has a label', () => {
    expect(MANUFACTURING_TYPE_LABELS.in_house).toBeTruthy();
    expect(MANUFACTURING_TYPE_LABELS.contract_manufactured).toBeTruthy();
    expect(MANUFACTURING_TYPE_LABELS.imported).toBeTruthy();
  });
});
