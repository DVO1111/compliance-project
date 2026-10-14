/**
 * The spreadsheet template offered on ONB-03.
 *
 * The notes mark the import SHOULD and say the row checks are "pattern
 * to be specified". So this file does the one half that CAN be built
 * honestly today: the columns.
 *
 * THEY ARE NOT INVENTED. Every column below is a real column on the
 * table the rows will eventually land in — products, regulatory_licences
 * and capa_records — and the ones marked required are the ones those
 * tables declare NOT NULL. A template whose headings were guessed would
 * have to be reissued when the importer is written, and every sheet
 * filled in against it would be wrong.
 *
 * Three record types in one CSV, as three labelled blocks, because
 * "Download template" in the design is one file and a person tracking
 * all three in spreadsheets should not have to collect three downloads
 * to find that out.
 */

import { PRODUCT_CATEGORIES } from './onboardingData';

export interface TemplateSection {
  title: string;
  /** The tables these rows are destined for. */
  columns: readonly { name: string; required?: boolean; note?: string }[];
}

export const TEMPLATE_SECTIONS: readonly TemplateSection[] = [
  {
    title: 'PRODUCTS',
    columns: [
      { name: 'product_code', required: true, note: 'your own reference, unique in your company' },
      { name: 'trade_name', required: true },
      { name: 'generic_name' },
      {
        name: 'category',
        required: true,
        note: `one of: ${PRODUCT_CATEGORIES.map((c) => c.id).join(' | ')}`,
      },
      { name: 'dosage_form' },
      { name: 'strength' },
      { name: 'pack_size' },
      { name: 'nafdac_number' },
      { name: 'registration_expiry_date', note: 'YYYY-MM-DD' },
      { name: 'manufacturing_site', note: 'the site name as entered in onboarding' },
    ],
  },
  {
    title: 'LICENCES',
    columns: [
      { name: 'name', required: true },
      {
        name: 'licence_type',
        required: true,
        note: 'nafdac_product_registration | nafdac_site_manufacturing_licence | '
          + 'nafdac_gmp_certificate | nafdac_import_permit | son_mancap_approval | '
          + 'son_nis_certification | ministry_health_licence | other',
      },
      { name: 'regulatory_body', required: true, note: 'nafdac | son | pcn | ministry_of_health' },
      { name: 'registration_number' },
      { name: 'product_name', note: 'the product this licence covers, if any' },
      { name: 'issue_date', note: 'YYYY-MM-DD' },
      { name: 'expiry_date', required: true, note: 'YYYY-MM-DD' },
      { name: 'notes' },
    ],
  },
  {
    title: 'OPEN CAPAS',
    columns: [
      { name: 'capa_number', required: true, note: 'your own reference' },
      { name: 'title', required: true },
      { name: 'description', required: true },
      { name: 'source', required: true, note: 'what raised it — deviation, audit, complaint' },
      { name: 'capa_type', required: true, note: 'corrective | preventive' },
      { name: 'priority', required: true, note: 'low | medium | high | critical' },
      { name: 'owner_name' },
      { name: 'due_date', note: 'YYYY-MM-DD' },
      { name: 'root_cause' },
    ],
  },
];

/** RFC 4180: quotes are doubled, and any field holding a comma, a quote
 *  or a newline is quoted. A template whose own header row broke a CSV
 *  parser would be a poor advertisement for row validation. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildImportTemplateCsv(): string {
  const lines: string[] = [
    '# Criateur import template',
    '# Fill in the rows under each heading. Leave a section empty if it does not apply.',
    '# Columns marked (required) must have a value in every row you add.',
    '#',
    '# Importing is not switched on yet — keep this file and bring it in from the',
    '# dashboard when it is. Nothing here is uploaded by downloading the template.',
    '',
  ];

  for (const section of TEMPLATE_SECTIONS) {
    lines.push(`# ── ${section.title} ──`);
    for (const c of section.columns) {
      const bits = [c.required ? '(required)' : '(optional)', c.note].filter(Boolean);
      lines.push(`# ${c.name}: ${bits.join(' — ')}`);
    }
    lines.push(section.columns.map((c) => csvCell(c.name)).join(','));
    //  One empty row, so the file opens with the cursor somewhere useful
    //  rather than on the heading.
    lines.push(section.columns.map(() => '').join(','));
    lines.push('');
  }

  return lines.join('\r\n');
}

/**
 * Hands the file to the browser.
 *
 * The object URL is revoked on the next frame rather than immediately:
 * revoking it in the same tick cancels the download in some browsers,
 * and never revoking it holds the blob for the life of the tab.
 */
export function downloadImportTemplate(): void {
  if (typeof document === 'undefined') return;

  const blob = new Blob([buildImportTemplateCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'criateur-import-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
