-- =====================================================================
--  Week 5 · item 03 — CAPA link and root cause
-- =====================================================================
--  "A CAPA can be linked to a batch and flagged systemic or not.
--   Release gating needs both to tell a blocking CAPA from a warning."
--
--  That sentence is the whole reason for the two columns below. Item 05
--  draws its line here:
--
--    open SYSTEMIC CAPA affecting the batch   → hard block
--    open CAPA not affecting this batch       → warning
--
--  So "affecting the batch" and "systemic" both have to be facts the
--  database holds, not judgements a screen makes.
--
--  WHAT THIS DOES NOT DO. It does not touch capa_records.status. That
--  column is a DERIVED read model kept in sync by the lifecycle
--  adoption in 20260912000000 — the engine owns CAPA state, and writing
--  status directly is already rejected. Nothing here writes it, reads
--  it as authority, or adds a second status.
--
--  "Existing CAPAs lose history in the migration" is a NOT DONE IF, so
--  every column added here is nullable or defaulted and no existing row
--  is rewritten, re-keyed or re-stated. An existing CAPA is simply a
--  CAPA with no batch and is_systemic false, which is what it has always
--  meant.
-- =====================================================================

-- ── 1. The two facts release gating reads ────────────────────────────
ALTER TABLE public.capa_records
  --  "A CAPA can be linked to a batch". Nullable: most CAPAs are not
  --  about one batch, and forcing a batch would make the column a lie
  --  for every audit-finding CAPA already on file.
  ADD COLUMN IF NOT EXISTS batch_id uuid,

  --  "Systemic is a free-text field" is a NOT DONE IF. A boolean, NOT
  --  NULL, defaulted false. False is the safe default: a CAPA nobody
  --  has assessed as systemic is not treated as one, and the gate
  --  degrades to a warning rather than silently blocking every release
  --  in the company.
  ADD COLUMN IF NOT EXISTS is_systemic boolean NOT NULL DEFAULT false,

  --  Which deviation this came out of, when it came out of one. Item 06
  --  sets it too, from the rejection sequence.
  ADD COLUMN IF NOT EXISTS source_deviation_id uuid;

DO $fks$
BEGIN
  IF to_regclass('public.batch_records') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='capa_records_batch_id_fkey') THEN
    ALTER TABLE public.capa_records
      ADD CONSTRAINT capa_records_batch_id_fkey
      FOREIGN KEY (batch_id) REFERENCES public.batch_records(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='capa_records_source_deviation_id_fkey') THEN
    ALTER TABLE public.capa_records
      ADD CONSTRAINT capa_records_source_deviation_id_fkey
      FOREIGN KEY (source_deviation_id) REFERENCES public.deviations(id) ON DELETE SET NULL;
  END IF;
END $fks$;

CREATE INDEX IF NOT EXISTS capa_records_batch_idx
  ON public.capa_records (company_id, batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS capa_records_systemic_idx
  ON public.capa_records (company_id) WHERE is_systemic;

COMMENT ON COLUMN public.capa_records.is_systemic IS
  'Week 5 item 03. Boolean, not free text: release gating blocks on an open systemic CAPA affecting a batch and only warns on a non-systemic one.';

-- ── 2. Root cause analyses ───────────────────────────────────────────
--  "root_cause_analyses as specified: five whys and 5W1H, structured
--   data, determined root cause and category. Attachable to a deviation
--   or a CAPA."
--
--  STRUCTURED means structured. The five whys are an ordered chain in
--  their own table, not a jsonb blob and not five columns named why1 to
--  why5 — a chain that stops at three is normal, one that runs to seven
--  happens, and both are expressible here. 5W1H is six named columns
--  because it is six named questions, not a sequence.
CREATE TABLE IF NOT EXISTS public.root_cause_analyses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  --  "Attachable to a deviation or a CAPA." One subject, named by type,
  --  rather than two nullable foreign keys that permit both at once.
  subject_type  text NOT NULL CHECK (subject_type IN ('deviation','capa')),
  subject_id    uuid NOT NULL,

  --  5W1H. `where`, `when` and `how` are reserved or awkward as bare
  --  column names, so all six carry the w5h1_ prefix and none is the odd
  --  one out.
  w5h1_what     text,
  w5h1_why      text,
  w5h1_where    text,
  w5h1_when     text,
  w5h1_who      text,
  w5h1_how      text,

  --  The conclusion. Both nullable while the analysis is in progress:
  --  an analysis exists before it has an answer, and demanding one at
  --  insert would mean nobody could save their work.
  determined_root_cause text,
  root_cause_category   text CHECK (root_cause_category IS NULL OR root_cause_category IN (
    'human_error','equipment','material','method','environment',
    'measurement','management_system','supplier','other'
  )),

  performed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  --  A conclusion without a category is half an answer, and a category
  --  without a conclusion is a label with nothing under it. Enforced
  --  only at completion, so a draft can hold either alone.
  CONSTRAINT rca_complete_needs_both CHECK (
    completed_at IS NULL
    OR (btrim(coalesce(determined_root_cause,'')) <> '' AND root_cause_category IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS rca_subject_idx
  ON public.root_cause_analyses (company_id, subject_type, subject_id);

--  The five whys, ordered. `seq` is the position in the chain and is
--  unique per analysis, so two whys cannot claim the same step.
CREATE TABLE IF NOT EXISTS public.root_cause_whys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.root_cause_analyses(id) ON DELETE CASCADE,
  seq         integer NOT NULL CHECK (seq >= 1),
  --  "Why did X happen?" and the answer. Both, because the chain is
  --  unreadable a month later with only the answers.
  question    text NOT NULL,
  answer      text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rcw_seq_unique UNIQUE (analysis_id, seq),
  CONSTRAINT rcw_question_not_blank CHECK (btrim(question) <> '')
);

CREATE INDEX IF NOT EXISTS rcw_analysis_idx ON public.root_cause_whys (analysis_id, seq);

-- ── 3. Row level security ────────────────────────────────────────────
ALTER TABLE public.root_cause_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.root_cause_whys     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rca_company ON public.root_cause_analyses;
CREATE POLICY rca_company ON public.root_cause_analyses
  FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));

--  The whys carry no company_id of their own on purpose: duplicating it
--  would let the two disagree. Tenancy is inherited through the
--  analysis, which is the only way to reach them.
DROP POLICY IF EXISTS rcw_company ON public.root_cause_whys;
CREATE POLICY rcw_company ON public.root_cause_whys
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.root_cause_analyses a
    WHERE a.id = root_cause_whys.analysis_id
      AND public.app_is_company_member(a.company_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.root_cause_analyses a
    WHERE a.id = root_cause_whys.analysis_id
      AND public.app_is_company_member(a.company_id)));

-- ── 4. Raising a CAPA from a deviation ───────────────────────────────
--  "A CAPA is raised from a deviation by a person, with the deviation's
--   details pre-filled. Never automatically, except in the rejection
--   sequence (06)."
--
--  THIS IS A FUNCTION, NOT A TRIGGER, and that is the whole point. "Any
--  path other than rejection creates a CAPA automatically" is a NOT
--  DONE IF, so there is deliberately nothing on the deviations table
--  that fires this. Closing a deviation does not create a CAPA.
--  Marking impact 'yes' does not create a CAPA. A person does, by
--  calling this, having seen what it will create.
--
--  Pre-filled means pre-filled from the deviation, server side: the
--  title, the description, the batch it was raised against. The caller
--  may override the title and may not override where it came from.
CREATE OR REPLACE FUNCTION public.capa_raise_from_deviation(
  p_deviation_id uuid,
  p_title        text DEFAULT NULL,
  p_capa_type    text DEFAULT 'corrective',
  p_priority     text DEFAULT NULL,
  p_is_systemic  boolean DEFAULT false,
  p_due_date     timestamptz DEFAULT NULL
) RETURNS public.capa_records
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_dev  public.deviations;
  v_n    bigint;
  v_row  public.capa_records;
  v_prio text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'CAPA_UNAUTHENTICATED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_dev FROM public.deviations WHERE id = p_deviation_id;
  IF v_dev.id IS NULL THEN
    RAISE EXCEPTION 'CAPA_DEVIATION_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.app_is_company_member(v_dev.company_id, v_uid) THEN
    RAISE EXCEPTION 'CAPA_FORBIDDEN: not a member of that company' USING ERRCODE = 'P0001';
  END IF;

  --  Severity carries over as priority unless the caller says otherwise.
  --  A critical deviation producing a medium CAPA by default would be a
  --  quiet downgrade of somebody else's assessment.
  v_prio := coalesce(p_priority, CASE v_dev.severity
    WHEN 'critical' THEN 'critical' WHEN 'major' THEN 'high' ELSE 'medium' END);

  SELECT coalesce(max(substring(capa_number from '[0-9]+$')::bigint), 0) + 1
    INTO v_n
    FROM public.capa_records
   WHERE company_id = v_dev.company_id
     AND capa_number ~ '^CAPA-[0-9]+$';

  INSERT INTO public.capa_records (
    company_id, capa_number, title, description, source, capa_type, priority,
    batch_id, is_systemic, source_deviation_id, due_date, created_by
  ) VALUES (
    v_dev.company_id,
    'CAPA-' || lpad(v_n::text, 5, '0'),
    coalesce(nullif(btrim(coalesce(p_title,'')), ''),
             v_dev.deviation_number || ' — ' || v_dev.title),
    --  Pre-filled, and it says where it came from, because a CAPA that
    --  does not name its deviation is an orphan the first time somebody
    --  asks why it exists.
    'Raised from deviation ' || v_dev.deviation_number || ' (' || v_dev.severity
      || ', product quality impact: ' || v_dev.product_quality_impact || ').'
      || coalesce(E'\n\n' || v_dev.description, ''),
    'internal_review',
    p_capa_type,
    v_prio,
    CASE WHEN v_dev.source_type = 'batch' THEN v_dev.source_id ELSE NULL END,
    coalesce(p_is_systemic, false),
    v_dev.id,
    p_due_date,
    v_uid
  ) RETURNING * INTO v_row;

  --  The link in both directions. deviation_links is what the deviation
  --  screen reads; source_deviation_id is what the CAPA screen reads.
  INSERT INTO public.deviation_links (company_id, deviation_id, linked_type, linked_id, created_by)
  VALUES (v_dev.company_id, v_dev.id, 'capa', v_row.id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.capa_raise_from_deviation(uuid,text,text,text,boolean,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capa_raise_from_deviation(uuid,text,text,text,boolean,timestamptz) TO authenticated;

-- ── 5. What release gating asks about CAPAs ──────────────────────────
--  The counterpart to deviation_open_for_batch. Returns every OPEN CAPA
--  the company has, saying for each whether it is systemic and whether
--  it affects this batch — which is exactly the pair item 05 needs to
--  sort a block from a warning, and nothing more.
--
--  "Open" is the lifecycle's answer, not the status column's.
CREATE OR REPLACE FUNCTION public.capa_open_for_batch(
  p_company_id uuid,
  p_batch_id   uuid
) RETURNS TABLE (
  id uuid,
  capa_number text,
  title text,
  priority text,
  is_systemic boolean,
  affects_batch boolean,
  state_key text
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.capa_number, c.title, c.priority, c.is_systemic,
         (c.batch_id IS NOT DISTINCT FROM p_batch_id) AS affects_batch,
         s.state_key
  FROM public.capa_records c
  JOIN public.entity_current_state ecs
    ON ecs.entity_type = 'capa_record' AND ecs.entity_id = c.id
  JOIN public.lifecycle_states s ON s.id = ecs.state_id
  WHERE c.company_id = p_company_id
    AND public.app_is_company_member(p_company_id)
    AND s.state_key <> 'closed';
$$;

REVOKE ALL ON FUNCTION public.capa_open_for_batch(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capa_open_for_batch(uuid,uuid) TO authenticated;

COMMENT ON TABLE public.root_cause_analyses IS
  'Week 5 item 03. Five whys live in root_cause_whys as an ordered chain; 5W1H is six named columns. Attachable to a deviation or a CAPA, never both.';
