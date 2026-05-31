-- Fix: policies and policy_versions RLS were gated on profiles.role IN ('admin',
-- 'compliance_officer'), which excluded owners, executives, legal users, and any
-- user whose profile.role is NULL (all new signups — role is never set during INSERT).
--
-- New approach: check company_members.role directly for the set of roles that
-- are permitted to manage policies: owner, admin, legal.
-- This avoids the NULL-role trap (profiles.role is never populated on signup)
-- and correctly includes legal users who are the primary policy authors.

-- ── policies ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage policies" ON public.policies;

CREATE POLICY "Admins can manage policies"
    ON public.policies FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members
            WHERE user_id = auth.uid()
            AND company_members.company_id = policies.company_id
            AND role IN ('owner', 'admin', 'legal')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members
            WHERE user_id = auth.uid()
            AND company_members.company_id = policies.company_id
            AND role IN ('owner', 'admin', 'legal')
        )
    );

-- ── policy_versions ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage policy versions" ON public.policy_versions;

CREATE POLICY "Admins can manage policy versions"
    ON public.policy_versions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.company_members cm ON cm.company_id = p.company_id
            WHERE policy_versions.policy_id = p.id
            AND cm.user_id = auth.uid()
            AND cm.role IN ('owner', 'admin', 'legal')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.policies p
            JOIN public.company_members cm ON cm.company_id = p.company_id
            WHERE policy_versions.policy_id = p.id
            AND cm.user_id = auth.uid()
            AND cm.role IN ('owner', 'admin', 'legal')
        )
    );
