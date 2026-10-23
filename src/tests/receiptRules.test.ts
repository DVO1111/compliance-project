/**
 * The goods receipt screen's rules, and their agreement with the
 * database gate they describe.
 *
 * The screen does not enforce anything — fn_material_lots_supplier_gate
 * refuses the insert in a BEFORE trigger. What these assertions
 * protect is the AGREEMENT between what the screen says will happen
 * and what the database does, in both directions. A screen that warns
 * about a supplier the database accepts is as wrong as one that stays
 * quiet about a supplier it refuses.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mayReceive, supplierStanding, receiptComplete, receiptConfirmation,
} from '../lib/materials/receiptRules';
import type { WorkRole } from '../lib/access/permissionRequests';

describe('who may book a delivery in', () => {
  it('is the Storekeeper, and nobody else', () => {
    const roles: WorkRole[] = [
      'procurement', 'storekeeper', 'qc_analyst', 'qa_officer', 'qa_manager',
      'production_supervisor', 'compliance_admin', 'management',
    ];
    expect(roles.filter(mayReceive)).toEqual(['storekeeper']);
  });

  it('refuses an absent role', () => {
    expect(mayReceive(null)).toBe(false);
    expect(mayReceive(undefined)).toBe(false);
  });
});

describe('what the screen says a supplier’s standing means', () => {
  it('blocks exactly suspended and disqualified', () => {
    const statuses = ['qualified', 'conditional', 'pending', 'suspended', 'disqualified'];
    const blocked = statuses.filter((s) => supplierStanding(s).blocked);
    expect(blocked).toEqual(['suspended', 'disqualified']);
  });

  //  It looks like a hole and is not. The gate's own comment: refusing
  //  receipt from an un-assessed supplier would stop a company
  //  entering its existing stock on the day it starts using the
  //  system.
  it('does not block a supplier nobody has assessed yet', () => {
    expect(supplierStanding('pending').blocked).toBe(false);
    expect(supplierStanding('pending').label).toBe('not yet assessed');
  });

  //  Inventing a third refusing status here would make the screen
  //  refuse something the database accepts — the same class of
  //  disagreement as the reverse, and no safer.
  it('does not invent a refusal for a status it does not recognise', () => {
    expect(supplierStanding('something_new').blocked).toBe(false);
    expect(supplierStanding(null).blocked).toBe(false);
  });

  it('says why, not just that', () => {
    expect(supplierStanding('suspended').label).toContain('cannot receive');
    expect(supplierStanding('disqualified').label).toContain('cannot receive');
  });
});

describe('the screen and the database gate agree', () => {
  //  THE ONE THAT WOULD CATCH A DRIFT. The gate names its refusing
  //  statuses in SQL; this reads them out of the migration and checks
  //  the module blocks the same set. If somebody adds a status to the
  //  trigger, the screen stops warning about it and this fails.
  const sql = readFileSync(
    resolve(__dirname, '../../supabase/migrations/20261002000000_material_quarantine_gate.sql'),
    'utf8',
  );

  it('blocks the same statuses the trigger refuses', () => {
    const m = sql.match(/IF v_status IN \(([^)]*)\)/);
    expect(m, 'the gate still names its refusing statuses in an IN list').toBeTruthy();
    const inSql = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!).sort();
    const inModule = ['qualified', 'conditional', 'pending', 'suspended', 'disqualified']
      .filter((s) => supplierStanding(s).blocked).sort();
    expect(inModule).toEqual(inSql);
  });
});

describe('what the form requires before it will submit', () => {
  it('needs a material and a quantity above zero', () => {
    expect(receiptComplete('mat-1', '400')).toBe(true);
    expect(receiptComplete('', '400')).toBe(false);
    expect(receiptComplete('mat-1', '')).toBe(false);
    expect(receiptComplete('mat-1', '0')).toBe(false);
  });

  it('refuses a negative or non-numeric quantity', () => {
    expect(receiptComplete('mat-1', '-5')).toBe(false);
    expect(receiptComplete('mat-1', 'forty')).toBe(false);
    expect(receiptComplete('mat-1', '   ')).toBe(false);
  });

  it('accepts a decimal quantity', () => {
    expect(receiptComplete('mat-1', '12.5')).toBe(true);
  });

  //  The supplier is optional because the gate treats a receipt with
  //  no supplier as nothing to check. A form demanding it would block
  //  a legitimate receipt on a field the database does not require.
  it('does not require a supplier', () => {
    expect(receiptComplete('mat-1', '400')).toBe(true);
  });
});

describe('what the screen says once the lot exists', () => {
  //  The consequence, not the row. A storekeeper needs to know the lot
  //  is not usable yet.
  it('says the lot is quarantined and why that matters', () => {
    const text = receiptConfirmation('ML-2610-031');
    expect(text).toContain('ML-2610-031');
    expect(text).toContain('quarantined');
    expect(text).toContain('until QA releases it');
  });
});
