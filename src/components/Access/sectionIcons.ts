/**
 * Which glyph stands for each section a person can hold access to.
 *
 * The names on the right are the design system's icon names, not Lucide
 * names, so this file resolves through lib/design/icons and inherits its
 * single mapping to the toolkit. That matters because the toolkit has
 * already been renamed once: a section mapped straight to a Lucide
 * import would have to be found and changed again next time.
 *
 * The five the design shows on DB-02's locked card are taken from it —
 * QC testing as the microscope, Finished QC as the release badge,
 * Deviation / CAPA, Audit trail and Batch release decision — and the
 * rest follow the sidebar, so a section carries the same glyph in the
 * nav, in the locked tile and in the request dialog.
 */

import type { AccessSection } from '../../lib/access/permissionRequests';
import type { IconName } from '../../lib/design/icons';

export const SECTION_ICON: Record<AccessSection, IconName> = {
  batch_records:          'quality/in-process-control',
  batch_release:          'nav/batch-release',
  qc_testing:             'quality/qc-testing',
  qa_disposition:         'access/verified',
  material_lots:          'quality/material-lot',
  deviation_capa:         'nav/deviation-capa',
  change_control:         'nav/change-control',
  sop_library:            'nav/sop-library',
  gmp_inspection:         'nav/gmp-inspection',
  products:               'regulatory/product',
  registrations_licences: 'regulatory/licence',
  obligations:            'regulatory/obligation',
  risk_register:          'quality/risk',
  policies:               'nav/policies',
  audit_trail:            'quality/audit-trail',
};
