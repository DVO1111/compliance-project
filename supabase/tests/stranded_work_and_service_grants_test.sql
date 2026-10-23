-- =====================================================================
--  STRANDED WORK, AND GRANTS NOBODY SIGNED FOR
--
--  Covers 20261124000000 (what happens to unfinished work when its
--  owner loses a role) and the service-context exemption in
--  20261121000000, which is the one way a GMP-critical role can be
--  granted without a signature.
--
--  Sections:
--    A. The report: what counts as stranded, and what does not
--    B. The notice
--    C. Reassignment: authorised, auditable, additive
--    D. Service-context grants are allowed, marked, and reported
--    E. The pre-release check, as a query somebody can run
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _sw(section text, name text, ok boolean, detail text);
GRANT ALL ON _sw TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _swk(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _sw VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

CREATE OR REPLACE FUNCTION _swfail(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN '(no refusal)';
EXCEPTION WHEN OTHERS THEN
  RETURN split_part(SQLERRM, ':', 1);
END $$;
GRANT EXECUTE ON FUNCTION _swfail(text) TO anon, authenticated, service_role;


DO $fx$
DECLARE
  c     uuid := gen_random_uuid();
  u_adm uuid := gen_random_uuid();   -- membership admin, may reassign
  u_ps  uuid := gen_random_uuid();   -- production supervisor, loses the role
  u_ps2 uuid := gen_random_uuid();   -- the supervisor who takes over
  u_sk  uuid := gen_random_uuid();   -- storekeeper: cannot act on batch_records
  u_out uuid := gen_random_uuid();   -- a member who never held any role
  v_prod uuid := gen_random_uuid();
  tag   text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  b_open uuid := gen_random_uuid();  -- unfinished, last touched by u_ps
  b_done uuid := gen_random_uuid();  -- finished: must NOT be reported
  b_never uuid := gen_random_uuid(); -- last touched by somebody with no role ever
BEGIN
  PERFORM set_config('sw.c',      c::text,      false);
  PERFORM set_config('sw.u_adm',  u_adm::text,  false);
  PERFORM set_config('sw.u_ps',   u_ps::text,   false);
  PERFORM set_config('sw.u_ps2',  u_ps2::text,  false);
  PERFORM set_config('sw.u_sk',   u_sk::text,   false);
  PERFORM set_config('sw.u_out',  u_out::text,  false);
  PERFORM set_config('sw.b_open', b_open::text, false);
  PERFORM set_config('sw.b_done', b_done::text, false);
  PERFORM set_config('sw.b_never',b_never::text,false);

  INSERT INTO public.companies(id,name) VALUES (c,'Stranded '||tag);
  INSERT INTO auth.users(id,email) VALUES
    (u_adm,'adm-'||tag||'@sw.test'), (u_ps,'ps-'||tag||'@sw.test'),
    (u_ps2,'ps2-'||tag||'@sw.test'), (u_sk,'sk-'||tag||'@sw.test'),
    (u_out,'out-'||tag||'@sw.test');
  INSERT INTO public.profiles(id,email,full_name,company_id,role) VALUES
    (u_adm,'adm-'||tag||'@sw.test','Bola Admin',       c,'admin'),
    (u_ps, 'ps-'||tag||'@sw.test', 'Yemi Supervisor',  c,'compliance_officer'),
    (u_ps2,'ps2-'||tag||'@sw.test','Dele Supervisor',  c,'compliance_officer'),
    (u_sk, 'sk-'||tag||'@sw.test', 'Tunde Stores',     c,'compliance_officer'),
    (u_out,'out-'||tag||'@sw.test','Kemi Nobody',      c,'compliance_officer');
  INSERT INTO public.company_members(company_id,user_id,role,status) VALUES
    (c,u_adm,'admin','active'), (c,u_ps,'viewer','active'),
    (c,u_ps2,'viewer','active'), (c,u_sk,'viewer','active'),
    (c,u_out,'viewer','active');

  PERFORM public.operational_role_assign(c,u_ps, 'production_supervisor','fixture');
  PERFORM public.operational_role_assign(c,u_ps2,'production_supervisor','fixture');
  PERFORM public.operational_role_assign(c,u_sk, 'storekeeper','fixture');

  INSERT INTO public.products(id,company_id,product_code,trade_name,generic_name,category,created_by)
  VALUES (v_prod,c,'SW-'||tag,'Tablet SW','Paracetamol','drug_pharmaceutical',u_adm);

  INSERT INTO public.batch_records
    (id,company_id,batch_number,product_name,product_id,
     manufacturing_date,expiry_date,batch_size,unit,created_by)
  VALUES
    (b_open, c,'SWO-'||tag,'Tablet SW',v_prod,current_date,current_date+365,10,'kg',u_ps),
    (b_done, c,'SWD-'||tag,'Tablet SW',v_prod,current_date,current_date+365,10,'kg',u_ps),
    (b_never,c,'SWN-'||tag,'Tablet SW',v_prod,current_date,current_date+365,10,'kg',u_out);

  --  History rows naming the last actor. Written directly: what is
  --  under test is the report's reading of them.
  INSERT INTO public.entity_state_history
    (company_id, definition_id, entity_type, entity_id, to_state_id, actor_id)
  SELECT c, d.id, 'batch_record', b_open, s.id, u_ps
    FROM public.lifecycle_definitions d
    JOIN public.lifecycle_states s ON s.definition_id = d.id
   WHERE d.entity_type='batch_record' AND s.state_key='in_progress';

  INSERT INTO public.entity_state_history
    (company_id, definition_id, entity_type, entity_id, to_state_id, actor_id)
  SELECT c, d.id, 'batch_record', b_never, s.id, u_out
    FROM public.lifecycle_definitions d
    JOIN public.lifecycle_states s ON s.definition_id = d.id
   WHERE d.entity_type='batch_record' AND s.state_key='in_progress';

  --  b_done is terminal, and still names u_ps.
  INSERT INTO public.entity_state_history
    (company_id, definition_id, entity_type, entity_id, to_state_id, actor_id)
  SELECT c, d.id, 'batch_record', b_done, s.id, u_ps
    FROM public.lifecycle_definitions d
    JOIN public.lifecycle_states s ON s.definition_id = d.id
   WHERE d.entity_type='batch_record' AND s.state_key='rejected';

  --  Creating a batch_record already registers its current state, so
  --  b_open and b_never need nothing. b_done has to be MOVED to a
  --  terminal state — an earlier draft inserted it with ON CONFLICT DO
  --  NOTHING, which quietly did nothing and left it in_progress, and
  --  the assertion that terminal records are not reported then failed
  --  for the right reason about the wrong row.
  UPDATE public.entity_current_state ecs
     SET state_id = s.id
    FROM public.lifecycle_definitions d
    JOIN public.lifecycle_states s ON s.definition_id = d.id
   WHERE d.entity_type = 'batch_record' AND s.state_key = 'rejected'
     AND ecs.entity_type = 'batch_record' AND ecs.entity_id = b_done;

  IF NOT EXISTS (
    SELECT 1 FROM public.entity_current_state ecs
      JOIN public.lifecycle_states s ON s.id = ecs.state_id
     WHERE ecs.entity_id = b_done AND s.is_terminal) THEN
    RAISE EXCEPTION 'FIXTURE: b_done is not terminal, so section A3 would prove nothing';
  END IF;
END
$fx$;


-- =====================================================================
--  A. The report
-- =====================================================================
DO $a$
DECLARE c uuid := current_setting('sw.c')::uuid; v_n int; v_id uuid;
BEGIN
  --  (1) NOTHING IS STRANDED WHILE THE ROLE IS HELD. A report that
  --  lists everything is a report nobody reads.
  SELECT count(*) INTO v_n FROM public.operational_role_stranded_work(c);
  PERFORM _swk('A','A1 nothing is stranded while the role is held', v_n = 0, v_n::text);

  SELECT id INTO v_id FROM public.operational_role_assignments
   WHERE company_id=c AND user_id=current_setting('sw.u_ps')::uuid
     AND role='production_supervisor' AND revoked_at IS NULL;
  PERFORM set_config('sw.ps_assignment', v_id::text, false);
  PERFORM public.operational_role_revoke(v_id, 'left the site');

  --  (2) The unfinished record they last touched is reported.
  PERFORM _swk('A','A2 the unfinished record is reported after revocation',
    EXISTS (SELECT 1 FROM public.operational_role_stranded_work(c)
             WHERE entity_id = current_setting('sw.b_open')::uuid AND still_stranded));

  --  (3) A FINISHED record is not, however it was left.
  PERFORM _swk('A','A3 a terminal record is not reported',
    NOT EXISTS (SELECT 1 FROM public.operational_role_stranded_work(c)
                 WHERE entity_id = current_setting('sw.b_done')::uuid));

  --  (4) NOR IS A RECORD whose last actor never held a role. Stranded
  --  means "left behind by a revocation", not "touched by somebody
  --  without permissions" — which would list half the database.
  PERFORM _swk('A','A4 a record whose actor never held a role is not reported',
    NOT EXISTS (SELECT 1 FROM public.operational_role_stranded_work(c)
                 WHERE entity_id = current_setting('sw.b_never')::uuid));

  --  (5) The report says what was lost and what is left.
  PERFORM _swk('A','A5 it names the role they lost',
    (SELECT roles_lost = ARRAY['production_supervisor']
       FROM public.operational_role_stranded_work(c)
      WHERE entity_id = current_setting('sw.b_open')::uuid),
    (SELECT array_to_string(roles_lost,', ') FROM public.operational_role_stranded_work(c)
      WHERE entity_id = current_setting('sw.b_open')::uuid));

  PERFORM _swk('A','A6 and that nothing is left',
    (SELECT coalesce(array_length(roles_remaining,1),0) = 0
       FROM public.operational_role_stranded_work(c)
      WHERE entity_id = current_setting('sw.b_open')::uuid));

  --  (6) ORIGINAL ATTRIBUTION IS UNTOUCHED. The report derives; it
  --  does not write.
  PERFORM _swk('A','A7 the record still names who created it',
    (SELECT created_by = current_setting('sw.u_ps')::uuid
       FROM public.batch_records WHERE id = current_setting('sw.b_open')::uuid));
  PERFORM _swk('A','A8 and the history still names who last moved it',
    EXISTS (SELECT 1 FROM public.entity_state_history
             WHERE entity_id = current_setting('sw.b_open')::uuid
               AND actor_id = current_setting('sw.u_ps')::uuid));

  --  (7) The assignment itself survives, which is how the report knew.
  PERFORM _swk('A','A9 the revoked assignment is still on the record',
    EXISTS (SELECT 1 FROM public.operational_role_assignments
             WHERE id = current_setting('sw.ps_assignment')::uuid
               AND revoked_at IS NOT NULL AND revoke_reason = 'left the site'));
END $a$;


-- =====================================================================
--  B. The notice
-- =====================================================================
DO $b$
DECLARE c uuid := current_setting('sw.c')::uuid; v_n int;
BEGIN
  PERFORM _swk('B','B1 the admin was told',
    EXISTS (SELECT 1 FROM public.notifications
             WHERE recipient_id = current_setting('sw.u_adm')::uuid
               AND type = 'role_revocation_stranded_work'));

  --  NOT to the person who lost the role: by definition they cannot
  --  act on it, and telling them reads as an accusation.
  PERFORM _swk('B','B2 the person who lost the role was not',
    NOT EXISTS (SELECT 1 FROM public.notifications
                 WHERE recipient_id = current_setting('sw.u_ps')::uuid
                   AND type = 'role_revocation_stranded_work'));

  --  Nor an ordinary member who could do nothing about it.
  PERFORM _swk('B','B3 nor a member with no authority over roles',
    NOT EXISTS (SELECT 1 FROM public.notifications
                 WHERE recipient_id = current_setting('sw.u_out')::uuid
                   AND type = 'role_revocation_stranded_work'));

  --  ONE PER RECIPIENT, not one per stranded record. A revocation that
  --  strands forty batches should produce a sentence, not forty.
  SELECT count(*) INTO v_n FROM public.notifications
   WHERE recipient_id = current_setting('sw.u_adm')::uuid
     AND type = 'role_revocation_stranded_work'
     AND content_id = current_setting('sw.ps_assignment')::uuid;
  PERFORM _swk('B','B4 one notice per recipient, not one per record', v_n = 1, v_n::text);

  PERFORM _swk('B','B5 and it says how many and whose',
    (SELECT message LIKE '%Yemi Supervisor%' AND message LIKE '%production supervisor%'
       FROM public.notifications
      WHERE recipient_id = current_setting('sw.u_adm')::uuid
        AND type = 'role_revocation_stranded_work' LIMIT 1),
    (SELECT message FROM public.notifications
      WHERE recipient_id = current_setting('sw.u_adm')::uuid
        AND type = 'role_revocation_stranded_work' LIMIT 1));
END $b$;


-- =====================================================================
--  C. Reassignment
-- =====================================================================
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('sw.u_out'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $c1$
BEGIN
  --  A member with neither authority over roles nor Act on the section
  --  cannot reassign.
  PERFORM _swk('C','C1 a member with no authority cannot reassign',
    _swfail(format('SELECT public.stranded_work_reassign(%L,%L,%L,%L,%L)',
      current_setting('sw.c'),'batch_record',current_setting('sw.b_open'),
      current_setting('sw.u_ps2'),'try'))
      = 'STRANDED_WORK_FORBIDDEN',
    _swfail(format('SELECT public.stranded_work_reassign(%L,%L,%L,%L,%L)',
      current_setting('sw.c'),'batch_record',current_setting('sw.b_open'),
      current_setting('sw.u_ps2'),'try')));

  --  Nor by going round the RPC.
  PERFORM _swk('C','C2 nor by a direct INSERT',
    _swfail(format('INSERT INTO public.stranded_work_reassignments'
      ' (company_id,entity_type,entity_id,to_user,reason) VALUES (%L,%L,%L,%L,%L)',
      current_setting('sw.c'),'batch_record',current_setting('sw.b_open'),
      current_setting('sw.u_ps2'),'try'))
      = 'STRANDED_WORK_FORBIDDEN');
END $c1$;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('sw.u_adm'), 'role','authenticated')::text, false);
SET ROLE authenticated;

DO $c2$
DECLARE v_id uuid;
BEGIN
  --  TO SOMEBODY WHO COULD ACTUALLY FINISH IT. Reassigning to another
  --  person who cannot act moves the problem and closes the report
  --  entry, which is worse than leaving it open.
  PERFORM _swk('C','C3 not to somebody who cannot act in the section',
    _swfail(format('SELECT public.stranded_work_reassign(%L,%L,%L,%L,%L)',
      current_setting('sw.c'),'batch_record',current_setting('sw.b_open'),
      current_setting('sw.u_sk'),'try'))
      = 'STRANDED_WORK_TARGET_CANNOT_ACT',
    _swfail(format('SELECT public.stranded_work_reassign(%L,%L,%L,%L,%L)',
      current_setting('sw.c'),'batch_record',current_setting('sw.b_open'),
      current_setting('sw.u_sk'),'try')));

  --  And only for work that is actually stranded. This is not a
  --  general transfer-of-ownership tool.
  PERFORM _swk('C','C4 and only for work that is stranded',
    _swfail(format('SELECT public.stranded_work_reassign(%L,%L,%L,%L,%L)',
      current_setting('sw.c'),'batch_record',current_setting('sw.b_never'),
      current_setting('sw.u_ps2'),'try'))
      = 'STRANDED_WORK_NOT_STRANDED');

  --  The real one.
  v_id := public.stranded_work_reassign(
    current_setting('sw.c')::uuid,'batch_record',current_setting('sw.b_open')::uuid,
    current_setting('sw.u_ps2')::uuid,'Dele is taking over the line');
  PERFORM set_config('sw.reassignment', v_id::text, false);

  PERFORM _swk('C','C5 an authorised reassignment succeeds', v_id IS NOT NULL);

  --  AUDITABLE: who asked, who was carrying it, who takes it on, why,
  --  and when — all recorded, with the actor set by the server.
  PERFORM _swk('C','C6 it records who reassigned, from whom, to whom and why',
    (SELECT reassigned_by = current_setting('sw.u_adm')::uuid
            AND from_user = current_setting('sw.u_ps')::uuid
            AND to_user   = current_setting('sw.u_ps2')::uuid
            AND reason    = 'Dele is taking over the line'
            AND reassigned_at IS NOT NULL
       FROM public.stranded_work_reassignments WHERE id = v_id));

  --  ADDITIVE: the record's own attribution is untouched.
  PERFORM _swk('C','C7 and the record still names its original author',
    (SELECT created_by = current_setting('sw.u_ps')::uuid
       FROM public.batch_records WHERE id = current_setting('sw.b_open')::uuid));
  PERFORM _swk('C','C8 and its history is unchanged',
    EXISTS (SELECT 1 FROM public.entity_state_history
             WHERE entity_id = current_setting('sw.b_open')::uuid
               AND actor_id = current_setting('sw.u_ps')::uuid));

  --  The report now shows it resolved, and says to whom.
  PERFORM _swk('C','C9 the report shows it resolved',
    (SELECT NOT still_stranded AND reassigned_to = current_setting('sw.u_ps2')::uuid
       FROM public.operational_role_stranded_work(current_setting('sw.c')::uuid)
      WHERE entity_id = current_setting('sw.b_open')::uuid));

  --  IMMUTABLE. A reassignment is a record of a decision.
  PERFORM _swk('C','C10 a reassignment cannot be edited',
    _swfail(format('UPDATE public.stranded_work_reassignments SET to_user = %L WHERE id = %L',
      current_setting('sw.u_adm'), v_id)) = 'STRANDED_WORK_IMMUTABLE',
    _swfail(format('UPDATE public.stranded_work_reassignments SET to_user = %L WHERE id = %L',
      current_setting('sw.u_adm'), v_id)));

  PERFORM _swk('C','C11 nor deleted',
    _swfail(format('DELETE FROM public.stranded_work_reassignments WHERE id = %L', v_id))
      = 'STRANDED_WORK_IMMUTABLE');
END $c2$;

RESET ROLE;

DO $c3$
BEGIN
  --  Not even by a service caller: who was asked to do what, and when,
  --  is the same question whoever is asking.
  PERFORM _swk('C','C12 and not by a service caller either',
    _swfail(format('UPDATE public.stranded_work_reassignments SET reason = %L WHERE id = %L',
      'rewritten', current_setting('sw.reassignment')))
      = 'STRANDED_WORK_IMMUTABLE',
    _swfail(format('UPDATE public.stranded_work_reassignments SET reason = %L WHERE id = %L',
      'rewritten', current_setting('sw.reassignment'))));
END $c3$;


-- =====================================================================
--  D. Service-context grants
--
--  The one way a GMP-critical role is granted without a signature: a
--  migration, a seed or a scheduler, none of which has a password and
--  none of which is a person. It is allowed, because a deployment has
--  to be able to set a workspace up — and it is marked and reported,
--  because that is the part that can be closed.
-- =====================================================================
DO $d$
DECLARE
  c uuid := current_setting('sw.c')::uuid;
  v_id uuid; v_n int;
BEGIN
  --  (1) Allowed, in service context, with no signature.
  v_id := public.operational_role_assign(c, current_setting('sw.u_adm')::uuid,
                                         'qa_manager', 'deployment seed');
  PERFORM set_config('sw.service_grant', v_id::text, false);
  PERFORM _swk('D','D1 a service context may grant a GMP-critical role unsigned',
    public.app_has_work_role(c,'qa_manager',current_setting('sw.u_adm')::uuid));

  --  (2) MARKED. Not waved through silently.
  PERFORM _swk('D','D2 and it is stamped as a service grant',
    (SELECT provenance = 'service' AND grant_signature_id IS NULL
       FROM public.operational_role_assignments WHERE id = v_id));

  --  (3) REPORTED, with a finding that says what is missing.
  PERFORM _swk('D','D3 it appears in operational_role_unsigned_grants',
    EXISTS (SELECT 1 FROM public.operational_role_unsigned_grants(c)
             WHERE assignment_id = v_id));

  PERFORM _swk('D','D4 and the finding says no person signed for it',
    (SELECT finding LIKE '%No person signed for it%'
       FROM public.operational_role_unsigned_grants(c) WHERE assignment_id = v_id));

  --  (4) It is distinguishable from a bootstrap self-declaration,
  --  which is a different kind of unsigned.
  PERFORM _swk('D','D5 and is distinguishable from a bootstrap grant',
    (SELECT provenance = 'service'
       FROM public.operational_role_unsigned_grants(c) WHERE assignment_id = v_id));

  --  (5) still_live tells a reviewer whether it matters now.
  PERFORM _swk('D','D6 it is reported as still live',
    (SELECT still_live FROM public.operational_role_unsigned_grants(c)
      WHERE assignment_id = v_id));

  --  (6) A grant made by a PERSON through the RPC does not appear —
  --  otherwise the report is noise and nobody reads it.
  PERFORM _swk('D','D7 an ordinary signed grant is not reported',
    NOT EXISTS (SELECT 1 FROM public.operational_role_unsigned_grants(c) u
                 JOIN public.operational_role_assignments a ON a.id = u.assignment_id
                WHERE a.provenance = 'rpc' AND a.grant_signature_id IS NOT NULL));

  --  (7) A non-critical role granted in service context is STILL
  --  reported: the question the report answers is "who got authority
  --  without a person vouching for it", not "which signature is
  --  missing".
  SELECT count(*) INTO v_n FROM public.operational_role_unsigned_grants(c)
   WHERE provenance = 'service';
  PERFORM _swk('D','D8 every service grant is reported, not just critical ones',
    v_n >= 4, v_n::text);
END $d$;


-- =====================================================================
--  E. The pre-release check
--
--  Documented in docs/release-verification.md as mandatory before
--  deployment. Asserted here so the query in the document is one that
--  works, rather than one that was written out and never run.
-- =====================================================================
DO $e$
DECLARE c uuid := current_setting('sw.c')::uuid; v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.companies co,
         LATERAL public.operational_role_unsigned_grants(co.id) g
   WHERE co.id = c AND g.still_live;
  PERFORM _swk('E','E1 the cross-company pre-release query runs', v_n > 0, v_n::text);

  --  And the stranded-work half of the same check.
  SELECT count(*) INTO v_n
    FROM public.companies co,
         LATERAL public.operational_role_stranded_work(co.id) w
   WHERE co.id = c AND w.still_stranded;
  PERFORM _swk('E','E2 and so does the stranded-work query',
    v_n >= 0, v_n::text);

  --  Both functions are readable by an ordinary signed-in user, so a
  --  screen can show them rather than a DBA having to.
  PERFORM _swk('E','E3 both are executable by authenticated',
    has_function_privilege('authenticated',
      'public.operational_role_unsigned_grants(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated',
      'public.operational_role_stranded_work(uuid)', 'EXECUTE'));
END $e$;


RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

-- =====================================================================
--  Results — COLUMN ORDER IS total, passed, failed.
-- =====================================================================
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _sw ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _sw;

DO $gate$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM _sw WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'STRANDED WORK AND SERVICE GRANTS: % assertion(s) failed', v_failed;
  END IF;
END
$gate$;
