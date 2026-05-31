-- Phase 3 - Sprint 1: Policy Lifecycle Core Schema

-- 1. policies table (Head record)
CREATE TABLE IF NOT EXISTS public.policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL,
    category text NOT NULL CHECK (category IN ('security', 'privacy', 'conduct', 'hr', 'finance', 'operational', 'other')),
    title text NOT NULL,
    description text,
    owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (company_id, title)
);

-- 2. policy_versions table
CREATE TABLE IF NOT EXISTS public.policy_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    submission_id uuid NOT NULL REFERENCES public.content_submissions(id) ON DELETE CASCADE,
    version_label text NOT NULL, -- e.g. "v1.0", "2024-Review"
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'archived')),
    published_at timestamptz,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE (policy_id, version_label)
);

-- 3. policy_acknowledgements table
CREATE TABLE IF NOT EXISTS public.policy_acknowledgements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    version_id uuid NOT NULL REFERENCES public.policy_versions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    acknowledged_at timestamptz DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    UNIQUE (version_id, user_id)
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_policies_company ON public.policies(company_id);
CREATE INDEX IF NOT EXISTS idx_policy_versions_policy ON public.policy_versions(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_versions_status ON public.policy_versions(status);
CREATE INDEX IF NOT EXISTS idx_policy_acks_user ON public.policy_acknowledgements(user_id);
CREATE INDEX IF NOT EXISTS idx_policy_acks_version ON public.policy_acknowledgements(version_id);

-- 5. RLS Policies
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Policy Heads
CREATE POLICY "Company members can view policies"
    ON public.policies FOR SELECT
    TO authenticated
    USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage policies"
    ON public.policies FOR ALL
    TO authenticated
    USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
    )
    WITH CHECK (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
    );

-- Policy Versions
CREATE POLICY "Company members can view policy versions"
    ON public.policy_versions FOR SELECT
    TO authenticated
    USING (
        policy_id IN (
            SELECT id FROM public.policies 
            WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "Admins can manage policy versions"
    ON public.policy_versions FOR ALL
    TO authenticated
    USING (
        policy_id IN (
            SELECT id FROM public.policies 
            WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
        )
    )
    WITH CHECK (
        policy_id IN (
            SELECT id FROM public.policies 
            WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
        )
    );

-- Policy Acknowledgements
CREATE POLICY "Users can view own acknowledgements"
    ON public.policy_acknowledgements FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can sign published policies"
    ON public.policy_acknowledgements FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM public.policy_versions pv
            WHERE pv.id = version_id AND pv.status = 'published'
        )
    );

CREATE POLICY "Admins can view all acknowledgements"
    ON public.policy_acknowledgements FOR SELECT
    TO authenticated
    USING (
        policy_id IN (
            SELECT id FROM public.policies 
            WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer'))
        )
    );
