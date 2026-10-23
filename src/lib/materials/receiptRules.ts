/**
 * The rules behind the goods receipt screen.
 *
 * Here rather than inline in the component for the same reason as
 * dispositionRules: this project has no DOM testing library, so a rule
 * written in JSX cannot be asserted, and these decide what a
 * storekeeper is allowed to book in.
 *
 * None of this is the enforcement. fn_material_lots_supplier_gate
 * refuses the insert in a BEFORE trigger regardless of what the form
 * offered. These shape what the screen SAYS.
 */

import { canAct } from '../access/roleAccess';
import type { WorkRole } from '../access/permissionRequests';

/** PM-03 gives Act on goods receipt to the Storekeeper alone. */
export function mayReceive(role: WorkRole | null | undefined): boolean {
  return canAct(role, 'goods_receipt');
}

export interface SupplierStanding {
  /** How it reads in the picker. */
  label: string;
  /** Whether the database will refuse a receipt naming this supplier. */
  blocked: boolean;
}

/**
 * How a supplier's qualification reads, and whether receipt is barred.
 *
 * 'pending' IS NOT BLOCKED, and it looks like a hole until you read
 * the gate's own reasoning: refusing receipt from an un-assessed
 * supplier would stop a company entering its existing stock on the day
 * it starts using the system. Qualification becomes something they
 * work through rather than a wall on arrival.
 *
 * An unrecognised status is NOT treated as blocked. The gate names
 * exactly two refusing statuses; inventing a third here would make the
 * screen refuse something the database accepts, which is the same
 * class of disagreement as the reverse and no safer.
 */
export function supplierStanding(status: string | null | undefined): SupplierStanding {
  switch (status) {
    case 'qualified':    return { label: 'qualified', blocked: false };
    case 'conditional':  return { label: 'conditional', blocked: false };
    case 'pending':      return { label: 'not yet assessed', blocked: false };
    case 'suspended':    return { label: 'suspended — cannot receive', blocked: true };
    case 'disqualified': return { label: 'disqualified — cannot receive', blocked: true };
    default:             return { label: status ?? 'unknown', blocked: false };
  }
}

/**
 * Whether the form has enough to submit.
 *
 * A material and a quantity above zero. The supplier is optional
 * because the gate treats a receipt with no supplier as nothing to
 * check — some stock genuinely arrives without one — and a form that
 * demanded it would block a legitimate receipt on a field the database
 * does not require.
 */
export function receiptComplete(materialId: string, quantity: string): boolean {
  if (!materialId) return false;
  const n = Number(quantity);
  return quantity.trim() !== '' && Number.isFinite(n) && n > 0;
}

/** What the screen says once the lot exists. The consequence, not the row. */
export function receiptConfirmation(lotNumber: string): string {
  return `Lot ${lotNumber} received and quarantined. `
    + 'It cannot be issued to production until QA releases it.';
}
