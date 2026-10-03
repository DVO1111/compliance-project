-- ===================================================================
--  Close the view-ownership RLS bypass on the four performance views
--
--  WHY
--  ---
--  A Postgres view executes as its OWNER unless it carries
--  security_invoker, so row-level security on its base tables does not
--  apply to the caller. Week 3 item 05 hit this on a new view and fixed
--  it there. Auditing the rest of the repository afterwards found that
--  the four views in 20260306150000_performance_views.sql are the only
--  others affected: of the eight views in the migration tree, the four
--  added in Week 3 all carry the clause and these four do not.
--
--  Each of the four selects company_id and aggregates tenant-scoped
--  data, and src/lib/governance/commandCenterService.ts reads them with
--  `.eq('company_id', companyId)` where companyId comes from the
--  client. A filter supplied by the caller is not an authorisation, so
--  as things stand any authenticated user can read another company's
--  policy compliance, vendor risk and audit velocity by changing one
--  argument. That is the same class of hole PR #5 closed elsewhere.
--
--  WHY THE CLAUSE ALONE IS NOT ENOUGH FOR v_policy_compliance_stats
--  ----------------------------------------------------------------
--  Turning on security_invoker changes what a view returns, and for
--  this one it would have made the number wrong instead of merely
--  unsafe. Both of its counts come from tables whose RLS grants a plain
--  member sight of their own row only:
--
--    profiles                 "Users can view own profile"  -> auth.uid() = id
--                             "Reviewers can view company"  -> admin / compliance_officer
--    policy_acknowledgements  own row                       -> auth.uid() = user_id
--                             whole company                 -> admin / compliance_officer
--
--  PostgreSQL ORs permissive policies, so an admin sees the company and
--  everyone else sees exactly one row. Under a bare security_invoker
--  view, total_users and acknowledged_users would both collapse to 1
--  for most roles and the compliance rate would read 0% or 100% with no
--  error anywhere. This repository has already shipped that failure
--  once — three dashboard KPIs reading zero and passing green — so the
--  counts move into a SECURITY DEFINER function that checks membership
--  before counting, and the view keeps only the row scoping.
--
--  A SEPARATE, PRE-EXISTING BUG, FIXED HERE
--  ----------------------------------------
--  The original view counted employees with
--
--      SELECT organization_id AS company_id ... FROM profiles
--
--  and joined that to policies.company_id. profiles.organization_id
--  references organizations(id), not companies(id); it is added by
--  20260226000000_enterprise_hierarchy.sql and never backfilled from
--  company_id. The two are different identifier spaces, so the join
--  almost never matched, total_employees fell to 0 and the view's own
--  CASE then returned a compliance rate of 0 for every policy. Every
--  RLS policy in the schema scopes profiles by company_id, so that is
--  the correct column and this uses it.
--
--  v_automation_health_summary CANNOT BE REPAIRED HERE
--  ---------------------------------------------------
--  It reads public.grc_automation_runs, and nothing in the migration
--  tree creates that table — it appears exactly once, in the view's own
--  definition. 20260305213000_grc_automation_schema.sql creates
--  grc_control_tests, grc_test_runs and grc_test_run_evidence, none of
--  them this. That is the real reason performance_views.sql is in the
--  CI failure baseline, and the baseline's note on it was wrong; it is
--  corrected in the same commit as this file.
--
--  Because the migration aborts on that second statement,
--  v_policy_compliance_stats is created and the three after it are not.
--  So a database that ever ran it holds the leaking view and none of
--  the rest. Everything below is written to work either way: the two
--  views whose base tables exist are defined properly, and the
--  automation one is only touched if its source table is ever created.
--
--  WHAT THIS DOES NOT DO
--  ---------------------
--  It does not alter 20260306150000_performance_views.sql. Editing a
--  migration that has already run against production is its own change
--  with its own review, and leaving it in place keeps the history
--  honest about what was applied.
-- ===================================================================


-- ── 1. Membership-checked counts for the policy compliance view ──────
--
--  SECURITY DEFINER because the counts must span the company while the
--  caller may only be able to read their own row. The membership check
--  is the authorisation: being able to name a policy id is not.
--
--  Returns zeros rather than raising for a non-member. The view calls
--  this once per visible policy, and RLS on `policies` has already
--  restricted those to the caller's company, so a non-member reaching
--  this is not an expected path — it is a second line, and a quiet zero
--  is the safer answer there than an exception that a discarded error
--  would turn into an empty dashboard anyway.
--  The two counts are bigint, not integer, because the view they feed
--  already exists with bigint columns — they came from count(*) through
--  a coalesce. CREATE OR REPLACE VIEW cannot change a column's type, so
--  returning integer here would make this migration fail on any
--  database that already has the old view, which is the only kind that
--  matters.
CREATE OR REPLACE FUNCTION public.policy_ack_coverage(p_policy_id uuid)
RETURNS TABLE (total_users bigint, acknowledged_users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_version_id uuid;
BEGIN
  SELECT p.company_id INTO v_company_id
    FROM public.policies p
   WHERE p.id = p_policy_id;

  IF v_company_id IS NULL THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint;
    RETURN;
  END IF;

  IF NOT (public.app_is_company_member(v_company_id)
          OR public.app_is_service_context()) THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint;
    RETURN;
  END IF;

  --  The latest published version, matching the original view's intent:
  --  compliance is measured against what people are currently asked to
  --  acknowledge, not against every version ever published.
  SELECT v.id INTO v_version_id
    FROM public.policy_versions v
   WHERE v.policy_id = p_policy_id
     AND v.status = 'published'
   ORDER BY v.created_at DESC
   LIMIT 1;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.profiles pr
      WHERE pr.company_id = v_company_id),
    CASE WHEN v_version_id IS NULL THEN 0::bigint
         ELSE (SELECT count(*)
                 FROM public.policy_acknowledgements a
                WHERE a.version_id = v_version_id)
    END;
END;
$$;

COMMENT ON FUNCTION public.policy_ack_coverage(uuid) IS
  'Company-wide headcount and acknowledgement count for one policy, measured against its latest published version. SECURITY DEFINER because RLS on profiles and policy_acknowledgements shows a plain member only their own row, which would silently reduce both counts to 1. Checks company membership before counting; returns zeros for a non-member.';

REVOKE ALL ON FUNCTION public.policy_ack_coverage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.policy_ack_coverage(uuid) TO authenticated, service_role;


-- ── 2. v_policy_compliance_stats ─────────────────────────────────────
--
--  security_invoker scopes the rows: a caller sees exactly the policies
--  RLS on `policies` lets them see. The counts come from section 1.
--
--  The column list and its order are unchanged from the original, so
--  CREATE OR REPLACE succeeds on a database that already has the view
--  and commandCenterService.ts keeps working untouched.
CREATE OR REPLACE VIEW public.v_policy_compliance_stats
  WITH (security_invoker = true) AS
SELECT
  p.id                      AS policy_id,
  p.company_id              AS company_id,
  p.title                   AS policy_title,
  cov.total_users           AS total_users,
  cov.acknowledged_users    AS acknowledged_users,
  CASE
    WHEN cov.total_users = 0 THEN 0
    ELSE round((cov.acknowledged_users::numeric / cov.total_users::numeric) * 100)
  END                       AS compliance_rate
FROM public.policies p
CROSS JOIN LATERAL public.policy_ack_coverage(p.id) AS cov
WHERE p.is_active = true;

COMMENT ON VIEW public.v_policy_compliance_stats IS
  'Acknowledgement coverage per active policy. security_invoker, so rows follow RLS on policies; the counts come from policy_ack_coverage() because the caller cannot necessarily read every profile or acknowledgement. Replaces a definition that joined profiles.organization_id to policies.company_id and therefore reported 0% for every policy.';


-- ── 3. v_vendor_risk_exposure ────────────────────────────────────────
--
--  Both base tables are already scoped to the caller's company:
--
--    vendors               company_id IN (caller's profile company)
--    vendor_risk_profiles  vendor_id IN (those vendors)
--
--  so security_invoker is correct and sufficient here — the aggregate
--  is computed over exactly the rows the caller may read, and no
--  helper is needed.
CREATE OR REPLACE VIEW public.v_vendor_risk_exposure
  WITH (security_invoker = true) AS
SELECT
  v.company_id                  AS company_id,
  v.category                    AS category,
  round(avg(p.risk_score))      AS avg_risk_score,
  count(*)                      AS vendor_count
FROM public.vendors v
JOIN public.vendor_risk_profiles p ON p.vendor_id = v.id
WHERE v.status = 'active'
GROUP BY v.company_id, v.category;

COMMENT ON VIEW public.v_vendor_risk_exposure IS
  'Average risk score and vendor count per category. security_invoker; both base tables carry company-scoped SELECT policies, so the aggregate needs no further scoping.';


-- ── 4. v_audit_velocity ──────────────────────────────────────────────
--
--  audit_requests has three SELECT policies, ORed: the caller's company,
--  a management role in that company, and an external auditor limited
--  to sessions they participate in. security_invoker is what makes that
--  last one work as intended — an auditor sees their own sessions and
--  nothing else. Under the owner's rights they saw every company's.
CREATE OR REPLACE VIEW public.v_audit_velocity
  WITH (security_invoker = true) AS
SELECT
  r.company_id        AS company_id,
  r.audit_session_id  AS audit_session_id,
  s.name              AS session_name,
  count(*)            AS total_requests,
  count(*) FILTER (WHERE r.status = 'fulfilled') AS fulfilled_requests
FROM public.audit_requests r
JOIN public.audit_sessions s ON s.id = r.audit_session_id
GROUP BY r.company_id, r.audit_session_id, s.name;

COMMENT ON VIEW public.v_audit_velocity IS
  'Request throughput per audit session. security_invoker, which also makes the external-auditor policy on audit_requests behave as intended: a participant sees their own sessions rather than every company''s.';


-- ── 5. v_automation_health_summary ───────────────────────────────────
--
--  Guarded, because public.grc_automation_runs does not exist: nothing
--  in the migration tree creates it. Two cases are handled and a third
--  is deliberately not.
--
--    the table exists   -> define the view with security_invoker
--    the view exists    -> set the clause on it, whatever defined it
--    neither exists     -> nothing, and a notice saying so
--
--  What this will NOT do is invent the table. Guessing which of
--  grc_test_runs or something else was meant, and what "automation
--  health" counts, is a product decision rather than a security fix,
--  and a view over the wrong table would report confident nonsense.
--  Until that is decided, getAutomationHealth() keeps returning an
--  empty array — which is what it already does, because it discards the
--  error from a missing relation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'grc_automation_runs'
  ) THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW public.v_automation_health_summary
        WITH (security_invoker = true) AS
      SELECT
        company_id,
        date_trunc('day', created_at) AS run_date,
        count(*) FILTER (WHERE status = 'passed') AS passed_count,
        count(*) FILTER (WHERE status = 'failed') AS failed_count
      FROM public.grc_automation_runs
      WHERE created_at >= now() - interval '30 days'
      GROUP BY company_id, run_date
    $v$;
    RAISE NOTICE 'v_automation_health_summary defined with security_invoker.';

  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'v_automation_health_summary'
       AND c.relkind = 'v'
  ) THEN
    --  The view exists although the table does not, so it was created
    --  by hand. Close the bypass without touching the definition.
    EXECUTE 'ALTER VIEW public.v_automation_health_summary '
            'SET (security_invoker = true)';
    RAISE NOTICE 'v_automation_health_summary: clause set on an existing view.';

  ELSE
    RAISE NOTICE 'v_automation_health_summary: skipped — neither public.grc_automation_runs nor the view exists. Nothing creates that table; see the header.';
  END IF;
END $$;


-- ── 6. Grants ────────────────────────────────────────────────────────
--
--  The originals relied on default privileges. These are tenant data
--  behind RLS, and an unauthenticated caller has no company, so anon is
--  revoked explicitly rather than left to whatever the defaults happen
--  to be.
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'v_policy_compliance_stats',
    'v_vendor_risk_exposure',
    'v_audit_velocity',
    'v_automation_health_summary'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = v AND c.relkind = 'v'
    ) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated, service_role', v);
    END IF;
  END LOOP;
END $$;


-- ── 7. Belt and braces ───────────────────────────────────────────────
--
--  Every view in public must carry the clause after this migration. If
--  a future migration adds one without it, this raises at deploy time
--  rather than leaving it to be found by an audit.
DO $$
DECLARE
  v_leaky text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_leaky
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'v'
     AND COALESCE(c.reloptions::text, '') NOT LIKE '%security_invoker=true%';

  IF v_leaky IS NOT NULL THEN
    RAISE EXCEPTION
      'These views in public still execute as their owner and bypass RLS on their base tables: %. Add WITH (security_invoker = true).',
      v_leaky;
  END IF;
END $$;
