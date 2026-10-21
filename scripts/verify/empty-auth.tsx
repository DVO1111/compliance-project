/**
 * A signed-in person whose workspace has NO industry set.
 *
 * industry_type is deliberately empty. categorize() maps that to
 * 'generic', which is the exact case that used to hide the entire
 * Quality Operations section — so this is the fixture that proves the
 * fix rather than one that sidesteps it. If the sidebar shows those
 * items here, it shows them for an account that never picked an
 * industry and for one that picked "Other".
 *
 * Never built into the application or published.
 */
export function useAuth() {
  return {
    signOut: () => {},
    profile: {
      id: 'u1',
      full_name: '',
      role: 'admin',
      company_role: 'admin',
      job_title: '',
      company_id: 'c1',
      organization_id: null,
      //  THE POINT OF THIS FIXTURE.
      industry_type: '',
      module_access: null,
      customPermissions: null,
      onboarding_completed: true,
    },
    user: { id: 'u1', email: '' },
  } as any;
}
export const AuthProvider = ({ children }: any) => children;
