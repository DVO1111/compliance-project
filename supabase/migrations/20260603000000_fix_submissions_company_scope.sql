-- Fix content_submissions: add FK constraint to companies(id) and upgrade
-- the SELECT policy from user-scoped to company-scoped so that legal reviewers
-- and compliance officers can see all submissions within their company.
-- INSERT / UPDATE / DELETE remain user-scoped — users manage their own content.

-- 1. Backfill company_id for any rows where it is NULL
UPDATE public.content_submissions cs
SET company_id = p.company_id
FROM public.profiles p
WHERE p.id = cs.user_id
  AND cs.company_id IS NULL;

-- 2. Add FK constraint if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'content_submissions_company_id_fkey'
      AND table_schema = 'public'
      AND table_name   = 'content_submissions'
  ) THEN
    ALTER TABLE public.content_submissions
      ADD CONSTRAINT content_submissions_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
END $$;

-- 3. Replace user-scoped SELECT with company-scoped SELECT
DROP POLICY IF EXISTS "Users can view own content submissions" ON public.content_submissions;

CREATE POLICY "Company members can view submissions"
  ON public.content_submissions FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );
