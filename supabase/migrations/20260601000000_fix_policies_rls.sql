-- Fix: policies and policy_versions RLS were gated on profiles.role IN ('admin',
-- 'compliance_officer'), which excluded owners, executives, legal users, and any
-- user whose profile.role is NULL (all new signups — role is never set during INSERT).
--
-- New approach: use is_company_admin() which checks company_members.role IN
-- ('owner','admin'). This is the same SECURITY DEFINER helper used by company_members,
-- company_invites, and departments RLS, so it is consistent and avoids the NULL-role trap.

-- ── policies ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage policies" ON public.policies;

CREATE POLICY "Admins can manage policies"
    ON public.policies FOR ALL
    TO authenticated
    USING (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND is_company_admin(company_id)
    )
    WITH CHECK (
        company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND is_company_admin(company_id)
    );

-- ── policy_versions ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage policy versions" ON public.policy_versions;

CREATE POLICY "Admins can manage policy versions"
    ON public.policy_versions FOR ALL
    TO authenticated
    USING (
        policy_id IN (
            SELECT id FROM public.policies
            WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
            AND is_company_admin(company_id)
        )
    )
    WITH CHECK (
        policy_id IN (
            SELECT id FROM public.policies
            WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
            AND is_company_admin(company_id)
        )
    );
