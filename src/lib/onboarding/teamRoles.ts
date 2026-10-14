/**
 * ONB-05 · who does what, and what that lets them do.
 *
 * "The ADM-04 invite modal used Admin / Legal / Marketing / Viewer and a
 *  module-access list. Both are replaced: roles come from the PRD user
 *  list (1.3), and module access follows step 4 plus the role."
 *
 * So these are JOBS, not permission levels. The five below, and the
 * sentence beside each, are the ones on the screen.
 *
 * WHAT THE PERMISSION LEVEL IS SET TO, AND WHY IT IS NOT THE JOB
 * -------------------------------------------------------------
 * company_members.role is the old product's permission ladder —
 * owner / admin / legal / marketing / viewer. Mapping "Head of Quality"
 * onto `admin` would re-introduce exactly the set the notes say is
 * replaced, and would do it by guessing: `admin` can invite people,
 * remove members and change roles, none of which follows from running a
 * QA department.
 *
 * So every invited person is created at the LEAST privileged level, and
 * what they can reach comes from step 4's module access. The job is
 * stored as job_title, beside it, where the rest of the product can read
 * it without it being mistaken for a permission.
 *
 * The release authority these descriptions mention is a STEP permission
 * (2.5, C8.6) — it belongs to the batch release lifecycle, not to this
 * table, and nothing here grants it. The copy says what the role means
 * so that "QC cannot release" is read before someone looks for the
 * button, which is the whole point the notes make.
 */

export interface TeamRole {
  id: string;
  /** As it appears in the dropdown and in "What the roles mean". */
  title: string;
  /** The sentence beside it on the screen. */
  meaning: string;
  /** Ticked by default in the SIGNS column — the roles that usually
   *  hold signing authority. Still a decision the admin makes; this is
   *  only where the toggle starts. */
  usuallySigns: boolean;
}

export const TEAM_ROLES: readonly TeamRole[] = [
  {
    id: 'head-of-quality',
    title: 'Head of Quality / QA Manager',
    meaning: 'Approves and closes quality records. Holds the QA release permission.',
    usuallySigns: true,
  },
  {
    id: 'qc-analyst',
    title: 'QC Analyst',
    meaning: 'Logs samples and test results. Cannot release materials or batches.',
    usuallySigns: false,
  },
  {
    id: 'production-manager',
    title: 'Production Manager',
    meaning: 'Runs batch records, signs stages and line clearance.',
    usuallySigns: false,
  },
  {
    id: 'regulatory-affairs-lead',
    title: 'Regulatory Affairs Lead',
    meaning: 'Prepares applications and dossiers, tracks licences and renewals.',
    usuallySigns: true,
  },
  {
    id: 'managing-director',
    title: 'Managing Director',
    meaning: 'Sees compliance posture across sites. Usually an authorised signatory.',
    usuallySigns: true,
  },
];

export const ROLE_TITLES: readonly string[] = TEAM_ROLES.map((r) => r.title);

export function roleByTitle(title: string): TeamRole | undefined {
  return TEAM_ROLES.find((r) => r.title === title);
}

/**
 * The permission level an invited person is created at.
 *
 * Always the least privileged one. See the note at the top of this
 * file: a job title is not a permission, and deriving one from the
 * other is how someone ends up able to remove their colleagues because
 * they run a laboratory.
 */
export const INVITE_PERMISSION_LEVEL = 'viewer';

export function permissionRoleFor(_jobTitle: string): string {
  return INVITE_PERMISSION_LEVEL;
}

export const SIGNATORY_NOTE =
  '“Signs applications” adds the person to the authorised signatory register. ' +
  'Submissions check the application letter is signed by someone on it.';

export const ALL_SITES_LABEL = 'All sites';
