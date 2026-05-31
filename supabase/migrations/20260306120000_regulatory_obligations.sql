/*
  # Regulatory Obligation Tracking Schema

  1. New Tables
    - `regulatory_obligations`: Individual, atomic requirements from regulations.
    - `obligation_links`: Traceability matrix linking obligations to Controls, Policies, Risks, etc.

  2. Security
    - Enable RLS on both tables.
    - Add policies for company-scoped access.
*/

-- 1. Regulatory Obligations Table
CREATE TABLE IF NOT EXISTS public.regulatory_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  regulation_id uuid REFERENCES public.regulations(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'nigeria',
  category text NOT NULL,
  status text NOT NULL DEFAULT 'identified' CHECK (status IN ('identified', 'implemented', 'monitored')),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Obligation Links (Traceability Matrix)
CREATE TABLE IF NOT EXISTS public.obligation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES public.regulatory_obligations(id) ON DELETE CASCADE,
  link_type text NOT NULL CHECK (link_type IN ('control', 'policy', 'risk', 'vendor')),
  linked_entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Security (RLS)
ALTER TABLE public.regulatory_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obligation_links ENABLE ROW LEVEL SECURITY;

-- 4. Policies (Company Scoped)
CREATE POLICY "Regulatory obligations are company scoped"
  ON public.regulatory_obligations
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Obligation links are company scoped"
  ON public.obligation_links
  FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_reg_obligations_company ON public.regulatory_obligations(company_id);
CREATE INDEX IF NOT EXISTS idx_reg_obligations_regulation ON public.regulatory_obligations(regulation_id);
CREATE INDEX IF NOT EXISTS idx_reg_obligations_status ON public.regulatory_obligations(status);
CREATE INDEX IF NOT EXISTS idx_obligation_links_obligation ON public.obligation_links(obligation_id);
CREATE INDEX IF NOT EXISTS idx_obligation_links_entity ON public.obligation_links(linked_entity_id);
