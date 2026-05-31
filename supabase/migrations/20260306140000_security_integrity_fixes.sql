-- ============================================================================
-- Phase 5 Sprint 1: FINAL DEFINITIVE Security Hardening & Data Integrity Fixes
-- Standardizing on Ground Truth Tenant Root: public.companies(id)
-- ============================================================================

-- ── 1. ORPHAN SAFETY & FOREIGN KEY HARDENING ────────────────────────────────
-- We use a single DO block to perform existence checks, orphan validation, and FK enforcement.

DO $$
DECLARE
    t_name text;
    v_orphan_count integer;
    v_fk_name text;
    -- Exact list of 14 tenant-scoped tables to harden
    v_tables text[] := ARRAY[
        'audit_logs',
        'audit_request_evidence',
        'audit_request_items',
        'audit_requests',
        'audit_session_participants',
        'audit_sessions',
        'company_risk_posture',
        'marketplace_connections',
        'marketplace_requests',
        'regulation_impact_reports',
        'risk_links',
        'risk_predictions',
        'risks',
        'vendors'
    ];
BEGIN
    FOREACH t_name IN ARRAY v_tables
    LOOP
        -- 1.1 Guard by table existence
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t_name) THEN
            
            -- 1.2 Validate there are no orphaned company_id values
            EXECUTE format('SELECT count(*) FROM public.%I t LEFT JOIN public.companies c ON t.company_id = c.id WHERE t.company_id IS NOT NULL AND c.id IS NULL', t_name)
            INTO v_orphan_count;
            
            IF v_orphan_count > 0 THEN
                RAISE EXCEPTION 'Cleanup required: Table "%" has % orphaned company_id values.', t_name, v_orphan_count;
            END IF;

            -- 1.3 Safe Drop/Recreate Foreign Key
            -- We assume a standard naming convention: fk_[table]_company
            v_fk_name := 'fk_' || t_name || '_company';
            
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t_name, v_fk_name);
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t_name, t_name || '_company_id_fkey'); -- Secondary possible name
            
            IF t_name = 'audit_logs' THEN
                EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT', t_name, v_fk_name);
            ELSE
                EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE', t_name, v_fk_name);
            END IF;
            
        END IF;
    END LOOP;
END $$;


-- ── 2. MARKETPLACE RLS HARDENING ────────────────────────────────────────────
-- Enforcing strict tenant isolation for the Legal Partner Marketplace.

-- marketplace_requests
DROP POLICY IF EXISTS "Authenticated can view marketplace requests" ON public.marketplace_requests;
DROP POLICY IF EXISTS "Users can view company marketplace requests" ON public.marketplace_requests;
DROP POLICY IF EXISTS "Authenticated can insert marketplace requests" ON public.marketplace_requests;
DROP POLICY IF EXISTS "Users can insert company marketplace requests" ON public.marketplace_requests;
DROP POLICY IF EXISTS "Users can update company marketplace requests" ON public.marketplace_requests;
DROP POLICY IF EXISTS "Users can delete company marketplace requests" ON public.marketplace_requests;

CREATE POLICY "Users can view company marketplace requests"
  ON public.marketplace_requests FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert company marketplace requests"
  ON public.marketplace_requests FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update company marketplace requests"
  ON public.marketplace_requests FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete company marketplace requests"
  ON public.marketplace_requests FOR DELETE
  TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- marketplace_connections
DROP POLICY IF EXISTS "Authenticated can view marketplace connections" ON public.marketplace_connections;
DROP POLICY IF EXISTS "Users can view company marketplace connections" ON public.marketplace_connections;
DROP POLICY IF EXISTS "Users can manage company marketplace connections" ON public.marketplace_connections;

CREATE POLICY "Users can view company marketplace connections"
  ON public.marketplace_connections FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert company marketplace connections"
  ON public.marketplace_connections FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update company marketplace connections"
  ON public.marketplace_connections FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete company marketplace connections"
  ON public.marketplace_connections FOR DELETE
  TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));


-- ── 3. AUDIT IMMUTABILITY ───────────────────────────────────────────────────
-- Ensuring historical compliance data is tamper-proof.

CREATE OR REPLACE FUNCTION public.prevent_audit_log_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_deletion ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_log_deletion
BEFORE DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_log_deletion();
