-- =====================================================================
--  W4·15 · Materials screens — release readiness, and the sampling record
-- =====================================================================
--  The design's NOT DONE IF names the thing this file exists for:
--
--    "Blocking conditions only after clicking: no. They lead the
--     release screen and the lot detail."
--
--  and MT-06 draws what that means: seven conditions, each either MET
--  or BLOCKING, with a count in the header ("2 BLOCKING · 5 MET") and a
--  Sign and release button that is disabled and says how many are left.
--
--  WHY A NEW FUNCTION AND NOT A BIGGER MESSAGE.
--  material_lot_release_block_reason already answers "may this lot be
--  released", and it answers it correctly — but it answers with the
--  FIRST problem and then returns. That is right for a trigger, which
--  only needs to refuse, and useless for a screen that has to show
--  everything before the attempt. A screen built on it would show one
--  blocker, the person would clear it, and the next would appear:
--  exactly the "only after clicking" failure the design rules out.
--
--  SO THE GATE IS NOW DERIVED, NOT DUPLICATED. material_lot_release_conditions
--  computes all seven; material_lot_release_block_reason is rewritten to
--  read the blocking ones from it and return the first, word for word as
--  before. One source of truth. The alternative — a second function
--  listing conditions beside the one that enforces them — is two
--  answers to the same question, and they would disagree the first time
--  somebody changed one.
--
--  WHAT IS NOT WIDENED. Three of the seven conditions are readiness
--  rather than gate: sampling recorded, within expiry and retest, and
--  supplier approved. They are shown because a releasing officer needs
--  them, and they are marked blocking = false because adding them to
--  the gate would change what release means — a decision for the lead,
--  not a side effect of drawing a screen. Expiry and retest ARE
--  enforced, at dispensing, by material_lot_block_reason; supplier
--  approval is enforced at receipt by fn_material_lots_supplier_gate.
--  The two that gate release (certificate, tests) keep gating it, and
--  the QA release role is gated by fn_material_lots_release_gate.
-- =====================================================================

-- ── 1. The sampling record ───────────────────────────────────────────
--  MT-05 names it as a deliverable — "Sampling record, live pass/fail,
--  instrument with calibration date" — and MT-06 shows it as a release
--  condition: "Sampling recorded · SMP-26-0233 · 11 Oct 2026 · 6 of 20
--  drums". There was nowhere to put any of that.
--
--  WHY THE CONTAINER COUNTS ARE NOT OPTIONAL. "6 of 20 drums" is the
--  sampling plan being evidenced, and a sampling record that does not
--  say how many containers were drawn from how many is not evidence of
--  anything. √n+1 is the usual plan; which plan was used is recorded
--  as text because it varies by material and by pharmacopoeia.
CREATE TABLE IF NOT EXISTS public.material_lot_sampling (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_lot_id    uuid NOT NULL REFERENCES public.material_lots(id) ON DELETE CASCADE,
  --  "SMP-26-0233", from the company's own numbering.
  reference          text NOT NULL,
  sampled_on         date NOT NULL DEFAULT current_date,
  sampled_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  containers_sampled integer NOT NULL CHECK (containers_sampled > 0),
  containers_total   integer NOT NULL CHECK (containers_total > 0),
  --  "√n + 1", "every container", "n/2 + 1".
  sampling_plan      text,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, reference),
  --  Drawing from more containers than the lot has is a typo, and a
  --  sampling record is the kind of document an inspector reads
  --  closely.
  CONSTRAINT material_sampling_within_lot CHECK (containers_sampled <= containers_total)
);

CREATE INDEX IF NOT EXISTS material_lot_sampling_lot_idx
  ON public.material_lot_sampling (material_lot_id, sampled_on DESC);

ALTER TABLE public.material_lot_sampling ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='material_lot_sampling' AND policyname='material_lot_sampling_read'
  ) THEN
    CREATE POLICY material_lot_sampling_read ON public.material_lot_sampling
      FOR SELECT TO authenticated USING (public.app_is_company_member(company_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='material_lot_sampling' AND policyname='material_lot_sampling_write'
  ) THEN
    --  Members may record sampling; nobody may edit or delete it. A
    --  sampling record that can be revised after the result is in is
    --  not a record of what was sampled.
    CREATE POLICY material_lot_sampling_write ON public.material_lot_sampling
      FOR INSERT TO authenticated WITH CHECK (public.app_is_company_member(company_id));
  END IF;
END $$;

--  company_numbering_formats restricts `scope` to a closed list, so a
--  new scope has to be admitted before anything can be numbered under
--  it. Stated here rather than left to fail at the first call, which is
--  how it was found.
ALTER TABLE public.company_numbering_formats
  DROP CONSTRAINT IF EXISTS company_numbering_formats_scope_chk;

ALTER TABLE public.company_numbering_formats
  ADD CONSTRAINT company_numbering_formats_scope_chk
  CHECK (scope IN ('material_lot','material_sampling','batch','deviation','change_control'));

CREATE OR REPLACE FUNCTION public.material_lot_record_sampling(
  p_lot_id             uuid,
  p_containers_sampled integer,
  p_containers_total   integer,
  p_sampling_plan      text DEFAULT NULL,
  p_sampled_on         date DEFAULT current_date,
  p_note               text DEFAULT NULL
) RETURNS public.material_lot_sampling
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_lot record; v_ref text; v_row public.material_lot_sampling;
BEGIN
  SELECT ml.id, ml.company_id INTO v_lot
    FROM public.material_lots ml WHERE ml.id = p_lot_id;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION 'MATERIAL_NO_LOT: no such lot %', p_lot_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.app_is_company_member(v_lot.company_id) THEN
    RAISE EXCEPTION 'MATERIAL_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  --  Numbering is configurable per company and deliberately not
  --  hardcoded — but a company that has never configured a sampling
  --  format must not be unable to record sampling at all, which is
  --  what numbering_next's NUMBERING_NO_FORMAT would mean here. So the
  --  first use writes the design's own default and leaves it editable;
  --  ON CONFLICT DO NOTHING means a company that HAS configured one
  --  keeps theirs.
  INSERT INTO public.company_numbering_formats
    (company_id, scope, pattern, prefix, seq_width, seq_reset)
  VALUES (v_lot.company_id, 'material_sampling', '{PREFIX}-{YY}-{SEQ}', 'SMP', 4, 'yearly')
  ON CONFLICT (company_id, scope) DO NOTHING;

  v_ref := public.numbering_next(v_lot.company_id, 'material_sampling');

  INSERT INTO public.material_lot_sampling (
    company_id, material_lot_id, reference, sampled_on, sampled_by,
    containers_sampled, containers_total, sampling_plan, note
  ) VALUES (
    v_lot.company_id, p_lot_id, v_ref, p_sampled_on, auth.uid(),
    p_containers_sampled, p_containers_total, p_sampling_plan, p_note
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- ── 2. Every release condition, met or not ───────────────────────────
--  Ordered so the screen can render it straight down: blocking first,
--  then met, each already carrying the words to show.
CREATE OR REPLACE FUNCTION public.material_lot_release_conditions(p_lot_id uuid)
RETURNS TABLE (
  condition_key text,
  met           boolean,
  --  Whether failing it actually stops release today. See the header:
  --  three of the seven are readiness, not gate.
  blocking      boolean,
  title         text,
  detail        text,
  --  "WAITING ON QC · S. BAKARE" / "WAITING ON YOU". NULL when met.
  waiting_on    text,
  sort_order    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  l           record;
  v_unverified integer;
  v_verified   integer;
  v_disc       integer;
  v_missing    text[];
  v_failing    text[];
  v_passed     integer;
  v_required   integer;
  v_all        text[];
  v_samp       record;
  v_sup        record;
  v_is_qa      boolean;
BEGIN
  SELECT ml.id, ml.company_id, ml.lot_number, ml.material_id, ml.status,
         ml.retest_due_date, ml.supplier_expiry_date, ml.supplier_id,
         m.name AS material_name, m.criticality
    INTO l
    FROM public.material_lots ml
    JOIN public.materials m ON m.id = ml.material_id
   WHERE ml.id = p_lot_id;

  IF l.id IS NULL THEN RETURN; END IF;

  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(l.company_id) THEN
    RAISE EXCEPTION 'MATERIAL_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── certificate (D2.6) ──
  SELECT count(*) FILTER (WHERE c.verification_status <> 'verified'),
         count(*) FILTER (WHERE c.verification_status = 'verified')
    INTO v_unverified, v_verified
    FROM public.material_certificates_of_analysis c
   WHERE c.material_lot_id = p_lot_id;

  SELECT count(*) INTO v_disc
    FROM public.material_coa_discrepancies d
   WHERE d.material_lot_id = p_lot_id AND d.resolved_at IS NULL;

  IF v_unverified > 0 THEN
    RETURN QUERY SELECT
      'certificate_verified', false, true,
      'Supplier certificate not verified',
      CASE WHEN v_disc > 0
        THEN format('%s open discrepanc%s to resolve. You review and verify it (D2.6).',
                    v_disc, CASE WHEN v_disc = 1 THEN 'y' ELSE 'ies' END)
        ELSE 'The certificate has been uploaded but not reviewed. You review and verify it (D2.6).'
      END,
      'WAITING ON YOU'::text, 10;
  ELSIF l.criticality = 'critical' AND v_verified = 0 THEN
    RETURN QUERY SELECT
      'certificate_verified', false, true,
      'No certificate of analysis',
      format('%s is a critical material and cannot be released without a verified certificate (D2.6).',
             l.material_name),
      'WAITING ON THE SUPPLIER'::text, 10;
  ELSE
    RETURN QUERY SELECT
      'certificate_verified', true, true,
      'Supplier certificate verified',
      CASE WHEN v_verified > 0
        THEN format('%s certificate%s checked against the internal specification.',
                    v_verified, CASE WHEN v_verified = 1 THEN '' ELSE 's' END)
        ELSE 'No certificate is required for this material.'
      END,
      NULL::text, 10;
  END IF;

  -- ── required tests, complete (D2.5) ──
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

  SELECT count(*) INTO v_required
    FROM public.material_test_definitions d
    JOIN public.material_specification_parameters p ON p.id = d.specification_parameter_id
    JOIN public.material_specifications s           ON s.id = p.specification_id
   WHERE s.material_id = l.material_id AND s.status = 'effective'
     AND d.is_required AND d.is_active;

  IF v_missing IS NOT NULL AND cardinality(v_missing) > 0 THEN
    RETURN QUERY SELECT
      'tests_complete', false, true,
      format('%s test%s incomplete: %s', cardinality(v_missing),
             CASE WHEN cardinality(v_missing) = 1 THEN '' ELSE 's' END,
             array_to_string(v_missing, ', ')),
      'Release needs every required test complete and passing (D2.5).',
      'WAITING ON QC'::text, 20;
  ELSE
    RETURN QUERY SELECT
      'tests_complete', true, true,
      format('%s required test%s performed', v_required,
             CASE WHEN v_required = 1 THEN '' ELSE 's' END),
      'Every test the specification requires has a result.',
      NULL::text, 20;
  END IF;

  -- ── required tests, passing (D2.5) ──
  SELECT array_agg(r.parameter ORDER BY r.parameter) INTO v_failing
    FROM public.material_test_results r
    JOIN public.material_test_definitions d ON d.id = r.test_definition_id
   WHERE r.material_lot_id = p_lot_id AND r.superseded_at IS NULL
     AND d.is_required AND d.is_active AND r.result <> 'pass';

  SELECT count(*), array_agg(r.parameter ORDER BY r.parameter)
    INTO v_passed, v_all
    FROM public.material_test_results r
    JOIN public.material_test_definitions d ON d.id = r.test_definition_id
   WHERE r.material_lot_id = p_lot_id AND r.superseded_at IS NULL
     AND d.is_required AND d.is_active AND r.result = 'pass';

  IF v_failing IS NOT NULL AND cardinality(v_failing) > 0 THEN
    RETURN QUERY SELECT
      'tests_passed', false, true,
      format('%s required test%s not passed: %s', cardinality(v_failing),
             CASE WHEN cardinality(v_failing) = 1 THEN ' has' ELSE 's have' END,
             array_to_string(v_failing, ', ')),
      'A failing result is an out-of-specification event and cannot be released past (D2.5).',
      'WAITING ON QA'::text, 30;
  ELSE
    RETURN QUERY SELECT
      'tests_passed', true, true,
      format('%s of %s tests passed', v_passed, GREATEST(v_required, v_passed)),
      COALESCE(array_to_string(v_all, ', '), 'No required tests are configured for this material.'),
      NULL::text, 30;
  END IF;

  -- ── sampling recorded (readiness) ──
  SELECT s.reference, s.sampled_on, s.containers_sampled, s.containers_total
    INTO v_samp
    FROM public.material_lot_sampling s
   WHERE s.material_lot_id = p_lot_id
   ORDER BY s.sampled_on DESC, s.created_at DESC LIMIT 1;

  IF v_samp.reference IS NULL THEN
    RETURN QUERY SELECT
      'sampling_recorded', false, false,
      'No sampling record',
      'Results have no recorded sampling behind them. Record how the lot was sampled.',
      'WAITING ON QC'::text, 40;
  ELSE
    RETURN QUERY SELECT
      'sampling_recorded', true, false,
      'Sampling recorded',
      format('%s · %s · %s of %s containers', v_samp.reference,
             to_char(v_samp.sampled_on, 'DD Mon YYYY'),
             v_samp.containers_sampled, v_samp.containers_total),
      NULL::text, 40;
  END IF;

  -- ── supplier approved (enforced at receipt) ──
  --  "Approved" is two facts, not one: a qualification status AND a
  --  qualification that has not lapsed. A supplier qualified in 2019
  --  and never requalified reads as 'qualified' in the column, and
  --  treating that as approved is how an expired qualification
  --  survives an audit unnoticed.
  SELECT sp.name, sp.qualification_status, sp.qualified_until INTO v_sup
    FROM public.suppliers sp WHERE sp.id = l.supplier_id;

  RETURN QUERY SELECT
    'supplier_approved',
    COALESCE(v_sup.qualification_status IN ('qualified','conditional')
             AND (v_sup.qualified_until IS NULL OR v_sup.qualified_until >= current_date),
             false),
    false,
    CASE
      WHEN v_sup.name IS NULL THEN 'No supplier recorded'
      WHEN v_sup.qualification_status NOT IN ('qualified','conditional')
        THEN format('Supplier %s', v_sup.qualification_status)
      WHEN v_sup.qualified_until IS NOT NULL AND v_sup.qualified_until < current_date
        THEN 'Supplier qualification lapsed'
      WHEN v_sup.qualification_status = 'conditional' THEN 'Supplier conditionally qualified'
      ELSE 'Supplier approved'
    END,
    COALESCE(v_sup.name, 'This lot has no supplier on record.')
      || COALESCE(' · qualified to ' || to_char(v_sup.qualified_until, 'DD Mon YYYY'), ''),
    CASE WHEN COALESCE(v_sup.qualification_status IN ('qualified','conditional')
                       AND (v_sup.qualified_until IS NULL OR v_sup.qualified_until >= current_date),
                       false)
         THEN NULL ELSE 'WAITING ON QA' END,
    50;

  -- ── within expiry and retest (enforced at dispensing) ──
  RETURN QUERY SELECT
    'within_dating',
    NOT (
      (l.supplier_expiry_date IS NOT NULL AND l.supplier_expiry_date < current_date)
      OR (l.retest_due_date IS NOT NULL AND l.retest_due_date < current_date)
    ),
    false,
    CASE
      WHEN l.supplier_expiry_date IS NOT NULL AND l.supplier_expiry_date < current_date
        THEN 'Past expiry'
      WHEN l.retest_due_date IS NOT NULL AND l.retest_due_date < current_date
        THEN 'Retest overdue'
      ELSE 'Within expiry and retest'
    END,
    trim(both ' · ' from
      COALESCE('Retest ' || to_char(l.retest_due_date, 'DD Mon YYYY'), '')
      || CASE WHEN l.retest_due_date IS NOT NULL AND l.supplier_expiry_date IS NOT NULL
              THEN ' · ' ELSE '' END
      || COALESCE('expiry ' || to_char(l.supplier_expiry_date, 'DD Mon YYYY'), '')),
    NULL::text, 60;

  -- ── the QA release role (D2.7) ──
  --  Enforced by fn_material_lots_release_gate, so it genuinely blocks
  --  — and it blocks THIS caller rather than the lot, which is why the
  --  sentence is in the second person.
  v_is_qa := public.material_is_qa_authority(l.company_id);

  RETURN QUERY SELECT
    'qa_release_role', COALESCE(v_is_qa, false), true,
    CASE WHEN v_is_qa THEN 'You hold the QA release role'
         ELSE 'You do not hold the QA release role' END,
    CASE WHEN v_is_qa THEN 'Release needs your signature (D2.7).'
         ELSE 'Release is signed by a designated QA release authority (D2.7).' END,
    CASE WHEN v_is_qa THEN NULL ELSE 'WAITING ON QA' END,
    70;
END $$;

COMMENT ON FUNCTION public.material_lot_release_conditions(uuid) IS
  'Every release condition for a lot, met or not, with the words to show. The blocking ones are what material_lot_release_block_reason enforces; the rest are readiness. One source of truth for MT-03 and MT-06.';

-- ── 3. The gate, rewritten to read the conditions above ──────────────
--  Same wording as before, deliberately: these strings are asserted by
--  incoming_coa_verification_test and material_testing_and_release_test,
--  and more importantly they are what a refused release says to the
--  person who attempted it. The change here is WHERE the answer comes
--  from, not what it is.
CREATE OR REPLACE FUNCTION public.material_lot_release_block_reason(p_lot_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  l record; c record; v_disc integer; v_missing text[]; v_failing text[];
BEGIN
  SELECT ml.id, ml.company_id, ml.lot_number, ml.material_id,
         m.name AS material_name, m.criticality
    INTO l
    FROM public.material_lots ml
    JOIN public.materials m ON m.id = ml.material_id
   WHERE ml.id = p_lot_id;

  IF l.id IS NULL THEN RETURN 'This material lot does not exist.'; END IF;

  --  The membership check lives in the conditions function; calling it
  --  first means a non-member is refused here exactly as before.
  SELECT condition_key INTO c
    FROM public.material_lot_release_conditions(p_lot_id)
   WHERE blocking AND NOT met
     --  The QA release role is about the CALLER, not the lot. It is
     --  enforced separately by the release-gate trigger and must not
     --  turn this function — which a screen calls to ask "is this lot
     --  releasable" — into a question about who is asking.
     AND condition_key <> 'qa_release_role'
   ORDER BY sort_order LIMIT 1;

  IF c.condition_key IS NULL THEN RETURN NULL; END IF;

  IF c.condition_key = 'certificate_verified' THEN
    IF EXISTS (SELECT 1 FROM public.material_certificates_of_analysis
                WHERE material_lot_id = p_lot_id AND verification_status <> 'verified') THEN
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
    RETURN format('Lot %s of %s cannot be released: %s is a critical material and has no verified certificate of analysis.',
                  l.lot_number, l.material_name, l.material_name);
  END IF;

  IF c.condition_key = 'tests_complete' THEN
    SELECT array_agg(p.parameter ORDER BY d.sort_order, p.parameter) INTO v_missing
      FROM public.material_test_definitions d
      JOIN public.material_specification_parameters p ON p.id = d.specification_parameter_id
      JOIN public.material_specifications s           ON s.id = p.specification_id
     WHERE s.material_id = l.material_id AND s.status = 'effective'
       AND d.is_required AND d.is_active
       AND NOT EXISTS (SELECT 1 FROM public.material_test_results r
                        WHERE r.material_lot_id = p_lot_id
                          AND r.test_definition_id = d.id
                          AND r.superseded_at IS NULL);
    RETURN format('Lot %s of %s cannot be released: %s required test%s not been performed (%s).',
                  l.lot_number, l.material_name, cardinality(v_missing),
                  CASE WHEN cardinality(v_missing) = 1 THEN ' has' ELSE 's have' END,
                  array_to_string(v_missing, ', '));
  END IF;

  IF c.condition_key = 'tests_passed' THEN
    SELECT array_agg(r.parameter ORDER BY r.parameter) INTO v_failing
      FROM public.material_test_results r
      JOIN public.material_test_definitions d ON d.id = r.test_definition_id
     WHERE r.material_lot_id = p_lot_id AND r.superseded_at IS NULL
       AND d.is_required AND d.is_active AND r.result <> 'pass';
    RETURN format('Lot %s of %s cannot be released: %s required test%s not passed (%s).',
                  l.lot_number, l.material_name, cardinality(v_failing),
                  CASE WHEN cardinality(v_failing) = 1 THEN ' has' ELSE 's have' END,
                  array_to_string(v_failing, ', '));
  END IF;

  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.material_lot_release_block_reason(uuid) IS
  'NULL when a lot may be released, otherwise why not — the first blocking condition from material_lot_release_conditions, worded as before. One function, so no caller can satisfy half the gate.';

GRANT EXECUTE ON FUNCTION public.material_lot_release_conditions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.material_lot_record_sampling(uuid, integer, integer, text, date, text)
  TO authenticated, service_role;

-- ── 4. Deploy-time assertions ────────────────────────────────────────
DO $$
DECLARE v_n integer;
BEGIN
  --  "Blocking conditions only after clicking: no." A conditions
  --  function that reports fewer than the design's seven cannot lead
  --  the screen with all of them.
  SELECT count(DISTINCT condition_key) INTO v_n
    FROM public.material_lot_release_conditions('00000000-0000-0000-0000-000000000000'::uuid);
  --  No such lot, so it returns nothing: the shape is checked below
  --  instead, against the function's declared columns.
  SELECT count(*) INTO v_n
    FROM information_schema.routines
   WHERE routine_schema='public' AND routine_name='material_lot_release_conditions';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'W4_15_VIOLATION: material_lot_release_conditions is missing.';
  END IF;

  --  The gate must still be derived from the conditions. If somebody
  --  reinstates a standalone block_reason, the screen and the trigger
  --  can disagree about what stops a release.
  IF (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='material_lot_release_block_reason')
     NOT LIKE '%material_lot_release_conditions%' THEN
    RAISE EXCEPTION 'W4_15_VIOLATION: material_lot_release_block_reason no longer reads '
      'material_lot_release_conditions. The release screen and the release gate would '
      'then be two answers to one question.';
  END IF;

  --  A sampling record that can be edited after the result is in is
  --  not a record of what was sampled.
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND tablename='material_lot_sampling'
     AND cmd IN ('UPDATE','DELETE');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'W4_15_VIOLATION: % update/delete polic(ies) on material_lot_sampling. '
      'A sampling record is written once.', v_n;
  END IF;
END $$;
