/**
 * NAFDAC 2026 renewal checklist — the 12-step template.
 *
 * Pure data, in its own module deliberately. It is the single source of
 * truth shared by two consumers that must not drift apart:
 *
 *   - the License Vault UI, which instantiates it in the browser;
 *   - `licence_renewal_task_templates` in
 *     supabase/migrations/20260921000000_licence_lifecycle.sql, which the
 *     server instantiates when the first renewal alert fires.
 *
 * `src/tests/licenceService.test.ts` asserts the two stay in step. That
 * test must be runnable without Supabase credentials, which is why this
 * lives here rather than in licenseService.ts — importing that module
 * reaches supabase.ts through auditService and throws when
 * VITE_SUPABASE_* are unset.
 */

export interface RenewalTaskTemplate {
    title: string;
    description: string;
    monthsBefore: number; // months before expiry
    sortOrder: number;
}

export const NAFDAC_2026_RENEWAL_TASKS: RenewalTaskTemplate[] = [
    {
        title: 'Obtain current Power of Attorney (PoA)',
        description: 'Secure an updated and notarized Power of Attorney from the product manufacturer authorizing the local representative. Must be less than 12 months old at submission.',
        monthsBefore: 6,
        sortOrder: 1,
    },
    {
        title: 'Book GMP Facility Inspection',
        description: 'Schedule a Good Manufacturing Practice (GMP) inspection with NAFDAC for the manufacturing facility. Coordinate with the manufacturer for availability and required documentation.',
        monthsBefore: 5,
        sortOrder: 2,
    },
    {
        title: 'Prepare updated Certificate of Pharmaceutical Product (CPP)',
        description: 'Request an updated CPP from the regulatory authority in the country of origin. Must be recent (within 2 years) and authenticated by the Nigerian Embassy.',
        monthsBefore: 5,
        sortOrder: 3,
    },
    {
        title: 'Complete Product Stability Studies Report',
        description: 'Compile stability data as per ICH guidelines (Zone IVb for Nigeria). Include accelerated and long-term stability reports for the product.',
        monthsBefore: 4,
        sortOrder: 4,
    },
    {
        title: 'Update Product Information Leaflet (PIL)',
        description: 'Review and update the patient information leaflet and Summary of Product Characteristics (SmPC) per current NAFDAC requirements. Ensure English language version is included.',
        monthsBefore: 4,
        sortOrder: 5,
    },
    {
        title: 'Prepare Batch Manufacturing Records (last 3 batches)',
        description: 'Compile complete batch manufacturing records for the last 3 production batches, including in-process controls and release testing results.',
        monthsBefore: 3,
        sortOrder: 6,
    },
    {
        title: 'Obtain Site Master File (SMF) from manufacturer',
        description: 'Request the current Site Master File from the manufacturing facility. This must reflect the current state of the facility and comply with WHO guidelines.',
        monthsBefore: 3,
        sortOrder: 7,
    },
    {
        title: 'Submit NAFDAC Renewal Application Form',
        description: 'Complete and submit the official NAFDAC Product Registration Renewal Application Form. Include all required attachments and supporting documentation.',
        monthsBefore: 3,
        sortOrder: 8,
    },
    {
        title: 'Pay NAFDAC Renewal Processing Fee',
        description: 'Pay the applicable renewal processing fee through the official NAFDAC payment portal (Remita). Retain evidence of payment for submission.',
        monthsBefore: 3,
        sortOrder: 9,
    },
    {
        title: 'Submit complete dossier to NAFDAC',
        description: 'Compile and submit the complete renewal dossier to the NAFDAC Registration & Regulatory Affairs Directorate. Include 2 hard copies and 1 electronic copy (eCTD format preferred).',
        monthsBefore: 2,
        sortOrder: 10,
    },
    {
        title: 'Follow up with NAFDAC Registration Division',
        description: 'Actively follow up with the NAFDAC Registration Division to track the status of the renewal application. Address any queries or deficiency letters promptly.',
        monthsBefore: 1,
        sortOrder: 11,
    },
    {
        title: 'Receive renewed certificate / track status',
        description: 'Collect the renewed NAFDAC Registration Certificate. Upload a copy to the system and update the license record with new expiry date.',
        monthsBefore: 0.5,
        sortOrder: 12,
    },
];

