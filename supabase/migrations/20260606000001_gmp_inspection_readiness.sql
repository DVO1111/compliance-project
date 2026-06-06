-- ============================================================
-- GMP Inspection Readiness
-- ============================================================
-- One table stores per-company readiness status for each
-- pre-defined inspection item. The item definitions live in
-- gmpInspectionService.ts (TypeScript constants), so the DB
-- only needs to track status — no seed data required.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gmp_readiness_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  item_id       text        NOT NULL,   -- matches InspectionItem.id in the service
  status        text        NOT NULL DEFAULT 'gap'
    CHECK (status IN ('ready', 'in_progress', 'gap', 'not_applicable')),
  notes         text,
  evidence_name text,
  evidence_url  text,
  updated_by    uuid        REFERENCES auth.users(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, item_id)
);

CREATE INDEX IF NOT EXISTS gmp_readiness_log_company_idx
  ON public.gmp_readiness_log (company_id);

ALTER TABLE public.gmp_readiness_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage GMP readiness log"
  ON public.gmp_readiness_log FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
