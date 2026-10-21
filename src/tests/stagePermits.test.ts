/**
 * What a product's stage permits — W2·11.
 *
 * The notes frame's VERIFY line is the specification these are written
 * against: "no action unavailable without an explanation. Every blocked
 * row and the disabled Start batch carry the reason and a next step."
 *
 * The last test is the one that matters: it walks every status against
 * every licence standing and asserts that nothing is ever blocked or
 * limited without a reason. The type makes that structurally true, so
 * the test is really checking that no future edit widens the type to
 * make `reason` optional.
 */
import { describe, it, expect } from 'vitest';
import {
  stageOf, describeStage, permitFor, permitBadge, daysUntil,
  STAGE_PERMITS, type LicenceStanding,
} from '../lib/products/stagePermits';
import type { ProductStatus } from '../lib/productService';

const ALL: ProductStatus[] = [
  'concept', 'regulatory_preparation', 'submitted',
  'registered', 'active', 'suspended', 'discontinued',
];

const on = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const TODAY = on(2026, 10, 19);
const date = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

describe('the five stages', () => {
  it('are the five the design strip names, in its order', () => {
    expect(STAGE_PERMITS.map((s) => s.stage)).toEqual([
      'concept', 'registration_pending', 'registered', 'marketed', 'discontinued',
    ]);
  });

  //  Seven statuses, five stages: preparation and submission both read
  //  as "registration pending" to somebody deciding whether they may
  //  start a batch.
  it('fold the two pre-approval statuses together', () => {
    expect(stageOf('regulatory_preparation')).toBe('registration_pending');
    expect(stageOf('submitted')).toBe('registration_pending');
  });

  //  A suspension can be lifted and its renewal alerts stay on, so
  //  filing it under Discontinued would turn off alerts for a product
  //  that still needs them.
  it('do not treat suspended as discontinued', () => {
    expect(stageOf('suspended')).not.toBe('discontinued');
    expect(describeStage('suspended').label).toBe('Suspended');
    expect(describeStage('suspended').badge).toBe('on_hold');
  });

  it('give every status a stage and a sentence', () => {
    for (const s of ALL) {
      const d = describeStage(s);
      expect(d.label, s).toBeTruthy();
      expect(d.permits, s).toBeTruthy();
    }
  });
});

describe('what a product permits', () => {
  const valid: LicenceStanding = { name: 'NAFDAC A4-100', expiryDate: date(2027, 6, 30) };

  it('allows batches on a registered product with a licence well in date', () => {
    const p = permitFor('registered', valid, TODAY);
    expect(p.kind).toBe('allowed');
    expect(permitBadge(p)).toBe('released');
  });

  //  The stage is checked before the licence: reporting an expired
  //  licence on a Concept product would send somebody to renew a
  //  licence that is not what is stopping them.
  it('blames the stage, not the licence, before registration', () => {
    const expired: LicenceStanding = { name: 'NAFDAC A4-100', expiryDate: date(2020, 1, 1) };
    const p = permitFor('concept', expired, TODAY);
    expect(p.kind).toBe('blocked');
    if (p.kind === 'blocked') {
      expect(p.reason).toMatch(/development/i);
      expect(p.reason).not.toMatch(/expired/i);
    }
  });

  it('blocks a marketed product whose licence has expired, and says when', () => {
    const p = permitFor('active', { name: 'NAFDAC A4-100', expiryDate: date(2026, 9, 30) }, TODAY);
    expect(p.kind).toBe('blocked');
    if (p.kind === 'blocked') {
      expect(p.reason).toContain('2026-09-30');
      expect(p.reason).toMatch(/no renewal has been started/i);
      expect(p.nextStep).toMatch(/start the renewal/i);
    }
  });

  it('says so when a renewal is already under way', () => {
    const p = permitFor('active', {
      name: 'NAFDAC A4-100', expiryDate: date(2026, 9, 30), renewalInProgress: true,
    }, TODAY);
    expect(p.kind).toBe('blocked');
    if (p.kind === 'blocked') expect(p.reason).toMatch(/renewal is in progress/i);
  });

  //  "BL-02 shows the configurable lift while renewal is in progress."
  //  It lifts the START of a batch and never its RELEASE, so the result
  //  is limited rather than allowed.
  it('lifts the block for starting a batch when the workspace allows it, but not for release', () => {
    const p = permitFor('active', {
      name: 'NAFDAC A4-100', expiryDate: date(2026, 9, 30),
      renewalInProgress: true, allowStartDuringRenewal: true,
    }, TODAY);
    expect(p.kind).toBe('limited');
    if (p.kind === 'limited') {
      expect(p.summary).toMatch(/release blocked/i);
      expect(p.nextStep).toMatch(/release still requires/i);
    }
  });

  it('warns inside the renewal window without blocking', () => {
    const p = permitFor('registered', { name: 'L', expiryDate: date(2026, 12, 1) }, TODAY);
    expect(p.kind).toBe('limited');
    if (p.kind === 'limited') expect(p.summary).toMatch(/43 days left/);
  });

  //  A licence with no expiry date is not treated as expired. It may
  //  genuinely have none, and stopping a line over a blank field would
  //  refuse manufacture for a data-entry gap.
  it('treats a missing expiry date as unknown, not as expired', () => {
    const p = permitFor('active', { name: 'L', expiryDate: null }, TODAY);
    expect(p.kind).toBe('limited');
    if (p.kind === 'limited') expect(p.nextStep).toMatch(/add the expiry date/i);
  });

  it('counts the expiry date itself as still valid', () => {
    const p = permitFor('registered', { name: 'L', expiryDate: date(2026, 10, 19) }, TODAY);
    expect(p.kind).toBe('limited');
  });

  it('blocks a suspended product whatever its licence says', () => {
    const p = permitFor('suspended', valid, TODAY);
    expect(p.kind).toBe('blocked');
    if (p.kind === 'blocked') expect(p.reason).toMatch(/suspended/i);
  });

  it('turns renewal alerts off for a discontinued product', () => {
    const p = permitFor('discontinued', valid, TODAY);
    expect(p.kind).toBe('blocked');
    if (p.kind === 'blocked') expect(p.nextStep).toMatch(/renewal alerts are off/i);
  });

  //  THE VERIFY LINE, exhaustively.
  it('never withholds an action without an explanation', () => {
    const standings: LicenceStanding[] = [
      {},
      { name: 'L', expiryDate: null },
      { name: 'L', expiryDate: date(2020, 1, 1) },
      { name: 'L', expiryDate: date(2020, 1, 1), renewalInProgress: true },
      { name: 'L', expiryDate: date(2020, 1, 1), renewalInProgress: true, allowStartDuringRenewal: true },
      { name: 'L', expiryDate: date(2026, 11, 1) },
      { name: 'L', expiryDate: date(2030, 1, 1) },
    ];
    for (const status of ALL) {
      for (const licence of standings) {
        const p = permitFor(status, licence, TODAY);
        expect(p.summary, `${status}`).toBeTruthy();
        if (p.kind !== 'allowed') {
          expect(p.reason, `${status} / ${JSON.stringify(licence)}`).toBeTruthy();
        }
      }
    }
  });
});

describe('daysUntil', () => {
  it('is zero on the day itself and negative after', () => {
    expect(daysUntil(date(2026, 10, 19), TODAY)).toBe(0);
    expect(daysUntil(date(2026, 10, 20), TODAY)).toBe(1);
    expect(daysUntil(date(2026, 10, 18), TODAY)).toBe(-1);
  });

  //  Crossing a month and a leap year, because an off-by-one here
  //  silently mis-states every expiry on screen.
  it('counts across month and year boundaries', () => {
    expect(daysUntil(date(2026, 11, 1), on(2026, 10, 31))).toBe(1);
    expect(daysUntil(date(2028, 3, 1), on(2028, 2, 28))).toBe(2);
  });
});
