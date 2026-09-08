-- =====================================================================
--  SUBMISSION STATUS HANDLING  (Week 2, Deliverable 04)
-- =====================================================================
--  regulatory_submissions.current_status has been a free text column
--  with a CHECK list, moved by whatever wrote to it. This brings it into
--  the Week 1 lifecycle engine, on the same terms as change_control,
--  capa_record, sop_document and product: the engine is authoritative,
--  current_status becomes a derived mirror, and a direct write is
--  refused.
--
--  THE DIRECTIVE PROBLEM, AND WHY A COLUMN WAS NOT ENOUGH
--  ------------------------------------------------------
--  A NAFDAC compliance directive interrupts a review at whatever stage
--  it happens to be at, and when the applicant responds the application
--  must go back to THAT stage — not to Submitted, and never to Draft.
--  A status column cannot express this: once you overwrite
--  `lab_testing` with `compliance_directive`, the stage to return to is
--  gone. So the originating stage is recorded on the directive itself,
--  and the response reads it back.
--
--  That is also what makes the two clocks separable. Time spent waiting
--  on the applicant is bounded by the directive's own received/responded
--  timestamps; active review time is everything else.
--
--  REGULATORS
--  ----------
--  PCN is added to the submission/licence regulator vocabulary. MDCN and
--  NMCN are NOT removed from anywhere, because they are not in that
--  vocabulary — in this codebase they are professional-ethics rule
--  content (src/lib/rules/professionalEthics.ts, used by the advertising
--  compliance engine). Deleting them would break content review, which
--  is not what "correct the regulator seed data" asks for.
-- =====================================================================


-- ── 1. Vocabulary ────────────────────────────────────────────────────
ALTER TABLE public.regulatory_submissions
  DROP CONSTRAINT IF EXISTS regulatory_submissions_regulatory_body_check;
ALTER TABLE public.regulatory_submissions
  ADD CONSTRAINT regulatory_submissions_regulatory_body_check
  CHECK (regulatory_body = ANY (ARRAY[
    'nafdac','son','nafdac_son','ministry_of_health','pcn']));

ALTER TABLE public.regulatory_submissions
  DROP CONSTRAINT IF EXISTS regulatory_submissions_current_status_check;
ALTER TABLE public.regulatory_submissions
  ADD CONSTRAINT regulatory_submissions_current_status_check
  CHECK (current_status = ANY (ARRAY[
    'draft','submitted','division_review','inspection_scheduled',
    'inspection_completed','lab_testing','fdrc_committee',
    'compliance_directive','awaiting_applicant_response',
    'approved','rejected','withdrawn']));

--  CTD screening query: the dossier equivalent of a directive, raised
--  during screening and blocking clearance until answered.
ALTER TABLE public.ctd_dossiers DROP CONSTRAINT IF EXISTS ctd_dossiers_status_check;
ALTER TABLE public.ctd_dossiers
  ADD CONSTRAINT ctd_dossiers_status_check
  CHECK (status = ANY (ARRAY[
    'preparation','screening','screening_query','screening_cleared',
    'under_review','approved','rejected','withdrawn']));


-- ── 2. The submission lifecycle ──────────────────────────────────────
DO $seed$
DECLARE
  v_def uuid;
  s_draft uuid; s_sub uuid; s_div uuid; s_insp_s uuid; s_insp_c uuid;
  s_lab uuid; s_fdrc uuid; s_dir uuid; s_await uuid;
  s_appr uuid; s_rej uuid; s_wd uuid;
  v_stage record;
BEGIN
  SELECT id INTO v_def FROM public.lifecycle_definitions
   WHERE entity_type='regulatory_submission' AND company_id IS NULL;
  IF v_def IS NOT NULL THEN RETURN; END IF;   -- idempotent

  INSERT INTO public.lifecycle_definitions(company_id,entity_type,name,version,is_active)
  VALUES (NULL,'regulatory_submission','NAPAMS Submission Lifecycle',1,true)
  RETURNING id INTO v_def;

  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal) VALUES
    (v_def,'draft','Draft',0,true,false) RETURNING id INTO s_draft;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'submitted','Submitted to NAPAMS',1,false,false) RETURNING id INTO s_sub;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'division_review','Division Review',2,false,false) RETURNING id INTO s_div;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'inspection_scheduled','Inspection Scheduled',3,false,false) RETURNING id INTO s_insp_s;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'inspection_completed','Inspection Completed',4,false,false) RETURNING id INTO s_insp_c;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'lab_testing','Lab Testing',5,false,false) RETURNING id INTO s_lab;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'fdrc_committee','FDRC Committee',6,false,false) RETURNING id INTO s_fdrc;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'compliance_directive','Compliance Directive',7,false,false) RETURNING id INTO s_dir;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'awaiting_applicant_response','Awaiting Applicant Response',8,false,false) RETURNING id INTO s_await;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'approved','Approved',9,false,true) RETURNING id INTO s_appr;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'rejected','Rejected',10,false,true) RETURNING id INTO s_rej;
  INSERT INTO public.lifecycle_states(definition_id,state_key,label,sort_order,is_initial,is_terminal)
  VALUES (v_def,'withdrawn','Withdrawn',11,false,true) RETURNING id INTO s_wd;

  -- the forward path
  INSERT INTO public.lifecycle_transitions
    (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
     required_role,required_permission,requires_comment,requires_signature)
  VALUES
    (v_def,s_draft  ,s_sub   ,'submit'              ,'Submit to NAPAMS'     ,0,NULL,NULL,false,false),
    (v_def,s_sub    ,s_div   ,'begin_division_review','Begin Division Review',1,NULL,NULL,false,false),
    (v_def,s_div    ,s_insp_s,'schedule_inspection' ,'Schedule Inspection'  ,2,NULL,NULL,false,false),
    (v_def,s_insp_s ,s_insp_c,'complete_inspection' ,'Complete Inspection'  ,3,NULL,NULL,false,false),
    (v_def,s_insp_c ,s_lab   ,'begin_lab_testing'   ,'Begin Lab Testing'    ,4,NULL,NULL,false,false),
    (v_def,s_lab    ,s_fdrc  ,'refer_to_fdrc'       ,'Refer to FDRC'        ,5,NULL,NULL,false,false),
    (v_def,s_fdrc   ,s_appr  ,'approve'             ,'Approve'              ,6,'admin,compliance_officer',NULL,true,false),
    (v_def,s_fdrc   ,s_rej   ,'reject'              ,'Reject'               ,7,'admin,compliance_officer',NULL,true,false);

  --  A directive can interrupt any active review stage. Draft is NOT a
  --  source: a directive is something the regulator raises against a
  --  submitted application.
  FOR v_stage IN
    SELECT * FROM (VALUES
      (s_sub,'submitted'), (s_div,'division_review'),
      (s_insp_s,'inspection_scheduled'), (s_insp_c,'inspection_completed'),
      (s_lab,'lab_testing'), (s_fdrc,'fdrc_committee')
    ) AS t(state_id, state_key)
  LOOP
    INSERT INTO public.lifecycle_transitions
      (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
       required_role,required_permission,requires_comment,requires_signature)
    VALUES (v_def, v_stage.state_id, s_dir,
            'raise_directive_from_'||v_stage.state_key,
            'Record Compliance Directive', 20, NULL, NULL, true, false);

    --  …and the return path, one action per originating stage. There is
    --  deliberately NO generic "resume" action: the only way back is via
    --  the stage the directive recorded, which is what stops an
    --  application silently landing on Submitted.
    INSERT INTO public.lifecycle_transitions
      (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
       required_role,required_permission,requires_comment,requires_signature)
    VALUES (v_def, s_await, v_stage.state_id,
            'resume_'||v_stage.state_key,
            'Resume ' || v_stage.state_key, 40, NULL, NULL, false, false);
  END LOOP;

  --  directive -> awaiting response, once the directive has been passed
  --  to the applicant
  INSERT INTO public.lifecycle_transitions
    (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
     required_role,required_permission,requires_comment,requires_signature)
  VALUES (v_def, s_dir, s_await, 'await_applicant_response',
          'Await Applicant Response', 30, NULL, NULL, false, false);

  -- withdrawal is always available from the live stages
  FOR v_stage IN
    SELECT * FROM (VALUES
      (s_draft,'draft'), (s_sub,'submitted'), (s_div,'division_review'),
      (s_insp_s,'inspection_scheduled'), (s_insp_c,'inspection_completed'),
      (s_lab,'lab_testing'), (s_fdrc,'fdrc_committee'),
      (s_dir,'compliance_directive'), (s_await,'awaiting_applicant_response')
    ) AS t(state_id, state_key)
  LOOP
    INSERT INTO public.lifecycle_transitions
      (definition_id,from_state_id,to_state_id,action_key,label,sort_order,
       required_role,required_permission,requires_comment,requires_signature)
    VALUES (v_def, v_stage.state_id, s_wd, 'withdraw_from_'||v_stage.state_key,
            'Withdraw', 90, 'admin,compliance_officer', NULL, true, false);
  END LOOP;
END
$seed$;


-- ── 3. Directives ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.submission_directives (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  submission_id   uuid NOT NULL REFERENCES public.regulatory_submissions(id) ON DELETE CASCADE,

  --  the whole point of the table: where to go back to
  originating_state_key text NOT NULL,

  content         text NOT NULL,
  date_received   date NOT NULL,
  response_deadline date,

  responded_at    timestamptz,
  response_notes  text,
  resolved_to_state_key text,

  raised_by       uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT submission_directives_content_not_blank CHECK (length(btrim(content)) > 0),
  --  a directive cannot originate in draft, or in one of the states that
  --  IS the directive handling
  CONSTRAINT submission_directives_origin_check CHECK (originating_state_key = ANY (ARRAY[
    'submitted','division_review','inspection_scheduled',
    'inspection_completed','lab_testing','fdrc_committee'])),
  CONSTRAINT submission_directives_deadline_check CHECK (
    response_deadline IS NULL OR response_deadline >= date_received)
);

CREATE INDEX IF NOT EXISTS idx_submission_directives_submission
  ON public.submission_directives(submission_id, date_received DESC);
--  at most one unanswered directive per submission
CREATE UNIQUE INDEX IF NOT EXISTS submission_directives_one_open
  ON public.submission_directives(submission_id) WHERE responded_at IS NULL;

ALTER TABLE public.submission_directives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view directives" ON public.submission_directives;
CREATE POLICY "Company members can view directives"
  ON public.submission_directives FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

--  Writes go through the RPCs below, which keep the directive and the
--  lifecycle move in one transaction. Direct writes are revoked so the
--  two cannot drift apart.
DO $priv$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.submission_directives FROM %I', r);
    END IF;
  END LOOP;
END
$priv$;


-- ── 4. current_status becomes a derived mirror ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_reg_submissions_initialize_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.lifecycle_initialize('regulatory_submission', NEW.id, NEW.company_id, NEW.created_by, NULL);
  RETURN NULL;
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'LIFECYCLE_ALREADY_INITIALIZED%' THEN RETURN NULL; END IF;
  RAISE;
END $$;

DROP TRIGGER IF EXISTS trg_reg_submissions_initialize_lifecycle ON public.regulatory_submissions;
CREATE TRIGGER trg_reg_submissions_initialize_lifecycle
  AFTER INSERT ON public.regulatory_submissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_reg_submissions_initialize_lifecycle();

CREATE OR REPLACE FUNCTION public.fn_reg_submissions_sync_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_key text;
BEGIN
  IF NEW.entity_type <> 'regulatory_submission' THEN RETURN NULL; END IF;
  SELECT state_key INTO v_key FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_key IS NULL THEN RETURN NULL; END IF;

  PERFORM set_config('app.lifecycle_submission_sync','1',true);
  UPDATE public.regulatory_submissions
     SET current_status = v_key,
         submitted_date = CASE WHEN v_key='submitted' THEN coalesce(submitted_date, current_date) ELSE submitted_date END,
         approved_date  = CASE WHEN v_key='approved'  THEN coalesce(approved_date,  current_date) ELSE approved_date  END
   WHERE id = NEW.entity_id AND current_status IS DISTINCT FROM v_key;
  PERFORM set_config('app.lifecycle_submission_sync','',true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_reg_submissions_sync_status ON public.entity_current_state;
CREATE TRIGGER trg_reg_submissions_sync_status
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_reg_submissions_sync_status();

CREATE OR REPLACE FUNCTION public.fn_reg_submissions_guard_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF NEW.current_status IS DISTINCT FROM OLD.current_status
     AND coalesce(current_setting('app.lifecycle_submission_sync', true),'') <> '1' THEN
    RAISE EXCEPTION 'SUBMISSION_STATUS_READ_ONLY: current_status is derived from the lifecycle engine; use the submission RPCs instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reg_submissions_guard_status ON public.regulatory_submissions;
CREATE TRIGGER trg_reg_submissions_guard_status
  BEFORE UPDATE ON public.regulatory_submissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_reg_submissions_guard_status();

COMMENT ON COLUMN public.regulatory_submissions.current_status IS
  'DERIVED read model. Maintained by fn_reg_submissions_sync_status() from entity_current_state; direct writes are rejected.';

--  Backfill: every existing submission gets a lifecycle row at the
--  status it is already in, so nothing changes state because this ran.
INSERT INTO public.entity_current_state
  (company_id, definition_id, entity_type, entity_id, state_id, entered_at, entered_by, updated_at)
SELECT s.company_id,
       (SELECT id FROM public.lifecycle_definitions WHERE entity_type='regulatory_submission' AND company_id IS NULL),
       'regulatory_submission', s.id, st.id,
       coalesce(s.created_at, now()), s.created_by, now()
  FROM public.regulatory_submissions s
  JOIN public.lifecycle_states st
    ON st.definition_id = (SELECT id FROM public.lifecycle_definitions WHERE entity_type='regulatory_submission' AND company_id IS NULL)
   AND st.state_key = s.current_status
ON CONFLICT (definition_id, entity_id) DO NOTHING;

INSERT INTO public.entity_state_history
  (company_id, definition_id, entity_type, entity_id, from_state_id, to_state_id,
   transition_id, actor_id, comment, metadata, created_at)
SELECT ecs.company_id, ecs.definition_id, 'regulatory_submission', ecs.entity_id,
       NULL, ecs.state_id, NULL, ecs.entered_by,
       'Backfilled from regulatory_submissions.current_status',
       jsonb_build_object('reason','backfill_d04'), ecs.entered_at
  FROM public.entity_current_state ecs
 WHERE ecs.entity_type='regulatory_submission'
   AND NOT EXISTS (SELECT 1 FROM public.entity_state_history h
                    WHERE h.entity_type='regulatory_submission' AND h.entity_id = ecs.entity_id);


-- ── 5. Raising and answering a directive ─────────────────────────────
CREATE OR REPLACE FUNCTION public.submission_raise_directive(
  p_submission_id uuid,
  p_content       text,
  p_date_received date DEFAULT current_date,
  p_response_deadline date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid; v_stage text; v_uid uuid := auth.uid(); v_id uuid; r jsonb;
BEGIN
  SELECT company_id, current_status INTO v_company, v_stage
    FROM public.regulatory_submissions WHERE id = p_submission_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'SUBMISSION_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'SUBMISSION_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;
  IF coalesce(btrim(p_content),'') = '' THEN
    RAISE EXCEPTION 'DIRECTIVE_CONTENT_REQUIRED: a directive must record what the regulator asked for'
      USING ERRCODE='P0001';
  END IF;

  --  Record the originating stage BEFORE the move, because after it the
  --  stage is gone. This is the line the whole deliverable turns on.
  INSERT INTO public.submission_directives
    (company_id, submission_id, originating_state_key, content,
     date_received, response_deadline, raised_by)
  VALUES (v_company, p_submission_id, v_stage, btrim(p_content),
          p_date_received, p_response_deadline, v_uid)
  RETURNING id INTO v_id;

  r := public.lifecycle_transition('regulatory_submission', p_submission_id,
         'raise_directive_from_'||v_stage, v_company, NULL,
         left(btrim(p_content), 500),
         jsonb_build_object('directive_id', v_id, 'originating_state', v_stage));

  RETURN jsonb_build_object('directive_id', v_id, 'originating_state', v_stage,
                            'transition', r);
END $$;

CREATE OR REPLACE FUNCTION public.submission_respond_to_directive(
  p_directive_id  uuid,
  p_response_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE d record; r jsonb; v_status text;
BEGIN
  SELECT * INTO d FROM public.submission_directives WHERE id = p_directive_id;
  IF d.id IS NULL THEN
    RAISE EXCEPTION 'DIRECTIVE_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_company_member(d.company_id) THEN
    RAISE EXCEPTION 'SUBMISSION_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;
  IF d.responded_at IS NOT NULL THEN
    RAISE EXCEPTION 'DIRECTIVE_ALREADY_ANSWERED: this directive was answered on %', d.responded_at
      USING ERRCODE='P0001';
  END IF;

  SELECT current_status INTO v_status FROM public.regulatory_submissions WHERE id = d.submission_id;
  IF v_status <> 'awaiting_applicant_response' THEN
    RAISE EXCEPTION 'DIRECTIVE_NOT_AWAITING: the submission is "%", not awaiting an applicant response', v_status
      USING ERRCODE='P0001';
  END IF;

  --  Restores the RECORDED stage. There is no fallback and no default —
  --  if the recorded stage has no resume action the engine refuses,
  --  which is correct: silently landing on Submitted is the failure this
  --  deliverable exists to prevent.
  r := public.lifecycle_transition('regulatory_submission', d.submission_id,
         'resume_'||d.originating_state_key, d.company_id, NULL,
         coalesce(nullif(btrim(coalesce(p_response_notes,'')),''), 'Applicant responded to directive'),
         jsonb_build_object('directive_id', d.id, 'restored_state', d.originating_state_key));

  UPDATE public.submission_directives
     SET responded_at = now(),
         response_notes = nullif(btrim(coalesce(p_response_notes,'')),''),
         resolved_to_state_key = d.originating_state_key
   WHERE id = d.id;

  RETURN jsonb_build_object('directive_id', d.id,
                            'restored_state', d.originating_state_key,
                            'transition', r);
END $$;

REVOKE ALL ON FUNCTION public.submission_raise_directive(uuid,text,date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submission_respond_to_directive(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submission_raise_directive(uuid,text,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submission_respond_to_directive(uuid,text) TO authenticated;


-- ── 6. Two clocks ────────────────────────────────────────────────────
--  Directive time is time the regulator was waiting on the applicant.
--  Active review time is everything since submission that was not that.
--  Reporting them as one number makes a regulator's turnaround look
--  worse than it is, and hides a slow applicant.
CREATE OR REPLACE FUNCTION public.submission_time_breakdown(p_submission_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH s AS (
    SELECT submitted_date, current_status FROM public.regulatory_submissions WHERE id = p_submission_id
  ), d AS (
    SELECT coalesce(sum(
             GREATEST(0, (coalesce(responded_at::date, current_date) - date_received))
           ), 0) AS directive_days,
           count(*) FILTER (WHERE responded_at IS NULL) AS open_directives,
           count(*) AS total_directives
      FROM public.submission_directives WHERE submission_id = p_submission_id
  )
  SELECT jsonb_build_object(
    'total_days',        CASE WHEN s.submitted_date IS NULL THEN 0
                              ELSE current_date - s.submitted_date END,
    'directive_days',    d.directive_days,
    'active_review_days',GREATEST(0, CASE WHEN s.submitted_date IS NULL THEN 0
                              ELSE current_date - s.submitted_date END - d.directive_days),
    'open_directives',   d.open_directives,
    'total_directives',  d.total_directives,
    'current_status',    s.current_status)
  FROM s, d;
$$;

REVOKE ALL ON FUNCTION public.submission_time_breakdown(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submission_time_breakdown(uuid) TO authenticated, service_role;


-- ── 7. Completeness, counted over pre-submission items only ──────────
--  document_checklist is a jsonb map of {name -> {is_present, ...}}.
--  The phase lives alongside it so the database can answer "is this
--  submittable" without the client being trusted to filter correctly.
ALTER TABLE public.regulatory_submissions
  ADD COLUMN IF NOT EXISTS checklist_phases jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.regulatory_submissions.checklist_phases IS
  'Map of checklist item name -> "pre" | "post". Written from the checklist definition at creation. Completeness gating counts only "pre" items; "post" items are required after submission and must not block it.';

CREATE OR REPLACE FUNCTION public.submission_missing_documents(p_submission_id uuid)
RETURNS TABLE (name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT k AS name
    FROM public.regulatory_submissions s,
         LATERAL jsonb_each(s.document_checklist) AS e(k, v)
   WHERE s.id = p_submission_id
     -- only pre-submission items gate the submit
     AND coalesce(s.checklist_phases ->> k, 'pre') = 'pre'
     AND coalesce((v ->> 'is_present')::boolean, false) = false
   ORDER BY k;
$$;

REVOKE ALL ON FUNCTION public.submission_missing_documents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submission_missing_documents(uuid) TO authenticated, service_role;

--  The submit gate. It NAMES every missing document rather than saying
--  "incomplete", because a list of one is actionable and a bare refusal
--  is not.
CREATE OR REPLACE FUNCTION public.fn_reg_submissions_submit_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_missing text[];
BEGIN
  IF NEW.entity_type <> 'regulatory_submission' THEN RETURN NULL; END IF;
  IF (SELECT state_key FROM public.lifecycle_states WHERE id = NEW.state_id) <> 'submitted' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND (SELECT state_key FROM public.lifecycle_states WHERE id = OLD.state_id) <> 'draft' THEN
    -- only the draft -> submitted move is gated; returning from a
    -- directive must not be blocked by post-submission paperwork
    RETURN NULL;
  END IF;

  SELECT array_agg(name ORDER BY name) INTO v_missing
    FROM public.submission_missing_documents(NEW.entity_id);

  IF v_missing IS NOT NULL AND array_length(v_missing,1) > 0 THEN
    RAISE EXCEPTION 'SUBMISSION_INCOMPLETE: % pre-submission document(s) missing: %',
      array_length(v_missing,1), array_to_string(v_missing, '; ')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_reg_submissions_submit_gate ON public.entity_current_state;
CREATE TRIGGER trg_reg_submissions_submit_gate
  AFTER INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_reg_submissions_submit_gate();
