-- Phase 6 — Sprint 1: AI Asset Inventory
-- AI assets are the foundational object for this phase.
-- Integrated with vendors (Provider) and profiles (Owner).

-- ─── PART A: AI Assets ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('model', 'prompt_template', 'workflow', 'provider', 'agent')),
    provider_vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'in_review', 'retired')),
    owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonB,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance and scoping
CREATE INDEX IF NOT EXISTS idx_ai_assets_company ON public.ai_assets(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_assets_type ON public.ai_assets(company_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_ai_assets_status ON public.ai_assets(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_assets_provider ON public.ai_assets(provider_vendor_id);
CREATE INDEX IF NOT EXISTS idx_ai_assets_owner ON public.ai_assets(owner_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_ai_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_ai_assets_updated_at
    BEFORE UPDATE ON public.ai_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_assets_updated_at();

-- RLS Policies
ALTER TABLE public.ai_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_assets_select ON public.ai_assets FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY ai_assets_insert ON public.ai_assets FOR INSERT
    WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY ai_assets_update ON public.ai_assets FOR UPDATE
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY ai_assets_delete ON public.ai_assets FOR DELETE
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));


-- ─── PART B: AI Asset Controls ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_asset_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.ai_assets(id) ON DELETE CASCADE,
    control_id UUID NOT NULL REFERENCES public.grc_controls(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'mapped',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(asset_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_asset_controls_asset ON public.ai_asset_controls(asset_id);
CREATE INDEX IF NOT EXISTS idx_ai_asset_controls_control ON public.ai_asset_controls(control_id);

-- RLS Policies
ALTER TABLE public.ai_asset_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_asset_controls_select ON public.ai_asset_controls FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY ai_asset_controls_insert ON public.ai_asset_controls FOR INSERT
    WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY ai_asset_controls_delete ON public.ai_asset_controls FOR DELETE
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
