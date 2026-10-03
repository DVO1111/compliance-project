-- =====================================================================
--  WEEK 3 / ITEM 06 — MATERIAL TESTING AND RELEASE
-- =====================================================================
--  Waits on items 03 and 05.
--
--  "This is the first release gate in the platform and it sets the
--  pattern for batch release later", so the shape matters as much as the
--  behaviour. Four things are deliberate:
--
--  1. PASS/FAIL IS COMPUTED, NOT SUBMITTED.
--     material_test_record_result() takes the measured value and decides
--     the verdict itself, using the same material_spec_evaluate() that
--     item 05 uses on supplier certificates. An analyst cannot type
--     "pass" against a failing number, and our own result and a
--     supplier's claim are judged by one rule rather than two.
--
--  2. THE SPECIFICATION IS SNAPSHOT ONTO THE RESULT.
--     A result records the limits it was judged against, not a pointer to
--     them. Specifications are superseded; a result saying only "pass"
--     would become unreviewable the moment version 4 replaced version 3.
--
--  3. RELEASE IS GATED IN THE DATABASE, ON THE TRANSITION.
--     The failure named by the item is "any user who can open the page
--     can release material", so the gate cannot live in a screen or even
--     in a service. fn_material_lots_release_gate() — extended here from
--     item 05 — runs on the write into 'approved', so every path is
--     covered including a hand-written PostgREST call.
--
--  4. CONDITIONAL RELEASE IS A RECORD, NOT A LOOSER GATE.
--     It passes through the same signature and authority checks and
--     writes a material_lot_release_records row carrying the
--     justification and the named authoriser. Without both, it is
--     refused. "Conditional release available without justification" is
--     one of the NOT DONE IF clauses, and the constraint that prevents it
--     is on the table, not in a code path that could be skipped.
--
--  WHAT "A DESIGNATED QA ROLE" MEANS HERE
--  --------------------------------------
--  There is no 'qa' role to point at. profiles.role allows admin,
--  compliance_officer and content_creator, and the lifecycle engine's
--  required_role is checked against that column
--  (lifecycle_actor_role()). Separately, qaAuthority.ts and
--  20260702000200 use company_members.role IN ('owner','admin').
--
--  Two vocabularies, neither of which contains QA. So this does both,
--  layered:
--
--    * required_role on the release transition becomes
--      'admin,compliance_officer', which the engine enforces for the
--      transition AND for signing it. A content_creator is refused
--      outright, which is the floor.
--
--    * material_qa_authorities names the people a company has actually
--      designated. When a company has designated somebody, only those
--      people may release.
--
--  A company that has designated nobody falls back to the role check
--  alone. That is a deliberate choice and worth disagreeing with: the
--  stricter alternative makes release impossible until someone is
--  designated, which on a fresh install is a worse failure than a
--  role-gated release. It is still not "any user who can open the page".
--
--  CONDITIONAL RELEASE AND THE LIFECYCLE
--  -------------------------------------
--  A conditionally released lot lands in 'approved' with a release record
--  of type 'conditional', rather than in a state of its own. The
--  specification asks for justification and an authoriser, not for a
--  distinct state, and adding one would change what every list screen and
--  the dispensing gate mean by "approved". If conditional material should
--  look different on a list, a 'conditionally_released' state is the
--  change to make, and it is additive.
-- =====================================================================


-- ── 1. Who may release ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_qa_authorities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  designated_by  uuid REFERENCES auth.users(id),
  designated_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  revoked_by     uuid REFERENCES auth.users(id),
  --  Revocation is recorded rather than deleted: who could release, and
  --  when, is part of the audit trail for every lot they released.
  CONSTRAINT material_qa_authorities_uniq UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS material_qa_authorities_active_idx
  ON public.material_qa_authorities (company_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE public.material_qa_authorities IS
  'People a company has designated to release material. A company with no active designation falls back to the release transition''s required_role; see the migration header.';

CREATE OR REPLACE FUNCTION public.material_is_qa_authority(
  p_company_id uuid,
  p_user_id    uuid DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT CASE
    --  No designation made: the engine's role check is the whole gate.
    WHEN NOT EXISTS (SELECT 1 FROM public.material_qa_authorities
                      WHERE company_id = p_company_id AND revoked_at IS NULL)
      THEN public.lifecycle_actor_role(p_user_id) = ANY (ARRAY['admin','compliance_officer'])
    ELSE EXISTS (SELECT 1 FROM public.material_qa_authorities
                  WHERE company_id = p_company_id AND user_id = p_user_id
                    AND revoked_at IS NULL)
  END;
$$;

COMMENT ON FUNCTION public.material_is_qa_authority(uuid,uuid) IS
  'Whether a user may release material for a company: a live designation if any exist, otherwise the admin/compliance_officer floor.';

REVOKE ALL ON FUNCTION public.material_is_qa_authority(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_is_qa_authority(uuid,uuid) TO authenticated, service_role;


-- ── 2. Tests configurable per material ───────────────────────────────
--  One test per specification parameter. That is not a simplification of
--  the domain so much as what makes the release gate computable: "any
--  required test incomplete or failing" has to resolve to a definite set
--  of expected results, and a parameter is the unit a result is about.
CREATE TABLE IF NOT EXISTS public.material_test_definitions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  specification_parameter_id uuid        NOT NULL REFERENCES public.material_specification_parameters(id) ON DELETE CASCADE,
  code                       text,
  name                       text        NOT NULL,
  --  Default method and instrument. A result may override them — the
  --  instrument actually used is a property of the test performed, not of
  --  the definition — but a definition carries them so an analyst is not
  --  retyping the method every time.
  method                     text,
  instrument                 text,
  --  Only a required test can block release. An informational test that
  --  blocked release would make every optional measurement a gate.
  is_required                boolean     NOT NULL DEFAULT true,
  sort_order                 integer     NOT NULL DEFAULT 0,
  is_active                  boolean     NOT NULL DEFAULT true,
  created_by                 uuid REFERENCES auth.users(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_test_def_uniq UNIQUE (specification_parameter_id)
);

CREATE INDEX IF NOT EXISTS material_test_def_company_idx
  ON public.material_test_definitions (company_id, is_active);


CREATE TABLE IF NOT EXISTS public.material_test_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_lot_id     uuid        NOT NULL REFERENCES public.material_lots(id) ON DELETE CASCADE,
  test_definition_id  uuid        NOT NULL REFERENCES public.material_test_definitions(id) ON DELETE RESTRICT,

  --  ── the eight things the item requires a result to capture ──
  parameter           text        NOT NULL,
  specification_limit text        NOT NULL,
  actual_value        numeric(18,6),
  actual_text         text,
  result              text        NOT NULL,
  analyst_id          uuid REFERENCES auth.users(id),
  analyst_name        text        NOT NULL,
  test_date           date        NOT NULL DEFAULT current_date,
  method              text,
  instrument          text,

  --  The limits as numbers too, so a reviewer can recompute the verdict
  --  rather than trusting the rendered text.
  limit_type          text        NOT NULL,
  limit_min           numeric(18,6),
  limit_max           numeric(18,6),
  limit_expected_text text,

  superseded_at       timestamptz,
  superseded_by       uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT material_test_result_chk CHECK (result IN ('pass','fail','unparseable')),
  --  A result has to say what was measured, one way or the other.
  CONSTRAINT material_test_result_value_chk
    CHECK (actual_value IS NOT NULL OR actual_text IS NOT NULL),
  CONSTRAINT material_test_result_analyst_chk CHECK (btrim(analyst_name) <> '')
);

--  One live result per test per lot. A retest supersedes rather than
--  duplicates, so "incomplete or failing" has exactly one answer.
CREATE UNIQUE INDEX IF NOT EXISTS material_test_result_live_uniq
  ON public.material_test_results (material_lot_id, test_definition_id)
  WHERE superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS material_test_result_lot_idx
  ON public.material_test_results (material_lot_id, result)
  WHERE superseded_at IS NULL;

COMMENT ON COLUMN public.material_test_results.result IS
  'Computed by material_test_record_result() from the measured value and the snapshot limits — never supplied by the caller.';


-- ── 3. Release and rejection records ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_lot_release_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_lot_id uuid        NOT NULL REFERENCES public.material_lots(id) ON DELETE CASCADE,
  release_type    text        NOT NULL,
  justification   text,
  authorised_by   uuid REFERENCES auth.users(id),
  released_by     uuid        NOT NULL REFERENCES auth.users(id),
  signature_id    uuid REFERENCES public.electronic_signatures(id),
  released_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_release_type_chk CHECK (release_type IN ('full','conditional')),
  --  The NOT DONE IF — "conditional release available without
  --  justification" — made structural. A conditional release without a
  --  justification and a named authoriser cannot be stored at all, so no
  --  code path can produce one.
  CONSTRAINT material_release_conditional_chk CHECK (
    release_type <> 'conditional'
    OR (justification IS NOT NULL AND btrim(justification) <> '' AND authorised_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS material_release_lot_idx
  ON public.material_lot_release_records (material_lot_id, released_at DESC);
CREATE INDEX IF NOT EXISTS material_release_conditional_idx
  ON public.material_lot_release_records (company_id, released_at DESC)
  WHERE release_type = 'conditional';


CREATE TABLE IF NOT EXISTS public.material_lot_rejections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_lot_id uuid        NOT NULL REFERENCES public.material_lots(id) ON DELETE CASCADE,
  --  The three the item names, and nothing else: an open text field here
  --  would let "disposition" become a note nobody can report on.
  disposition     text        NOT NULL,
  reason          text        NOT NULL,
  disposition_note text,
  decided_by      uuid        NOT NULL REFERENCES auth.users(id),
  signature_id    uuid REFERENCES public.electronic_signatures(id),
  decided_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  CONSTRAINT material_rejection_disposition_chk CHECK (disposition IN
    ('return_to_supplier','destruction','downgrade_non_critical')),
  CONSTRAINT material_rejection_reason_chk CHECK (btrim(reason) <> ''),
  CONSTRAINT material_rejection_one_per_lot UNIQUE (material_lot_id)
);


-- ── 4. Recording a test result ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.material_test_record_result(
  p_lot_id        uuid,
  p_test_def_id   uuid,
  p_actual_value  numeric DEFAULT NULL,
  p_actual_text   text    DEFAULT NULL,
  p_analyst_id    uuid    DEFAULT auth.uid(),
  p_test_date     date    DEFAULT current_date,
  p_method        text    DEFAULT NULL,
  p_instrument    text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot     record;
  v_def     record;
  v_verdict text;
  v_name    text;
  v_id      uuid;
BEGIN
  SELECT ml.id, ml.company_id, ml.material_id, ml.lot_number
    INTO v_lot FROM public.material_lots ml WHERE ml.id = p_lot_id;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_TEST_NO_LOT: no such lot %', p_lot_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_lot.company_id) THEN
    RAISE EXCEPTION 'MATERIAL_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT d.id, d.company_id, d.method, d.instrument, d.is_required,
         p.parameter, p.unit, p.limit_type, p.min_value, p.max_value, p.expected_text,
         s.material_id
    INTO v_def
    FROM public.material_test_definitions d
    JOIN public.material_specification_parameters p ON p.id = d.specification_parameter_id
    JOIN public.material_specifications s           ON s.id = p.specification_id
   WHERE d.id = p_test_def_id;

  IF v_def.id IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_TEST_NO_DEFINITION: no such test definition %', p_test_def_id
      USING ERRCODE = 'P0002';
  END IF;

  --  The test must belong to the lot's material and company, or a result
  --  could be filed against a parameter of something else entirely.
  IF v_def.material_id <> v_lot.material_id OR v_def.company_id <> v_lot.company_id THEN
    RAISE EXCEPTION 'MATERIAL_TEST_MISMATCH: test definition % is not for the material of lot %',
      p_test_def_id, v_lot.lot_number USING ERRCODE = 'P0001';
  END IF;

  IF p_actual_value IS NULL AND coalesce(btrim(p_actual_text),'') = '' THEN
    RAISE EXCEPTION 'MATERIAL_TEST_NO_VALUE: a result must record what was measured'
      USING ERRCODE = 'P0001';
  END IF;

  --  THE VERDICT IS OURS, NOT THE CALLER'S. Same rule as item 05 applies
  --  to supplier claims, so our own result and theirs are judged
  --  identically.
  v_verdict := public.material_spec_evaluate(
    v_def.limit_type, v_def.min_value, v_def.max_value, v_def.expected_text,
    p_actual_value, coalesce(p_actual_text, p_actual_value::text));

  SELECT coalesce(pr.full_name, pr.email, 'Unknown analyst') INTO v_name
    FROM public.profiles pr WHERE pr.id = p_analyst_id;

  --  A retest supersedes the previous result rather than replacing it:
  --  the superseded one is evidence of what was found first.
  UPDATE public.material_test_results
     SET superseded_at = now()
   WHERE material_lot_id = p_lot_id
     AND test_definition_id = p_test_def_id
     AND superseded_at IS NULL;

  INSERT INTO public.material_test_results
    (company_id, material_lot_id, test_definition_id, parameter, specification_limit,
     actual_value, actual_text, result, analyst_id, analyst_name, test_date,
     method, instrument, limit_type, limit_min, limit_max, limit_expected_text)
  VALUES (v_lot.company_id, p_lot_id, p_test_def_id, v_def.parameter,
          public.material_spec_limit_text(v_def.limit_type, v_def.min_value,
                                          v_def.max_value, v_def.expected_text, v_def.unit),
          p_actual_value, p_actual_text, v_verdict, p_analyst_id,
          coalesce(v_name,'Unknown analyst'), p_test_date,
          coalesce(p_method, v_def.method), coalesce(p_instrument, v_def.instrument),
          v_def.limit_type, v_def.min_value, v_def.max_value, v_def.expected_text)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('result_id', v_id, 'parameter', v_def.parameter,
                            'result', v_verdict, 'is_required', v_def.is_required);
END $$;

COMMENT ON FUNCTION public.material_test_record_result(uuid,uuid,numeric,text,uuid,date,text,text) IS
  'Records one test result against a lot, computing pass/fail server-side from the specification and snapshotting the limits onto the result. A retest supersedes the previous result rather than overwriting it.';

REVOKE ALL ON FUNCTION public.material_test_record_result(uuid,uuid,numeric,text,uuid,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_test_record_result(uuid,uuid,numeric,text,uuid,date,text,text) TO authenticated, service_role;


-- ── 5. The release gate, extended ────────────────────────────────────
--  Replaces item 05's version. The certificate clauses are unchanged; the
--  test clauses are new. Everything stays in ONE function, because two
--  functions each answering part of "may this be released" is how a lot
--  gets released past the half nobody called.
CREATE OR REPLACE FUNCTION public.material_lot_release_block_reason(p_lot_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  l record; v_bad integer; v_disc integer;
  v_missing text[]; v_failing text[];
BEGIN
  SELECT ml.id, ml.company_id, ml.lot_number, ml.material_id,
         m.name AS material_name, m.criticality
    INTO l
    FROM public.material_lots ml
    JOIN public.materials m ON m.id = ml.material_id
   WHERE ml.id = p_lot_id;

  IF l.id IS NULL THEN RETURN 'This material lot does not exist.'; END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(l.company_id) THEN
    RAISE EXCEPTION 'MATERIAL_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── certificate (item 05) ──
  SELECT count(*) INTO v_bad
    FROM public.material_certificates_of_analysis c
   WHERE c.material_lot_id = p_lot_id AND c.verification_status <> 'verified';

  IF v_bad > 0 THEN
    SELECT count(*) INTO v_disc
      FROM public.material_coa_discrepancies d
     WHERE d.material_lot_id = p_lot_id AND d.resolved_at IS NULL;
    RETURN format('Lot %s of %s cannot be released: its certificate of analysis is not verified%s.',
                  l.lot_number, l.material_name,
                  CASE WHEN v_disc > 0
                       THEN format(' (%s open discrepanc%s)', v_disc,
                                   CASE WHEN v_disc = 1 THEN 'y' ELSE 'ies' END)
                       ELSE '' END);
  END IF;

  IF l.criticality = 'critical' THEN
    IF NOT EXISTS (SELECT 1 FROM public.material_certificates_of_analysis c
                    WHERE c.material_lot_id = p_lot_id AND c.verification_status = 'verified') THEN
      RETURN format('Lot %s of %s cannot be released: %s is a critical material and has no verified certificate of analysis.',
                    l.lot_number, l.material_name, l.material_name);
    END IF;
  END IF;

  -- ── required tests (item 06) ──
  --  Incomplete first: a missing result and a failing one are different
  --  problems and the message should say which.
  --
  --  A material with no required tests configured is not blocked by this
  --  clause. There is nothing to be incomplete, and blocking would make
  --  release impossible until someone configures tests — a worse failure
  --  than releasing material whose company has not yet defined any.
  SELECT array_agg(p.parameter ORDER BY d.sort_order, p.parameter) INTO v_missing
    FROM public.material_test_definitions d
    JOIN public.material_specification_parameters p ON p.id = d.specification_parameter_id
    JOIN public.material_specifications s           ON s.id = p.specification_id
   WHERE s.material_id = l.material_id
     AND s.status = 'effective'
     AND d.is_required AND d.is_active
     AND NOT EXISTS (SELECT 1 FROM public.material_test_results r
                      WHERE r.material_lot_id = p_lot_id
                        AND r.test_definition_id = d.id
                        AND r.superseded_at IS NULL);

  IF v_missing IS NOT NULL AND cardinality(v_missing) > 0 THEN
    RETURN format('Lot %s of %s cannot be released: %s required test%s not been performed (%s).',
                  l.lot_number, l.material_name, cardinality(v_missing),
                  CASE WHEN cardinality(v_missing) = 1 THEN ' has' ELSE 's have' END,
                  array_to_string(v_missing, ', '));
  END IF;

  SELECT array_agg(r.parameter ORDER BY r.parameter) INTO v_failing
    FROM public.material_test_results r
    JOIN public.material_test_definitions d ON d.id = r.test_definition_id
   WHERE r.material_lot_id = p_lot_id
     AND r.superseded_at IS NULL
     AND d.is_required AND d.is_active
     AND r.result <> 'pass';

  IF v_failing IS NOT NULL AND cardinality(v_failing) > 0 THEN
    RETURN format('Lot %s of %s cannot be released: %s required test%s not passed (%s).',
                  l.lot_number, l.material_name, cardinality(v_failing),
                  CASE WHEN cardinality(v_failing) = 1 THEN ' has' ELSE 's have' END,
                  array_to_string(v_failing, ', '));
  END IF;

  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.material_lot_release_block_reason(uuid) IS
  'NULL when a lot may be released, otherwise why not: an unverified certificate, a critical material without one, or a required test that is incomplete or failing. One function, so no caller can satisfy half the gate.';


--  The gate on the transition. Extended from item 05 with the authority
--  check, which is what makes "any user who can open the page can release
--  material" false rather than merely discouraged.
CREATE OR REPLACE FUNCTION public.fn_material_lots_release_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_to text; v_from text; v_reason text; v_actor uuid := auth.uid();
BEGIN
  IF NEW.entity_type <> 'material_lot' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_to <> 'approved' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
    IF v_from = 'approved' THEN RETURN NEW; END IF;
  END IF;

  v_reason := public.material_lot_release_block_reason(NEW.entity_id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'MATERIAL_RELEASE_BLOCKED: %' , v_reason USING ERRCODE = 'P0001';
  END IF;

  --  Authority. Service callers are exempt: the scheduler and migrations
  --  have no JWT and are not people. Everything with an actor is checked.
  IF NOT public.app_is_service_context() THEN
    IF v_actor IS NULL OR NOT public.material_is_qa_authority(NEW.company_id, v_actor) THEN
      RAISE EXCEPTION 'MATERIAL_RELEASE_FORBIDDEN: releasing material requires a designated QA authority'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_material_lots_release_gate ON public.entity_current_state;
CREATE TRIGGER trg_material_lots_release_gate
  BEFORE INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_lots_release_gate();


-- ── 6. The release transition gains a role requirement ───────────────
--  Set here rather than in item 03 because this is the item that decides
--  who may release. The engine enforces it for the transition and for
--  signing it, so a content_creator cannot even produce the signature.
UPDATE public.lifecycle_transitions t
   SET required_role = 'admin,compliance_officer'
  FROM public.lifecycle_states f, public.lifecycle_definitions d
 WHERE d.entity_type = 'material_lot' AND d.company_id IS NULL
   AND t.definition_id = d.id
   AND f.id = t.from_state_id AND f.state_key = 'under_test'
   AND t.action_key = 'release';


-- ── 7. Release and rejection RPCs ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.material_lot_release(
  p_lot_id        uuid,
  p_signature_id  uuid,
  p_release_type  text    DEFAULT 'full',
  p_justification text    DEFAULT NULL,
  p_authorised_by uuid    DEFAULT NULL,
  p_comment       text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE l record; v_actor uuid := auth.uid(); v_res jsonb;
BEGIN
  SELECT ml.id, ml.company_id, ml.lot_number INTO l
    FROM public.material_lots ml WHERE ml.id = p_lot_id;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_NO_LOT: no such lot %', p_lot_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(l.company_id) THEN
    RAISE EXCEPTION 'MATERIAL_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_release_type NOT IN ('full','conditional') THEN
    RAISE EXCEPTION 'MATERIAL_RELEASE_TYPE: release type must be full or conditional'
      USING ERRCODE = 'P0001';
  END IF;

  --  Checked here as well as by the table constraint, so the caller gets
  --  a sentence rather than a constraint name.
  IF p_release_type = 'conditional' THEN
    IF coalesce(btrim(p_justification),'') = '' THEN
      RAISE EXCEPTION 'MATERIAL_RELEASE_NO_JUSTIFICATION: a conditional release requires a documented justification'
        USING ERRCODE = 'P0001';
    END IF;
    IF p_authorised_by IS NULL THEN
      RAISE EXCEPTION 'MATERIAL_RELEASE_NO_AUTHORISER: a conditional release requires a named authoriser'
        USING ERRCODE = 'P0001';
    END IF;
    IF NOT public.material_is_qa_authority(l.company_id, p_authorised_by) THEN
      RAISE EXCEPTION 'MATERIAL_RELEASE_BAD_AUTHORISER: the named authoriser is not a QA authority for this company'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  --  The transition carries the signature: lifecycle_transition()
  --  consumes it, which is what ties the signed meaning to the state
  --  change rather than leaving two unrelated records.
  v_res := public.lifecycle_transition('material_lot', p_lot_id, 'release',
                                       l.company_id, v_actor,
                                       coalesce(p_comment,
                                                CASE WHEN p_release_type = 'conditional'
                                                     THEN 'Conditional release' ELSE 'Released' END),
                                       '{}'::jsonb, p_signature_id);

  INSERT INTO public.material_lot_release_records
    (company_id, material_lot_id, release_type, justification, authorised_by,
     released_by, signature_id)
  VALUES (l.company_id, p_lot_id, p_release_type,
          nullif(btrim(coalesce(p_justification,'')),''), p_authorised_by,
          coalesce(v_actor, p_authorised_by), p_signature_id);

  RETURN v_res || jsonb_build_object('release_type', p_release_type);
END $$;

COMMENT ON FUNCTION public.material_lot_release(uuid,uuid,text,text,uuid,text) IS
  'Releases a lot through the lifecycle engine with a consumed electronic signature, recording whether the release was full or conditional. A conditional release without a justification and a QA-authority authoriser is refused.';

REVOKE ALL ON FUNCTION public.material_lot_release(uuid,uuid,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_lot_release(uuid,uuid,text,text,uuid,text) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.material_lot_reject(
  p_lot_id       uuid,
  p_disposition  text,
  p_reason       text,
  p_note         text DEFAULT NULL,
  p_signature_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE l record; v_actor uuid := auth.uid(); v_res jsonb;
BEGIN
  SELECT ml.id, ml.company_id, ml.lot_number, ml.status INTO l
    FROM public.material_lots ml WHERE ml.id = p_lot_id;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_NO_LOT: no such lot %', p_lot_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(l.company_id) THEN
    RAISE EXCEPTION 'MATERIAL_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  --  Disposition is required at the moment of rejection, not afterwards.
  --  A rejected lot with no disposition is material sitting in a
  --  warehouse that nobody has decided what to do with, which is the
  --  thing the requirement exists to prevent.
  IF p_disposition NOT IN ('return_to_supplier','destruction','downgrade_non_critical') THEN
    RAISE EXCEPTION 'MATERIAL_REJECT_DISPOSITION: disposition must be return_to_supplier, destruction or downgrade_non_critical'
      USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(btrim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'MATERIAL_REJECT_NO_REASON: a rejection requires a reason'
      USING ERRCODE = 'P0001';
  END IF;

  v_res := public.lifecycle_transition('material_lot', p_lot_id, 'reject',
                                       l.company_id, v_actor, p_reason,
                                       '{}'::jsonb, p_signature_id);

  INSERT INTO public.material_lot_rejections
    (company_id, material_lot_id, disposition, reason, disposition_note,
     decided_by, signature_id)
  VALUES (l.company_id, p_lot_id, p_disposition, p_reason, p_note,
          coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid), p_signature_id);

  RETURN v_res || jsonb_build_object('disposition', p_disposition);
END $$;

COMMENT ON FUNCTION public.material_lot_reject(uuid,text,text,text,uuid) IS
  'Rejects a lot and records its disposition — return to supplier, destruction, or downgrade to non-critical use — in the same transaction as the state change.';

REVOKE ALL ON FUNCTION public.material_lot_reject(uuid,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_lot_reject(uuid,text,text,text,uuid) TO authenticated, service_role;


-- ── 8. Conditionally released material is visible as such ────────────
CREATE OR REPLACE VIEW public.material_lots_conditionally_released
  WITH (security_invoker = true) AS
  SELECT ml.id AS material_lot_id, ml.company_id, ml.lot_number, ml.status,
         m.name AS material_name, r.justification, r.authorised_by,
         r.released_by, r.released_at
    FROM public.material_lot_release_records r
    JOIN public.material_lots ml ON ml.id = r.material_lot_id
    JOIN public.materials m      ON m.id  = ml.material_id
   WHERE r.release_type = 'conditional';

COMMENT ON VIEW public.material_lots_conditionally_released IS
  'Lots released conditionally, with the justification and authoriser. security_invoker so row-level security on the underlying tables actually applies — a view runs as its owner otherwise.';

REVOKE ALL ON public.material_lots_conditionally_released FROM PUBLIC, anon;
GRANT SELECT ON public.material_lots_conditionally_released TO authenticated, service_role;


-- ── 9. RLS, policies and grants ──────────────────────────────────────
ALTER TABLE public.material_qa_authorities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_test_definitions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_test_results          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_lot_release_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_lot_rejections        ENABLE ROW LEVEL SECURITY;

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['material_qa_authorities','material_test_definitions',
                           'material_test_results','material_lot_release_records',
                           'material_lot_rejections']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                      USING (public.app_is_company_member(company_id))$p$, t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
                      WITH CHECK (public.app_is_company_member(company_id))$p$, t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
                      USING (public.app_is_company_member(company_id))
                      WITH CHECK (public.app_is_company_member(company_id))$p$, t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                      USING (public.app_is_company_member(company_id))$p$, t||'_delete', t);

    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END
$rls$;

--  A test result is evidence. It may be superseded by a retest, but it is
--  not editable and not deletable by a client: an analyst who could
--  rewrite yesterday's failing assay could release anything.
DROP POLICY IF EXISTS material_test_results_update ON public.material_test_results;
DROP POLICY IF EXISTS material_test_results_delete ON public.material_test_results;
REVOKE UPDATE, DELETE ON public.material_test_results FROM authenticated;

COMMENT ON TABLE public.material_test_results IS
  'Append-only from a client''s point of view: no UPDATE or DELETE policy and the privileges revoked. A retest supersedes via material_test_record_result(), which runs as owner.';

--  Same for the release and rejection records, which are the signed
--  decision itself.
DROP POLICY IF EXISTS material_lot_release_records_update ON public.material_lot_release_records;
DROP POLICY IF EXISTS material_lot_release_records_delete ON public.material_lot_release_records;
REVOKE UPDATE, DELETE ON public.material_lot_release_records FROM authenticated;

DROP POLICY IF EXISTS material_lot_rejections_delete ON public.material_lot_rejections;
REVOKE DELETE ON public.material_lot_rejections FROM authenticated;

DROP TRIGGER IF EXISTS trg_material_test_definitions_touch ON public.material_test_definitions;
CREATE TRIGGER trg_material_test_definitions_touch
  BEFORE UPDATE ON public.material_test_definitions
  FOR EACH ROW EXECUTE FUNCTION public.fn_materials_touch_updated_at();
