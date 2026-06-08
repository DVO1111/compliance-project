import { supabase } from './supabase';
import { recordAuditEvent } from './auditService';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type ApplicationType = 'new_registration' | 'renewal' | 'variation' | 'generic';
export type DossierStatus =
  | 'preparation' | 'screening' | 'screening_cleared'
  | 'under_review' | 'approved' | 'rejected' | 'withdrawn';
export type ModuleStatus = 'not_started' | 'in_progress' | 'complete' | 'not_applicable';
export type DocumentStatus = 'missing' | 'draft' | 'complete' | 'not_applicable';

export interface CTDDossier {
  id: string;
  company_id: string;
  product_name: string;
  active_ingredient: string | null;
  dosage_form: string;
  strength: string | null;
  nafdac_number: string | null;
  application_type: ApplicationType;
  status: DossierStatus;
  target_submission_date: string | null;
  submission_date: string | null;
  screening_date: string | null;
  screening_clearance_date: string | null;
  expected_approval_date: string | null;
  dossier_reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CTDModuleProgress {
  id: string;
  dossier_id: string;
  company_id: string;
  module_number: 1 | 2 | 3 | 4 | 5;
  status: ModuleStatus;
  completion_pct: number;
  notes: string | null;
  updated_at: string;
}

export interface CTDDocument {
  id: string;
  dossier_id: string;
  company_id: string;
  module_number: number;
  document_name: string;
  is_required: boolean;
  status: DocumentStatus;
  file_url: string | null;
  notes: string | null;
  updated_at: string;
}

/* ── Reference data ─────────────────────────────────────────────────────────── */

export const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  new_registration: 'New Registration',
  renewal:          'Renewal',
  variation:        'Variation',
  generic:          'Generic (Abridged)',
};

export const DOSSIER_STATUS_LABELS: Record<DossierStatus, string> = {
  preparation:        'In Preparation',
  screening:          'Screening Submitted',
  screening_cleared:  'Screening Cleared',
  under_review:       'Under NAFDAC Review',
  approved:           'Approved',
  rejected:           'Rejected',
  withdrawn:          'Withdrawn',
};

export const DOSSIER_STATUS_COLORS: Record<DossierStatus, string> = {
  preparation:        'bg-[var(--color-surface-alt)] text-[var(--color-text-secondary)]',
  screening:          'bg-[var(--color-info-soft)] text-[var(--color-info)]',
  screening_cleared:  'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  under_review:       'bg-[var(--color-info-soft)] text-[var(--color-info)]',
  approved:           'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  rejected:           'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  withdrawn:          'bg-[var(--color-surface-alt)] text-[var(--color-text-tertiary)]',
};

export const MODULE_NAMES: Record<number, string> = {
  1: 'Module 1 — Administrative & Regional',
  2: 'Module 2 — Common Technical Summaries',
  3: 'Module 3 — Quality (CMC)',
  4: 'Module 4 — Non-clinical Study Reports',
  5: 'Module 5 — Clinical Study Reports',
};

export const MODULE_WEIGHTS: Record<number, number> = {
  1: 0.20,
  2: 0.15,
  3: 0.35,
  4: 0.15,
  5: 0.15,
};

export const MODULE_DESCRIPTIONS: Record<number, string> = {
  1: 'NAFDAC application forms, CPP, GMP evidence, labelling, authorisation letters',
  2: 'Quality Overall Summary (QOS), non-clinical & clinical overviews and summaries',
  3: 'Drug substance (3.2.S), drug product (3.2.P), and appendices — the CMC section',
  4: 'Pharmacology, pharmacokinetics, and toxicology study reports',
  5: 'Clinical study reports; for generics, bioequivalence study report',
};

/* Standard NAFDAC CTD document checklist by application type */
const BASE_DOCUMENTS: Record<number, { name: string; required: boolean }[]> = {
  1: [
    { name: 'NAFDAC Application Form (NRVC/GEN)', required: true },
    { name: 'Cover Letter', required: true },
    { name: 'Certificate of Pharmaceutical Product (CPP)', required: true },
    { name: 'Free Sale Certificate', required: true },
    { name: 'GMP Certificate / Evidence of GMP Compliance', required: true },
    { name: 'Notarized Authorization / Power of Attorney', required: true },
    { name: 'Certificate of Incorporation (local agent)', required: true },
    { name: 'Product Information Leaflet (PIL)', required: true },
    { name: 'Outer Carton Artwork', required: true },
    { name: 'Immediate Container Label', required: true },
    { name: 'Evidence of Payment of Assessment Fee', required: true },
    { name: 'Trademark Certificate (if applicable)', required: false },
  ],
  2: [
    { name: 'Quality Overall Summary (QOS / Module 2.3)', required: true },
    { name: 'Non-clinical Overview (Module 2.4)', required: true },
    { name: 'Clinical Overview (Module 2.5)', required: true },
    { name: 'Non-clinical Written & Tabulated Summaries (Module 2.6)', required: true },
    { name: 'Clinical Summary (Module 2.7)', required: true },
  ],
  3: [
    { name: '3.2.S Drug Substance — General Information', required: true },
    { name: '3.2.S Drug Substance — Manufacture', required: true },
    { name: '3.2.S Drug Substance — Characterisation', required: true },
    { name: '3.2.S Drug Substance — Control of Drug Substance', required: true },
    { name: '3.2.S Drug Substance — Reference Standards', required: true },
    { name: '3.2.S Drug Substance — Container Closure System', required: true },
    { name: '3.2.S Drug Substance — Stability', required: true },
    { name: '3.2.P Drug Product — Description and Composition', required: true },
    { name: '3.2.P Drug Product — Pharmaceutical Development', required: true },
    { name: '3.2.P Drug Product — Manufacture', required: true },
    { name: '3.2.P Drug Product — Control of Excipients', required: true },
    { name: '3.2.P Drug Product — Control of Drug Product', required: true },
    { name: '3.2.P Drug Product — Reference Standards', required: true },
    { name: '3.2.P Drug Product — Container Closure System', required: true },
    { name: '3.2.P Drug Product — Stability', required: true },
    { name: '3.2.A Appendices (e.g., Extractables & Leachables)', required: false },
  ],
  4: [
    { name: 'Pharmacology Study Reports', required: true },
    { name: 'Pharmacokinetics Study Reports', required: true },
    { name: 'Toxicology Study Reports (including carcinogenicity)', required: true },
    { name: 'Genotoxicity Studies', required: true },
    { name: 'Reproductive & Developmental Toxicity', required: false },
  ],
  5: [
    { name: 'Tabular Listing of All Clinical Studies', required: true },
    { name: 'Bioequivalence Study Report (generics)', required: true },
    { name: 'Bioavailability Study Report', required: false },
    { name: 'Clinical Study Reports (Phase I–III)', required: false },
    { name: 'Literature References (published studies)', required: false },
    { name: 'Post-marketing Study Reports (renewals/variations)', required: false },
  ],
};

// Modules that are not applicable by application type
const NOT_APPLICABLE_MODULES: Record<ApplicationType, number[]> = {
  new_registration: [],
  renewal:          [4],
  variation:        [],
  generic:          [4],
};

/* ── Computed helpers ───────────────────────────────────────────────────────── */

export function calcReadinessScore(modules: CTDModuleProgress[]): number {
  if (modules.length === 0) return 0;
  let score = 0;
  let totalWeight = 0;
  for (const mod of modules) {
    if (mod.status === 'not_applicable') continue;
    const w = MODULE_WEIGHTS[mod.module_number] ?? 0.20;
    score += (mod.completion_pct / 100) * w;
    totalWeight += w;
  }
  return totalWeight === 0 ? 0 : Math.round((score / totalWeight) * 100);
}

export function getDaysUntilSubmission(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

export function getSubmissionUrgency(days: number | null): 'safe' | 'warning' | 'urgent' | 'overdue' {
  if (days === null) return 'safe';
  if (days < 0)   return 'overdue';
  if (days < 30)  return 'urgent';
  if (days < 90)  return 'warning';
  return 'safe';
}

/* ── CRUD ───────────────────────────────────────────────────────────────────── */

export async function getDossiers(companyId: string): Promise<CTDDossier[]> {
  const { data, error } = await (supabase as any)
    .from('ctd_dossiers')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getDossiers', error); return []; }
  return data ?? [];
}

export async function createDossier(
  dossier: Omit<CTDDossier, 'id' | 'created_at' | 'updated_at'>,
  userId: string,
): Promise<CTDDossier | null> {
  const { data, error } = await (supabase as any)
    .from('ctd_dossiers')
    .insert({ ...dossier, created_by: userId })
    .select()
    .single();
  if (error) { console.error('createDossier', error); return null; }

  // Seed module progress rows
  const modules = [1, 2, 3, 4, 5] as const;
  const naModules = NOT_APPLICABLE_MODULES[dossier.application_type] ?? [];
  const moduleRows = modules.map(n => ({
    dossier_id: data.id,
    company_id: dossier.company_id,
    module_number: n,
    status: naModules.includes(n) ? 'not_applicable' : 'not_started',
    completion_pct: 0,
  }));
  await (supabase as any).from('ctd_module_progress').insert(moduleRows);

  // Seed document checklist
  const docRows: object[] = [];
  for (const [modStr, docs] of Object.entries(BASE_DOCUMENTS)) {
    const mod = Number(modStr);
    const isNA = naModules.includes(mod);
    for (const doc of docs) {
      docRows.push({
        dossier_id: data.id,
        company_id: dossier.company_id,
        module_number: mod,
        document_name: doc.name,
        is_required: doc.required,
        status: isNA ? 'not_applicable' : 'missing',
      });
    }
  }
  await (supabase as any).from('ctd_documents').insert(docRows);

  try {
    await recordAuditEvent({
      companyId: dossier.company_id,
      userId,
      action: `ctd.dossier_created: ${dossier.product_name} (${APPLICATION_TYPE_LABELS[dossier.application_type]})`,
      entityType: 'ctd_dossier',
      entityId: data.id,
      metadata: { product: dossier.product_name, type: dossier.application_type },
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }

  return data;
}

export async function updateDossierStatus(
  dossierId: string,
  status: DossierStatus,
  extra: Partial<Pick<CTDDossier, 'submission_date' | 'screening_date' | 'screening_clearance_date' | 'expected_approval_date'>>,
  companyId: string,
  userId: string,
): Promise<void> {
  await (supabase as any)
    .from('ctd_dossiers')
    .update({ status, ...extra, updated_at: new Date().toISOString() })
    .eq('id', dossierId);

  try {
    await recordAuditEvent({
      companyId,
      userId,
      action: `ctd.status_changed: ${DOSSIER_STATUS_LABELS[status]}`,
      entityType: 'ctd_dossier',
      entityId: dossierId,
      metadata: { status },
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }
}

export async function deleteDossier(
  dossierId: string,
  companyId: string,
  userId: string,
): Promise<void> {
  try {
    await recordAuditEvent({
      companyId,
      userId,
      action: 'ctd.dossier_deleted',
      entityType: 'ctd_dossier',
      entityId: dossierId,
      metadata: {},
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }
  await (supabase as any).from('ctd_dossiers').delete().eq('id', dossierId);
}

export async function getModuleProgress(dossierId: string): Promise<CTDModuleProgress[]> {
  const { data, error } = await (supabase as any)
    .from('ctd_module_progress')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('module_number');
  if (error) { console.error('getModuleProgress', error); return []; }
  return data ?? [];
}

export async function updateModuleProgress(
  moduleId: string,
  status: ModuleStatus,
  completionPct: number,
  notes: string | null,
): Promise<void> {
  await (supabase as any)
    .from('ctd_module_progress')
    .update({ status, completion_pct: completionPct, notes, updated_at: new Date().toISOString() })
    .eq('id', moduleId);
}

export async function getDocuments(dossierId: string): Promise<CTDDocument[]> {
  const { data, error } = await (supabase as any)
    .from('ctd_documents')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('module_number');
  if (error) { console.error('getDocuments', error); return []; }
  return data ?? [];
}

export async function updateDocumentStatus(
  docId: string,
  status: DocumentStatus,
  notes: string | null,
): Promise<void> {
  await (supabase as any)
    .from('ctd_documents')
    .update({ status, notes, updated_at: new Date().toISOString() })
    .eq('id', docId);
}
