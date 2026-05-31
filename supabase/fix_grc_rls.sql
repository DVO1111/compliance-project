-- Fix GRC RLS policies — use company membership check only (frontend handles role-based auth)
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Admins can manage frameworks" ON public.grc_frameworks;
DROP POLICY IF EXISTS "Admins can manage controls" ON public.grc_controls;
DROP POLICY IF EXISTS "Admins can manage control evidence" ON public.grc_control_evidence;
DROP POLICY IF EXISTS "Admins can manage control snapshots" ON public.grc_control_snapshots;

-- Recreate: any authenticated company member can manage (frontend enforces role-based permissions)
CREATE POLICY "Company members can manage frameworks"
  ON public.grc_frameworks FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Company members can manage controls"
  ON public.grc_controls FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Company members can manage control evidence"
  ON public.grc_control_evidence FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Company members can manage control snapshots"
  ON public.grc_control_snapshots FOR ALL
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );
