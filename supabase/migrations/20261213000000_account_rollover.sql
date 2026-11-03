-- ============================================================================
--  SAFE ACCOUNT ROLLOVER
--
--  The operational goal: existing users lose their access, their approved
--  addresses become available for a fresh signup cycle, and every business
--  record keeps the authorship it already has.
--
--  ── WHY NOT DELETE ─────────────────────────────────────────────────────────
--
--  docs/ACCOUNT_RESET_DRYRUN.md established that deletion cannot do this.
--  Three users are referenced by NO ACTION foreign keys from batch_records,
--  regulatory_licences and regulatory_submissions, so the database refuses
--  to delete them — correctly, because those are the attribution columns a
--  GMP system exists to keep. Deleting the rest would cascade away every
--  company_members row and the single access_approvers row, leaving thirty
--  companies intact and unreachable.
--
--  So NOTHING IS DELETED. The auth.users row stays, with its id, and every
--  foreign key that points at it keeps pointing at it. What changes is the
--  ADDRESS the row holds, whether the account can sign in, and whether it
--  is a member of anything.
--
--  ── WHAT ACTUALLY FREES AN ADDRESS, VERIFIED RATHER THAN ASSUMED ───────────
--
--  Checked against the live project before this was written:
--
--    users_email_partial_key
--      UNIQUE (email) WHERE is_sso_user = false        <- this is the gate
--    identities_provider_id_provider_unique
--      UNIQUE (provider_id, provider)
--
--  The second one is the trap, and it turns out not to be one HERE. On this
--  project all twenty identities use provider 'email' and their provider_id
--  is the USER UUID, not the address (0 of 20 hold the email, 20 of 20 hold
--  the uuid). So a new signup with a freed address gets a new uuid and does
--  not collide on that index.
--
--  That is a property of this project's GoTrue version, NOT a general fact,
--  and it is the reason the brief said not to assume renaming is enough.
--  `identity_data->>'email'` DOES still hold the old address, and the
--  rollover script updates it — an identity row claiming an address it no
--  longer owns would mislead account-linking and anyone reading the audit.
--
--  ── WHAT THIS MIGRATION DOES AND DOES NOT DO ───────────────────────────────
--
--  It does NOT touch auth.*. Renaming, banning and session revocation go
--  through the Auth Admin API, which is the supported path and the one that
--  keeps GoTrue's own bookkeeping consistent. See scripts/rollover/.
--
--  This migration provides the parts that must live in the database:
--    1. an audit record, so "who was this user" survives the rename;
--    2. membership revocation that is reversible;
--    3. an approver invariant, so a rollover cannot lock the project out of
--       its own administration.
-- ============================================================================


-- ── 1. The audit record ─────────────────────────────────────────────────────
/*
 *  Once the address is changed, `batch_records.created_by` still resolves to
 *  a real auth.users row — but that row now reads
 *  `rolled-over+ab12cd34@criateur.invalid`, and the question "who signed
 *  this batch record" has no answer anywhere.
 *
 *  On a GMP system that is not a cosmetic loss, it is the loss of the
 *  attribution the record exists to carry. This table is where the original
 *  address is kept, and it is written BEFORE the rename.
 */
CREATE TABLE IF NOT EXISTS public.account_rollovers (
  old_user_id      uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE RESTRICT,
  original_email   text NOT NULL,
  tombstone_email  text NOT NULL,
  reason           text,
  --  What was taken away, so a rollover performed in error can be undone
  --  without reconstructing it from memory.
  revoked_memberships jsonb NOT NULL DEFAULT '[]'::jsonb,
  was_approver     boolean NOT NULL DEFAULT false,
  rolled_at        timestamptz NOT NULL DEFAULT now(),
  rolled_by        uuid REFERENCES auth.users (id) ON DELETE SET NULL,

  CONSTRAINT account_rollovers_original_lower_chk CHECK (original_email = lower(original_email)),
  --  A tombstone must be unusable. `.invalid` is reserved by RFC 2606 and
  --  can never be delivered to, so a tombstoned account cannot be recovered
  --  by someone who gains control of a domain.
  CONSTRAINT account_rollovers_tombstone_invalid_chk CHECK (tombstone_email LIKE '%@%.invalid')
);

--  ON DELETE RESTRICT above is deliberate: the rollover record must not be
--  removable by deleting the user it describes. If a user is ever genuinely
--  deleted, the record has to be dealt with explicitly.

ALTER TABLE public.account_rollovers ENABLE ROW LEVEL SECURITY;
--  No policy: this is a list of real people's former addresses. It is read
--  through the SECURITY DEFINER function below, by approvers only.

COMMENT ON TABLE public.account_rollovers IS
  'Who an auth.users row used to be, written before the address is freed. '
  'Without it, historical authorship resolves to a tombstone and the '
  'attribution a GMP record carries is lost.';


-- ── 2. The tombstone address ────────────────────────────────────────────────
/*
 *  Deterministic, so a rollover that is interrupted and re-run produces the
 *  same address rather than a second one — and so the value can be checked
 *  without being stored twice.
 */
CREATE OR REPLACE FUNCTION public.app_rollover_tombstone(p_user_id uuid)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT 'rolled-over+' || left(replace(p_user_id::text, '-', ''), 8)
         || '@criateur.invalid';
$$;


-- ── 3. The approver invariant ───────────────────────────────────────────────
/*
 *  THE LOCKOUT THIS EXISTS TO PREVENT.
 *
 *  access_approvers currently holds ONE row. It is what the access-request
 *  flow checks and what admin_allowlist_* checks. A rollover that revoked
 *  the last approver would leave a project in which nobody can approve an
 *  access request or administer the allowlist, and the only way back is a
 *  service-role write by somebody who knows that.
 *
 *  So the last approver cannot be removed. Not by the rollover, not by hand,
 *  not by a cascade — the trigger fires on any DELETE.
 */
CREATE OR REPLACE FUNCTION public.fn_access_approvers_keep_one()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF (SELECT count(*) FROM public.access_approvers) <= 1 THEN
    RAISE EXCEPTION
      'ACCESS_APPROVERS_LAST_ONE: refusing to remove the only approver; add the replacement first'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_access_approvers_keep_one ON public.access_approvers;
CREATE TRIGGER trg_access_approvers_keep_one
  BEFORE DELETE ON public.access_approvers
  FOR EACH ROW EXECUTE FUNCTION public.fn_access_approvers_keep_one();


-- ── 4. Promoting the new owner ──────────────────────────────────────────────
/*
 *  After a rollover the new owner is a FRESH auth.users row with a NEW uuid,
 *  and access_approvers is keyed on user_id — so the old row still names the
 *  old, tombstoned account. Something has to promote the new one.
 *
 *  service_role ONLY. This function grants the right to approve everyone
 *  else, so it is not reachable from a browser under any role. `authenticated`
 *  is not granted EXECUTE, and the body re-checks rather than trusting the
 *  grant.
 */
CREATE OR REPLACE FUNCTION public.admin_bootstrap_approver(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user  uuid;
BEGIN
  --  Belt as well as braces: a future GRANT that widened this by accident
  --  would still be refused here.
  IF current_setting('role', true) NOT IN ('service_role', 'postgres')
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'BOOTSTRAP_APPROVER_SERVICE_ROLE_ONLY' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.id INTO v_user
    FROM auth.users u
   WHERE lower(u.email) = v_email
     AND NOT EXISTS (SELECT 1 FROM public.account_rollovers r WHERE r.old_user_id = u.id)
   ORDER BY u.created_at DESC
   LIMIT 1;

  --  A rolled-over account must never be re-promoted: it is tombstoned and
  --  banned, and promoting it would hand administration to an account
  --  nobody can sign in to.
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'BOOTSTRAP_APPROVER_NO_LIVE_USER: no live account for %', v_email
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.access_approvers (user_id) VALUES (v_user)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_user;
END;
$$;


-- ── 5. Recording a rollover, and revoking membership ────────────────────────
/*
 *  Membership removal is what actually ends data access, and it ends it
 *  AT ONCE: every RLS policy in this schema reads company_members, and a
 *  policy is evaluated per statement, not per session. An access token
 *  already issued keeps being accepted as a signature for up to its
 *  lifetime, but the rows it can reach are gone the moment this commits.
 *
 *  That distinction is the whole of the documented security boundary, and
 *  it is why this is a database operation and banning is not enough.
 */
CREATE OR REPLACE FUNCTION public.app_rollover_revoke(
  p_user_id uuid,
  p_reason  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_email  text;
  v_tomb   text := public.app_rollover_tombstone(p_user_id);
  v_mem    jsonb;
  v_appr   boolean;
BEGIN
  IF current_setting('role', true) NOT IN ('service_role', 'postgres')
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'ROLLOVER_SERVICE_ROLE_ONLY' USING ERRCODE = 'P0001';
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'ROLLOVER_NO_SUCH_USER' USING ERRCODE = 'P0001';
  END IF;

  IF v_email LIKE '%@%.invalid' THEN
    RAISE EXCEPTION 'ROLLOVER_ALREADY_DONE: % is already tombstoned', p_user_id
      USING ERRCODE = 'P0001';
  END IF;

  --  Captured BEFORE the delete, so an accidental rollover can be undone
  --  from the record rather than from memory.
  SELECT coalesce(jsonb_agg(to_jsonb(m) - 'user_id'), '[]'::jsonb) INTO v_mem
    FROM public.company_members m WHERE m.user_id = p_user_id;

  SELECT EXISTS (SELECT 1 FROM public.access_approvers a WHERE a.user_id = p_user_id)
    INTO v_appr;

  INSERT INTO public.account_rollovers
    (old_user_id, original_email, tombstone_email, reason,
     revoked_memberships, was_approver, rolled_by)
  VALUES (p_user_id, v_email, v_tomb, p_reason, v_mem, v_appr, auth.uid())
  ON CONFLICT (old_user_id) DO NOTHING;

  --  The approver trigger fires here if this is the last one, which is
  --  exactly the intended refusal: the whole rollover aborts rather than
  --  half-completing and locking the project out.
  DELETE FROM public.access_approvers WHERE user_id = p_user_id;
  DELETE FROM public.company_members  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'tombstone_email', v_tomb,
    'revoked_memberships', jsonb_array_length(v_mem),
    'was_approver', v_appr
  );
END;
$$;

/*
 *  Undo, for a rollover performed in error. Restores membership from the
 *  record. It deliberately does NOT un-tombstone the auth account — that is
 *  the Admin API's half, and the address may already have been re-registered
 *  by then, in which case there is nothing to go back to.
 */
CREATE OR REPLACE FUNCTION public.app_rollover_restore_membership(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_mem jsonb; v_n integer := 0;
BEGIN
  IF current_setting('role', true) NOT IN ('service_role', 'postgres')
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'ROLLOVER_SERVICE_ROLE_ONLY' USING ERRCODE = 'P0001';
  END IF;

  SELECT revoked_memberships INTO v_mem
    FROM public.account_rollovers WHERE old_user_id = p_user_id;
  IF v_mem IS NULL THEN
    RAISE EXCEPTION 'ROLLOVER_NO_RECORD' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.company_members (company_id, user_id, role, status)
  SELECT (e->>'company_id')::uuid, p_user_id, e->>'role', e->>'status'
    FROM jsonb_array_elements(v_mem) e
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;


-- ── 6. Reading the record ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_rollover_list()
RETURNS TABLE (
  old_user_id uuid, original_email text, tombstone_email text,
  revoked_memberships integer, was_approver boolean, rolled_at timestamptz
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.app_is_allowlist_admin() THEN
    RAISE EXCEPTION 'ROLLOVER_NOT_PERMITTED' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    SELECT r.old_user_id, r.original_email, r.tombstone_email,
           jsonb_array_length(r.revoked_memberships), r.was_approver, r.rolled_at
      FROM public.account_rollovers r
     ORDER BY r.rolled_at DESC;
END;
$$;


-- ── 7. The preflight the rollover script refuses to run without ────────────
/*
 *  THE ASSUMPTION THAT MUST BE RE-CHECKED EVERY TIME.
 *
 *  Freeing an address means changing auth.users.email, which the unique
 *  index users_email_partial_key is holding. That is enough ONLY while
 *  auth.identities keys its email rows by user id rather than by address.
 *
 *  On this project all identities currently hold provider_id = the user
 *  uuid, so a fresh signup gets a new uuid and does not collide. But that
 *  is a property of this GoTrue version, not a guarantee. If an upgrade
 *  ever moves the address into provider_id, renaming the user would free an
 *  address that is still taken under a different index — and the symptom
 *  would be a signup failure nobody could explain.
 *
 *  So the script asks before acting, and refuses on a non-zero count.
 */
CREATE OR REPLACE FUNCTION public.app_rollover_preflight()
RETURNS TABLE (
  identities_total          integer,
  identities_keyed_by_email integer,
  live_users                integer,
  approvers                 integer
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, auth
AS $$
DECLARE
  v_total integer := 0;
  v_email integer := 0;
BEGIN
  /*
   *  auth.identities is created by GoTrue, not by this repository's
   *  migrations, so the local test rig has auth.users and no identities
   *  table. Queried dynamically and reported as zero when absent, rather
   *  than making this migration refuse to apply anywhere GoTrue has not
   *  run — which would break CI for a check that only matters in a real
   *  project.
   */
  IF to_regclass('auth.identities') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::integer FROM auth.identities' INTO v_total;
    EXECUTE $q$
      SELECT count(*)::integer
        FROM auth.identities i JOIN auth.users u ON u.id = i.user_id
       WHERE i.provider = 'email' AND i.provider_id = u.email
    $q$ INTO v_email;
  END IF;

  RETURN QUERY SELECT
    v_total,
    v_email,
    (SELECT count(*)::integer FROM auth.users u
      WHERE coalesce(u.email,'') NOT LIKE '%.invalid'),
    (SELECT count(*)::integer FROM public.access_approvers);
END;
$$;


-- ── Grants ──────────────────────────────────────────────────────────────────
REVOKE ALL ON public.account_rollovers FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_bootstrap_approver(text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_rollover_revoke(uuid, text)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.app_rollover_restore_membership(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_rollover_list()                 FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_bootstrap_approver(text)        TO service_role;
GRANT EXECUTE ON FUNCTION public.app_rollover_revoke(uuid, text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.app_rollover_restore_membership(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_rollover_list()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_rollover_tombstone(uuid)          TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.app_rollover_preflight() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_rollover_preflight() TO service_role;


-- ── Deploy-time assertions ──────────────────────────────────────────────────
DO $$
BEGIN
  --  The allowlist must survive a rollover. It is keyed on email and its
  --  only link to auth.users is added_by ... ON DELETE SET NULL, so nothing
  --  here can remove an approved address.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.allowed_signins'::regclass
       AND c.contype = 'f' AND c.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION
      'DEPLOY GUARD: allowed_signins has a CASCADE foreign key; a rollover could delete approved addresses';
  END IF;

  --  The tombstone must be undeliverable.
  IF public.app_rollover_tombstone('00000000-0000-0000-0000-000000000001')
       NOT LIKE '%@criateur.invalid' THEN
    RAISE EXCEPTION 'DEPLOY GUARD: the tombstone address is not in a reserved domain';
  END IF;

  --  And the approver trigger must be armed, or the lockout it prevents is
  --  one DELETE away.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.access_approvers'::regclass
       AND t.tgname = 'trg_access_approvers_keep_one'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'DEPLOY GUARD: the last-approver trigger is not installed';
  END IF;
END $$;
