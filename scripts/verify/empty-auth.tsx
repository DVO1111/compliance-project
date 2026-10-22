/**
 * A signed-in person whose role comes from the URL.
 *
 * ?role=storekeeper renders the application as a Storekeeper,
 * ?role=qa_manager as a QA Manager, and so on. That is the whole point:
 * the defect being tested is that every role saw the same application,
 * and the only way to see that for yourself is to render the real shell
 * as each of them and compare.
 *
 * industry_type stays empty on purpose. 'generic' is the case that used
 * to hide the entire Quality Operations section, so leaving it blank
 * proves the rail is shaped by the ROLE and not by the industry gate
 * quietly removing everything.
 *
 * Never built into the application or published.
 */
const ROLE = new URLSearchParams(
  typeof location === 'undefined' ? '' : location.search,
).get('role') ?? 'qa_manager';

export function useAuth() {
  return {
    signOut: () => {},
    profile: {
      id: 'u1',
      full_name: '',
      //  company_role is the workspace job PM-03 is about; role is the
      //  platform account type. Set both to the same thing so the
      //  harness cannot accidentally pass through an admin fallback.
      company_role: ROLE,
      role: ROLE,
      job_title: '',
      company_id: 'c1',
      organization_id: null,
      industry_type: '',
      module_access: null,
      customPermissions: null,
      onboarding_completed: true,
    },
    user: { id: 'u1', email: '' },
  } as any;
}
export const AuthProvider = ({ children }: any) => children;
