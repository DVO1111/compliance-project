/**
 * How the stranded-work list reads, and when reassignment is offered.
 *
 * Pure functions. The database is the authority on who may reassign
 * and on who may receive the work; these decide what to show, so a
 * control the database would refuse is not offered. Where they could
 * disagree, the database wins — `describeStrandedError` carries the
 * refusal.
 */

import { sectionAccessFor, type PmSection, PM_SECTION_LABELS } from './roleAccess';
import type { WorkRole } from './permissionRequests';
import type { StrandedWorkRow } from './strandedWorkService';

/**
 * May these roles reassign work in this section?
 *
 * Mirrors the trigger: somebody who administers roles, or who may act
 * in the section the work belongs to. `compliance_admin` is the role
 * PM-03 gives `roles_change`, so it stands in for the first arm here —
 * the database checks `app_may_assign_operational_roles`, which this
 * cannot evaluate client-side.
 */
export function mayReassign(roles: WorkRole[], section: string): boolean {
  if (roles.includes('compliance_admin')) return true;
  return sectionAccessFor(roles, section as PmSection) === 'act';
}

/**
 * May this person receive the work?
 *
 * The target must hold Act in the section. Offering a person who
 * cannot act would produce STRANDED_WORK_TARGET_CANNOT_ACT at the
 * last moment, so the picker filters them out instead.
 */
export function mayReceive(roles: WorkRole[], section: string): boolean {
  return sectionAccessFor(roles, section as PmSection) === 'act';
}

/** Only rows still waiting. A reassigned row is history, not a task. */
export function outstanding(rows: StrandedWorkRow[]): StrandedWorkRow[] {
  return rows.filter((r) => r.still_stranded);
}

/**
 * Oldest first.
 *
 * Stranded work does not get less urgent by sitting, and a list sorted
 * by entity type buries the one that has been waiting three weeks.
 */
export function strandedLines(rows: StrandedWorkRow[]): StrandedWorkRow[] {
  return [...rows].sort((a, b) => {
    const at = a.last_acted_at ? Date.parse(a.last_acted_at) : 0;
    const bt = b.last_acted_at ? Date.parse(b.last_acted_at) : 0;
    return at - bt;
  });
}

export function sectionLabel(section: string): string {
  return PM_SECTION_LABELS[section as PmSection] ?? section;
}

export function entityLabel(entityType: string): string {
  switch (entityType) {
    case 'material_lot':    return 'Material lot';
    case 'batch_record':    return 'Batch record';
    case 'product':         return 'Product';
    case 'deviation':       return 'Deviation';
    case 'capa_record':     return 'CAPA';
    case 'sop_document':    return 'SOP';
    case 'change_control':  return 'Change control';
    case 'submission':      return 'Submission';
    case 'licence':         return 'Licence';
    default:                return entityType.replace(/_/g, ' ');
  }
}

/**
 * The headline.
 *
 * "Nothing stranded" and "nothing loaded yet" are different states and
 * must not share a sentence — an empty list that means "we have not
 * looked" reads as reassurance.
 */
export function strandedHeadline(rows: StrandedWorkRow[]): string {
  const open = outstanding(rows);
  if (open.length === 0) {
    return 'No work is waiting on a withdrawn role.';
  }
  const sections = new Set(open.map((r) => r.section));
  return (
    `${open.length} record${open.length === 1 ? '' : 's'} ` +
    `cannot be carried on by whoever last touched ${open.length === 1 ? 'it' : 'them'}, ` +
    `across ${sections.size} section${sections.size === 1 ? '' : 's'}.`
  );
}

/** How long it has been waiting, in words. */
export function waitingFor(row: StrandedWorkRow, now: Date = new Date()): string {
  if (!row.last_acted_at) return 'unknown';
  const days = Math.floor((now.getTime() - Date.parse(row.last_acted_at)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/** A reassignment needs a reason, and the form says so before submitting. */
export function reassignComplete(toUser: string | null, reason: string): boolean {
  return Boolean(toUser) && reason.trim().length > 0;
}
