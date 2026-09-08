-- =====================================================================
--  LICENCE LIFECYCLE  (Week 2, Deliverable 06)
-- =====================================================================
--  A NAFDAC product registration is not a date on a certificate — it is
--  a thing with a life: it is granted, it approaches expiry, somebody
--  starts renewing it, it is renewed or it lapses, and at some point the
--  product behind it is discontinued and the whole question stops
--  mattering. Until now the codebase held only the date.
--
--  WHICH LICENCE TABLE
--  -------------------
--  There are two in this repository:
--
--    public.licenses           — the original "License Vault" (US
--                                spelling). Company-scoped, but not
--                                linked to a product, and its status is
--                                computed in the browser.
--    public.regulatory_licences — the Regulatory Affairs record. Linked
--                                to a submission, and since D05 linked
--                                to a product.
--
--  This deliverable builds on regulatory_licences, because every part of
--  the brief needs the product link: suppressing alerts for discontinued
--  products, cascading a new registration onto product status, and
--  blocking batches. The Vault is left untouched and keeps working; a
--  migration that folds the two together is a separate piece of work
--  with its own data-migration risk, and is not smuggled in here.
--
--  NAMING: the Vault already owns `license_renewal_tasks` (US spelling).
--  A table here called `licence_renewal_tasks` would differ from it by
--  one letter, which is a bug waiting to happen, so the instantiated
--  checklist rows are `licence_renewal_steps`.
--
--  WHY THE ALERTS ARE MATERIALISED
--  -------------------------------
--  "Is this licence within 6 months of expiry" is computable on demand,
--  so it is tempting to leave it as a view. But an alert that fires and
--  is acknowledged is evidence — an inspector asking "when did you first
--  know" needs a row with a timestamp, not a recomputation that always
--  answers "now". So alerts are rows, generated idempotently, and keyed
--  by the expiry they were raised against so a renewed licence starts a
--  fresh cycle rather than inheriting an acknowledged one.
-- =====================================================================


-- ── 1. Columns the lifecycle needs ───────────────────────────────────
ALTER TABLE public.regulatory_licences
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS discontinued_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_licence_id uuid
    REFERENCES public.regulatory_licences(id) ON DELETE SET NULL;

--  Deliberately NO check constraint on regulatory_body here: the
--  logistics seed templates (src/lib/governance/licenceSeedTemplates.ts)
--  write free text such as "Corporate Affairs Commission (CAC),
--  Nigeria" into this column. Constraining it now would reject existing
--  legitimate rows.

ALTER TABLE public.regulatory_licences
  DROP CONSTRAINT IF EXISTS regulatory_licences_status_check;
ALTER TABLE public.regulatory_licences
  ADD CONSTRAINT regulatory_licences_status_check
  CHECK (status = ANY (ARRAY[
    'draft','active','renewal_due','renewal_in_progress',
    'renewed','expired','suspended','discontinued']));

CREATE INDEX IF NOT EXISTS idx_reg_licences_status
  ON public.regulatory_licences(company_id, status);

--  Tenancy, brought into line with the rest of the Week 1/2 work.
--
--  The policy shipped in 20260606000000 resolves membership through
--  profiles.company_id, which is the old one-company-per-user model.
--  Every table the lifecycle engine touches — products,
--  regulatory_submissions' engine rows, product_documents, and the four
--  tables added here — resolves it through app_is_company_member(),
--  i.e. company_members. A user who belongs to a company through
--  company_members but whose profile points elsewhere can see that
--  company's products and submissions but not its licences, which is
--  incoherent and breaks the product/licence joins this deliverable
--  relies on.
--
--  The predicate is WIDENED rather than replaced: the profiles clause
--  stays, so nobody who could read a licence yesterday loses access
--  today. This is a consistency fix, not a grant of new privilege —
--  both clauses say "this user belongs to this company".
DROP POLICY IF EXISTS "Company members can manage regulatory licences" ON public.regulatory_licences;
CREATE POLICY "Company members can manage regulatory licences"
  ON public.regulatory_licences FOR ALL TO authenticated
  USING (
    public.app_is_company_member(company_id)
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (
    public.app_is_company_member(company_id)
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- TRUNCATE is not subject to RLS, so it is revoked rather than policed.
DO $priv_lic$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE TRUNCATE ON public.regulatory_licences FROM %I', r);
    END IF;
  END LOOP;
END
$priv_lic$;

CREATE OR REPLACE FUNCTION public.fn_licences_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_reg_licences_updated_at ON public.regulatory_licences;
CREATE TRIGGER trg_reg_licences_updated_at
  BEFORE UPDATE ON public.regulatory_licences
  FOR EACH ROW EXECUTE FUNCTION public.fn_licences_updated_at();


-- ── 2. The licence lifecycle ─────────────────────────────────────────
DO $seed_lic$
DECLARE
  v_def uuid;
  s_draft uuid; s_active uuid; s_due uuid; s_prog uuid;
  s_renewed uuid; s_exp uuid; s_susp uuid; s_disc uuid;
  v_from record;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'regulatory_licence' AND company_id IS NULL;
  IF v_def IS NOT NULL THEN RETURN; END IF;   -- idempotent

  INSERT INTO public.lifecycle_definitions(company_id, entity_type, name, version, is_active)
  VALUES (NULL, 'regulatory_licence', 'Regulatory Licence Lifecycle', 1, true)
  RETURNING id INTO v_def;

  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'draft','Draft',0,true,false) RETURNING id INTO s_draft;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'active','Active',1,false,false) RETURNING id INTO s_active;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'renewal_due','Renewal Due',2,false,false) RETURNING id INTO s_due;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'renewal_in_progress','Renewal In Progress',3,false,false) RETURNING id INTO s_prog;
  --  terminal: a renewed licence is closed and superseded by the new
  --  certificate, which is its own record with its own expiry.
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'renewed','Renewed / Superseded',4,false,true) RETURNING id INTO s_renewed;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'expired','Expired',5,false,false) RETURNING id INTO s_exp;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'suspended','Suspended',6,false,false) RETURNING id INTO s_susp;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'discontinued','Discontinued',7,false,true) RETURNING id INTO s_disc;

  INSERT INTO public.lifecycle_transitions
    (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
     required_role,required_permission,requires_comment,requires_signature)
  VALUES
    (v_def,s_draft ,s_active ,'grant_licence'      ,'Record Grant of Licence' , 0,'admin,compliance_officer',NULL,false,false),
    (v_def,s_active,s_due    ,'flag_renewal_due'   ,'Flag Renewal Due'        , 1,NULL,NULL,false,false),
    (v_def,s_active,s_prog   ,'begin_renewal_early','Begin Renewal'           , 2,NULL,NULL,false,false),
    (v_def,s_due   ,s_prog   ,'begin_renewal'      ,'Begin Renewal'           , 3,NULL,NULL,false,false),
    (v_def,s_exp   ,s_prog   ,'begin_late_renewal' ,'Begin Late Renewal'      , 4,NULL,NULL,true ,false),
    (v_def,s_prog  ,s_renewed,'complete_renewal'   ,'Complete Renewal'        , 5,'admin,compliance_officer',NULL,true,false),
    (v_def,s_active,s_exp    ,'lapse'              ,'Record Expiry'           , 6,NULL,NULL,false,false),
    (v_def,s_due   ,s_exp    ,'lapse_from_due'     ,'Record Expiry'           , 7,NULL,NULL,false,false),
    (v_def,s_prog  ,s_exp    ,'lapse_in_renewal'   ,'Record Expiry'           , 8,NULL,NULL,false,false),
    (v_def,s_susp  ,s_active ,'reinstate'          ,'Reinstate'               , 9,'admin,compliance_officer',NULL,true,false);

  --  Suspension and discontinuation are reachable from every live
  --  state, one action per source so the engine keeps naming the state
  --  the record actually came from.
  FOR v_from IN
    SELECT * FROM (VALUES
      (s_active,'active'), (s_due,'renewal_due'),
      (s_prog,'renewal_in_progress'), (s_exp,'expired')
    ) AS t(state_id, state_key)
  LOOP
    INSERT INTO public.lifecycle_transitions
      (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
       required_role,required_permission,requires_comment,requires_signature)
    VALUES (v_def, v_from.state_id, s_susp, 'suspend_from_'||v_from.state_key,
            'Suspend', 20, 'admin,compliance_officer', NULL, true, false);
  END LOOP;

  FOR v_from IN
    SELECT * FROM (VALUES
      (s_draft,'draft'), (s_active,'active'), (s_due,'renewal_due'),
      (s_prog,'renewal_in_progress'), (s_exp,'expired'), (s_susp,'suspended')
    ) AS t(state_id, state_key)
  LOOP
    INSERT INTO public.lifecycle_transitions
      (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
       required_role,required_permission,requires_comment,requires_signature)
    VALUES (v_def, v_from.state_id, s_disc, 'discontinue_from_'||v_from.state_key,
            'Discontinue', 30, 'admin,compliance_officer', NULL, true, false);
  END LOOP;
END
$seed_lic$;


-- ── 3. Licences join the engine: init, sync, guard ───────────────────
CREATE OR REPLACE FUNCTION public.fn_reg_licences_initialize_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.lifecycle_initialize('regulatory_licence', NEW.id, NEW.company_id, NEW.created_by, NULL);
  RETURN NULL;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'LIFECYCLE_ALREADY_INITIALIZED%' THEN RETURN NULL; END IF;
  RAISE;
END $$;

DROP TRIGGER IF EXISTS trg_reg_licences_initialize_lifecycle ON public.regulatory_licences;
CREATE TRIGGER trg_reg_licences_initialize_lifecycle
  AFTER INSERT ON public.regulatory_licences
  FOR EACH ROW EXECUTE FUNCTION public.fn_reg_licences_initialize_lifecycle();

CREATE OR REPLACE FUNCTION public.fn_reg_licences_sync_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_key text;
BEGIN
  IF NEW.entity_type <> 'regulatory_licence' THEN RETURN NULL; END IF;
  SELECT state_key INTO v_key FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_key IS NULL THEN RETURN NULL; END IF;

  PERFORM set_config('app.lifecycle_licence_sync','1',true);
  UPDATE public.regulatory_licences
     SET status = v_key,
         discontinued_at = CASE WHEN v_key = 'discontinued'
                                THEN coalesce(discontinued_at, now()) ELSE discontinued_at END
   WHERE id = NEW.entity_id AND status IS DISTINCT FROM v_key;
  PERFORM set_config('app.lifecycle_licence_sync','',true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_reg_licences_sync_status ON public.entity_current_state;
CREATE TRIGGER trg_reg_licences_sync_status
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_reg_licences_sync_status();

CREATE OR REPLACE FUNCTION public.fn_reg_licences_guard_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.lifecycle_licence_sync', true),'') <> '1' THEN
    RAISE EXCEPTION 'LICENCE_STATUS_READ_ONLY: status is derived from the lifecycle engine; use lifecycle_transition() or the licence RPCs instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON COLUMN public.regulatory_licences.status IS
  'DERIVED read model. Maintained by fn_reg_licences_sync_status() from entity_current_state; direct writes are rejected.';

--  Backfill. Existing licences are placed by the only evidence there
--  is — the expiry date — and never invented into a renewal state,
--  because nobody has actually started renewing them.
--
--  The rows it touches are exactly those with no entity_current_state
--  yet, i.e. those that predate the init trigger above. That is what
--  keeps a re-run safe: a licence created afterwards is genuinely in
--  `draft`, and flipping it to `active` because the migration ran twice
--  would grant a licence nobody granted.
--
--  The guard trigger is created AFTER this, and the sync flag is set
--  anyway so a re-run (when the trigger already exists) is not refused.
DO $bf_lic$
BEGIN
  PERFORM set_config('app.lifecycle_licence_sync','1',true);
  UPDATE public.regulatory_licences l
     SET status = CASE
                    WHEN l.expiry_date IS NULL        THEN 'active'
                    WHEN l.expiry_date < current_date THEN 'expired'
                    ELSE 'active'
                  END
   WHERE l.status = 'draft'
     AND NOT EXISTS (SELECT 1 FROM public.entity_current_state ecs
                      WHERE ecs.entity_type = 'regulatory_licence'
                        AND ecs.entity_id = l.id);
  PERFORM set_config('app.lifecycle_licence_sync','',true);
END
$bf_lic$;

INSERT INTO public.entity_current_state
  (company_id, definition_id, entity_type, entity_id, state_id, entered_at, entered_by, updated_at)
SELECT l.company_id,
       (SELECT id FROM public.lifecycle_definitions WHERE entity_type='regulatory_licence' AND company_id IS NULL),
       'regulatory_licence', l.id, st.id,
       coalesce(l.created_at, now()), l.created_by, now()
  FROM public.regulatory_licences l
  JOIN public.lifecycle_states st
    ON st.definition_id = (SELECT id FROM public.lifecycle_definitions WHERE entity_type='regulatory_licence' AND company_id IS NULL)
   AND st.state_key = l.status
ON CONFLICT (definition_id, entity_id) DO NOTHING;

INSERT INTO public.entity_state_history
  (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id,
   transition_id, actor_id, comment, metadata, created_at)
SELECT ecs.company_id, ecs.definition_id, 'regulatory_licence', ecs.entity_id,
       NULL, ecs.state_id, NULL, ecs.entered_by,
       'Backfilled from regulatory_licences.expiry_date',
       jsonb_build_object('reason','backfill_d06'), ecs.entered_at
  FROM public.entity_current_state ecs
 WHERE ecs.entity_type = 'regulatory_licence'
   AND NOT EXISTS (SELECT 1 FROM public.entity_state_history h
                    WHERE h.entity_type='regulatory_licence' AND h.entity_id = ecs.entity_id);

DROP TRIGGER IF EXISTS trg_reg_licences_guard_status ON public.regulatory_licences;
CREATE TRIGGER trg_reg_licences_guard_status
  BEFORE UPDATE ON public.regulatory_licences
  FOR EACH ROW EXECUTE FUNCTION public.fn_reg_licences_guard_status();


-- ── 4. Per-company renewal policy ────────────────────────────────────
--  Every configurable knob in this deliverable lives here. A company
--  with no row gets the defaults, so the feature works before anyone
--  visits a settings page.
CREATE TABLE IF NOT EXISTS public.licence_renewal_policies (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,

  --  The milestones, in months before expiry. 12/6/3 is the brief's
  --  default; a company may set its own.
  alert_months integer[] NOT NULL DEFAULT ARRAY[12,6,3],
  --  …and below this many months, every month. 3 gives 2, 1 and 0.
  monthly_from_month integer NOT NULL DEFAULT 3,

  suppress_when_discontinued boolean NOT NULL DEFAULT true,

  --  The renewal-in-progress exception, split because the two
  --  operations carry different risk: starting a batch you may not be
  --  able to sell is a commercial decision, releasing one against a
  --  lapsed registration is a regulatory offence. Both default OFF —
  --  the permissive setting has to be chosen deliberately.
  renewal_exception_allows_initiation boolean NOT NULL DEFAULT false,
  renewal_exception_allows_release    boolean NOT NULL DEFAULT false,

  --  company_members.role is free text, so who counts as "production"
  --  is configuration, not a hard-coded list.
  production_notify_roles text[] NOT NULL
    DEFAULT ARRAY['production','production_manager','manufacturing','qa','quality_assurance'],

  renewal_template_key text NOT NULL DEFAULT 'nafdac_2026',

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT licence_renewal_policies_months_check
    CHECK (array_length(alert_months,1) BETWEEN 1 AND 12),
  CONSTRAINT licence_renewal_policies_monthly_check
    CHECK (monthly_from_month BETWEEN 0 AND 24)
);

ALTER TABLE public.licence_renewal_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view renewal policy" ON public.licence_renewal_policies;
CREATE POLICY "Company members can view renewal policy"
  ON public.licence_renewal_policies FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can set renewal policy" ON public.licence_renewal_policies;
CREATE POLICY "Company members can set renewal policy"
  ON public.licence_renewal_policies FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can update renewal policy" ON public.licence_renewal_policies;
CREATE POLICY "Company members can update renewal policy"
  ON public.licence_renewal_policies FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

--  Deleting the row is how a company returns to the defaults. Without
--  this policy the delete silently affects nothing, which looks like a
--  reset and is not one.
DROP POLICY IF EXISTS "Company members can clear renewal policy" ON public.licence_renewal_policies;
CREATE POLICY "Company members can clear renewal policy"
  ON public.licence_renewal_policies FOR DELETE TO authenticated
  USING (public.app_is_company_member(company_id));

--  The resolver. Returns the company's row, or the defaults when there
--  is none, so no caller has to know whether a row exists.
--
--  SECURITY DEFINER means RLS does not apply inside this function, so
--  the tenancy check has to be written out. Without it any signed-in
--  user could read any company's alert configuration by guessing an id.
--  The same applies to every DEFINER reader below.
CREATE OR REPLACE FUNCTION public.licence_renewal_policy(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN NOT (public.app_is_service_context()
                        OR public.app_is_company_member(p_company_id))
              THEN NULL::jsonb ELSE coalesce(
    (SELECT to_jsonb(p) FROM public.licence_renewal_policies p WHERE p.company_id = p_company_id),
    jsonb_build_object(
      'company_id', p_company_id,
      'alert_months', to_jsonb(ARRAY[12,6,3]),
      'monthly_from_month', 3,
      'suppress_when_discontinued', true,
      'renewal_exception_allows_initiation', false,
      'renewal_exception_allows_release', false,
      'production_notify_roles',
        to_jsonb(ARRAY['production','production_manager','manufacturing','qa','quality_assurance']),
      'renewal_template_key', 'nafdac_2026',
      'is_default', true)
  ) END;
$$;

REVOKE ALL ON FUNCTION public.licence_renewal_policy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_renewal_policy(uuid) TO authenticated, service_role;

--  12, 6, 3, then monthly — expanded into the actual milestone list,
--  descending, deduplicated.
CREATE OR REPLACE FUNCTION public.licence_alert_milestones(p_company_id uuid)
RETURNS integer[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH pol AS (
    SELECT
      coalesce((SELECT alert_months FROM public.licence_renewal_policies WHERE company_id = p_company_id),
               ARRAY[12,6,3]) AS months,
      coalesce((SELECT monthly_from_month FROM public.licence_renewal_policies WHERE company_id = p_company_id),
               3) AS monthly_from
  ), all_months AS (
    SELECT unnest(months) AS m FROM pol
    UNION
    SELECT g FROM pol, generate_series(0, greatest(monthly_from - 1, 0)) AS g
  )
  SELECT array_agg(DISTINCT m ORDER BY m DESC) FROM all_months
   WHERE m >= 0
     AND (public.app_is_service_context() OR public.app_is_company_member(p_company_id));
$$;

COMMENT ON FUNCTION public.licence_alert_milestones(uuid) IS
  'The renewal alert milestones for a company, in months before expiry, descending. Default 12/6/3 then monthly gives {12,6,3,2,1,0}.';

REVOKE ALL ON FUNCTION public.licence_alert_milestones(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_alert_milestones(uuid) TO authenticated, service_role;


-- ── 5. The renewal checklist template ────────────────────────────────
--  The 12 steps are the ones already shipped in
--  src/lib/licenseService.ts (NAFDAC_2026_RENEWAL_TASKS). They are moved
--  into the database so the server can instantiate them when the alert
--  fires, rather than only when a browser happens to be open, and so a
--  company can override them.
CREATE TABLE IF NOT EXISTS public.licence_renewal_task_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  template_key  text NOT NULL DEFAULT 'nafdac_2026',
  step_no       integer NOT NULL,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  months_before numeric NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT licence_renewal_task_templates_step_check CHECK (step_no > 0),
  CONSTRAINT licence_renewal_task_templates_months_check CHECK (months_before >= 0),
  CONSTRAINT licence_renewal_task_templates_title_not_blank CHECK (length(btrim(title)) > 0)
);

--  Two partial indexes rather than one constraint, for the same reason
--  lifecycle_definitions needs them: NULL company_id does not collide
--  with itself.
CREATE UNIQUE INDEX IF NOT EXISTS licence_renewal_templates_system_uniq
  ON public.licence_renewal_task_templates (template_key, step_no)
  WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS licence_renewal_templates_company_uniq
  ON public.licence_renewal_task_templates (company_id, template_key, step_no)
  WHERE company_id IS NOT NULL;

ALTER TABLE public.licence_renewal_task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view renewal templates" ON public.licence_renewal_task_templates;
CREATE POLICY "Members can view renewal templates"
  ON public.licence_renewal_task_templates FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Members can add company renewal templates" ON public.licence_renewal_task_templates;
CREATE POLICY "Members can add company renewal templates"
  ON public.licence_renewal_task_templates FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Members can update company renewal templates" ON public.licence_renewal_task_templates;
CREATE POLICY "Members can update company renewal templates"
  ON public.licence_renewal_task_templates FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND public.app_is_company_member(company_id))
  WITH CHECK (company_id IS NOT NULL AND public.app_is_company_member(company_id));

INSERT INTO public.licence_renewal_task_templates
  (company_id, template_key, step_no, title, description, months_before)
VALUES
 (NULL,'nafdac_2026', 1,'Obtain current Power of Attorney (PoA)',
  'Secure an updated and notarized Power of Attorney from the product manufacturer authorizing the local representative. Must be less than 12 months old at submission.',6),
 (NULL,'nafdac_2026', 2,'Book GMP Facility Inspection',
  'Schedule a Good Manufacturing Practice (GMP) inspection with NAFDAC for the manufacturing facility. Coordinate with the manufacturer for availability and required documentation.',5),
 (NULL,'nafdac_2026', 3,'Prepare updated Certificate of Pharmaceutical Product (CPP)',
  'Request an updated CPP from the regulatory authority in the country of origin. Must be recent (within 2 years) and authenticated by the Nigerian Embassy.',5),
 (NULL,'nafdac_2026', 4,'Complete Product Stability Studies Report',
  'Compile stability data as per ICH guidelines (Zone IVb for Nigeria). Include accelerated and long-term stability reports for the product.',4),
 (NULL,'nafdac_2026', 5,'Update Product Information Leaflet (PIL)',
  'Review and update the patient information leaflet and Summary of Product Characteristics (SmPC) per current NAFDAC requirements. Ensure English language version is included.',4),
 (NULL,'nafdac_2026', 6,'Prepare Batch Manufacturing Records (last 3 batches)',
  'Compile complete batch manufacturing records for the last 3 production batches, including in-process controls and release testing results.',3),
 (NULL,'nafdac_2026', 7,'Obtain Site Master File (SMF) from manufacturer',
  'Request the current Site Master File from the manufacturing facility. This must reflect the current state of the facility and comply with WHO guidelines.',3),
 (NULL,'nafdac_2026', 8,'Submit NAFDAC Renewal Application Form',
  'Complete and submit the official NAFDAC Product Registration Renewal Application Form. Include all required attachments and supporting documentation.',3),
 (NULL,'nafdac_2026', 9,'Pay NAFDAC Renewal Processing Fee',
  'Pay the applicable renewal processing fee through the official NAFDAC payment portal (Remita). Retain evidence of payment for submission.',3),
 (NULL,'nafdac_2026',10,'Submit complete dossier to NAFDAC',
  'Compile and submit the complete renewal dossier to the NAFDAC Registration & Regulatory Affairs Directorate. Include 2 hard copies and 1 electronic copy (eCTD format preferred).',2),
 (NULL,'nafdac_2026',11,'Follow up with NAFDAC Registration Division',
  'Actively follow up with the NAFDAC Registration Division to track the status of the renewal application. Address any queries or deficiency letters promptly.',1),
 (NULL,'nafdac_2026',12,'Receive renewed certificate / track status',
  'Collect the renewed NAFDAC Registration Certificate. Upload a copy to the system and update the license record with new expiry date.',0.5)
ON CONFLICT DO NOTHING;


-- ── 6. Instantiated renewal steps ────────────────────────────────────
--  Named `steps`, not `tasks`, because public.license_renewal_tasks
--  already exists for the older License Vault and a one-letter
--  difference is not a safe distinction.
CREATE TABLE IF NOT EXISTS public.licence_renewal_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  licence_id    uuid NOT NULL REFERENCES public.regulatory_licences(id) ON DELETE CASCADE,
  --  The expiry the cycle was opened against. A renewed licence with a
  --  new expiry gets a fresh set rather than reusing ticked-off steps.
  renewal_cycle_expiry date NOT NULL,
  step_no       integer NOT NULL,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  deadline      date NOT NULL,
  is_completed  boolean NOT NULL DEFAULT false,
  completed_at  timestamptz,
  completed_by  uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT licence_renewal_steps_uniq UNIQUE (licence_id, renewal_cycle_expiry, step_no)
);

CREATE INDEX IF NOT EXISTS idx_licence_renewal_steps_licence
  ON public.licence_renewal_steps (licence_id, renewal_cycle_expiry, step_no);
CREATE INDEX IF NOT EXISTS idx_licence_renewal_steps_open
  ON public.licence_renewal_steps (company_id, deadline) WHERE NOT is_completed;

ALTER TABLE public.licence_renewal_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view renewal steps" ON public.licence_renewal_steps;
CREATE POLICY "Company members can view renewal steps"
  ON public.licence_renewal_steps FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

--  Ticking a step off is an ordinary member action; creating and
--  deleting them is the generator's job, so INSERT/DELETE stay closed.
DROP POLICY IF EXISTS "Company members can complete renewal steps" ON public.licence_renewal_steps;
CREATE POLICY "Company members can complete renewal steps"
  ON public.licence_renewal_steps FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));


-- ── 7. Alerts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.licence_renewal_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  licence_id    uuid NOT NULL REFERENCES public.regulatory_licences(id) ON DELETE CASCADE,
  renewal_cycle_expiry date NOT NULL,
  milestone_months integer NOT NULL,
  due_date      date NOT NULL,
  raised_at     timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,

  CONSTRAINT licence_renewal_alerts_uniq
    UNIQUE (licence_id, renewal_cycle_expiry, milestone_months),
  CONSTRAINT licence_renewal_alerts_milestone_check CHECK (milestone_months >= 0)
);

CREATE INDEX IF NOT EXISTS idx_licence_alerts_open
  ON public.licence_renewal_alerts (company_id, due_date) WHERE acknowledged_at IS NULL;

ALTER TABLE public.licence_renewal_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view licence alerts" ON public.licence_renewal_alerts;
CREATE POLICY "Company members can view licence alerts"
  ON public.licence_renewal_alerts FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can acknowledge licence alerts" ON public.licence_renewal_alerts;
CREATE POLICY "Company members can acknowledge licence alerts"
  ON public.licence_renewal_alerts FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

DO $priv_d06$
DECLARE r text; t text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH t IN ARRAY ARRAY['licence_renewal_policies','licence_renewal_task_templates',
                               'licence_renewal_steps','licence_renewal_alerts'] LOOP
        --  TRUNCATE is not subject to RLS, so it is revoked rather than
        --  policed. An alert history that can be emptied is not evidence.
        EXECUTE format('REVOKE TRUNCATE ON public.%I FROM %I', t, r);
      END LOOP;
      EXECUTE format('REVOKE INSERT, DELETE ON public.licence_renewal_steps FROM %I', r);
      EXECUTE format('REVOKE INSERT, DELETE ON public.licence_renewal_alerts FROM %I', r);
    END IF;
  END LOOP;
END
$priv_d06$;


-- ── 8. Is this licence alertable at all? ─────────────────────────────
--  Discontinued suppression lives in one place so that the generator,
--  the dashboard and any future job all agree.
CREATE OR REPLACE FUNCTION public.licence_alerting_suppressed(p_licence_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE l record; v_suppress boolean; v_prod_status text;
BEGIN
  SELECT id, company_id, status, expiry_date, product_id
    INTO l FROM public.regulatory_licences WHERE id = p_licence_id;
  IF l.id IS NULL THEN RETURN 'licence not found'; END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(l.company_id) THEN
    RAISE EXCEPTION 'LICENCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  IF l.expiry_date IS NULL THEN RETURN 'no expiry date recorded'; END IF;
  IF l.status = 'discontinued' THEN RETURN 'licence is discontinued'; END IF;
  IF l.status = 'renewed'      THEN RETURN 'licence has been renewed and superseded'; END IF;
  IF l.status = 'suspended'    THEN RETURN 'licence is suspended'; END IF;

  v_suppress := coalesce(
    (SELECT suppress_when_discontinued FROM public.licence_renewal_policies
      WHERE company_id = l.company_id), true);

  IF v_suppress AND l.product_id IS NOT NULL THEN
    SELECT status INTO v_prod_status FROM public.products WHERE id = l.product_id;
    IF v_prod_status = 'discontinued' THEN
      RETURN 'product is discontinued';
    END IF;
  END IF;

  RETURN NULL;   -- not suppressed
END $$;

COMMENT ON FUNCTION public.licence_alerting_suppressed(uuid) IS
  'NULL when a licence should be alerted on; otherwise the reason it is suppressed. Discontinued products and discontinued, renewed or suspended licences do not generate renewal noise.';

REVOKE ALL ON FUNCTION public.licence_alerting_suppressed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_alerting_suppressed(uuid) TO authenticated, service_role;


-- ── 9. Instantiating the checklist ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.licence_generate_renewal_steps(
  p_licence_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  l record; v_key text; v_created integer := 0;
BEGIN
  SELECT id, company_id, expiry_date INTO l
    FROM public.regulatory_licences WHERE id = p_licence_id;
  IF l.id IS NULL OR l.expiry_date IS NULL THEN RETURN 0; END IF;

  --  SECURITY DEFINER, granted to authenticated, and it writes rows —
  --  so it has to check the caller itself. Without this, any signed-in
  --  user could open a renewal checklist inside another tenant.
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(l.company_id) THEN
    RAISE EXCEPTION 'LICENCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  v_key := coalesce(
    (SELECT renewal_template_key FROM public.licence_renewal_policies WHERE company_id = l.company_id),
    'nafdac_2026');

  --  A company template of the same key wins over the system one, whole
  --  template at a time — mixing the two would produce a checklist
  --  nobody wrote.
  WITH chosen AS (
    SELECT t.*
      FROM public.licence_renewal_task_templates t
     WHERE t.template_key = v_key
       AND t.company_id = l.company_id
    UNION ALL
    SELECT t.*
      FROM public.licence_renewal_task_templates t
     WHERE t.template_key = v_key
       AND t.company_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.licence_renewal_task_templates c
                        WHERE c.template_key = v_key AND c.company_id = l.company_id)
  )
  INSERT INTO public.licence_renewal_steps
    (company_id, licence_id, renewal_cycle_expiry, step_no, title, description, deadline)
  SELECT l.company_id, l.id, l.expiry_date, c.step_no, c.title, c.description,
         (l.expiry_date - make_interval(days => round(c.months_before * 30)::int))::date
    FROM chosen c
  ON CONFLICT (licence_id, renewal_cycle_expiry, step_no) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN v_created;
END $$;

COMMENT ON FUNCTION public.licence_generate_renewal_steps(uuid) IS
  'Instantiates the renewal checklist template for a licence''s current expiry cycle. Idempotent: re-running adds nothing. Returns the number of steps created.';

REVOKE ALL ON FUNCTION public.licence_generate_renewal_steps(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_generate_renewal_steps(uuid) TO authenticated, service_role;


-- ── 10. The alert generator ──────────────────────────────────────────
--  Idempotent and re-runnable: call it on login, from a scheduled job,
--  or twice in a row — the unique constraint makes the second run a
--  no-op, which is what lets it be scheduled without bookkeeping.
CREATE OR REPLACE FUNCTION public.licence_generate_renewal_alerts(
  p_company_id uuid,
  p_as_of      date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_milestones integer[];
  v_max        integer;
  l            record;
  m            integer;
  v_due        date;
  v_new        integer := 0;
  v_steps      integer := 0;
  v_suppressed integer := 0;
  v_flagged    integer := 0;
  v_inserted   boolean;
  v_reason     text;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'LICENCE_ALERTS_COMPANY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'LICENCE_FORBIDDEN: caller is not a member of the named company'
      USING ERRCODE = 'P0001';
  END IF;

  v_milestones := public.licence_alert_milestones(p_company_id);
  SELECT max(x) INTO v_max FROM unnest(v_milestones) AS x;

  FOR l IN
    SELECT id, expiry_date, status
      FROM public.regulatory_licences
     WHERE company_id = p_company_id
       AND expiry_date IS NOT NULL
  LOOP
    v_reason := public.licence_alerting_suppressed(l.id);
    IF v_reason IS NOT NULL THEN
      v_suppressed := v_suppressed + 1;
      CONTINUE;
    END IF;

    FOREACH m IN ARRAY v_milestones LOOP
      v_due := (l.expiry_date - make_interval(months => m))::date;
      CONTINUE WHEN p_as_of < v_due;      -- not reached yet

      INSERT INTO public.licence_renewal_alerts
        (company_id, licence_id, renewal_cycle_expiry, milestone_months, due_date)
      VALUES (p_company_id, l.id, l.expiry_date, m, v_due)
      ON CONFLICT (licence_id, renewal_cycle_expiry, milestone_months) DO NOTHING;

      v_inserted := FOUND;
      IF v_inserted THEN
        v_new := v_new + 1;

        --  The first (largest) milestone is the one the brief hangs the
        --  checklist on: at 12 months, open the renewal tasks. Using the
        --  configured maximum rather than a literal 12 keeps that true
        --  for a company that sets its own schedule.
        IF m = v_max THEN
          v_steps := v_steps + public.licence_generate_renewal_steps(l.id);

          --  …and the licence itself moves, so "renewal due" is a state
          --  in the engine and not an inference drawn from a date.
          IF l.status = 'active' THEN
            PERFORM public.lifecycle_transition(
              'regulatory_licence', l.id, 'flag_renewal_due', p_company_id, NULL,
              format('Renewal milestone reached: %s month(s) to expiry on %s', m, l.expiry_date),
              jsonb_build_object('milestone_months', m, 'source', 'licence_generate_renewal_alerts'));
            v_flagged := v_flagged + 1;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'as_of', p_as_of,
    'milestones', to_jsonb(v_milestones),
    'alerts_created', v_new,
    'renewal_steps_created', v_steps,
    'licences_flagged_renewal_due', v_flagged,
    'licences_suppressed', v_suppressed);
END $$;

COMMENT ON FUNCTION public.licence_generate_renewal_alerts(uuid,date) IS
  'Raises the due renewal alerts for a company, idempotently. At the largest configured milestone it also instantiates the renewal checklist and moves the licence to renewal_due. Discontinued products and discontinued/renewed/suspended licences are skipped.';

REVOKE ALL ON FUNCTION public.licence_generate_renewal_alerts(uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_generate_renewal_alerts(uuid,date) TO authenticated, service_role;


-- ── 11. One audit row per cascade step ───────────────────────────────
--  The brief asks for each action in the approval cascade to be
--  individually audit logged. One row summarising five things is not
--  that, so this helper writes exactly one hash-chained row and is
--  called once per step.
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


-- ── 12. The approval cascade ─────────────────────────────────────────
--  Five things happen when a licence is granted, and they happen
--  together or not at all — which is why this is one plpgsql function
--  and not five service calls the browser makes in a row and might
--  abandon halfway.
--
--    1. the licence is granted            → licence.approval_recorded
--    2. registration + expiry captured    → licence.registration_captured
--    3. the product's status is updated   → product.status_updated
--    4. production is notified            → production.notified
--    5. the renewal schedule is opened    → licence.renewal_scheduled
--
--  Steps that cannot apply (no linked product, nobody to notify) are
--  REPORTED in the return value rather than skipped silently, so the
--  caller can see a half-configured company rather than assume a clean
--  cascade.
CREATE OR REPLACE FUNCTION public.licence_record_approval(
  p_licence_id         uuid,
  p_registration_number text,
  p_expiry_date        date,
  p_issue_date         date DEFAULT current_date,
  p_notify             boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  l            record;
  v_company    uuid;
  v_steps      jsonb := '[]'::jsonb;
  v_tr         jsonb;
  v_prod_state text;
  v_prod_note  text;
  v_recipients uuid[];
  v_roles      text[];
  v_notified   integer := 0;
  v_alerts     jsonb;
  v_msg        text;
BEGIN
  SELECT * INTO l FROM public.regulatory_licences WHERE id = p_licence_id;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'LICENCE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  v_company := l.company_id;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'LICENCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(btrim(p_registration_number),'') = '' THEN
    RAISE EXCEPTION 'LICENCE_REGISTRATION_REQUIRED: a granted licence must carry its registration number'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_expiry_date IS NULL THEN
    RAISE EXCEPTION 'LICENCE_EXPIRY_REQUIRED: a granted licence must carry its expiry date'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_issue_date IS NOT NULL AND p_expiry_date <= p_issue_date THEN
    RAISE EXCEPTION 'LICENCE_EXPIRY_BEFORE_ISSUE: expiry % is not after issue %', p_expiry_date, p_issue_date
      USING ERRCODE = 'P0001';
  END IF;

  -- ── step 1: the grant itself ──────────────────────────────────────
  IF l.status = 'draft' THEN
    v_tr := public.lifecycle_transition(
      'regulatory_licence', l.id, 'grant_licence', v_company, NULL,
      format('Licence granted, registration %s', btrim(p_registration_number)),
      jsonb_build_object('registration_number', btrim(p_registration_number),
                         'expiry_date', p_expiry_date));
    v_msg := 'licence moved draft -> active';
  ELSE
    v_tr := NULL;
    v_msg := format('licence was already "%s"; no lifecycle move made', l.status);
  END IF;

  PERFORM public.licence_audit_step(v_company, 'licence.approval_recorded',
    'regulatory_licence', l.id,
    jsonb_build_object('detail', v_msg, 'transition', v_tr,
                       'previous_status', l.status));
  v_steps := v_steps || jsonb_build_object(
    'step', 'licence.approval_recorded', 'ok', true, 'detail', v_msg);

  -- ── step 2: registration and expiry captured ──────────────────────
  UPDATE public.regulatory_licences
     SET registration_number = btrim(p_registration_number),
         issue_date  = coalesce(p_issue_date, issue_date),
         expiry_date = p_expiry_date
   WHERE id = l.id;

  PERFORM public.licence_audit_step(v_company, 'licence.registration_captured',
    'regulatory_licence', l.id,
    jsonb_build_object('registration_number', btrim(p_registration_number),
                       'issue_date', coalesce(p_issue_date, l.issue_date),
                       'expiry_date', p_expiry_date,
                       'previous_expiry_date', l.expiry_date));
  v_steps := v_steps || jsonb_build_object(
    'step', 'licence.registration_captured', 'ok', true,
    'detail', format('registration %s, expires %s', btrim(p_registration_number), p_expiry_date));

  -- ── step 3: the product follows ───────────────────────────────────
  IF l.product_id IS NULL THEN
    v_prod_note := 'no product linked to this licence';
  ELSE
    SELECT status INTO v_prod_state FROM public.products WHERE id = l.product_id;

    --  Only a product that is actually awaiting a decision is moved.
    --  Forcing a discontinued or suspended product back to registered
    --  because a certificate arrived would overwrite a deliberate
    --  decision somebody made.
    IF v_prod_state = 'submitted' THEN
      PERFORM public.lifecycle_transition(
        'product', l.product_id, 'record_registration', v_company, NULL,
        format('Registered under licence %s (%s)', l.name, btrim(p_registration_number)),
        jsonb_build_object('licence_id', l.id,
                           'registration_number', btrim(p_registration_number)));
      v_prod_note := 'product moved submitted -> registered';
    ELSE
      v_prod_note := format('product is "%s"; left as it is', coalesce(v_prod_state,'unknown'));
    END IF;

    --  products carries the regulator's number as nafdac_number; there
    --  is no registration_number column on that table.
    UPDATE public.products
       SET nafdac_number            = coalesce(nafdac_number, btrim(p_registration_number)),
           registration_expiry_date = p_expiry_date
     WHERE id = l.product_id;
  END IF;

  PERFORM public.licence_audit_step(v_company, 'product.status_updated',
    'product', l.product_id,
    jsonb_build_object('detail', v_prod_note, 'licence_id', l.id,
                       'registration_expiry_date', p_expiry_date));
  v_steps := v_steps || jsonb_build_object(
    'step', 'product.status_updated', 'ok', l.product_id IS NOT NULL, 'detail', v_prod_note);

  -- ── step 4: production is told ────────────────────────────────────
  IF p_notify THEN
    v_roles := coalesce(
      (SELECT production_notify_roles FROM public.licence_renewal_policies WHERE company_id = v_company),
      ARRAY['production','production_manager','manufacturing','qa','quality_assurance']);

    SELECT array_agg(DISTINCT cm.user_id) INTO v_recipients
      FROM public.company_members cm
     WHERE cm.company_id = v_company
       AND cm.status = 'active'
       AND cm.user_id IS NOT NULL
       AND lower(cm.role) = ANY (v_roles);

    --  Nobody carries a production role in this company yet. Falling
    --  silent would be the worst outcome, so it escalates to the people
    --  who can act, and the audit row says that is what happened.
    IF v_recipients IS NULL OR array_length(v_recipients,1) IS NULL THEN
      SELECT array_agg(DISTINCT cm.user_id) INTO v_recipients
        FROM public.company_members cm
       WHERE cm.company_id = v_company
         AND cm.status = 'active'
         AND cm.user_id IS NOT NULL
         AND lower(cm.role) = ANY (ARRAY['admin','owner']);
      v_prod_note := 'no production role configured; notified admins/owners instead';
    ELSE
      v_prod_note := format('notified %s production recipient(s)', array_length(v_recipients,1));
    END IF;

    IF v_recipients IS NOT NULL AND array_length(v_recipients,1) IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, user_id, type, content_id, message)
      SELECT r, auth.uid(), 'licence_granted', l.id,
             format('Licence "%s" (%s) is active and expires on %s. Production may proceed against this registration.',
                    l.name, btrim(p_registration_number), p_expiry_date)
        FROM unnest(v_recipients) AS r;
      GET DIAGNOSTICS v_notified = ROW_COUNT;
    ELSE
      v_prod_note := 'no active company members to notify';
    END IF;
  ELSE
    v_prod_note := 'notification suppressed by caller';
  END IF;

  PERFORM public.licence_audit_step(v_company, 'production.notified',
    'regulatory_licence', l.id,
    jsonb_build_object('detail', v_prod_note, 'recipients', v_notified,
                       'roles_targeted', to_jsonb(v_roles)));
  v_steps := v_steps || jsonb_build_object(
    'step', 'production.notified', 'ok', v_notified > 0, 'detail', v_prod_note,
    'recipients', v_notified);

  -- ── step 5: the renewal schedule ──────────────────────────────────
  v_alerts := public.licence_generate_renewal_alerts(v_company, current_date);

  PERFORM public.licence_audit_step(v_company, 'licence.renewal_scheduled',
    'regulatory_licence', l.id,
    jsonb_build_object('expiry_date', p_expiry_date,
                       'milestones', v_alerts -> 'milestones',
                       'alerts_created', v_alerts -> 'alerts_created',
                       'renewal_steps_created', v_alerts -> 'renewal_steps_created'));
  v_steps := v_steps || jsonb_build_object(
    'step', 'licence.renewal_scheduled', 'ok', true,
    'detail', format('milestones %s', v_alerts ->> 'milestones'),
    'alerts_created', v_alerts -> 'alerts_created');

  RETURN jsonb_build_object(
    'licence_id', l.id, 'company_id', v_company,
    'registration_number', btrim(p_registration_number),
    'expiry_date', p_expiry_date,
    'steps', v_steps);
END $$;

COMMENT ON FUNCTION public.licence_record_approval(uuid,text,date,date,boolean) IS
  'The licence approval cascade, in one transaction: grant, capture registration and expiry, update the product, notify production, schedule the renewal. Each of the five steps writes its own hash-chained audit_logs row.';

REVOKE ALL ON FUNCTION public.licence_record_approval(uuid,text,date,date,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_record_approval(uuid,text,date,date,boolean) TO authenticated, service_role;


-- ── 13. Blocking manufacturing on an expired licence ─────────────────
--  Returns NULL when the operation may proceed, otherwise the message.
--  The message names the licence, the expiry date and the renewal
--  status, because "blocked" without those three tells the operator
--  nothing they can act on.
CREATE OR REPLACE FUNCTION public.licence_block_reason(
  p_product_id uuid,
  p_operation  text DEFAULT 'release'
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid;
  l         record;
  v_allowed boolean;
  v_label   text;
  v_named   text;
BEGIN
  IF p_product_id IS NULL THEN RETURN NULL; END IF;
  IF p_operation NOT IN ('initiation','release') THEN
    RAISE EXCEPTION 'LICENCE_UNKNOWN_OPERATION: "%" is not "initiation" or "release"', p_operation
      USING ERRCODE = 'P0001';
  END IF;

  SELECT company_id INTO v_company FROM public.products WHERE id = p_product_id;
  IF v_company IS NULL THEN RETURN NULL; END IF;

  --  This function reports a licence name, its registration number and
  --  its expiry date. Behind SECURITY DEFINER that is readable across
  --  tenants unless the check is written here.
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'LICENCE_FORBIDDEN: caller is not a member of the company that owns this product'
      USING ERRCODE = 'P0001';
  END IF;

  --  A product with no licence on file is not this gate's problem: the
  --  product registry gate (D05) already refuses to release against an
  --  unregistered product. Two gates raising for the same cause would
  --  hide whichever fired second.
  --
  --  `draft` counts as no licence on file, deliberately. A draft row is
  --  a certificate being prepared, not one that lapsed, and reporting
  --  it as expired would put a future date after the word "expired".
  IF NOT EXISTS (
    SELECT 1 FROM public.regulatory_licences
     WHERE product_id = p_product_id
       AND status NOT IN ('draft','discontinued','renewed')) THEN
    RETURN NULL;
  END IF;

  --  Any currently valid licence is enough.
  IF EXISTS (
    SELECT 1 FROM public.regulatory_licences
     WHERE product_id = p_product_id
       AND status IN ('active','renewal_due','renewal_in_progress')
       AND expiry_date IS NOT NULL
       AND expiry_date >= current_date) THEN
    RETURN NULL;
  END IF;

  --  Nothing valid. Report against the licence that expired most
  --  recently — the one somebody is most likely to be renewing.
  SELECT * INTO l
    FROM public.regulatory_licences
   WHERE product_id = p_product_id
     AND status NOT IN ('draft','discontinued','renewed')
   ORDER BY expiry_date DESC NULLS LAST
   LIMIT 1;

  v_label := CASE l.status
    WHEN 'renewal_in_progress' THEN 'renewal in progress'
    WHEN 'renewal_due'         THEN 'renewal due, not started'
    WHEN 'suspended'           THEN 'suspended'
    WHEN 'expired'             THEN 'expired, no renewal started'
    WHEN 'active'              THEN 'active, no renewal started'
    ELSE l.status END;

  v_named := format('licence "%s"%s', l.name,
    CASE WHEN coalesce(btrim(l.registration_number),'') <> ''
         THEN ' ('||btrim(l.registration_number)||')' ELSE '' END);

  --  A suspended licence has not expired, and saying it has would send
  --  somebody to chase a renewal that is not the problem.
  IF l.status = 'suspended' THEN
    RETURN format(
      'LICENCE_SUSPENDED: %s is suspended (expiry on record: %s); renewal status: %s. Batch %s is blocked.',
      v_named, coalesce(l.expiry_date::text,'none recorded'), v_label, p_operation);
  END IF;

  IF l.expiry_date IS NULL THEN
    RETURN format(
      'LICENCE_NOT_VALID: %s has no expiry date on record, so it cannot be shown to be in force; '
      'renewal status: %s. Batch %s is blocked.',
      v_named, v_label, p_operation);
  END IF;

  IF l.status = 'renewal_in_progress' THEN
    SELECT CASE WHEN p_operation = 'initiation'
                THEN coalesce(renewal_exception_allows_initiation, false)
                ELSE coalesce(renewal_exception_allows_release, false) END
      INTO v_allowed
      FROM public.licence_renewal_policies WHERE company_id = v_company;
    v_allowed := coalesce(v_allowed, false);

    IF v_allowed THEN RETURN NULL; END IF;

    RETURN format(
      'LICENCE_EXPIRED: %s expired on %s; renewal status: %s. '
      'Batch %s is blocked because this company has not enabled the renewal-in-progress exception for %s.',
      v_named, l.expiry_date, v_label, p_operation, p_operation);
  END IF;

  RETURN format(
    'LICENCE_EXPIRED: %s expired on %s; renewal status: %s. Batch %s is blocked.',
    v_named, l.expiry_date, v_label, p_operation);
END $$;

COMMENT ON FUNCTION public.licence_block_reason(uuid,text) IS
  'NULL when a batch may be initiated or released for a product, otherwise a message naming the licence, its expiry date and its renewal status. Honours the per-company renewal-in-progress exception.';

REVOKE ALL ON FUNCTION public.licence_block_reason(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_block_reason(uuid,text) TO authenticated, service_role;

--  The gate. In the database rather than only in src/lib, because the
--  browser holds the anon key and talks straight to PostgREST — a check
--  that lives only in a service is a suggestion.
CREATE OR REPLACE FUNCTION public.fn_batch_records_licence_gate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_reason text; v_op text;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    v_op := 'initiation';
  ELSIF NEW.status = 'released' AND OLD.status IS DISTINCT FROM 'released' THEN
    v_op := 'release';
  ELSE
    RETURN NEW;
  END IF;

  v_reason := public.licence_block_reason(NEW.product_id, v_op);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_batch_records_licence_gate ON public.batch_records;
CREATE TRIGGER trg_batch_records_licence_gate
  BEFORE INSERT OR UPDATE ON public.batch_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_batch_records_licence_gate();


-- ── 14. Variations ───────────────────────────────────────────────────
--  A variation is a change to an approved registration — a new pack
--  size, a new API source, a moved manufacturing site. It is not an
--  edit to the licence row: it is its own regulatory record, filed,
--  reviewed and approved on its own timeline, and only then does it
--  change the parent registration.
CREATE TABLE IF NOT EXISTS public.licence_variations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  --  the parent registration
  licence_id     uuid NOT NULL REFERENCES public.regulatory_licences(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES public.products(id) ON DELETE SET NULL,

  reference      text,
  variation_class text NOT NULL,
  variation_type text NOT NULL,
  title          text NOT NULL,
  description    text NOT NULL DEFAULT '',
  justification  text,
  impact_assessment text,

  status         text NOT NULL DEFAULT 'draft',
  submitted_date date,
  decision_date  date,
  napams_reference text,
  --  set when the variation itself changes the registration's expiry
  resulting_expiry_date date,

  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT licence_variations_class_check
    CHECK (variation_class = ANY (ARRAY['minor','major'])),
  CONSTRAINT licence_variations_type_check
    CHECK (variation_type = ANY (ARRAY[
      -- minor by default
      'labelling_artwork','pack_size','shelf_life_extension',
      'minor_specification_change','administrative_change','name_change',
      -- major by default
      'formulation_change','manufacturing_site_change',
      'manufacturing_process_change','api_source_change',
      'indication_change','dosage_form_change','shelf_life_reduction'])),
  CONSTRAINT licence_variations_status_check
    CHECK (status = ANY (ARRAY[
      'draft','submitted','under_review','query_raised',
      'approved','implemented','rejected','withdrawn'])),
  CONSTRAINT licence_variations_title_not_blank CHECK (length(btrim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_licence_variations_licence
  ON public.licence_variations (licence_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_licence_variations_company_status
  ON public.licence_variations (company_id, status);

CREATE OR REPLACE FUNCTION public.fn_licence_variations_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_licence_variations_updated_at ON public.licence_variations;
CREATE TRIGGER trg_licence_variations_updated_at
  BEFORE UPDATE ON public.licence_variations
  FOR EACH ROW EXECUTE FUNCTION public.fn_licence_variations_updated_at();

ALTER TABLE public.licence_variations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view variations" ON public.licence_variations;
CREATE POLICY "Company members can view variations"
  ON public.licence_variations FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can raise variations" ON public.licence_variations;
CREATE POLICY "Company members can raise variations"
  ON public.licence_variations FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can edit variations" ON public.licence_variations;
CREATE POLICY "Company members can edit variations"
  ON public.licence_variations FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

DO $priv_var$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE TRUNCATE ON public.licence_variations FROM %I', r);
    END IF;
  END LOOP;
END
$priv_var$;

--  Classification is a regulatory judgement, but it is not a free one:
--  a site move or an API source change is a major variation whatever
--  the person filing it would prefer. Minor-by-default types may be
--  escalated to major; major-only types may not be downgraded.
CREATE OR REPLACE FUNCTION public.licence_variation_minimum_class(p_type text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN p_type = ANY (ARRAY[
    'formulation_change','manufacturing_site_change',
    'manufacturing_process_change','api_source_change',
    'indication_change','dosage_form_change','shelf_life_reduction'])
  THEN 'major' ELSE 'minor' END;
$$;

COMMENT ON FUNCTION public.licence_variation_minimum_class(text) IS
  'The lowest classification a variation type may be filed under. Types that always require prior approval return "major".';

CREATE OR REPLACE FUNCTION public.fn_licence_variations_class_gate()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF public.licence_variation_minimum_class(NEW.variation_type) = 'major'
     AND NEW.variation_class <> 'major' THEN
    RAISE EXCEPTION 'VARIATION_CLASS_TOO_LOW: "%" is a major variation and cannot be filed as minor',
      NEW.variation_type USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_licence_variations_class_gate ON public.licence_variations;
CREATE TRIGGER trg_licence_variations_class_gate
  BEFORE INSERT OR UPDATE ON public.licence_variations
  FOR EACH ROW EXECUTE FUNCTION public.fn_licence_variations_class_gate();


-- ── 15. The variation lifecycle ──────────────────────────────────────
DO $seed_var$
DECLARE
  v_def uuid;
  s_draft uuid; s_sub uuid; s_rev uuid; s_query uuid;
  s_appr uuid; s_impl uuid; s_rej uuid; s_wd uuid;
  v_from record;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type = 'licence_variation' AND company_id IS NULL;
  IF v_def IS NOT NULL THEN RETURN; END IF;   -- idempotent

  INSERT INTO public.lifecycle_definitions(company_id, entity_type, name, version, is_active)
  VALUES (NULL, 'licence_variation', 'Licence Variation Lifecycle', 1, true)
  RETURNING id INTO v_def;

  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'draft','Draft',0,true,false) RETURNING id INTO s_draft;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'submitted','Submitted',1,false,false) RETURNING id INTO s_sub;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'under_review','Under Review',2,false,false) RETURNING id INTO s_rev;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'query_raised','Query Raised',3,false,false) RETURNING id INTO s_query;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'approved','Approved',4,false,false) RETURNING id INTO s_appr;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'implemented','Implemented',5,false,true) RETURNING id INTO s_impl;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'rejected','Rejected',6,false,true) RETURNING id INTO s_rej;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'withdrawn','Withdrawn',7,false,true) RETURNING id INTO s_wd;

  INSERT INTO public.lifecycle_transitions
    (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
     required_role,required_permission,requires_comment,requires_signature)
  VALUES
    (v_def,s_draft,s_sub  ,'submit'      ,'Submit Variation'   ,0,NULL,NULL,false,false),
    (v_def,s_sub  ,s_rev  ,'begin_review','Begin Review'       ,1,NULL,NULL,false,false),
    (v_def,s_rev  ,s_query,'raise_query' ,'Raise Query'        ,2,NULL,NULL,true ,false),
    (v_def,s_query,s_rev  ,'answer_query','Answer Query'       ,3,NULL,NULL,true ,false),
    (v_def,s_rev  ,s_appr ,'approve'     ,'Approve Variation'  ,4,'admin,compliance_officer',NULL,true,false),
    (v_def,s_rev  ,s_rej  ,'reject'      ,'Reject Variation'   ,5,'admin,compliance_officer',NULL,true,false),
    (v_def,s_appr ,s_impl ,'implement'   ,'Record Implementation',6,'admin,compliance_officer',NULL,true,false);

  FOR v_from IN
    SELECT * FROM (VALUES
      (s_draft,'draft'), (s_sub,'submitted'),
      (s_rev,'under_review'), (s_query,'query_raised')
    ) AS t(state_id, state_key)
  LOOP
    INSERT INTO public.lifecycle_transitions
      (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
       required_role,required_permission,requires_comment,requires_signature)
    VALUES (v_def, v_from.state_id, s_wd, 'withdraw_from_'||v_from.state_key,
            'Withdraw', 20, 'admin,compliance_officer', NULL, true, false);
  END LOOP;
END
$seed_var$;

CREATE OR REPLACE FUNCTION public.fn_licence_variations_initialize_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.lifecycle_initialize('licence_variation', NEW.id, NEW.company_id, NEW.created_by, NULL);
  RETURN NULL;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'LIFECYCLE_ALREADY_INITIALIZED%' THEN RETURN NULL; END IF;
  RAISE;
END $$;

DROP TRIGGER IF EXISTS trg_licence_variations_initialize_lifecycle ON public.licence_variations;
CREATE TRIGGER trg_licence_variations_initialize_lifecycle
  AFTER INSERT ON public.licence_variations
  FOR EACH ROW EXECUTE FUNCTION public.fn_licence_variations_initialize_lifecycle();

CREATE OR REPLACE FUNCTION public.fn_licence_variations_sync_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_key text;
BEGIN
  IF NEW.entity_type <> 'licence_variation' THEN RETURN NULL; END IF;
  SELECT state_key INTO v_key FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_key IS NULL THEN RETURN NULL; END IF;

  PERFORM set_config('app.lifecycle_variation_sync','1',true);
  UPDATE public.licence_variations
     SET status = v_key,
         submitted_date = CASE WHEN v_key='submitted' THEN coalesce(submitted_date, current_date) ELSE submitted_date END,
         decision_date  = CASE WHEN v_key IN ('approved','rejected')
                               THEN coalesce(decision_date, current_date) ELSE decision_date END
   WHERE id = NEW.entity_id AND status IS DISTINCT FROM v_key;
  PERFORM set_config('app.lifecycle_variation_sync','',true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_licence_variations_sync_status ON public.entity_current_state;
CREATE TRIGGER trg_licence_variations_sync_status
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_licence_variations_sync_status();

CREATE OR REPLACE FUNCTION public.fn_licence_variations_guard_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('app.lifecycle_variation_sync', true),'') <> '1' THEN
    RAISE EXCEPTION 'VARIATION_STATUS_READ_ONLY: status is derived from the lifecycle engine; use lifecycle_transition() or the variation RPCs instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_licence_variations_guard_status ON public.licence_variations;
CREATE TRIGGER trg_licence_variations_guard_status
  BEFORE UPDATE ON public.licence_variations
  FOR EACH ROW EXECUTE FUNCTION public.fn_licence_variations_guard_status();

COMMENT ON COLUMN public.licence_variations.status IS
  'DERIVED read model. Maintained by fn_licence_variations_sync_status() from entity_current_state; direct writes are rejected.';


-- ── 16. What "major" actually costs you ──────────────────────────────
--  The classification has to mean something or it is decoration. A
--  major variation cannot be approved on a bare comment: it needs the
--  justification and the impact assessment that a regulator would ask
--  for. A minor one does not.
CREATE OR REPLACE FUNCTION public.licence_variation_approve(
  p_variation_id uuid,
  p_comment      text,
  p_resulting_expiry_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v record; v_missing text[] := ARRAY[]::text[]; r jsonb;
BEGIN
  SELECT * INTO v FROM public.licence_variations WHERE id = p_variation_id;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'VARIATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v.company_id) THEN
    RAISE EXCEPTION 'LICENCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  IF v.variation_class = 'major' THEN
    --  The ::text casts matter: `text[] || 'literal'` makes PostgreSQL
    --  read the literal as an array and fail on the first word.
    IF coalesce(btrim(v.justification),'') = '' THEN
      v_missing := v_missing || 'justification'::text;
    END IF;
    IF coalesce(btrim(v.impact_assessment),'') = '' THEN
      v_missing := v_missing || 'impact assessment'::text;
    END IF;
    IF array_length(v_missing,1) IS NOT NULL THEN
      RAISE EXCEPTION 'VARIATION_MAJOR_INCOMPLETE: a major variation cannot be approved without: %',
        array_to_string(v_missing, '; ') USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_resulting_expiry_date IS NOT NULL THEN
    UPDATE public.licence_variations
       SET resulting_expiry_date = p_resulting_expiry_date
     WHERE id = v.id;
  END IF;

  r := public.lifecycle_transition('licence_variation', v.id, 'approve',
         v.company_id, NULL, p_comment,
         jsonb_build_object('variation_class', v.variation_class,
                            'variation_type', v.variation_type,
                            'licence_id', v.licence_id));

  PERFORM public.licence_audit_step(v.company_id, 'licence_variation.approved',
    'licence_variation', v.id,
    jsonb_build_object('licence_id', v.licence_id,
                       'variation_class', v.variation_class,
                       'variation_type', v.variation_type,
                       'resulting_expiry_date', p_resulting_expiry_date));

  RETURN jsonb_build_object('variation_id', v.id, 'transition', r);
END $$;

REVOKE ALL ON FUNCTION public.licence_variation_approve(uuid,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_variation_approve(uuid,text,date) TO authenticated, service_role;

--  Implementation is where the variation finally touches the parent
--  registration. Doing it at approval would let a regulator's decision
--  change the certificate before the company had actually made the
--  change on the ground.
CREATE OR REPLACE FUNCTION public.licence_variation_implement(
  p_variation_id uuid,
  p_comment      text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v record; r jsonb; v_expiry_applied boolean := false;
BEGIN
  SELECT * INTO v FROM public.licence_variations WHERE id = p_variation_id;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'VARIATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v.company_id) THEN
    RAISE EXCEPTION 'LICENCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  r := public.lifecycle_transition('licence_variation', v.id, 'implement',
         v.company_id, NULL, p_comment,
         jsonb_build_object('licence_id', v.licence_id));

  IF v.resulting_expiry_date IS NOT NULL THEN
    UPDATE public.regulatory_licences
       SET expiry_date = v.resulting_expiry_date
     WHERE id = v.licence_id;
    UPDATE public.products
       SET registration_expiry_date = v.resulting_expiry_date
     WHERE id = v.product_id;
    v_expiry_applied := true;
  END IF;

  PERFORM public.licence_audit_step(v.company_id, 'licence_variation.implemented',
    'licence_variation', v.id,
    jsonb_build_object('licence_id', v.licence_id,
                       'expiry_applied', v_expiry_applied,
                       'resulting_expiry_date', v.resulting_expiry_date));

  RETURN jsonb_build_object('variation_id', v.id, 'transition', r,
                            'expiry_applied', v_expiry_applied);
END $$;

REVOKE ALL ON FUNCTION public.licence_variation_implement(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_variation_implement(uuid,text) TO authenticated, service_role;


-- ── 17. Renewal completion opens the next cycle ──────────────────────
--  Completing a renewal does not edit the old certificate's expiry: the
--  old licence closes as `renewed` and a new record carries the new
--  registration. That is what makes the history legible three years
--  later — you can still see what was valid when a batch was released.
CREATE OR REPLACE FUNCTION public.licence_complete_renewal(
  p_licence_id          uuid,
  p_new_registration_number text,
  p_new_expiry_date     date,
  p_comment             text,
  p_new_issue_date      date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE l record; v_new uuid; r jsonb; v_cascade jsonb;
BEGIN
  SELECT * INTO l FROM public.regulatory_licences WHERE id = p_licence_id;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'LICENCE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(l.company_id) THEN
    RAISE EXCEPTION 'LICENCE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.regulatory_licences
    (company_id, licence_type, name, product_name, registration_number,
     regulatory_body, issue_date, expiry_date, renewal_lead_days,
     submission_id, product_id, notes, created_by)
  VALUES
    (l.company_id, l.licence_type, l.name, l.product_name, NULL,
     l.regulatory_body, p_new_issue_date, NULL, l.renewal_lead_days,
     l.submission_id, l.product_id,
     format('Renewal of %s', coalesce(l.registration_number, l.name)), auth.uid())
  RETURNING id INTO v_new;

  --  Close the old certificate FIRST. The cascade below regenerates the
  --  company's alerts, and a licence still sitting in
  --  renewal_in_progress would be alerted on all over again for an
  --  expiry that has just been superseded.
  r := public.lifecycle_transition('regulatory_licence', l.id, 'complete_renewal',
         l.company_id, NULL, p_comment,
         jsonb_build_object('superseded_by', v_new,
                            'new_registration_number', btrim(p_new_registration_number)));

  UPDATE public.regulatory_licences
     SET superseded_by_licence_id = v_new
   WHERE id = l.id;

  --  The new certificate goes through the same cascade as any other
  --  grant, so the product, production and the next renewal schedule
  --  are all handled by one code path.
  v_cascade := public.licence_record_approval(
    v_new, p_new_registration_number, p_new_expiry_date, p_new_issue_date, true);

  RETURN jsonb_build_object('previous_licence_id', l.id, 'new_licence_id', v_new,
                            'transition', r, 'cascade', v_cascade);
END $$;

COMMENT ON FUNCTION public.licence_complete_renewal(uuid,text,date,text,date) IS
  'Closes a licence as renewed and creates its successor, running the full approval cascade on the new certificate. The superseded record keeps its own expiry so historical batch releases stay explicable.';

REVOKE ALL ON FUNCTION public.licence_complete_renewal(uuid,text,date,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_complete_renewal(uuid,text,date,text,date) TO authenticated, service_role;


-- ── 18. Reporting ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.licence_renewal_dashboard(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN NOT (public.app_is_service_context()
                        OR public.app_is_company_member(p_company_id))
              THEN NULL::jsonb ELSE jsonb_build_object(
    'company_id', p_company_id,
    'milestones', to_jsonb(public.licence_alert_milestones(p_company_id)),
    'open_alerts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'alert_id', a.id, 'licence_id', a.licence_id, 'licence_name', l.name,
               'registration_number', l.registration_number,
               'milestone_months', a.milestone_months,
               'expiry_date', a.renewal_cycle_expiry,
               'renewal_status', l.status,
               'raised_at', a.raised_at)
             ORDER BY a.renewal_cycle_expiry, a.milestone_months)
        FROM public.licence_renewal_alerts a
        JOIN public.regulatory_licences l ON l.id = a.licence_id
       WHERE a.company_id = p_company_id AND a.acknowledged_at IS NULL), '[]'::jsonb),
    'open_steps', coalesce((
      SELECT count(*) FROM public.licence_renewal_steps s
       WHERE s.company_id = p_company_id AND NOT s.is_completed), 0),
    'overdue_steps', coalesce((
      SELECT count(*) FROM public.licence_renewal_steps s
       WHERE s.company_id = p_company_id AND NOT s.is_completed
         AND s.deadline < current_date), 0),
    'expired_licences', coalesce((
      SELECT count(*) FROM public.regulatory_licences l
       WHERE l.company_id = p_company_id AND l.status = 'expired'), 0),
    'open_variations', coalesce((
      SELECT count(*) FROM public.licence_variations v
       WHERE v.company_id = p_company_id
         AND v.status NOT IN ('implemented','rejected','withdrawn')), 0)) END;
$$;

REVOKE ALL ON FUNCTION public.licence_renewal_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licence_renewal_dashboard(uuid) TO authenticated, service_role;


-- ── 19. Carried over: a D05 gap the integration pass found ───────────
--  product_is_release_eligible() belongs to the product registry
--  (20260918000000), not here. It is fixed in this migration rather
--  than by editing that one because this is where the defect was
--  found — the D04/D05/D06 integration pass — and rewriting an earlier
--  migration would hide when it was known.
--
--  The function is SECURITY DEFINER, granted to `authenticated`, and
--  takes a product id. RLS therefore does not apply inside it, so any
--  signed-in user could ask whether another tenant's product was on the
--  market. It returns only a boolean, but that boolean is somebody
--  else's commercial state.
--
--  The batch gate calls this from a SECURITY DEFINER trigger on behalf
--  of a member of the owning company, so the added check is satisfied on
--  the path that matters.
CREATE OR REPLACE FUNCTION public.product_is_release_eligible(p_product_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.products WHERE id = p_product_id;
  IF v_company IS NULL THEN RETURN false; END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'PRODUCT_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.products p
     WHERE p.id = p_product_id
       AND p.status IN ('registered','active')
       AND (p.registration_expiry_date IS NULL
            OR p.registration_expiry_date >= current_date));
END $$;

COMMENT ON FUNCTION public.product_is_release_eligible(uuid) IS
  'True when a product may progress into regulated operations: lifecycle state registered or active, and registration not expired. Refuses callers outside the owning company — SECURITY DEFINER means RLS does not apply inside it.';

REVOKE ALL ON FUNCTION public.product_is_release_eligible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_is_release_eligible(uuid) TO authenticated, service_role;


-- ── 20. The product's registration facts follow its licences ─────────
--  Also found by the integration pass, and the more serious of the two.
--
--  products.registration_expiry_date is a denormalised copy of the
--  governing certificate's expiry, written by the approval cascade. Up
--  to here NOTHING wrote it again. So when a licence lapsed, the
--  product went on claiming a registration that had expired:
--
--    * the product detail view showed "Registered, expires <old date>"
--      after the certificate had already gone;
--    * product_is_release_eligible() answered true, so D05's batch gate
--      was not the independent second control it looks like — it only
--      appeared to hold because D06's licence gate fired first.
--
--  The fix keeps the copy honest: whenever a licence's status, expiry
--  or product link changes, the linked product's expiry is recomputed
--  as the latest expiry among that product's live certificates. Draft,
--  discontinued and superseded certificates do not count — a draft has
--  not been granted and a superseded one has been replaced.
--
--  Note it recomputes rather than assigns: a product with two licences
--  keeps the later expiry when only one of them lapses.
CREATE OR REPLACE FUNCTION public.product_refresh_registration_expiry(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_expiry date;
BEGIN
  IF p_product_id IS NULL THEN RETURN; END IF;

  SELECT max(l.expiry_date) INTO v_expiry
    FROM public.regulatory_licences l
   WHERE l.product_id = p_product_id
     AND l.status NOT IN ('draft','discontinued','renewed');

  --  No live certificate at all leaves the column alone rather than
  --  nulling it: NULL means "no expiry constraint" to
  --  product_is_release_eligible(), which would be the opposite of what
  --  losing every licence should mean.
  IF v_expiry IS NULL THEN RETURN; END IF;

  UPDATE public.products
     SET registration_expiry_date = v_expiry
   WHERE id = p_product_id
     AND registration_expiry_date IS DISTINCT FROM v_expiry;
END $$;

REVOKE ALL ON FUNCTION public.product_refresh_registration_expiry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_refresh_registration_expiry(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_reg_licences_refresh_product()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  --  Both sides, so moving a licence from one product to another leaves
  --  neither holding a stale figure.
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    PERFORM public.product_refresh_registration_expiry(OLD.product_id);
  END IF;
  PERFORM public.product_refresh_registration_expiry(NEW.product_id);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_reg_licences_refresh_product ON public.regulatory_licences;
CREATE TRIGGER trg_reg_licences_refresh_product
  AFTER INSERT OR UPDATE OF status, expiry_date, product_id ON public.regulatory_licences
  FOR EACH ROW EXECUTE FUNCTION public.fn_reg_licences_refresh_product();

--  Bring existing rows into line once, so the column is trustworthy
--  from the moment this migration lands rather than only after the next
--  licence movement.
DO $bf_prod$
DECLARE p uuid;
BEGIN
  FOR p IN SELECT DISTINCT product_id FROM public.regulatory_licences
            WHERE product_id IS NOT NULL LOOP
    PERFORM public.product_refresh_registration_expiry(p);
  END LOOP;
END
$bf_prod$;
