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

const BY_TABLE: Record<string, unknown[]> = {
  material_lots: LOTS,
  material_certificates_of_analysis: CERTIFICATES,
  material_coa_discrepancies: DISCREPANCIES,
  operational_role_assignments: ASSIGNMENTS,
  profiles: PROFILES,
};

const BY_RPC: Record<string, unknown> = {
  operational_role_stranded_work: STRANDED,
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
