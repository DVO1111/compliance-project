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
  //  PM-03's remaining five. Each takes the icon the design's own rails
  //  use for that section on DB-01 and DB-02, so the glyph beside
  //  "Goods receipt" in a request dialog is the glyph beside it in the
  //  sidebar. Distribution has no section glyph of its own in the file;
  //  DB-02 draws its Dispatch rail item with the send mark, which is
  //  the nearest thing the toolkit actually contains.
  suppliers:              'nav/supplier-qual',
  goods_receipt:          'quality/material-receipt',
  coa_register:           'quality/coa',
  traceability:           'quality/genealogy',
  distribution:           'action/send',
};
