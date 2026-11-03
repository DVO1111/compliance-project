-- ============================================================================
--  public.companies — the table 162 foreign keys point at and no migration
--  created.
--
--  ── THE GAP THIS CLOSES ────────────────────────────────────────────────────
--
--  Dozens of migrations reference `companies`, and until now NONE created it.
--  The definition lived in two test harnesses instead:
--
--      scripts/ci/db-bootstrap.sql     (the SQL suites' bare-Postgres shim)
--      scripts/local/bootstrap-local.sql (the local Supabase stack)
--
--  so the migration history did not apply to an empty database. It stopped at
--
--      ERROR: relation "companies" does not exist
--      at 20260226100000_ai_risk_intelligence.sql
--
--  and CI was green only because the shim had scaffolded the table first.
--  That is the shape of defect where a suite proves the schema against
--  something the schema does not contain.
--
--  Both harnesses now DELETE their copies and read this one. There is a
--  single definition, and it is in the migration history where the other 284
--  tables are.
--
--  ── WHY THIS SHAPE, AND HOW IT WAS ESTABLISHED ─────────────────────────────
--
--  Not invented, and not copied from the shim on trust. `src/lib/
--  database.types.ts` is generated from the live project, and it lists
--  exactly ten columns for `companies`:
--
--      id, name, created_at, trading_name, cac_registration_number,
--      head_office_address, country, phone, logo_url, product_categories
--
--  Seven of those ten are added by migrations that already exist and already
--  run — 20261018000000_company_profile_fields.sql,
--  20261019000000_sites_and_department_codes.sql and
--  20260306140000_security_integrity_fixes.sql. So the only thing genuinely
--  missing from the history was the CREATE for the three base columns, which
--  is all this file adds. The result is identical to the live project's
--  shape, by construction rather than by coincidence.
--
--  ── WHY IT CARRIES NO POLICY ───────────────────────────────────────────────
--
--  Because no migration in this repository defines one, on any project. RLS
--  is enabled and there is no policy, so `companies` is reachable only by
--  roles that bypass RLS — which is the state every environment built from
--  this history already has, including the live one.
--
--  Writing a policy here would be inventing cross-company access while
--  pretending to fix a bootstrap bug. If the application needs members to
--  read their own company through RLS, that is a deliberate change with its
--  own migration and its own tests, not a side effect of this one. The
--  grants are the shim's, unchanged, for the same reason.
--
--  ── WHY THE TIMESTAMP IS EARLIER THAN EVERY OTHER MIGRATION ────────────────
--
--  `companies` has to exist before the first migration that references it,
--  and 162 foreign keys point at it from all over the history. Dating this
--  before 20260206145116 — the earliest migration there is — means no
--  ordering question can arise later.
--
--  CREATE TABLE IF NOT EXISTS, so on a project where the table already
--  exists (every deployed one) this file is a no-op and changes nothing.
--  `supabase db push` will note that a local migration predates the last
--  applied one and needs --include-all; applying it is safe for exactly
--  that reason, and the runbook says so.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.companies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

--  Enabled unconditionally: a table reached by 162 foreign keys must not be
--  readable by an anonymous session because a later migration forgot to
--  switch RLS on.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--  The grants the harnesses have always applied. They do not grant access on
--  their own — RLS is on with no policy — so this preserves the existing
--  state rather than widening it.
GRANT ALL ON public.companies TO anon, authenticated, service_role;

COMMENT ON TABLE public.companies IS
  'The tenant. Referenced by 162 foreign keys across the schema. Created '
  'here as the baseline; trading_name, cac_registration_number, '
  'head_office_address, country, phone, logo_url and product_categories are '
  'added by later migrations. RLS is enabled with no policy, which is the '
  'state the whole migration history produces — this file does not change '
  'it.';
