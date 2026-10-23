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

import { ROLE_LABELS, type WorkRole } from './permissionRequests';

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
  //  PM-03's eleventh column finally has a page. Before 20261111000000
  //  a Storekeeper held Act on Distribution with nowhere to exercise
  //  it, and DB-02's drawn Dispatch item had nothing to open.
  'dispatch':               'distribution',
};

/** Built pages with no column in PM-03. Named, not silently omitted. */
export const PAGES_NOT_IN_PM03 = [
  'product-specifications',
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
  //  Reads the whole set, not the sole role: somebody holding two roles
  //  may open a page either of them opens, and resolveWorkRole returns
  //  null for them — which would have refused nothing and shown
  //  everything.
  return !pageOpenableBy(resolveWorkRoles(profile), pageId);
}

/**
 * Spellings seen on existing rows, normalised to the design's roles.
 *
 * NORMALISATIONS ONLY. "QA Manager", "qa-manager" and "quality_manager"
 * are three ways of writing one job, so mapping them is reading the
 * data. `owner`, `admin` and `compliance_officer` are NOT: they are
 * membership and account types, and an earlier version of this table
 * mapped all three to `compliance_admin`.
 *
 * That was a conversion, and on the live project it was a consequential
 * one — every member there holds `owner`, so the whole workspace was
 * shown the compliance admin's navigation and dashboards while the
 * server abstained for them and granted nothing. The screen said one
 * thing and the database another.
 *
 * Membership roles resolve to no operational role, exactly as
 * app_work_roles does since 20261119000000.
 */
const ROLE_SPELLINGS: Record<string, WorkRole> = {
  qa: 'qa_officer',
  quality_manager: 'qa_manager',
  quality: 'qa_officer',
  store_keeper: 'storekeeper',
  stores: 'storekeeper',
  qc: 'qc_analyst',
  production: 'production_supervisor',
  compliance: 'compliance_admin',
  exec: 'management',
  executive: 'management',
};

function asWorkRole(raw: unknown): WorkRole | null {
  const key = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return null;
  if (key in GRID) return key as WorkRole;
  return ROLE_SPELLINGS[key] ?? null;
}

/**
 * Every operational role a person holds, sorted — the client's reading
 * of app_work_roles.
 *
 * `operational_roles` is the authoritative source and comes from
 * operational_role_assignments. The membership column is read only as
 * the same compatibility bridge the database keeps: it contributes a
 * value only when that value is already one of the eight, which no
 * company_role ever is.
 */
export function resolveWorkRoles(profile: unknown): WorkRole[] {
  const p = (profile ?? {}) as Record<string, unknown>;
  const out = new Set<WorkRole>();

  const assigned = p.operational_roles;
  if (Array.isArray(assigned)) {
    for (const r of assigned) {
      const role = asWorkRole(r);
      if (role) out.add(role);
    }
  }

  const bridged = asWorkRole(p.company_role ?? p.work_role ?? p.role);
  if (bridged) out.add(bridged);

  return [...out].sort();
}

/**
 * The sole role a profile holds, or null when it holds none or several.
 *
 * Narrowed to match app_work_role, which 20261119000000 deprecated for
 * the same reason: with several roles, answering with one of them makes
 * the caller's behaviour depend on which. Prefer resolveWorkRoles.
 */
export function resolveWorkRole(profile: unknown): WorkRole | null {
  const roles = resolveWorkRoles(profile);
  return roles.length === 1 ? roles[0] : null;
}

/**
 * What a set of roles holds on a section: the most permissive cell any
 * of them has, which is how app_section_access answers it.
 */
export function sectionAccessFor(roles: WorkRole[], section: PmSection): Access {
  let best: Access = 'none';
  for (const role of roles) {
    const held = sectionAccess(role, section);
    if (held === 'act') return 'act';
    if (held === 'view') best = 'view';
  }
  return best;
}

/** Whether any held role may open the page. */
export function pageOpenableBy(roles: WorkRole[], pageId: string): boolean {
  if (roles.length === 0) return true;
  return roles.some((r) => canOpenPage(r, pageId));
}


/**
 * The roles PM-03 gives `Act` on a section, named for a sentence.
 *
 * DERIVED, NOT TYPED OUT. A screen saying "reserved to the storekeeper
 * and the QA officer" is a second copy of one cell of the grid, and
 * the first version of the Dispatch page said exactly that while the
 * grid gave Act to the storekeeper alone. A sentence built from the
 * grid cannot disagree with it.
 */
export function actorsFor(section: PmSection): WorkRole[] {
  return (Object.keys(GRID) as WorkRole[]).filter((r) => canAct(r, section));
}

/** "the storekeeper", "the storekeeper and the QA officer". */
export function actorsSentence(section: PmSection): string {
  const names = actorsFor(section).map((r) => ROLE_LABELS[r] ?? r);
  if (names.length === 0) return 'nobody';
  if (names.length === 1) return `the ${names[0]!.toLowerCase()}`;
  const last = names.pop()!;
  return `the ${names.map((n) => n.toLowerCase()).join(', the ')} and the ${last.toLowerCase()}`;
}
