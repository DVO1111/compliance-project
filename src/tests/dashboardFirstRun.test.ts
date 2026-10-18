/**
 * ONB-08's rules.
 *
 * The one worth protecting above all the others is the difference
 * between a zero and an em-dash. "0 open deviations" is a claim — we
 * looked, there are none — and a workspace on its first morning is not
 * entitled to make it. Every tile therefore has a DENOMINATOR that is a
 * different number from the figure it shows, and the tests below are
 * mostly about keeping those two apart. A later edit that "simplifies"
 * tilesFrom by checking the figure instead of the denominator passes a
 * casual reading and breaks the only thing the screen promises.
 */
import { describe, it, expect } from 'vitest';
import {
  greeting, glanceScope, tilesFrom, finishRowsFrom, nextStepFrom,
  inviteeLabel, nameList, inviteeSentence, usesManufacturingDashboard,
  NO_COUNTS, type WorkspaceCounts, type TileKey,
} from '../lib/dashboard/firstRun';
import { INDUSTRIES } from '../lib/onboarding/onboardingData';

const counts = (over: Partial<WorkspaceCounts> = {}): WorkspaceCounts => ({
  ...NO_COUNTS, ...over,
});

const tile = (c: WorkspaceCounts, key: TileKey) => {
  const found = tilesFrom(c).find((t) => t.key === key);
  if (!found) throw new Error(`no ${key} tile`);
  return found;
};

const row = (c: WorkspaceCounts, key: string) => {
  const found = finishRowsFrom(c).find((r) => r.key === key);
  if (!found) throw new Error(`no ${key} row`);
  return found;
};

describe('the four tiles', () => {
  it('are the four the design draws, in its order', () => {
    expect(tilesFrom(NO_COUNTS).map((t) => t.key))
      .toEqual(['batches', 'deviations', 'quarantine', 'licences']);
  });

  //  "Nothing is shown until there is real data behind it."
  it('show nothing at all on a workspace that has just finished setup', () => {
    for (const t of tilesFrom(NO_COUNTS)) {
      expect(t.value).toBeNull();
      expect(t.caption.length).toBeGreaterThan(0);
    }
  });

  it('each empty caption names the event that would produce a figure', () => {
    const c = NO_COUNTS;
    expect(tile(c, 'batches').caption).toBe('Appears after your first batch');
    expect(tile(c, 'deviations').caption).toBe('None raised yet');
    expect(tile(c, 'quarantine').caption).toBe('Appears after first goods receipt');
    expect(tile(c, 'licences').caption).toBe('Add expiry dates to see this');
  });

  //  THE CASE THE WHOLE SCREEN TURNS ON. Four batches, none of them
  //  running, is a real zero: somebody has worked here and nothing is in
  //  progress. It must not read the same as a workspace that has never
  //  started a batch.
  it('shows a real zero once there are records to count', () => {
    const worked = counts({ batchesTotal: 4, batchesInProgress: 0 });
    expect(tile(worked, 'batches').value).toBe(0);
    expect(tile(worked, 'batches').caption).toBe('of 4 batch records');

    const fresh = counts({ batchesTotal: 0, batchesInProgress: 0 });
    expect(tile(fresh, 'batches').value).toBeNull();
    expect(tile(fresh, 'batches').caption).toBe('Appears after your first batch');
  });

  it('counts deviations the same way', () => {
    expect(tile(counts({ capasTotal: 7, capasOpen: 2 }), 'deviations').value).toBe(2);
    expect(tile(counts({ capasTotal: 7, capasOpen: 0 }), 'deviations').value).toBe(0);
    expect(tile(counts({ capasTotal: 0, capasOpen: 0 }), 'deviations').value).toBeNull();
  });

  //  The licence tile's denominator is licences WITH AN EXPIRY DATE, not
  //  licences. That is the design's own caption — "Add expiry dates to
  //  see this" — and it is the difference between a licence register
  //  that cannot warn anybody and one that can.
  it('holds the licence tile empty while no licence has an expiry date', () => {
    const noDates = counts({ licencesTotal: 3, licencesWithExpiry: 0, licencesExpiring12mo: 0 });
    expect(tile(noDates, 'licences').value).toBeNull();
    expect(tile(noDates, 'licences').caption).toBe('Add expiry dates to see this');

    const dated = counts({ licencesTotal: 3, licencesWithExpiry: 3, licencesExpiring12mo: 1 });
    expect(tile(dated, 'licences').value).toBe(1);
    expect(tile(dated, 'licences').caption).toBe('of 3 licences with an expiry date');
  });

  //  A count that could not be taken is not a count of zero. An
  //  unreadable or uninstalled table reads exactly like an empty one,
  //  which is the honest thing to say when we do not know.
  it('treats a count it could not take as no data rather than as zero', () => {
    const unreadable = counts({ batchesTotal: null, batchesInProgress: null });
    expect(tile(unreadable, 'batches').value).toBeNull();

    const halfRead = counts({ batchesTotal: 9, batchesInProgress: null });
    expect(tile(halfRead, 'batches').value).toBeNull();
  });

  it('says "1 lot received" rather than "1 lots received"', () => {
    expect(tile(counts({ receiptsTotal: 1, receiptsQuarantined: 1 }), 'quarantine').caption)
      .toBe('of 1 lot received');
    expect(tile(counts({ receiptsTotal: 2, receiptsQuarantined: 0 }), 'quarantine').caption)
      .toBe('of 2 lots received');
  });
});

describe('Finish setting up', () => {
  it('lists the four rows the design draws, in its order', () => {
    expect(finishRowsFrom(NO_COUNTS).map((r) => r.key))
      .toEqual(['invitations', 'licence-details', 'starter-records', 'import']);
  });

  //  "Invitations show as sent and waiting, not as joined." ONB-07's
  //  rule, and the temptation to break it is stronger here, a day later.
  it('shows sent invitations as waiting, never as a team', () => {
    const r = row(counts({
      invitesPending: 3, invitesAccepted: 0,
      pendingInvitees: ['tunde@ib.test', 'ngozi.eze@ib.test', 'kunle@ib.test'],
    }), 'invitations');

    expect(r.badge).toBe('Waiting');
    expect(r.detail).toBe("3 sent. Tunde, Ngozi and Kunle haven't accepted yet.");
    expect(r.detail).not.toMatch(/joined|team member/i);
  });

  it('says "hasn\'t" for one person and "haven\'t" for several', () => {
    expect(row(counts({ invitesPending: 1, pendingInvitees: ['tunde@ib.test'] }), 'invitations').detail)
      .toBe("1 sent. Tunde hasn't accepted yet.");
  });

  it('is To do before anybody is invited, and Done once they have joined', () => {
    expect(row(counts({ invitesPending: 0, invitesAccepted: 0 }), 'invitations').badge).toBe('To do');

    const joined = row(counts({ invitesPending: 0, invitesAccepted: 2 }), 'invitations');
    expect(joined.badge).toBe('Done');
    expect(joined.detail).toBe('2 people have joined.');
    expect(row(counts({ invitesPending: 0, invitesAccepted: 1 }), 'invitations').detail)
      .toBe('1 person has joined.');
  });

  //  Pending wins over accepted. A workspace with two joined and one
  //  outstanding is still waiting on somebody, and the row that says so
  //  is the one worth showing.
  it('reports the outstanding invitations even when others have joined', () => {
    const r = row(counts({
      invitesPending: 1, invitesAccepted: 2, pendingInvitees: ['kunle@ib.test'],
    }), 'invitations');
    expect(r.badge).toBe('Waiting');
  });

  it('asks for licence expiry dates, and says why', () => {
    expect(row(counts({ licencesTotal: 0 }), 'licence-details').badge).toBe('To do');

    const partial = row(counts({ licencesTotal: 4, licencesWithExpiry: 1 }), 'licence-details');
    expect(partial.badge).toBe('To do');
    expect(partial.detail).toContain('3 of 4');
    expect(partial.detail).toMatch(/renewal alerts/i);

    expect(row(counts({ licencesTotal: 4, licencesWithExpiry: 4 }), 'licence-details').badge)
      .toBe('Done');
  });

  it('ticks starter records off once any exist', () => {
    expect(row(counts({ starterRecords: 0 }), 'starter-records').badge).toBe('To do');
    const done = row(counts({ starterRecords: 12 }), 'starter-records');
    expect(done.badge).toBe('Done');
    expect(done.detail).toContain('12 records');
  });

  //  Optional stays optional. Everything the import would bring in can
  //  be typed, so a workspace that never imports anything is not
  //  unfinished — and a row that nags about it would be saying it is.
  it('never makes the spreadsheet import look required', () => {
    for (const c of [NO_COUNTS, counts({ products: 40, starterRecords: 12 })]) {
      expect(row(c, 'import').badge).toBe('Optional');
    }
  });
});

describe('the next step', () => {
  //  One card, one reason. ONB-07 gives the reason and this screen
  //  repeats it, because a next step without a reason is a button people
  //  learn to scroll past.
  it('is products, and says why', () => {
    const next = nextStepFrom(NO_COUNTS);
    expect(next?.title).toBe('Next step: add your products');
    expect(next?.reason).toMatch(/registration/i);
    expect(next?.primaryLabel).toBe('Add your first product');
    expect(next?.secondaryLabel).toBe('Upload a product spreadsheet');
  });

  it('goes away once a product exists rather than nominating something else', () => {
    expect(nextStepFrom(counts({ products: 1 }))).toBeNull();
  });

  //  A count we could not take is not a product. Showing the card is the
  //  safe failure: at worst it suggests something already done, where
  //  hiding it would strand a workspace with no products and no prompt.
  it('still shows when the product count could not be read', () => {
    expect(nextStepFrom(counts({ products: null }))).not.toBeNull();
  });
});

describe('the greeting', () => {
  it('uses the first name only', () => {
    expect(greeting('Ada Okafor')).toBe('Welcome, Ada');
    expect(greeting('  Ada   Okafor ')).toBe('Welcome, Ada');
  });

  it('never leaves a hole where a name should be', () => {
    expect(greeting('')).toBe('Welcome back');
    expect(greeting(null)).toBe('Welcome back');
    expect(greeting(undefined)).toBe('Welcome back');
    expect(greeting('   ')).toBe('Welcome back');
  });
});

describe('naming an invitee from an address', () => {
  it('reads a first name out of the ones that carry one', () => {
    expect(inviteeLabel('tunde@ibadanpharma.test')).toBe('Tunde');
    expect(inviteeLabel('ngozi.eze@ibadanpharma.test')).toBe('Ngozi');
    expect(inviteeLabel('KUNLE_ADE@ibadanpharma.test')).toBe('Kunle');
  });

  //  Rather than invent a person. "Qa" and "T" are not people, and a
  //  sentence that says "T hasn't accepted yet" is worse than one that
  //  shows the address it actually sent to.
  it('falls back to the address when the local part is not a name', () => {
    expect(inviteeLabel('qa@ibadanpharma.test')).toBe('qa@ibadanpharma.test');
    expect(inviteeLabel('t.adeyemi@ibadanpharma.test')).toBe('t.adeyemi@ibadanpharma.test');
    expect(inviteeLabel('user2@ibadanpharma.test')).toBe('user2@ibadanpharma.test');
    expect(inviteeLabel('')).toBe('');
  });

  it('joins names the way the design writes them', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['Tunde'])).toBe('Tunde');
    expect(nameList(['Tunde', 'Ngozi'])).toBe('Tunde and Ngozi');
    expect(nameList(['Tunde', 'Ngozi', 'Kunle'])).toBe('Tunde, Ngozi and Kunle');
  });

  it('stops listing past three, so the row stays one sentence', () => {
    const five = ['tunde@x.test', 'ngozi@x.test', 'kunle@x.test', 'amara@x.test', 'segun@x.test'];
    expect(inviteeSentence(five)).toBe('Tunde, Ngozi and 3 others');
    expect(inviteeSentence(five.slice(0, 3))).toBe('Tunde, Ngozi and Kunle');
  });
});

describe('what the tiles are a glance at', () => {
  const ibadan = { id: 's1', name: 'Ibadan plant' };
  const lagos = { id: 's2', name: 'Lagos warehouse' };

  it('names the one site, with nothing added, when there is only one', () => {
    const scope = glanceScope([ibadan], 's1');
    expect(scope.heading).toBe('Ibadan plant at a glance');
    //  The company's figures ARE that site's figures, so there is
    //  nothing to qualify.
    expect(scope.caveat).toBeUndefined();
  });

  //  Batches, deviations and lots carry no site_id yet. Heading a
  //  company-wide figure with one plant's name would be the screen's
  //  first untrue sentence, so it is said out loud instead.
  it('admits the figures are not split by site when several exist', () => {
    const scope = glanceScope([ibadan, lagos], 's1');
    expect(scope.heading).toBe('Ibadan plant at a glance');
    expect(scope.caveat).toMatch(/whole workspace/i);
  });

  it('reads "All sites" when no particular site is chosen', () => {
    expect(glanceScope([ibadan, lagos], null).heading).toBe('All sites at a glance');
    expect(glanceScope([ibadan, lagos], null).caveat).toBeUndefined();
  });

  it('falls back to the workspace when no site was recorded', () => {
    expect(glanceScope([], null).heading).toBe('Your workspace at a glance');
  });
});

describe('who gets this dashboard', () => {
  //  All four industries ONB-02 offers went through the same six steps
  //  and hold the same NAFDAC licences, so all four get the same
  //  dashboard. Two of them categorise as 'generic', which is exactly
  //  the case an industry-category check alone would drop.
  it('covers every industry the onboarding flow offers', () => {
    for (const industry of INDUSTRIES) {
      expect(usesManufacturingDashboard(industry.value), industry.value).toBe(true);
    }
    expect(INDUSTRIES.length).toBe(4);
  });

  it('leaves workspaces whose work is not manufacturing on the other dashboard', () => {
    expect(usesManufacturingDashboard('Financial Services')).toBe(false);
    expect(usesManufacturingDashboard('Advertising Agency')).toBe(false);
    expect(usesManufacturingDashboard('Logistics & Courier')).toBe(false);
  });

  //  THE DEFAULT IS THIS DASHBOARD, and that is the fix for a bug the
  //  first version had: listing the industries that qualify meant an
  //  unwritten or unrecognised industry_type fell through to the
  //  content-marketing dashboard, silently, with nothing on screen to
  //  say why. Criateur onboards regulated manufacturers; a workspace
  //  that has not said otherwise gets the product's own dashboard.
  it('defaults to this dashboard when the industry is unknown or unrecorded', () => {
    expect(usesManufacturingDashboard(null)).toBe(true);
    expect(usesManufacturingDashboard(undefined)).toBe(true);
    expect(usesManufacturingDashboard('')).toBe(true);
    expect(usesManufacturingDashboard('   ')).toBe(true);
    expect(usesManufacturingDashboard('Something nobody has heard of')).toBe(true);
  });

  it('is not fussy about case or stray spacing', () => {
    expect(usesManufacturingDashboard('  pharmaceutical manufacturing  ')).toBe(true);
  });
});
