//  A stand-in for src/lib/supabase, so the real dashboard component can
//  be rendered and photographed without a database. Every query resolves
//  to canned rows for one workspace.
const COUNTS: Record<string, number> = {
  'products': 4,
  'batch_records': 0,
  'capa_records': 0,
  'raw_material_receipts': 0,
  'regulatory_licences': 0,
  'regulatory_obligations': 4,
  'policies': 3,
  'risks': 5,
  'company_invites': 0,
};
function builder(table: string): any {
  const rows = table === 'companies' ? { name: 'Ibadan Pharmaceuticals Ltd.' }
    : table === 'profiles' ? { full_name: 'Ada Okafor', onboarding_completed: true }
    : null;
  const list = table === 'products' ? [
      { id: 'p1', company_id: 'c1', product_code: 'AMOX-500-CAP', trade_name: 'Amoxil 500 mg Capsules',
        generic_name: 'Amoxicillin', category: 'drug_pharmaceutical', status: 'active',
        manufacturing_type: 'in_house', dosage_form: 'Capsule', strength: '500 mg', pack_size: '10 x 10 blister',
        nafdac_number: 'A4-0100', registration_expiry_date: '2026-09-30', is_controlled_substance: false,
        metadata: {}, created_at: '', updated_at: '' },
      { id: 'p2', company_id: 'c1', product_code: 'PARA-500-TAB', trade_name: 'Paracetamol 500 mg Tablets',
        generic_name: 'Paracetamol', category: 'drug_pharmaceutical', status: 'registered',
        manufacturing_type: 'in_house', dosage_form: 'Tablet', strength: '500 mg', pack_size: '10 x 10 blister',
        nafdac_number: 'A4-0211', registration_expiry_date: '2027-06-30', is_controlled_substance: false,
        metadata: {}, created_at: '', updated_at: '' },
      { id: 'p3', company_id: 'c1', product_code: 'VITC-1000', trade_name: 'Vitamin C 1000 mg',
        generic_name: 'Ascorbic acid', category: 'herbal_nutraceutical', status: 'submitted',
        manufacturing_type: 'in_house', dosage_form: 'Tablet', strength: '1000 mg', pack_size: '30s',
        nafdac_number: null, registration_expiry_date: null, is_controlled_substance: false,
        metadata: {}, created_at: '', updated_at: '' },
      { id: 'p4', company_id: 'c1', product_code: 'CTM-4', trade_name: 'Chlorpheniramine 4 mg',
        generic_name: 'Chlorpheniramine', category: 'drug_pharmaceutical', status: 'suspended',
        manufacturing_type: 'contract_manufactured', dosage_form: 'Tablet', strength: '4 mg', pack_size: '100s',
        nafdac_number: 'A4-0455', registration_expiry_date: '2028-01-31', is_controlled_substance: false,
        metadata: {}, created_at: '', updated_at: '' },
    ]
    : table === 'sites' ? [{ id: 's1', name: 'Ibadan plant' }]
    : table === 'company_invites'
      ? [{ email: 'tunde@ibadanpharma.test' },
         { email: 'ngozi.eze@ibadanpharma.test' },
         { email: 'kunle@ibadanpharma.test' }]
      : [];
  const result = { data: rows ?? list, count: COUNTS[table] ?? 0, error: null };
  const self: any = new Proxy(() => {}, {
    get(_t, prop) {
      if (prop === 'then') return (res: any) => Promise.resolve(result).then(res);
      if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: rows, error: null });
      return () => self;
    },
    apply() { return self; },
  });
  return self;
}
//  Realtime and auth are no-ops: the preview has no session and nothing
//  to subscribe to, but components that call them must not throw.
const channel: any = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'subscribe') return () => channel;
    return () => channel;
  },
});

export const supabase: any = {
  from: (t: string) => builder(t),
  channel: () => channel,
  removeChannel: () => {},
  rpc: () => Promise.resolve({ data: null, error: null }),
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: () => Promise.resolve({ error: null }),
  },
};
export const isSupabaseConfigured = true;
export const INITIAL_AUTH_CALLBACK_IS_INVITE = false;
export const INITIAL_AUTH_CALLBACK_IS_RECOVERY = false;
