-- =====================================================================
--  THE AUDIT CHAIN, SEALED SERVER-SIDE
--
--  Covers 20261108000000_audit_chain_sealed_server_side.sql.
--
--  WHAT WAS TRUE BEFORE. audit_logs refused UPDATE, DELETE and
--  TRUNCATE, so no entry could be changed or removed — a real control,
--  and it still holds. But integrity_hash, previous_hash and
--  sequence_number were all written by the browser, which holds the
--  anon key, and verify_audit_chain only ever compared each row's
--  previous_hash to the prior row's integrity_hash. It never recomputed
--  anything, and it filtered on `integrity_hash IS NOT NULL` — so an
--  entry written with no hash was not merely unverified, it was
--  invisible to verification and the chain closed over the gap.
--
--  Sections:
--    A. The sealer is attached and overwrites what the client sent
--    B. The chain links, and the first entry of a company is GENESIS
--    C. Contents are verified, not just linkage
--    D. An unhashed entry is a finding, not a skipped row
--    E. The entries themselves are still immutable
--    F. Sealed and unsealed entries are counted apart
--
--  Fixtures are random per run and not cleaned up: audit_logs refuses
--  DELETE, which is the control under test.
-- =====================================================================
\set ON_ERROR_STOP on
SET client_min_messages = warning;

RESET ROLE;
SELECT set_config('request.jwt.claims','', false);

CREATE TEMP TABLE _ac(section text, name text, ok boolean, detail text);
GRANT ALL ON _ac TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION _ack(p_section text, p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO _ac VALUES (p_section,p_name,coalesce(p_ok,false),p_detail); END $$;

DO $fx$
DECLARE
  c_a uuid := gen_random_uuid();
  u_a uuid := gen_random_uuid();
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
BEGIN
  PERFORM set_config('ac.c_a', c_a::text, false);
  PERFORM set_config('ac.u_a', u_a::text, false);
  INSERT INTO public.companies(id,name) VALUES (c_a,'Audit Chain Works '||tag);
  INSERT INTO auth.users(id,email) VALUES (u_a,'ac-'||tag||'@ac.test');
  INSERT INTO public.profiles(id,email,full_name,company_id,role)
  VALUES (u_a,'ac-'||tag||'@ac.test','Ada Auditor',c_a,'admin');
  INSERT INTO public.company_members(company_id,user_id,role,status)
  VALUES (c_a,u_a,'owner','active');
END
$fx$;


-- =====================================================================
--  A — the sealer overwrites what the client sent
-- =====================================================================
DO $a$
DECLARE
  c_a uuid := current_setting('ac.c_a')::uuid;
  u_a uuid := current_setting('ac.u_a')::uuid;
  v_id uuid; v_hash text; v_prev text; v_seq bigint; v_algo text;
BEGIN
  PERFORM _ack('A','A1 the sealing trigger is attached',
    EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
             WHERE c.relname='audit_logs' AND t.tgname='trg_audit_logs_seal'
               AND NOT t.tgisinternal));

  --  Everything a client could choose, chosen wrongly on purpose.
  INSERT INTO public.audit_logs
    (company_id, user_id, action, entity_type, metadata,
     integrity_hash, previous_hash, sequence_number)
  VALUES (c_a, u_a, 'first_action', 'thing', '{"a":1}'::jsonb,
          'client-chose-this', 'and-this', 4242)
  RETURNING id INTO v_id;
  PERFORM set_config('ac.e1', v_id::text, false);

  SELECT integrity_hash, previous_hash, sequence_number, hash_algo
    INTO v_hash, v_prev, v_seq, v_algo
    FROM public.audit_logs WHERE id = v_id;

  PERFORM _ack('A','A2 the client''s integrity hash does not survive',
    v_hash <> 'client-chose-this' AND v_hash ~ '^[0-9a-f]{64}$', v_hash);
  PERFORM _ack('A','A3 nor its previous hash', v_prev = 'GENESIS', v_prev);
  PERFORM _ack('A','A4 nor its sequence number', v_seq = 1, v_seq::text);
  PERFORM _ack('A','A5 and the row records which convention sealed it',
    v_algo = 'sha256-auditlog-v1', coalesce(v_algo,'<null>'));
END
$a$;


-- =====================================================================
--  B — the chain links
-- =====================================================================
DO $b$
DECLARE
  c_a uuid := current_setting('ac.c_a')::uuid;
  u_a uuid := current_setting('ac.u_a')::uuid;
  v_id uuid; r json;
BEGIN
  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, metadata)
  VALUES (c_a, u_a, 'second_action', 'thing', '{"b":2}'::jsonb)
  RETURNING id INTO v_id;
  PERFORM set_config('ac.e2', v_id::text, false);

  PERFORM _ack('B','B1 the second entry links to the first',
    (SELECT previous_hash FROM public.audit_logs WHERE id = v_id)
      = (SELECT integrity_hash FROM public.audit_logs
          WHERE id = current_setting('ac.e1')::uuid));

  PERFORM _ack('B','B2 and takes the next sequence number',
    (SELECT sequence_number FROM public.audit_logs WHERE id = v_id) = 2,
    (SELECT sequence_number::text FROM public.audit_logs WHERE id = v_id));

  r := public.verify_audit_chain(c_a);
  PERFORM _ack('B','B3 the chain verifies', (r->>'valid')::boolean, r::text);
  PERFORM _ack('B','B4 and both entries were checked', (r->>'total_checked')::int = 2, r::text);
  PERFORM _ack('B','B5 both counted as sealed', (r->>'sealed')::int = 2, r::text);
END
$b$;


-- =====================================================================
--  C — contents are verified, not only linkage
--
--  THE CLAIM THE OLD VERIFIER COULD NOT MAKE. It compared each row's
--  previous_hash to the prior row's integrity_hash and recomputed
--  nothing, so a row whose hash never matched its own contents passed.
--
--  audit_logs refuses UPDATE, so the tamper is simulated the only way
--  it can be: by disabling the immutability trigger, which is itself
--  something an attacker with enough privilege could do, and which
--  section E proves is otherwise in force.
-- =====================================================================
DO $c$
DECLARE
  c_a uuid := current_setting('ac.c_a')::uuid;
  e2 uuid := current_setting('ac.e2')::uuid;
  r json; v_before text;
BEGIN
  SELECT integrity_hash INTO v_before FROM public.audit_logs WHERE id = e2;

  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_update;
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_prevent_audit_log_deletion;
  --  The contents change; the hashes are left exactly as they were,
  --  which is what a tamper looks like.
  UPDATE public.audit_logs SET action = 'second_action_TAMPERED' WHERE id = e2;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_update;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_prevent_audit_log_deletion;

  PERFORM _ack('C','C0 the hashes were not touched by the tamper',
    (SELECT integrity_hash FROM public.audit_logs WHERE id = e2) = v_before);

  r := public.verify_audit_chain(c_a);
  PERFORM _ack('C','C1 the chain no longer verifies', NOT (r->>'valid')::boolean, r::text);
  PERFORM _ack('C','C2 and it names the tampered entry',
    (r->>'broken_at')::uuid = e2, r->>'broken_at');
  PERFORM _ack('C','C3 and says the contents disagree with the hash',
    r->>'broken_reason' LIKE '%contents%', r->>'broken_reason');

  --  Put it back so the sections below are not reading a broken chain.
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_update;
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_prevent_audit_log_deletion;
  UPDATE public.audit_logs SET action = 'second_action' WHERE id = e2;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_update;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_prevent_audit_log_deletion;

  r := public.verify_audit_chain(c_a);
  PERFORM _ack('C','C4 restoring the contents restores the verdict',
    (r->>'valid')::boolean, r::text);
END
$c$;


-- =====================================================================
--  D — an unhashed entry is a finding, not a skipped row
--
--  The old verifier's query said `WHERE integrity_hash IS NOT NULL`,
--  so this entry would not have appeared in it at all and the chain
--  would have read as intact over the top of it.
-- =====================================================================
DO $d$
DECLARE
  c_a uuid := current_setting('ac.c_a')::uuid;
  u_a uuid := current_setting('ac.u_a')::uuid;
  v_id uuid; r json;
BEGIN
  --  The sealer always sets a hash, so an unhashed entry can only be
  --  produced by going round it — which is exactly the case the
  --  verifier has to cope with.
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_logs_seal;
  INSERT INTO public.audit_logs
    (company_id, user_id, action, entity_type, metadata,
     integrity_hash, previous_hash, sequence_number)
  VALUES (c_a, u_a, 'slipped_in', 'thing', '{"c":3}'::jsonb, NULL, NULL, 3)
  RETURNING id INTO v_id;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_seal;

  r := public.verify_audit_chain(c_a);
  PERFORM _ack('D','D1 an entry with no hash breaks the verdict',
    NOT (r->>'valid')::boolean, r::text);
  PERFORM _ack('D','D2 it is named rather than skipped',
    (r->>'broken_at')::uuid = v_id, r->>'broken_at');
  PERFORM _ack('D','D3 and counted',
    (r->>'unhashed')::int = 1, r::text);
  PERFORM _ack('D','D4 the total includes it',
    (r->>'total_checked')::int = 3, r::text);

  PERFORM set_config('ac.e3', v_id::text, false);
END
$d$;


-- =====================================================================
--  E — the entries are still immutable
--
--  Section C reached its tamper by turning the guard off. This is the
--  guard being on, which is the ordinary case.
-- =====================================================================
DO $e$
DECLARE e1 uuid := current_setting('ac.e1')::uuid; v_ok boolean := false; v_msg text;
BEGIN
  BEGIN
    UPDATE public.audit_logs SET action = 'rewritten' WHERE id = e1;
    v_msg := 'AN AUDIT ENTRY WAS UPDATED';
  EXCEPTION WHEN OTHERS THEN v_ok := true; v_msg := SQLERRM;
  END;
  PERFORM _ack('E','E1 an audit entry cannot be updated', v_ok, left(v_msg,120));

  v_ok := false;
  BEGIN
    DELETE FROM public.audit_logs WHERE id = e1;
    v_msg := 'AN AUDIT ENTRY WAS DELETED';
  EXCEPTION WHEN OTHERS THEN v_ok := true; v_msg := SQLERRM;
  END;
  PERFORM _ack('E','E2 nor deleted', v_ok, left(v_msg,120));

  PERFORM _ack('E','E3 and it is still there',
    EXISTS (SELECT 1 FROM public.audit_logs WHERE id = e1 AND action = 'first_action'));
END
$e$;


-- =====================================================================
--  F — sealed and unsealed are counted apart
--
--  Entries written before this migration carry a client-computed hash
--  and are NOT retro-hashed: recomputing a hash over content nobody can
--  vouch for turns an unverifiable entry into one that looks verified.
--  So they are counted separately, and a reader can tell "the chain is
--  intact" from "the part of it anybody can vouch for is intact".
-- =====================================================================
DO $f$
DECLARE
  c_b uuid := gen_random_uuid();
  u_a uuid := current_setting('ac.u_a')::uuid;
  tag text := substr(replace(gen_random_uuid()::text,'-',''),1,8);
  v_prev text; r json;
BEGIN
  INSERT INTO public.companies(id,name) VALUES (c_b,'Legacy Chain '||tag);

  --  A legacy entry: hashed by a client, with no hash_algo, linked to
  --  GENESIS the way the old browser code did.
  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_logs_seal;
  INSERT INTO public.audit_logs
    (company_id, user_id, action, entity_type, metadata,
     integrity_hash, previous_hash, sequence_number, hash_algo)
  VALUES (c_b, u_a, 'legacy_action', 'thing', '{}'::jsonb,
          repeat('a', 64), 'GENESIS', 1, NULL);
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_seal;

  r := public.verify_audit_chain(c_b);
  PERFORM _ack('F','F1 a legacy entry still verifies on linkage',
    (r->>'valid')::boolean, r::text);
  PERFORM _ack('F','F2 but is counted as unsealed, not sealed',
    (r->>'unsealed')::int = 1 AND (r->>'sealed')::int = 0, r::text);

  --  A sealed entry after it links to the legacy hash, so a workspace
  --  that predates sealing keeps one continuous chain.
  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, metadata)
  VALUES (c_b, u_a, 'sealed_after_legacy', 'thing', '{}'::jsonb);

  SELECT previous_hash INTO v_prev FROM public.audit_logs
   WHERE company_id = c_b AND action = 'sealed_after_legacy';
  PERFORM _ack('F','F3 a sealed entry links onto the legacy one',
    v_prev = repeat('a', 64), v_prev);

  r := public.verify_audit_chain(c_b);
  PERFORM _ack('F','F4 the mixed chain verifies and counts both kinds',
    (r->>'valid')::boolean AND (r->>'sealed')::int = 1 AND (r->>'unsealed')::int = 1,
    r::text);

  --  The contents of the LEGACY entry are not checked — its hash is a
  --  row of a's and the verifier does not object, because it cannot
  --  know what convention produced it. Asserted so the limit is
  --  visible rather than assumed.
  PERFORM _ack('F','F5 a legacy entry''s contents are not verifiable, and that is not an error',
    (r->>'valid')::boolean, r::text);
END
$f$;



-- =====================================================================
--  G — pre-sealing entries are marked, and nothing is fabricated
--
--  The decision: preserve existing entries and timestamps; mark those
--  whose integrity cannot be verified as legacy/unverified and record
--  the reason; never fabricate hashes or retroactively claim
--  verification.
--
--  Section F's legacy entry is the subject. 20261115000000 marks rows
--  of its shape, but F inserted this one AFTER that migration ran, so
--  it is marked here the same way the migration marks the rows it
--  found — which also demonstrates that the marker is what the
--  verifier reads, rather than an inference from a NULL.
-- =====================================================================
DO $g$
DECLARE
  c_b uuid; v_hash_before text; v_at_before timestamptz; r json; v_legacy_id uuid;
BEGIN
  --  Scoped by id, not by action name: a database that has had this
  --  suite run against it more than once holds several legacy_action
  --  rows, and an unscoped subquery would fail on "more than one row"
  --  rather than on anything the section is about.
  SELECT id, company_id, integrity_hash, created_at
    INTO v_legacy_id, c_b, v_hash_before, v_at_before
    FROM public.audit_logs WHERE action = 'legacy_action'
    ORDER BY created_at DESC LIMIT 1;

  PERFORM _ack('G','G1 the legacy convention is recorded with a reason',
    EXISTS (SELECT 1 FROM public.audit_hash_conventions
             WHERE algo = 'legacy-client-v0' AND verifiable = false
               AND btrim(coalesce(reason,'')) <> ''));

  PERFORM _ack('G','G2 and the sealed one is recorded as verifiable',
    (SELECT verifiable FROM public.audit_hash_conventions
      WHERE algo = 'sha256-auditlog-v1'));

  ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_update;
  UPDATE public.audit_logs SET hash_algo = 'legacy-client-v0'
   WHERE id = v_legacy_id AND hash_algo IS NULL;
  ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_update;

  --  NOTHING FABRICATED. The hash it arrived with is the hash it has,
  --  and its timestamp is untouched. A hash computed now over content
  --  nobody can vouch for would turn an unverifiable entry into one
  --  that looks verified, which is the worst thing this could do.
  PERFORM _ack('G','G3 marking it did not change its hash',
    (SELECT integrity_hash FROM public.audit_logs WHERE id = v_legacy_id)
      = v_hash_before,
    (SELECT integrity_hash FROM public.audit_logs WHERE id = v_legacy_id));

  PERFORM _ack('G','G4 nor its timestamp',
    (SELECT created_at FROM public.audit_logs WHERE id = v_legacy_id)
      = v_at_before);

  r := public.verify_audit_chain(c_b);
  PERFORM _ack('G','G5 it counts as unsealed, not sealed',
    (r->>'unsealed')::int >= 1, r::text);

  --  THE REASON COMES FROM THE DATABASE, so a screen does not have to
  --  carry that sentence and cannot drift from it.
  PERFORM _ack('G','G6 and the verdict carries the reason it cannot be verified',
    (r->>'legacy_reason') LIKE '%nothing to recompute it against%',
    left(coalesce(r->>'legacy_reason','<null>'), 120));

  --  A chain with nothing unsealed does not carry the sentence at all,
  --  so it is not shown where it does not apply.
  PERFORM _ack('G','G7 a fully sealed chain carries no legacy reason',
    (public.verify_audit_chain(current_setting('ac.c_a')::uuid)->>'legacy_reason') IS NULL,
    coalesce(public.verify_audit_chain(current_setting('ac.c_a')::uuid)->>'legacy_reason','<null>'));

  --  AND THE AMBIGUITY THE MARKER EXISTS TO REMOVE: a row with no hash
  --  is NOT marked legacy. It is a finding, and conflating the two
  --  would hide it.
  PERFORM _ack('G','G8 an entry with no hash is not marked legacy',
    NOT EXISTS (SELECT 1 FROM public.audit_logs
                 WHERE hash_algo = 'legacy-client-v0' AND integrity_hash IS NULL));

  PERFORM _ack('G','G9 and is still reported as unhashed',
    (public.verify_audit_chain(current_setting('ac.c_a')::uuid)->>'unhashed')::int = 1,
    public.verify_audit_chain(current_setting('ac.c_a')::uuid)::text);

  --  The immutability guard is back on after the marking statement.
  PERFORM _ack('G','G10 the update guard is enabled again',
    NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                 WHERE c.relname='audit_logs' AND t.tgname='trg_block_audit_update'
                   AND t.tgenabled='D'));
END
$g$;


-- =====================================================================
--  Results
--
--  COLUMN ORDER IS total, passed, failed.
-- =====================================================================
SELECT section, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _ac ORDER BY section, name;

SELECT count(*) AS total,
       count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed
  FROM _ac;

DO $gate$
DECLARE v_failed bigint;
BEGIN
  SELECT count(*) INTO v_failed FROM _ac WHERE NOT ok;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'AUDIT CHAIN SEAL: % assertion(s) failed', v_failed;
  END IF;
END
$gate$;
