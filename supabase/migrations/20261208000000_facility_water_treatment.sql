-- =====================================================================
--  FACILITY LOGS, PART 5 — WATER TREATMENT (W6·29, FL-10 and FL-11)
--
--  `water` has been one of the six facility log types since
--  20261204000000, and the register has been able to show a water
--  reading all along. What it cannot show is FL-11, because FL-11's
--  limits are not the shape the environmental model assumes.
--
--  ── THE DEFECT THAT MAKES THIS ITS OWN MODEL ──
--
--  `facility_log_outcome()` asks one question: is the result ABOVE the
--  limit. That is right for a settle plate, where more growth is
--  worse. FL-11 draws four different kinds of limit:
--
--      Free chlorine after carbon      0.00
--      Conductivity, RO permeate       1.3 or less
--      pH, loop return                 5.0 – 7.0
--      Total viable count, PW-03       100 or less
--      Coliforms, PW-03                Absent in 100 mL
--
--  pH is a RANGE. Expressed as an upper bound of 7.0 and fed to the
--  environmental function, a pH of 4.0 — far too acidic to release
--  water on — comes back `within_limits`, because 4.0 is not greater
--  than 7.0. That was confirmed against the live function before this
--  migration was written, and section B of the new suite holds it so
--  it cannot come back.
--
--  Coliforms are QUALITATIVE: "Absent in 100 mL" is not a number and
--  there is no arithmetic that makes it one.
--
--  So water results get their own derivation. It is the same
--  principle as every other facility rule: the DATABASE decides
--  whether a result met its limit, never the caller.
--
--  ── WHAT ESTABLISHES THE FIELDS ──
--
--  FL-11's own note, which also names the requirement:
--
--      "Fields are those PRD G3.8 names: source, treatment method,
--       testing frequency, results and testing laboratory. Lab
--       reports attach to the result. The overdue monthly analysis
--       uses the same alert rule as environmental tests (FL-02), as
--       engineering item 22 requires."
--
--  All five are here, and FL-11 draws the treatment method as an
--  ORDERED TRAIN — "Borehole BH-1 → Sand filter → Carbon filter →
--  Softener → Reverse osmosis RO-1 → UV lamp UV-1 → Purified water
--  loop" — so it is a table with a position, not a text field.
--
--  ── NOT INVENTED ──
--
--  No WHO or pharmacopoeial limits are written into this migration.
--  FL-11's monthly analysis says "Per WHO drinking-water list", and
--  that is a reference to somebody else's document: the actual
--  figures are a company's own specification. A limit here is always
--  data, never a constant.
--
--  No automatic deviation, no sign-off, no second signature. None is
--  drawn in W6·29.
-- =====================================================================

-- ── 1. The source, and its treatment train ───────────────────────────

CREATE TABLE IF NOT EXISTS public.facility_water_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  site_id       uuid REFERENCES public.sites (id) ON DELETE SET NULL,

  --  "Purified water for production, from borehole BH-1."
  name          text NOT NULL,
  --  "SOURCE · BOREHOLE BH-1, 60 M"
  source_ref    text,
  source_detail text,
  --  What the treated water is for. FL-11's header: "Purified water
  --  for production".
  purpose       text,

  /**
   *  FL-11's note says the overdue rule is "the same alert rule as
   *  environmental tests (FL-02)", and FL-02 keeps its escalation
   *  days PER ZONE. So a source may name the zone whose escalation
   *  days apply to it. Nullable, because FL-01's borehole row sits at
   *  the site rather than in a graded room — and where it is null,
   *  no escalation is configured rather than a default being invented.
   */
  zone_id       uuid REFERENCES public.facility_zones (id) ON DELETE SET NULL,

  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT facility_water_source_name_chk CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS idx_water_sources_company
  ON public.facility_water_sources (company_id);

/**
 *  The treatment train, in order. FL-11 draws it as a chain with
 *  arrows, so position matters and is unique within a source.
 */
CREATE TABLE IF NOT EXISTS public.facility_water_stages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  source_id     uuid NOT NULL REFERENCES public.facility_water_sources (id) ON DELETE CASCADE,

  position      integer NOT NULL CHECK (position >= 0),
  --  "Reverse osmosis RO-1", "UV lamp UV-1"
  name          text NOT NULL,
  equipment_ref text,

  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source_id, position),
  CONSTRAINT facility_water_stage_name_chk CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS idx_water_stages_source
  ON public.facility_water_stages (source_id, position);


-- ── 2. The tests, and the four shapes of limit FL-11 draws ───────────

CREATE TABLE IF NOT EXISTS public.facility_water_tests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  source_id     uuid NOT NULL REFERENCES public.facility_water_sources (id) ON DELETE CASCADE,

  --  "Conductivity, RO permeate", "Coliforms, PW-03"
  name          text NOT NULL,
  --  Where in the train it is drawn, when FL-11 names a point.
  sample_point  text,

  --  Daily / Weekly / Monthly on FL-11. Constrained to the same three
  --  the screen shows plus quarterly, matching the environmental
  --  schedule's vocabulary so the two read alike.
  frequency     text NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly')),

  /**
   *  WHICH KIND OF LIMIT, which decides how a result is judged.
   *  Read off FL-11's LIMIT column:
   *
   *    'max'         — "1.3 or less", "100 or less", "0.00"
   *    'range'       — "5.0 – 7.0"
   *    'qualitative' — "Absent in 100 mL"
   *
   *  Constrained, unlike a unit or a laboratory name, because the
   *  derivation below switches on it: an unknown kind would have no
   *  defined way to judge a result.
   */
  limit_kind    text NOT NULL CHECK (limit_kind IN ('max','range','qualitative')),
  limit_min     numeric(14,4),
  limit_max     numeric(14,4),
  --  "Absent" — what a qualitative result has to say to pass.
  expected_text text,
  result_unit   text,

  --  PRD G3.8's "testing laboratory". In-house with an analyst, or an
  --  external laboratory — the two FL-11 shows.
  laboratory_kind text NOT NULL DEFAULT 'in_house'
                  CHECK (laboratory_kind IN ('in_house','external')),
  laboratory_name text,

  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT facility_water_test_name_chk CHECK (btrim(name) <> ''),

  /**
   *  A limit has to be usable for the kind it claims to be. Without
   *  this a 'range' test with no bounds would silently judge
   *  everything as unassessable, and a 'qualitative' test with no
   *  expected text would have nothing to compare against.
   */
  CONSTRAINT facility_water_limit_shape_chk CHECK (
    (limit_kind = 'max'   AND limit_max IS NOT NULL)
    OR (limit_kind = 'range' AND limit_min IS NOT NULL AND limit_max IS NOT NULL)
    OR (limit_kind = 'qualitative' AND btrim(coalesce(expected_text,'')) <> '')
  ),
  --  An inverted range would judge every result as outside it.
  CONSTRAINT facility_water_range_ordered_chk CHECK (
    limit_kind <> 'range' OR limit_max >= limit_min
  )
);

CREATE INDEX IF NOT EXISTS idx_water_tests_source
  ON public.facility_water_tests (source_id);


-- ── 3. Results ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.facility_water_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  test_id       uuid NOT NULL REFERENCES public.facility_water_tests (id) ON DELETE CASCADE,

  sampled_on    date NOT NULL,
  due_on        date,

  result_value  numeric(14,4),
  --  "Absent". A qualitative result is text and no arithmetic makes
  --  it a number.
  result_text   text,

  /**
   *  FL-11's "Not received · due 15 Oct". A monthly analysis sent to
   *  an external laboratory is a real, recorded state that is neither
   *  a pass nor a failure nor a missed test — the sample was taken
   *  and the report has not come back.
   */
  received      boolean NOT NULL DEFAULT true,
  --  "Lab reports attach to the result" — the reference to the
  --  report, and which laboratory issued it.
  report_ref    text,
  laboratory_name text,
  analyst_name  text,

  /**
   *  DERIVED by fn_facility_water_outcome(). Whatever a caller sends
   *  is discarded, exactly as for an environmental reading: whether
   *  purified water met its specification is the evidential content
   *  of the record.
   */
  outcome       text NOT NULL DEFAULT 'not_assessed'
                CHECK (outcome IN (
                  'within_limits','outside_limits',
                  'awaiting_laboratory','not_assessed'
                )),

  notes         text,
  recorded_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_water_results_test
  ON public.facility_water_results (test_id, sampled_on DESC);


-- ── 4. The derivation ────────────────────────────────────────────────

/**
 *  Whether a water result met its limit.
 *
 *  IMMUTABLE and total: every combination returns something, because
 *  a null outcome on a NOT NULL column would abort the write and the
 *  reason would be hard to find.
 *
 *  The order of the tests matters. "Not received" is checked first:
 *  a report that has not arrived cannot be judged, and judging it as
 *  a pass would be the worst possible default.
 */
CREATE OR REPLACE FUNCTION public.facility_water_outcome(
  p_limit_kind    text,
  p_limit_min     numeric,
  p_limit_max     numeric,
  p_expected_text text,
  p_result_value  numeric,
  p_result_text   text,
  p_received      boolean
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    --  The sample was taken; the laboratory has not reported.
    WHEN NOT coalesce(p_received, true) THEN 'awaiting_laboratory'

    WHEN p_limit_kind = 'qualitative' THEN
      CASE
        WHEN btrim(coalesce(p_result_text, '')) = '' THEN 'not_assessed'
        --  Compared case-insensitively and trimmed: "absent" and
        --  "Absent " are the same answer, and a mismatch on spacing
        --  would read as a failed water test.
        WHEN lower(btrim(p_result_text)) = lower(btrim(coalesce(p_expected_text, '')))
          THEN 'within_limits'
        ELSE 'outside_limits'
      END

    WHEN p_result_value IS NULL THEN 'not_assessed'

    --  BOTH ENDS. This is the whole reason this function exists
    --  rather than reusing facility_log_outcome(): a pH below the
    --  range is as much a failure as one above it.
    WHEN p_limit_kind = 'range' THEN
      CASE
        WHEN p_limit_min IS NULL OR p_limit_max IS NULL THEN 'not_assessed'
        WHEN p_result_value < p_limit_min OR p_result_value > p_limit_max
          THEN 'outside_limits'
        ELSE 'within_limits'
      END

    WHEN p_limit_kind = 'max' THEN
      CASE
        WHEN p_limit_max IS NULL THEN 'not_assessed'
        --  Inclusive, so a free-chlorine limit of 0.00 passes on a
        --  result of 0.00. FL-11 draws exactly that row.
        WHEN p_result_value > p_limit_max THEN 'outside_limits'
        ELSE 'within_limits'
      END

    ELSE 'not_assessed'
  END
$$;


CREATE OR REPLACE FUNCTION public.fn_facility_water_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE t record;
BEGIN
  SELECT w.company_id, w.limit_kind, w.limit_min, w.limit_max,
         w.expected_text, w.result_unit, w.laboratory_name
    INTO t
    FROM public.facility_water_tests w
   WHERE w.id = NEW.test_id;

  IF t IS NULL THEN
    RAISE EXCEPTION 'WATER_TEST_NOT_FOUND';
  END IF;
  IF t.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'WATER_TEST_WRONG_COMPANY';
  END IF;

  --  Inherited when the caller leaves it out, so a result cannot
  --  disagree with the test it belongs to.
  IF NEW.laboratory_name IS NULL THEN
    NEW.laboratory_name := t.laboratory_name;
  END IF;

  NEW.outcome := public.facility_water_outcome(
    t.limit_kind, t.limit_min, t.limit_max, t.expected_text,
    NEW.result_value, NEW.result_text, NEW.received
  );

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_facility_water_outcome ON public.facility_water_results;
CREATE TRIGGER trg_facility_water_outcome
  BEFORE INSERT OR UPDATE ON public.facility_water_results
  FOR EACH ROW EXECUTE FUNCTION public.fn_facility_water_outcome();


/**
 *  A stage and a test both belong to a source of their own company.
 *  Same hole, same close, as the zone and schedule triggers in
 *  20261205000000.
 */
CREATE OR REPLACE FUNCTION public.fn_facility_water_child_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT s.company_id INTO v_company
    FROM public.facility_water_sources s WHERE s.id = NEW.source_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'WATER_SOURCE_NOT_FOUND';
  END IF;
  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'WATER_SOURCE_WRONG_COMPANY';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_facility_water_stage_integrity ON public.facility_water_stages;
CREATE TRIGGER trg_facility_water_stage_integrity
  BEFORE INSERT OR UPDATE ON public.facility_water_stages
  FOR EACH ROW EXECUTE FUNCTION public.fn_facility_water_child_integrity();

DROP TRIGGER IF EXISTS trg_facility_water_test_integrity ON public.facility_water_tests;
CREATE TRIGGER trg_facility_water_test_integrity
  BEFORE INSERT OR UPDATE ON public.facility_water_tests
  FOR EACH ROW EXECUTE FUNCTION public.fn_facility_water_child_integrity();


-- ── 5. RLS ───────────────────────────────────────────────────────────

ALTER TABLE public.facility_water_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_water_stages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_water_tests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_water_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_iso_water_sources" ON public.facility_water_sources;
CREATE POLICY "company_iso_water_sources" ON public.facility_water_sources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.company_id = facility_water_sources.company_id)
  );

DROP POLICY IF EXISTS "company_iso_water_stages" ON public.facility_water_stages;
CREATE POLICY "company_iso_water_stages" ON public.facility_water_stages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.company_id = facility_water_stages.company_id)
  );

DROP POLICY IF EXISTS "company_iso_water_tests" ON public.facility_water_tests;
CREATE POLICY "company_iso_water_tests" ON public.facility_water_tests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.company_id = facility_water_tests.company_id)
  );

DROP POLICY IF EXISTS "company_iso_water_results" ON public.facility_water_results;
CREATE POLICY "company_iso_water_results" ON public.facility_water_results
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.company_id = facility_water_results.company_id)
  );


-- ── 6. FL-11's register ──────────────────────────────────────────────

/**
 *  Each test with its latest result. SECURITY INVOKER, so the
 *  caller's own RLS decides what comes back — the same posture as
 *  `facility_log_register` and `facility_pest_register`.
 */
CREATE OR REPLACE FUNCTION public.facility_water_register(p_company_id uuid)
RETURNS TABLE (
  test_id         uuid,
  source_id       uuid,
  source_name     text,
  source_ref      text,
  test_name       text,
  sample_point    text,
  frequency       text,
  limit_kind      text,
  limit_min       numeric,
  limit_max       numeric,
  expected_text   text,
  result_unit     text,
  laboratory_kind text,
  laboratory_name text,
  last_result_id  uuid,
  last_sampled_on date,
  last_due_on     date,
  last_value      numeric,
  last_text       text,
  last_received   boolean,
  last_report_ref text,
  last_outcome    text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT w.id, s.id, s.name, s.source_ref,
         w.name, w.sample_point, w.frequency,
         w.limit_kind, w.limit_min, w.limit_max, w.expected_text, w.result_unit,
         w.laboratory_kind, w.laboratory_name,
         r.id, r.sampled_on, r.due_on, r.result_value, r.result_text,
         r.received, r.report_ref, r.outcome
    FROM public.facility_water_tests w
    JOIN public.facility_water_sources s ON s.id = w.source_id
    LEFT JOIN LATERAL (
      SELECT x.* FROM public.facility_water_results x
       WHERE x.test_id = w.id
       ORDER BY x.sampled_on DESC, x.created_at DESC
       LIMIT 1
    ) r ON true
   WHERE w.company_id = p_company_id
     AND w.is_active
   ORDER BY s.name, w.name
$$;

GRANT EXECUTE ON FUNCTION public.facility_water_outcome(
  text, numeric, numeric, text, numeric, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.facility_water_register(uuid) TO authenticated;
