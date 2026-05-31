-- Phase 5 Sprint 5: Data Retention + Legal Hold + Governance Timeline

-- 1. DATA RETENTION POLICIES
CREATE TABLE IF NOT EXISTS public.retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    data_class TEXT NOT NULL, -- e.g. 'audit_logs', 'content_submissions', 'legal_reviews'
    retention_days INTEGER NOT NULL DEFAULT 365,
    archive_after_days INTEGER, -- Optional: Move to cold storage/archive before deletion
    auto_delete BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, data_class)
);

-- 2. LEGAL HOLDS
CREATE TABLE IF NOT EXISTS public.legal_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'released')) DEFAULT 'active',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    released_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. LEGAL HOLD ITEMS (Individual records under a hold)
CREATE TABLE IF NOT EXISTS public.legal_hold_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    legal_hold_id UUID NOT NULL REFERENCES public.legal_holds(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, -- e.g. 'content_submissions', 'audit_logs'
    entity_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(legal_hold_id, entity_type, entity_id)
);

-- 4. RLS POLICIES

-- Retention Policies
ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company's retention policies"
    ON public.retention_policies FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage retention policies"
    ON public.retention_policies FOR ALL
    USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'super_admin'))
    )
    WITH CHECK (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'super_admin'))
    );

-- Legal Holds
ALTER TABLE public.legal_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company's legal holds"
    ON public.legal_holds FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Compliance leads can manage legal holds"
    ON public.legal_holds FOR ALL
    USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND (role IN ('admin', 'super_admin', 'legal', 'compliance')))
    )
    WITH CHECK (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND (role IN ('admin', 'super_admin', 'legal', 'compliance')))
    );

-- Legal Hold Items
ALTER TABLE public.legal_hold_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company's legal hold items"
    ON public.legal_hold_items FOR SELECT
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Compliance leads can manage legal hold items"
    ON public.legal_hold_items FOR ALL
    USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND (role IN ('admin', 'super_admin', 'legal', 'compliance')))
    )
    WITH CHECK (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND (role IN ('admin', 'super_admin', 'legal', 'compliance')))
    );

-- 5. FUNCTIONS & TRIGGERS

-- Function to check if an entity is on legal hold
CREATE OR REPLACE FUNCTION public.is_on_legal_hold(p_entity_type TEXT, p_entity_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.legal_hold_items lhi
        JOIN public.legal_holds lh ON lhi.legal_hold_id = lh.id
        WHERE lhi.entity_type = p_entity_type 
        AND lhi.entity_id = p_entity_id
        AND lh.status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated At Triggers
CREATE TRIGGER set_updated_at_retention_policies
    BEFORE UPDATE ON public.retention_policies
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_legal_holds
    BEFORE UPDATE ON public.legal_holds
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
