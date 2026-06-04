-- Decouple review_assignments from content_submissions.
-- Add entity_type + entity_id so the collaborative review workflow
-- (multi-reviewer, quorum, SLA, vote tracking) can operate on any entity:
-- content submissions, batch records, change controls, SOP versions.
-- submission_id is kept for backwards compatibility — it is no longer written to.

ALTER TABLE public.review_assignments
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'content_submission',
  ADD COLUMN IF NOT EXISTS entity_id   uuid;

UPDATE public.review_assignments
SET entity_id = submission_id
WHERE submission_id IS NOT NULL
  AND entity_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ra_entity
  ON public.review_assignments(entity_type, entity_id);

-- anchored_annotations reference submission_id without FK — generalise too
ALTER TABLE public.anchored_annotations
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'content_submission',
  ADD COLUMN IF NOT EXISTS entity_id   uuid;

UPDATE public.anchored_annotations
SET entity_id = submission_id
WHERE submission_id IS NOT NULL
  AND entity_id IS NULL;
