-- =====================================================================
--  THE RULES THEMSELVES WERE WRITABLE
--
--  A control is only as strong as the table it reads its rule from.
--  The security recheck of 20261119000000–20261122000000 found that
--  two of those tables were not protected at all:
--
--    DELETE FROM public.duty_conflicts;      -- 6 rows, as `authenticated`
--    DELETE FROM public.gmp_critical_roles;  -- 3 rows, as `authenticated`
--
--  Both succeeded. Any signed-in user — and `anon`, which is every
--  visitor — could remove every separation-of-duties rule and every
--  signature requirement, after which the gates kept running and
--  found nothing to object to. The guards were installed, attached,
--  and reading an empty rulebook.
--
--  The cause is the project-wide default grant: new tables in `public`
--  arrive with INSERT, UPDATE, DELETE and TRUNCATE for anon and
--  authenticated, and 20261120000000 and 20261121000000 created their
--  tables without enabling RLS, because the rows are not tenant data
--  and RLS looked beside the point. It was not: RLS is what the other
--  rule tables were relying on.
--
--  Two layers, because either alone has a failure mode. The REVOKE is
--  the real fix — a privilege that does not exist cannot be exercised
--  whatever the policies say. RLS is the backstop for the next table
--  somebody adds and forgets to revoke, and for the case where a
--  later default-privileges sweep re-grants.
-- =====================================================================

-- ── 1. RLS on the two tables that had none ──────────────────────────

ALTER TABLE public.duty_conflicts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmp_critical_roles ENABLE ROW LEVEL SECURITY;

--  Readable by anyone signed in: a screen that explains why a release
--  was refused has to be able to name the rule. No write policy, which
--  is what refuses the write.
DROP POLICY IF EXISTS duty_conflicts_read ON public.duty_conflicts;
CREATE POLICY duty_conflicts_read
  ON public.duty_conflicts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS gmp_critical_roles_read ON public.gmp_critical_roles;
CREATE POLICY gmp_critical_roles_read
  ON public.gmp_critical_roles FOR SELECT TO authenticated USING (true);


-- ── 2. And no write privilege at all ────────────────────────────────
--
-- Every table whose rows ARE a rule rather than a record. Changing one
-- of these changes what the system enforces, so it is a migration's
-- job and nobody else's.

DO $revoke$
DECLARE
  v_tables text[] := ARRAY[
    'section_permissions',      -- PM-03's grid itself
    'step_permissions',         -- the five protected steps
    'duty_conflicts',           -- separation of duties
    'gmp_critical_roles',       -- which roles need a signature
    'work_role_resolution',     -- the compatibility bridge
    'audit_hash_conventions'    -- what a hash means
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'RULE_TABLE_MISSING: public.% does not exist', t;
    END IF;
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
  END LOOP;
END
$revoke$;


-- ── 3. Prove it, by attempting the writes ───────────────────────────
--
-- Not "is the privilege revoked" — that is the thing that was true of
-- the OTHER rule tables all along while these two were open. The
-- assertion runs the DELETE that worked before and requires it to be
-- refused now.

DO $assert$
DECLARE
  v_tables text[] := ARRAY['section_permissions','step_permissions','duty_conflicts',
                           'gmp_critical_roles','work_role_resolution',
                           'audit_hash_conventions'];
  t text;
  v_leaks text := '';
  v_still_writable text;
BEGIN
  --  (a) The privilege is gone, for every one of them.
  SELECT string_agg(DISTINCT format('%s/%s', g.table_name, g.grantee), ', ')
    INTO v_still_writable
    FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public'
     AND g.table_name = ANY (v_tables)
     AND g.grantee IN ('anon', 'authenticated')
     AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  IF v_still_writable IS NOT NULL THEN
    RAISE EXCEPTION 'RULE_TABLE_WRITABLE: % still carries a write privilege', v_still_writable;
  END IF;

  --  (b) And the write really is refused. In a subtransaction that
  --  rolls back, as the role a signed-in user actually gets.
  FOREACH t IN ARRAY v_tables LOOP
    BEGIN
      PERFORM set_config('role', 'authenticated', true);
      BEGIN
        EXECUTE format('DELETE FROM public.%I', t);
        --  It succeeded, which is the bug this migration exists for.
        v_leaks := v_leaks || t || ' ';
      EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
        NULL;   -- refused, which is the point
      END;
      PERFORM set_config('role', 'none', true);
      RAISE EXCEPTION 'ROLLBACK_RULE_TABLE_PROBE';
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('role', 'none', true);
      IF SQLERRM <> 'ROLLBACK_RULE_TABLE_PROBE' THEN RAISE; END IF;
    END;
  END LOOP;

  IF v_leaks <> '' THEN
    RAISE EXCEPTION 'RULE_TABLE_DELETABLE: an application role emptied % ', v_leaks;
  END IF;

  --  (c) And the rules are still there to read. A lockdown that also
  --  hid them would break the screen that explains a refusal.
  IF NOT EXISTS (SELECT 1 FROM public.duty_conflicts WHERE enforced)
     OR NOT EXISTS (SELECT 1 FROM public.gmp_critical_roles) THEN
    RAISE EXCEPTION 'RULE_TABLE_EMPTY: the lockdown ran but the rules are gone';
  END IF;
END
$assert$;
