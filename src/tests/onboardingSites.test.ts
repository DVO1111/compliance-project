/**
 * ONB-03's rules, which are the kind that go wrong silently.
 *
 * Three things on this screen are claims about what the product will do
 * later, and a claim that drifts out of step with the thing it describes
 * is worse than no claim at all:
 *
 *   - the numbering preview says what a document raised by a department
 *     will be called;
 *   - the product categories are written straight into products.category,
 *     which carries a CHECK constraint naming exactly nine values;
 *   - the "at least one manufacturing site or warehouse" rule is read
 *     off the site type list, so adding a type cannot quietly change it.
 *
 * The import template is here for the same reason: its headings are the
 * columns rows will land in, and a template nobody can parse is a
 * promise broken before anyone has filled it in.
 */
import { describe, it, expect } from 'vitest';
import {
  SITE_TYPES, siteTypeBadge, PRODUCT_CATEGORIES, productCategoryLabel,
  SUGGESTED_DEPARTMENTS, DEPARTMENT_CODE_PATTERN, numberingPreview,
} from '../lib/onboarding/onboardingData';
import { buildImportTemplateCsv, TEMPLATE_SECTIONS } from '../lib/onboarding/importTemplate';
import { completedFromState, EMPTY_SETUP_STATE } from '../lib/onboarding/setupSteps';

describe('site types', () => {
  it('offers the two the screen asks for, and counts only those', () => {
    const counting = SITE_TYPES.filter((t) => t.countsTowardMinimum).map((t) => t.id);
    expect(counting).toEqual(['manufacturing', 'warehouse']);
  });

  //  A site that is neither a factory nor a warehouse must still be
  //  nameable, rather than being mislabelled as one of them.
  it('has somewhere to put a laboratory and an office', () => {
    expect(SITE_TYPES.map((t) => t.id)).toContain('laboratory');
    expect(SITE_TYPES.map((t) => t.id)).toContain('office');
  });

  it('every id matches the database CHECK on sites.site_type', () => {
    //  20261019000000_sites_and_department_codes.sql. A fifth type added
    //  here without the migration would be refused at save time, which
    //  is a crash on Continue rather than a message.
    expect(SITE_TYPES.map((t) => t.id).sort())
      .toEqual(['laboratory', 'manufacturing', 'office', 'warehouse']);
  });

  it('badges are the upper-case form shown on the card', () => {
    expect(siteTypeBadge('manufacturing')).toBe('MANUFACTURING');
    expect(siteTypeBadge('warehouse')).toBe('WAREHOUSE');
  });

  //  A site stored before a type was renamed must still render as
  //  something, not as an empty badge.
  it('an unknown type still shows a badge', () => {
    expect(siteTypeBadge('cold_store')).toBe('COLD_STORE');
  });
});

describe('product categories', () => {
  //  These ids go into products.category, whose CHECK names exactly
  //  these nine. A tenth invented on the screen is a save that fails.
  it('are the nine the products table accepts', () => {
    expect(PRODUCT_CATEGORIES.map((c) => c.id).sort()).toEqual([
      'agro_chemical', 'biologic_vaccine', 'cosmetic', 'drug_pharmaceutical',
      'food', 'herbal_nutraceutical', 'medical_device', 'other', 'veterinary',
    ]);
  });

  //  Called out by the notes (A2.2) because the generic lists omit it,
  //  and it is a large part of what NAFDAC regulates.
  it('include herbal / nutraceutical', () => {
    expect(productCategoryLabel('herbal_nutraceutical')).toBe('Herbal / nutraceutical');
  });

  it('lead with what the design puts first', () => {
    expect(PRODUCT_CATEGORIES.slice(0, 2).map((c) => c.label))
      .toEqual(['Drug / pharmaceutical', 'Herbal / nutraceutical']);
  });
});

describe('departments and the numbers they issue', () => {
  it('suggests the six on the screen, with their codes', () => {
    expect(SUGGESTED_DEPARTMENTS.map((d) => `${d.name} · ${d.code}`)).toEqual([
      'Quality Assurance · QA',
      'Quality Control · QC',
      'Production · PRD',
      'Regulatory Affairs · RA',
      'Warehouse · WH',
      'Engineering · ENG',
    ]);
  });

  it('every suggested code is one the database will accept', () => {
    for (const d of SUGGESTED_DEPARTMENTS) {
      expect(DEPARTMENT_CODE_PATTERN.test(d.code)).toBe(true);
    }
  });

  it('refuses the codes that would split one series into two', () => {
    expect(DEPARTMENT_CODE_PATTERN.test('qa')).toBe(false);     // CC-qa- beside CC-QA-
    expect(DEPARTMENT_CODE_PATTERN.test('Q-A')).toBe(false);    // a hyphen is the separator
    expect(DEPARTMENT_CODE_PATTERN.test('Q')).toBe(false);      // too short to read
    expect(DEPARTMENT_CODE_PATTERN.test('REGULATORY')).toBe(false);
    expect(DEPARTMENT_CODE_PATTERN.test('QA1')).toBe(true);
  });

  it('previews exactly what the design shows, from the six suggestions', () => {
    //  CC-QA-2026-0001 · SOP-PRD-2026-0001, with all six ticked. The
    //  SOP line names Production rather than the second chip, because a
    //  standard operating procedure belongs to the department doing the
    //  work — and the design says so.
    expect(numberingPreview(SUGGESTED_DEPARTMENTS.map((d) => d.code), 2026))
      .toEqual(['CC-QA-2026-0001', 'SOP-PRD-2026-0001']);
  });

  //  THE ONE THAT MATTERS. Untick Quality Assurance and the preview must
  //  stop saying CC-QA-, because that series will not exist.
  it('follows the selection rather than the suggestions', () => {
    expect(numberingPreview(['RA', 'WH'], 2026))
      .toEqual(['CC-RA-2026-0001', 'SOP-WH-2026-0001']);
  });

  it('shows nothing when nothing is chosen', () => {
    expect(numberingPreview([], 2026)).toEqual([]);
  });

  //  One department is a real state — it is the first chip anyone ticks.
  it('uses the single code for both lines when there is only one', () => {
    expect(numberingPreview(['QA'], 2026))
      .toEqual(['CC-QA-2026-0001', 'SOP-QA-2026-0001']);
  });
});

describe('the step ticks on a site, not on a department', () => {
  //  Departments arrive pre-ticked from the suggestions. If the hub
  //  ticked on them, step 3 would be marked done for a workspace that
  //  has entered nothing at all.
  it('is not done when only departments exist', () => {
    const done = completedFromState({
      ...EMPTY_SETUP_STATE,
      departments: [{ id: 'd1', name: 'Quality Assurance' }],
    });
    expect(done['sites-departments']).toBe(false);
  });

  it('is done once a site is stored', () => {
    const done = completedFromState({ ...EMPTY_SETUP_STATE, siteCount: 1 });
    expect(done['sites-departments']).toBe(true);
  });
});

describe('the import template', () => {
  const csv = buildImportTemplateCsv();

  it('covers the three record types the notes name', () => {
    expect(TEMPLATE_SECTIONS.map((s) => s.title)).toEqual(['PRODUCTS', 'LICENCES', 'OPEN CAPAS']);
  });

  it('names real columns on the tables the rows land in', () => {
    const products = TEMPLATE_SECTIONS[0].columns.map((c) => c.name);
    expect(products).toContain('product_code');
    expect(products).toContain('trade_name');
    expect(products).toContain('category');

    const capas = TEMPLATE_SECTIONS[2].columns.map((c) => c.name);
    expect(capas).toContain('capa_number');
    expect(capas).toContain('capa_type');
  });

  //  The category column's note lists the accepted values. Generated
  //  from PRODUCT_CATEGORIES so it cannot fall out of step with the
  //  chips on the screen above it.
  it('tells people which categories are accepted', () => {
    const category = TEMPLATE_SECTIONS[0].columns.find((c) => c.name === 'category');
    for (const c of PRODUCT_CATEGORIES) {
      expect(category?.note).toContain(c.id);
    }
  });

  it('says plainly that downloading it uploads nothing', () => {
    expect(csv).toMatch(/not switched on yet/i);
  });

  //  A template that broke a CSV parser would be a poor advertisement
  //  for row validation. Every heading row must have the same number of
  //  cells as its section has columns.
  it('is a CSV a parser can read', () => {
    const rows = csv.split('\r\n');
    for (const section of TEMPLATE_SECTIONS) {
      const heading = section.columns.map((c) => c.name).join(',');
      expect(rows).toContain(heading);
      expect(heading.split(',')).toHaveLength(section.columns.length);
    }
  });

  it('uses CRLF, which is what spreadsheet software expects', () => {
    expect(csv).toContain('\r\n');
  });
});
