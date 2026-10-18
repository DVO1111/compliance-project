//  A stand-in for src/lib/supabase, so the real dashboard component can
//  be rendered and photographed without a database. Every query resolves
//  to canned rows for one workspace.
const COUNTS: Record<string, number> = {
  'products': 0,
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
  const list = table === 'sites' ? [{ id: 's1', name: 'Ibadan plant' }]
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
export const supabase: any = { from: (t: string) => builder(t) };
export const isSupabaseConfigured = true;
export const INITIAL_AUTH_CALLBACK_IS_INVITE = false;
export const INITIAL_AUTH_CALLBACK_IS_RECOVERY = false;
