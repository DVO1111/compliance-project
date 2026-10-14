-- ============================================================================
--  The columns ONB-01 and ONB-02 need.
--
--  `companies` shipped with id, name and created_at. ONB-01 asks for a
--  trading name, a CAC registration number, a head office address, a
--  country and a phone number, and until now there was nowhere to put
--  any of them — the step collected a company name and said so on
--  screen, because a field that takes an answer and discards it is
--  worse than no field.
--
--  `profiles` has a `role`, but that is the permission level. ONB-01
--  asks what the person's JOB is ("Head of Quality / QA Manager"),
--  which the notes are explicit about: "The admin's own role comes from
--  the PRD user list (1.3), not the old Admin / Legal / Marketing /
--  Viewer set." Those are different questions and need different
--  columns — writing a job title into `role` would hand someone a
--  permission level that does not exist.
--
--  ONB-02 stores the regulators that follow from the industry so the
--  rest of the product can read them without re-deriving the mapping.
--
--  NOTHING HERE IS REQUIRED AT THE DATABASE LEVEL. Every column is
--  nullable. A company created before this migration stays valid, and
--  the onboarding screen is what asks for the values — a NOT NULL here
--  would lock out every existing workspace at the moment of the deploy.
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trading_name            text,
  ADD COLUMN IF NOT EXISTS cac_registration_number text,
  ADD COLUMN IF NOT EXISTS head_office_address     text,
  ADD COLUMN IF NOT EXISTS country                 text,
  ADD COLUMN IF NOT EXISTS phone                   text,
  --  Carried over from Company Settings › Brand Identity (ADM-02) and
  --  used in the header of generated certificates of analysis (C10.2).
  --  A URL rather than bytes: the file belongs in storage.
  ADD COLUMN IF NOT EXISTS logo_url                text;

COMMENT ON COLUMN public.companies.cac_registration_number IS
  'Corporate Affairs Commission registration number, e.g. RC 1234567. '
  'Appears on certificates of analysis and regulatory applications.';

COMMENT ON COLUMN public.companies.logo_url IS
  'Company logo for the CoA header (C10.2). Set in Company Settings › '
  'Brand Identity; onboarding shows the field but does not upload.';

ALTER TABLE public.profiles
  --  The person's job, not their permission level. `role` remains what
  --  it was and is still server-assigned.
  ADD COLUMN IF NOT EXISTS job_title  text,
  --  The regulators chosen on ONB-02: NAFDAC and PCN follow from the
  --  industry, SON is added only by someone who holds MANCAP.
  ADD COLUMN IF NOT EXISTS regulators text[];

COMMENT ON COLUMN public.profiles.job_title IS
  'What this person does — "Head of Quality / QA Manager". Distinct '
  'from role, which is the permission level and is server-assigned.';

-- ── The CAC number, loosely shaped ──────────────────────────────────────────
--  Loosely on purpose. The common form is "RC 1234567", but the
--  registry has issued other shapes over the years and a workspace
--  must not be impossible to set up because a real, valid number does
--  not match a pattern someone guessed. This refuses only what is
--  certainly not a registration number: blank, or absurdly long.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_cac_number_shape_chk'
      AND conrelid = 'public.companies'::regclass
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_cac_number_shape_chk
      CHECK (
        cac_registration_number IS NULL
        OR (btrim(cac_registration_number) <> '' AND length(cac_registration_number) <= 64)
      );
  END IF;
END $$;

-- ── Deploy-time assertion ───────────────────────────────────────────────────
--  Each column is checked by name. A migration that half-applied is
--  worse than one that failed, because the screen then saves some
--  fields and silently loses others.

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(c.col, ', ')
  INTO v_missing
  FROM (VALUES
    ('companies', 'trading_name'),
    ('companies', 'cac_registration_number'),
    ('companies', 'head_office_address'),
    ('companies', 'country'),
    ('companies', 'phone'),
    ('companies', 'logo_url'),
    ('profiles',  'job_title'),
    ('profiles',  'regulators')
  ) AS c(tbl, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = c.tbl AND column_name = c.col
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'DEPLOY GUARD: onboarding columns missing after migration: %', v_missing;
  END IF;
END $$;
