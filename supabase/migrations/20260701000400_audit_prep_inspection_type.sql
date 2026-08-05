-- AI Audit Prep — inspection type
-- Distinguishes scheduled inspections (full AI assembly) from unannounced
-- inspections (fast priority-document surfacing).

ALTER TABLE public.audit_prep_sessions
  ADD COLUMN IF NOT EXISTS inspection_type text NOT NULL DEFAULT 'scheduled'
    CHECK (inspection_type IN ('scheduled','unannounced'));
