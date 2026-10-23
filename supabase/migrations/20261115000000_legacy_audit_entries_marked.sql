-- Pre-sealing audit entries, marked for what they are.
--
-- ── THE DECISION THIS IMPLEMENTS ──
--
-- Preserve existing entries and their timestamps; mark those whose
-- integrity cannot be verified as legacy/unverified and record the
-- reason; never fabricate hashes or retroactively claim verification;
-- ensure new entries follow the sealed process.
--
-- ── WHAT "CANNOT BE VERIFIED" MEANS HERE, EXACTLY ──
--
-- Before 20261108000000, integrity_hash, previous_hash and
-- sequence_number were written by the browser, which holds the anon
-- key, and verify_audit_chain compared links without recomputing
-- anything. So for an entry written then, two separate things are
-- true and only one of them is a gap:
--
--   * its LINKAGE can still be checked — the hash it carries either
--     matches the next entry's previous_hash or it does not, and that
--     check is as good as it ever was;
--   * its CONTENTS cannot — nothing records which payload convention
--     produced the hash, so there is nothing to recompute it against.
--
-- The entry is therefore not worthless and not trustworthy. It is
-- `legacy-client-v0`, and both halves of that sentence are reported.
--
-- ── WHY NULL WAS NOT GOOD ENOUGH ──
--
-- 20261108000000 left hash_algo NULL on these rows and inferred
-- "unsealed" from the absence. That conflated two different things: a
-- row written by a client under the old convention, and a row written
-- with no hash at all by somebody going round the sealer. The first is
-- history; the second is a finding. A marker says which, and the
-- absence of one stops being evidence of anything.
--
-- ── WHAT IS NOT DONE, ON PURPOSE ──
--
-- NO HASH IS COMPUTED FOR THESE ROWS. A hash calculated now over
-- content nobody can vouch for would turn an unverifiable entry into
-- one that looks verified, which is the single worst thing this
-- migration could do. Their integrity_hash, previous_hash,
-- sequence_number and created_at are left exactly as they are.
--
-- The reason is recorded ONCE, as the meaning of the marker, rather
-- than copied onto every row: every legacy entry is unverifiable for
-- the same reason, and a per-row copy of one sentence would be a
-- thousand places for it to drift.


-- ── 1. The marker ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_hash_conventions (
  algo        text PRIMARY KEY,
  description text NOT NULL,
  --  Whether an entry sealed under this convention can have its
  --  CONTENTS recomputed. Linkage is checkable either way.
  verifiable  boolean NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_hash_conventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_hash_conventions_select ON public.audit_hash_conventions;
CREATE POLICY audit_hash_conventions_select ON public.audit_hash_conventions
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.audit_hash_conventions (algo, description, verifiable, reason) VALUES
  ('sha256-auditlog-v1',
   'Sealed by the database on insert. Sequence number, previous hash and integrity hash are assigned by a BEFORE INSERT trigger from the row''s own contents.',
   true,
   NULL),
  ('legacy-client-v0',
   'Written before server-side sealing. The hash was computed in the browser, which holds the anon key, from a payload the client assembled.',
   false,
   'Nothing records which payload convention produced the hash, so there is nothing to recompute it against. The entry''s linkage is still checked; its contents cannot be, and no hash has been calculated for it after the fact because a hash computed now over content nobody can vouch for would make an unverifiable entry look verified.')
ON CONFLICT (algo) DO UPDATE
  SET description = EXCLUDED.description,
      verifiable = EXCLUDED.verifiable,
      reason = EXCLUDED.reason;


-- ── 2. Marking the entries ──────────────────────────────────────────
--
-- Only rows that HAVE a hash and no convention. A row with no hash at
-- all is not legacy — it is an entry somebody wrote around the sealer,
-- and verify_audit_chain reports it as a finding. Leaving it unmarked
-- keeps those two apart.
--
-- No timestamps are touched. The UPDATE sets one column that did not
-- exist until 20261108000000 and nothing else; audit_logs' own
-- immutability trigger would refuse anything more.

DO $mark$
DECLARE v_marked bigint; v_had_guard boolean;
BEGIN
  --  trg_block_audit_update refuses every UPDATE on audit_logs,
  --  including this one. It is disabled for the length of this
  --  statement and re-enabled immediately, which is the same
  --  arrangement the suite uses to simulate a tamper — the difference
  --  being that this writes a column the chain does not cover and
  --  leaves every hash, sequence number and timestamp alone.
  --
  --  CONDITIONAL, BECAUSE THE TRIGGER IS NOT EVERYWHERE. The Criateur
  --  project records 20260225000000 (immutable_audit_trail) as
  --  applied and has neither trg_block_audit_update nor
  --  fn_block_audit_mutation: only the deletion guard survives there.
  --  An unconditional ALTER ... DISABLE TRIGGER raises on a trigger
  --  that does not exist, so this migration would have failed on the
  --  one database it most needed to run against. Found by inspecting
  --  the live schema, not by reading.
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'audit_logs' AND t.tgname = 'trg_block_audit_update'
       AND NOT t.tgisinternal) INTO v_had_guard;

  IF v_had_guard THEN
    ALTER TABLE public.audit_logs DISABLE TRIGGER trg_block_audit_update;
  END IF;

  UPDATE public.audit_logs
     SET hash_algo = 'legacy-client-v0'
   WHERE hash_algo IS NULL
     AND integrity_hash IS NOT NULL;
  GET DIAGNOSTICS v_marked = ROW_COUNT;

  IF v_had_guard THEN
    ALTER TABLE public.audit_logs ENABLE TRIGGER trg_block_audit_update;
  END IF;

  RAISE NOTICE 'Marked % pre-sealing audit entries as legacy-client-v0', v_marked;
END;
$mark$;

COMMENT ON COLUMN public.audit_logs.hash_algo IS
  'The convention that sealed this row; see audit_hash_conventions. legacy-client-v0 means the hash was computed by a client before server-side sealing and the contents cannot be verified. NULL means no hash at all, which is a finding rather than a convention.';


-- ── 3. Verification reports the marker, not an inference ────────────
--
-- Replaces the body from 20261108000000. The return keeps every key it
-- had and gains `legacy_reason`, so a screen can say WHY the
-- unverifiable entries are unverifiable without that sentence being
-- written into the interface.

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
  v_legacy_reason  text;
BEGIN
  SELECT reason INTO v_legacy_reason
    FROM public.audit_hash_conventions WHERE algo = 'legacy-client-v0';

  FOR rec IN
    SELECT id, company_id, user_id, action, entity_type, entity_id, metadata,
           created_at, sequence_number, previous_hash, integrity_hash, hash_algo
      FROM public.audit_logs
     WHERE company_id = p_company_id
     ORDER BY sequence_number ASC NULLS LAST, created_at ASC
  LOOP
    total_checked := total_checked + 1;

    --  An entry with no hash is a finding, not a row to skip.
    IF rec.integrity_hash IS NULL THEN
      unhashed_count := unhashed_count + 1;
      IF chain_valid THEN
        chain_valid := false; broken_id := rec.id;
        broken_reason := 'entry has no integrity hash';
      END IF;
      CONTINUE;
    END IF;

    IF rec.previous_hash IS DISTINCT FROM expected_prev THEN
      IF chain_valid THEN
        chain_valid := false; broken_id := rec.id;
        broken_reason := 'previous hash does not match the entry before it';
      END IF;
    END IF;

    IF rec.hash_algo = 'sha256-auditlog-v1' THEN
      sealed_count := sealed_count + 1;

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
      --  legacy-client-v0, or any convention this build does not know
      --  how to recompute. Linkage was checked above; contents cannot
      --  be, and that is reported rather than treated as a pass.
      unsealed_count := unsealed_count + 1;
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
    'unhashed',       unhashed_count,
    'legacy_reason',  CASE WHEN unsealed_count > 0 THEN v_legacy_reason ELSE NULL END
  );
END;
$$;

COMMENT ON FUNCTION public.verify_audit_chain(uuid) IS
  'Checks the audit chain: linkage for every entry, contents against the hash for every server-sealed entry. Entries written before sealing are counted as unsealed and the reason their contents cannot be verified is returned. Does not establish regulatory compliance.';

REVOKE ALL ON FUNCTION public.verify_audit_chain(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(uuid) TO authenticated, service_role;


-- ── 4. What this file assumes ───────────────────────────────────────

DO $assert$
DECLARE v_unmarked bigint;
BEGIN
  --  Nothing fabricated: every legacy row must still carry the hash it
  --  arrived with. A row marked legacy with no hash would mean the
  --  marking statement had reached rows it should not have.
  IF EXISTS (SELECT 1 FROM public.audit_logs
              WHERE hash_algo = 'legacy-client-v0' AND integrity_hash IS NULL) THEN
    RAISE EXCEPTION
      'AUDIT_LEGACY_MISMARKED: an entry with no hash was marked legacy, which claims more than is known about it';
  END IF;

  --  And no row was left in the ambiguous state the marker exists to
  --  remove.
  SELECT count(*) INTO v_unmarked FROM public.audit_logs
   WHERE hash_algo IS NULL AND integrity_hash IS NOT NULL;
  IF v_unmarked > 0 THEN
    RAISE EXCEPTION
      'AUDIT_LEGACY_UNMARKED: % hashed entries still have no convention recorded', v_unmarked;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.audit_hash_conventions
                  WHERE algo = 'legacy-client-v0' AND verifiable = false
                    AND btrim(coalesce(reason,'')) <> '') THEN
    RAISE EXCEPTION
      'AUDIT_LEGACY_NO_REASON: the legacy convention has no recorded reason, so nothing explains why those entries cannot be verified';
  END IF;

  --  If the immutability trigger exists it must be back ON: it is
  --  disabled for one statement above and a migration that left it off
  --  would remove the control this whole area rests on. Where it does
  --  not exist at all — as on the Criateur project — that is a
  --  separate finding, restored by 20261116000000 rather than papered
  --  over here.
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
              WHERE c.relname = 'audit_logs' AND t.tgname = 'trg_block_audit_update'
                AND t.tgenabled = 'D') THEN
    RAISE EXCEPTION
      'AUDIT_UPDATE_GUARD_LEFT_OFF: trg_block_audit_update is still disabled';
  END IF;
END;
$assert$;
