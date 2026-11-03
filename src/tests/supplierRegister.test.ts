/**
 * The approved-supplier register (HS-01 row 9).
 *
 * `supplier-qualification` rendered a `ComingSoonPage` while
 * `public.suppliers` held a real RLS-protected table and PM-03 granted
 * `act` on section `suppliers` to Procurement and the QA Manager —
 * a tabulated permission with no page to be exercised on.
 *
 * The assertions that matter here are about the LAPSE, because that is
 * the one piece of reasoning the data does not state for itself:
 *
 *   - a lapsed approval must NOT rewrite `qualification_status`. A
 *     date passing is not somebody deciding to disqualify a supplier,
 *     and silently converting one into the other would fabricate a
 *     quality decision.
 *   - but a lapsed supplier is not usable, whatever the standing says.
 *     That is the silent failure the register exists to surface: the
 *     column still reads "Qualified".
 *
 * The status vocabulary is read off `suppliers_qualification_chk` and
 * a test pins that, so the client can never offer a standing the
 * column will refuse.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const update = vi.fn();
const single = vi.fn();
const eq = vi.fn();

vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    update: (...a: unknown[]) => { update(...a); return chain; },
    select: () => chain,
    single: () => single(),
    eq: (...a: unknown[]) => { eq(...a); return chain; },
    order: () => chain,
  });
  return { supabase: { from: vi.fn(() => chain) } };
});

import {
  listSuppliers, updateQualification, hasLapsed, daysUntilLapse, isUsable,
  summarise, triage, search, describeSupplierError,
  QUALIFICATION_STATUSES, STATUS_LABELS, STATUS_TONE,
  type Supplier, type QualificationStatus,
} from '../lib/suppliers/supplierRegisterService';

const TODAY = new Date('2026-10-26T12:00:00Z');

function sup(over: Partial<Supplier> = {}): Supplier {
  return {
    id: 's1', company_id: 'c1', name: 'Acme Excipients',
    code: 'SUP-001', qualification_status: 'qualified',
    qualified_until: '2027-03-31', address: null, country: 'Nigeria',
    contact_email: null, notes: null,
    ...over,
  };
}

beforeEach(() => {
  update.mockClear(); single.mockClear(); eq.mockClear();
  single.mockResolvedValue({ data: sup(), error: null });
});

describe('the status vocabulary comes from the column', () => {
  it('offers exactly the five values the CHECK allows', () => {
    //  Read off `suppliers_qualification_chk`. Offering a sixth would
    //  produce a refusal the reader cannot act on.
    expect([...QUALIFICATION_STATUSES]).toEqual([
      'pending', 'qualified', 'conditional', 'disqualified', 'suspended',
    ]);
  });

  it('labels and tones every one of them', () => {
    for (const s of QUALIFICATION_STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_TONE[s]).toBeTruthy();
    }
  });

  it('does not present conditional as a clean pass', () => {
    //  A conditionally approved supplier is usable under stated
    //  limits, which a reader has to notice.
    expect(STATUS_TONE.conditional).toBe('warn');
    expect(STATUS_TONE.qualified).toBe('ok');
  });
});

describe('hasLapsed', () => {
  it('is false while the approval still runs', () => {
    expect(hasLapsed(sup({ qualified_until: '2027-03-31' }), TODAY)).toBe(false);
  });

  it('is true once the date has passed', () => {
    expect(hasLapsed(sup({ qualified_until: '2026-09-30' }), TODAY)).toBe(true);
  });

  it('counts the last day as still valid', () => {
    //  An approval valid "until the 26th" is valid for the whole of
    //  the 26th. Comparing timestamps rather than calendar days would
    //  expire it at midnight and block a supplier a day early.
    expect(hasLapsed(sup({ qualified_until: '2026-10-26' }), TODAY)).toBe(false);
  });

  it('is false when no end date is recorded', () => {
    //  No date is not an expired date. Treating it as lapsed would
    //  block every supplier whose paperwork has no expiry.
    expect(hasLapsed(sup({ qualified_until: null }), TODAY)).toBe(false);
  });

  it('is false rather than throwing on an unparseable date', () => {
    expect(hasLapsed(sup({ qualified_until: 'not-a-date' }), TODAY)).toBe(false);
  });
});

describe('daysUntilLapse', () => {
  it('counts forward', () => {
    expect(daysUntilLapse(sup({ qualified_until: '2026-10-31' }), TODAY)).toBe(5);
  });

  it('is zero on the last day', () => {
    expect(daysUntilLapse(sup({ qualified_until: '2026-10-26' }), TODAY)).toBe(0);
  });

  it('goes negative once lapsed', () => {
    expect(daysUntilLapse(sup({ qualified_until: '2026-10-20' }), TODAY)).toBe(-6);
  });

  it('is null with no end date', () => {
    expect(daysUntilLapse(sup({ qualified_until: null }), TODAY)).toBeNull();
  });
});

describe('isUsable', () => {
  it('accepts qualified and conditional', () => {
    expect(isUsable(sup({ qualification_status: 'qualified' }), TODAY)).toBe(true);
    expect(isUsable(sup({ qualification_status: 'conditional' }), TODAY)).toBe(true);
  });

  it.each(['pending', 'suspended', 'disqualified'] as QualificationStatus[])(
    'refuses %s', (status) => {
      expect(isUsable(sup({ qualification_status: status }), TODAY)).toBe(false);
    },
  );

  /*
   *  THE ASSERTION THAT MATTERS. A supplier whose approval ran out
   *  three weeks ago still reads "Qualified" in its own column,
   *  because nothing rewrote it. It must not be usable.
   */
  it('refuses a qualified supplier whose approval has lapsed', () => {
    const s = sup({ qualification_status: 'qualified', qualified_until: '2026-09-30' });
    expect(s.qualification_status).toBe('qualified');
    expect(isUsable(s, TODAY)).toBe(false);
  });

  it('refuses a lapsed conditional supplier too', () => {
    expect(isUsable(
      sup({ qualification_status: 'conditional', qualified_until: '2026-01-01' }), TODAY,
    )).toBe(false);
  });
});

describe('summarise', () => {
  it('counts each standing, and lapses separately', () => {
    const out = summarise([
      sup({ id: 'a', qualification_status: 'qualified', qualified_until: '2027-01-01' }),
      sup({ id: 'b', qualification_status: 'qualified', qualified_until: '2026-01-01' }),
      sup({ id: 'c', qualification_status: 'conditional', qualified_until: null }),
      sup({ id: 'd', qualification_status: 'suspended', qualified_until: null }),
      sup({ id: 'e', qualification_status: 'disqualified', qualified_until: null }),
    ], TODAY);
    expect(out.total).toBe(5);
    //  Both qualified rows are counted as qualified — the lapse is an
    //  additional fact, not a reclassification.
    expect(out.qualified).toBe(2);
    expect(out.lapsed).toBe(1);
    expect(out.conditional).toBe(1);
    expect(out.blocked).toBe(2);
  });
});

describe('triage', () => {
  it('puts a lapsed approval first, ahead of an openly blocked one', () => {
    //  A suspended supplier is visibly unusable. A lapsed one looks
    //  fine, which is why it is the more urgent of the two.
    const out = triage([
      sup({ id: 'ok', name: 'A fine supplier', qualification_status: 'qualified', qualified_until: '2027-01-01' }),
      sup({ id: 'susp', name: 'B suspended', qualification_status: 'suspended', qualified_until: null }),
      sup({ id: 'lapsed', name: 'C lapsed', qualification_status: 'qualified', qualified_until: '2026-01-01' }),
    ], TODAY);
    expect(out.map((s) => s.id)).toEqual(['lapsed', 'susp', 'ok']);
  });

  it('orders by name within the same rank', () => {
    const out = triage([
      sup({ id: '2', name: 'Zeta', qualification_status: 'qualified', qualified_until: null }),
      sup({ id: '1', name: 'Alpha', qualification_status: 'qualified', qualified_until: null }),
    ], TODAY);
    expect(out.map((s) => s.name)).toEqual(['Alpha', 'Zeta']);
  });
});

describe('search', () => {
  const list = [
    sup({ id: '1', name: 'Acme Excipients', code: 'SUP-001', country: 'Nigeria' }),
    sup({ id: '2', name: 'Baltic Chemicals', code: 'SUP-002', country: 'Poland' }),
  ];

  it.each([
    ['acme', '1'],
    ['SUP-002', '2'],
    ['poland', '2'],
  ])('matches %s', (q, id) => {
    const out = search(list, q);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(id);
  });

  it('returns everything for a blank query', () => {
    expect(search(list, '   ')).toHaveLength(2);
  });

  it('tolerates a null code or country', () => {
    expect(search([sup({ code: null, country: null })], 'acme')).toHaveLength(1);
  });
});

describe('updateQualification', () => {
  it('sends only the standing and its end date', async () => {
    //  Not a general-purpose supplier editor: this page changes a
    //  standing, and nothing else should ride along with it.
    await updateQualification('c1', 's1', 'conditional', '2027-01-31');
    expect(update.mock.calls[0][0]).toEqual({
      qualification_status: 'conditional',
      qualified_until: '2027-01-31',
    });
  });

  it('scopes by company as well as id', async () => {
    await updateQualification('c1', 's1', 'qualified', null);
    expect(eq.mock.calls).toEqual([['id', 's1'], ['company_id', 'c1']]);
  });

  it('turns an empty date into null rather than an empty string', async () => {
    await updateQualification('c1', 's1', 'pending', '');
    expect((update.mock.calls[0][0] as Record<string, unknown>).qualified_until).toBeNull();
  });

  it('reports a refused standing in words', async () => {
    single.mockResolvedValueOnce({
      data: null, error: { message: 'violates check constraint "suppliers_qualification_chk"' },
    });
    await expect(updateQualification('c1', 's1', 'qualified', null))
      .rejects.toThrow(/not one of the standings/i);
  });

  it('reports an RLS refusal as a permission problem', async () => {
    single.mockResolvedValueOnce({
      data: null, error: { message: 'new row violates row-level security policy' },
    });
    await expect(updateQualification('c1', 's1', 'qualified', null))
      .rejects.toThrow(/do not have access/i);
  });
});

describe('listSuppliers', () => {
  it('filters by company', async () => {
    single.mockResolvedValue({ data: [], error: null });
    await listSuppliers('c1');
    expect(eq.mock.calls).toEqual([['company_id', 'c1']]);
  });
});

describe('describeSupplierError', () => {
  it('passes an unrecognised message through', () => {
    expect(describeSupplierError('connection reset').message).toBe('connection reset');
  });
});
