/**
 * GMP Inspection Readiness Service
 *
 * Inspection items are pre-defined in TypeScript based on NAFDAC GMP
 * inspection criteria described by a former NAFDAC inspector. The DB
 * only stores per-company readiness status — no seed data required.
 *
 * Nine inspection areas covering ~54 items across:
 * Site & Facility, Personnel & Training, Production Process,
 * Quality Control & Laboratory, Sanitation & Hygiene,
 * Documentation & Records, Warehouse & Materials,
 * Water & Utilities, NAFDAC-Specific Requirements.
 */

import { logger } from './logger';

async function db() {
  const { supabase } = await import('./supabase');
  return supabase;
}

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type ReadinessStatus = 'ready' | 'in_progress' | 'gap' | 'not_applicable';

export interface InspectionItem {
  id: string;
  area: string;
  title: string;
  description: string;
  isCritical: boolean;  // critical = immediate fail risk if gap
}

export interface ReadinessEntry {
  id: string;
  company_id: string;
  item_id: string;
  status: ReadinessStatus;
  notes: string | null;
  evidence_name: string | null;
  evidence_url: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface ItemWithStatus extends InspectionItem {
  status: ReadinessStatus;
  notes: string | null;
  evidence_name: string | null;
  evidence_url: string | null;
  entryId: string | null;
}

export interface AreaScore {
  area: string;
  total: number;
  ready: number;
  inProgress: number;
  gap: number;
  notApplicable: number;
  critical_gaps: number;
  score: number; // percentage of applicable items that are ready
  items: ItemWithStatus[];
}

export interface InspectionReport {
  companyId: string;
  generatedAt: string;
  overallScore: number;
  totalItems: number;
  readyCount: number;
  inProgressCount: number;
  gapCount: number;
  criticalGapCount: number;
  areas: AreaScore[];
}

/* ── Inspection item definitions ───────────────────────────────────────────── */

export const INSPECTION_ITEMS: InspectionItem[] = [

  // ── 1. Site & Facility ────────────────────────────────────────────────────
  { id: 'SITE-001', area: 'Site & Facility', isCritical: true,
    title: 'Site location — away from contamination sources',
    description: 'Manufacturing site must not be located near sewage treatment plants, refuse collection areas, flooding zones, or other sources of contamination. NAFDAC inspectors verify the site boundary on arrival.' },
  { id: 'SITE-002', area: 'Site & Facility', isCritical: true,
    title: 'Unidirectional personnel flow — separate entry and exit',
    description: 'Personnel must enter and exit the production floor through different routes to prevent cross-contamination from people moving in and out. The flow must be documented in a facility layout plan.' },
  { id: 'SITE-003', area: 'Site & Facility', isCritical: false,
    title: 'Pest control programme — documented and current',
    description: 'A written pest control programme must exist with a licensed contractor, current certification, and records of all treatments performed. Bait maps and trap logs must be available.' },
  { id: 'SITE-004', area: 'Site & Facility', isCritical: true,
    title: 'Cleanroom / production area — appropriate classification',
    description: 'Production environment classification must match the product type (e.g., Grade C/D for oral solid dosage, Grade A/B for sterile injectables, controlled area for food). Classification must be supported by environmental monitoring data.' },
  { id: 'SITE-005', area: 'Site & Facility', isCritical: false,
    title: 'Walls, floors, ceilings — cleanable non-shedding surfaces',
    description: 'All surfaces in production and QC areas must be smooth, impervious, and easy to clean. No cracks, peeling paint, or exposed pipework without protective casing.' },
  { id: 'SITE-006', area: 'Site & Facility', isCritical: false,
    title: 'Drainage, lighting, and ventilation adequate',
    description: 'Adequate drainage to prevent pooling. Sufficient lighting (min 300 lux general, 600 lux inspection). Ventilation prevents cross-contamination and maintains required conditions.' },

  // ── 2. Personnel & Training ───────────────────────────────────────────────
  { id: 'PERS-001', area: 'Personnel & Training', isCritical: true,
    title: 'GMP training records — all production staff, last 12 months',
    description: 'Every person working in manufacturing, QC, and warehouse must have documented GMP training completed within the last 12 months. Training records must be signed by both trainee and trainer.' },
  { id: 'PERS-002', area: 'Personnel & Training', isCritical: true,
    title: 'Gowning and PPE procedures — written and demonstrated',
    description: 'Written gowning/degowning procedure must exist and staff must follow it. NAFDAC inspectors ask to observe gowning in practice. Includes: production coat, headgear, nose mask, gloves, production footwear — no open shoes on the production floor.' },
  { id: 'PERS-003', area: 'Personnel & Training', isCritical: false,
    title: 'Health screening — medical fitness records for food handlers',
    description: 'Food handlers must have annual medical fitness certificates. Anyone with communicable diseases, open wounds, or skin conditions must be excluded from production. Records must be on file.' },
  { id: 'PERS-004', area: 'Personnel & Training', isCritical: false,
    title: 'Personnel entry and hygiene protocols posted',
    description: 'Handwashing procedure, hygiene requirements, and production area entry rules must be visibly posted at entry points. Inspectors check that signage matches actual practice.' },
  { id: 'PERS-005', area: 'Personnel & Training', isCritical: false,
    title: 'Visitors and contractor control policy',
    description: 'Written procedure for controlling visitors and contractors accessing production and QC areas. Includes gowning requirements, supervision requirements, and a visitor log.' },
  { id: 'PERS-006', area: 'Personnel & Training', isCritical: true,
    title: 'Superintendent Pharmacist — designated and on-site',
    description: 'A current PCN-registered Superintendent Pharmacist must be designated and physically present during production operations. Name and PCN registration number must be on file.' },

  // ── 3. Production Process ─────────────────────────────────────────────────
  { id: 'PROD-001', area: 'Production Process', isCritical: true,
    title: 'Master Manufacturing Formula (MMF) — approved and current',
    description: 'A Master Manufacturing Formula must exist for each product, approved by QA, showing formulation, batch size, manufacturing steps, in-process controls, and yield limits. Must be version-controlled.' },
  { id: 'PROD-002', area: 'Production Process', isCritical: true,
    title: 'Batch Manufacturing Records — complete and reviewed',
    description: 'Every batch must have a completed Batch Manufacturing Record with actual quantities recorded, deviations noted, in-process results, and QA review signature. Inspectors review BMRs for the last 3–5 batches.' },
  { id: 'PROD-003', area: 'Production Process', isCritical: true,
    title: 'Line clearance procedure — records for each batch',
    description: 'Line clearance must be performed and documented before each production run to prevent mix-ups and cross-contamination. Records must show: previous product removed, equipment cleaned, area signed off by QA.' },
  { id: 'PROD-004', area: 'Production Process', isCritical: false,
    title: 'Weighing and dispensing — controlled and witnessed',
    description: 'All raw material weighing must be performed in a controlled area with a second person check. Dispensing records must show: material name, batch number, quantity dispensed, operator, and checker.' },
  { id: 'PROD-005', area: 'Production Process', isCritical: false,
    title: 'In-process controls — defined with acceptance criteria',
    description: 'In-process tests (hardness, disintegration, fill weight, pH, viscosity etc.) must be defined in the MMF with acceptance criteria. All in-process results must be recorded in the BMR.' },
  { id: 'PROD-006', area: 'Production Process', isCritical: false,
    title: 'Yield reconciliation — performed per batch',
    description: 'Theoretical vs actual yield must be calculated for each batch. Deviations beyond defined limits must trigger an investigation. Records in the BMR.' },

  // ── 4. Quality Control & Laboratory ──────────────────────────────────────
  { id: 'QC-001', area: 'Quality Control & Laboratory', isCritical: true,
    title: 'Approved specifications — all raw materials and finished products',
    description: 'Written specifications must exist for all raw materials, packaging, and finished products. Specifications must include tests, methods, and acceptance criteria. Must be approved by QA.' },
  { id: 'QC-002', area: 'Quality Control & Laboratory', isCritical: true,
    title: 'Validated test methods in use',
    description: 'All analytical test methods used for product release must be validated or verified (pharmacopoeial methods). Validation data or verification reports must be available.' },
  { id: 'QC-003', area: 'Quality Control & Laboratory', isCritical: true,
    title: 'Out-of-Specification (OOS) procedure — documented and used',
    description: 'A written OOS procedure must exist covering Phase I lab investigation (assignable cause) and Phase II manufacturing investigation. All OOS results must be investigated and dispositioned.' },
  { id: 'QC-004', area: 'Quality Control & Laboratory', isCritical: false,
    title: 'Laboratory equipment — calibrated and qualification current',
    description: 'All analytical instruments (balances, HPLC, pH meters, spectrophotometers, etc.) must be calibrated and qualified with current certificates. Equipment logbooks must be maintained.' },
  { id: 'QC-005', area: 'Quality Control & Laboratory', isCritical: false,
    title: 'Reference standards — managed and within expiry',
    description: 'Primary and working reference standards must be stored appropriately, within their expiry date, and traceable to a recognised pharmacopoeial standard. Usage logs must be maintained.' },
  { id: 'QC-006', area: 'Quality Control & Laboratory', isCritical: true,
    title: 'Certificate of Analysis (CoA) — issued for each batch before release',
    description: 'A CoA summarising all release test results must be issued and signed by a qualified person before any batch is released. Inspectors will request CoAs for the last several batches.' },

  // ── 5. Sanitation & Hygiene ───────────────────────────────────────────────
  { id: 'SAN-001', area: 'Sanitation & Hygiene', isCritical: true,
    title: 'Cleaning and disinfection (C&D) procedures — all equipment',
    description: 'Written C&D procedures must exist for every piece of production equipment, specifying cleaning agents, concentrations, contact times, rinsing procedure, and cleaning frequency. Procedures must be validated.' },
  { id: 'SAN-002', area: 'Sanitation & Hygiene', isCritical: true,
    title: 'Cleaning validation — documented for critical equipment',
    description: 'Cleaning validation studies must demonstrate that the cleaning procedure adequately removes product residues and cleaning agents to below established limits. Particularly critical for shared equipment.' },
  { id: 'SAN-003', area: 'Sanitation & Hygiene', isCritical: false,
    title: 'Cleaning schedules — maintained with daily sign-off',
    description: 'Cleaning schedules for production areas, equipment, and utilities must be posted and completed with date and operator signature. Inspectors review the last month of cleaning logs.' },
  { id: 'SAN-004', area: 'Sanitation & Hygiene', isCritical: true,
    title: 'Environmental monitoring — schedule current, results trended',
    description: 'A written environmental monitoring programme must be in place covering viable (microbial) and non-viable (particulate) monitoring. Results must be trended and out-of-limit (OOL) results investigated.' },
  { id: 'SAN-005', area: 'Sanitation & Hygiene', isCritical: false,
    title: 'Cleaning agents — food-grade or GMP-grade, approved list',
    description: 'An approved list of cleaning agents and disinfectants must be maintained. Agents must be appropriate for use in food/pharmaceutical manufacturing (food-safe, non-reactive with product).' },
  { id: 'SAN-006', area: 'Sanitation & Hygiene', isCritical: false,
    title: 'Equipment logbooks — maintained for all production equipment',
    description: 'Each major piece of equipment must have a logbook recording: cleaning dates, maintenance dates, batch numbers processed, and any malfunctions or repairs.' },

  // ── 6. Documentation & Records ────────────────────────────────────────────
  { id: 'DOC-001', area: 'Documentation & Records', isCritical: true,
    title: 'SOPs — current, approved, and accessible on production floor',
    description: 'SOPs for all critical operations must be available at the point of use, current (within review cycle), and approved by QA. Out-of-date or unapproved SOPs in use is a critical finding.' },
  { id: 'DOC-002', area: 'Documentation & Records', isCritical: false,
    title: 'Document control system — version control enforced',
    description: 'A document control procedure must prevent unauthorised use of superseded documents. Document register must show current version, effective date, and distribution list.' },
  { id: 'DOC-003', area: 'Documentation & Records', isCritical: true,
    title: 'Batch records retention — minimum 1 year post-expiry',
    description: 'All batch production records, CoAs, and related documentation must be retained for at least 1 year after the product expiry date (or as required by applicable regulation). Storage must be secure.' },
  { id: 'DOC-004', area: 'Documentation & Records', isCritical: true,
    title: 'Change control procedure — documented with impact assessment',
    description: 'All changes to approved processes, materials, equipment, or facilities must pass through a change control system. Each change must have an impact assessment, approval, and implementation record.' },
  { id: 'DOC-005', area: 'Documentation & Records', isCritical: true,
    title: 'Deviation and CAPA records — open items tracked',
    description: 'All manufacturing deviations must be documented with root cause analysis and CAPA. Open CAPAs must have owners and due dates. Inspectors specifically ask for the CAPA register.' },
  { id: 'DOC-006', area: 'Documentation & Records', isCritical: true,
    title: 'Product recall procedure — documented and tested',
    description: 'A product recall/withdrawal SOP must exist. A mock recall must be performed at least annually and records retained. NAFDAC requires notification within 24 hours of a recall decision.' },

  // ── 7. Warehouse & Materials Management ──────────────────────────────────
  { id: 'WH-001', area: 'Warehouse & Materials', isCritical: true,
    title: 'Quarantine area — physically segregated and labelled',
    description: 'A dedicated quarantine area must physically separate unapproved incoming materials from approved materials. Must be clearly labelled "QUARANTINE — DO NOT USE" and accessible only to QC-authorised personnel.' },
  { id: 'WH-002', area: 'Warehouse & Materials', isCritical: true,
    title: 'Rejected materials — segregated, clearly labelled, and disposed',
    description: 'Rejected materials must be physically separated (preferably locked), labelled with the rejection reason, and disposed of through a documented process. No rejected material must re-enter the production stream.' },
  { id: 'WH-003', area: 'Warehouse & Materials', isCritical: false,
    title: 'FIFO / FEFO system — implemented and documented',
    description: 'First-in-first-out (FIFO) or first-expiry-first-out (FEFO) must be implemented for all raw materials and finished goods. Inspectors check that oldest stock is dispatched first.' },
  { id: 'WH-004', area: 'Warehouse & Materials', isCritical: false,
    title: 'Storage conditions monitored — temperature and humidity records',
    description: 'Temperature and humidity must be monitored continuously in all storage areas. Records must be reviewed regularly. Excursions must be investigated and affected materials reassessed.' },
  { id: 'WH-005', area: 'Warehouse & Materials', isCritical: true,
    title: 'Approved supplier list — maintained and current',
    description: 'A list of approved raw material and packaging suppliers must be maintained. Each supplier must have been qualified through audit, certification review, or satisfactory supply history. Unapproved suppliers must not be used.' },
  { id: 'WH-006', area: 'Warehouse & Materials', isCritical: false,
    title: 'Material CoAs — reviewed by QC before use',
    description: 'Certificate of Analysis from suppliers must be reviewed and countersigned by QC before materials are approved for use. A procedure for verifying CoA authenticity must exist.' },

  // ── 8. Water & Utilities ──────────────────────────────────────────────────
  { id: 'UTIL-001', area: 'Water & Utilities', isCritical: true,
    title: 'Water system — type appropriate for product (potable / PW / WFI)',
    description: 'The water quality grade must match the product type: potable water for general cleaning, Purified Water (PW) for oral dosage forms and food contact, Water for Injection (WFI) for injectables. NAFDAC verifies this on inspection.' },
  { id: 'UTIL-002', area: 'Water & Utilities', isCritical: true,
    title: 'Water system validation / qualification — current',
    description: 'The water generation and distribution system must be validated (PW/WFI) or qualified (potable). Validation must show the system consistently delivers water meeting pharmacopoeial or food-grade specifications.' },
  { id: 'UTIL-003', area: 'Water & Utilities', isCritical: true,
    title: 'Water quality testing — routine sampling records available',
    description: 'Routine water quality samples must be taken at defined points in the system per a written sampling plan. Results must be within specification. Trends and OOL results must be investigated.' },
  { id: 'UTIL-004', area: 'Water & Utilities', isCritical: false,
    title: 'Compressed air — quality tested (where used in production)',
    description: 'Where compressed air contacts product or product-contact surfaces, air quality must be tested for oil, moisture, and microbial content. Results must meet defined limits.' },
  { id: 'UTIL-005', area: 'Water & Utilities', isCritical: false,
    title: 'Generator / backup power — documented and tested',
    description: 'Critical utilities (cold storage, clean rooms, water systems) must have backup power. Generator maintenance and test run records must be available.' },

  // ── 9. NAFDAC-Specific Requirements ──────────────────────────────────────
  { id: 'NAFDAC-001', area: 'NAFDAC Requirements', isCritical: true,
    title: 'NAFDAC Site Manufacturing Licence — current and displayed',
    description: 'The NAFDAC site manufacturing licence must be current (not expired) and displayed at the manufacturing facility. Expired licence = immediate shutdown. NAFDAC checks this on arrival.' },
  { id: 'NAFDAC-002', area: 'NAFDAC Requirements', isCritical: true,
    title: 'NAFDAC GMP Certificate — current',
    description: 'A current NAFDAC GMP certificate must be available, issued following a satisfactory NAFDAC inspection. If expired, re-inspection must have been formally requested.' },
  { id: 'NAFDAC-003', area: 'NAFDAC Requirements', isCritical: true,
    title: 'All manufactured products — current NAFDAC registration',
    description: 'Every product manufactured and/or marketed must have a current NAFDAC product registration. Manufacturing any unregistered product is an immediate critical finding.' },
  { id: 'NAFDAC-004', area: 'NAFDAC Requirements', isCritical: false,
    title: 'ADR / PMS reporting procedure — documented',
    description: 'A procedure for reporting Adverse Drug Reactions (ADRs) to NAFDAC must exist. Serious unexpected ADRs: within 7 days. Other serious unexpected: within 15 days. PMS records must be available.' },
  { id: 'NAFDAC-005', area: 'NAFDAC Requirements', isCritical: true,
    title: 'Previous NAFDAC inspection recommendations — all closed',
    description: 'All corrective actions from the previous NAFDAC inspection must be documented as closed with evidence. Inspectors review the previous inspection report and close-out evidence at the start of every visit.' },
  { id: 'NAFDAC-006', area: 'NAFDAC Requirements', isCritical: false,
    title: 'Annual returns — filed for all registered products',
    description: 'Annual returns to NAFDAC must be filed for each registered product as required. Receipts or confirmation of submission must be on file.' },
];

export const INSPECTION_AREAS = [...new Set(INSPECTION_ITEMS.map(i => i.area))];

/* ── DB CRUD ───────────────────────────────────────────────────────────────── */

export async function getReadinessLog(companyId: string): Promise<ReadinessEntry[]> {
  const { data, error } = await (await db() as any)
    .from('gmp_readiness_log')
    .select('*')
    .eq('company_id', companyId);
  if (error) { logger.error('getReadinessLog', error); return []; }
  return data ?? [];
}

export async function updateReadinessItem(
  companyId: string,
  itemId: string,
  status: ReadinessStatus,
  notes: string,
  userId: string,
  evidenceName?: string,
  evidenceUrl?: string
): Promise<boolean> {
  const { error } = await (await db() as any)
    .from('gmp_readiness_log')
    .upsert({
      company_id: companyId,
      item_id: itemId,
      status,
      notes: notes || null,
      evidence_name: evidenceName || null,
      evidence_url: evidenceUrl || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,item_id' });
  if (error) { logger.error('updateReadinessItem', error); return false; }
  return true;
}

/* ── Report computation ────────────────────────────────────────────────────── */

export function buildInspectionReport(
  companyId: string,
  log: ReadinessEntry[]
): InspectionReport {
  const statusMap = new Map<string, ReadinessEntry>();
  for (const entry of log) statusMap.set(entry.item_id, entry);

  const areaMap = new Map<string, AreaScore>();
  for (const area of INSPECTION_AREAS) {
    areaMap.set(area, { area, total: 0, ready: 0, inProgress: 0, gap: 0, notApplicable: 0, critical_gaps: 0, score: 0, items: [] });
  }

  for (const item of INSPECTION_ITEMS) {
    const entry = statusMap.get(item.id);
    const status: ReadinessStatus = entry?.status ?? 'gap';
    const areaScore = areaMap.get(item.area)!;

    const withStatus: ItemWithStatus = {
      ...item,
      status,
      notes: entry?.notes ?? null,
      evidence_name: entry?.evidence_name ?? null,
      evidence_url: entry?.evidence_url ?? null,
      entryId: entry?.id ?? null,
    };

    areaScore.items.push(withStatus);
    areaScore.total++;

    if (status === 'ready')           areaScore.ready++;
    else if (status === 'in_progress') areaScore.inProgress++;
    else if (status === 'gap')         areaScore.gap++;
    else if (status === 'not_applicable') areaScore.notApplicable++;

    if (status === 'gap' && item.isCritical) areaScore.critical_gaps++;
  }

  // Compute per-area score
  let totalReady = 0, totalInProgress = 0, totalGap = 0, totalCriticalGap = 0;
  for (const areaScore of areaMap.values()) {
    const applicable = areaScore.total - areaScore.notApplicable;
    areaScore.score = applicable > 0 ? Math.round((areaScore.ready / applicable) * 100) : 100;
    totalReady       += areaScore.ready;
    totalInProgress  += areaScore.inProgress;
    totalGap         += areaScore.gap;
    totalCriticalGap += areaScore.critical_gaps;
  }

  const totalItems = INSPECTION_ITEMS.length;
  const totalNotApplicable = log.filter(e => e.status === 'not_applicable').length;
  const applicable = totalItems - totalNotApplicable;
  const overallScore = applicable > 0 ? Math.round((totalReady / applicable) * 100) : 0;

  return {
    companyId,
    generatedAt: new Date().toISOString(),
    overallScore,
    totalItems,
    readyCount: totalReady,
    inProgressCount: totalInProgress,
    gapCount: totalGap,
    criticalGapCount: totalCriticalGap,
    areas: [...areaMap.values()],
  };
}
