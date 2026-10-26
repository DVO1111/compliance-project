/**
 * The same stand-in as `empty-supabase.ts`, but with rows.
 *
 * ── WHY BOTH EXIST ──
 *
 * `empty-supabase.ts` answers everything with nothing, deliberately:
 * it photographs a real workspace's first morning, which is the state
 * most likely to be got wrong. It is not changed here, because that
 * question is still worth asking.
 *
 * But an empty fixture cannot answer a different question: what the
 * CoA verification control and the stranded-work reassignment FORM
 * look like at 390 px. Both only appear once there is a row to act on,
 * so the empty harness renders their empty states and nothing else —
 * and "the form was never rendered" is exactly the gap the last mobile
 * pass had to record as not covered.
 *
 * So this is the populated sibling, selected at build time by
 * `VERIFY_FIXTURE=populated`. It serves only the tables and RPCs those
 * two panels read, and answers everything else exactly as the empty
 * stub does.
 *
 * ── THE ROWS ARE OBVIOUSLY FAKE, ON PURPOSE ──
 *
 * Names and numbers are plainly synthetic so no screenshot taken from
 * this harness can be mistaken for production data. Nothing here is
 * ever built into the application or published.
 */

type Res = { data: unknown; error: null };

const CERTIFICATES = [
  {
    id: 'cert-unverified', company_id: 'c1', material_lot_id: 'lot-1',
    certificate_number: 'FIXTURE-CoA-0001', issued_date: '2026-10-01',
    received_date: '2026-10-02',
    supplier_results: [
      { parameter: 'Assay', stated_value: 99.2, unit: '%' },
      { parameter: 'Water content', stated_value: 0.4, unit: '%' },
    ],
    verification_status: 'unverified', verified_at: null, verified_by: null,
    discrepancy_count: 0, uploaded_by: 'u-store', created_at: '2026-10-02T09:00:00Z',
  },
  {
    //  A long number and a discrepant verdict together: the pair most
    //  likely to overlap a badge or push a row wide on a phone.
    id: 'cert-discrepant', company_id: 'c1', material_lot_id: 'lot-1',
    certificate_number: 'FIXTURE-CoA-0002-SUPPLIER-REFERENCE-WITH-A-VERY-LONG-TAIL',
    issued_date: '2026-09-20', received_date: '2026-09-21',
    supplier_results: [{ parameter: 'Assay', stated_value: 80.0, unit: '%' }],
    verification_status: 'discrepant', verified_at: '2026-09-22T10:30:00Z',
    verified_by: 'u-analyst', discrepancy_count: 2,
    uploaded_by: 'u-store', created_at: '2026-09-21T09:00:00Z',
  },
];

const DISCREPANCIES = [
  {
    id: 'disc-1', certificate_id: 'cert-discrepant', parameter: 'Assay',
    discrepancy_type: 'out_of_specification',
    specification_limit: '95.0 – 105.0 %', stated_value: '80.0',
    is_critical: true, detected_at: '2026-09-22T10:30:00Z', resolved_at: null,
  },
  {
    id: 'disc-2', certificate_id: 'cert-discrepant',
    parameter: 'Residual solvents (total, expressed as a long parameter name)',
    discrepancy_type: 'missing_result',
    specification_limit: '<= 0.5 %', stated_value: null,
    is_critical: false, detected_at: '2026-09-22T10:30:00Z', resolved_at: null,
  },
];

const ASSIGNMENTS = [
  { id: 'a1', user_id: 'u-analyst', role: 'qc_analyst', reason: 'fixture',
    assigned_by: 'u-admin', assigned_at: '2026-09-01T00:00:00Z',
    revoked_by: null, revoked_at: null, revoke_reason: null,
    grant_signature_id: 's1', revoke_signature_id: null,
    provenance: 'rpc', declaration: null },
  { id: 'a2', user_id: 'u-qa', role: 'qa_manager', reason: 'fixture',
    assigned_by: 'u-admin', assigned_at: '2026-09-01T00:00:00Z',
    revoked_by: null, revoked_at: null, revoke_reason: null,
    grant_signature_id: 's2', revoke_signature_id: null,
    provenance: 'rpc', declaration: null },
];

const PROFILES = [
  { id: 'u-analyst', full_name: 'Fixture Analyst' },
  { id: 'u-qa', full_name: 'Fixture QA Manager With A Long Display Name' },
  { id: 'u-store', full_name: 'Fixture Storekeeper' },
];

const STRANDED = [
  {
    entity_type: 'material_lot', entity_id: 'lot-9', state_key: 'quarantine',
    section: 'qa_disposition', last_actor: 'u-store',
    last_acted_at: '2026-09-10T00:00:00Z',
    roles_lost: ['qa_officer'], roles_remaining: [],
    reassigned_to: null, reassigned_at: null, still_stranded: true,
  },
  {
    entity_type: 'batch_record', entity_id: 'batch-7', state_key: 'qc_in_progress',
    section: 'qc_testing', last_actor: 'u-store',
    last_acted_at: '2026-10-05T00:00:00Z',
    roles_lost: ['qc_analyst'], roles_remaining: ['storekeeper'],
    reassigned_to: null, reassigned_at: null, still_stranded: true,
  },
];

//  One lot, so QC testing has something to open — without it the CoA
//  panel is never reached and could not be inspected at phone width.
const LOTS = [
  {
    id: 'lot-1', company_id: 'c1', lot_number: 'FIXTURE-LOT-0001',
    material_id: 'mat-1', supplier_id: null, supplier_batch_number: 'SUP-77',
    quantity_received: 250, quantity_available: 250, unit_of_measure: 'kg',
    received_date: '2026-10-02', manufacture_date: null,
    supplier_expiry_date: null, retest_due_date: null,
    storage_location: 'Quarantine bay 3', status: 'quarantine',
    state_key: 'quarantine', material_name: 'Lactose monohydrate',
    received_by: 'u-store', created_by: 'u-store',
    created_at: '2026-10-02T09:00:00Z',
  },
];


//  FL-01's register: one row outside its action limit, one overdue and
//  never sampled, one clean. Enough to see the triage order and the
//  banner, and plainly synthetic so no screenshot reads as real data.
const FACILITY_REGISTER = [
  {
    schedule_id: 'fsc-1', zone_id: 'fz-1', zone_name: 'FIXTURE Granulation G2',
    zone_grade: 'Grade D', zone_line_ref: 'Line TL-1',
    log_type: 'environmental_surface', description: 'Surface swabs, 5 sites',
    frequency: 'weekly', due_time: null,
    alert_limit: 25, action_limit: 50, result_unit: 'CFU',
    last_entry_id: 'fe-1', last_recorded_at: '2026-10-24T06:20:00Z',
    last_result_value: 112, last_result_position: 'CP-3',
    last_outcome: 'outside_action', last_reference: null, days_since_last: 1,
  },
  {
    schedule_id: 'fsc-2', zone_id: 'fz-2', zone_name: 'FIXTURE Compression hall C1',
    zone_grade: 'Grade D', zone_line_ref: null,
    log_type: 'environmental_air', description: 'Air · settle plates, 4 positions',
    frequency: 'daily', due_time: '09:00:00',
    alert_limit: 50, action_limit: 100, result_unit: 'CFU',
    last_entry_id: null, last_recorded_at: null,
    last_result_value: null, last_result_position: null,
    last_outcome: null, last_reference: null, days_since_last: null,
  },
  {
    schedule_id: 'fsc-3', zone_id: 'fz-3', zone_name: 'FIXTURE Packing hall P1',
    zone_grade: 'Unclassified', zone_line_ref: null,
    log_type: 'cleaning_routine', description: 'Routine clean after shift',
    frequency: 'daily', due_time: '06:00:00',
    alert_limit: null, action_limit: null, result_unit: null,
    last_entry_id: 'fe-3', last_recorded_at: new Date().toISOString(),
    last_result_value: null, last_result_position: null,
    last_outcome: 'not_assessed', last_reference: 'FIXTURE-CR-0414',
    days_since_last: 0.1,
  },
];

const FACILITY_ENTRIES = [
  {
    id: 'fe-1', company_id: 'c1', zone_id: 'fz-1', schedule_id: 'fsc-1',
    log_type: 'environmental_surface', due_at: null,
    recorded_at: '2026-10-24T06:20:00Z', recorded_by: 'u-analyst',
    result_value: 112, result_unit: 'CFU', result_position: 'CP-3',
    performed: true, outcome: 'outside_action',
    notes: 'Re-swabbed after cleaning; second result pending.',
    reference: null, linked_deviation_id: 'dev-1',
  },
];


//  FL-02's zones and their scheduled tests. Three zones so the list,
//  the per-zone nesting and the retired state are all visible, and one
//  zone with no tests at all because that is the state the register
//  reports as "nothing from it reaches the register".
const FACILITY_ZONES = [
  {
    id: 'fz-1', company_id: 'c1', site_id: 'fs-1', name: 'FIXTURE Granulation G2',
    code: 'FX-GR-02', grade: 'Grade D', line_ref: 'TL-1',
    equipment_refs: ['FX-MIX-07', 'FX-SIEVE-02'], cleaning_sop_ref: 'FIXTURE-SOP-CLN-014',
    owner_id: 'u-analyst', alert_owner_after_days: 1, escalate_to_qa_after_days: 3,
    is_active: true,
  },
  {
    id: 'fz-2', company_id: 'c1', site_id: 'fs-1', name: 'FIXTURE Compression hall C1',
    code: 'FX-CP-01', grade: 'Grade D', line_ref: null,
    equipment_refs: [], cleaning_sop_ref: null,
    owner_id: null, alert_owner_after_days: 0, escalate_to_qa_after_days: 1,
    is_active: true,
  },
  {
    id: 'fz-9', company_id: 'c1', site_id: 'fs-2', name: 'FIXTURE Old quarantine bay',
    code: 'FX-QB-01', grade: 'Unclassified', line_ref: null,
    equipment_refs: [], cleaning_sop_ref: null,
    owner_id: null, alert_owner_after_days: 2, escalate_to_qa_after_days: 5,
    is_active: false,
  },
];

const FACILITY_SCHEDULES = [
  {
    id: 'fsc-1', company_id: 'c1', zone_id: 'fz-1',
    log_type: 'environmental_surface', description: 'Surface swabs, 5 sites',
    frequency: 'weekly', due_time: null,
    alert_limit: 25, action_limit: 50, result_unit: 'CFU',
    owner_id: null, is_active: true,
  },
  {
    id: 'fsc-2', company_id: 'c1', zone_id: 'fz-1',
    log_type: 'cleaning_deep', description: 'Deep clean after campaign',
    frequency: 'quarterly', due_time: null,
    alert_limit: null, action_limit: null, result_unit: null,
    owner_id: null, is_active: true,
  },
  {
    id: 'fsc-3', company_id: 'c1', zone_id: 'fz-1',
    log_type: 'environmental_air', description: 'Retired air plate round',
    frequency: 'daily', due_time: '09:00:00',
    alert_limit: 50, action_limit: 100, result_unit: 'CFU',
    owner_id: null, is_active: false,
  },
];

const FACILITY_SITES = [
  { id: 'fs-1', name: 'FIXTURE Oluyole plant', site_type: 'manufacturing' },
  { id: 'fs-2', name: 'FIXTURE Ibadan warehouse', site_type: 'warehouse' },
];

//  FL-06's two charts. The first rises every week and crosses both
//  limits, which is the narrative the design prints; the second is
//  flat with a single excursion, which is the other one. Week starts
//  are Mondays, as date_trunc('week') produces.
const FACILITY_TREND = [
  ...[
    ['2026-08-03', 28], ['2026-08-10', 34], ['2026-08-17', 41],
    ['2026-08-24', 55], ['2026-08-31', 68], ['2026-09-07', 84],
    ['2026-09-14', 96], ['2026-09-21', 112],
  ].map(([week, v]) => ({
    zone_id: 'fz-2', zone_name: 'FIXTURE Compression hall C1', zone_grade: 'Grade D',
    week_start: week, max_value: v,
    max_recorded_at: `${week}T06:20:00Z`, sample_count: 4,
    result_unit: 'CFU', alert_limit: 50, action_limit: 100,
  })),
  ...[
    ['2026-08-03', 12], ['2026-08-10', 14], ['2026-08-17', 11],
    ['2026-08-24', 13], ['2026-08-31', 52], ['2026-09-07', 12],
    ['2026-09-14', 10], ['2026-09-21', 13],
  ].map(([week, v]) => ({
    zone_id: 'fz-1', zone_name: 'FIXTURE Granulation G2', zone_grade: 'Grade D',
    week_start: week, max_value: v,
    max_recorded_at: `${week}T07:05:00Z`, sample_count: 2,
    result_unit: 'CFU', alert_limit: 25, action_limit: 50,
  })),
];

//  FL-13's pest control. One visit with the five station findings the
//  design draws — including the one marked as needing action, which is
//  the row whose Close control must be disabled with its reason shown.
const PEST_REGISTER = [
  {
    visit_id: 'pv-1', reference: 'FIXTURE PC-2026-0019', visited_on: '2026-10-20',
    technician_name: 'FIXTURE Kunle Ade',
    report_file_ref: 'fixture-greenshield-20oct.pdf',
    checked_by: 'u-analyst', checked_at: '2026-10-21T08:00:00Z',
    provider_id: 'pp-1', provider_name: 'FIXTURE Greenshield Pest Services Ltd',
    visit_frequency: 'Fortnightly visits', contract_until: '2027-03-31',
    methods: ['Bait stations', 'Insect light traps', 'Crack-and-crevice gel'],
    next_visit_on: '2026-11-03',
    finding_count: 5, needs_action_count: 1, open_action_count: 1,
  },
  {
    visit_id: 'pv-2', reference: 'FIXTURE PC-2026-0018', visited_on: '2026-10-06',
    technician_name: 'FIXTURE Kunle Ade', report_file_ref: null,
    checked_by: null, checked_at: null,
    provider_id: 'pp-1', provider_name: 'FIXTURE Greenshield Pest Services Ltd',
    visit_frequency: 'Fortnightly visits', contract_until: '2027-03-31',
    methods: ['Bait stations', 'Insect light traps', 'Crack-and-crevice gel'],
    next_visit_on: '2026-11-03',
    finding_count: 2, needs_action_count: 0, open_action_count: 0,
  },
];

const PEST_FINDINGS = [
  {
    id: 'pf-1', company_id: 'c1', visit_id: 'pv-1', station_code: 'BS-07',
    location_ref: 'FIXTURE Warehouse W1 · dock door', zone_id: null,
    finding: 'Rodent droppings; 60% of bait taken',
    method_used: 'Bait replaced, entry gap under door noted',
    needs_action: true, disposition_note: null, corrective_task_id: null,
    resolved_at: null, resolved_by: null, resolution_note: null,
  },
  {
    id: 'pf-2', company_id: 'c1', visit_id: 'pv-1', station_code: 'BS-03',
    location_ref: 'FIXTURE Warehouse W1 · rear wall', zone_id: null,
    finding: 'No activity', method_used: 'Bait checked',
    needs_action: false, disposition_note: null, corrective_task_id: null,
    resolved_at: null, resolved_by: null, resolution_note: null,
  },
  {
    id: 'pf-3', company_id: 'c1', visit_id: 'pv-1', station_code: 'ILT-02',
    location_ref: 'FIXTURE Packing hall P1', zone_id: null,
    finding: '3 flies on glue board', method_used: 'Board replaced',
    needs_action: false, disposition_note: 'Normal level · no action',
    corrective_task_id: null, resolved_at: null, resolved_by: null, resolution_note: null,
  },
  {
    id: 'pf-4', company_id: 'c1', visit_id: 'pv-1', station_code: 'BS-11',
    location_ref: 'FIXTURE Canteen, outside', zone_id: null,
    finding: 'Bait taken 20%', method_used: 'Bait replaced',
    needs_action: false, disposition_note: 'Watch at next visit',
    corrective_task_id: null, resolved_at: null, resolved_by: null, resolution_note: null,
  },
  {
    id: 'pf-5', company_id: 'c1', visit_id: 'pv-1', station_code: 'BS-22',
    location_ref: 'FIXTURE Canteen drain', zone_id: null,
    finding: 'Cockroach activity, canteen drain', method_used: 'Gel applied',
    needs_action: true, disposition_note: null,
    corrective_task_id: 'fixture-task-0161',
    resolved_at: '2026-09-26T10:00:00Z', resolved_by: 'u-analyst',
    resolution_note: 'drain cover replaced',
  },
];

//  The approved-supplier register. One lapsed-but-still-"Qualified"
//  row, which is the silent failure the screen exists to surface.
const SUPPLIERS = [
  {
    id: 'sup-1', company_id: 'c1', name: 'FIXTURE Acme Excipients',
    code: 'FX-SUP-001', qualification_status: 'qualified',
    qualified_until: '2027-03-31', address: null, country: 'Nigeria',
    contact_email: 'quality@example.invalid', notes: null,
  },
  {
    id: 'sup-2', company_id: 'c1', name: 'FIXTURE Baltic Chemicals',
    code: 'FX-SUP-002', qualification_status: 'qualified',
    qualified_until: '2026-06-30', address: null, country: 'Poland',
    contact_email: null, notes: null,
  },
  {
    id: 'sup-3', company_id: 'c1', name: 'FIXTURE Delta Packaging',
    code: 'FX-SUP-003', qualification_status: 'conditional',
    qualified_until: '2026-11-30', address: null, country: 'Nigeria',
    contact_email: null, notes: null,
  },
  {
    id: 'sup-4', company_id: 'c1', name: 'FIXTURE Omega Solvents',
    code: 'FX-SUP-004', qualification_status: 'suspended',
    qualified_until: null, address: null, country: 'India',
    contact_email: null, notes: null,
  },
  {
    id: 'sup-5', company_id: 'c1', name: 'FIXTURE Pending Traders',
    code: 'FX-SUP-005', qualification_status: 'pending',
    qualified_until: null, address: null, country: 'Ghana',
    contact_email: null, notes: null,
  },
];

//  FL-11's six rows, with all four shapes of limit — including the
//  pH range and the coliform absence that the environmental model
//  cannot express, and the monthly analysis awaiting its laboratory.
const WATER_REGISTER = [
  {
    test_id: 'wt-1', source_id: 'ws-1', source_name: 'FIXTURE Purified water loop',
    source_ref: 'BH-1', test_name: 'Free chlorine after carbon',
    sample_point: 'After carbon filter', frequency: 'daily',
    limit_kind: 'max', limit_min: null, limit_max: 0, expected_text: null,
    result_unit: 'mg/L', laboratory_kind: 'in_house', laboratory_name: 'In-house',
    last_result_id: 'wr-1', last_sampled_on: '2026-10-21', last_due_on: null,
    last_value: 0, last_text: null, last_received: true,
    last_report_ref: null, last_outcome: 'within_limits',
  },
  {
    test_id: 'wt-2', source_id: 'ws-1', source_name: 'FIXTURE Purified water loop',
    source_ref: 'BH-1', test_name: 'Conductivity, RO permeate',
    sample_point: 'RO permeate', frequency: 'daily',
    limit_kind: 'max', limit_min: null, limit_max: 1.3, expected_text: null,
    result_unit: 'µS/cm', laboratory_kind: 'in_house', laboratory_name: 'In-house',
    last_result_id: 'wr-2', last_sampled_on: '2026-10-21', last_due_on: null,
    last_value: 1.1, last_text: null, last_received: true,
    last_report_ref: null, last_outcome: 'within_limits',
  },
  {
    test_id: 'wt-3', source_id: 'ws-1', source_name: 'FIXTURE Purified water loop',
    source_ref: 'BH-1', test_name: 'pH, loop return',
    sample_point: 'Loop return', frequency: 'daily',
    limit_kind: 'range', limit_min: 5, limit_max: 7, expected_text: null,
    result_unit: null, laboratory_kind: 'in_house', laboratory_name: 'In-house',
    last_result_id: 'wr-3', last_sampled_on: '2026-10-21', last_due_on: null,
    last_value: 4.2, last_text: null, last_received: true,
    last_report_ref: null, last_outcome: 'outside_limits',
  },
  {
    test_id: 'wt-4', source_id: 'ws-1', source_name: 'FIXTURE Purified water loop',
    source_ref: 'BH-1', test_name: 'Total viable count, PW-03',
    sample_point: 'PW-03', frequency: 'weekly',
    limit_kind: 'max', limit_min: null, limit_max: 100, expected_text: null,
    result_unit: 'cfu/mL', laboratory_kind: 'external',
    laboratory_name: 'FIXTURE Labcheck Analytical',
    last_result_id: 'wr-4', last_sampled_on: '2026-10-15', last_due_on: null,
    last_value: 42, last_text: null, last_received: true,
    last_report_ref: 'LA-88412', last_outcome: 'within_limits',
  },
  {
    test_id: 'wt-5', source_id: 'ws-1', source_name: 'FIXTURE Purified water loop',
    source_ref: 'BH-1', test_name: 'Coliforms, PW-03',
    sample_point: 'PW-03', frequency: 'weekly',
    limit_kind: 'qualitative', limit_min: null, limit_max: null,
    expected_text: 'Absent', result_unit: '100 mL',
    laboratory_kind: 'external', laboratory_name: 'FIXTURE Labcheck Analytical',
    last_result_id: 'wr-5', last_sampled_on: '2026-10-15', last_due_on: null,
    last_value: null, last_text: 'Absent', last_received: true,
    last_report_ref: 'LA-88412', last_outcome: 'within_limits',
  },
  {
    test_id: 'wt-6', source_id: 'ws-1', source_name: 'FIXTURE Purified water loop',
    source_ref: 'BH-1', test_name: 'Full chemical analysis, raw water',
    sample_point: 'Raw water', frequency: 'monthly',
    limit_kind: 'max', limit_min: null, limit_max: 9999, expected_text: null,
    result_unit: null, laboratory_kind: 'external',
    laboratory_name: 'FIXTURE Labcheck Analytical',
    last_result_id: 'wr-6', last_sampled_on: '2026-10-01', last_due_on: '2026-10-15',
    last_value: null, last_text: null, last_received: false,
    last_report_ref: null, last_outcome: 'awaiting_laboratory',
  },
];

const WATER_STAGES = [
  { id: 'wst-0', source_id: 'ws-1', position: 0, name: 'Borehole BH-1', equipment_ref: null },
  { id: 'wst-1', source_id: 'ws-1', position: 1, name: 'Sand filter', equipment_ref: null },
  { id: 'wst-2', source_id: 'ws-1', position: 2, name: 'Carbon filter', equipment_ref: null },
  { id: 'wst-3', source_id: 'ws-1', position: 3, name: 'Softener', equipment_ref: null },
  { id: 'wst-4', source_id: 'ws-1', position: 4, name: 'Reverse osmosis', equipment_ref: 'RO-1' },
  { id: 'wst-5', source_id: 'ws-1', position: 5, name: 'UV lamp', equipment_ref: 'UV-1' },
  { id: 'wst-6', source_id: 'ws-1', position: 6, name: 'Purified water loop', equipment_ref: null },
];

const BY_TABLE: Record<string, unknown[]> = {
  facility_water_stages: WATER_STAGES,
  suppliers: SUPPLIERS,
  facility_log_entries: FACILITY_ENTRIES,
  facility_zones: FACILITY_ZONES,
  facility_zone_schedules: FACILITY_SCHEDULES,
  facility_pest_findings: PEST_FINDINGS,
  material_lots: LOTS,
  material_certificates_of_analysis: CERTIFICATES,
  material_coa_discrepancies: DISCREPANCIES,
  operational_role_assignments: ASSIGNMENTS,
  profiles: PROFILES,
};

const BY_RPC: Record<string, unknown> = {
  operational_role_stranded_work: STRANDED,
  facility_log_register: FACILITY_REGISTER,
  facility_site_options: FACILITY_SITES,
  facility_log_trend: FACILITY_TREND,
  facility_pest_register: PEST_REGISTER,
  facility_water_register: WATER_REGISTER,
};

function builder(table: string): any {
  const self: any = {};
  const chain = () => self;
  for (const m of [
    'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'gte',
    'lt', 'lte', 'is', 'in', 'or', 'and', 'not', 'like', 'ilike', 'contains',
    'order', 'limit', 'range', 'filter', 'match', 'returns', 'overlaps',
  ]) self[m] = chain;

  const rows = () => BY_TABLE[table] ?? [];
  self.single = async (): Promise<Res> => ({ data: (rows()[0] ?? null) as unknown, error: null });
  self.maybeSingle = async (): Promise<Res> => ({ data: (rows()[0] ?? null) as unknown, error: null });
  self.csv = async (): Promise<Res> => ({ data: '', error: null });
  self.then = (resolve: (r: Res) => unknown) =>
    Promise.resolve({ data: rows(), error: null, count: rows().length } as Res).then(resolve);
  return self;
}

export const supabase: any = {
  from: (table: string) => builder(table),
  rpc: async (name: string): Promise<Res> => ({ data: BY_RPC[name] ?? [], error: null }),
  auth: {
    getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
  removeChannel: () => {},
};
export default supabase;
