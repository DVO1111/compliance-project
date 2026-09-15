/**
 * Licence Lifecycle — service-layer unit tests.
 *
 * These cover the parts that are pure TypeScript: the alert-schedule
 * expansion, the minor/major classification rule, and the parity between
 * the 12-step renewal template shipped in `licenseService.ts` and the
 * one seeded into the database by 20260921000000.
 *
 * Anything that is actually a database property — the alert generator,
 * the approval cascade's five audit rows, the batch gate, the status
 * mirrors — is tested for real in
 * `supabase/tests/licence_lifecycle_test.sql`, because asserting it
 * against a mock would prove nothing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  expandAlertMilestones,
  describeMilestone,
  variationMinimumClass,
  isVariationClassTooLow,
  missingMajorVariationFields,
  MAJOR_ONLY_VARIATION_TYPES,
  VARIATION_TYPE_LABELS,
  LICENCE_STATUS_LABELS,
  DEFAULT_ALERT_MONTHS,
  DEFAULT_MONTHLY_FROM_MONTH,
  type VariationType,
  type LicenceStatus,
} from '../lib/licenceService';
// Imported from the pure data module, not from licenseService: that one
// reaches the Supabase client through auditService, which throws at module
// load without VITE_SUPABASE_*. licenseService re-exports this constant, so
// the two are the same object.
import { NAFDAC_2026_RENEWAL_TASKS } from '../lib/renewalTemplate';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../supabase/migrations/20260921000000_licence_lifecycle.sql');

describe('renewal alert schedule', () => {
  it('expands the shipped default to 12, 6, 3, then monthly', () => {
    expect(expandAlertMilestones()).toEqual([12, 6, 3, 2, 1, 0]);
  });

  it('uses the same defaults the database does', () => {
    expect(DEFAULT_ALERT_MONTHS).toEqual([12, 6, 3]);
    expect(DEFAULT_MONTHLY_FROM_MONTH).toBe(3);
  });

  it('honours a company schedule', () => {
    expect(expandAlertMilestones([18, 9], 2)).toEqual([18, 9, 1, 0]);
  });

  it('always includes the expiry date itself', () => {
    expect(expandAlertMilestones([24], 0)).toContain(0);
  });

  it('deduplicates milestones that the monthly tail already covers', () => {
    // 3 appears in both halves; it must not be listed twice
    expect(expandAlertMilestones([12, 3], 4)).toEqual([12, 3, 2, 1, 0]);
  });

  it('never emits a negative milestone', () => {
    expect(expandAlertMilestones([12, -1], 3).every((m) => m >= 0)).toBe(true);
  });

  it('describes milestones in words a reviewer would use', () => {
    expect(describeMilestone(0)).toBe('At expiry');
    expect(describeMilestone(1)).toBe('1 month before expiry');
    expect(describeMilestone(12)).toBe('12 months before expiry');
  });
});

describe('variation classification', () => {
  it.each<[VariationType, 'minor' | 'major']>([
    ['pack_size', 'minor'],
    ['labelling_artwork', 'minor'],
    ['administrative_change', 'minor'],
    ['manufacturing_site_change', 'major'],
    ['api_source_change', 'major'],
    ['formulation_change', 'major'],
    ['shelf_life_reduction', 'major'],
  ])('%s has a minimum class of %s', (type, expected) => {
    expect(variationMinimumClass(type)).toBe(expected);
  });

  it('refuses to let a major-only type be filed as minor', () => {
    expect(isVariationClassTooLow('manufacturing_site_change', 'minor')).toBe(true);
    expect(isVariationClassTooLow('manufacturing_site_change', 'major')).toBe(false);
  });

  it('allows a minor type to be escalated to major', () => {
    // escalating is a judgement the filer is entitled to make
    expect(isVariationClassTooLow('pack_size', 'major')).toBe(false);
    expect(isVariationClassTooLow('pack_size', 'minor')).toBe(false);
  });

  it('every variation type has a label', () => {
    for (const t of Object.keys(VARIATION_TYPE_LABELS) as VariationType[]) {
      expect(VARIATION_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  it('the major-only list matches the database function', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const fn = sql.slice(sql.indexOf('licence_variation_minimum_class(p_type text)'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    for (const t of MAJOR_ONLY_VARIATION_TYPES) {
      expect(body, `${t} must be major-only in SQL too`).toContain(`'${t}'`);
    }
    // and nothing minor has crept into the SQL list
    expect(body).not.toContain("'pack_size'");
    expect(body).not.toContain("'labelling_artwork'");
  });
});

describe('what a major variation costs', () => {
  it('a minor variation needs nothing extra', () => {
    expect(missingMajorVariationFields({
      variation_class: 'minor', justification: null, impact_assessment: null,
    })).toEqual([]);
  });

  it('a major variation needs a justification and an impact assessment', () => {
    expect(missingMajorVariationFields({
      variation_class: 'major', justification: null, impact_assessment: null,
    })).toEqual(['justification', 'impact assessment']);
  });

  it('whitespace is not a justification', () => {
    expect(missingMajorVariationFields({
      variation_class: 'major', justification: '   ', impact_assessment: 'done',
    })).toEqual(['justification']);
  });

  it('is satisfied when both are present', () => {
    expect(missingMajorVariationFields({
      variation_class: 'major',
      justification: 'Primary supplier discontinued the grade',
      impact_assessment: 'Comparative dissolution completed',
    })).toEqual([]);
  });
});

describe('the renewal template is the one already shipped', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('has 12 steps in TypeScript', () => {
    expect(NAFDAC_2026_RENEWAL_TASKS).toHaveLength(12);
  });

  it('seeds all 12 titles verbatim into the database', () => {
    // If somebody edits one list and not the other, the checklist the
    // server opens stops matching the one the app documents.
    for (const t of NAFDAC_2026_RENEWAL_TASKS) {
      expect(sql, `missing template step: ${t.title}`)
        .toContain(t.title.replace(/'/g, "''"));
    }
  });

  it('keeps the same lead times', () => {
    // Parse the seeded VALUES rows rather than string-matching a
    // formatting accident: (NULL,'key', n,'title','description',months)
    const row =
      /\(NULL,'nafdac_2026',\s*(\d+),\s*'((?:[^']|'')*)',\s*'(?:[^']|'')*',\s*([\d.]+)\)/g;
    const seeded = new Map<number, { title: string; months: number }>();
    for (const m of sql.matchAll(row)) {
      seeded.set(Number(m[1]), { title: m[2].replace(/''/g, "'"), months: Number(m[3]) });
    }

    expect(seeded.size).toBe(12);
    for (const t of NAFDAC_2026_RENEWAL_TASKS) {
      const s = seeded.get(t.sortOrder);
      expect(s, `step ${t.sortOrder} is not seeded`).toBeDefined();
      expect(s!.title).toBe(t.title);
      expect(s!.months, `step ${t.sortOrder} lead time drifted`).toBe(t.monthsBefore);
    }
  });

  it('numbers the steps 1 to 12 without gaps', () => {
    const orders = NAFDAC_2026_RENEWAL_TASKS.map((t) => t.sortOrder).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('display vocabularies are complete', () => {
  it('every licence status has a label', () => {
    const statuses: LicenceStatus[] = [
      'draft', 'active', 'renewal_due', 'renewal_in_progress',
      'renewed', 'expired', 'suspended', 'discontinued',
    ];
    for (const s of statuses) expect(LICENCE_STATUS_LABELS[s]).toBeTruthy();
  });
});
