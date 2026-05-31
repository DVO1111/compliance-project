-- Migration: Content Blocks (Dynamic Asset Composition)
-- Pre-approved, compliance-locked content components for modular campaign building

-- Content Blocks
CREATE TABLE IF NOT EXISTS public.content_blocks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  block_name text NOT NULL,
  block_type text NOT NULL CHECK (block_type IN ('disclaimer','statistic','risk_statement','boilerplate','fair_balance','call_to_action','custom')),
  content_text text NOT NULL,
  jurisdiction text DEFAULT 'all',
  version integer NOT NULL DEFAULT 1,
  is_locked boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.content_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_blocks_company_access" ON public.content_blocks;
CREATE POLICY "content_blocks_company_access"
  ON public.content_blocks FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Block Usage Tracker
CREATE TABLE IF NOT EXISTS public.block_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  block_id uuid NOT NULL REFERENCES public.content_blocks(id) ON DELETE CASCADE,
  content_id uuid NOT NULL REFERENCES public.content_submissions(id) ON DELETE CASCADE,
  used_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.block_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "block_usage_company_access" ON public.block_usage;
CREATE POLICY "block_usage_company_access"
  ON public.block_usage FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
