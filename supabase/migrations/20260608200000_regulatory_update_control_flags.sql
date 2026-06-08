-- ============================================================
-- Horizon Scanning → GRC Control Flags
-- Links regulatory alerts/updates to framework controls that
-- may be affected, enabling proactive compliance gap tracking.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.regulatory_update_control_flags (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL,
  alert_id       text        NOT NULL,   -- horizon alert id (text, not FK — alerts can be seeded samples)
  control_id     uuid        NOT NULL REFERENCES public.framework_controls(id) ON DELETE CASCADE,
  control_code   text,
  control_title  text,
  framework_id   uuid,
  framework_name text,
  severity       text        NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  reason         text,
  status         text        NOT NULL DEFAULT 'flagged'
    CHECK (status IN ('flagged', 'reviewed', 'resolved')),
  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, alert_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_rucf_company_alert
  ON public.regulatory_update_control_flags (company_id, alert_id);

CREATE INDEX IF NOT EXISTS idx_rucf_company
  ON public.regulatory_update_control_flags (company_id);

ALTER TABLE public.regulatory_update_control_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members manage control flags"
  ON public.regulatory_update_control_flags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = regulatory_update_control_flags.company_id
    )
  );
