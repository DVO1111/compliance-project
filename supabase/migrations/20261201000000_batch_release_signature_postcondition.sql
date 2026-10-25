-- =====================================================================
--  THE BATCH-RELEASE SIGNATURE REQUIREMENT, ASSERTED RATHER THAN HOPED
--
--  ── THE HAZARD ──
--
--  20261107000000 installs the requirement with an UPDATE:
--
--      UPDATE lifecycle_transitions t SET requires_signature = true
--       WHERE d.entity_type = 'batch_record'
--         AND f.state_key   = 'qc_in_progress'
--         AND s.state_key   = 'released'
--         AND t.action_key  = 'release';
--
--  Four conditions. If the target database's transition row differs in
--  ANY of them — a different from_state, a different action key, the
--  entity type spelled 'batch' — the UPDATE matches zero rows,
--  **reports success**, and the signature requirement is silently
--  absent afterwards. Nothing fails. Nothing is logged. The only
--  symptom is that batches can be released without a signature, which
--  is exactly the thing nobody notices until an inspection.
--
--  This is the dead-guard hazard in migration form: a statement that
--  names a state it believes exists. The local schema has been checked
--  and has exactly one matching transition. **The live schema has
--  not** — the Supabase connector has been unavailable, so the live
--  transition rows are unverified.
--
--  ── WHAT THIS MIGRATION DOES ──
--
--  Turns that silence into a failure. It does NOT re-issue the UPDATE
--  and does not change any policy: it states the postcondition
--  20261107000000 is supposed to leave behind and refuses to apply if
--  the postcondition does not hold.
--
--  It is a separate migration rather than an edit to 20261107000000
--  deliberately. An assertion added inside that file only runs if that
--  file runs; if 20261107000000 turns out to have been applied already
--  on some database, the edit would never execute there and the check
--  would be a comfort rather than a control. A later migration runs
--  regardless of what happened earlier, which is the property wanted.
--
--  ── AND A READ-ONLY CHECK FOR THE OPERATOR ──
--
--  The same logic is exposed as a function, because the obvious
--  verification query has a trap of its own: "SELECT the transitions
--  into released" returns ZERO ROWS when the transition is missing or
--  misnamed, and an operator reading `(0 rows)` can easily tick the
--  box. A function that returns the word MISSING cannot be misread
--  that way. NULL means pass; anything else is the finding, in words.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.batch_release_signature_postcondition()
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_n        integer;
  v_from     text;
  v_action   text;
  v_signed   boolean;
  v_writable text;
BEGIN
  --  (1) EXACTLY ONE transition may reach `released` for a batch
  --  record. More than one is a second door into the same state, and
  --  because the requirement is attached to transitions rather than to
  --  the state, a second door can be unsigned.
  SELECT count(*) INTO v_n
    FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id = t.definition_id
    JOIN public.lifecycle_states s      ON s.id = t.to_state_id
   WHERE d.entity_type = 'batch_record'
     AND s.state_key   = 'released';

  IF v_n = 0 THEN
    RETURN 'MISSING: no transition reaches the released state for a batch record. '
        || '20261107000000''s UPDATE matched zero rows, so the signature requirement '
        || 'was never installed. Do not read this as "nothing to check".';
  END IF;

  IF v_n > 1 THEN
    RETURN format(
      'AMBIGUOUS: %s transitions reach the released state for a batch record, and '
      || 'the signature requirement attaches to a transition, not to the state. '
      || 'List them and establish that each one requires a signature.', v_n);
  END IF;

  --  (2) It must be the transition the gate was designed around.
  SELECT f.state_key, t.action_key, t.requires_signature
    INTO v_from, v_action, v_signed
    FROM public.lifecycle_transitions t
    JOIN public.lifecycle_definitions d ON d.id = t.definition_id
    JOIN public.lifecycle_states f      ON f.id = t.from_state_id
    JOIN public.lifecycle_states s      ON s.id = t.to_state_id
   WHERE d.entity_type = 'batch_record'
     AND s.state_key   = 'released';

  IF v_from IS DISTINCT FROM 'qc_in_progress'
     OR v_action IS DISTINCT FROM 'release' THEN
    RETURN format(
      'MISMATCHED: the transition into released is %s --(%s)--> released, but '
      || '20261107000000 matches on qc_in_progress --(release)--> released. Its '
      || 'UPDATE therefore matched zero rows and the signature requirement is not '
      || 'installed on the transition that is actually in use.',
      coalesce(v_from,'?'), coalesce(v_action,'?'));
  END IF;

  --  (3) And the requirement must be ON. `false` here means
  --  lifecycle_consume_signature is never called and p_signature_id is
  --  ignored entirely — a release needs no signature at all.
  IF NOT v_signed THEN
    RETURN 'UNSIGNED: the qc_in_progress --(release)--> released transition exists '
        || 'but requires_signature is false. lifecycle_transition() will not consume '
        || 'a signature, so p_signature_id is ignored and any permitted caller can '
        || 'release a batch unsigned.';
  END IF;

  --  (4) The engine must be the only way in. A signature requirement
  --  on the transition is worth nothing if the state table can be
  --  written directly.
  SELECT string_agg(DISTINCT format('%s:%s', grantee, privilege_type), ', ')
    INTO v_writable
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name   = 'entity_current_state'
     AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');

  IF v_writable IS NOT NULL THEN
    RETURN format(
      'BYPASSABLE: an application role can write entity_current_state directly (%s), '
      || 'so the state can be set without passing through lifecycle_transition() and '
      || 'its signature check.', v_writable);
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.batch_release_signature_postcondition() IS
  'NULL when the batch-release signature requirement is correctly installed; otherwise the finding in words. Returns MISSING / AMBIGUOUS / MISMATCHED / UNSIGNED / BYPASSABLE rather than an empty result, because an empty result reads as a pass. Read-only. Used by docs/live-verification-checklist.md §11.';

REVOKE ALL ON FUNCTION public.batch_release_signature_postcondition() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_release_signature_postcondition()
  TO authenticated, service_role;


-- ── The postcondition, enforced at deployment ───────────────────────
--
-- This is the point of the migration. If 20261107000000's UPDATE did
-- not land, the deployment stops HERE, with the reason, rather than
-- completing and leaving an unsigned release path behind.

DO $assert$
DECLARE v_finding text;
BEGIN
  v_finding := public.batch_release_signature_postcondition();
  IF v_finding IS NOT NULL THEN
    RAISE EXCEPTION 'BATCH_RELEASE_POSTCONDITION_FAILED: %', v_finding
      USING HINT = 'Do not switch the requirement on by hand without establishing which transition is actually in use. See docs/live-verification-checklist.md §11 and docs/migration-verification.md.';
  END IF;

  --  Said positively as well, so the migration log records what was
  --  established rather than only that nothing was wrong.
  RAISE NOTICE 'batch release postcondition: exactly one batch_record transition reaches released (qc_in_progress --(release)--> released), it requires a signature, and entity_current_state is not writable by an application role.';
END
$assert$;
