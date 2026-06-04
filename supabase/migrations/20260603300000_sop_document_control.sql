-- SOP Document Control Module
-- Manages standard operating procedures with versioning, approval workflow,
-- and mandatory training acknowledgement per GMP/ISO 22000 requirements.

CREATE TABLE IF NOT EXISTS public.sop_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sop_number        text NOT NULL,   -- e.g. SOP-QC-001
  title             text NOT NULL,
  department        text NOT NULL,
  category          text NOT NULL DEFAULT 'other'
    CHECK (category IN ('manufacturing','quality','safety','regulatory','hr','other')),
  current_version   text NOT NULL DEFAULT '1.0',
  status            text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','approved','effective','superseded','obsolete')),
  effective_date    date,
  review_due_date   date,
  owner_id          uuid REFERENCES auth.users(id),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sop_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id         uuid NOT NULL REFERENCES public.sop_documents(id) ON DELETE CASCADE,
  version_number text NOT NULL,
  content_text   text,
  file_name      text,
  file_url       text,
  change_summary text,
  status         text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_review','approved','effective','superseded')),
  approved_by    uuid REFERENCES auth.users(id),
  approved_at    timestamptz,
  effective_date date,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sop_acknowledgements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_version_id  uuid NOT NULL REFERENCES public.sop_versions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  acknowledged_at timestamptz DEFAULT now(),
  UNIQUE(sop_version_id, user_id)
);

-- RLS
ALTER TABLE public.sop_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view sop_documents"
  ON public.sop_documents FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can manage sop_documents"
  ON public.sop_documents FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can view sop_versions"
  ON public.sop_versions FOR SELECT TO authenticated
  USING (
    sop_id IN (
      SELECT id FROM public.sop_documents WHERE company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Company members can manage sop_versions"
  ON public.sop_versions FOR ALL TO authenticated
  USING (
    sop_id IN (
      SELECT id FROM public.sop_documents WHERE company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    sop_id IN (
      SELECT id FROM public.sop_documents WHERE company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage their own sop_acknowledgements"
  ON public.sop_acknowledgements FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sop_documents_company
  ON public.sop_documents(company_id, status, department);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sop_documents_number
  ON public.sop_documents(company_id, sop_number);

CREATE INDEX IF NOT EXISTS idx_sop_versions_sop
  ON public.sop_versions(sop_id, status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION fn_sop_documents_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_sop_documents_updated_at
  BEFORE UPDATE ON public.sop_documents
  FOR EACH ROW EXECUTE FUNCTION fn_sop_documents_updated_at();
