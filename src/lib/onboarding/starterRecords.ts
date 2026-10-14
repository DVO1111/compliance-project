/**
 * ONB-06 · the records a new workspace starts with.
 *
 * READ THIS BEFORE CHANGING ANY WORDING. The notes carry a VERIFY:
 *
 *   "VERIFY: seed templates contain real content, not placeholders. The
 *    rows here are illustrative of real NAFDAC/PCN items, and final
 *    wording comes from the authored templates (Olukemi, Adekunle)."
 *
 * So this file is the ILLUSTRATIVE SET, not the authored template. Every
 * row names a real obligation, licence, policy or risk that a Nigerian
 * regulated manufacturer actually carries — nothing here is "Policy 1"
 * or "Lorem" — but the authored templates (J3) replace it when they
 * land, and the rows are data in one file precisely so that replacing
 * them is an edit here and nowhere else.
 *
 * WHAT THE OTHER NOTES REQUIRE
 *
 *   "Seeded records are a starting point, not a constraint: editable and
 *    deletable (J3.5)."
 *    → every row is created in the ordinary tables, with no owner and no
 *      due date, exactly as if someone had typed it. Nothing marks them
 *      as undeletable and nothing re-creates them.
 *
 *   "'Starter' uses badge/state draft, because these records are unowned
 *    until assigned. Licences rows show 'Add expiry date', and renewal
 *    alerts (A5.1) begin only once a date exists."
 *    → licences are written with expiry_date NULL and status 'draft'.
 *      A seeded expiry date would start a renewal countdown against a
 *      date nobody has checked, which is worse than no alert at all.
 */

export type StarterTab = 'obligations' | 'licences' | 'policies' | 'risks';

export interface StarterRecord {
  id: string;
  tab: StarterTab;
  title: string;
  /** The regulator badge beside the title. */
  authority: string;
  /** The line under the title, before "Owner: unassigned". */
  detail: string;
  /** Industries this row applies to. */
  industries: readonly string[];
  /** Unticked by default — a row that only some workspaces carry. */
  optional?: boolean;
  /** Column values for the table this row is written to. */
  write: Record<string, unknown>;
}

const PHARMA_ONLY = ['pharma'] as const;
const MAKERS = ['pharma', 'food', 'other'] as const;
const EVERYONE = ['pharma', 'food', 'importer', 'other'] as const;

// ── Obligations ──────────────────────────────────────────────────────
//  The six on the ONB-06 screen, word for word. regulatory_obligations
//  takes status 'identified' | 'implemented' | 'monitored' and frequency
//  from a fixed list, so "every 5 years" and "continuous" have no
//  frequency value and say so in the description instead of being
//  forced into the nearest wrong one.

const OBLIGATIONS: StarterRecord[] = [
  {
    id: 'ob-gmp-inspection-ready',
    tab: 'obligations',
    title: 'NAFDAC GMP: keep the site inspection-ready',
    authority: 'NAFDAC',
    detail: 'Continuous · reviewed before each inspection',
    industries: MAKERS,
    write: {
      category: 'gmp',
      jurisdiction: 'Nigeria',
      status: 'identified',
      is_recurring: true,
      description:
        'Good Manufacturing Practice conditions are maintained continuously and '
        + 'evidenced at every NAFDAC inspection of the site.',
    },
  },
  {
    id: 'ob-product-registration-renewal',
    tab: 'obligations',
    title: 'Product registration renewal',
    authority: 'NAFDAC',
    detail: 'Per product, every 5 years · reminders at 12, 6, 3 months',
    industries: EVERYONE,
    write: {
      category: 'registration',
      jurisdiction: 'Nigeria',
      status: 'identified',
      is_recurring: true,
      description:
        'Each registered product is renewed before its certificate expires. '
        + 'Renewal is prepared from 12 months out, with reminders at 12, 6 and 3 months.',
    },
  },
  {
    id: 'ob-pcn-premises',
    tab: 'obligations',
    title: 'PCN premises registration renewal',
    authority: 'PCN',
    detail: 'Yearly',
    industries: PHARMA_ONLY,
    write: {
      category: 'licensing',
      jurisdiction: 'Nigeria',
      status: 'identified',
      is_recurring: true,
      frequency: 'annual',
      description:
        'Pharmacists Council of Nigeria registration of the premises is renewed each year.',
    },
  },
  {
    id: 'ob-superintendent-licence',
    tab: 'obligations',
    title: 'Superintendent pharmacist practising licence',
    authority: 'PCN',
    detail: 'Yearly',
    industries: PHARMA_ONLY,
    write: {
      category: 'licensing',
      jurisdiction: 'Nigeria',
      status: 'identified',
      is_recurring: true,
      frequency: 'annual',
      description:
        'The superintendent pharmacist holds a current PCN practising licence, renewed yearly.',
    },
  },
  {
    id: 'ob-annual-product-quality-review',
    tab: 'obligations',
    title: 'Annual product quality review',
    authority: 'NAFDAC GMP',
    detail: 'Yearly, per product',
    industries: MAKERS,
    write: {
      category: 'gmp',
      jurisdiction: 'Nigeria',
      status: 'identified',
      is_recurring: true,
      frequency: 'annual',
      description:
        'A product quality review is completed each year for every product, covering '
        + 'batches made, deviations, complaints, returns and stability results.',
    },
  },
  {
    id: 'ob-son-mancap',
    tab: 'obligations',
    title: 'SON MANCAP certificate renewal',
    authority: 'SON',
    detail: 'Only if you hold MANCAP',
    industries: EVERYONE,
    //  Not every workspace holds MANCAP, and an obligation nobody owes
    //  is noise on a dashboard from the first day.
    optional: true,
    write: {
      category: 'certification',
      jurisdiction: 'Nigeria',
      status: 'identified',
      is_recurring: true,
      frequency: 'annual',
      description:
        'Mandatory Conformity Assessment Programme certification is renewed with the '
        + 'Standards Organisation of Nigeria where it is held.',
    },
  },
];

// ── Licences ─────────────────────────────────────────────────────────
//  EVERY ONE IS WRITTEN WITH NO EXPIRY DATE. "Renewal alerts begin only
//  once a date exists" — seeding a date would start a countdown against
//  something nobody has checked, and an alert nobody trusts is worse
//  than no alert.
//
//  licence_type's CHECK has no PCN values, so the two PCN rows are
//  'other' with the regulator in regulatory_body. Adding PCN types is a
//  change to the licence vault, not something to slip into onboarding.

const LICENCES: StarterRecord[] = [
  {
    id: 'lc-manufacturing',
    tab: 'licences',
    title: 'NAFDAC pharmaceutical manufacturing licence',
    authority: 'NAFDAC',
    detail: 'Add expiry date',
    industries: MAKERS,
    write: {
      licence_type: 'nafdac_site_manufacturing_licence',
      regulatory_body: 'nafdac',
      status: 'draft',
      notes: 'Starter record. Add the certificate number and expiry date to start renewal alerts.',
    },
  },
  {
    id: 'lc-gmp-certificate',
    tab: 'licences',
    title: 'NAFDAC GMP certificate',
    authority: 'NAFDAC',
    detail: 'Add expiry date',
    industries: MAKERS,
    write: {
      licence_type: 'nafdac_gmp_certificate',
      regulatory_body: 'nafdac',
      status: 'draft',
      notes: 'Starter record. Add the certificate number and expiry date to start renewal alerts.',
    },
  },
  {
    id: 'lc-pcn-premises',
    tab: 'licences',
    title: 'PCN premises registration',
    authority: 'PCN',
    detail: 'Add expiry date',
    industries: PHARMA_ONLY,
    write: {
      licence_type: 'other',
      regulatory_body: 'pcn',
      status: 'draft',
      notes: 'Starter record. Pharmacists Council of Nigeria premises registration.',
    },
  },
  {
    id: 'lc-superintendent',
    tab: 'licences',
    title: 'Superintendent pharmacist practising licence',
    authority: 'PCN',
    detail: 'Add expiry date',
    industries: PHARMA_ONLY,
    write: {
      licence_type: 'other',
      regulatory_body: 'pcn',
      status: 'draft',
      notes: 'Starter record. Held by the named superintendent pharmacist.',
    },
  },
  {
    id: 'lc-import-permit',
    tab: 'licences',
    title: 'NAFDAC import permit',
    authority: 'NAFDAC',
    detail: 'Add expiry date',
    industries: EVERYONE,
    optional: true,
    write: {
      licence_type: 'nafdac_import_permit',
      regulatory_body: 'nafdac',
      status: 'draft',
      notes: 'Starter record. Needed per consignment of imported materials or finished goods.',
    },
  },
  {
    id: 'lc-mancap',
    tab: 'licences',
    title: 'SON MANCAP approval',
    authority: 'SON',
    detail: 'Only if you hold MANCAP',
    industries: EVERYONE,
    optional: true,
    write: {
      licence_type: 'son_mancap_approval',
      regulatory_body: 'son',
      status: 'draft',
      notes: 'Starter record. Standards Organisation of Nigeria conformity assessment.',
    },
  },
];

// ── Policies ─────────────────────────────────────────────────────────
//  policies.category is a fixed list from the older product — security,
//  privacy, conduct, hr, finance, operational, other — and none of them
//  is "quality". 'operational' is the closest true fit and is what these
//  are written as; the title carries the meaning.

const POLICIES: StarterRecord[] = [
  {
    id: 'po-quality-policy',
    tab: 'policies',
    title: 'Quality policy',
    authority: 'GMP',
    detail: 'Reviewed yearly',
    industries: MAKERS,
    write: {
      category: 'operational',
      review_cycle_months: 12,
      description:
        'The commitment to product quality, the quality objectives, and who is '
        + 'accountable for them. Signed by senior management.',
    },
  },
  {
    id: 'po-documentation',
    tab: 'policies',
    title: 'Documentation and good documentation practice',
    authority: 'GMP',
    detail: 'Reviewed every 2 years',
    industries: MAKERS,
    write: {
      category: 'operational',
      review_cycle_months: 24,
      description:
        'How records are written, corrected, signed and retained, so that an entry '
        + 'can be attributed, read and traced back years later.',
    },
  },
  {
    id: 'po-deviation-capa',
    tab: 'policies',
    title: 'Deviation and CAPA policy',
    authority: 'GMP',
    detail: 'Reviewed every 2 years',
    industries: EVERYONE,
    write: {
      category: 'operational',
      review_cycle_months: 24,
      description:
        'When a deviation is raised, how it is investigated and graded, and when a '
        + 'corrective or preventive action is required before closure.',
    },
  },
  {
    id: 'po-change-control',
    tab: 'policies',
    title: 'Change control policy',
    authority: 'GMP',
    detail: 'Reviewed every 2 years',
    industries: EVERYONE,
    write: {
      category: 'operational',
      review_cycle_months: 24,
      description:
        'Which changes need assessment before they are made, who assesses quality and '
        + 'regulatory impact, and when a change needs NAFDAC notification.',
    },
  },
  {
    id: 'po-training',
    tab: 'policies',
    title: 'Training and competency policy',
    authority: 'GMP',
    detail: 'Reviewed yearly',
    industries: EVERYONE,
    write: {
      category: 'hr',
      review_cycle_months: 12,
      description:
        'Induction and role training, retraining when a document changes, and how '
        + 'competency is assessed and recorded.',
    },
  },
  {
    id: 'po-complaints-recall',
    tab: 'policies',
    title: 'Complaints and recall policy',
    authority: 'NAFDAC',
    detail: 'Reviewed yearly',
    industries: EVERYONE,
    write: {
      category: 'operational',
      review_cycle_months: 12,
      description:
        'How a complaint is received and investigated, how a recall is decided and '
        + 'classified, and who notifies NAFDAC.',
    },
  },
];

// ── Risks ────────────────────────────────────────────────────────────
//  risk_level is a starting assessment, not a verdict. Each is set to
//  what the hazard is generally graded at in a GMP environment, and the
//  screen says plainly that everything stays editable.

const RISKS: StarterRecord[] = [
  {
    id: 'rk-cross-contamination',
    tab: 'risks',
    title: 'Cross-contamination between products',
    authority: 'GMP',
    detail: 'High · unassigned',
    industries: MAKERS,
    write: {
      risk_category: 'operational',
      risk_level: 'high',
      status: 'identified',
      description:
        'Residue from one product carried into another through shared equipment, air '
        + 'handling or personnel movement. Controlled by cleaning validation, line '
        + 'clearance and changeover checks.',
    },
  },
  {
    id: 'rk-oos-released-batch',
    tab: 'risks',
    title: 'Out-of-specification result on a released batch',
    authority: 'GMP',
    detail: 'High · unassigned',
    industries: MAKERS,
    write: {
      risk_category: 'compliance',
      risk_level: 'high',
      status: 'identified',
      description:
        'A test result outside specification found after release, requiring '
        + 'investigation, impact assessment on distributed stock, and a recall decision.',
    },
  },
  {
    id: 'rk-expired-registration',
    tab: 'risks',
    title: 'Expired product registration blocking production',
    authority: 'NAFDAC',
    detail: 'High · unassigned',
    industries: EVERYONE,
    write: {
      risk_category: 'compliance',
      risk_level: 'high',
      status: 'identified',
      description:
        'A batch cannot start for a product whose registration has lapsed. Renewal is '
        + 'prepared from 12 months before expiry.',
    },
  },
  {
    id: 'rk-unqualified-supplier',
    tab: 'risks',
    title: 'Critical material from an unqualified supplier',
    authority: 'GMP',
    detail: 'Medium · unassigned',
    industries: EVERYONE,
    write: {
      risk_category: 'operational',
      risk_level: 'medium',
      status: 'identified',
      description:
        'An active ingredient or primary packaging material received from a supplier '
        + 'whose qualification is incomplete or out of date.',
    },
  },
  {
    id: 'rk-storage-excursion',
    tab: 'risks',
    title: 'Storage temperature excursion',
    authority: 'GMP',
    detail: 'Medium · unassigned',
    industries: EVERYONE,
    write: {
      risk_category: 'operational',
      risk_level: 'medium',
      status: 'identified',
      description:
        'Warehouse or cold chain conditions outside the labelled storage range, '
        + 'requiring an impact assessment on the stock held.',
    },
  },
];

export const STARTER_RECORDS: readonly StarterRecord[] = [
  ...OBLIGATIONS, ...LICENCES, ...POLICIES, ...RISKS,
];

export const STARTER_TABS: readonly { id: StarterTab; label: string }[] = [
  { id: 'obligations', label: 'Obligations' },
  { id: 'licences',    label: 'Licences' },
  { id: 'policies',    label: 'Policies' },
  { id: 'risks',       label: 'Risks' },
];

/** The table each tab's rows are written to. */
export const TAB_TABLE: Record<StarterTab, string> = {
  obligations: 'regulatory_obligations',
  licences:    'regulatory_licences',
  policies:    'policies',
  risks:       'risks',
};

export function starterRecordsFor(industryId: string): StarterRecord[] {
  return STARTER_RECORDS.filter((r) => r.industries.includes(industryId));
}

/** Ticked when the screen opens: everything except the optional rows. */
export function keptByDefault(industryId: string): string[] {
  return starterRecordsFor(industryId).filter((r) => !r.optional).map((r) => r.id);
}

export const STARTER_FOOTNOTE =
  'Starter records have no owners or due dates yet. Assign them from the dashboard. '
  + 'On the Licences tab you add certificate numbers and expiry dates; renewal alerts '
  + 'start once a date is set.';

export const STARTER_EDITABLE_NOTE =
  'Everything here stays editable and removable after setup.';

/** The subtitle, which names the template the rows came from. */
export function starterSubtitle(industryTitle: string): string {
  return `From the ${industryTitle.toLowerCase()} template. Keep what applies to you, `
    + 'remove what doesn’t, and fill in details later.';
}
