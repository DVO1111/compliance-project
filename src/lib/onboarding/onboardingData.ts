/**
 * The choices ONB-01 and ONB-02 offer, as DATA.
 *
 * The ONB-02 notes are explicit about this: "Industry options are read
 * from data, not hard-coded (J7.1)." They live here rather than inside
 * the screens so that adding an industry, a regulator or a role is an
 * edit to a list, not a change to a form.
 *
 * WHAT THE NOTES FIX, AND WHAT THEY RULE OUT
 * ------------------------------------------
 *   "The three seeded templates come first (J3.1). 'Other' is honest
 *    that it has no template."
 *   "NAFDAC + PCN by default for pharma. SON is optional. MDCN and NMCN
 *    are not offered (A2.11)."
 *   "Ghana is shown as 'coming later' text, not as a selectable option
 *    (Phase 2, 1.4)."
 *   "No record counts are shown. The template content is still being
 *    authored (data authoring, J3), and the product must never show
 *    numbers it cannot back."
 *
 * That last one is why every seed preview below is a list of sentences
 * and not a list of counts.
 */

export interface IndustryOption {
  id: string;
  /** Matches profiles.industry_type, which the compliance engine reads. */
  value: string;
  title: string;
  description: string;
  /** Icon name from the toolkit (src/lib/design/icons.ts). */
  iconName: string;
  /** False for "Other regulated manufacturer", which seeds nothing. */
  hasTemplate: boolean;
}

/**
 * The seeded templates first, per J3.1. "Other" is last and says
 * plainly that it has no template rather than implying one.
 */
export const INDUSTRIES: readonly IndustryOption[] = [
  {
    id: 'pharma',
    value: 'Pharmaceutical Manufacturing',
    title: 'Pharmaceutical manufacturing',
    description: 'Drugs, herbal and nutraceutical products made under NAFDAC GMP.',
    iconName: 'regulatory/product',
    hasTemplate: true,
  },
  {
    id: 'food',
    value: 'Food and Beverage Manufacturing',
    title: 'Food and beverage manufacturing',
    description: 'Food, drinks and packaged water under NAFDAC and SON.',
    iconName: 'quality/water',
    hasTemplate: true,
  },
  {
    id: 'importer',
    value: 'Importer or Distributor',
    title: 'Importer or distributor',
    description: 'You hold marketing authorisations for products made elsewhere.',
    iconName: 'regulatory/import-permit',
    hasTemplate: true,
  },
  {
    id: 'other',
    value: 'Other Regulated Manufacturer',
    title: 'Other regulated manufacturer',
    description: 'Cosmetics, devices, agro-chemicals. No starter template yet, so you start empty.',
    iconName: 'quality/master-formula',
    hasTemplate: false,
  },
];

export interface RegulatorOption {
  id: string;
  label: string;
  /** Selected and fixed for this industry: NAFDAC and PCN for pharma. */
  defaultFor: string[];
  /** Offered but off by default — "only if you hold its certification". */
  optional?: boolean;
}

/**
 * MDCN and NMCN are deliberately absent (A2.11). They regulate
 * practitioners, not the manufacturing this product covers, and
 * offering them would invite a workspace to be set up against a
 * regulator Criateur has nothing to say about.
 */
export const REGULATORS: readonly RegulatorOption[] = [
  { id: 'nafdac', label: 'NAFDAC', defaultFor: ['pharma', 'food', 'importer', 'other'] },
  { id: 'pcn', label: 'PCN (Pharmacists Council)', defaultFor: ['pharma'] },
  { id: 'son', label: 'SON (only if you hold MANCAP)', defaultFor: [], optional: true },
];

/** Phase 1 is Nigeria. Everything else is text on the screen, not an
 *  option — see COMING_LATER below. */
export const COUNTRY = { id: 'nigeria', label: 'Nigeria' };
export const COMING_LATER = 'Ghana and other West African regulators: coming later';

/**
 * What the starter template sets up, per industry.
 *
 * Pharma mirrors J3.2; food mirrors J3.3. Sentences, never counts: the
 * template content is still being authored, so a number here would be a
 * promise the product cannot keep.
 */
export const SEED_PREVIEW: Record<string, readonly string[]> = {
  pharma: [
    'NAFDAC GMP obligations',
    'Product registration obligations, with renewal reminders at 12, 6 and 3 months',
    'PCN premises licence and superintendent pharmacist practising licence',
    'Standard pharmaceutical quality policies',
    'Risk register entries for common GMP gaps',
  ],
  food: [
    'NAFDAC food registration obligations',
    'SON MANCAP certification obligations',
    'NIS standards applicable to your product lines',
    'HACCP plan and prerequisite programmes',
    'Allergen control policies',
  ],
  importer: [
    'NAFDAC marketing authorisation obligations',
    'Import permit obligations, with renewal reminders at 12, 6 and 3 months',
    'Supplier qualification records for the manufacturers you import from',
    'Standard distribution quality policies',
  ],
  other: [],
};

/** The line under "What we'll set up for you". */
export function seedTemplateName(industryId: string): string {
  const industry = INDUSTRIES.find((i) => i.id === industryId);
  if (!industry) return '';
  return industry.hasTemplate
    ? `${industry.title.charAt(0).toUpperCase()}${industry.title.slice(1)} starter template`
    : 'No starter template';
}

export const SEED_FOOTNOTE =
  'You review every record in step 6. Areas that don’t apply to your industry, such as logistics and customs declarations, stay hidden.';

export const NO_TEMPLATE_NOTE =
  'There is no starter template for this industry yet, so your workspace opens empty and you add records as you go. Nothing is hidden from you.';

/**
 * WHAT THE ADMIN DOES HERE, for "Your role" on ONB-01.
 *
 * The ONB-01 notes say this list comes from the PRD user list (1.3) and
 * explicitly NOT from the old Admin / Legal / Marketing / Viewer set —
 * those are permission levels, and the question on the screen is what
 * the person's job is.
 *
 * The PRD is not in this repository, so this list is drawn from the
 * roles the product itself already names — the QA authority that signs
 * batch records, the superintendent pharmacist a PCN licence is held
 * by, the production and QC roles that raise records. It is data for
 * exactly this reason: when the PRD list is to hand, this array is the
 * only thing that changes.
 */
export const ADMIN_ROLES: readonly string[] = [
  'Head of Quality / QA Manager',
  'Superintendent Pharmacist',
  'Regulatory Affairs Manager',
  'Production Manager',
  'QC Analyst / Laboratory Manager',
  'Compliance Officer',
  'Managing Director / CEO',
  'Other',
];

// ── ONB-03 · Sites, departments and products ─────────────────────────

/**
 * The kinds of premises a site can be.
 *
 * The screen offers manufacturing and warehouse — "Add every factory
 * and warehouse" — and those two are also what the "at least one"
 * rule counts. Laboratory and office are here because a regulated
 * business has them and a site that is neither a factory nor a
 * warehouse must still be nameable rather than mislabelled as one.
 *
 * `countsTowardMinimum` is the rule from the notes, held as data on the
 * option rather than as a list of ids somewhere else that could drift
 * out of step with it.
 */
export interface SiteTypeOption {
  id: string;
  label: string;
  /** The badge beside the site name on the card. */
  badge: string;
  countsTowardMinimum: boolean;
}

export const SITE_TYPES: readonly SiteTypeOption[] = [
  { id: 'manufacturing', label: 'Manufacturing', badge: 'MANUFACTURING', countsTowardMinimum: true },
  { id: 'warehouse',     label: 'Warehouse',     badge: 'WAREHOUSE',     countsTowardMinimum: true },
  { id: 'laboratory',    label: 'Laboratory',    badge: 'LABORATORY',    countsTowardMinimum: false },
  { id: 'office',        label: 'Office',        badge: 'OFFICE',        countsTowardMinimum: false },
];

export function siteTypeBadge(id: string): string {
  return SITE_TYPES.find((t) => t.id === id)?.badge ?? id.toUpperCase();
}

/**
 * The product categories, from the PRD list (A2.2).
 *
 * THE IDs ARE products.category, not labels. That column carries a
 * CHECK constraint naming these exact nine values, so a category
 * chosen here can be written to a product without translation — and a
 * tenth invented on this screen would be refused by the database
 * rather than quietly stored.
 *
 * Herbal / nutraceutical is called out by the notes because it is the
 * one the generic lists leave out, and it is a large part of what
 * NAFDAC regulates.
 */
export const PRODUCT_CATEGORIES: readonly { id: string; label: string }[] = [
  { id: 'drug_pharmaceutical',  label: 'Drug / pharmaceutical' },
  { id: 'herbal_nutraceutical', label: 'Herbal / nutraceutical' },
  { id: 'food',                 label: 'Food' },
  { id: 'cosmetic',             label: 'Cosmetic' },
  { id: 'medical_device',       label: 'Medical device' },
  { id: 'veterinary',           label: 'Veterinary' },
  { id: 'biologic_vaccine',     label: 'Biologic / vaccine' },
  { id: 'agro_chemical',        label: 'Agro-chemical' },
  { id: 'other',                label: 'Other' },
];

export function productCategoryLabel(id: string): string {
  return PRODUCT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/**
 * The departments offered, and the code each one carries.
 *
 * "Departments raise records and set document numbers. We suggested the
 * usual ones; rename or add your own."
 *
 * The code is the part that matters: it goes into CC-{DEPT}-{YYYY}-
 * {NNNN} (B3.9, X6.2–X6.3). It is held separately from the name so that
 * renaming "Quality Assurance" to "Quality Assurance (QA)" does not
 * change the numbers already issued under it — see departments.code.
 */
export const SUGGESTED_DEPARTMENTS: readonly {
  name: string; code: string;
  /** Ticked when the screen first opens. */
  on: boolean;
}[] = [
  { name: 'Quality Assurance',  code: 'QA',  on: true },
  { name: 'Quality Control',    code: 'QC',  on: true },
  { name: 'Production',         code: 'PRD', on: true },
  { name: 'Regulatory Affairs', code: 'RA',  on: true },
  { name: 'Warehouse',          code: 'WH',  on: true },
  //  Off, as the design shows it. Not every regulated manufacturer runs
  //  engineering as a department that raises records, and one unticked
  //  chip is also what tells you the row is a set of toggles rather
  //  than a list of facts.
  { name: 'Engineering',        code: 'ENG', on: false },
];

/** What departments.code accepts: 2–8 upper-case letters or digits. */
export const DEPARTMENT_CODE_PATTERN = /^[A-Z0-9]{2,8}$/;

/**
 * The two series the preview illustrates, and the department each one
 * naturally belongs to.
 *
 * The design shows CC-QA-2026-0001 · SOP-PRD-2026-0001, and that pairing
 * is not arbitrary: a change control is raised by Quality Assurance, and
 * a standard operating procedure is written by the department that does
 * the work. Holding the preference as data keeps the example meaningful
 * when a workspace does not have those departments — then the preview
 * falls back to whatever they do have, rather than naming a code the
 * person never ticked.
 */
const PREVIEW_SERIES: readonly { prefix: string; prefers: string }[] = [
  { prefix: 'CC',  prefers: 'QA' },
  { prefix: 'SOP', prefers: 'PRD' },
];

/**
 * The numbering preview under the department chips.
 *
 * Built from the codes actually selected. Untick Quality Assurance and
 * the preview stops saying CC-QA-, because that series will not exist —
 * showing a code nobody picked promises a numbering scheme the product
 * will not use.
 *
 * The sequence is 0001 because it is the first record of the year, and
 * the year is this one. Neither is a count of anything stored.
 */
export function numberingPreview(codes: readonly string[], year = new Date().getFullYear()): string[] {
  if (codes.length === 0) return [];

  const used = new Set<string>();
  return PREVIEW_SERIES.map((series) => {
    const code =
      (codes.includes(series.prefers) && !used.has(series.prefers))
        ? series.prefers
        //  Any code not already on screen; with only one department
        //  ticked, both lines show it rather than one line disappearing.
        : codes.find((c) => !used.has(c)) ?? codes[0];
    used.add(code);
    return `${series.prefix}-${code}-${year}-0001`;
  });
}

/**
 * The optional import card.
 *
 * The notes mark it SHOULD and place it here "as an optional card, so
 * it never blocks progress". They also say row validation is "pattern
 * to be specified" — so this screen offers the template and the file
 * picker and says plainly that nothing is imported yet, rather than
 * inventing a validator whose rules nobody has decided.
 */
export const IMPORT_NOT_READY_NOTE =
  'Importing isn’t switched on yet — the row checks are still being specified. Download the template now if it’s useful, and bring your file in from the dashboard when it is ready. Nothing here blocks you from continuing.';
