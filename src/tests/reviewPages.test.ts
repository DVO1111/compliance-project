/**
 * The four `review` pages — reassessed against evidence.
 *
 * Phase 1 classified four working pages as `review`: each has a
 * design-side decision against it that the owner has not overridden.
 * Reassessing them is not a matter of taste, because two of the four
 * turn out to be load-bearing for the authorisation matrix and two do
 * not, and that difference is checkable.
 *
 * THE DECIDING FACT. PM-03 grants `act` on `distribution` to the
 * Storekeeper, and `act` on `suppliers` to Procurement and the QA
 * Manager. `dispatch` is the ONLY page mapped to `distribution` and
 * `supplier-qualification` is the ONLY page mapped to `suppliers`. So
 * removing either leaves a role holding `act` on a section with
 * nowhere to exercise it — a tabulated permission pointing at
 * nothing.
 *
 * `compliance-reporting` and `enterprise-dashboard` carry no PM-03
 * section at all, so removing them strands nothing. Their cases rest
 * entirely on reading the design, and both readings are inferences.
 *
 * These tests hold the facts the reassessment rests on, so that if
 * the matrix or the page map changes the conclusion is re-examined
 * rather than quietly inherited.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGE_SECTION, PM_SECTIONS } from '../lib/access/roleAccess';
import { DESTINATIONS } from '../lib/navigation/hs02';
import { SETTINGS_SECTIONS } from '../lib/navigation/settingsSections';

const REVIEW_PAGES = [
  'dispatch',
  'supplier-qualification',
  'compliance-reporting',
  'enterprise-dashboard',
] as const;

const pagesFor = (section: string): string[] =>
  Object.entries(PAGE_SECTION).filter(([, s]) => s === section).map(([p]) => p);

describe('every PM-03 section is reachable through some page', () => {
  /*
   *  THE INVARIANT THAT PROTECTS THE TWO LOAD-BEARING PAGES.
   *
   *  PM-03 is the authorisation matrix: eight operational roles
   *  against eleven sections. A section with a grant but no page is a
   *  permission nobody can use, and the way that happens in practice
   *  is somebody removing a page because a design document said to,
   *  without checking the matrix.
   *
   *  This fails if `dispatch` or `supplier-qualification` is deleted.
   */
  it.each(PM_SECTIONS)('section %s has at least one page', (section) => {
    expect(pagesFor(section).length).toBeGreaterThan(0);
  });

  it('names the pages that are a section’s only route', () => {
    //  Nine of the eleven sections have exactly one page, so for them
    //  "remove the page" and "remove the section" are the same act.
    const soleRoutes = PM_SECTIONS.filter((s) => pagesFor(s).length === 1);
    expect(soleRoutes).toContain('distribution');
    expect(soleRoutes).toContain('suppliers');
  });
});

describe('dispatch — removing it would strand the Storekeeper', () => {
  it('is the only page serving the distribution section', () => {
    expect(pagesFor('distribution')).toEqual(['dispatch']);
  });

  it('is still flagged for the owner rather than silently kept or dropped', () => {
    //  The reassessment produced a recommendation, not an authority to
    //  change navigation. The flag stays until the owner answers.
    expect(DESTINATIONS.dispatch.kind).toBe('review');
  });

  it('records why, citing both sides of the conflict', () => {
    const d = DESTINATIONS.dispatch as { because: string };
    //  HS-01 row 10 says remove; PM-03 says the Storekeeper acts here.
    //  Both belong in the note, because the conflict is the finding.
    expect(d.because).toMatch(/HS-01 row 10/);
    expect(d.because).toMatch(/PM-03/);
    expect(d.because).toMatch(/Storekeeper/i);
  });
});

describe('supplier-qualification — the home HS-01 points to does not exist', () => {
  it('is the only page serving the suppliers section', () => {
    expect(pagesFor('suppliers')).toEqual(['supplier-qualification']);
  });

  /*
   *  HS-01 row 9 does not simply say "remove". It says the
   *  approved-supplier list "stays in Settings › Materials and
   *  suppliers" — so it presupposes a home for it.
   *
   *  CF-02's Settings home has seventeen sections and none of them is
   *  suppliers or materials. So row 9 cannot be executed as written:
   *  doing so would remove the only supplier page and move its
   *  contents to a page that has never been built, while Procurement
   *  and the QA Manager hold `act` on the section.
   */
  it('has no Settings section to be moved into', () => {
    //  A section is identified by the PAGE it opens, so that is what
    //  is checked — there is no separate id.
    const pages = SETTINGS_SECTIONS.map((s) => s.page as string);
    const labels = SETTINGS_SECTIONS.map((s) => s.label.toLowerCase());
    expect(pages).not.toContain('supplier-qualification');
    expect(labels.some((l) => l.includes('supplier'))).toBe(false);
  });

  it('is still flagged for the owner', () => {
    expect(DESTINATIONS['supplier-qualification'].kind).toBe('review');
  });
});

describe('the two whose case rests only on reading the design', () => {
  it.each(['compliance-reporting', 'enterprise-dashboard'] as const)(
    '%s carries no PM-03 section, so removing it strands no grant',
    (page) => {
      expect(PAGE_SECTION[page as keyof typeof PAGE_SECTION]).toBeUndefined();
    },
  );

  it('records that the compliance-reporting mapping is an inference', () => {
    //  HS-01 row 11 names training reports and the trace export. That
    //  this page is the thing row 11 means is read off its LABEL, and
    //  the note says so rather than presenting it as a finding.
    const d = DESTINATIONS['compliance-reporting'] as { because: string };
    expect(d.because).toMatch(/inference/i);
  });

  it('records that enterprise-dashboard rests on an HS-02 exclusion', () => {
    //  The strongest of the four readings: HS-02 lists "Group-level
    //  roll-up" under "Excluded from the MVP: never in navigation".
    //  Still an identification — that this page IS that item — which
    //  is why it is a recommendation and not a change.
    const d = DESTINATIONS['enterprise-dashboard'] as { because: string };
    expect(d.because).toMatch(/Excluded from the MVP|never in navigation/);
  });
});

describe('all four are still working pages, and still reachable', () => {
  it('each has a destination and none is pendingDesign', () => {
    //  `review` is not a synonym for unbuilt. These four work; the
    //  question is whether they belong in the rail.
    for (const p of REVIEW_PAGES) {
      expect(DESTINATIONS[p].kind).toBe('review');
    }
  });

  it('each still renders as a top-level rail entry', () => {
    //  MainLayout treats `review` like `rail`, so nothing is hidden
    //  while the owner decides. A reassessment must not quietly
    //  remove a feature.
    const layout = readFileSync(
      join(process.cwd(), 'src/components/Layout/MainLayout.tsx'),
      'utf8',
    );
    expect(layout).toMatch(/kind === 'rail'[\s\S]{0,80}kind === 'review'/);
  });
});
