CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.app_is_company_member(
  p_company_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id
      AND user_id = p_user_id
      AND status::text = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.app_has_company_role(
  p_company_id uuid, p_roles text[], p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id
      AND user_id = p_user_id
      AND status::text = 'active'
      AND role::text = ANY (p_roles)
  );
$$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trading_name            text,
  ADD COLUMN IF NOT EXISTS cac_registration_number text,
  ADD COLUMN IF NOT EXISTS head_office_address     text,
  ADD COLUMN IF NOT EXISTS country                 text,
  ADD COLUMN IF NOT EXISTS phone                   text,
  ADD COLUMN IF NOT EXISTS logo_url                text,
  ADD COLUMN IF NOT EXISTS product_categories      text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title  text,
  ADD COLUMN IF NOT EXISTS regulators text[];

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS code text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'departments_code_shape_chk'
                   AND conrelid = 'public.departments'::regclass) THEN
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_code_shape_chk
      CHECK (code IS NULL OR code ~ '^[A-Z0-9]{2,8}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'departments_code_unique_per_company'
                   AND conrelid = 'public.departments'::regclass) THEN
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_code_unique_per_company UNIQUE (company_id, code);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  name        text NOT NULL,
  site_type   text NOT NULL DEFAULT 'manufacturing',
  address     text,
  product_categories text[] NOT NULL DEFAULT '{}',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sites_name_not_blank_chk CHECK (btrim(name) <> ''),
  CONSTRAINT sites_type_chk CHECK (
    site_type IN ('manufacturing', 'warehouse', 'laboratory', 'office')),
  CONSTRAINT sites_name_unique_per_company UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS sites_company_idx ON public.sites (company_id);

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sites_company_read ON public.sites;

CREATE POLICY sites_company_read ON public.sites
  FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS sites_company_write ON public.sites;

CREATE POLICY sites_company_write ON public.sites
  FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS onboarding_areas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS site_ids         uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS job_title        text;

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS site_ids           uuid[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS job_title          text,
  ADD COLUMN IF NOT EXISTS signs_applications boolean NOT NULL DEFAULT false;

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

DROP POLICY IF EXISTS authorised_signatories_read ON public.authorised_signatories;

CREATE POLICY authorised_signatories_read ON public.authorised_signatories
  FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS authorised_signatories_write ON public.authorised_signatories;

CREATE POLICY authorised_signatories_write ON public.authorised_signatories
  FOR ALL TO authenticated
  USING (public.app_has_company_role(company_id, ARRAY['owner','admin']))
  WITH CHECK (public.app_has_company_role(company_id, ARRAY['owner','admin']));

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE NOTICE 'audit_logs absent, the signatory log cannot be installed';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS integrity_hash text,
    ADD COLUMN IF NOT EXISTS previous_hash text DEFAULT ''GENESIS'',
    ADD COLUMN IF NOT EXISTS evidence_snapshot jsonb DEFAULT ''{}''::jsonb,
    ADD COLUMN IF NOT EXISTS company_id uuid,
    ADD COLUMN IF NOT EXISTS ip_address text,
    ADD COLUMN IF NOT EXISTS sequence_number bigint';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_company_seq
    ON public.audit_logs (company_id, sequence_number ASC)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_integrity_hash
    ON public.audit_logs (integrity_hash)';
END $$;

CREATE OR REPLACE FUNCTION public.licence_audit_step(
  p_company_id uuid,
  p_action     text,
  p_entity_type text,
  p_entity_id  uuid,
  p_metadata   jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_prev text; v_seq bigint; v_hash text; v_now timestamptz := now(); v_id uuid;
BEGIN
  SELECT integrity_hash, sequence_number INTO v_prev, v_seq
    FROM public.audit_logs
   WHERE company_id = p_company_id AND integrity_hash IS NOT NULL
   ORDER BY sequence_number DESC LIMIT 1;
  v_prev := coalesce(v_prev, 'GENESIS');
  v_seq  := coalesce(v_seq, 0) + 1;

  v_hash := encode(digest(concat_ws('|',
      p_action, p_entity_type, p_entity_id::text, v_uid::text,
      coalesce(p_metadata,'{}'::jsonb)::text, v_now::text, v_prev, v_seq::text),
    'sha256'), 'hex');

  INSERT INTO public.audit_logs
    (user_id, action, entity_type, entity_id, metadata, created_at,
     integrity_hash, previous_hash, company_id, sequence_number)
  VALUES
    (v_uid, p_action, p_entity_type, p_entity_id,
     coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('audit_hash_convention','sha256-sql-v1'),
     v_now, v_hash, v_prev, p_company_id, v_seq)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.licence_audit_step(uuid,text,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_audit_step(uuid,text,text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_log_signatory_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
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
                       'job_title', NEW.job_title));
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.fn_apply_invite_extras()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
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
END
$$;

DO $$
DECLARE
  v_missing int;
BEGIN
  DROP TRIGGER IF EXISTS trg_log_signatory_change ON public.authorised_signatories;
  IF to_regprocedure('public.licence_audit_step(uuid, text, text, uuid, jsonb)') IS NULL THEN
    RAISE NOTICE 'licence_audit_step absent, signatory changes will not be logged';
    RETURN;
  END IF;
  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE NOTICE 'audit_logs absent, signatory changes will not be logged';
    RETURN;
  END IF;
  SELECT count(*) INTO v_missing
  FROM (VALUES ('user_id'),('action'),('entity_type'),('entity_id'),('metadata'),
               ('created_at'),('integrity_hash'),('previous_hash'),('company_id'),
               ('sequence_number')) AS needed(col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
      AND column_name = needed.col);
  IF v_missing > 0 THEN
    RAISE NOTICE 'audit_logs is missing % of the columns the log writes, signatory changes will not be logged', v_missing;
    RETURN;
  END IF;
  CREATE TRIGGER trg_log_signatory_change
    AFTER INSERT OR UPDATE ON public.authorised_signatories
    FOR EACH ROW EXECUTE FUNCTION public.fn_log_signatory_change();
END $$;

DROP TRIGGER IF EXISTS trg_apply_invite_extras ON public.company_invites;

CREATE TRIGGER trg_apply_invite_extras
  AFTER UPDATE OF accepted_at ON public.company_invites
  FOR EACH ROW EXECUTE FUNCTION public.fn_apply_invite_extras();

DO $$
DECLARE
  v_stranded bigint;
BEGIN
  IF to_regclass('public.regulatory_obligations') IS NULL THEN
    RAISE NOTICE 'regulatory_obligations absent, skipping its tenancy repair';
    RETURN;
  END IF;
  SELECT count(*) INTO v_stranded
  FROM public.regulatory_obligations o
  WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = o.company_id);
  IF v_stranded > 0 THEN
    RAISE NOTICE 'skipped obligations repair, % rows reference a non company id', v_stranded;
    RETURN;
  END IF;
  ALTER TABLE public.regulatory_obligations
    DROP CONSTRAINT IF EXISTS regulatory_obligations_company_id_fkey;
  ALTER TABLE public.regulatory_obligations
    ADD CONSTRAINT regulatory_obligations_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies (id) ON DELETE CASCADE;
  DROP POLICY IF EXISTS "Regulatory obligations are company scoped"
    ON public.regulatory_obligations;
  DROP POLICY IF EXISTS regulatory_obligations_company_scoped
    ON public.regulatory_obligations;
  CREATE POLICY regulatory_obligations_company_scoped
    ON public.regulatory_obligations
    FOR ALL TO authenticated
    USING (public.app_is_company_member(company_id))
    WITH CHECK (public.app_is_company_member(company_id));
END $$;

DO $$
BEGIN
  IF to_regclass('public.risks') IS NULL THEN
    RAISE NOTICE 'risks absent, skipping its policy repair';
    RETURN;
  END IF;
  DROP POLICY IF EXISTS risks_manage ON public.risks;
  CREATE POLICY risks_manage ON public.risks
    FOR ALL TO authenticated
    USING (
      public.app_has_company_role(company_id, ARRAY['owner','admin'])
      OR company_id IN (
        SELECT profiles.company_id FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role::text = ANY (ARRAY['admin','compliance_officer','compliance','executive'])))
    WITH CHECK (
      public.app_has_company_role(company_id, ARRAY['owner','admin'])
      OR company_id IN (
        SELECT profiles.company_id FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role::text = ANY (ARRAY['admin','compliance_officer','compliance','executive'])));
END $$;

CREATE TABLE IF NOT EXISTS public.regulatory_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  regulation_id uuid,
  title text NOT NULL,
  description text NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'nigeria',
  category text NOT NULL,
  status text NOT NULL DEFAULT 'identified',
  owner_id uuid,
  due_date date,
  is_recurring boolean NOT NULL DEFAULT false,
  frequency text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.regulatory_obligations
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frequency text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'regulatory_obligations_status_chk'
                   AND conrelid = 'public.regulatory_obligations'::regclass) THEN
    ALTER TABLE public.regulatory_obligations
      ADD CONSTRAINT regulatory_obligations_status_chk
      CHECK (status IN ('identified', 'implemented', 'monitored'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'regulatory_obligations_frequency_chk'
                   AND conrelid = 'public.regulatory_obligations'::regclass) THEN
    ALTER TABLE public.regulatory_obligations
      ADD CONSTRAINT regulatory_obligations_frequency_chk
      CHECK (frequency IS NULL OR frequency IN
             ('weekly', 'monthly', 'quarterly', 'biannual', 'annual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS regulatory_obligations_company_idx
  ON public.regulatory_obligations (company_id);

DO $$
BEGIN
  IF to_regclass('public.regulatory_licences') IS NULL THEN
    RAISE NOTICE 'regulatory_licences absent, skipping its lifecycle columns';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.regulatory_licences
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT ''draft'',
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS discontinued_at timestamptz,
    ADD COLUMN IF NOT EXISTS superseded_by_licence_id uuid';
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'regulatory_licences_superseded_by_licence_id_fkey'
      AND conrelid = to_regclass('public.regulatory_licences')
  ) THEN
    EXECUTE 'ALTER TABLE public.regulatory_licences
      ADD CONSTRAINT regulatory_licences_superseded_by_licence_id_fkey
      FOREIGN KEY (superseded_by_licence_id)
      REFERENCES public.regulatory_licences (id) ON DELETE SET NULL';
  END IF;
END $$;

ALTER TABLE public.regulatory_obligations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.fn_allowlist_invited_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF to_regclass('public.allowed_signins') IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.allowed_signins (email, note)
  VALUES (lower(btrim(NEW.email)), 'invited to a company')
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END
$$;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_allowlist_invited_email ON public.company_invites;
  IF to_regclass('public.allowed_signins') IS NULL THEN
    RAISE NOTICE 'allowed_signins absent, invited addresses are not allowlisted';
    RETURN;
  END IF;
  CREATE TRIGGER trg_allowlist_invited_email
    AFTER INSERT ON public.company_invites
    FOR EACH ROW EXECUTE FUNCTION public.fn_allowlist_invited_email();
  INSERT INTO public.allowed_signins (email, note)
  SELECT DISTINCT lower(btrim(i.email)), 'invited to a company'
  FROM public.company_invites i
  WHERE i.accepted_at IS NULL
    AND i.revoked_at IS NULL
    AND btrim(coalesce(i.email, '')) <> ''
  ON CONFLICT (email) DO NOTHING;
END $$;

SELECT 'app_is_company_member' AS item,
       to_regprocedure('public.app_is_company_member(uuid, uuid)') IS NOT NULL AS ok
UNION ALL SELECT 'app_has_company_role',
       to_regprocedure('public.app_has_company_role(uuid, text[], uuid)') IS NOT NULL
UNION ALL SELECT 'sites table',
       to_regclass('public.sites') IS NOT NULL
UNION ALL SELECT 'sites row level security',
       coalesce((SELECT rowsecurity FROM pg_tables
                 WHERE schemaname='public' AND tablename='sites'), false)
UNION ALL SELECT 'departments.code',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='departments' AND column_name='code')
UNION ALL SELECT 'companies.product_categories',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='companies'
                 AND column_name='product_categories')
UNION ALL SELECT 'companies.cac_registration_number',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='companies'
                 AND column_name='cac_registration_number')
UNION ALL SELECT 'profiles.job_title',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='profiles' AND column_name='job_title')
UNION ALL SELECT 'company_members.site_ids',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='company_members'
                 AND column_name='site_ids')
UNION ALL SELECT 'company_invites.signs_applications',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='company_invites'
                 AND column_name='signs_applications')
UNION ALL SELECT 'authorised_signatories table',
       to_regclass('public.authorised_signatories') IS NOT NULL
UNION ALL SELECT 'signatory register is admin only',
       EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname='public' AND tablename='authorised_signatories'
                 AND policyname='authorised_signatories_write'
                 AND qual LIKE '%app_has_company_role%')
UNION ALL SELECT 'signatory changes are logged',
       EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgname='trg_log_signatory_change' AND NOT tgisinternal)
UNION ALL SELECT 'invite extras applied on acceptance',
       EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgname='trg_apply_invite_extras' AND NOT tgisinternal)
UNION ALL SELECT 'starter licences can be saved',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='regulatory_licences'
                 AND column_name='status')
UNION ALL SELECT 'obligations point at companies',
       coalesce((SELECT confrelid::regclass::text = 'companies' FROM pg_constraint
                 WHERE conname='regulatory_obligations_company_id_fkey'), false)
UNION ALL SELECT 'workspace owner can add a risk',
       EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname='public' AND tablename='risks'
                 AND policyname='risks_manage' AND qual LIKE '%app_has_company_role%')
UNION ALL SELECT 'invited addresses are allowlisted',
       (to_regclass('public.allowed_signins') IS NULL)
       OR EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_allowlist_invited_email' AND NOT tgisinternal)
ORDER BY 1;
