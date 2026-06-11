-- Extend risk_links.link_type to include 'license'
-- Drop any existing CHECK on link_type (may be auto-named) then re-add expanded one.

DO $$ DECLARE v_constraint text; BEGIN
  LOOP
    SELECT conname INTO v_constraint FROM pg_constraint
    WHERE conrelid = 'public.risk_links'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%link_type%'
    LIMIT 1;
    EXIT WHEN v_constraint IS NULL;
    EXECUTE format('ALTER TABLE public.risk_links DROP CONSTRAINT %I', v_constraint);
  END LOOP;
END $$;

ALTER TABLE public.risk_links
  ADD CONSTRAINT risk_links_link_type_check
  CHECK (link_type IN ('control', 'policy', 'vendor', 'audit_request', 'automation_test', 'license'));
