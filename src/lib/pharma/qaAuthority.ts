/**
 * qaAuthority — who may perform GMP "authorised person" writes in the UI.
 *
 * MUST stay in sync with the RLS policy set in
 * supabase/migrations/20260702000200_rls_quality_tables_draft.sql
 * (app_has_company_role(company_id, ARRAY['owner','admin'])). If Tope ratifies
 * a different QA-authority role set (e.g. a dedicated 'qa' role), change it here
 * AND in that migration together.
 *
 * These gate the quality-critical writes — batch release/hold/reject, CoA
 * approval, raw-material disposition — that RLS restricts. Gating the UI as well
 * avoids a silent RLS rejection when a non-QA user clicks the button.
 */

export const QA_AUTHORITY_ROLES = ['owner', 'admin'] as const;

/** The user's company-membership role (profiles are extended with `company_role`). */
export function isQaAuthority(companyRole: string | null | undefined): boolean {
  return !!companyRole && (QA_AUTHORITY_ROLES as readonly string[]).includes(companyRole);
}
