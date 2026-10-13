-- ===================================================================
--  WEEK 4 / ITEM 10 — EQUIPMENT CALIBRATION AND LOCKOUT
--
--  "Instruments registered with calibration due dates and certificates,
--   stored with upload validation.
--   An instrument with expired calibration blocks sign-off on any step
--   recording its use, starting with the dispensing balance.
--   Approaching expiry alerts the equipment owner.
--   Calibration status visible on the dispensing screen."
--
--  NOT DONE IF
--    The lockout exists in the interface only.
--    Expired status is displayed but the sign-off still succeeds.
--    Instrument use is not recorded against the step.
--
--  The brief adds: "Promised to Neimeth in writing, with the flowchart.
--  This is the first thing to protect after the chain itself." So the
--  lockout is in the database, on every write path, and the test suite
--  goes at it through the RPCs AND through direct calls.
--
--  THE CALIBRATION STATE IS NEVER STORED AS A STATE
--  ------------------------------------------------
--  Item 04 learned this the hard way and wrote it down: its retest check
--  "re-derives retest and expiry from dates rather than trusting the
--  status mirror, so the answer does not depend on the sweep having run".
--  The same reasoning, more sharply, applies here — "expired status is
--  displayed but the sign-off still succeeds" is a NOT DONE IF, and the
--  surest way to build that bug is to have a stored `calibration_status`
--  that a sweep is supposed to keep current.
--
--  So there is no calibration status column anywhere. Whether an
--  instrument may be used is computed from its due date every time it is
--  asked, by one function, which both the lockout and the screen call.
--  instruments.status exists but is about SERVICE (in service, out of
--  service, retired), not calibration.
-- ===================================================================


-- ── 1. What an uploaded certificate may be ────────────────────────────
--
--  Thin aliases over item 05's list rather than a second list. A
--  calibration certificate is the same kind of artefact as a certificate
--  of analysis — a PDF or a scan — and two lists would drift: the day
--  somebody adds image/webp to one, the other quietly keeps refusing it.
--  The names exist so a reader of this file is not sent to a function
--  called "material_*" to find out what an instrument may carry.
CREATE OR REPLACE FUNCTION public.calibration_document_allowed_types()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp
AS $$ SELECT public.material_document_allowed_types(); $$;

CREATE OR REPLACE FUNCTION public.calibration_document_max_bytes()
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp
AS $$ SELECT public.material_document_max_bytes(); $$;

COMMENT ON FUNCTION public.calibration_document_allowed_types() IS
  'MIME allow-list for calibration certificates. Deliberately the same list as material documents, by delegation rather than by copy, so the two cannot diverge.';

GRANT EXECUTE ON FUNCTION public.calibration_document_allowed_types() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calibration_document_max_bytes() TO authenticated, service_role;


-- ── 2. The instrument register ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.instruments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code            text NOT NULL,
  name            text NOT NULL,
  instrument_type text NOT NULL,
  manufacturer    text,
  model           text,
  serial_number   text,
  location        text,

  --  "Approaching expiry alerts the equipment owner", so the register has
  --  to know who that is. Nullable: an instrument can be recorded before
  --  anybody is made responsible for it, and the alert then says so
  --  rather than going nowhere quietly.
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  --  SERVICE state, not calibration state. An instrument can be in
  --  service and out of calibration — that is the whole case this item
  --  exists for — so conflating the two would be the bug.
  status          text NOT NULL DEFAULT 'in_service',

  --  DERIVED from the certificates below, maintained by trigger, and
  --  refused to every other writer. NULL means "never calibrated", which
  --  the lockout treats as blocked: an uncalibrated balance is not a
  --  balance you may weigh a batch on.
  calibration_due_date date,
  last_calibrated_on   date,

  notes           text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.instruments IS
  'The instrument register. calibration_due_date is derived from instrument_calibrations by trigger and refused to any other writer; whether an instrument may be USED is never read from a column at all but computed from that date — see instrument_block_reason().';
COMMENT ON COLUMN public.instruments.status IS
  'Service state: in_service, out_of_service, retired. NOT calibration state. An instrument may be in service and out of calibration, which is precisely the case the lockout exists for.';
COMMENT ON COLUMN public.instruments.calibration_due_date IS
  'When the current calibration lapses, derived from the most recently PERFORMED calibration certificate. NULL means never calibrated, which blocks use. Maintained by trigger; a direct write is refused.';

DO $instr_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='instruments_code_uniq') THEN
    ALTER TABLE public.instruments ADD CONSTRAINT instruments_code_uniq UNIQUE (company_id, code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='instruments_status_chk') THEN
    ALTER TABLE public.instruments ADD CONSTRAINT instruments_status_chk
      CHECK (status IN ('in_service','out_of_service','retired'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='instruments_code_blank_chk') THEN
    ALTER TABLE public.instruments ADD CONSTRAINT instruments_code_blank_chk
      CHECK (btrim(code) <> '' AND btrim(name) <> '' AND btrim(instrument_type) <> '');
  END IF;
END
$instr_checks$;

CREATE INDEX IF NOT EXISTS instruments_company_idx ON public.instruments(company_id, status);
--  The sweep's query: what is coming due.
CREATE INDEX IF NOT EXISTS instruments_due_idx
  ON public.instruments(company_id, calibration_due_date)
  WHERE calibration_due_date IS NOT NULL AND status <> 'retired';

ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instruments_select ON public.instruments;
CREATE POLICY instruments_select ON public.instruments FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS instruments_write ON public.instruments;
CREATE POLICY instruments_write ON public.instruments FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));


-- ── 3. Calibration certificates, with upload validation ──────────────

CREATE TABLE IF NOT EXISTS public.instrument_calibrations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instrument_id       uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  certificate_number  text,
  --  When the calibration was PERFORMED, and when it lapses. Both
  --  required: a certificate that does not say when it expires cannot
  --  support a lockout.
  calibrated_on       date NOT NULL,
  due_on              date NOT NULL,
  --  Who did it. An in-house calibration and a third-party one are both
  --  legitimate; what matters is that the record says which.
  performed_by_org    text,
  performed_in_house  boolean NOT NULL DEFAULT false,
  result              text NOT NULL DEFAULT 'pass',

  document_path       text,
  document_mime_type  text,
  document_size_bytes bigint,

  uploaded_by         uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.instrument_calibrations IS
  'Calibration certificates for an instrument. Append-only: a certificate is evidence, and one that can be edited into a later due date is a lockout that can be switched off. A mistake is corrected by recording the correct certificate, which supersedes it.';

DO $cal_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ic_dates_chk') THEN
    ALTER TABLE public.instrument_calibrations ADD CONSTRAINT ic_dates_chk
      CHECK (due_on > calibrated_on);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ic_result_chk') THEN
    ALTER TABLE public.instrument_calibrations ADD CONSTRAINT ic_result_chk
      CHECK (result IN ('pass','fail','pass_with_adjustment'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ic_size_chk') THEN
    ALTER TABLE public.instrument_calibrations ADD CONSTRAINT ic_size_chk
      CHECK (document_size_bytes IS NULL OR document_size_bytes >= 0);
  END IF;
END
$cal_checks$;

CREATE INDEX IF NOT EXISTS ic_instrument_idx
  ON public.instrument_calibrations(instrument_id, calibrated_on DESC, created_at DESC);

ALTER TABLE public.instrument_calibrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ic_select ON public.instrument_calibrations;
CREATE POLICY ic_select ON public.instrument_calibrations FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS ic_insert ON public.instrument_calibrations;
CREATE POLICY ic_insert ON public.instrument_calibrations FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

REVOKE UPDATE, DELETE, TRUNCATE ON public.instrument_calibrations FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.fn_ic_immutable()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'CALIBRATION_IMMUTABLE: a calibration certificate cannot be % once recorded — a due date that can be edited is a lockout that can be switched off. Record the correct certificate instead; the most recent one supersedes.',
    lower(TG_OP) USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_ic_immutable ON public.instrument_calibrations;
CREATE TRIGGER trg_ic_immutable
  BEFORE UPDATE OR DELETE ON public.instrument_calibrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_ic_immutable();


--  "stored with upload validation" — the same shape as item 05's
--  certificate validation, and for the same stated reason: the path is a
--  security boundary, so it is not self-asserted.
CREATE OR REPLACE FUNCTION public.fn_ic_validate_document()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE v_first text; v_company uuid;
BEGIN
  --  The instrument must belong to the company the row claims.
  SELECT company_id INTO v_company FROM public.instruments WHERE id = NEW.instrument_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'CALIBRATION_NO_INSTRUMENT: no such instrument %', NEW.instrument_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'CALIBRATION_INSTRUMENT_FOREIGN: instrument % belongs to another company',
      NEW.instrument_id USING ERRCODE = 'P0001';
  END IF;

  IF NEW.document_path IS NULL OR btrim(NEW.document_path) = '' THEN
    --  A certificate recorded without the file attached is legitimate —
    --  the dates are the substance for the lockout — but it must not
    --  then claim a type or a size for a file that is not there.
    IF NEW.document_mime_type IS NOT NULL OR NEW.document_size_bytes IS NOT NULL THEN
      RAISE EXCEPTION 'CALIBRATION_DOC_NO_PATH: a document type or size was given with no document path'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.document_mime_type IS NULL THEN
    RAISE EXCEPTION 'CALIBRATION_DOC_NO_TYPE: a document must declare its MIME type'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.document_size_bytes IS NULL THEN
    RAISE EXCEPTION 'CALIBRATION_DOC_NO_SIZE: a document must declare its size'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (NEW.document_mime_type = ANY (public.calibration_document_allowed_types())) THEN
    RAISE EXCEPTION 'CALIBRATION_DOC_TYPE_REJECTED: % is not an accepted document type (accepted: %)',
      NEW.document_mime_type,
      array_to_string(public.calibration_document_allowed_types(), ', ')
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.document_size_bytes <= 0 THEN
    RAISE EXCEPTION 'CALIBRATION_DOC_EMPTY: a document of zero bytes is not a document'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.document_size_bytes > public.calibration_document_max_bytes() THEN
    RAISE EXCEPTION 'CALIBRATION_DOC_TOO_LARGE: % bytes exceeds the % byte limit',
      NEW.document_size_bytes, public.calibration_document_max_bytes()
      USING ERRCODE = 'P0001';
  END IF;

  --  THE PATH IS A SECURITY BOUNDARY. The storage policy scopes by the
  --  first folder, so a row that could name another company's folder
  --  would have the policy faithfully grant access to it.
  v_first := split_part(NEW.document_path, '/', 1);
  IF v_first IS NULL OR v_first = '' OR v_first <> NEW.company_id::text THEN
    RAISE EXCEPTION
      'CALIBRATION_DOC_PATH_SCOPE: a document path must begin with the owning company id (%), not %',
      NEW.company_id, coalesce(nullif(v_first,''), '(nothing)')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ic_validate_document ON public.instrument_calibrations;
CREATE TRIGGER trg_ic_validate_document
  BEFORE INSERT ON public.instrument_calibrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_ic_validate_document();


--  The bucket, private, with the storage service's own limits so an
--  upload is refused before the bytes land. Guarded the same way item 05
--  guards its provisioning, because storage.* is absent on a plain
--  Postgres and the validation above holds regardless.
CREATE OR REPLACE FUNCTION public.provision_calibration_documents_bucket()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $prov$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RETURN 'storage.buckets absent; nothing provisioned. The validation trigger applies regardless.';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='storage' AND table_name='buckets'
                AND column_name='allowed_mime_types') THEN
    EXECUTE format($q$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('calibration-documents','calibration-documents', false, %s, %L)
      ON CONFLICT (id) DO UPDATE
        SET public = false,
            file_size_limit = excluded.file_size_limit,
            allowed_mime_types = excluded.allowed_mime_types
    $q$, public.calibration_document_max_bytes(), public.calibration_document_allowed_types());
  ELSE
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('calibration-documents','calibration-documents', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
  END IF;

  RETURN 'calibration-documents bucket provisioned, private.';
END;
$prov$;

DO $prov_now$
BEGIN
  PERFORM public.provision_calibration_documents_bucket();
END
$prov_now$;


-- ── 4. The due date is derived, and refused to everyone else ─────────

CREATE OR REPLACE FUNCTION public.fn_instruments_sync_calibration()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record;
BEGIN
  --  The CURRENT calibration is the most recently PERFORMED one, not the
  --  one with the latest due date. Those differ when an old certificate
  --  with a long validity is entered after a newer short one, and taking
  --  the furthest due date would then extend the lockout using a
  --  superseded certificate.
  SELECT calibrated_on, due_on, result INTO c
    FROM public.instrument_calibrations
   WHERE instrument_id = NEW.instrument_id
   ORDER BY calibrated_on DESC, created_at DESC
   LIMIT 1;

  PERFORM set_config('app.instrument_cal_sync','1',true);
  UPDATE public.instruments
     SET calibration_due_date =
           --  A FAILED calibration does not grant a due date. The
           --  instrument reverts to uncalibrated, which blocks it —
           --  which is the point of calibrating it.
           CASE WHEN c.result = 'fail' THEN NULL ELSE c.due_on END,
         last_calibrated_on = c.calibrated_on,
         updated_at = now()
   WHERE id = NEW.instrument_id;
  PERFORM set_config('app.instrument_cal_sync','',true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_instruments_sync_calibration ON public.instrument_calibrations;
CREATE TRIGGER trg_instruments_sync_calibration
  AFTER INSERT ON public.instrument_calibrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_instruments_sync_calibration();

CREATE OR REPLACE FUNCTION public.fn_instruments_guard_calibration()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.calibration_due_date IS DISTINCT FROM OLD.calibration_due_date
      OR NEW.last_calibrated_on IS DISTINCT FROM OLD.last_calibrated_on)
     AND coalesce(current_setting('app.instrument_cal_sync', true),'') <> '1' THEN
    RAISE EXCEPTION
      'INSTRUMENT_CALIBRATION_READ_ONLY: the calibration due date is derived from the instrument''s certificates; record a calibration instead of writing it'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_instruments_guard_calibration ON public.instruments;
CREATE TRIGGER trg_instruments_guard_calibration
  BEFORE UPDATE ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.fn_instruments_guard_calibration();

COMMENT ON FUNCTION public.fn_instruments_guard_calibration() IS
  'Item 10: "expired status is displayed but the sign-off still succeeds" is a NOT DONE IF. The surest way to build that bug is a due date somebody can push forward by hand, so this refuses it. The only way to extend a calibration is to record a calibration.';


-- ── 5. The lockout ───────────────────────────────────────────────────
--
--  One function answers "may this instrument be used", and both the
--  lockout and the screen call it — so "calibration status visible on the
--  dispensing screen" and the block that stops the sign-off cannot
--  disagree, which is the third NOT DONE IF in one stroke.
--
--  Computed from the due date every time. Nothing is read from a stored
--  calibration state, because there isn't one.
CREATE OR REPLACE FUNCTION public.instrument_block_reason(p_instrument_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE i record;
BEGIN
  SELECT id, company_id, code, name, status, calibration_due_date
    INTO i FROM public.instruments WHERE id = p_instrument_id;

  IF i.id IS NULL THEN
    RETURN 'That instrument is not in the register.';
  END IF;

  --  Refuses by RAISING rather than returning, because a NULL return
  --  reads as "usable" to every caller.
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(i.company_id) THEN
    RAISE EXCEPTION 'INSTRUMENT_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  IF i.status = 'retired' THEN
    RETURN format('%s (%s) has been retired and cannot be used.', i.name, i.code);
  END IF;
  IF i.status = 'out_of_service' THEN
    RETURN format('%s (%s) is out of service.', i.name, i.code);
  END IF;

  IF i.calibration_due_date IS NULL THEN
    RETURN format('%s (%s) has no calibration on record, so it cannot be used for a recorded step. Record its calibration certificate first.',
                  i.name, i.code);
  END IF;

  --  The comparison that is the whole item. Derived here, now, from the
  --  date — not from anything a sweep was supposed to have updated.
  IF i.calibration_due_date < current_date THEN
    RETURN format('%s (%s) went out of calibration on %s and cannot be used until it is recalibrated.',
                  i.name, i.code, to_char(i.calibration_due_date,'DD Mon YYYY'));
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.instrument_block_reason(uuid) IS
  'NULL when an instrument may be used for a recorded step, otherwise a sentence naming it and the reason. Computed from the calibration due date at the moment of asking, never from a stored calibration status — so the answer cannot lag a sweep. The dispensing screen and the lockout both call this, which is what stops the two from disagreeing.';

REVOKE ALL ON FUNCTION public.instrument_block_reason(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.instrument_block_reason(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.instrument_assert_usable(p_instrument_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_reason text;
BEGIN
  v_reason := public.instrument_block_reason(p_instrument_id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'INSTRUMENT_NOT_CALIBRATED: %', v_reason USING ERRCODE = 'P0001';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.instrument_assert_usable(uuid) IS
  'Raises INSTRUMENT_NOT_CALIBRATED unless the instrument may be used. The hard half of the lockout: called from the dispensing gate and from stage completion, so "the lockout exists in the interface only" cannot be true.';

REVOKE ALL ON FUNCTION public.instrument_assert_usable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.instrument_assert_usable(uuid) TO authenticated, service_role;


-- ── 6. Instrument use, recorded against the step ─────────────────────
--
--  "Instrument use is not recorded against the step" is a NOT DONE IF, so
--  there is a table for it rather than a column on each kind of step. One
--  table because the brief says "ANY step recording its use": dispensing
--  is the one named, stage execution is the next, and a per-step column
--  would mean a new column and a new lockout each time.
--
--  The due date is SNAPSHOTTED at use. Six months later, "was this
--  balance in calibration when it weighed that batch" must be answerable
--  from the record itself and not by replaying certificates.

CREATE TABLE IF NOT EXISTS public.instrument_usages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instrument_id  uuid NOT NULL REFERENCES public.instruments(id) ON DELETE RESTRICT,
  entity_type    text NOT NULL,
  entity_id      uuid NOT NULL,
  used_at        timestamptz NOT NULL DEFAULT now(),
  used_by        uuid,
  --  Snapshots, for the question asked long afterwards.
  due_on_at_use  date,
  instrument_code_at_use text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.instrument_usages IS
  'Which instrument was used for which step. One table rather than a column per step, because the brief says "any step recording its use". The calibration due date is snapshotted so "was this balance in calibration when it weighed that batch" is answerable from the record rather than by replaying certificates.';

DO $usage_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='iu_entity_type_chk') THEN
    ALTER TABLE public.instrument_usages ADD CONSTRAINT iu_entity_type_chk
      CHECK (entity_type IN ('dispensing_record','batch_stage'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='iu_uniq') THEN
    ALTER TABLE public.instrument_usages ADD CONSTRAINT iu_uniq
      UNIQUE (instrument_id, entity_type, entity_id);
  END IF;
END
$usage_checks$;

CREATE INDEX IF NOT EXISTS iu_entity_idx ON public.instrument_usages(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS iu_instrument_idx ON public.instrument_usages(instrument_id, used_at DESC);

ALTER TABLE public.instrument_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iu_select ON public.instrument_usages;
CREATE POLICY iu_select ON public.instrument_usages FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS iu_insert ON public.instrument_usages;
CREATE POLICY iu_insert ON public.instrument_usages FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

REVOKE UPDATE, DELETE, TRUNCATE ON public.instrument_usages FROM authenticated, anon;


--  Recording a use is itself gated: an out-of-calibration instrument
--  cannot be recorded as having been used for a step that is still being
--  signed. (A use recorded by the dispensing trigger has already passed
--  the same check; this covers the hand-recorded path, which is stages.)
CREATE OR REPLACE FUNCTION public.fn_iu_gate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE i record;
BEGIN
  SELECT id, company_id, code, calibration_due_date INTO i
    FROM public.instruments WHERE id = NEW.instrument_id;
  IF i.id IS NULL THEN
    RAISE EXCEPTION 'INSTRUMENT_NOT_FOUND: no such instrument %', NEW.instrument_id
      USING ERRCODE = 'P0002';
  END IF;
  IF i.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'INSTRUMENT_FOREIGN: instrument % belongs to another company',
      NEW.instrument_id USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.instrument_assert_usable(NEW.instrument_id);

  NEW.due_on_at_use := i.calibration_due_date;
  NEW.instrument_code_at_use := i.code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_iu_gate ON public.instrument_usages;
CREATE TRIGGER trg_iu_gate
  BEFORE INSERT ON public.instrument_usages
  FOR EACH ROW EXECUTE FUNCTION public.fn_iu_gate();


CREATE OR REPLACE FUNCTION public.instrument_record_use(
  p_instrument_id uuid,
  p_entity_type   text,
  p_entity_id     uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid; v_actor uuid := auth.uid(); v_id uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.instruments WHERE id = p_instrument_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'INSTRUMENT_NOT_FOUND: no such instrument %', p_instrument_id
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(v_company) THEN
    RAISE EXCEPTION 'INSTRUMENT_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE = 'P0001';
  END IF;

  --  The entity has to exist, and be this company's. An orphan usage row
  --  is a record of nothing.
  IF p_entity_type = 'batch_stage' THEN
    IF NOT EXISTS (SELECT 1 FROM public.batch_stages
                    WHERE id = p_entity_id AND company_id = v_company) THEN
      RAISE EXCEPTION 'INSTRUMENT_USE_NO_STAGE: no such batch stage in this company'
        USING ERRCODE = 'P0002';
    END IF;
  ELSIF p_entity_type = 'dispensing_record' THEN
    IF NOT EXISTS (SELECT 1 FROM public.dispensing_records
                    WHERE id = p_entity_id AND company_id = v_company) THEN
      RAISE EXCEPTION 'INSTRUMENT_USE_NO_DISPENSING: no such dispensing in this company'
        USING ERRCODE = 'P0002';
    END IF;
  ELSE
    RAISE EXCEPTION 'INSTRUMENT_USE_BAD_ENTITY: % is not a step that records instrument use',
      p_entity_type USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.instrument_usages
    (company_id, instrument_id, entity_type, entity_id, used_by)
  VALUES (v_company, p_instrument_id, p_entity_type, p_entity_id, v_actor)
  ON CONFLICT (instrument_id, entity_type, entity_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'usage_id', v_id,
    'already_recorded', v_id IS NULL);
END;
$$;

COMMENT ON FUNCTION public.instrument_record_use(uuid,text,uuid) IS
  'Records that an instrument was used for a step. Refused for an instrument that is out of calibration, so a step cannot be built on one and then signed.';

REVOKE ALL ON FUNCTION public.instrument_record_use(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.instrument_record_use(uuid,text,uuid) TO authenticated, service_role;


-- ── 7. The dispensing balance: the lockout's first subject ───────────
--
--  Item 09 recorded the balance as free text and left a marked link
--  point: dispensing_records.instrument_id, commented
--  "WEEK 4 ITEM 10 LINKAGE ... no foreign key yet because the instrument
--  registry does not exist". It exists now, so the link is made and the
--  placeholder is retired.
--
--  WHY THE SIGNATURE OF material_dispense CHANGES
--  ----------------------------------------------
--  p_balance_identifier text becomes p_instrument_id uuid. "Instrument
--  use is not recorded against the step" is a NOT DONE IF, and a typed
--  string is not a recorded instrument — nothing can check its
--  calibration. balance_identifier survives on the row as a SNAPSHOT of
--  the instrument's code, set by the gate from the register, so a printed
--  batch record still reads correctly years later.

ALTER TABLE public.dispensing_records
  DROP CONSTRAINT IF EXISTS dispensing_records_instrument_id_fkey;
ALTER TABLE public.dispensing_records
  ADD CONSTRAINT dispensing_records_instrument_id_fkey
  FOREIGN KEY (instrument_id) REFERENCES public.instruments(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.dispensing_records.instrument_id IS
  'The registered balance this quantity was weighed on. Required: the calibration lockout has nothing to check without it. The foreign key and the requirement arrived with Week 4 item 10.';
COMMENT ON COLUMN public.dispensing_records.balance_identifier IS
  'The instrument''s code, snapshotted from the register at the moment of dispensing, so a printed batch record still reads correctly if the instrument is ever recoded. Set by the gate trigger, not by the caller.';

--  The gate gains two jobs: require a registered instrument, and refuse
--  one that is out of calibration. Added here rather than inside
--  fn_dispensing_gate() so item 09's gate stays about item 09's rules
--  and this one is legible as the lockout. It is named to sort AFTER
--  trg_dispensing_gate, so the clearance and the lot are reported first
--  — an operator with three problems should hear about the material
--  before the balance.
CREATE OR REPLACE FUNCTION public.fn_dispensing_instrument_gate()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE i record;
BEGIN
  IF NEW.instrument_id IS NULL THEN
    RAISE EXCEPTION
      'DISPENSE_NO_INSTRUMENT: the balance used has to be a registered instrument, so its calibration can be checked. Register the balance and name it on the dispensing.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id, company_id, code, instrument_type INTO i
    FROM public.instruments WHERE id = NEW.instrument_id;
  IF i.id IS NULL THEN
    RAISE EXCEPTION 'INSTRUMENT_NOT_FOUND: no such instrument %', NEW.instrument_id
      USING ERRCODE = 'P0002';
  END IF;
  IF i.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'INSTRUMENT_FOREIGN: instrument % belongs to another company',
      NEW.instrument_id USING ERRCODE = 'P0001';
  END IF;

  --  THE LOCKOUT, on the dispensing balance, where the brief says to
  --  start. Raises INSTRUMENT_NOT_CALIBRATED.
  PERFORM public.instrument_assert_usable(NEW.instrument_id);

  --  The snapshot. Overwrites whatever the caller supplied: the code is
  --  the register's to state, not the caller's.
  NEW.balance_identifier := i.code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispensing_instrument_gate ON public.dispensing_records;
CREATE TRIGGER trg_dispensing_instrument_gate
  BEFORE INSERT ON public.dispensing_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_dispensing_instrument_gate();


--  And the use is recorded against the step, automatically. Doing it by
--  trigger rather than asking the RPC to remember is what makes
--  "instrument use is not recorded against the step" unconstructable:
--  there is no path that writes a dispensing without also writing the
--  usage row.
CREATE OR REPLACE FUNCTION public.fn_dispensing_record_instrument_use()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.instrument_usages
    (company_id, instrument_id, entity_type, entity_id, used_by, used_at)
  VALUES (NEW.company_id, NEW.instrument_id, 'dispensing_record', NEW.id,
          NEW.dispensed_by, NEW.dispensed_at)
  ON CONFLICT (instrument_id, entity_type, entity_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispensing_record_instrument_use ON public.dispensing_records;
CREATE TRIGGER trg_dispensing_record_instrument_use
  AFTER INSERT ON public.dispensing_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_dispensing_record_instrument_use();


--  The RPC, with p_instrument_id where p_balance_identifier was. DROP
--  then CREATE because an argument list cannot be changed in place.
DROP FUNCTION IF EXISTS public.material_dispense(uuid,uuid,numeric,text,uuid,uuid,numeric,uuid,uuid,text,uuid,text);

CREATE OR REPLACE FUNCTION public.material_dispense(
  p_batch_id            uuid,
  p_material_lot_id     uuid,
  p_actual_quantity     numeric,
  p_instrument_id       uuid,
  p_formula_material_id uuid    DEFAULT NULL,
  p_batch_stage_id      uuid    DEFAULT NULL,
  p_required_quantity   numeric DEFAULT NULL,
  p_signature_id        uuid    DEFAULT NULL,
  p_authorised_by       uuid    DEFAULT NULL,
  p_authorisation_reason text   DEFAULT NULL,
  p_authorisation_signature_id uuid DEFAULT NULL,
  p_notes               text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  b record; l record; fm record;
  v_required numeric; v_exception boolean := false;
  v_tol numeric; v_dev numeric; v_limit numeric;
  v_id uuid; v_remaining numeric; v_reason text;
BEGIN
  SELECT id, company_id, batch_number, formula_id INTO b
    FROM public.batch_records WHERE id = p_batch_id;
  IF b.id IS NULL THEN
    RAISE EXCEPTION 'DISPENSE_NO_BATCH: no such batch record %', p_batch_id USING ERRCODE='P0002';
  END IF;
  IF NOT public.app_is_service_context()
     AND NOT public.app_is_company_member(b.company_id) THEN
    RAISE EXCEPTION 'DISPENSE_FORBIDDEN: caller is not a member of the owning company'
      USING ERRCODE='P0001';
  END IF;

  IF p_actual_quantity IS NULL OR p_actual_quantity <= 0 THEN
    RAISE EXCEPTION 'DISPENSE_BAD_QUANTITY: the dispensed quantity must be greater than zero'
      USING ERRCODE='P0001';
  END IF;

  --  The balance, checked here so the operator is told before the insert
  --  and in a sentence. The gate trigger refuses it again regardless.
  IF p_instrument_id IS NULL THEN
    RAISE EXCEPTION
      'DISPENSE_NO_INSTRUMENT: the balance used has to be a registered instrument, so its calibration can be checked'
      USING ERRCODE='P0001';
  END IF;
  v_reason := public.instrument_block_reason(p_instrument_id);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION 'INSTRUMENT_NOT_CALIBRATED: %', v_reason USING ERRCODE='P0001';
  END IF;

  SELECT id, company_id, material_id, lot_number, unit_of_measure INTO l
    FROM public.material_lots WHERE id = p_material_lot_id;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'DISPENSE_NO_LOT: no such material lot %', p_material_lot_id USING ERRCODE='P0002';
  END IF;
  IF l.company_id <> b.company_id THEN
    RAISE EXCEPTION 'DISPENSE_LOT_FOREIGN: that lot belongs to another company' USING ERRCODE='P0001';
  END IF;

  IF p_formula_material_id IS NOT NULL THEN
    SELECT fmm.id, fmm.formula_id, fmm.tolerance_pct, fmm.quantity_per_batch,
           fmm.overage_pct, fmm.unit, m.name AS material_name
      INTO fm
      FROM public.master_formula_materials fmm
      JOIN public.materials m ON m.id = fmm.material_id
     WHERE fmm.id = p_formula_material_id;
    IF fm.id IS NULL THEN
      RAISE EXCEPTION 'DISPENSE_NO_FORMULA_LINE: no such formula material line %',
        p_formula_material_id USING ERRCODE='P0002';
    END IF;

    --  Units before any arithmetic; see item 09's note on why.
    IF fm.unit IS NOT NULL AND l.unit_of_measure IS NOT NULL
       AND lower(btrim(fm.unit)) <> lower(btrim(l.unit_of_measure)) THEN
      RAISE EXCEPTION
        'DISPENSE_FORMULA_UNIT_MISMATCH: the formula asks for % in % but lot % is held in %; no conversion is applied, so either the formula line or the lot is in the wrong unit',
        fm.material_name, fm.unit, l.lot_number, l.unit_of_measure
        USING ERRCODE='P0001';
    END IF;

    v_required := fm.quantity_per_batch * (1 + coalesce(fm.overage_pct,0) / 100.0);
    v_tol := fm.tolerance_pct;
    v_dev := abs(p_actual_quantity - v_required);
    IF v_tol IS NULL THEN
      v_exception := v_dev > 0;
    ELSE
      v_limit := v_required * v_tol / 100.0;
      v_exception := v_dev > v_limit;
    END IF;
  ELSE
    v_required := coalesce(p_required_quantity, p_actual_quantity);
  END IF;

  IF v_exception THEN
    IF p_authorised_by IS NULL OR coalesce(btrim(p_authorisation_reason),'') = '' THEN
      RAISE EXCEPTION
        'DISPENSE_AUTHORISATION_REQUIRED: % % against a required % % is outside tolerance for %, so it needs a named supervisor and a reason',
        p_actual_quantity, coalesce(l.unit_of_measure,'?'), v_required,
        coalesce(l.unit_of_measure,'?'), coalesce(fm.material_name,'this material')
        USING ERRCODE='P0001';
    END IF;
    IF p_authorised_by = coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid) THEN
      RAISE EXCEPTION
        'DISPENSE_SELF_AUTHORISED: the person dispensing cannot authorise their own out-of-tolerance quantity'
        USING ERRCODE='P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.company_members
                    WHERE company_id = b.company_id AND user_id = p_authorised_by
                      AND status = 'active') THEN
      RAISE EXCEPTION
        'DISPENSE_AUTHORISER_UNKNOWN: the named supervisor is not an active member of this company'
        USING ERRCODE='P0001';
    END IF;
  END IF;

  --  balance_identifier is a placeholder the instrument gate overwrites
  --  from the register.
  INSERT INTO public.dispensing_records
    (company_id, batch_id, batch_stage_id, formula_material_id,
     material_id, material_lot_id, internal_lot_number,
     required_quantity, actual_quantity, unit,
     balance_identifier, instrument_id, dispensed_by, dispense_signature_id,
     tolerance_exception, authorised_by, authorisation_reason, authorisation_signature_id,
     notes)
  VALUES
    (b.company_id, p_batch_id, p_batch_stage_id, p_formula_material_id,
     l.material_id, p_material_lot_id, l.lot_number,
     v_required, p_actual_quantity, coalesce(l.unit_of_measure,'ea'),
     'pending', p_instrument_id,
     coalesce(v_actor,'00000000-0000-0000-0000-000000000000'::uuid), p_signature_id,
     v_exception,
     CASE WHEN v_exception THEN p_authorised_by END,
     CASE WHEN v_exception THEN btrim(p_authorisation_reason) END,
     CASE WHEN v_exception THEN p_authorisation_signature_id END,
     nullif(btrim(coalesce(p_notes,'')),''))
  RETURNING id INTO v_id;

  SELECT quantity_available INTO v_remaining
    FROM public.material_lots WHERE id = p_material_lot_id;

  RETURN jsonb_build_object(
    'ok', true,
    'dispensing_id', v_id,
    'required_quantity', v_required,
    'actual_quantity', p_actual_quantity,
    'tolerance_exception', v_exception,
    'lot_remaining', v_remaining,
    'balance', (SELECT balance_identifier FROM public.dispensing_records WHERE id = v_id));
END;
$$;

COMMENT ON FUNCTION public.material_dispense(uuid,uuid,numeric,uuid,uuid,uuid,numeric,uuid,uuid,text,uuid,text) IS
  'Dispenses a quantity of a lot to a batch, weighed on a named registered instrument. Checks the line clearance, the lot, the instrument''s calibration, the units and the tolerance; decrements the lot, writes the genealogy edge and records the instrument use, all in one transaction. The balance is an instrument id rather than a string as of Week 4 item 10 — a string has no calibration to check.';

REVOKE ALL ON FUNCTION public.material_dispense(uuid,uuid,numeric,uuid,uuid,uuid,numeric,uuid,uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.material_dispense(uuid,uuid,numeric,uuid,uuid,uuid,numeric,uuid,uuid,text,uuid,text)
  TO authenticated, service_role;


-- ── 8. Stage sign-off: the "any step" half ───────────────────────────
--
--  "An instrument with expired calibration blocks sign-off on ANY step
--   recording its use, starting with the dispensing balance."
--
--  Recording a use is already gated, so an out-of-calibration instrument
--  cannot be attached to a stage. That is not enough: calibration lapses
--  with the calendar. A use recorded on Monday, a calibration that
--  expires on Tuesday, and a stage signed on Wednesday is the case this
--  check exists for — and it is the realistic one.
--
--  batch_stage_complete() is re-declared rather than wrapped. Its
--  signature is unchanged, so CREATE OR REPLACE is enough, and one
--  function remains the only way to complete a stage.
CREATE OR REPLACE FUNCTION public.batch_stage_complete(
  p_stage_id              uuid,
  p_operator_signature_id uuid,
  p_verifier_id           uuid DEFAULT NULL,
  p_verifier_signature_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c record; v_actor uuid := auth.uid(); v_sig record; v_res jsonb; v_bad record;
BEGIN
  SELECT * INTO c FROM public.batch_stage_context(p_stage_id);

  IF c.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_CLOSED: batch % was closed at % and no stage can be completed',
      c.batch_id, c.closed_at USING ERRCODE = 'P0001';
  END IF;

  -- ── ITEM 10'S LOCKOUT ON A STAGE SIGN-OFF ───────────────────────────
  --  Every instrument recorded against this stage is re-checked NOW, not
  --  as it stood when the use was recorded.
  SELECT i.code, i.name, i.calibration_due_date INTO v_bad
    FROM public.instrument_usages u
    JOIN public.instruments i ON i.id = u.instrument_id
   WHERE u.entity_type = 'batch_stage' AND u.entity_id = p_stage_id
     AND public.instrument_block_reason(u.instrument_id) IS NOT NULL
   ORDER BY i.code
   LIMIT 1;

  IF v_bad.code IS NOT NULL THEN
    RAISE EXCEPTION 'INSTRUMENT_NOT_CALIBRATED: %',
      public.instrument_block_reason(
        (SELECT u.instrument_id FROM public.instrument_usages u
          JOIN public.instruments i2 ON i2.id = u.instrument_id
         WHERE u.entity_type='batch_stage' AND u.entity_id=p_stage_id AND i2.code = v_bad.code
         LIMIT 1))
      USING ERRCODE = 'P0001';
  END IF;

  IF c.requires_verifier THEN
    IF p_verifier_id IS NULL OR p_verifier_signature_id IS NULL THEN
      RAISE EXCEPTION
        'BATCH_STAGE_VERIFIER_REQUIRED: stage % requires a second person to verify it, with their own signature',
        c.sequence_no USING ERRCODE = 'P0001';
    END IF;

    IF p_verifier_id = coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      RAISE EXCEPTION
        'BATCH_STAGE_SELF_VERIFIED: the operator cannot also be the verifier'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT signer_id, entity_type, entity_id, company_id INTO v_sig
      FROM public.electronic_signatures WHERE id = p_verifier_signature_id;
    IF v_sig.signer_id IS NULL THEN
      RAISE EXCEPTION 'BATCH_STAGE_VERIFIER_SIGNATURE_INVALID: no such signature %',
        p_verifier_signature_id USING ERRCODE = 'P0002';
    END IF;
    IF v_sig.signer_id <> p_verifier_id
       OR v_sig.entity_type <> 'batch_stage'
       OR v_sig.entity_id <> p_stage_id
       OR v_sig.company_id <> c.company_id THEN
      RAISE EXCEPTION
        'BATCH_STAGE_VERIFIER_SIGNATURE_MISMATCH: that signature was not given by the named verifier for this stage'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.batch_stages
     SET operator_id            = v_actor,
         operator_signature_id  = p_operator_signature_id,
         verifier_id            = p_verifier_id,
         verifier_signature_id  = p_verifier_signature_id,
         completed_at           = now()
   WHERE id = p_stage_id;

  v_res := public.lifecycle_transition('batch_stage', p_stage_id, 'complete',
                                       c.company_id, v_actor, NULL, '{}'::jsonb,
                                       p_operator_signature_id);
  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.batch_stage_complete(uuid,uuid,uuid,uuid) IS
  'Completes a stage with the operator''s signature, a second signature where the stage requires one, and — as of Week 4 item 10 — only if every instrument recorded against the stage is still in calibration AT THE MOMENT OF SIGNING. Recording the use is gated too, but calibration lapses with the calendar.';


-- ── 9. Approaching expiry alerts the equipment owner ─────────────────

CREATE TABLE IF NOT EXISTS public.instrument_alert_policies (
  company_id            uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  calibration_lead_days integer NOT NULL DEFAULT 30,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DO $iap_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='iap_lead_chk') THEN
    ALTER TABLE public.instrument_alert_policies ADD CONSTRAINT iap_lead_chk
      CHECK (calibration_lead_days >= 0 AND calibration_lead_days <= 365);
  END IF;
END
$iap_checks$;

COMMENT ON TABLE public.instrument_alert_policies IS
  'How far ahead of a calibration lapse the owner is told. 30 days by default, which is a scheduling choice and not a regulatory one — a company that calibrates through a third party with a six-week lead time should raise it.';

ALTER TABLE public.instrument_alert_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iap_all ON public.instrument_alert_policies;
CREATE POLICY iap_all ON public.instrument_alert_policies FOR ALL TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));


CREATE TABLE IF NOT EXISTS public.instrument_calibration_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instrument_id   uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  alert_type      text NOT NULL,
  --  The date the alert is about, which is what makes it unique: an
  --  instrument whose due date moves gets a NEW alert rather than a
  --  duplicate of the old one, and a sweep that runs twice a day raises
  --  one. The same reasoning as material_lot_alerts.
  due_date        date NOT NULL,
  lead_days       integer NOT NULL,
  --  "alerts the EQUIPMENT OWNER" — recorded on the alert rather than
  --  looked up when it is read, so an alert still names who was
  --  responsible at the time even if the register changes hands.
  owner_user_id   uuid,
  raised_at       timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id)
);

DO $ica_checks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ica_type_chk') THEN
    ALTER TABLE public.instrument_calibration_alerts ADD CONSTRAINT ica_type_chk
      CHECK (alert_type IN ('calibration_approaching','calibration_overdue'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ica_uniq') THEN
    ALTER TABLE public.instrument_calibration_alerts ADD CONSTRAINT ica_uniq
      UNIQUE (instrument_id, alert_type, due_date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ica_lead_chk') THEN
    ALTER TABLE public.instrument_calibration_alerts ADD CONSTRAINT ica_lead_chk
      CHECK (lead_days >= 0);
  END IF;
END
$ica_checks$;

CREATE INDEX IF NOT EXISTS ica_open_idx
  ON public.instrument_calibration_alerts(company_id, due_date)
  WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS ica_owner_idx
  ON public.instrument_calibration_alerts(owner_user_id)
  WHERE acknowledged_at IS NULL;

ALTER TABLE public.instrument_calibration_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ica_select ON public.instrument_calibration_alerts;
CREATE POLICY ica_select ON public.instrument_calibration_alerts FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS ica_ack ON public.instrument_calibration_alerts;
CREATE POLICY ica_ack ON public.instrument_calibration_alerts FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id))
  WITH CHECK (public.app_is_company_member(company_id));


--  Idempotent: the unique constraint absorbs a repeat, so the sweep can
--  run on any schedule without producing duplicates.
CREATE OR REPLACE FUNCTION public.instrument_calibration_sweep(
  p_company_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  r record; v_lead integer; v_approaching integer := 0; v_overdue integer := 0;
BEGIN
  FOR r IN
    SELECT i.id, i.company_id, i.calibration_due_date, i.owner_user_id
      FROM public.instruments i
     WHERE i.calibration_due_date IS NOT NULL
       AND i.status <> 'retired'
       AND (p_company_id IS NULL OR i.company_id = p_company_id)
  LOOP
    SELECT calibration_lead_days INTO v_lead
      FROM public.instrument_alert_policies WHERE company_id = r.company_id;
    v_lead := coalesce(v_lead, 30);

    IF r.calibration_due_date < current_date THEN
      INSERT INTO public.instrument_calibration_alerts
        (company_id, instrument_id, alert_type, due_date, lead_days, owner_user_id)
      VALUES (r.company_id, r.id, 'calibration_overdue', r.calibration_due_date, v_lead, r.owner_user_id)
      ON CONFLICT (instrument_id, alert_type, due_date) DO NOTHING;
      IF FOUND THEN v_overdue := v_overdue + 1; END IF;

    ELSIF r.calibration_due_date <= current_date + v_lead THEN
      INSERT INTO public.instrument_calibration_alerts
        (company_id, instrument_id, alert_type, due_date, lead_days, owner_user_id)
      VALUES (r.company_id, r.id, 'calibration_approaching', r.calibration_due_date, v_lead, r.owner_user_id)
      ON CONFLICT (instrument_id, alert_type, due_date) DO NOTHING;
      IF FOUND THEN v_approaching := v_approaching + 1; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true,
    'approaching', v_approaching, 'overdue', v_overdue, 'as_of', current_date);
END;
$$;

COMMENT ON FUNCTION public.instrument_calibration_sweep(uuid) IS
  'Raises calibration alerts for instruments coming due or already overdue, naming the owner. Idempotent — the unique constraint absorbs repeats — so it is safe on any schedule. NOTE: the sweep is for ALERTING only. The lockout never consults it; instrument_block_reason() derives from the due date, so an instrument is blocked the moment it lapses whether or not the sweep has run.';

REVOKE ALL ON FUNCTION public.instrument_calibration_sweep(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.instrument_calibration_sweep(uuid) TO authenticated, service_role;


-- ── 10. The deploy-time guard ────────────────────────────────────────
DO $item10_guard$
DECLARE
  v_missing text[] := '{}';
  v_constraints text[] := ARRAY[
    'instruments_code_uniq','instruments_status_chk','instruments_code_blank_chk',
    'ic_dates_chk','ic_result_chk','ic_size_chk',
    'iu_entity_type_chk','iu_uniq',
    'iap_lead_chk','ica_type_chk','ica_uniq','ica_lead_chk',
    'dispensing_records_instrument_id_fkey'
  ];
  v_triggers text[] := ARRAY[
    'trg_ic_immutable','trg_ic_validate_document',
    'trg_instruments_sync_calibration','trg_instruments_guard_calibration',
    'trg_iu_gate',
    'trg_dispensing_instrument_gate','trg_dispensing_record_instrument_use'
  ];
  c text;
BEGIN
  FOREACH c IN ARRAY v_constraints LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c) THEN
      v_missing := v_missing || ('constraint '||c);
    END IF;
  END LOOP;
  FOREACH c IN ARRAY v_triggers LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = c AND NOT tgisinternal) THEN
      v_missing := v_missing || ('trigger '||c);
    END IF;
  END LOOP;

  --  The old text-balance signature must be gone, or a caller could keep
  --  using it and never name an instrument.
  IF to_regprocedure('public.material_dispense(uuid,uuid,numeric,text,uuid,uuid,numeric,uuid,uuid,text,uuid,text)') IS NOT NULL THEN
    v_missing := v_missing || 'removal of the old text-balance material_dispense overload';
  END IF;

  IF has_table_privilege('authenticated','public.instrument_calibrations','UPDATE') THEN
    v_missing := v_missing || 'revoke of UPDATE on instrument_calibrations from authenticated';
  END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION
      'ITEM10_CONTROLS_MISSING: this migration applied but the following controls are not present: %.',
      array_to_string(v_missing, ', ') USING ERRCODE = 'P0001';
  END IF;
END
$item10_guard$;
