-- =====================================================================
--  WEEK 3 / ITEM 05 — INCOMING CERTIFICATE OF ANALYSIS VERIFICATION
-- =====================================================================
--  Waits on item 03.
--
--  TWO TABLES CALLED "CERTIFICATE OF ANALYSIS", GOING OPPOSITE WAYS
--  ----------------------------------------------------------------
--  public.certificate_of_analysis (20260701000200) is the certificate WE
--  ISSUE: generated from a released batch's QC results, carrying our own
--  conformance statement, QA-approved, exported as a PDF for a customer.
--  It hangs off batch_records and src/lib/pharma/coaService.ts drives it.
--
--  public.material_certificates_of_analysis (item 03) is the certificate
--  WE RECEIVE: the supplier's, for a lot of incoming material, which this
--  item checks against our own specification.
--
--  Same words, opposite directions — outgoing attestation versus incoming
--  claim. They are deliberately separate tables and must stay separate;
--  merging them would put our signed statement and a supplier's unchecked
--  claim in one place.
--
--  "FILING IS NOT VERIFICATION"
--  ----------------------------
--  The item's first NOT DONE IF is "the certificate is stored but never
--  compared against specification". Item 03 could store a certificate;
--  nothing could compare it, because a specification was a
--  `specification_reference` text pointer — the name of a controlled
--  document, not its contents. So the comparison needs the specification
--  itself, parameter by parameter, which is what sections 1 and 2 add.
--
--  SURFACING
--  ---------
--  "Discrepancies flagged on the lot and surfaced to QA and procurement",
--  and the failure is "discrepancies recorded but not surfaced to anyone".
--
--  There is no procurement role in this schema — profiles.role allows
--  only admin, compliance_officer and content_creator, and the existing
--  QA-authority convention (qaAuthority.ts, 20260702000200) is
--  app_has_company_role(company_id, ARRAY['owner','admin']). Rather than
--  widen a CHECK constraint that existing rows depend on, section 3 adds
--  a routing table: a company names who receives QA and procurement
--  notices, and until it does, both fall back to the QA authority. That
--  fallback is stated here because it means QA and procurement are the
--  same people on a fresh install, which is a thing to decide rather
--  than discover.
--
--  DEVIATION — THE WEEK 6 LINKAGE POINT
--  ------------------------------------
--  "A discrepancy should eventually raise a formal deviation. Deviation
--  is not built until Week 6, so flag and notify this week and leave the
--  linkage point clearly marked in code."
--
--  Marked in exactly one place: material_coa_discrepancies.deviation_id,
--  with the trigger point in material_coa_verify() commented
--  WEEK 6 DEVIATION LINKAGE. Grep for that string and you find both ends.
-- =====================================================================


-- ── 1. The internal specification ────────────────────────────────────
--  Versioned, because a specification that changes in place makes every
--  historical verification unreproducible: you could no longer say what
--  the lot was checked against.
CREATE TABLE IF NOT EXISTS public.material_specifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  material_id    uuid        NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  version        text        NOT NULL,
  reference      text,
  status         text        NOT NULL DEFAULT 'draft',
  effective_date date,
  superseded_at  timestamptz,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_specifications_status_chk
    CHECK (status IN ('draft','effective','superseded','withdrawn')),
  CONSTRAINT material_specifications_version_uniq UNIQUE (material_id, version)
);

--  At most one effective specification per material at a time. Two would
--  make "the internal specification for that material" ambiguous, and
--  the comparison would silently pick one.
CREATE UNIQUE INDEX IF NOT EXISTS material_specifications_one_effective
  ON public.material_specifications (material_id)
  WHERE status = 'effective';

CREATE INDEX IF NOT EXISTS material_specifications_company_idx
  ON public.material_specifications (company_id, material_id, status);


CREATE TABLE IF NOT EXISTS public.material_specification_parameters (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specification_id uuid        NOT NULL REFERENCES public.material_specifications(id) ON DELETE CASCADE,
  parameter        text        NOT NULL,
  unit             text,
  --  How the limit is expressed. A specification is not always a range:
  --  "not more than 0.5%", "complies", "absent" are all real limits and
  --  collapsing them into min/max would lose the ones that are not
  --  numeric at all.
  limit_type       text        NOT NULL,
  min_value        numeric(18,6),
  max_value        numeric(18,6),
  expected_text    text,
  --  A critical parameter failing is not the same as a minor one
  --  drifting. Item 06 uses this; it is captured at the same time as the
  --  limit so the two cannot disagree.
  is_critical      boolean     NOT NULL DEFAULT false,
  sort_order       integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_spec_param_uniq UNIQUE (specification_id, parameter),
  CONSTRAINT material_spec_param_limit_chk CHECK (limit_type IN
    ('range','min','max','exact_text','complies','absent')),
  --  Each limit_type must carry the fields it needs, or the comparison
  --  has nothing to compare against and would quietly pass.
  CONSTRAINT material_spec_param_fields_chk CHECK (
    CASE limit_type
      WHEN 'range'      THEN min_value IS NOT NULL AND max_value IS NOT NULL AND min_value <= max_value
      WHEN 'min'        THEN min_value IS NOT NULL
      WHEN 'max'        THEN max_value IS NOT NULL
      WHEN 'exact_text' THEN expected_text IS NOT NULL AND btrim(expected_text) <> ''
      ELSE true
    END)
);

CREATE INDEX IF NOT EXISTS material_spec_param_spec_idx
  ON public.material_specification_parameters (specification_id, sort_order);


-- ── 2. Discrepancies, flagged on the lot ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_coa_discrepancies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  certificate_id      uuid        NOT NULL REFERENCES public.material_certificates_of_analysis(id) ON DELETE CASCADE,
  --  Denormalised onto the lot deliberately: "flagged on the lot" means a
  --  lot screen can find its discrepancies without going through the
  --  certificate, and a lot with two certificates shows both.
  material_lot_id     uuid        NOT NULL REFERENCES public.material_lots(id) ON DELETE CASCADE,
  parameter           text        NOT NULL,
  discrepancy_type    text        NOT NULL,
  specification_limit text,
  stated_value        text,
  is_critical         boolean     NOT NULL DEFAULT false,
  detected_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  resolved_by         uuid REFERENCES auth.users(id),
  resolution_note     text,
  --  ── WEEK 6 DEVIATION LINKAGE ──
  --  A discrepancy should raise a formal deviation. Deviation does not
  --  exist until Week 6, so the column is here, nullable, with no foreign
  --  key yet — adding the FK is a one-line migration once the table
  --  exists, and the alternative (bolting the column on later) would mean
  --  backfilling every discrepancy raised in the meantime.
  deviation_id        uuid,
  CONSTRAINT material_coa_disc_type_chk CHECK (discrepancy_type IN
    ('out_of_specification','missing_result','unparseable_value','unit_mismatch','extra_parameter')),
  CONSTRAINT material_coa_disc_uniq UNIQUE (certificate_id, parameter, discrepancy_type)
);

CREATE INDEX IF NOT EXISTS material_coa_disc_lot_idx
  ON public.material_coa_discrepancies (material_lot_id)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS material_coa_disc_open_idx
  ON public.material_coa_discrepancies (company_id, detected_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS material_coa_disc_pending_deviation_idx
  ON public.material_coa_discrepancies (company_id)
  WHERE deviation_id IS NULL AND resolved_at IS NULL;

COMMENT ON COLUMN public.material_coa_discrepancies.deviation_id IS
  'WEEK 6 DEVIATION LINKAGE. Intended to reference the deviation raised for this discrepancy. No foreign key yet because the deviation table does not exist; add it when Week 6 lands.';


-- ── 3. Who gets told ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_notification_recipients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  purpose    text        NOT NULL,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT material_notif_purpose_chk CHECK (purpose IN ('qa','procurement')),
  CONSTRAINT material_notif_uniq UNIQUE (company_id, purpose, user_id)
);

COMMENT ON TABLE public.material_notification_recipients IS
  'Who receives material notices, by purpose. A company with no rows for a purpose falls back to its QA authority (owner/admin) — which means QA and procurement are the same people until someone says otherwise.';

CREATE OR REPLACE FUNCTION public.material_notice_recipients(
  p_company_id uuid,
  p_purpose    text
) RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  --  Named recipients win. Otherwise the QA authority, which is the
  --  convention already used by app_has_company_role in
  --  20260702000200 and mirrored in src/lib/pharma/qaAuthority.ts.
  SELECT r.user_id
    FROM public.material_notification_recipients r
   WHERE r.company_id = p_company_id AND r.purpose = p_purpose
  UNION
  SELECT cm.user_id
    FROM public.company_members cm
   WHERE cm.company_id = p_company_id
     AND cm.role = ANY (ARRAY['owner','admin'])
     AND NOT EXISTS (SELECT 1 FROM public.material_notification_recipients r2
                      WHERE r2.company_id = p_company_id AND r2.purpose = p_purpose);
$$;

COMMENT ON FUNCTION public.material_notice_recipients(uuid,text) IS
  'Recipients for a company and purpose, falling back to the QA authority when none are named. SECURITY DEFINER with no membership check by design: it returns only user ids for the company asked about and is called from other DEFINER functions that have already authorised the caller.';

REVOKE ALL ON FUNCTION public.material_notice_recipients(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_notice_recipients(uuid,text) TO service_role;


-- ── 4. Comparison, parameter by parameter ────────────────────────────
--  One parameter against one limit. Split out so the comparison rules are
--  readable and testable on their own, rather than buried in a loop.
CREATE OR REPLACE FUNCTION public.material_spec_evaluate(
  p_limit_type     text,
  p_min            numeric,
  p_max            numeric,
  p_expected_text  text,
  p_stated_value   numeric,
  p_stated_text    text
) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_temp
AS $$
BEGIN
  --  Returns 'pass', 'fail', or 'unparseable' when the supplier stated
  --  something that cannot be checked against this kind of limit. It
  --  never returns 'pass' for an absent value: that is the whole point.
  IF p_limit_type IN ('range','min','max') THEN
    IF p_stated_value IS NULL THEN
      RETURN 'unparseable';
    END IF;
    IF p_limit_type = 'range' AND (p_stated_value < p_min OR p_stated_value > p_max) THEN
      RETURN 'fail';
    ELSIF p_limit_type = 'min' AND p_stated_value < p_min THEN
      RETURN 'fail';
    ELSIF p_limit_type = 'max' AND p_stated_value > p_max THEN
      RETURN 'fail';
    END IF;
    RETURN 'pass';
  END IF;

  IF p_limit_type = 'exact_text' THEN
    IF p_stated_text IS NULL THEN RETURN 'unparseable'; END IF;
    RETURN CASE WHEN lower(btrim(p_stated_text)) = lower(btrim(p_expected_text))
                THEN 'pass' ELSE 'fail' END;
  END IF;

  IF p_limit_type = 'complies' THEN
    IF p_stated_text IS NULL THEN RETURN 'unparseable'; END IF;
    RETURN CASE WHEN lower(btrim(p_stated_text)) IN
                     ('complies','conforms','pass','passes','yes','compliant','satisfactory')
                THEN 'pass' ELSE 'fail' END;
  END IF;

  IF p_limit_type = 'absent' THEN
    IF p_stated_text IS NULL AND p_stated_value IS NULL THEN RETURN 'unparseable'; END IF;
    --  "Absent" is satisfied by a declaration of absence, or by a
    --  numeric result of zero. "Detected" is a failure however phrased.
    IF p_stated_value IS NOT NULL THEN
      RETURN CASE WHEN p_stated_value = 0 THEN 'pass' ELSE 'fail' END;
    END IF;
    RETURN CASE WHEN lower(btrim(p_stated_text)) IN
                     ('absent','none','not detected','nd','negative','0')
                THEN 'pass' ELSE 'fail' END;
  END IF;

  RETURN 'unparseable';
END $$;

COMMENT ON FUNCTION public.material_spec_evaluate(text,numeric,numeric,text,numeric,text) IS
  'Evaluates one stated result against one specification limit. Returns pass, fail or unparseable — never pass for an absent or unreadable value.';


--  Human-readable rendering of a limit, for the discrepancy record. The
--  record has to say what the limit WAS, because the specification can be
--  superseded later and a bare "out of specification" would then be
--  unreviewable.
CREATE OR REPLACE FUNCTION public.material_spec_limit_text(
  p_limit_type text, p_min numeric, p_max numeric, p_expected_text text, p_unit text
) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_temp
AS $$
  SELECT CASE p_limit_type
    WHEN 'range'      THEN format('%s to %s%s', p_min, p_max, coalesce(' '||p_unit,''))
    WHEN 'min'        THEN format('not less than %s%s', p_min, coalesce(' '||p_unit,''))
    WHEN 'max'        THEN format('not more than %s%s', p_max, coalesce(' '||p_unit,''))
    WHEN 'exact_text' THEN p_expected_text
    WHEN 'complies'   THEN 'complies'
    WHEN 'absent'     THEN 'absent'
    ELSE p_limit_type
  END;
$$;


--  The verification itself.
CREATE OR REPLACE FUNCTION public.material_coa_verify(p_coa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_coa      record;
  v_spec     uuid;
  v_param    record;
  v_res      jsonb;
  v_num      numeric;
  v_txt      text;
  v_verdict  text;
  v_checked  integer := 0;
  v_failed   integer := 0;
  v_critical integer := 0;
  v_actor    uuid := auth.uid();
  v_rec      record;
  v_msg      text;
BEGIN
  SELECT c.id, c.company_id, c.material_lot_id, c.supplier_results,
         ml.material_id, ml.lot_number, m.name AS material_name
    INTO v_coa
    FROM public.material_certificates_of_analysis c
    JOIN public.material_lots ml ON ml.id = c.material_lot_id
    JOIN public.materials m      ON m.id  = ml.material_id
   WHERE c.id = p_coa_id;

  IF v_coa.id IS NULL THEN
    RAISE EXCEPTION 'COA_NOT_FOUND: no such certificate %', p_coa_id
      USING ERRCODE = 'P0002';
  END IF;

  --  SECURITY DEFINER, so RLS does not scope it. It checks membership
  --  itself and RAISES rather than returning a quiet result, because a
  --  caller that got an empty answer back would read it as "nothing
  --  wrong with this certificate".
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_coa.company_id) THEN
    RAISE EXCEPTION 'COA_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_spec FROM public.material_specifications
   WHERE material_id = v_coa.material_id AND status = 'effective';

  --  No specification means the comparison cannot be done. It must NOT
  --  record a pass: "filing is not verification", and a certificate
  --  marked verified against nothing is exactly that.
  IF v_spec IS NULL THEN
    UPDATE public.material_certificates_of_analysis
       SET verification_status = 'unverified', discrepancy_count = 0, updated_at = now()
     WHERE id = p_coa_id;
    RAISE EXCEPTION 'COA_NO_SPECIFICATION: % has no effective specification, so its certificate cannot be verified', v_coa.material_name
      USING ERRCODE = 'P0002';
  END IF;

  --  Re-verification replaces the previous finding set for this
  --  certificate. Resolved discrepancies are kept: someone acted on
  --  them, and deleting that is deleting the record of the action.
  DELETE FROM public.material_coa_discrepancies
   WHERE certificate_id = p_coa_id AND resolved_at IS NULL;

  FOR v_param IN
    SELECT * FROM public.material_specification_parameters
     WHERE specification_id = v_spec ORDER BY sort_order, parameter
  LOOP
    v_checked := v_checked + 1;

    --  Find the supplier's line for this parameter. Case-insensitive and
    --  trimmed, because a certificate typed by hand will not match on
    --  exact case.
    SELECT e.value INTO v_res
      FROM jsonb_array_elements(v_coa.supplier_results) AS e(value)
     WHERE lower(btrim(coalesce(e.value->>'parameter',''))) = lower(btrim(v_param.parameter))
     LIMIT 1;

    IF v_res IS NULL THEN
      --  The specification names a parameter the certificate does not
      --  report. That is a discrepancy, not a pass.
      INSERT INTO public.material_coa_discrepancies
        (company_id, certificate_id, material_lot_id, parameter, discrepancy_type,
         specification_limit, stated_value, is_critical)
      VALUES (v_coa.company_id, p_coa_id, v_coa.material_lot_id, v_param.parameter,
              'missing_result',
              public.material_spec_limit_text(v_param.limit_type, v_param.min_value,
                                              v_param.max_value, v_param.expected_text, v_param.unit),
              NULL, v_param.is_critical)
      ON CONFLICT (certificate_id, parameter, discrepancy_type) DO NOTHING;
      v_failed := v_failed + 1;
      IF v_param.is_critical THEN v_critical := v_critical + 1; END IF;
      CONTINUE;
    END IF;

    --  A stated value may be numeric or text. Parse without throwing:
    --  "99.4" is a number, "complies" is not, and neither is an error.
    v_txt := coalesce(v_res->>'stated_text', v_res->>'stated_value');
    BEGIN
      v_num := (v_res->>'stated_value')::numeric;
    EXCEPTION WHEN others THEN
      v_num := NULL;
    END;

    v_verdict := public.material_spec_evaluate(
      v_param.limit_type, v_param.min_value, v_param.max_value,
      v_param.expected_text, v_num, v_txt);

    IF v_verdict <> 'pass' THEN
      INSERT INTO public.material_coa_discrepancies
        (company_id, certificate_id, material_lot_id, parameter, discrepancy_type,
         specification_limit, stated_value, is_critical)
      VALUES (v_coa.company_id, p_coa_id, v_coa.material_lot_id, v_param.parameter,
              CASE WHEN v_verdict = 'unparseable' THEN 'unparseable_value'
                   ELSE 'out_of_specification' END,
              public.material_spec_limit_text(v_param.limit_type, v_param.min_value,
                                              v_param.max_value, v_param.expected_text, v_param.unit),
              coalesce(v_txt, '(not stated)'), v_param.is_critical)
      ON CONFLICT (certificate_id, parameter, discrepancy_type) DO NOTHING;
      v_failed := v_failed + 1;
      IF v_param.is_critical THEN v_critical := v_critical + 1; END IF;
    END IF;
  END LOOP;

  UPDATE public.material_certificates_of_analysis
     SET verification_status = CASE WHEN v_failed > 0 THEN 'discrepant' ELSE 'verified' END,
         discrepancy_count   = v_failed,
         verified_at         = now(),
         verified_by         = v_actor,
         updated_at          = now()
   WHERE id = p_coa_id;

  --  ── Surfacing. The failure mode named by the item is "discrepancies
  --  recorded but not surfaced to anyone", so this is not optional and
  --  not best-effort: it runs in the same transaction as the finding.
  IF v_failed > 0 THEN
    v_msg := format('%s discrepanc%s on the certificate for lot %s of %s%s.',
                    v_failed, CASE WHEN v_failed = 1 THEN 'y' ELSE 'ies' END,
                    v_coa.lot_number, v_coa.material_name,
                    CASE WHEN v_critical > 0
                         THEN format(', %s on critical parameter%s',
                                     v_critical, CASE WHEN v_critical = 1 THEN '' ELSE 's' END)
                         ELSE '' END);

    FOR v_rec IN
      SELECT DISTINCT r.user_id, p.purpose
        FROM (VALUES ('qa'), ('procurement')) AS p(purpose)
        CROSS JOIN LATERAL public.material_notice_recipients(v_coa.company_id, p.purpose) r
    LOOP
      INSERT INTO public.notifications (recipient_id, type, content_id, message)
      VALUES (v_rec.user_id, 'material_coa_discrepancy', p_coa_id,
              CASE WHEN v_rec.purpose = 'procurement'
                   THEN v_msg || ' Raised for procurement: the supplier may need to be contacted.'
                   ELSE v_msg END);
    END LOOP;

    --  ── WEEK 6 DEVIATION LINKAGE ──
    --  Each discrepancy should raise a formal deviation. The deviation
    --  module does not exist until Week 6, so nothing is raised here and
    --  deviation_id stays NULL. When it lands, this is the hook: create
    --  the deviation and write its id back onto the rows just inserted.
    --  material_coa_discrepancies_pending_deviation (below) lists exactly
    --  the rows that will need one, including any raised in the meantime,
    --  so the backlog is queryable rather than lost.
    NULL;
  END IF;

  RETURN jsonb_build_object(
    'certificate_id',      p_coa_id,
    'specification_id',    v_spec,
    'parameters_checked',  v_checked,
    'discrepancies',       v_failed,
    'critical',            v_critical,
    'verification_status', CASE WHEN v_failed > 0 THEN 'discrepant' ELSE 'verified' END);
END $$;

COMMENT ON FUNCTION public.material_coa_verify(uuid) IS
  'Compares a supplier certificate against the material''s effective internal specification, parameter by parameter; records discrepancies on the lot and notifies QA and procurement in the same transaction. Raises when no effective specification exists rather than marking the certificate verified against nothing.';

REVOKE ALL ON FUNCTION public.material_coa_verify(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_coa_verify(uuid) TO authenticated, service_role;


--  The Week 6 backlog, as a view so it cannot drift from the column.
--
--  security_invoker = true is NOT optional here. A Postgres view runs as
--  its OWNER by default, so row-level security on material_coa_discrepancies
--  would be evaluated as the view's owner and bypassed wholesale — the
--  same hole a SECURITY DEFINER function punches, through a view instead.
--  Without this the backlog would hand every tenant's open discrepancies
--  to any authenticated user, and a test asserting cross-tenant isolation
--  caught exactly that.
CREATE OR REPLACE VIEW public.material_coa_discrepancies_pending_deviation
  WITH (security_invoker = true) AS
  SELECT d.*
    FROM public.material_coa_discrepancies d
   WHERE d.deviation_id IS NULL
     AND d.resolved_at IS NULL;

COMMENT ON VIEW public.material_coa_discrepancies_pending_deviation IS
  'WEEK 6 DEVIATION LINKAGE. Open discrepancies with no deviation attached. When the deviation module lands, this is the backlog to work through.';

REVOKE ALL ON public.material_coa_discrepancies_pending_deviation FROM PUBLIC, anon;
GRANT SELECT ON public.material_coa_discrepancies_pending_deviation TO authenticated, service_role;


-- ── 5. A lot cannot be released while its certificate is unverified ──
CREATE OR REPLACE FUNCTION public.material_lot_release_block_reason(p_lot_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE l record; v_bad integer; v_disc integer;
BEGIN
  SELECT ml.id, ml.company_id, ml.lot_number, m.name AS material_name, m.criticality
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

  --  A critical material with no certificate at all. The item's wording
  --  is "while its certificate is unverified", which presupposes one
  --  exists; a lot with none would otherwise pass this gate untouched.
  --  Blocking it for critical materials only is the narrow reading that
  --  still closes the hole where it matters most. Item 06 owns release
  --  completeness and can widen it.
  IF l.criticality = 'critical' THEN
    IF NOT EXISTS (SELECT 1 FROM public.material_certificates_of_analysis c
                    WHERE c.material_lot_id = p_lot_id AND c.verification_status = 'verified') THEN
      RETURN format('Lot %s of %s cannot be released: %s is a critical material and has no verified certificate of analysis.',
                    l.lot_number, l.material_name, l.material_name);
    END IF;
  END IF;

  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.material_lot_release_block_reason(uuid) IS
  'NULL when a lot may be released, otherwise why not. Separate from material_lot_block_reason(), which answers the dispensing question: a lot can be releasable and not yet dispensable, and conflating them would make one gate silently answer for the other.';

REVOKE ALL ON FUNCTION public.material_lot_release_block_reason(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_lot_release_block_reason(uuid) TO authenticated, service_role;


--  Enforced on the transition itself, not only in a service call, so no
--  path into 'approved' can skip it.
CREATE OR REPLACE FUNCTION public.fn_material_lots_release_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_to text; v_from text; v_reason text;
BEGIN
  IF NEW.entity_type <> 'material_lot' THEN RETURN NEW; END IF;

  SELECT state_key INTO v_to FROM public.lifecycle_states WHERE id = NEW.state_id;
  IF v_to <> 'approved' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT state_key INTO v_from FROM public.lifecycle_states WHERE id = OLD.state_id;
    IF v_from = 'approved' THEN RETURN NEW; END IF;   -- already approved; not a release
  END IF;

  v_reason := public.material_lot_release_block_reason(NEW.entity_id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'MATERIAL_RELEASE_BLOCKED: %', v_reason
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_material_lots_release_gate ON public.entity_current_state;
CREATE TRIGGER trg_material_lots_release_gate
  BEFORE INSERT OR UPDATE ON public.entity_current_state
  FOR EACH ROW EXECUTE FUNCTION public.fn_material_lots_release_gate();


-- ── 6. RLS, policies and grants ──────────────────────────────────────
ALTER TABLE public.material_specifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_coa_discrepancies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_notification_recipients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_specification_parameters   ENABLE ROW LEVEL SECURITY;

DO $rls$
DECLARE t text;
BEGIN
  --  Tables carrying company_id directly.
  FOREACH t IN ARRAY ARRAY['material_specifications','material_coa_discrepancies',
                           'material_notification_recipients']
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

--  material_specification_parameters has no company_id of its own — it
--  hangs off a specification. Scoped through the parent rather than by
--  duplicating the column, so the two can never disagree about which
--  company a parameter belongs to.
DROP POLICY IF EXISTS material_specification_parameters_select ON public.material_specification_parameters;
CREATE POLICY material_specification_parameters_select
  ON public.material_specification_parameters FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.material_specifications s
                  WHERE s.id = specification_id
                    AND public.app_is_company_member(s.company_id)));

DROP POLICY IF EXISTS material_specification_parameters_insert ON public.material_specification_parameters;
CREATE POLICY material_specification_parameters_insert
  ON public.material_specification_parameters FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.material_specifications s
                       WHERE s.id = specification_id
                         AND public.app_is_company_member(s.company_id)));

DROP POLICY IF EXISTS material_specification_parameters_update ON public.material_specification_parameters;
CREATE POLICY material_specification_parameters_update
  ON public.material_specification_parameters FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.material_specifications s
                  WHERE s.id = specification_id
                    AND public.app_is_company_member(s.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.material_specifications s
                       WHERE s.id = specification_id
                         AND public.app_is_company_member(s.company_id)));

DROP POLICY IF EXISTS material_specification_parameters_delete ON public.material_specification_parameters;
CREATE POLICY material_specification_parameters_delete
  ON public.material_specification_parameters FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.material_specifications s
                  WHERE s.id = specification_id
                    AND public.app_is_company_member(s.company_id)));

REVOKE ALL ON public.material_specification_parameters FROM PUBLIC;
REVOKE ALL ON public.material_specification_parameters FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_specification_parameters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_specification_parameters TO service_role;

DROP TRIGGER IF EXISTS trg_material_specifications_touch ON public.material_specifications;
CREATE TRIGGER trg_material_specifications_touch
  BEFORE UPDATE ON public.material_specifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_materials_touch_updated_at();
