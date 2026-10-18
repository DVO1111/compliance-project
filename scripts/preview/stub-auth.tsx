//  Stand-ins for the two hooks MainLayout needs, so the whole shell can
//  be rendered without a session. Nothing here is shipped.
export function useAuth() {
  return {
    signOut: () => {},
    profile: {
      id: 'u1', full_name: 'Ada Okafor', role: 'admin',
      job_title: 'Head of Quality',
      company_id: 'c1', organization_id: null,
      industry_type: 'Pharmaceutical Manufacturing',
      module_access: null, customPermissions: null,
    },
    user: { id: 'u1', email: 'ada@ibadanpharma.test' },
  } as any;
}
export const AuthProvider = ({ children }: any) => children;
