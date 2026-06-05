-- Allow authenticated users to insert/update framework library data.
-- The bootstrap in frameworkLibraryService runs from the client on first sign-in
-- and needs INSERT access to seed frameworks and controls.
-- UPDATE is required for the admin authoring UI (toggle controls, edit rules).

CREATE POLICY "Authenticated users can insert frameworks"
  ON public.regulatory_frameworks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update frameworks"
  ON public.regulatory_frameworks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert framework controls"
  ON public.framework_controls FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update framework controls"
  ON public.framework_controls FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert framework sections"
  ON public.framework_sections FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update framework sections"
  ON public.framework_sections FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
