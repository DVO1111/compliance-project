-- ============================================================================
--  What ONB-04 and ONB-05 need: the areas a workspace switched on, the sites
--  a person can see, the job they do, and the register of who may sign an
--  application.
--
--  ONB-04 · "Explicit module enablement at onboarding, editable afterwards by
--  an admin (J9.1, J9.2, H7.5)." company_members.module_access already carries
--  the permission bundles, but the eight AREAS on that screen are not those
--  bundles — several areas grant the same bundle, so the selection cannot be
--  recovered from it. Reopening the step would show the wrong ticks. The
--  selection gets a column of its own.
--
--  ONB-05 · "Users are assigned to one or more sites (H1.4)" and "'Signs
--  applications' maintains the authorised signatory register (A3.1, A3.3).
--  Changes are logged."
--
--    * site_ids — empty means every site, which is what "All sites" on the
--      screen means. A list of every current site id would be wrong the
--      moment a site is added.
--    * job_title — what the person DOES. company_members.role is the
--      permission level; writing "QC Analyst" into it would hand someone a
--      permission that does not exist. Two questions, two columns.
--    * authorised_signatories — the register itself. Rows are never deleted:
--      a register that forgets who used to be on it cannot answer "was this
--      application signed by an authorised person at the time", which is the
--      only question anybody asks of it.
--
--  NOTHING HERE IS REQUIRED AT THE DATABASE LEVEL. Every column is nullable or
--  defaulted, so existing members and invites stay valid.
-- ============================================================================

-- ── What the workspace switched on, and who sees what ───────────────────────

ALTER TABLE public.company_members
  --  The ONB-04 area ids, as ticked. Distinct from module_access, which
  --  holds the permission bundles those areas grant.
  ADD COLUMN IF NOT EXISTS onboarding_areas text[] NOT NULL DEFAULT '{}',
  --  Empty = every site, including sites added later.
  ADD COLUMN IF NOT EXISTS site_ids         uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS job_title        text;

COMMENT ON COLUMN public.company_members.site_ids IS
  'Sites this person can see (H1.4). EMPTY MEANS ALL SITES — not "none" — '
  'so a site added tomorrow is visible to them without an edit.';

COMMENT ON COLUMN public.company_members.job_title IS
  'What this person does: "QC Analyst". Distinct from role, which is the '
  'permission level and is server-assigned.';

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS site_ids           uuid[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS job_title          text,
  --  Carried on the invite and applied when it is accepted: the person
  --  does not exist as a user until then.
  ADD COLUMN IF NOT EXISTS signs_applications boolean NOT NULL DEFAULT false;

-- ── The authorised signatory register ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.authorised_signatories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,

  --  Null until the invited person accepts and has a user id. The email is
  --  what identifies them before that, and remains the thing an application
  --  letter is checked against.
  user_id     uuid,
  email       text NOT NULL,
  full_name   text,
  job_title   text,

  added_by    uuid,
  added_at    timestamptz NOT NULL DEFAULT now(),
  --  Removal is a date, not a DELETE. "Was this letter signed by someone on
  --  the register at the time?" is unanswerable once a row is gone.
  removed_by  uuid,
  removed_at  timestamptz,

  CONSTRAINT authorised_signatories_email_not_blank_chk CHECK (btrim(email) <> ''),
  CONSTRAINT authorised_signatories_removed_after_added_chk
    CHECK (removed_at IS NULL OR removed_at >= added_at)
);

CREATE INDEX IF NOT EXISTS authorised_signatories_company_idx
  ON public.authorised_signatories (company_id);

--  One ACTIVE entry per address. The same person may appear again after
--  being removed, which is a second row and a second history, not an edit
--  of the first.
CREATE UNIQUE INDEX IF NOT EXISTS authorised_signatories_active_email_idx
  ON public.authorised_signatories (company_id, lower(btrim(email)))
  WHERE removed_at IS NULL;

COMMENT ON TABLE public.authorised_signatories IS
  'Who may sign a regulatory application (A3.1, A3.3). Submissions check the '
  'application letter is signed by someone on it. Rows are closed with '
  'removed_at and never deleted, so the register can be read as at a date.';

ALTER TABLE public.authorised_signatories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('public.app_is_company_member(uuid, uuid)') IS NULL
     OR to_regprocedure('public.app_has_company_role(uuid, text[], uuid)') IS NULL THEN
    RAISE EXCEPTION
      'tenancy helpers are missing — this migration must run after them';
  END IF;

  --  Everyone in the company may READ the register: anyone preparing a
  --  submission needs to know who can sign it.
  DROP POLICY IF EXISTS authorised_signatories_read ON public.authorised_signatories;
  CREATE POLICY authorised_signatories_read ON public.authorised_signatories
    FOR SELECT TO authenticated
    USING (public.app_is_company_member(company_id));

  --  Only an admin may CHANGE it. Adding yourself to the register is
  --  exactly the privilege escalation this table exists to prevent.
  DROP POLICY IF EXISTS authorised_signatories_write ON public.authorised_signatories;
  CREATE POLICY authorised_signatories_write ON public.authorised_signatories
    FOR ALL TO authenticated
    USING (public.app_has_company_role(company_id, ARRAY['owner','admin']))
    WITH CHECK (public.app_has_company_role(company_id, ARRAY['owner','admin']));
END $$;

-- ── "Changes are logged" (A3.3) ─────────────────────────────────────────────
--  Into audit_logs, through the same hash-chained helper the licence steps
--  use, rather than a second log of its own. One chain, verifiable by
--  verify_audit_chain, is the whole point of that table.

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
    jsonb_build_object(
      'email',     NEW.email,
      'full_name', NEW.full_name,
      'job_title', NEW.job_title
    )
  );
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_log_signatory_change ON public.authorised_signatories;
CREATE TRIGGER trg_log_signatory_change
  AFTER INSERT OR UPDATE ON public.authorised_signatories
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_signatory_change();

-- ── Carrying an invite's extras through acceptance ──────────────────────────
--
--  A TRIGGER RATHER THAN AN EDIT TO accept_company_invite. That function is
--  SECURITY DEFINER and its live definition is not necessarily the one in
--  this repository; rewriting it wholesale would silently drop whatever else
--  it has grown. This hangs off the one event that matters — accepted_at
--  going from null to a time — and leaves the function alone.

CREATE OR REPLACE FUNCTION public.fn_apply_invite_extras()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $fn$
DECLARE
  v_user  uuid;
  v_name  text;
BEGIN
  IF OLD.accepted_at IS NOT NULL OR NEW.accepted_at IS NULL THEN
    RETURN NEW;
  END IF;

  --  accept_company_invite writes the membership row before marking the
  --  invite accepted, so the member is already there to be updated.
  SELECT user_id INTO v_user
  FROM public.company_members
  WHERE company_id = NEW.company_id
    AND user_id = auth.uid()
  LIMIT 1;

  IF v_user IS NULL THEN
    --  Accepted some other way, or out of order. The invite is still
    --  accepted; the extras simply have nowhere to land yet.
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
    --  Already on the register: nothing to do, and certainly not a second
    --  active row.
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_apply_invite_extras ON public.company_invites;
CREATE TRIGGER trg_apply_invite_extras
  AFTER UPDATE OF accepted_at ON public.company_invites
  FOR EACH ROW EXECUTE FUNCTION public.fn_apply_invite_extras();

-- ── Deploy-time assertions ──────────────────────────────────────────────────

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(format('%s.%s', c.tbl, c.col), ', ') INTO v_missing
  FROM (VALUES
    ('company_members', 'onboarding_areas'),
    ('company_members', 'site_ids'),
    ('company_members', 'job_title'),
    ('company_invites', 'site_ids'),
    ('company_invites', 'job_title'),
    ('company_invites', 'signs_applications')
  ) AS c(tbl, col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = c.tbl AND column_name = c.col
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'DEPLOY GUARD: columns missing after migration: %', v_missing;
  END IF;

  IF to_regclass('public.authorised_signatories') IS NULL THEN
    RAISE EXCEPTION 'DEPLOY GUARD: authorised_signatories was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'authorised_signatories' AND rowsecurity
  ) THEN
    RAISE EXCEPTION 'DEPLOY GUARD: authorised_signatories has row-level security disabled';
  END IF;

  --  A register anyone could add themselves to would be worse than none:
  --  it would carry the authority of a control while being none.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'authorised_signatories'
      AND policyname = 'authorised_signatories_write'
      AND qual LIKE '%app_has_company_role%'
  ) THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: the signatory register is not admin-only for writes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_log_signatory_change' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'DEPLOY GUARD: signatory changes are not being logged';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_apply_invite_extras' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'DEPLOY GUARD: invite extras are not applied on acceptance';
  END IF;
END $$;
