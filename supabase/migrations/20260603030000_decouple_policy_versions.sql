-- Decouple policy_versions from content_submissions.
-- Policy documents should own their content directly — not depend on a
-- content submission that was designed for marketing material.
-- submission_id is made nullable (not dropped) for backwards compatibility.

ALTER TABLE public.policy_versions
  ADD COLUMN IF NOT EXISTS content_text text,
  ADD COLUMN IF NOT EXISTS file_name    text,
  ADD COLUMN IF NOT EXISTS file_url     text;

-- Backfill content from linked content_submissions
UPDATE public.policy_versions pv
SET content_text = cs.content_text,
    file_name    = cs.file_name
FROM public.content_submissions cs
WHERE cs.id = pv.submission_id
  AND pv.content_text IS NULL;

-- Make submission_id optional — new versions write content directly
ALTER TABLE public.policy_versions
  ALTER COLUMN submission_id DROP NOT NULL;
