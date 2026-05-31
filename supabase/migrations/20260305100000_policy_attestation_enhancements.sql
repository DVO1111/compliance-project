-- Add attestation fields to policy_versions
ALTER TABLE public.policy_versions 
ADD COLUMN IF NOT EXISTS requires_ack BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS due_days INTEGER DEFAULT 14,
ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES auth.users(id);

-- Add unique constraint to policy_acknowledgements to prevent duplicate signs for the same version
ALTER TABLE public.policy_acknowledgements
ADD CONSTRAINT policy_acknowledgements_version_user_unique UNIQUE (policy_id, version_id, user_id);

-- Ensure company_id exists and is populated for RLS (if not already)
-- Note: Assuming policy_acknowledgements already has company_id based on previous sprint context, 
-- but ensuring strictly scoped RLS.
ALTER TABLE public.policy_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own acknowledgements"
    ON public.policy_acknowledgements
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can sign policies for their own company"
    ON public.policy_acknowledgements
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND company_id = policy_acknowledgements.company_id
        )
    );

CREATE POLICY "Compliance can view all acknowledgements in company"
    ON public.policy_acknowledgements
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND company_id = policy_acknowledgements.company_id
            AND role IN ('admin', 'compliance_officer')
        )
    );
