/**
 * ONB-06 and ONB-07.
 *
 * The starter records are the one part of onboarding that writes rows
 * into tables the rest of the product reads, so the failures worth
 * catching are the ones the database would reject at the last click of
 * setup — a category outside a CHECK constraint, a frequency that is
 * not one of the five allowed, a licence type that does not exist.
 * Every one of those turns "Finish setup" into an error message after
 * six steps of work.
 *
 * The other thing tested here is the promise the notes make about
 * licences: "renewal alerts begin only once a date exists". A seeded
 * expiry date would start a countdown against a date nobody checked.
 */
import { describe, it, expect } from 'vitest';
import {
  STARTER_RECORDS, STARTER_TABS, TAB_TABLE, starterRecordsFor, keptByDefault,
  starterSubtitle, STARTER_FOOTNOTE,
} from '../lib/onboarding/starterRecords';
import { INDUSTRIES } from '../lib/onboarding/onboardingData';

//  The CHECK constraints these rows are written against, copied from
//  the schema. A value added here that the database does not accept is
//  an insert that fails on the last click of setup.
const OBLIGATION_STATUS = ['identified', 'implemented', 'monitored'];
const FREQUENCY = ['weekly', 'monthly', 'quarterly', 'biannual', 'annual'];
const POLICY_CATEGORY = ['security', 'privacy', 'conduct', 'hr', 'finance', 'operational', 'other'];
const RISK_CATEGORY = ['security', 'privacy', 'operational', 'financial', 'legal', 'compliance'];
const RISK_LEVEL = ['low', 'medium', 'high', 'critical'];
const RISK_STATUS = ['identified', 'mitigating', 'monitored', 'closed'];
const LICENCE_TYPE = [
  'nafdac_product_registration', 'nafdac_site_manufacturing_licence',
  'nafdac_gmp_certificate', 'nafdac_import_permit', 'son_mancap_approval',
  'son_nis_certification', 'ministry_health_licence', 'other',
];
const LICENCE_STATUS = [
  'draft', 'active', 'renewal_due', 'renewal_in_progress',
  'renewed', 'expired', 'suspended', 'discontinued',
];

describe('every starter record is one the database will accept', () => {
  it('obligations carry a valid status and, where set, a valid frequency', () => {
    for (const r of STARTER_RECORDS.filter((x) => x.tab === 'obligations')) {
      expect(OBLIGATION_STATUS).toContain(r.write.status);
      if (r.write.frequency !== undefined) {
        expect(FREQUENCY).toContain(r.write.frequency);
      }
    }
  });

  //  regulatory_obligations.description is NOT NULL. A row without one
  //  fails the insert, and the whole tab goes with it.
  it('every obligation has a description', () => {
    for (const r of STARTER_RECORDS.filter((x) => x.tab === 'obligations')) {
      expect(String(r.write.description ?? '').length).toBeGreaterThan(20);
    }
  });

  it('licences carry a real licence type and status', () => {
    for (const r of STARTER_RECORDS.filter((x) => x.tab === 'licences')) {
      expect(LICENCE_TYPE).toContain(r.write.licence_type);
      expect(LICENCE_STATUS).toContain(r.write.status);
    }
  });

  it('policies carry a category the policies table allows', () => {
    for (const r of STARTER_RECORDS.filter((x) => x.tab === 'policies')) {
      expect(POLICY_CATEGORY).toContain(r.write.category);
    }
  });

  it('risks carry a valid category, level and status', () => {
    for (const r of STARTER_RECORDS.filter((x) => x.tab === 'risks')) {
      expect(RISK_CATEGORY).toContain(r.write.risk_category);
      expect(RISK_LEVEL).toContain(r.write.risk_level);
      expect(RISK_STATUS).toContain(r.write.status);
    }
  });
});

describe('what the notes forbid', () => {
  //  "Licences rows show 'Add expiry date', and renewal alerts (A5.1)
  //  begin only once a date exists." A seeded date starts a countdown
  //  against something nobody has checked.
  it('no licence is seeded with an expiry date', () => {
    for (const r of STARTER_RECORDS.filter((x) => x.tab === 'licences')) {
      expect(r.write.expiry_date).toBeUndefined();
      expect(r.write.issue_date).toBeUndefined();
    }
  });

  it('every licence row tells you to add one', () => {
    const dated = STARTER_RECORDS.filter((x) => x.tab === 'licences' && !x.optional);
    for (const r of dated) {
      expect(r.detail).toBe('Add expiry date');
    }
  });

  //  "'Starter' uses badge/state draft, because these records are
  //  unowned until assigned."
  it('nothing is seeded with an owner', () => {
    for (const r of STARTER_RECORDS) {
      expect(r.write.owner_id).toBeUndefined();
      expect(r.write.due_date).toBeUndefined();
    }
  });

  //  "VERIFY: seed templates contain real content, not placeholders."
  it('no row is a placeholder', () => {
    for (const r of STARTER_RECORDS) {
      expect(r.title).not.toMatch(/lorem|placeholder|example|tbd|xxx|^(policy|risk|obligation) \d/i);
      expect(r.title.length).toBeGreaterThan(8);
    }
  });
});

describe('the four tabs', () => {
  it('are the four the design shows, in order', () => {
    expect(STARTER_TABS.map((t) => t.label))
      .toEqual(['Obligations', 'Licences', 'Policies', 'Risks']);
  });

  it('each tab writes to one real table', () => {
    expect(TAB_TABLE).toEqual({
      obligations: 'regulatory_obligations',
      licences: 'regulatory_licences',
      policies: 'policies',
      risks: 'risks',
    });
  });

  it('every record belongs to one of them', () => {
    const ids = STARTER_TABS.map((t) => t.id);
    for (const r of STARTER_RECORDS) expect(ids).toContain(r.tab);
  });

  it('every industry has rows on every tab', () => {
    //  An empty tab reads as a loading failure, and the tab strip would
    //  offer somewhere with nothing in it.
    for (const i of INDUSTRIES) {
      for (const t of STARTER_TABS) {
        expect(starterRecordsFor(i.id).filter((r) => r.tab === t.id).length)
          .toBeGreaterThan(0);
      }
    }
  });
});

describe('what a pharmaceutical workspace starts with', () => {
  it('the obligations are the six on the screen, in order', () => {
    expect(starterRecordsFor('pharma').filter((r) => r.tab === 'obligations').map((r) => r.title))
      .toEqual([
        'NAFDAC GMP: keep the site inspection-ready',
        'Product registration renewal',
        'PCN premises registration renewal',
        'Superintendent pharmacist practising licence',
        'Annual product quality review',
        'SON MANCAP certificate renewal',
      ]);
  });

  //  The design shows this one in the Removed state, and the reason is
  //  real: not everybody holds MANCAP, and an obligation nobody owes is
  //  noise on the dashboard from day one.
  it('MANCAP starts removed, and everything else starts kept', () => {
    const kept = keptByDefault('pharma');
    expect(kept).not.toContain('ob-son-mancap');
    expect(kept).toContain('ob-gmp-inspection-ready');
    expect(kept).toContain('ob-pcn-premises');
  });

  //  PCN registers premises and pharmacists. A food manufacturer has
  //  neither, and a row about a superintendent pharmacist on their
  //  screen would be the clearest possible sign the template is generic.
  it('PCN rows are not shown to a food manufacturer', () => {
    const food = starterRecordsFor('food').map((r) => r.id);
    expect(food).not.toContain('ob-pcn-premises');
    expect(food).not.toContain('ob-superintendent-licence');
    expect(food).not.toContain('lc-superintendent');
  });

  it('an importer gets no manufacturing licence row', () => {
    const importer = starterRecordsFor('importer').map((r) => r.id);
    expect(importer).not.toContain('lc-manufacturing');
    expect(importer).not.toContain('lc-gmp-certificate');
    //  …but still needs product registrations and an import permit.
    expect(importer).toContain('ob-product-registration-renewal');
    expect(importer).toContain('lc-import-permit');
  });
});

describe('the copy', () => {
  it('names the template the rows came from', () => {
    const pharma = INDUSTRIES.find((i) => i.id === 'pharma')!;
    expect(starterSubtitle(pharma.title))
      .toBe('From the pharmaceutical manufacturing template. Keep what applies to you, '
        + 'remove what doesn’t, and fill in details later.');
  });

  it('says when renewal alerts start', () => {
    expect(STARTER_FOOTNOTE).toMatch(/renewal alerts start once a date is set/);
  });
});
