-- Fix visibility of deleted content in Secret Vault
-- and properly remove it from regular user views

-- 1. Modify the general view policy so users cannot see their own deleted content
DROP POLICY IF EXISTS "Users can view own content submissions" ON public.content_submissions;

CREATE POLICY "Users can view own content submissions"
  ON public.content_submissions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id AND 
    (is_deleted IS NULL OR is_deleted = false)
  );

-- 2. Prevent updates on deleted content by normal users
DROP POLICY IF EXISTS "Users can update own content submissions" ON public.content_submissions;

CREATE POLICY "Users can update own content submissions"
  ON public.content_submissions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id AND 
    (is_deleted IS NULL OR is_deleted = false)
  );

-- 3. Add policy to allow executives, admins, IT, and compliance to view deleted content in their company
CREATE POLICY "Authorized vault users can view deleted company content"
  ON public.content_submissions FOR SELECT
  TO authenticated
  USING (
    is_deleted = true AND
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()) AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      LEFT JOIN public.custom_roles cr ON p.custom_role_id = cr.id
      WHERE p.id = auth.uid()
      AND (
        p.role IN ('admin', 'compliance_officer') OR
        cr.name ILIKE '%it%' OR cr.name ILIKE '%tech%' OR cr.name ILIKE '%legal%' OR cr.name ILIKE '%executive%'
      )
    )
  );
