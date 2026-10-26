/*
 * ====================================================================
 *  FL-09 — the deep cleaning schedule, and cleaning records
 * ====================================================================
 *
 *  W6·29's FL-09 draws one page, "Cleaning", with two tables: the DEEP
 *  CLEANING SCHEDULE (zone, every, last deep clean, next due, status)
 *  and RECENT CLEANING RECORDS (record, zone · line, type · method,
 *  chemicals, contact, done · verified).
 *
 *  Its footnote is the specification for both:
 *
 *    "Fields are those PRD G3.6 names: date, operator, method,
 *     chemicals, contact time, line or zone. The deep cleaning
 *     schedule shares the overdue rule set in Zones & schedules
 *     (FL-02), so there is one alert mechanism for every facility
 *     log."
 *
 *  So NO new schedule table is created. A deep clean is already a
 *  `facility_zone_schedules` row with log_type 'cleaning_deep', and it
 *  already has a frequency and a zone. What was missing is the detail
 *  a cleaning record carries, which an environmental reading does not,
 *  and the two read models the screen needs.
 *
 *  PRD G3.6 is NOT in the repository — as G3.8 was not for water and
 *  G3.9 was not for pest control. The design's quotation of it is the
 *  only evidence available, and that is stated rather than glossed.
 *
 *  ------------------------------------------------------------------
 *  TWO RULES READ OFF THE DESIGN'S OWN NUMBERS, NOT ASSUMED
 *  ------------------------------------------------------------------
 *
 *  (1) AN UNVERIFIED DEEP CLEAN DOES NOT SATISFY THE SCHEDULE.
 *
 *  FL-09's first schedule row is Granulation room G2: last deep clean
 *  "15 Sep · CR-2026-0302 · Sadiq Musa", next due 15 Oct, status
 *  "Overdue · 6 days". Its records table, on the same screen, shows
 *  CR-2026-0415 — zone G2, type Deep, finished 21 Oct 08:05 — with
 *  "Awaiting Grace Eze".
 *
 *  A deep clean was therefore PERFORMED on 21 Oct and the schedule
 *  still reports 15 Sep and still reports overdue. The only reading
 *  that makes those two tables agree is that the schedule counts
 *  verified records. FL-08 states the same rule in words beside its
 *  save panel: "The overdue alert clears when Grace Eze verifies."
 *
 *  This is confined to the deep cleaning schedule. FL-01's general
 *  register is untouched, because nothing else in W6·29 is verified
 *  and changing it would restate every environmental row.
 *
 *  (2) NEXT DUE IS A CALENDAR INTERVAL, NOT A DAY COUNT.
 *
 *  The client's FREQUENCY_DAYS answers "has the window passed" in
 *  whole days — 30 for a month, 91 for a quarter. Those do not
 *  reproduce FL-09:
 *
 *      01 Oct + 30 days = 31 Oct   the design draws 01 Nov
 *      02 Aug + 91 days = 01 Nov   the design draws 02 Nov
 *
 *  while `+ interval '1 month'` and `+ interval '3 months'` give 01
 *  Nov and 02 Nov exactly, and reproduce the other three rows too. A
 *  due DATE is a calendar question. FREQUENCY_DAYS is left alone: it
 *  answers a different question and FL-01 depends on it.
 *
 *  ------------------------------------------------------------------
 *  NOT INVENTED
 *  ------------------------------------------------------------------
 *
 *  No rule that a verifier must differ from the operator. Every row
 *  the design draws happens to name two different people and FL-08
 *  says "Supervisor, after you save", but the design states no
 *  constraint and the product has no supervisor role to bind one to.
 *  Imposing four-eyes here would be inventing a GMP sign-off
 *  requirement. Recorded as an open decision instead; a test asserts
 *  this migration imposes none, so adding one later is a decision
 *  somebody takes rather than a line that drifts in.
 *
 *  No automatic deviation and no automatic CAPA when a deep clean goes
 *  overdue. FL-09 draws an alert, not a record.
 *
 *  No "due soon" threshold claimed as the design's. See
 *  facility_deep_clean_schedule below: the design constrains it and
 *  does not state it, and the choice is named where it is made.
 */


-- ── 1. What a cleaning record carries ────────────────────────────────

/*
 *  PRD G3.6's fields, as FL-09 quotes them. All nullable: the columns
 *  live on facility_log_entries beside the environmental ones, the way
 *  20261210000000 put sample_method there, rather than in a side table
 *  that every read of a log entry would have to join.
 *
 *  `date` and `operator` are not added — recorded_at and recorded_by
 *  already hold them, and a second pair would be two answers to one
 *  question.
 */
ALTER TABLE public.facility_log_entries
  --  "wipe down, top to bottom", "foam and rinse". Free text: the
  --  design shows a different method on every row.
  ADD COLUMN IF NOT EXISTS cleaning_method   text,
  --  "Hypochlorite 1%, IPA 70%" is drawn as a list and reads as one.
  --  An array, so a company can be asked which agents it used without
  --  parsing a sentence back apart.
  ADD COLUMN IF NOT EXISTS cleaning_agents   text[],
  --  "15 min". Minutes, because that is the unit the design prints.
  ADD COLUMN IF NOT EXISTS contact_minutes   integer,
  --  FL-09's "ZONE · LINE": D-1 · BAL-03 is a balance inside the
  --  dispensary, so the line or equipment is per RECORD and not the
  --  zone's own line_ref.
  ADD COLUMN IF NOT EXISTS line_ref          text,
  --  FL-08's panel draws Started and Finished as two times.
  ADD COLUMN IF NOT EXISTS started_at        timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at       timestamptz,
  --  FL-09's "Awaiting Grace Eze" / "Grace Eze ✓".
  ADD COLUMN IF NOT EXISTS verified_by       uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at       timestamptz;

/*
 *  'cleaning_changeover' is added to the ENTRY vocabulary only.
 *
 *  FL-09's records table draws three cleaning types — "Deep ·",
 *  "Routine ·" and "Changeover · foam and rinse" — against two in the
 *  original CHECK. The type column is a vocabulary the screen renders,
 *  so a changeover clean needs a value or it cannot be recorded.
 *
 *  facility_zone_schedules is deliberately NOT widened. A changeover
 *  clean follows a product changeover, not a frequency, so there is
 *  nothing for it to be scheduled against — and FL-09 shows it only in
 *  the records table, never in the schedule above it.
 */
ALTER TABLE public.facility_log_entries
  DROP CONSTRAINT IF EXISTS facility_log_entries_log_type_check;

ALTER TABLE public.facility_log_entries
  ADD CONSTRAINT facility_log_entries_log_type_check CHECK (log_type IN (
    'environmental_air', 'environmental_surface',
    'cleaning_routine', 'cleaning_deep', 'cleaning_changeover',
    'water', 'pest_control'
  ));

/*
 *  Cleaning detail belongs to a cleaning record. A settle plate has no
 *  chemicals and no contact time, and a row carrying them would print
 *  as a clean in FL-09's records table.
 */
ALTER TABLE public.facility_log_entries
  DROP CONSTRAINT IF EXISTS facility_entry_cleaning_shape_chk;

ALTER TABLE public.facility_log_entries
  ADD CONSTRAINT facility_entry_cleaning_shape_chk CHECK (
    log_type IN ('cleaning_routine', 'cleaning_deep', 'cleaning_changeover')
    OR (
      cleaning_method IS NULL
      AND cleaning_agents IS NULL
      AND contact_minutes IS NULL
      AND started_at IS NULL
      AND finished_at IS NULL
    )
  );

--  A contact time of zero is not a short contact time, it is no
--  contact: the chemical never touched the surface.
ALTER TABLE public.facility_log_entries
  DROP CONSTRAINT IF EXISTS facility_entry_contact_minutes_chk;

ALTER TABLE public.facility_log_entries
  ADD CONSTRAINT facility_entry_contact_minutes_chk CHECK (
    contact_minutes IS NULL OR contact_minutes > 0
  );

--  A clean cannot finish before it started.
ALTER TABLE public.facility_log_entries
  DROP CONSTRAINT IF EXISTS facility_entry_clean_window_chk;

ALTER TABLE public.facility_log_entries
  ADD CONSTRAINT facility_entry_clean_window_chk CHECK (
    started_at IS NULL OR finished_at IS NULL OR finished_at >= started_at
  );

/*
 *  A verification is a person AND a time, or it is neither. Half of it
 *  is not a weaker verification, it is an unreadable one: "verified,
 *  but nobody knows when" and "verified at 08:05, but nobody knows by
 *  whom" are both unusable as evidence.
 */
ALTER TABLE public.facility_log_entries
  DROP CONSTRAINT IF EXISTS facility_entry_verification_pair_chk;

ALTER TABLE public.facility_log_entries
  ADD CONSTRAINT facility_entry_verification_pair_chk CHECK (
    (verified_by IS NULL) = (verified_at IS NULL)
  );

--  The schedule reads the latest VERIFIED clean per schedule, which is
--  the one lookup this feature makes on every page load.
CREATE INDEX IF NOT EXISTS idx_facility_entries_verified
  ON public.facility_log_entries (schedule_id, verified_at DESC)
  WHERE verified_at IS NOT NULL;


-- ── 2. Verification integrity ────────────────────────────────────────

/**
 *  Two things a CHECK cannot say, because both need another row.
 *
 *  (a) A verifier must belong to the company that owns the record.
 *      Without this, a verification could name a profile from another
 *      tenant and the record would print that person's name.
 *
 *  (b) A verification cannot be withdrawn or rewritten once made.
 *
 *  (b) deserves its reason stated, because it is the stricter of the
 *  two. FL-09 prints a verification as the evidence that a deep clean
 *  satisfied its schedule, and FL-08 says the overdue alert clears on
 *  it. If it could be cleared, an alert that had cleared would
 *  silently come back with no record of why, and a GMP record would
 *  have lost a signature it once carried. The same reasoning stopped a
 *  closed pest finding being re-opened as a note.
 *
 *  It is NOT a new sign-off requirement: nothing here says a record
 *  must be verified, only that a verification once given stands. If
 *  the owner wants verifications withdrawable, this is the one block
 *  to remove.
 *
 *  SECURITY INVOKER, like every other trigger in this feature. Its
 *  lookup on profiles runs under the caller's own RLS, so a profile
 *  from another company is invisible rather than merely wrong — which
 *  is why the refusal below says what was actually checked instead of
 *  guessing which of the two causes applied.
 */
CREATE OR REPLACE FUNCTION public.fn_facility_cleaning_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NEW.verified_by IS NOT NULL THEN
    SELECT true INTO v_ok
      FROM public.profiles p
     WHERE p.id = NEW.verified_by
       AND p.company_id = NEW.company_id
     LIMIT 1;

    IF v_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'FACILITY_VERIFIER_WRONG_COMPANY'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.verified_at IS NOT NULL THEN
    IF NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
      RAISE EXCEPTION 'FACILITY_VERIFICATION_IS_FINAL'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_facility_cleaning_verification ON public.facility_log_entries;
CREATE TRIGGER trg_facility_cleaning_verification
  BEFORE INSERT OR UPDATE ON public.facility_log_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_facility_cleaning_verification();


-- ── 3. FL-09's deep cleaning schedule ────────────────────────────────

/**
 *  One row per active 'cleaning_deep' schedule: the zone, how often,
 *  the last VERIFIED deep clean with its reference and operator, the
 *  next due date, and how the status reads.
 *
 *  THE "DUE SOON" THRESHOLD IS A CHOICE, AND IT IS MADE HERE.
 *
 *  FL-09 draws five rows against a today of 21 Oct 2026. QC micro lab
 *  is due 24 Oct — three days out — and reads "Due in 3 days".
 *  Compression hall C1 is due 01 Nov, eleven days out, and reads "On
 *  schedule"; Packing P1 at twelve days and Dispensary D-1 at twenty
 *  read the same. So the design CONSTRAINS the threshold to somewhere
 *  from 3 to 10 days and STATES none.
 *
 *  Seven days is the choice, named as p_due_soon_days so a caller can
 *  see it and a test can pin it. It is not dressed up as the design's.
 *
 *  SECURITY INVOKER on purpose — RLS still applies to every table it
 *  reads, so a caller sees their own company and no more. The company
 *  argument is for filtering, not for authorisation.
 */
CREATE OR REPLACE FUNCTION public.facility_deep_clean_schedule(
  p_company_id    uuid,
  p_due_soon_days integer DEFAULT 7
)
RETURNS TABLE (
  schedule_id      uuid,
  zone_id          uuid,
  zone_name        text,
  zone_grade       text,
  frequency        text,
  description      text,
  last_cleaned_at  timestamptz,
  last_reference   text,
  last_operator    text,
  next_due_on      date,
  days_until_due   integer,
  status           text
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH last_verified AS (
    SELECT s.id AS schedule_id, e.recorded_at, e.reference, e.recorded_by
      FROM public.facility_zone_schedules s
      LEFT JOIN LATERAL (
        SELECT le.*
          FROM public.facility_log_entries le
         WHERE le.schedule_id = s.id
           AND le.log_type = 'cleaning_deep'
           AND le.performed
           --  The rule the design's own two tables prove: an
           --  unverified clean leaves the schedule where it was.
           AND le.verified_at IS NOT NULL
         ORDER BY le.recorded_at DESC
         LIMIT 1
      ) e ON true
     WHERE s.company_id = p_company_id
       AND s.log_type = 'cleaning_deep'
       AND s.is_active
  ),
  due AS (
    SELECT
      s.id, z.id AS zid, z.name, z.grade, s.frequency, s.description,
      lv.recorded_at, lv.reference,
      coalesce(nullif(trim(p.full_name), ''), p.email) AS operator,
      CASE
        WHEN lv.recorded_at IS NULL THEN NULL
        WHEN s.frequency = 'daily'     THEN (lv.recorded_at + interval '1 day')::date
        WHEN s.frequency = 'weekly'    THEN (lv.recorded_at + interval '7 days')::date
        WHEN s.frequency = 'monthly'   THEN (lv.recorded_at + interval '1 month')::date
        WHEN s.frequency = 'quarterly' THEN (lv.recorded_at + interval '3 months')::date
      END AS next_due
      FROM public.facility_zone_schedules s
      JOIN public.facility_zones z ON z.id = s.zone_id
      JOIN last_verified lv ON lv.schedule_id = s.id
      LEFT JOIN public.profiles p ON p.id = lv.recorded_by
     WHERE z.is_active
  )
  SELECT
    d.id, d.zid, d.name, d.grade, d.frequency, d.description,
    d.recorded_at, d.reference, d.operator, d.next_due,
    CASE WHEN d.next_due IS NULL THEN NULL
         ELSE (d.next_due - current_date)::integer END,
    CASE
      --  Never cleaned under this schedule. Not "on schedule" and not
      --  a number of days overdue either, because there is no date to
      --  count from — the same distinction FL-01 draws as "Not
      --  sampled" rather than folding it into a pass.
      WHEN d.next_due IS NULL                           THEN 'never_cleaned'
      WHEN d.next_due < current_date                    THEN 'overdue'
      WHEN d.next_due - current_date <= p_due_soon_days THEN 'due_soon'
      ELSE 'on_schedule'
    END
  FROM due d
  ORDER BY
    CASE
      WHEN d.next_due IS NULL        THEN 0
      WHEN d.next_due < current_date THEN 1
      ELSE 2
    END,
    d.next_due NULLS FIRST,
    d.name
$$;

REVOKE ALL ON FUNCTION public.facility_deep_clean_schedule(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.facility_deep_clean_schedule(uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.facility_deep_clean_schedule(uuid, integer) IS
  'FL-09''s deep cleaning schedule. Counts only VERIFIED deep cleans, which is what makes the design''s two tables agree. SECURITY INVOKER, so RLS decides what the caller sees.';


-- ── 4. FL-09's recent cleaning records ───────────────────────────────

/**
 *  The second table: every cleaning record, newest first, with the
 *  PRD G3.6 fields and both halves of FL-09's "DONE · VERIFIED"
 *  column.
 *
 *  All three cleaning types, because the design's records table draws
 *  all three — including the changeover clean that has no schedule.
 */
CREATE OR REPLACE FUNCTION public.facility_cleaning_records(
  p_company_id uuid,
  p_limit      integer DEFAULT 50
)
RETURNS TABLE (
  entry_id        uuid,
  reference       text,
  zone_id         uuid,
  zone_name       text,
  zone_code       text,
  line_ref        text,
  log_type        text,
  cleaning_method text,
  cleaning_agents text[],
  contact_minutes integer,
  started_at      timestamptz,
  finished_at     timestamptz,
  recorded_at     timestamptz,
  operator_name   text,
  verified_at     timestamptz,
  verifier_name   text,
  schedule_id     uuid
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id, e.reference, z.id, z.name, z.code,
    coalesce(e.line_ref, z.line_ref),
    e.log_type, e.cleaning_method, e.cleaning_agents, e.contact_minutes,
    e.started_at, e.finished_at, e.recorded_at,
    coalesce(nullif(trim(op.full_name), ''), op.email),
    e.verified_at,
    coalesce(nullif(trim(vb.full_name), ''), vb.email),
    e.schedule_id
  FROM public.facility_log_entries e
  JOIN public.facility_zones z ON z.id = e.zone_id
  LEFT JOIN public.profiles op ON op.id = e.recorded_by
  LEFT JOIN public.profiles vb ON vb.id = e.verified_by
 WHERE e.company_id = p_company_id
   AND e.log_type IN ('cleaning_routine', 'cleaning_deep', 'cleaning_changeover')
 ORDER BY coalesce(e.finished_at, e.recorded_at) DESC
 LIMIT greatest(p_limit, 1)
$$;

REVOKE ALL ON FUNCTION public.facility_cleaning_records(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.facility_cleaning_records(uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.facility_cleaning_records(uuid, integer) IS
  'FL-09''s recent cleaning records, with the PRD G3.6 fields. SECURITY INVOKER, so RLS decides what the caller sees.';
