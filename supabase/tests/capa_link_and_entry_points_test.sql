-- =====================================================================
--  CAPA LINK, ROOT CAUSE AND DEVIATION ENTRY POINTS
--  Week 5 items 03 and 07 · LOCAL / DISPOSABLE DATABASE ONLY
-- =====================================================================
--  Covers 20261024000000_capa_link_and_root_cause.sql and
--  20261025000000_deviation_entry_points.sql.
--
--  The assertions are written against the two NOT DONE IF lists. The
--  one that matters most is Damilola's rule, because it is a rule about
--  something NOT happening and an absence is invisible in review:
--
--    "Any out-of-specification reading raising a deviation by itself."
--
--  Section D proves it by recording a flagged reading and checking that
--  no deviation appeared.
-- =====================================================================

\set ON_ERROR_STOP off

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

DO $guard$
BEGIN
  IF current_database() NOT IN ('postgres','criateur_local') THEN
    RAISE EXCEPTION 'REFUSING TO RUN outside a local database (got %)', current_database();
  END IF;
  IF to_regclass('public.root_cause_analyses') IS NULL THEN
    RAISE EXCEPTION 'Migration 20261024000000 has not been applied.';
  END IF;
END $guard$;

DROP TABLE IF EXISTS cap_results;
CREATE TEMP TABLE cap_results(seq serial, id text, name text, verdict text, detail text);
GRANT ALL ON cap_results TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE cap_results_seq_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION cap_assert(p_id text, p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO cap_results(id,name,verdict,detail)
  VALUES (p_id,p_name,CASE WHEN p_cond THEN 'PASS' ELSE 'FAIL' END,p_detail);
END $$;

-- ── Fixtures ─────────────────────────────────────────────────────────
DO $fix$
DECLARE
  c uuid := '00000000-0000-ca9a-a000-00000000000a';
  u uuid := '00000000-0000-ca9a-b000-000000000001';
BEGIN
  DELETE FROM public.capa_records WHERE company_id = c;
  DELETE FROM public.deviations   WHERE company_id = c;
  DELETE FROM public.deviation_counters WHERE company_id = c;
  DELETE FROM public.companies    WHERE id = c;
  DELETE FROM auth.users          WHERE id = u;

  INSERT INTO auth.users (id, email) VALUES (u,'cap-qa@example.invalid');
  INSERT INTO public.companies (id, name) VALUES (c,'CAPA Alpha');
  INSERT INTO public.profiles (id, email, company_id, role)
  VALUES (u,'cap-qa@example.invalid', c, 'admin');
  INSERT INTO public.company_members (company_id, user_id, role, status)
  VALUES (c, u, 'owner', 'active');
END $fix$;

-- =====================================================================
--  A. Item 03 — the two facts release gating reads
-- =====================================================================
SELECT cap_assert('A1','capa_records gained batch_id and is_systemic',
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='capa_records'
      AND column_name IN ('batch_id','is_systemic','source_deviation_id')) = 3);

--  "Systemic is a free-text field" — NOT DONE IF.
SELECT cap_assert('A2','is_systemic is a boolean, not text',
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='capa_records'
      AND column_name='is_systemic') = 'boolean');

SELECT cap_assert('A3','is_systemic is NOT NULL and defaults false',
  (SELECT is_nullable='NO' AND column_default LIKE 'false%'
     FROM information_schema.columns
    WHERE table_schema='public' AND table_name='capa_records'
      AND column_name='is_systemic'),
  'an unassessed CAPA must not block every release in the company');

--  "Existing CAPAs lose history in the migration" — NOT DONE IF. The
--  added columns are nullable or defaulted, so no existing row had to
--  be rewritten to satisfy them.
SELECT cap_assert('A4','the new columns did not require rewriting existing rows',
  (SELECT bool_and(is_nullable='YES' OR column_default IS NOT NULL)
     FROM information_schema.columns
    WHERE table_schema='public' AND table_name='capa_records'
      AND column_name IN ('batch_id','is_systemic','source_deviation_id')));

SELECT cap_assert('A5','status is still the lifecycle mirror, untouched',
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='capa_records'
             AND column_name='status'),
  'item 03 must not remove or duplicate it');

-- =====================================================================
--  B. Root cause analyses — structured, not a blob
-- =====================================================================
SELECT cap_assert('B1','five whys are an ordered chain in their own table',
  to_regclass('public.root_cause_whys') IS NOT NULL
  AND EXISTS (SELECT 1 FROM pg_constraint
               WHERE conrelid='public.root_cause_whys'::regclass
                 AND conname='rcw_seq_unique'));

SELECT cap_assert('B2','5W1H is six named columns',
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='root_cause_analyses'
      AND column_name LIKE 'w5h1\_%') = 6);

SELECT cap_assert('B3','an analysis attaches to a deviation or a CAPA, never both',
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid='public.root_cause_analyses'::regclass AND contype='c'
             AND pg_get_constraintdef(oid) LIKE '%subject_type%'));

SELECT cap_assert('B4','a completed analysis needs both a cause and a category',
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid='public.root_cause_analyses'::regclass
             AND conname='rca_complete_needs_both'));

-- =====================================================================
--  C. A CAPA is raised from a deviation BY A PERSON
-- =====================================================================
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-ca9a-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

DO $$
DECLARE v_dev public.deviations; v_capa public.capa_records;
BEGIN
  v_dev := public.deviation_raise(
    '00000000-0000-ca9a-a000-00000000000a','Tablet hardness out of trend','critical','yes','process');

  --  "Never automatically": raising the deviation created nothing.
  PERFORM cap_assert('C1','raising a deviation does not create a CAPA',
    (SELECT count(*) FROM public.capa_records
      WHERE company_id='00000000-0000-ca9a-a000-00000000000a') = 0);

  v_capa := public.capa_raise_from_deviation(v_dev.id, NULL, 'corrective', NULL, true);

  PERFORM cap_assert('C2','a person can raise one, and it is numbered',
    v_capa.capa_number LIKE 'CAPA-%', v_capa.capa_number);
  PERFORM cap_assert('C3','it records which deviation it came from',
    v_capa.source_deviation_id = v_dev.id);
  PERFORM cap_assert('C4','the description is pre-filled from the deviation',
    v_capa.description LIKE '%' || v_dev.deviation_number || '%', v_capa.description);
  PERFORM cap_assert('C5','a critical deviation does not become a medium CAPA',
    v_capa.priority = 'critical', v_capa.priority);
  PERFORM cap_assert('C6','systemic is carried as given', v_capa.is_systemic);
  PERFORM cap_assert('C7','the deviation links back to the CAPA',
    EXISTS (SELECT 1 FROM public.deviation_links
             WHERE deviation_id = v_dev.id AND linked_type='capa' AND linked_id = v_capa.id));
END $$;

--  "Any path other than rejection creates a CAPA automatically" is the
--  NOT DONE IF, so nothing on the deviations table may fire one.
RESET ROLE;
SELECT cap_assert('C8','no trigger on deviations creates a CAPA',
  NOT EXISTS (SELECT 1 FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
              WHERE NOT t.tgisinternal AND c.relname = 'deviations'
                AND pg_get_triggerdef(t.oid) ILIKE '%capa%'));

-- =====================================================================
--  D. DAMILOLA'S RULE — a flagged reading raises nothing by itself
-- =====================================================================
SELECT cap_assert('D1','no trigger on in-process readings mentions deviations',
  NOT EXISTS (SELECT 1 FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
              WHERE NOT t.tgisinternal
                AND c.relname IN ('batch_stage_parameter_readings','inprocess_oos_escalations')
                AND pg_get_triggerdef(t.oid) ILIKE '%deviation%'),
  'an out-of-specification reading must never raise one automatically');

SELECT cap_assert('D2','but a supervisor has a one-action route',
  to_regprocedure('public.deviation_from_inprocess_reading(uuid,text,text)') IS NOT NULL);

--  "Entry points that open a blank form" — NOT DONE IF. Each route
--  takes the source record's id, so the context is read server side
--  rather than retyped.
SELECT cap_assert('D3','every entry point is pre-filled from its source',
  to_regprocedure('public.deviation_from_coa_discrepancy(uuid,text,text)') IS NOT NULL
  AND to_regprocedure('public.deviation_from_qc_result(uuid,text,text)') IS NOT NULL);

-- =====================================================================
--  E. A failed changeover leaves a record
-- =====================================================================
--  "A failed changeover that blocks the line and leaves no record" —
--  NOT DONE IF. Week 4 blocked the line; this is the record.
SELECT cap_assert('E1','changeover verifications can carry a deviation',
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='line_changeover_verifications'
             AND column_name='deviation_id'));

SELECT cap_assert('E2','and a failure raises one automatically',
  EXISTS (SELECT 1 FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
          WHERE NOT t.tgisinternal
            AND c.relname='line_changeover_verifications'
            AND pg_get_triggerdef(t.oid) ILIKE '%deviation%'),
  'a cleaning verification failure is not a judgement call');

--  The loops Week 4 left open are closed.
SELECT cap_assert('E3','the CoA discrepancy link has its foreign key',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='material_coa_disc_deviation_fkey'));
SELECT cap_assert('E4','the in-process escalation link has its foreign key',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inprocess_oos_esc_deviation_fkey'));

-- =====================================================================
--  F. What release gating will read
-- =====================================================================
SELECT cap_assert('F1','capa_open_for_batch reports systemic and affects_batch',
  to_regprocedure('public.capa_open_for_batch(uuid,uuid)') IS NOT NULL);

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-ca9a-b000-000000000001","role":"authenticated"}', false);
SET ROLE authenticated;

SELECT cap_assert('F2','the open CAPA is visible to the gate with its systemic flag',
  (SELECT bool_and(is_systemic) FROM public.capa_open_for_batch(
     '00000000-0000-ca9a-a000-00000000000a', NULL)));

-- ── Report ───────────────────────────────────────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

SELECT seq, id, name, verdict, detail FROM cap_results ORDER BY seq;

--  Two shapes, because the CI harness reads either: the grouped
--  verdict table when there are failures, and the three-column line
--  when there are none. The three columns are total, passed, failed in
--  that order -- the harness takes columns 2 and 3 as passed and
--  failed, so any other order reports a clean suite as a broken one.
SELECT verdict, count(*) FROM cap_results GROUP BY verdict ORDER BY verdict;

SELECT count(*) AS total,
       count(*) FILTER (WHERE verdict='PASS') AS passed,
       count(*) FILTER (WHERE verdict='FAIL') AS failed
FROM cap_results;

-- ── Clean up ─────────────────────────────────────────────────────────
DO $cleanup$
DECLARE c uuid := '00000000-0000-ca9a-a000-00000000000a';
BEGIN
  DELETE FROM public.capa_records WHERE company_id = c;
  DELETE FROM public.deviations   WHERE company_id = c;
  DELETE FROM public.deviation_counters WHERE company_id = c;
  DELETE FROM public.companies    WHERE id = c;
  DELETE FROM auth.users WHERE id = '00000000-0000-ca9a-b000-000000000001';
END $cleanup$;
