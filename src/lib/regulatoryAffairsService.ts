/**
 * Regulatory Affairs Service
 *
 * Covers three pre-meeting builds:
 *  1. NAPAMS application submission tracking
 *  2. Structured NAFDAC/SON licence records with expiry monitoring
 *  3. Per-product-category labelling compliance requirements
 */

import { logger } from './logger';

async function db() {
  const { supabase } = await import('./supabase');
  return supabase;
}

async function logAudit(params: {
  userId: string; companyId: string; action: string;
  entityType: string; entityId: string; metadata?: Record<string, unknown>;
}) {
  try {
    const { recordAuditEvent } = await import('./auditService');
    await recordAuditEvent(params);
  } catch { /* audit failure must never block the main operation */ }
}

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type ProductCategory =
  | 'food' | 'drug_pharmaceutical' | 'cosmetic'
  | 'medical_device' | 'veterinary' | 'biologic_vaccine'
  | 'agro_chemical' | 'other';

export type SubmissionType = 'local_manufacture' | 'importation' | 'export';

export type RegulatoryBody = 'nafdac' | 'son' | 'nafdac_son' | 'ministry_of_health';

export type SubmissionStatus =
  | 'draft' | 'submitted' | 'division_review' | 'inspection_scheduled'
  | 'inspection_completed' | 'lab_testing' | 'fdrc_committee'
  | 'approved' | 'rejected' | 'compliance_directive' | 'withdrawn';

export type LicenceType =
  | 'nafdac_product_registration'
  | 'nafdac_site_manufacturing_licence'
  | 'nafdac_gmp_certificate'
  | 'nafdac_import_permit'
  | 'son_mancap_approval'
  | 'son_nis_certification'
  | 'ministry_health_licence'
  | 'other';

export interface DocumentCheckStatus {
  is_present: boolean;
  notes: string;
  file_url: string | null;
}

export interface RegulatorySubmission {
  id: string;
  company_id: string;
  product_name: string;
  product_category: ProductCategory;
  submission_type: SubmissionType;
  regulatory_body: RegulatoryBody;
  napams_reference: string | null;
  current_status: SubmissionStatus;
  document_checklist: Record<string, DocumentCheckStatus>;
  submitted_date: string | null;
  approved_date: string | null;
  registration_number: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatusLogEntry {
  id: string;
  submission_id: string;
  from_status: string | null;
  to_status: string;
  notes: string | null;
  updated_by: string | null;
  created_at: string;
}

export interface RegulatoryLicence {
  id: string;
  company_id: string;
  licence_type: LicenceType;
  name: string;
  product_name: string | null;
  registration_number: string | null;
  regulatory_body: string;
  issue_date: string | null;
  expiry_date: string | null;
  renewal_lead_days: number;
  file_name: string | null;
  file_url: string | null;
  submission_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/* ── Status metadata ───────────────────────────────────────────────────────── */

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft:                'Draft',
  submitted:            'Submitted to NAPAMS',
  division_review:      'Division Review',
  inspection_scheduled: 'Inspection Scheduled',
  inspection_completed: 'Inspection Completed',
  lab_testing:          'Lab Testing',
  fdrc_committee:       'FDRC Committee',
  approved:             'Approved',
  rejected:             'Rejected',
  compliance_directive: 'Compliance Directive',
  withdrawn:            'Withdrawn',
};

export const STATUS_COLORS: Record<SubmissionStatus, string> = {
  draft:                'text-gray-600 bg-gray-100',
  submitted:            'text-blue-700 bg-blue-100',
  division_review:      'text-blue-700 bg-blue-100',
  inspection_scheduled: 'text-amber-700 bg-amber-100',
  inspection_completed: 'text-amber-700 bg-amber-100',
  lab_testing:          'text-purple-700 bg-purple-100',
  fdrc_committee:       'text-purple-700 bg-purple-100',
  approved:             'text-green-700 bg-green-100',
  rejected:             'text-red-700 bg-red-100',
  compliance_directive: 'text-orange-700 bg-orange-100',
  withdrawn:            'text-gray-500 bg-gray-100',
};

// Ordered workflow stages for the timeline
export const STATUS_TIMELINE: SubmissionStatus[] = [
  'draft', 'submitted', 'division_review', 'inspection_scheduled',
  'inspection_completed', 'lab_testing', 'fdrc_committee', 'approved',
];

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  food:               'Food Product',
  drug_pharmaceutical:'Drug / Pharmaceutical',
  cosmetic:           'Cosmetic',
  medical_device:     'Medical Device',
  veterinary:         'Veterinary Product',
  biologic_vaccine:   'Biologic / Vaccine',
  agro_chemical:      'Agro-Chemical',
  other:              'Other',
};

export const LICENCE_TYPE_LABELS: Record<LicenceType, string> = {
  nafdac_product_registration:      'NAFDAC Product Registration',
  nafdac_site_manufacturing_licence:'NAFDAC Site Manufacturing Licence',
  nafdac_gmp_certificate:           'NAFDAC GMP Certificate',
  nafdac_import_permit:             'NAFDAC Import Permit',
  son_mancap_approval:              'SON MAN CAP Approval',
  son_nis_certification:            'SON NIS Certification',
  ministry_health_licence:          'Ministry of Health Licence',
  other:                            'Other',
};

/* ── Document Checklists ───────────────────────────────────────────────────── */

export interface ChecklistItem {
  name: string;
  required: boolean;
  description: string;
}

const CHECKLISTS: Record<string, ChecklistItem[]> = {
  food_local_manufacture: [
    { name: 'NAPAMS Application Form',           required: true,  description: 'Completed and signed NAPAMS product registration form' },
    { name: 'CAC Certificate of Incorporation',  required: true,  description: 'Current CAC registration certificate for the company' },
    { name: 'Evidence of Payment',               required: true,  description: 'NAFDAC application fee payment receipt' },
    { name: 'Product Label / Artwork',           required: true,  description: 'Draft label showing all mandatory NAFDAC labelling information' },
    { name: 'Product Specification Sheet',       required: true,  description: 'Technical spec including ingredients, process, and shelf life' },
    { name: 'Process Flow Diagram',              required: true,  description: 'Full manufacturing process from raw material to finished product' },
    { name: 'Ingredient List with Quantities',   required: true,  description: 'All ingredients with percentage or quantity per batch' },
    { name: 'Certificate of Analysis (CoA)',     required: true,  description: 'CoA from a NAFDAC-accredited laboratory' },
    { name: 'GMP Inspection Request Letter',     required: true,  description: 'Formal request to NAFDAC for GMP facility inspection' },
    { name: 'Nutritional Analysis Report',       required: false, description: 'Required for functional foods and products with nutritional claims' },
    { name: 'HACCP Plan',                        required: false, description: 'Required for high-risk food categories (meat, dairy, etc.)' },
  ],
  food_importation: [
    { name: 'NAPAMS Application Form',           required: true,  description: 'Completed NAPAMS import registration application' },
    { name: 'CAC Certificate of Incorporation',  required: true,  description: 'CAC registration of the Nigerian importer' },
    { name: 'Evidence of Payment',               required: true,  description: 'NAFDAC application fee payment receipt' },
    { name: 'Power of Attorney',                 required: true,  description: 'Issued by the foreign brand owner / manufacturer to the Nigerian importer — NOT a Contract Manufacturing Agreement' },
    { name: 'Certificate of Free Sale',          required: true,  description: 'Issued by the relevant competent authority in the country of manufacture' },
    { name: 'GMP Invitation Letter',             required: true,  description: 'Issued by the foreign manufacturer to NAFDAC inviting overseas GMP inspection' },
    { name: 'Product Label / Artwork',           required: true,  description: 'Label adapted for the Nigerian market with all mandatory information' },
    { name: 'Product Specification Sheet',       required: true,  description: 'Technical specification from the foreign manufacturer' },
    { name: 'Certificate of Analysis (CoA)',     required: true,  description: 'CoA from manufacturer and/or accredited laboratory' },
    { name: 'Import Permit Application',         required: true,  description: 'Application for NAFDAC import permit' },
    { name: 'Contract Manufacturing Agreement',  required: false, description: 'Required only if the Nigerian company manufactures under licence from the brand owner' },
    { name: 'Trademark Registration Certificate',required: false, description: 'Brand trademark registration if asserting IP ownership' },
  ],
  drug_pharmaceutical_local_manufacture: [
    { name: 'CTD Dossier (Modules 1–5)',         required: true,  description: 'Common Technical Document format dossier — obtain screening clearance BEFORE submitting full application' },
    { name: 'NAPAMS Screening Clearance Letter', required: true,  description: 'NAFDAC screening clearance for the dossier — required before full application window opens' },
    { name: 'NAPAMS Application Form',           required: true,  description: 'Completed pharmaceutical drug registration application' },
    { name: 'CAC Certificate of Incorporation',  required: true,  description: 'Current company CAC registration' },
    { name: 'NAFDAC Site Manufacturing Licence', required: true,  description: 'Current NAFDAC manufacturing licence for the facility' },
    { name: 'Evidence of Payment',               required: true,  description: 'Registration fee payment receipt' },
    { name: 'GMP Inspection Report (NAFDAC)',    required: true,  description: 'Satisfactory GMP inspection report from NAFDAC Drug Inspectorate' },
    { name: 'Product Label & Patient Info Leaflet', required: true, description: 'Draft label and PIL meeting NAFDAC pharma labelling requirements' },
    { name: 'Finished Product Specification',    required: true,  description: 'Specification with analytical methods and acceptance criteria' },
    { name: 'Certificate of Analysis',           required: true,  description: 'CoA from QC laboratory for the registration batch' },
    { name: 'Stability Study Data',              required: true,  description: 'Real-time and accelerated stability data supporting proposed shelf life' },
    { name: 'Pharmacovigilance Plan',            required: true,  description: 'Post-market safety monitoring plan' },
    { name: 'Manufacturing Process Validation',  required: false, description: 'Process validation report for sterile and high-risk products' },
  ],
  drug_pharmaceutical_importation: [
    { name: 'CTD Dossier (Modules 1–5)',         required: true,  description: 'CTD dossier — screening clearance required first' },
    { name: 'NAPAMS Screening Clearance Letter', required: true,  description: 'NAFDAC screening clearance before full application' },
    { name: 'NAPAMS Application Form',           required: true,  description: 'Import drug registration application' },
    { name: 'CAC Certificate of Incorporation',  required: true,  description: 'Nigerian importer CAC registration' },
    { name: 'Power of Attorney',                 required: true,  description: 'From originator / brand owner to Nigerian importer' },
    { name: 'Certificate of Free Sale / Marketing Authorisation', required: true, description: 'From the competent regulatory authority in the country of origin' },
    { name: 'GMP Invitation Letter',             required: true,  description: 'From the foreign manufacturer to NAFDAC for overseas GMP inspection' },
    { name: 'SmPC (Summary of Product Characteristics)', required: true, description: 'Approved SmPC from the originating regulatory authority' },
    { name: 'Patient Information Leaflet',       required: true,  description: 'PIL adapted for the Nigerian market' },
    { name: 'Evidence of Payment',               required: true,  description: 'Registration fee payment receipt' },
    { name: 'Stability Data',                    required: true,  description: 'Data supporting proposed shelf life under Nigerian climate conditions' },
  ],
  cosmetic_local_manufacture: [
    { name: 'NAPAMS Application Form',           required: true,  description: 'Completed cosmetics registration application' },
    { name: 'CAC Certificate of Incorporation',  required: true,  description: 'Current company CAC registration' },
    { name: 'NAFDAC Manufacturing Licence',      required: true,  description: 'Current NAFDAC manufacturing licence for cosmetics' },
    { name: 'Evidence of Payment',               required: true,  description: 'Registration fee payment receipt' },
    { name: 'GMP Inspection Report (DERD)',      required: true,  description: 'GMP inspection by NAFDAC Drug Evaluation and Research Directorate' },
    { name: 'Product Label / Artwork',           required: true,  description: 'Label meeting NAFDAC cosmetics labelling requirements' },
    { name: 'Product Specification (INCI list)', required: true,  description: 'Full INCI ingredient list, intended use, and preservation system' },
    { name: 'Cosmetic Safety Assessment',        required: true,  description: 'Safety assessment report by a qualified cosmetic safety assessor' },
    { name: 'Certificate of Analysis',           required: true,  description: 'Microbiological and physico-chemical CoA' },
    { name: 'Preservative Efficacy / Challenge Test', required: false, description: 'Recommended for water-based and leave-on cosmetics' },
  ],
  cosmetic_importation: [
    { name: 'NAPAMS Application Form',           required: true,  description: 'Completed import cosmetics registration' },
    { name: 'CAC Certificate of Incorporation',  required: true,  description: 'Nigerian importer CAC registration' },
    { name: 'Power of Attorney',                 required: true,  description: 'From brand owner to Nigerian importer' },
    { name: 'Certificate of Free Sale',          required: true,  description: 'From competent authority in country of manufacture' },
    { name: 'GMP Invitation Letter',             required: true,  description: 'For DERD overseas GMP inspection of foreign manufacturing site' },
    { name: 'Evidence of Payment',               required: true,  description: 'Registration fee payment receipt' },
    { name: 'Product Label / Artwork',           required: true,  description: 'Label adapted for Nigerian market' },
    { name: 'Product Specification (INCI list)', required: true,  description: 'Full INCI list and product details from manufacturer' },
    { name: 'Cosmetic Safety Assessment',        required: true,  description: 'Safety assessment document' },
    { name: 'Certificate of Analysis',           required: true,  description: 'CoA from manufacturer' },
  ],
};

export function getChecklist(category: ProductCategory, type: SubmissionType): ChecklistItem[] {
  const key = `${category}_${type}`;
  return CHECKLISTS[key] ?? CHECKLISTS[`${category}_local_manufacture`] ?? [];
}

/* ── Labelling Requirements ────────────────────────────────────────────────── */

export interface LabellingRequirement {
  field: string;
  required: boolean;
  note: string;
  category_note?: string;
}

export const LABELLING_REQUIREMENTS: Record<string, LabellingRequirement[]> = {
  food: [
    { field: 'Product name on principal panel',          required: true,  note: 'Must be prominent, legible, and not misleading' },
    { field: 'Net quantity / weight / volume',           required: true,  note: 'In metric units (g, kg, ml, L)' },
    { field: 'Ingredient list in descending order',      required: true,  note: 'All ingredients listed from most to least by weight' },
    { field: 'Allergen declaration',                     required: true,  note: 'Milk, soy, wheat/gluten, peanuts, tree nuts, seafood, eggs, sesame — must be explicitly declared' },
    { field: 'Nutritional information panel',            required: true,  note: 'Energy (kcal/kJ), protein, total fat, saturated fat, carbohydrates, sugars, sodium per 100g and per serving' },
    { field: 'Manufacturer / packer name and address',  required: true,  note: 'Full legal name and physical address — PO Box alone is not acceptable' },
    { field: 'Country of origin',                       required: true,  note: '"Made in Nigeria" or "Product of [country]"' },
    { field: 'Best before / expiry date',               required: true,  note: 'Format: DD/MM/YYYY or MM/YYYY minimum. "Best Before" for shelf-stable, "Use By" for perishable' },
    { field: 'Batch / lot number',                      required: true,  note: 'Traceable batch identifier — required for recall capability' },
    { field: 'Storage conditions',                      required: true,  note: 'e.g., "Store in a cool dry place below 25°C away from direct sunlight"' },
    { field: 'NAFDAC registration number',              required: true,  note: 'Format: NAFDAC Reg. No. XX-XXXX — must appear on the label' },
    { field: 'Directions for preparation / use',        required: false, note: 'Required for reconstituted products (baby food, instant noodles, drink powders)' },
    { field: 'Advisory / warning statements',           required: false, note: 'Required if product contains caffeine, alcohol, or is unsuitable for specific groups' },
    { field: 'Halal / Kosher / organic certification',  required: false, note: 'Only display if product holds a valid certification from an accredited body' },
  ],
  drug_pharmaceutical: [
    { field: 'Brand name / trade name',                 required: true,  note: 'On the principal panel' },
    { field: 'International Non-proprietary Name (INN)',required: true,  note: 'Generic / active ingredient name — must appear alongside brand name' },
    { field: 'Active ingredient(s) and strength',       required: true,  note: 'e.g., "Amoxicillin 500mg" — quantity per dosage unit' },
    { field: 'Dosage form',                             required: true,  note: 'e.g., "Capsules", "Oral Suspension", "Film-coated Tablets"' },
    { field: 'Directions for use / dosage',             required: true,  note: 'Adult and paediatric dose, frequency, and route of administration' },
    { field: 'Indications / intended use',              required: true,  note: 'Approved therapeutic indications only — no off-label claims' },
    { field: 'Contraindications and warnings',          required: true,  note: 'Key contraindications, precautions, and safety warnings' },
    { field: 'Side effects / adverse reactions',        required: true,  note: 'At minimum the most common or serious adverse reactions' },
    { field: 'Storage conditions',                      required: true,  note: 'Temperature, light, and humidity requirements' },
    { field: 'Manufacturer name and address',           required: true,  note: 'Including country of manufacture' },
    { field: 'NAFDAC registration number',              required: true,  note: 'NAFDAC Reg. No. must appear on primary packaging' },
    { field: 'Batch number and manufacturing date',     required: true,  note: 'For product traceability' },
    { field: 'Expiry date',                             required: true,  note: 'Format: MM/YYYY minimum' },
    { field: '"Keep out of reach of children" statement', required: true, note: 'Mandatory on all pharmaceutical products' },
    { field: 'Patient information leaflet (PIL)',       required: true,  note: 'Full PIL must be enclosed in secondary packaging' },
    { field: 'Prescription / OTC status',              required: true,  note: '"To be sold only on prescription of a medical practitioner" for Rx products' },
  ],
  cosmetic: [
    { field: 'Product name / function',                 required: true,  note: 'Trade name and cosmetic function (e.g., "Moisturising Lotion")' },
    { field: 'Full INCI ingredient list',               required: true,  note: 'All ingredients in descending order using INCI nomenclature' },
    { field: 'Manufacturer / responsible person name',  required: true,  note: 'Name and address of the EU/Nigerian responsible person or manufacturer' },
    { field: 'Net content by weight or volume',         required: true,  note: 'In metric units' },
    { field: 'Date of minimum durability / PAO',        required: true,  note: 'Best before date OR Period After Opening (PAO) symbol (e.g., "12M") for products stable > 30 months' },
    { field: 'Batch number',                            required: true,  note: 'For traceability and recall' },
    { field: 'Country of origin',                       required: true,  note: 'Country where the product was manufactured' },
    { field: 'NAFDAC registration number',              required: true,  note: 'NAFDAC Reg. No. must appear on the label' },
    { field: 'Directions for use',                      required: true,  note: 'How and where to apply the product' },
    { field: 'Precautions and warnings',                required: true,  note: '"For external use only", "Avoid contact with eyes", "Keep out of reach of children"' },
    { field: 'Skin test / patch test advisory',         required: false, note: 'Recommended for products with high fragrance or active ingredient concentration' },
    { field: 'SPF rating',                              required: false, note: 'Required only for products claiming sun protection; must be substantiated' },
  ],
};

export function getLabellingRequirements(category: ProductCategory): LabellingRequirement[] {
  return LABELLING_REQUIREMENTS[category] ?? LABELLING_REQUIREMENTS['food'];
}

/* ── Submissions CRUD ──────────────────────────────────────────────────────── */

export async function listSubmissions(
  companyId: string,
  status?: SubmissionStatus
): Promise<RegulatorySubmission[]> {
  let q = (await db() as any)
    .from('regulatory_submissions')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });
  if (status) q = q.eq('current_status', status);
  const { data, error } = await q;
  if (error) { logger.error('listSubmissions', error); return []; }
  return data ?? [];
}

export async function createSubmission(
  companyId: string,
  payload: {
    product_name: string;
    product_category: ProductCategory;
    submission_type: SubmissionType;
    regulatory_body: RegulatoryBody;
    napams_reference?: string;
    notes?: string;
    created_by: string;
  }
): Promise<RegulatorySubmission | null> {
  const checklist = getChecklist(payload.product_category, payload.submission_type);
  const checklistInit: Record<string, DocumentCheckStatus> = {};
  for (const item of checklist) {
    checklistInit[item.name] = { is_present: false, notes: '', file_url: null };
  }
  const { data, error } = await (await db() as any)
    .from('regulatory_submissions')
    .insert({ company_id: companyId, ...payload, document_checklist: checklistInit })
    .select('*')
    .single();
  if (error) { logger.error('createSubmission', error); return null; }
  await logAudit({
    userId: payload.created_by, companyId,
    action: 'create_regulatory_submission',
    entityType: 'regulatory_submission',
    entityId: data.id,
    metadata: { product_name: payload.product_name, product_category: payload.product_category, submission_type: payload.submission_type, regulatory_body: payload.regulatory_body },
  });
  return data;
}

export async function updateSubmissionStatus(
  id: string,
  newStatus: SubmissionStatus,
  notes: string,
  userId: string,
  extra?: { napams_reference?: string; registration_number?: string; expiry_date?: string; submitted_date?: string; approved_date?: string }
): Promise<boolean> {
  const client = await db() as any;
  const { data: current } = await client.from('regulatory_submissions').select('current_status, company_id, product_name').eq('id', id).single();
  const patch: any = { current_status: newStatus, updated_at: new Date().toISOString(), ...extra };
  if (newStatus === 'submitted' && !extra?.submitted_date) patch.submitted_date = new Date().toISOString().split('T')[0];
  if (newStatus === 'approved' && !extra?.approved_date) patch.approved_date = new Date().toISOString().split('T')[0];
  const { error } = await client.from('regulatory_submissions').update(patch).eq('id', id);
  if (error) { logger.error('updateSubmissionStatus', error); return false; }
  await client.from('submission_status_log').insert({
    submission_id: id, from_status: current?.current_status ?? null, to_status: newStatus,
    notes: notes || null, updated_by: userId,
  });
  await logAudit({
    userId, companyId: current?.company_id ?? '',
    action: 'update_submission_status',
    entityType: 'regulatory_submission',
    entityId: id,
    metadata: { from_status: current?.current_status, to_status: newStatus, product_name: current?.product_name, napams_reference: extra?.napams_reference, registration_number: extra?.registration_number },
  });
  return true;
}

export async function updateDocumentCheck(
  submissionId: string,
  documentName: string,
  isPresent: boolean,
  notes: string,
  fileUrl?: string
): Promise<boolean> {
  const client = await db() as any;
  const { data } = await client.from('regulatory_submissions').select('document_checklist').eq('id', submissionId).single();
  const checklist = { ...(data?.document_checklist ?? {}) };
  checklist[documentName] = { is_present: isPresent, notes, file_url: fileUrl ?? null };
  const { error } = await client.from('regulatory_submissions').update({ document_checklist: checklist, updated_at: new Date().toISOString() }).eq('id', submissionId);
  if (error) { logger.error('updateDocumentCheck', error); return false; }
  return true;
}

export async function getStatusLog(submissionId: string): Promise<StatusLogEntry[]> {
  const { data, error } = await (await db() as any)
    .from('submission_status_log')
    .select('*')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true });
  if (error) { logger.error('getStatusLog', error); return []; }
  return data ?? [];
}

export async function deleteSubmission(id: string): Promise<boolean> {
  const { error } = await (await db() as any).from('regulatory_submissions').delete().eq('id', id);
  if (error) { logger.error('deleteSubmission', error); return false; }
  return true;
}

/* ── Regulatory Licences CRUD ──────────────────────────────────────────────── */

export type LicenceStatus = 'active' | 'expiring' | 'expired' | 'no_expiry';

export function getLicenceStatus(expiryDate: string | null, leadDays = 90): LicenceStatus {
  if (!expiryDate) return 'no_expiry';
  const today = new Date();
  const expiry = new Date(expiryDate);
  const daysLeft = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= leadDays) return 'expiring';
  return 'active';
}

export const LICENCE_STATUS_COLORS: Record<LicenceStatus, string> = {
  active:    'text-green-700 bg-green-100',
  expiring:  'text-amber-700 bg-amber-100',
  expired:   'text-red-700 bg-red-100',
  no_expiry: 'text-gray-500 bg-gray-100',
};

export async function listLicences(companyId: string): Promise<RegulatoryLicence[]> {
  const { data, error } = await (await db() as any)
    .from('regulatory_licences')
    .select('*')
    .eq('company_id', companyId)
    .order('expiry_date', { ascending: true, nullsFirst: false });
  if (error) { logger.error('listLicences', error); return []; }
  return data ?? [];
}

export async function createLicence(
  companyId: string,
  payload: Omit<RegulatoryLicence, 'id' | 'company_id' | 'created_at'>
): Promise<RegulatoryLicence | null> {
  const { data, error } = await (await db() as any)
    .from('regulatory_licences')
    .insert({ company_id: companyId, ...payload })
    .select('*')
    .single();
  if (error) { logger.error('createLicence', error); return null; }
  if (payload.created_by) {
    await logAudit({
      userId: payload.created_by, companyId,
      action: 'create_regulatory_licence',
      entityType: 'regulatory_licence',
      entityId: data.id,
      metadata: { licence_type: payload.licence_type, name: payload.name, registration_number: payload.registration_number ?? null, expiry_date: payload.expiry_date ?? null, regulatory_body: payload.regulatory_body },
    });
  }
  return data;
}

export async function updateLicence(id: string, patch: Partial<RegulatoryLicence>): Promise<boolean> {
  const { error } = await (await db() as any).from('regulatory_licences').update(patch).eq('id', id);
  if (error) { logger.error('updateLicence', error); return false; }
  return true;
}

export async function deleteLicenceRecord(id: string): Promise<boolean> {
  const { error } = await (await db() as any).from('regulatory_licences').delete().eq('id', id);
  if (error) { logger.error('deleteLicenceRecord', error); return false; }
  return true;
}

export async function createLicenceFromApproval(
  companyId: string,
  submission: RegulatorySubmission,
  userId: string
): Promise<RegulatoryLicence | null> {
  return createLicence(companyId, {
    licence_type: 'nafdac_product_registration',
    name: `NAFDAC Registration — ${submission.product_name}`,
    product_name: submission.product_name,
    registration_number: submission.registration_number,
    regulatory_body: submission.regulatory_body,
    issue_date: submission.approved_date,
    expiry_date: submission.expiry_date,
    renewal_lead_days: 90,
    file_name: null,
    file_url: null,
    submission_id: submission.id,
    notes: null,
    created_by: userId,
  });
}
