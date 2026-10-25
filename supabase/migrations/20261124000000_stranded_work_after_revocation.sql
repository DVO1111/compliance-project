-- =====================================================================
--  WORK LEFT STRANDED BY A REVOCATION
--
--  20261121000000 defined what happens to work in progress when
--  somebody loses a role: nothing is auto-completed and nothing is
--  auto-cancelled. The work stands, still attributed to whoever did
--  it, and somebody who holds the authority finishes it.
--
--  The gap that left: nobody is told. A half-finished batch whose
--  supervisor left the company sits in `in_progress` and the only way
--  to find it is to go looking. This closes that.
--
--  Three parts, and the order matters:
--
--    1. A REPORT. What is unfinished, who was carrying it, and what
--       they lost. Read-only, derived, nothing stored.
--    2. A NOTICE. One notification per person who could act on it,
--       emitted when the revocation happens rather than discovered
--       later.
--    3. A REASSIGNMENT that is authorised and auditable, and that
--       NEVER touches the record's own attribution. Who did the work
--       is a fact; who carries it on from here is a second fact
--       recorded beside it.
--
--  What this is NOT: a task register. §8 of the conflict register
--  records that the design has none, and inventing one here would be
--  inventing a workflow. This reads the lifecycle history that already
--  exists and says who last touched a record that is not finished.
-- =====================================================================

-- ── 1. Which section governs each kind of record ────────────────────
--
-- A table rather than a CASE, and asserted against the grid, so a
-- section that does not exist fails the migration rather than
-- producing a report that silently omits an entity type.

CREATE TABLE IF NOT EXISTS public.lifecycle_entity_sections (
  entity_type text PRIMARY KEY,
  section     text NOT NULL,
  note        text
);

INSERT INTO public.lifecycle_entity_sections (entity_type, section, note) VALUES
  ('batch_record', 'batch_records',
   'Execution. Release has its own section, but a stranded batch is almost always mid-execution.'),
  ('material_lot', 'material_lots',
   'Receipt and handling. Disposition has its own section and its own guard.'),
  ('deviation',    'deviation_capa', NULL),
  ('capa_record',  'deviation_capa', NULL),
  ('supplier',     'suppliers',      NULL)
ON CONFLICT (entity_type) DO UPDATE
  SET section = EXCLUDED.section, note = EXCLUDED.note;

ALTER TABLE public.lifecycle_entity_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lifecycle_entity_sections_read ON public.lifecycle_entity_sections;
CREATE POLICY lifecycle_entity_sections_read
  ON public.lifecycle_entity_sections FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.lifecycle_entity_sections FROM anon, authenticated;
GRANT SELECT ON public.lifecycle_entity_sections TO anon, authenticated;

DO $assert$
DECLARE v_bad text;
BEGIN
  --  The dead-guard hazard in report form: a section the grid does not
  --  have means app_section_access returns NULL for everybody, so
  --  every record of that type reads as stranded, forever.
  SELECT string_agg(format('%s -> %s', entity_type, section), ', ') INTO v_bad
    FROM public.lifecycle_entity_sections m
   WHERE NOT EXISTS (SELECT 1 FROM public.section_permissions g WHERE g.section = m.section);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ENTITY_SECTION_UNKNOWN: % names a section with no column', v_bad;
  END IF;

  --  And the other way: a lifecycle entity type with no section is
  --  one this report cannot see. Reported, not fatal — not every
  --  entity type is floor work.
  SELECT string_agg(DISTINCT d.entity_type, ', ') INTO v_bad
    FROM public.lifecycle_definitions d
   WHERE NOT EXISTS (SELECT 1 FROM public.lifecycle_entity_sections m
                      WHERE m.entity_type = d.entity_type);
  IF v_bad IS NOT NULL THEN
    RAISE NOTICE 'STRANDED_WORK_BLIND_TO: % — no section mapped, so this report will not cover them', v_bad;
  END IF;
END
$assert$;


-- ── 2. Where a reassignment is recorded ─────────────────────────────
--
-- Created BEFORE the report, which reads it. A SQL-language function
-- is parsed against the catalogue when it is created, so a forward
-- reference fails the migration rather than the first call — which is
-- the better of the two, and is how this ordering was found.

CREATE TABLE IF NOT EXISTS public.stranded_work_reassignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  --  WHO WAS CARRYING IT. Recorded here, not read back from the
  --  record, because the record's own actor columns are never touched
  --  and this is a statement about a moment.
  from_user     uuid,
  to_user       uuid NOT NULL,
  reason        text NOT NULL CHECK (btrim(reason) <> ''),
  reassigned_by uuid,
  reassigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stranded_work_reassignments_entity_idx
  ON public.stranded_work_reassignments (company_id, entity_type, entity_id, reassigned_at DESC);

COMMENT ON TABLE public.stranded_work_reassignments IS
  'Who was asked to carry on with a record after its previous owner lost a role. Additive: the record''s own attribution is never changed.';

-- ── 2b. The report ──────────────────────────────────────────────────
--
-- Stranded means all three: the record is unfinished, the person who
-- last moved it has lost an operational role in this company, and
-- they can no longer act in the section that governs it.
--
-- The middle condition is what keeps this from listing every record
-- ever touched by somebody without a role — a service context, or a
-- person who never had one. It is specifically about a REVOCATION.

CREATE OR REPLACE FUNCTION public.operational_role_stranded_work(p_company_id uuid)
RETURNS TABLE (
  entity_type     text,
  entity_id       uuid,
  state_key       text,
  section         text,
  last_actor      uuid,
  last_acted_at   timestamptz,
  roles_lost      text[],
  roles_remaining text[],
  reassigned_to   uuid,
  reassigned_at   timestamptz,
  still_stranded  boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH last_touch AS (
    --  DISTINCT ON rather than a window function: the latest history
    --  row per record is all this needs, and the index on
    --  (entity_type, entity_id) serves it directly.
    SELECT DISTINCT ON (h.entity_type, h.entity_id)
           h.entity_type, h.entity_id, h.actor_id, h.created_at
      FROM public.entity_state_history h
     WHERE h.company_id = p_company_id
       AND h.actor_id IS NOT NULL
     ORDER BY h.entity_type, h.entity_id, h.created_at DESC
  ),
  unfinished AS (
    SELECT ecs.entity_type, ecs.entity_id, s.state_key, m.section
      FROM public.entity_current_state ecs
      JOIN public.lifecycle_states s ON s.id = ecs.state_id
      JOIN public.lifecycle_entity_sections m ON m.entity_type = ecs.entity_type
     WHERE ecs.company_id = p_company_id
       AND NOT s.is_terminal
  )
  SELECT u.entity_type, u.entity_id, u.state_key, u.section,
         t.actor_id, t.created_at,
         (SELECT coalesce(array_agg(DISTINCT a.role ORDER BY a.role), ARRAY[]::text[])
            FROM public.operational_role_assignments a
           WHERE a.company_id = p_company_id AND a.user_id = t.actor_id
             AND a.revoked_at IS NOT NULL),
         public.app_work_roles(p_company_id, t.actor_id),
         r.to_user, r.reassigned_at,
         r.id IS NULL
    FROM unfinished u
    JOIN last_touch t
      ON t.entity_type = u.entity_type AND t.entity_id = u.entity_id
    LEFT JOIN LATERAL (
      SELECT x.id, x.to_user, x.reassigned_at
        FROM public.stranded_work_reassignments x
       WHERE x.company_id = p_company_id
         AND x.entity_type = u.entity_type AND x.entity_id = u.entity_id
       ORDER BY x.reassigned_at DESC
       LIMIT 1
    ) r ON true
   WHERE
     --  They lost something here …
     EXISTS (SELECT 1 FROM public.operational_role_assignments a
              WHERE a.company_id = p_company_id AND a.user_id = t.actor_id
                AND a.revoked_at IS NOT NULL)
     --  … and what is left does not let them carry on.
     AND coalesce(public.app_section_access(p_company_id, u.section, t.actor_id), 'none') <> 'act'
   ORDER BY r.id IS NULL DESC, t.created_at;
$$;

COMMENT ON FUNCTION public.operational_role_stranded_work(uuid) IS
  'Unfinished records whose last actor has lost an operational role and can no longer act in the governing section. Derived; nothing is stored and no attribution is changed.';

GRANT EXECUTE ON FUNCTION public.operational_role_stranded_work(uuid)
  TO authenticated, service_role;


-- ── 3. Reassignment: authorised, auditable, and additive ────────────

ALTER TABLE public.stranded_work_reassignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stranded_work_reassignments_read ON public.stranded_work_reassignments;
CREATE POLICY stranded_work_reassignments_read
  ON public.stranded_work_reassignments FOR SELECT TO authenticated
  USING (public.app_is_company_member(company_id));

DROP POLICY IF EXISTS stranded_work_reassignments_write ON public.stranded_work_reassignments;
CREATE POLICY stranded_work_reassignments_write
  ON public.stranded_work_reassignments FOR INSERT TO authenticated
  WITH CHECK (public.app_is_company_member(company_id));

--  Admitted so the trigger can refuse them by name rather than RLS
--  refusing them anonymously.
DROP POLICY IF EXISTS stranded_work_reassignments_change ON public.stranded_work_reassignments;
CREATE POLICY stranded_work_reassignments_change
  ON public.stranded_work_reassignments FOR UPDATE TO authenticated
  USING (public.app_is_company_member(company_id));
DROP POLICY IF EXISTS stranded_work_reassignments_remove ON public.stranded_work_reassignments;
CREATE POLICY stranded_work_reassignments_remove
  ON public.stranded_work_reassignments FOR DELETE TO authenticated
  USING (public.app_is_company_member(company_id));


CREATE OR REPLACE FUNCTION public.fn_stranded_work_reassignment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_section text;
BEGIN
  --  INTEGRITY FIRST, binding service contexts too. A reassignment is
  --  a record of a decision; re-dating or re-targeting one rewrites
  --  who was asked to do what, and when.
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION
      'STRANDED_WORK_IMMUTABLE: a reassignment is a record of a decision; make a new one instead'
      USING ERRCODE = 'P0001';
  END IF;

  IF public.app_is_service_context() THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'STRANDED_WORK_FORBIDDEN: no authenticated caller' USING ERRCODE = 'P0001';
  END IF;

  SELECT section INTO v_section FROM public.lifecycle_entity_sections
   WHERE entity_type = NEW.entity_type;
  IF v_section IS NULL THEN
    RAISE EXCEPTION 'STRANDED_WORK_UNKNOWN_ENTITY: % has no governing section', NEW.entity_type
      USING ERRCODE = 'P0001';
  END IF;

  --  WHO MAY REASSIGN. Either authority over roles — the people who
  --  caused the revocation in the first place — or the ability to act
  --  in the section, which is the person whose work it now is.
  IF NOT public.app_may_assign_operational_roles(NEW.company_id, v_actor)
     AND coalesce(public.app_section_access(NEW.company_id, v_section, v_actor), 'none') <> 'act'
  THEN
    RAISE EXCEPTION
      'STRANDED_WORK_FORBIDDEN: reassigning % is for somebody who administers roles or who may act in %',
      NEW.entity_type, v_section
      USING ERRCODE = 'P0001';
  END IF;

  --  AND TO SOMEBODY WHO CAN ACTUALLY FINISH IT. Reassigning to
  --  another person who cannot act in the section moves the problem
  --  and closes the report entry, which is worse than leaving it open.
  IF coalesce(public.app_section_access(NEW.company_id, v_section, NEW.to_user), 'none') <> 'act'
  THEN
    RAISE EXCEPTION
      'STRANDED_WORK_TARGET_CANNOT_ACT: that person holds no role with Act on %, so they could not carry it on',
      v_section
      USING ERRCODE = 'P0001',
            HINT = 'Grant them the role first, then reassign.';
  END IF;

  NEW.reassigned_by := v_actor;
  NEW.reassigned_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stranded_work_reassignment_guard
  ON public.stranded_work_reassignments;
CREATE TRIGGER trg_stranded_work_reassignment_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.stranded_work_reassignments
  FOR EACH ROW EXECUTE FUNCTION public.fn_stranded_work_reassignment_guard();


CREATE OR REPLACE FUNCTION public.stranded_work_reassign(
  p_company_id  uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_to_user     uuid,
  p_reason      text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid; v_from uuid; v_stranded boolean;
BEGIN
  --  Only stranded work. This is not a general transfer-of-ownership
  --  tool, and making it one would put a second, weaker route beside
  --  the lifecycle guards.
  SELECT w.last_actor, true INTO v_from, v_stranded
    FROM public.operational_role_stranded_work(p_company_id) w
   WHERE w.entity_type = p_entity_type AND w.entity_id = p_entity_id
     AND w.still_stranded
   LIMIT 1;

  IF NOT coalesce(v_stranded, false) THEN
    RAISE EXCEPTION
      'STRANDED_WORK_NOT_STRANDED: % % is not waiting on a withdrawn role', p_entity_type, p_entity_id
      USING ERRCODE = 'P0001',
            HINT = 'Only work left behind by a revocation is reassigned this way.';
  END IF;

  INSERT INTO public.stranded_work_reassignments
    (company_id, entity_type, entity_id, from_user, to_user, reason)
  VALUES (p_company_id, p_entity_type, p_entity_id, v_from, p_to_user, p_reason)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.stranded_work_reassign(uuid, text, uuid, uuid, text) IS
  'Records that somebody else will carry on with a record stranded by a revocation. Changes no attribution on the record itself.';

REVOKE ALL ON FUNCTION public.stranded_work_reassign(uuid, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stranded_work_reassign(uuid, text, uuid, uuid, text)
  TO authenticated, service_role;


-- ── 4. The notice ───────────────────────────────────────────────────
--
-- Emitted when the revocation happens. One per person who could act on
-- it, not one per stranded record: a revocation that strands forty
-- batches should produce a sentence, not forty.

CREATE OR REPLACE FUNCTION public.fn_operational_role_revocation_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_n int;
  v_name text;
BEGIN
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_n
    FROM public.operational_role_stranded_work(NEW.company_id) w
   WHERE w.last_actor = NEW.user_id AND w.still_stranded;

  IF v_n = 0 THEN RETURN NEW; END IF;

  SELECT coalesce(full_name, email, 'A colleague') INTO v_name
    FROM public.profiles WHERE id = NEW.user_id;

  --  To everyone who could do something about it: the people who
  --  administer roles. Not to the person who lost the role, who by
  --  definition cannot act on it.
  INSERT INTO public.notifications (recipient_id, type, content_id, message)
  SELECT cm.user_id, 'role_revocation_stranded_work', NEW.id,
         format('%s''s %s was withdrawn. %s unfinished record%s they were carrying may need reassigning.',
                v_name, replace(NEW.role,'_',' '), v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END)
    FROM public.company_members cm
   WHERE cm.company_id = NEW.company_id
     AND cm.user_id <> NEW.user_id
     AND coalesce(cm.status::text,'active') = 'active'
     AND (lower(btrim(cm.role::text)) IN ('owner','admin')
          OR public.app_has_work_role(NEW.company_id, 'compliance_admin', cm.user_id));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operational_role_revocation_notice
  ON public.operational_role_assignments;
CREATE TRIGGER trg_operational_role_revocation_notice
  AFTER UPDATE ON public.operational_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.fn_operational_role_revocation_notice();


-- ── 5. Prove it ─────────────────────────────────────────────────────

DO $assert$
DECLARE
  v_c uuid; v_a uuid; v_b uuid; v_prod uuid; v_batch uuid; v_id uuid;
  v_n int; v_hit boolean;
BEGIN
  BEGIN
    v_c := gen_random_uuid(); v_a := gen_random_uuid(); v_b := gen_random_uuid();

    INSERT INTO public.companies(id,name) VALUES (v_c,'Stranded work self test');
    INSERT INTO auth.users(id,email) VALUES
      (v_a,'stranded-a@invalid.test'), (v_b,'stranded-b@invalid.test');
    INSERT INTO public.company_members(company_id,user_id,role,status)
    VALUES (v_c,v_a,'admin','active'), (v_c,v_b,'viewer','active');

    --  v_b is a production supervisor who starts a batch, then loses
    --  the role.
    v_id := public.operational_role_assign(v_c, v_b, 'production_supervisor', 'self test');

    INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
    VALUES (gen_random_uuid(),v_c,'SW-1','Tablet SW','Paracetamol','drug_pharmaceutical',v_a)
    RETURNING id INTO v_prod;

    INSERT INTO public.batch_records
      (id,company_id,batch_number,product_name,product_id,
       manufacturing_date,expiry_date,batch_size,unit)
    VALUES (gen_random_uuid(),v_c,'SWB-1','Tablet SW',v_prod,
            current_date,current_date+365,10,'kg')
    RETURNING id INTO v_batch;

    --  A history row naming v_b as the last actor on an unfinished
    --  record. Written directly: the point is the report's reading of
    --  it, not the engine's writing of it.
    INSERT INTO public.entity_state_history
      (company_id, definition_id, entity_type, entity_id, to_state_id, actor_id)
    SELECT v_c, d.id, 'batch_record', v_batch, s.id, v_b
      FROM public.lifecycle_definitions d
      JOIN public.lifecycle_states s ON s.definition_id = d.id
     WHERE d.entity_type = 'batch_record' AND s.state_key = 'in_progress';

    --  Nothing is stranded while they still hold the role.
    SELECT count(*) INTO v_n FROM public.operational_role_stranded_work(v_c);
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'STRANDED_BEFORE_REVOCATION: % rows reported while the role was held', v_n;
    END IF;

    PERFORM public.operational_role_revoke(v_id, 'self test');

    SELECT count(*) INTO v_n FROM public.operational_role_stranded_work(v_c)
     WHERE entity_id = v_batch AND still_stranded;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'STRANDED_NOT_REPORTED: expected 1, got %', v_n;
    END IF;

    --  The notice reached the admin and not the person who lost it.
    IF NOT EXISTS (SELECT 1 FROM public.notifications
                    WHERE recipient_id = v_a AND type = 'role_revocation_stranded_work') THEN
      RAISE EXCEPTION 'STRANDED_NOTICE_NOT_SENT';
    END IF;
    IF EXISTS (SELECT 1 FROM public.notifications
                WHERE recipient_id = v_b AND type = 'role_revocation_stranded_work') THEN
      RAISE EXCEPTION 'STRANDED_NOTICE_SENT_TO_THE_WRONG_PERSON';
    END IF;

    --  Reassigning to somebody who also cannot act is refused.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_a::text, 'role','authenticated')::text, true);

    v_hit := false;
    BEGIN
      PERFORM public.stranded_work_reassign(v_c,'batch_record',v_batch,v_b,'self test');
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'STRANDED_WORK_TARGET_CANNOT_ACT%' THEN v_hit := true; ELSE RAISE; END IF;
    END;
    IF NOT v_hit THEN
      RAISE EXCEPTION 'REASSIGNED_TO_SOMEBODY_WHO_CANNOT_ACT';
    END IF;

    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION 'ROLLBACK_THE_ASSERTION';
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('role', 'none', true);
      IF SQLERRM <> 'ROLLBACK_THE_ASSERTION' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);
END
$assert$;
