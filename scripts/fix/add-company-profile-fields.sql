-- Adds the columns the onboarding screens need.
-- Safe to run more than once. Adds no tables and changes no existing data.
--
-- ONB-01 asks for a trading name, CAC registration number, head office,
-- country and phone. `companies` had only id, name and created_at, so
-- there was nowhere to put any of them.
--
-- ONB-01 also asks what your job is ("Head of Quality / QA Manager").
-- That is not `profiles.role`, which is the permission level — writing
-- one into the other would hand someone a permission that does not
-- exist. It gets its own column.
--
-- Every column is NULLABLE. Existing companies stay valid; the screen
-- is what asks for the values.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trading_name            text,
  ADD COLUMN IF NOT EXISTS cac_registration_number text,
  ADD COLUMN IF NOT EXISTS head_office_address     text,
  ADD COLUMN IF NOT EXISTS country                 text,
  ADD COLUMN IF NOT EXISTS phone                   text,
  ADD COLUMN IF NOT EXISTS logo_url                text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title  text,
  ADD COLUMN IF NOT EXISTS regulators text[];

-- Did it work? Every row should say true.

SELECT
  c.col AS column_needed,
  EXISTS (
    SELECT 1 FROM information_schema.columns i
    WHERE i.table_schema = 'public' AND i.table_name = c.tbl AND i.column_name = c.col
  ) AS installed
FROM (VALUES
  ('companies', 'trading_name'),
  ('companies', 'cac_registration_number'),
  ('companies', 'head_office_address'),
  ('companies', 'country'),
  ('companies', 'phone'),
  ('companies', 'logo_url'),
  ('profiles',  'job_title'),
  ('profiles',  'regulators')
) AS c(tbl, col);
