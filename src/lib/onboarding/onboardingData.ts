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
