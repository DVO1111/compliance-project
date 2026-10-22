/**
 * PM-03's grid — "What each role can open" — as data.
 *
 * WHY THIS MODULE EXISTS, AND WHAT WAS WRONG BEFORE.
 *
 * This application had TWO role models and neither of them could answer
 * the question PM-03 answers.
 *
 * src/lib/permissions.ts drives navigation and route guards. Its
 * canonicalRole() folds every job title into six buckets — marketing,
 * compliance, executive, agency, auditor, quality — and "quality"
 * swallows qa, quality_manager AND production. None of PM-03's eight
 * roles exists in it. A Storekeeper and a QA Manager therefore resolve
 * to the same permissions, or to none at all, and the sidebar they see
 * is identical. That is the defect behind "every role lands on the same
 * dashboard with a different label".
 *
 * src/lib/access/permissionRequests.ts knows the eight work roles, but
 * it models only SEGREGATION OF DUTIES — which role may not ACT on a
 * section — and it drives one screen, the access-request flow. It has
 * no concept of "no access at all", so every role reads as either
 * acting or viewing everywhere, and nothing is ever actually withheld.
 *
 * PM-03 is a three-state grid: Act, View, or — (no access). Neither
 * existing model can express the third state, which is the one that
 * makes a restricted role restricted.
 *
 * So this module holds the grid, verbatim, and is the single thing
 * navigation, route guards and dashboards consult. It does not replace
 * permissionRequests.ts: that module still owns what may be REQUESTED
 * and which pairings conflict, which is a different question from what
 * a role holds today.
 *
 * READ OUT OF THE FIGMA FILE, not inferred from role names. The cells
 * below are PM-03's, column for column. A QC Analyst and a QA Officer
 * get what the design gives them, not a shared "quality staff" set.
 */

import type { WorkRole } from './permissionRequests';

/**
 * PM-03's eleven columns, in its order.
 *
 * AUDIT TRAIL is deliberately absent. The design annotates it "Audit
 * trail is a separate switch", so it is not a cell in this grid and is
 * not derived from one — see auditTrailVisible() below.
 *
 * These are the design's sections. They are NOT the same list as
 * permissionRequests.ts's AccessSection, which covers the sections a
 * person may file a request against and includes pages PM-03 does not
 * tabulate (change control, SOP library, obligations, policies). The
 * two overlap; they are not interchangeable, and conflating them is how
 * a grid ends up asserting access to a section it never described.
 */
export type PmSection =
  | 'suppliers'
  | 'goods_receipt'
  | 'material_lots'
  | 'qc_testing'
  | 'qa_disposition'
  | 'batch_records'
  | 'batch_release'
  | 'deviation_capa'
  | 'coa_register'
  | 'traceability'
  | 'distribution';

/** A cell. '—' in the design is 'none' here. */
export type Access = 'act' | 'view' | 'none';

export const PM_SECTIONS: PmSection[] = [
  'suppliers', 'goods_receipt', 'material_lots', 'qc_testing', 'qa_disposition',
  'batch_records', 'batch_release', 'deviation_capa', 'coa_register',
  'traceability', 'distribution',
];

/** PM-03's column headings, for any screen that draws the grid. */
export const PM_SECTION_LABELS: Record<PmSection, string> = {
  suppliers:       'Suppliers',
  goods_receipt:   'Goods receipt',
  material_lots:   'Material lots',
  qc_testing:      'QC testing',
  qa_disposition:  'QA disposition',
  batch_records:   'Batch records',
  batch_release:   'Batch release',
  deviation_capa:  'Deviation / CAPA',
  coa_register:    'CoA register',
  traceability:    'Traceability',
  distribution:    'Distribution',
};

//  Written as tuples in PM_SECTIONS order so a row can be read against
//  the design's own grid left to right without counting keys. A keyed
//  object per role hides a transposition; eleven values in a line do
//  not.
type Row = [Access, Access, Access, Access, Access, Access, Access, Access, Access, Access, Access];

const A: Access = 'act';
const V: Access = 'view';
const N: Access = 'none';

/**
 * PM-03, cell for cell.
 *
 *                      sup  gds  lot  qc   dis  bat  rel  dev  coa  trc  dst
 */
const GRID: Partial<Record<WorkRole, Row>> = {
  procurement:           [A,   V,   V,   N,   N,   N,   N,   V,   V,   V,   N],
  storekeeper:           [V,   A,   A,   N,   N,   V,   N,   N,   N,   V,   A],
  qc_analyst:            [N,   V,   V,   A,   N,   V,   N,   A,   V,   V,   N],
  qa_officer:            [V,   V,   V,   V,   A,   V,   V,   A,   A,   V,   V],
  qa_manager:            [A,   V,   V,   V,   A,   V,   A,   A,   A,   A,   V],
  production_supervisor: [N,   N,   V,   N,   N,   A,   N,   A,   N,   V,   N],
  compliance_admin:      [V,   V,   V,   V,   V,   V,   V,   V,   V,   V,   V],
  management:            [V,   V,   V,   V,   V,   V,   V,   V,   V,   V,   V],
};

/**
 * Roles PM-03 does not tabulate.
 *
 * production_operator, regulatory_affairs and 'other' exist in this
 * codebase and have no row in the design. They are NOT given a row
 * here: inventing one would be inventing a permission set, and the
 * instruction is to name the gap instead. They fall to the default
 * below, which withholds rather than grants.
 */
export const ROLES_NOT_IN_PM03: WorkRole[] = [
  'production_operator', 'regulatory_affairs', 'other',
];

/**
 * What this role holds on this section, today.
 *
 * FAILS CLOSED. A role with no row returns 'none'. That is the right
 * default for a quality system — the cost of withholding a section from
 * somebody who should have it is a conversation, and the cost of
 * granting one is a record nobody should have been able to touch.
 */
export function sectionAccess(role: WorkRole | null | undefined, section: PmSection): Access {
  if (!role) return 'none';
  const row = GRID[role];
  if (!row) return 'none';
  return row[PM_SECTIONS.indexOf(section)] ?? 'none';
}

export function canView(role: WorkRole | null | undefined, section: PmSection): boolean {
  return sectionAccess(role, section) !== 'none';
}

export function canAct(role: WorkRole | null | undefined, section: PmSection): boolean {
  return sectionAccess(role, section) === 'act';
}

/**
 * The audit trail, which PM-03 holds out of the grid as "a separate
 * switch". It is not derived from any cell, so it is answered here
 * rather than faked as a twelfth column.
 *
 * WHAT THE DESIGN DOES NOT SAY is who holds that switch by default.
 * Until it does, this reads the existing navigation permission
 * (canViewAuditTrail), which is where that decision already lives —
 * rather than this module inventing a second answer that would quietly
 * disagree with it.
 */
export function auditTrailVisible(existingCanViewAuditTrail: boolean): boolean {
  return existingCanViewAuditTrail;
}

/**
 * Which PM-03 section governs a page.
 *
 * ONLY PAGES THE DESIGN TABULATES APPEAR HERE. Instruments, In-process
 * checks, Master formulas, Change control, SOP library, GMP inspection
 * and the rest are real pages that PM-03 does not describe. Mapping
 * them onto a neighbouring column would be inventing a rule and calling
 * it the design's, so they are absent and keep whatever gating they
 * already had. They are listed in PAGES_NOT_IN_PM03 so the gap is
 * visible rather than implied by an omission.
 */
export const PAGE_SECTION: Record<string, PmSection> = {
  'supplier-qualification': 'suppliers',
  'goods-receipt':          'goods_receipt',
  'materials':              'material_lots',
  'qc-testing':             'qc_testing',
  'qa-disposition':         'qa_disposition',
  'batch-execution':        'batch_records',
  'batch-release':          'batch_release',
  'deviations':             'deviation_capa',
  'capa-management':        'deviation_capa',
  'coa':                    'coa_register',
  'traceability':           'traceability',
};

/** Built pages with no column in PM-03. Named, not silently omitted. */
export const PAGES_NOT_IN_PM03 = [
  'instruments', 'in-process', 'master-formulas', 'change-control',
  'sop-library', 'gmp-inspection', 'products', 'license-vault',
  'access-control', 'my-tasks',
];

/**
 * Whether this role may open this page at all.
 *
 * Returns true for a page PM-03 does not govern: this function answers
 * only the design's question, and a page outside the grid is decided by
 * the caller's own rules. It must NOT be read as "anyone may open
 * anything not in the grid".
 */
export function canOpenPage(role: WorkRole | null | undefined, pageId: string): boolean {
  const section = PAGE_SECTION[pageId];
  if (!section) return true;
  return canView(role, section);
}

/**
 * Whether this profile must be refused this page.
 *
 * ONE IMPLEMENTATION, CALLED FROM EVERY PLACE THAT ROUTES. The guard
 * lived inline in App.tsx first, which meant the local render harness
 * mounted pages without it and reported a Storekeeper reaching QA
 * disposition as a pass — the harness was testing itself. A refusal
 * that only one caller performs is a refusal nobody can verify, so it
 * is a function and both callers use it.
 *
 * Returns false when no work role resolves, for the reason given on
 * resolveWorkRole: the design rules on its eight roles and is silent
 * about an unassigned one.
 */
export function pageRefused(profile: unknown, pageId: string): boolean {
  const role = resolveWorkRole(profile);
  return role !== null && !canOpenPage(role, pageId);
}

/**
 * The role a profile actually holds, as a WorkRole.
 *
 * company_members.role is the per-workspace job and is what PM-03 is
 * about; profiles.role is the platform-wide account type and is the
 * fallback. Both are read defensively because one is an enum on the
 * live database and text in a from-scratch build, and because older
 * rows carry spellings like "QA Manager" and "qa-manager".
 */
export function resolveWorkRole(profile: unknown): WorkRole | null {
  const p = (profile ?? {}) as Record<string, unknown>;
  const raw = (p.company_role ?? p.work_role ?? p.role ?? '') as string;
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return null;
  if (key in GRID) return key as WorkRole;
  //  Spellings seen on existing rows, mapped to the design's roles.
  const ALIAS: Record<string, WorkRole> = {
    qa: 'qa_officer',
    quality_manager: 'qa_manager',
    quality: 'qa_officer',
    store_keeper: 'storekeeper',
    stores: 'storekeeper',
    qc: 'qc_analyst',
    production: 'production_supervisor',
    admin: 'compliance_admin',
    owner: 'compliance_admin',
    compliance: 'compliance_admin',
    compliance_officer: 'compliance_admin',
    exec: 'management',
    executive: 'management',
  };
  return ALIAS[key] ?? null;
}
