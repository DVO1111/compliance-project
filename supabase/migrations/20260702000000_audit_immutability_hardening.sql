-- Audit Trail Immutability Hardening
--
-- Executes the append-only standard for audit_logs: block UPDATE / DELETE /
-- TRUNCATE at the PRIVILEGE and TRIGGER level, not just via RLS.
--
-- WHY: the earlier migration (20260225000000_immutable_audit_trail.sql) enforces
-- immutability with RLS policies only (USING(false)). RLS is IGNORED by roles
-- with BYPASSRLS — which on Supabase includes `service_role` (used by edge
-- functions with the service key) as well as the table owner. A trigger, by
-- contrast, fires for every role including BYPASSRLS, so it makes the ledger
-- non-bypassable from SQL short of a full superuser (postgres) session.
--
-- Standard owner: Tope (security). Implementation: engineering.
-- STATUS: PENDING TOPE'S RATIFICATION before promotion to the production branch.
--
-- Defensibility note for a live NAFDAC / ISO audit:
--   * INSERT and SELECT are untouched — the log still records normally.
--   * UPDATE/DELETE/TRUNCATE are revoked from PUBLIC, anon, authenticated,
--     service_role AND blocked by trigger.
--   * The application must connect only as `authenticated`/`anon` (never as
--     `postgres` or with a superuser connection string) — this is the
--     "application role has zero superuser bypass" half of the standard and is
--     an operational/deploy control, not something SQL can self-enforce.

-- ── 1. Revoke mutation privileges from all app-facing roles ──────────────────
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM service_role;
  END IF;
END $$;

-- ── 2. Trigger-level append-only enforcement (fires even for BYPASSRLS) ──────
CREATE OR REPLACE FUNCTION public.fn_block_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_audit_update ON public.audit_logs;
CREATE TRIGGER trg_block_audit_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_audit_mutation();

DROP TRIGGER IF EXISTS trg_block_audit_delete ON public.audit_logs;
CREATE TRIGGER trg_block_audit_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_audit_mutation();

-- TRUNCATE triggers must be statement-level.
DROP TRIGGER IF EXISTS trg_block_audit_truncate ON public.audit_logs;
CREATE TRIGGER trg_block_audit_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_block_audit_mutation();
