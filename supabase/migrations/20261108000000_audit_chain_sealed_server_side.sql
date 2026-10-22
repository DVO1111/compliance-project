-- The audit chain, computed where the client cannot reach it.
--
-- ── WHAT THE CHAIN ACTUALLY WAS ──
--
-- audit_logs is append-only and well defended on that front:
-- trg_block_audit_update, trg_block_audit_delete and
-- trg_block_audit_truncate refuse all three, so no existing entry can
-- be changed or removed.
--
-- The integrity chain was a different story. There was NO trigger
-- computing integrity_hash, previous_hash or sequence_number. All
-- three were written by the browser: src/lib/auditService.ts read the
-- last row, took its hash as `previous_hash`, took its sequence number
-- plus one, and computed a SHA-256 over a payload it assembled itself.
--
-- The browser holds the anon key. So anyone with it could:
--
--   * insert an entry with integrity_hash NULL — and verify_audit_chain
--     filtered on `integrity_hash IS NOT NULL`, so the entry was not
--     merely unverified, it was INVISIBLE to verification and the chain
--     closed over the gap;
--   * insert an entry with any hash and any sequence number, since
--     nothing server-side disagreed;
--   * write an entry whose hash never matched its own contents, because
--     verify_audit_chain only ever compared each row's previous_hash to
--     the prior row's integrity_hash. It never recomputed anything.
--
-- That last point is worth stating plainly because the code said
-- otherwise: verifyChainIntegrity's comment in auditService.ts claimed
-- it "re-computes every hash in the chain". Neither the RPC nor the
-- client fallback did. Both checked linkage.
--
-- Append-only is a real control and it still holds. Tamper-EVIDENT is
-- a stronger claim and the chain did not support it.
--
-- ── WHAT THIS CHANGES ──
--
-- A BEFORE INSERT trigger seals every new entry: it assigns the
-- sequence number, links the previous hash, and computes the integrity
-- hash from the row's own contents, OVERWRITING whatever the client
-- sent. The client may keep computing its own; it no longer matters,
-- which is the point.
--
-- Entries written before this migration keep their client-computed
-- hashes and are marked as unsealed. They are NOT retro-hashed —
-- recomputing a hash over content nobody can vouch for would turn an
-- unverifiable entry into one that looks verified, which is worse than
-- leaving it plainly unverifiable.
--
-- ── WHAT IS STILL NOT CLAIMED ──
--
-- This makes the chain self-consistent and server-sealed. It does not
-- make the system validated, and nothing here should be described as
-- establishing regulatory compliance. The screen says what the
-- verification covers and what it does not.


-- ── 1. Which convention sealed a row ────────────────────────────────
--
-- Named rather than assumed, so a row written before this migration is
-- distinguishable from one written after. Without it, verification
-- would have to guess which rows it can check the contents of, and a
-- guess in the lenient direction reports unverifiable rows as verified.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS hash_algo text;

COMMENT ON COLUMN public.audit_logs.hash_algo IS
  'The convention that sealed this row. NULL means the row predates server-side sealing and its hash was computed by a client, so its contents cannot be verified.';


-- ── 2. The payload a hash is taken over ─────────────────────────────
--
-- A function rather than inline SQL, so the verifier and the sealer
-- cannot drift: they call the same one. If they computed the payload
-- separately, a change to one would make every row fail verification
-- and look like tampering.
--
-- jsonb is used for metadata rather than its text form because
-- jsonb::text is key-ordered and stable, while json::text preserves
-- whatever order the writer used.

CREATE OR REPLACE FUNCTION public.audit_log_payload(
  p_company_id      uuid,
  p_user_id         uuid,
  p_action          text,
  p_entity_type     text,
  p_entity_id       uuid,
  p_metadata        jsonb,
  p_created_at      timestamptz,
  p_sequence_number bigint,
  p_previous_hash   text
) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT concat_ws('|',
    coalesce(p_company_id::text, ''),
    coalesce(p_user_id::text, ''),
    coalesce(p_action, ''),
    coalesce(p_entity_type, ''),
    coalesce(p_entity_id::text, ''),
    coalesce(p_metadata::text, '{}'),
    --  A fixed rendering, not the session's. to_char with an explicit
    --  pattern at UTC means a server in another timezone recomputes the
    --  same string.
    coalesce(to_char(p_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''),
    coalesce(p_sequence_number::text, ''),
    coalesce(p_previous_hash, 'GENESIS')
  );
$$;

COMMENT ON FUNCTION public.audit_log_payload IS
  'The canonical string an audit entry''s integrity hash is taken over. Shared by the sealer and the verifier so the two cannot drift.';


-- ── 3. Sealing ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_audit_logs_seal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_prev_hash text;
  v_prev_seq  bigint;
BEGIN
  --  Serialised per company. Two concurrent inserts reading the same
  --  "last row" would otherwise both link to it and both claim the same
  --  sequence number, which is a fork in the chain rather than a chain.
  --  Per company rather than globally so one busy workspace does not
  --  queue behind another.
  PERFORM pg_advisory_xact_lock(hashtext('audit_logs:' || coalesce(NEW.company_id::text, 'none')));

  SELECT integrity_hash, sequence_number
    INTO v_prev_hash, v_prev_seq
    FROM public.audit_logs
   WHERE company_id IS NOT DISTINCT FROM NEW.company_id
   ORDER BY sequence_number DESC NULLS LAST, created_at DESC
   LIMIT 1;

  NEW.created_at      := coalesce(NEW.created_at, now());
  NEW.sequence_number := coalesce(v_prev_seq, 0) + 1;
  NEW.previous_hash   := coalesce(v_prev_hash, 'GENESIS');

  --  WHATEVER THE CLIENT SENT IS DISCARDED. That is the whole change:
  --  a hash the writer chose is not evidence about the writer.
  NEW.integrity_hash := encode(
    extensions.digest(
      public.audit_log_payload(
        NEW.company_id, NEW.user_id, NEW.action, NEW.entity_type, NEW.entity_id,
        NEW.metadata, NEW.created_at, NEW.sequence_number, NEW.previous_hash),
      'sha256'),
    'hex');
  NEW.hash_algo := 'sha256-auditlog-v1';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_seal ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_seal
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_logs_seal();


-- ── 4. Verification that actually verifies ──────────────────────────
--
-- Three things the previous version did not do:
--
--   * it RECOMPUTES the hash of every sealed row from that row's own
--     contents, rather than only checking that the links join up;
--   * it treats a row with no integrity hash as a FINDING rather than
--     filtering it out of the query, which is how an unhashed entry
--     used to become invisible;
--   * it reports the unsealed legacy rows as a separate number, so a
--     reader can tell "the chain is intact" from "the part of the chain
--     anybody can vouch for is intact".
--
-- The return shape keeps `valid`, `total_checked` and `broken_at` so
-- the existing caller in auditService.ts goes on working.

CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  rec              record;
  expected_prev    text := 'GENESIS';
  chain_valid      boolean := true;
  broken_id        uuid := null;
  broken_reason    text := null;
  total_checked    integer := 0;
  sealed_count     integer := 0;
  unsealed_count   integer := 0;
  unhashed_count   integer := 0;
  recomputed       text;
BEGIN
  FOR rec IN
    SELECT id, company_id, user_id, action, entity_type, entity_id, metadata,
           created_at, sequence_number, previous_hash, integrity_hash, hash_algo
      FROM public.audit_logs
     WHERE company_id = p_company_id
     ORDER BY sequence_number ASC NULLS LAST, created_at ASC
  LOOP
    total_checked := total_checked + 1;

    --  NOT FILTERED OUT. An entry with no hash is the case the old
    --  query excluded, which made it the easiest way to write an entry
    --  nothing could check.
    IF rec.integrity_hash IS NULL THEN
      unhashed_count := unhashed_count + 1;
      IF chain_valid THEN
        chain_valid := false; broken_id := rec.id;
        broken_reason := 'entry has no integrity hash';
      END IF;
      CONTINUE;
    END IF;

    IF rec.hash_algo = 'sha256-auditlog-v1' THEN
      sealed_count := sealed_count + 1;

      IF rec.previous_hash IS DISTINCT FROM expected_prev THEN
        IF chain_valid THEN
          chain_valid := false; broken_id := rec.id;
          broken_reason := 'previous hash does not match the entry before it';
        END IF;
      END IF;

      recomputed := encode(
        extensions.digest(
          public.audit_log_payload(
            rec.company_id, rec.user_id, rec.action, rec.entity_type, rec.entity_id,
            rec.metadata, rec.created_at, rec.sequence_number, rec.previous_hash),
          'sha256'),
        'hex');

      IF recomputed IS DISTINCT FROM rec.integrity_hash THEN
        IF chain_valid THEN
          chain_valid := false; broken_id := rec.id;
          broken_reason := 'the entry''s contents do not match its hash';
        END IF;
      END IF;
    ELSE
      --  Written before sealing, by a client. Its linkage is still
      --  checked; its contents cannot be, and that is counted and
      --  reported rather than quietly treated as a pass.
      unsealed_count := unsealed_count + 1;
      IF rec.previous_hash IS DISTINCT FROM expected_prev THEN
        IF chain_valid THEN
          chain_valid := false; broken_id := rec.id;
          broken_reason := 'previous hash does not match the entry before it';
        END IF;
      END IF;
    END IF;

    expected_prev := rec.integrity_hash;
  END LOOP;

  RETURN json_build_object(
    'valid',          chain_valid,
    'total_checked',  total_checked,
    'broken_at',      broken_id,
    'broken_reason',  broken_reason,
    'sealed',         sealed_count,
    'unsealed',       unsealed_count,
    'unhashed',       unhashed_count
  );
END;
$$;

COMMENT ON FUNCTION public.verify_audit_chain(uuid) IS
  'Checks the audit chain: linkage for every entry, and the contents against the hash for every server-sealed entry. Reports unsealed (client-hashed, contents unverifiable) and unhashed entries separately. Does not establish regulatory compliance.';

REVOKE ALL ON FUNCTION public.verify_audit_chain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(uuid) TO authenticated, service_role;


-- ── 5. What this file assumes, asserted ─────────────────────────────

DO $assert$
DECLARE
  v_company uuid := gen_random_uuid();
  v_id uuid; r json;
BEGIN
  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL
     AND to_regprocedure('extensions.digest(text,text)') IS NULL THEN
    RAISE EXCEPTION
      'AUDIT_SEAL_NO_DIGEST: pgcrypto''s digest() is not reachable as extensions.digest, so audit entries cannot be sealed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'audit_logs' AND t.tgname = 'trg_audit_logs_seal'
       AND NOT t.tgisinternal)
  THEN
    RAISE EXCEPTION 'AUDIT_SEAL_NOT_ATTACHED: the sealing trigger is not on audit_logs';
  END IF;

  --  PROVE IT SEALS, rather than trusting that it is attached.
  --  20261105000000 exists because an attached trigger never fired.
  --
  --  RUN INSIDE A SUBTRANSACTION THAT IS ROLLED BACK. audit_logs
  --  refuses DELETE by design, so a probe row would be permanent —
  --  a migration that leaves self-test entries in the audit trail of
  --  every workspace is worse than one that does not test itself.
  --  A plpgsql BEGIN ... EXCEPTION block is a subtransaction, so
  --  raising at the end of it discards the company and the entry.
  BEGIN
    INSERT INTO public.companies(id, name) VALUES (v_company, 'Audit seal self test');

    INSERT INTO public.audit_logs (company_id, action, entity_type, metadata,
                                   integrity_hash, previous_hash, sequence_number)
    VALUES (v_company, 'seal_self_test', 'migration', '{"k":"v"}'::jsonb,
            'a-hash-the-client-chose', 'another-one', 999999)
    RETURNING id INTO v_id;

    IF (SELECT integrity_hash FROM public.audit_logs WHERE id = v_id)
       = 'a-hash-the-client-chose' THEN
      RAISE EXCEPTION 'AUDIT_SEAL_INERT: the client''s hash survived the sealing trigger';
    END IF;
    IF (SELECT previous_hash FROM public.audit_logs WHERE id = v_id) <> 'GENESIS' THEN
      RAISE EXCEPTION 'AUDIT_SEAL_BAD_LINK: the first entry of a new company did not link to GENESIS';
    END IF;
    IF (SELECT sequence_number FROM public.audit_logs WHERE id = v_id) <> 1 THEN
      RAISE EXCEPTION 'AUDIT_SEAL_BAD_SEQ: the client''s sequence number survived';
    END IF;

    r := public.verify_audit_chain(v_company);
    IF NOT (r->>'valid')::boolean THEN
      RAISE EXCEPTION 'AUDIT_SEAL_UNVERIFIABLE: a freshly sealed entry does not verify: %', r::text;
    END IF;
    IF (r->>'sealed')::int <> 1 THEN
      RAISE EXCEPTION 'AUDIT_SEAL_NOT_COUNTED: the sealed entry was not counted as sealed: %', r::text;
    END IF;

    --  Everything held. Unwind the subtransaction.
    RAISE EXCEPTION 'AUDIT_SEAL_SELF_TEST_PASSED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'AUDIT_SEAL_SELF_TEST_PASSED' THEN RAISE; END IF;
  END;
END;
$assert$;
