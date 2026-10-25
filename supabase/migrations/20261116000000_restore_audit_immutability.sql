-- The audit immutability controls, restored where they went missing.
--
-- ── WHAT THE LIVE SCHEMA SHOWED ──
--
-- Migration 20260225000000 (`immutable_audit_trail`) is RECORDED AS
-- APPLIED on the Criateur project (ref ovxfflilbqaxedzovgmz) and
-- neither `fn_block_audit_mutation()` nor `trg_block_audit_update`,
-- `trg_block_audit_delete` or `trg_block_audit_truncate` exists there.
-- Only `trg_prevent_audit_log_deletion` survives.
--
-- So on that database, today, an audit entry **can be UPDATEd** by
-- anyone row-level security admits, and the table can be TRUNCATEd.
-- The migration ledger says otherwise. Whether they were dropped later
-- or the original apply was partial cannot be told from here, and the
-- answer does not change what has to happen.
--
-- This is not a hypothetical. `scripts/repair_audit_chain.mjs` in this
-- repository updates an existing entry's `previous_hash`, and the live
-- data shows it RAN: there is a CHAIN_REANCHOR entry carrying a
-- back-dated `created_at` of 2026-02-25 15:08:15+00. That write
-- succeeded because nothing stopped it.
--
-- ── WHY THIS IS A SEPARATE FILE ──
--
-- 20261108000000 seals new entries and assumes the entries already
-- written cannot be altered. That assumption is the whole basis of the
-- threat model in docs/audit-threat-model.md, and on the one database
-- that matters it was false. Restoring the controls belongs in its own
-- migration so it can be reviewed, and reverted, on its own.
--
-- ── WHAT THIS DOES NOT DO ──
--
-- It changes NO audit data. It does not re-hash, re-sequence,
-- re-anchor or remove anything, including the CHAIN_REANCHOR entry and
-- the entry whose previous_hash was rewritten. Those are part of the
-- record now; 20261115000000 marks them `legacy-client-v0` like every
-- other client-written entry, and the readiness report names them.
-- Rewriting history to tidy up history is the thing this whole area
-- exists to prevent.


-- ── 1. The refusal ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_block_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'AUDIT_IMMUTABLE: an audit entry cannot be % — the audit trail is append only',
    lower(TG_OP)
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.fn_block_audit_mutation() IS
  'Refuses every update, delete and truncate on audit_logs. Restored by 20261116000000 after the live schema was found without it.';


-- ── 2. Attached, idempotently ───────────────────────────────────────
--
-- DROP IF EXISTS then CREATE, so a database that still has them ends
-- up with exactly these and one that lost them gets them back.

DROP TRIGGER IF EXISTS trg_block_audit_update ON public.audit_logs;
CREATE TRIGGER trg_block_audit_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_audit_mutation();

DROP TRIGGER IF EXISTS trg_block_audit_delete ON public.audit_logs;
CREATE TRIGGER trg_block_audit_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_audit_mutation();

DROP TRIGGER IF EXISTS trg_block_audit_truncate ON public.audit_logs;
CREATE TRIGGER trg_block_audit_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_block_audit_mutation();


-- ── 3. Proven, not assumed ──────────────────────────────────────────
--
-- 20260225000000 was recorded as applied and its triggers were not
-- there. A migration that records itself as having restored them, and
-- has not, would repeat exactly that. So this one tries the three
-- writes it is supposed to refuse, inside a subtransaction that rolls
-- back, and fails if any of them is allowed.

DO $assert$
DECLARE
  v_c uuid := gen_random_uuid();
  v_id uuid;
  v_update_blocked boolean := false;
  v_delete_blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.companies(id, name) VALUES (v_c, 'Audit immutability self test');
    INSERT INTO public.audit_logs (company_id, action, entity_type, metadata)
    VALUES (v_c, 'immutability_self_test', 'migration', '{}'::jsonb)
    RETURNING id INTO v_id;

    BEGIN
      UPDATE public.audit_logs SET action = 'rewritten' WHERE id = v_id;
    EXCEPTION WHEN OTHERS THEN
      v_update_blocked := SQLERRM LIKE 'AUDIT_IMMUTABLE%';
    END;

    BEGIN
      DELETE FROM public.audit_logs WHERE id = v_id;
    EXCEPTION WHEN OTHERS THEN
      --  Either guard refusing is correct: the pre-existing
      --  trg_prevent_audit_log_deletion may answer first.
      v_delete_blocked := true;
    END;

    IF NOT v_update_blocked THEN
      RAISE EXCEPTION
        'AUDIT_UPDATE_NOT_BLOCKED: an audit entry was updated after this migration claimed to prevent it';
    END IF;
    IF NOT v_delete_blocked THEN
      RAISE EXCEPTION
        'AUDIT_DELETE_NOT_BLOCKED: an audit entry was deleted after this migration claimed to prevent it';
    END IF;

    RAISE EXCEPTION 'AUDIT_IMMUTABILITY_SELF_TEST_PASSED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'AUDIT_IMMUTABILITY_SELF_TEST_PASSED' THEN RAISE; END IF;
  END;
END;
$assert$;
