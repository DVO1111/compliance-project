-- PREFLIGHT — read-only. Changes nothing. Run this first.
--
-- The other fix scripts assume tables and helper functions that this
-- project's live database may never have received: it was built by hand
-- rather than by replaying supabase/migrations, which is why
-- create_company and provision_profile had to be installed separately.
--
-- A script that fails on its first missing dependency tells you one
-- thing at a time. This tells you everything at once, so the repair can
-- be written in one go instead of five rounds of paste-and-see.
--
-- Paste the WHOLE result back. Every column matters, including the
-- false rows — especially the false rows.

WITH want_tables(item) AS (
  VALUES
    ('companies'), ('profiles'), ('company_members'), ('company_invites'),
    ('departments'), ('sites'), ('authorised_signatories'),
    ('regulatory_obligations'), ('obligation_links'), ('risks'),
    ('policies'), ('regulatory_licences'), ('products'),
    ('audit_logs'), ('organizations'), ('allowed_signins')
),
want_funcs(item, sig) AS (
  VALUES
    ('app_is_company_member',  'public.app_is_company_member(uuid, uuid)'),
    ('app_has_company_role',   'public.app_has_company_role(uuid, text[], uuid)'),
    ('app_is_service_context', 'public.app_is_service_context()'),
    ('licence_audit_step',     'public.licence_audit_step(uuid, text, text, uuid, jsonb)'),
    ('create_company',         'public.create_company(text)'),
    ('create_company_invite',  'public.create_company_invite(uuid, text, text, text[], uuid, integer)')
),
want_cols(item, tbl, col) AS (
  VALUES
    ('companies.trading_name',             'companies',       'trading_name'),
    ('companies.cac_registration_number',  'companies',       'cac_registration_number'),
    ('companies.country',                  'companies',       'country'),
    ('companies.product_categories',       'companies',       'product_categories'),
    ('profiles.job_title',                 'profiles',        'job_title'),
    ('profiles.regulators',                'profiles',        'regulators'),
    ('departments.code',                   'departments',     'code'),
    ('company_members.onboarding_areas',   'company_members', 'onboarding_areas'),
    ('company_members.site_ids',           'company_members', 'site_ids'),
    ('company_members.job_title',          'company_members', 'job_title'),
    ('company_invites.site_ids',           'company_invites', 'site_ids'),
    ('company_invites.signs_applications', 'company_invites', 'signs_applications')
)
SELECT 'table'  AS kind, item, (to_regclass('public.' || item) IS NOT NULL) AS present
FROM want_tables
UNION ALL
SELECT 'function', item, (to_regprocedure(sig) IS NOT NULL)
FROM want_funcs
UNION ALL
SELECT 'column', item, EXISTS (
  SELECT 1 FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = w.tbl AND c.column_name = w.col
)
FROM want_cols w
UNION ALL
--  regulatory_obligations.company_id points at the wrong table in the
--  repo's own migration. This says what it points at HERE, or that the
--  table is absent entirely.
SELECT 'fk', 'regulatory_obligations.company_id -> ' || coalesce((
    SELECT confrelid::regclass::text FROM pg_constraint
    WHERE conrelid = to_regclass('public.regulatory_obligations')
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%company_id%'
    LIMIT 1
  ), CASE WHEN to_regclass('public.regulatory_obligations') IS NULL
          THEN '(table absent)' ELSE '(no foreign key)' END),
  to_regclass('public.regulatory_obligations') IS NOT NULL
ORDER BY 1, 2;
