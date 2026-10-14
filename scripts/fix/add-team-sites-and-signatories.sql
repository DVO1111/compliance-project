-- Adds what ONB-04 and ONB-05 need: the areas a workspace switched on, the
-- sites a person can see, the job they do, and the authorised signatory
-- register. Safe to run more than once. Changes no existing data.
--
-- Paste this whole file into the Supabase SQL editor and run it. The last
-- query reports what is installed; every row should say true.
--
-- Run add-sites-and-department-codes.sql first — the sites it creates are what
-- company_members.site_ids points at.

-- ── Columns ─────────────────────────────────────────────────────────
-- site_ids EMPTY means ALL SITES, not none: a site added next month is then
-- visible without anyone editing a membership row.
-- job_title is what the person DOES. `role` is the permission level, and
-- writing "QC Analyst" into it would grant a permission that does not exist.

ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS onboarding_areas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS site_ids         uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS job_title        text;

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS site_ids           uuid[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS job_title          text,
  ADD COLUMN IF NOT EXISTS signs_applications boolean NOT NULL DEFAULT false;

-- ── The authorised signatory register ───────────────────────────────
-- Rows are closed with removed_at, never deleted: "was this application
-- signed by someone authorised at the time" is the only question anyone
-- asks of a register, and a deleted row cannot answer it.

CREATE TABLE IF NOT EXISTS public.authorised_signatories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  user_id     uuid,
  email       text NOT NULL,
  full_name   text,
  job_title   text,
  added_by    uuid,
  added_at    timestamptz NOT NULL DEFAULT now(),
  removed_by  uuid,
  removed_at  timestamptz,
  CONSTRAINT authorised_signatories_email_not_blank_chk CHECK (btrim(email) <> ''),
  CONSTRAINT authorised_signatories_removed_after_added_chk
    CHECK (removed_at IS NULL OR removed_at >= added_at)
);

CREATE INDEX IF NOT EXISTS authorised_signatories_company_idx
  ON public.authorised_signatories (company_id);

CREATE UNIQUE INDEX IF NOT EXISTS authorised_signatories_active_email_idx
  ON public.authorised_signatories (company_id, lower(btrim(email)))
  WHERE removed_at IS NULL;

ALTER TABLE public.authorised_signatories ENABLE ROW LEVEL SECURITY;

-- Everyone in the company may READ it: anyone preparing a submission needs
-- to know who can sign. Only an admin may CHANGE it — adding yourself is
-- exactly what this register exists to prevent.

DROP POLICY IF EXISTS authorised_signatories_read ON public.authorised_signatories;
CREATE POLICY authorised_signatories_read ON public.authorised_signatories
  FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS authorised_signatories_write ON public.authorised_signatories;
CREATE POLICY authorised_signatories_write ON public.authorised_signatories
  FOR ALL TO authenticated
  USING (public.app_has_company_role(company_id, ARRAY['owner','admin']))
  WITH CHECK (public.app_has_company_role(company_id, ARRAY['owner','admin']));

-- ── Changes are logged (A3.3) ───────────────────────────────────────
-- Into audit_logs, through the hash-chained helper the licence steps use.

CREATE OR REPLACE FUNCTION public.fn_log_signatory_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $fn$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'signatory_added';
  ELSIF NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL THEN
    v_action := 'signatory_removed';
  ELSE
    v_action := 'signatory_updated';
  END IF;

  PERFORM public.licence_audit_step(
    NEW.company_id, v_action, 'authorised_signatory', NEW.id,
    jsonb_build_object('email', NEW.email, 'full_name', NEW.full_name,
                       'job_title', NEW.job_title)
  );
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_log_signatory_change ON public.authorised_signatories;
CREATE TRIGGER trg_log_signatory_change
  AFTER INSERT OR UPDATE ON public.authorised_signatories
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_signatory_change();

-- ── Carrying an invite's extras through acceptance ──────────────────
-- A trigger rather than an edit to accept_company_invite: that function is
-- SECURITY DEFINER and rewriting it wholesale would drop whatever else it
-- has grown that this file cannot see.

CREATE OR REPLACE FUNCTION public.fn_apply_invite_extras()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $fn$
DECLARE
  v_user uuid;
  v_name text;
BEGIN
  IF OLD.accepted_at IS NOT NULL OR NEW.accepted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_user
  FROM public.company_members
  WHERE company_id = NEW.company_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_user IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.company_members
  SET site_ids  = NEW.site_ids,
      job_title = coalesce(NEW.job_title, job_title)
  WHERE company_id = NEW.company_id AND user_id = v_user;

  IF NEW.signs_applications THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = v_user;
    INSERT INTO public.authorised_signatories
      (company_id, user_id, email, full_name, job_title, added_by)
    VALUES
      (NEW.company_id, v_user, NEW.email, v_name, NEW.job_title, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_apply_invite_extras ON public.company_invites;
CREATE TRIGGER trg_apply_invite_extras
  AFTER UPDATE OF accepted_at ON public.company_invites
  FOR EACH ROW EXECUTE FUNCTION public.fn_apply_invite_extras();

-- Did it work? Every row should say true.

SELECT 'company_members.onboarding_areas' AS item,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='company_members'
                 AND column_name='onboarding_areas') AS installed
UNION ALL SELECT 'company_members.site_ids',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='company_members'
                 AND column_name='site_ids')
UNION ALL SELECT 'company_members.job_title',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='company_members'
                 AND column_name='job_title')
UNION ALL SELECT 'company_invites.site_ids',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='company_invites'
                 AND column_name='site_ids')
UNION ALL SELECT 'company_invites.signs_applications',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='company_invites'
                 AND column_name='signs_applications')
UNION ALL SELECT 'authorised_signatories table',
       to_regclass('public.authorised_signatories') IS NOT NULL
UNION ALL SELECT 'authorised_signatories row-level security',
       coalesce((SELECT rowsecurity FROM pg_tables
                 WHERE schemaname='public' AND tablename='authorised_signatories'), false)
UNION ALL SELECT 'register is admin-only for writes',
       EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname='public' AND tablename='authorised_signatories'
                 AND policyname='authorised_signatories_write'
                 AND qual LIKE '%app_has_company_role%')
UNION ALL SELECT 'signatory changes are logged',
       EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgname='trg_log_signatory_change' AND NOT tgisinternal)
UNION ALL SELECT 'invite extras applied on acceptance',
       EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgname='trg_apply_invite_extras' AND NOT tgisinternal);
