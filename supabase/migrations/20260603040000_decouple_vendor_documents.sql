-- Decouple vendor_documents from content_submissions.
-- Vendor compliance documents (SOC2, ISO certs, NDAs, insurance) should be
-- uploaded directly to storage — not routed through the content submission pipeline.
-- submission_id is made nullable; new uploads use file_name / file_url directly.

ALTER TABLE public.vendor_documents
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_url  text,
  ADD COLUMN IF NOT EXISTS file_size integer;

-- Backfill file_name from linked content_submissions where possible
UPDATE public.vendor_documents vd
SET file_name = cs.file_name
FROM public.content_submissions cs
WHERE cs.id = vd.submission_id
  AND vd.file_name IS NULL;

-- Make submission_id optional
ALTER TABLE public.vendor_documents
  ALTER COLUMN submission_id DROP NOT NULL;

-- Drop the unique constraint that paired vendor_id + submission_id
ALTER TABLE public.vendor_documents
  DROP CONSTRAINT IF EXISTS vendor_documents_vendor_id_submission_id_key;
