/**
 * nafdacInspectionChecklist
 *
 * The document checklist a NAFDAC inspector requires on-site, taken verbatim
 * from the official inspection guidelines:
 *   - Pre-Registration Inspection  (DER-GDL-005-02, §2.7)
 *   - Pre-Production Inspection     (DER-GDL-008-02, §4 & §2.8)
 *
 * Each item is tagged with the app evidence that satisfies it, so the Audit
 * Prep module can show readiness (present / missing) at a glance. Items the app
 * doesn't hold are marked 'external' (managed / uploaded outside the platform).
 */

export type ReadinessEvidence =
  | 'batch_records'
  | 'coa'
  | 'raw_materials'
  | 'sops'
  | 'licences'
  | 'change_control'
  | 'external';

export interface ChecklistItem {
  /** Clause reference in the source guideline, e.g. "2.7.3". */
  ref: string;
  title: string;
  evidence: ReadinessEvidence;
  note?: string;
}

export interface ChecklistSection {
  title: string;
  source: string;
  items: ChecklistItem[];
}

export const NAFDAC_INSPECTION_CHECKLIST: ChecklistSection[] = [
  {
    title: 'Pre-Registration Inspection — Documents on site',
    source: 'DER-GDL-005-02 §2.7',
    items: [
      { ref: '2.7.1', title: 'Letter of Authority to Manufacture (formulation line)', evidence: 'licences' },
      { ref: '2.7.2', title: 'Current Annual PCN Licence to Practice — all Pharmacists', evidence: 'licences' },
      { ref: '2.7.3', title: 'Batch Manufacturing Record & Batch Packaging Record', evidence: 'batch_records' },
      { ref: '2.7.4', title: 'List of all company SOPs', evidence: 'sops' },
      { ref: '2.7.5', title: 'SOPs — Production-related processes', evidence: 'sops' },
      { ref: '2.7.6', title: 'SOPs — Quality Control processes', evidence: 'sops' },
      { ref: '2.7.7', title: 'SOPs — Quality Management activities', evidence: 'sops' },
      { ref: '2.7.8', title: 'SOPs — Material Management', evidence: 'sops' },
      { ref: '2.7.9', title: 'SOPs — Equipment Cleaning & Maintenance', evidence: 'sops' },
      { ref: '2.7.10', title: 'SOPs — Packaging & Labelling operations', evidence: 'sops' },
      { ref: '2.7.11', title: 'Production Process Validation evidence', evidence: 'external' },
      { ref: '2.7.12', title: 'Cleaning Validation of process equipment', evidence: 'external' },
      { ref: '2.7.13', title: 'List of Production & QC equipment + sources of purchase', evidence: 'external' },
      { ref: '2.7.14', title: 'Retainership Agreement with a Hospital/Clinic', evidence: 'external' },
      { ref: '2.7.15', title: 'Certificates of Medical Fitness for personnel', evidence: 'external', note: 'Sputum C&S, urinalysis, stool microscopy, chest X-ray, penicillin hypersensitivity (β-lactam), visual acuity' },
      { ref: '2.7.16', title: 'Certificates of Analysis — Raw Materials & Finished Products', evidence: 'coa' },
      { ref: '2.7.17', title: 'Product labels including Product Information Leaflets', evidence: 'external' },
      { ref: '2.8.1', title: 'Post-registration changes managed via change control', evidence: 'change_control' },
    ],
  },
  {
    title: 'Pre-Production Inspection — Documents on site',
    source: 'DER-GDL-008-02 §4 & §2.8',
    items: [
      { ref: '4.1', title: 'Site Master File', evidence: 'external' },
      { ref: '2.8.2', title: 'Evidence of company incorporation', evidence: 'external' },
      { ref: '4.2', title: 'Current PCN Licence — Superintendent & Production Pharmacists', evidence: 'licences' },
      { ref: '4.3', title: 'Letters of Appointment & Acceptance of key officers', evidence: 'external' },
      { ref: '4.4', title: 'Credentials of key officers', evidence: 'external' },
      { ref: '4.5', title: 'Job Descriptions for key personnel', evidence: 'external' },
      { ref: '2.8.4', title: 'Company Quality Manual', evidence: 'external' },
      { ref: '4.6', title: 'Validation Master Plan for the facility', evidence: 'external' },
      { ref: '4.7', title: 'Qualification of Production & Laboratory Equipment (DQ/IQ/OQ)', evidence: 'external' },
      { ref: '4.8', title: 'Analytical Method Validation / Verification', evidence: 'external' },
      { ref: '4.9', title: 'Water System Validation (where applicable)', evidence: 'external' },
      { ref: '4.10', title: 'List of Production & QC equipment + identification numbers', evidence: 'external' },
      { ref: '2.2', title: 'Factory layout — man/material flow, room class, pressure differentials', evidence: 'external' },
    ],
  },
];

/** Map an evidence key to a human label + which module holds it. */
export const EVIDENCE_LABELS: Record<ReadinessEvidence, string> = {
  batch_records: 'Batch Release',
  coa: 'Certificate of Analysis',
  raw_materials: 'Raw Material Receipts',
  sops: 'SOP Library',
  licences: 'License Vault',
  change_control: 'Change Control',
  external: 'Manual / external document',
};
