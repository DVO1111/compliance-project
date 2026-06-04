-- Decouple grc_control_evidence from content_submissions.
-- Replace submission_id FK with generic entity_type + entity_id columns so
-- GRC controls can link evidence from any workflow entity:
-- content_submission, batch_record, capa_record, sop_document, change_control.

-- 1. Add generic entity columns
ALTER TABLE public.grc_control_evidence
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id   uuid;

-- 2. Backfill from existing submission_id values
UPDATE public.grc_control_evidence
SET entity_type = 'content_submission',
    entity_id   = submission_id
WHERE submission_id IS NOT NULL
  AND entity_id IS NULL;

-- 3. Replace the submission-specific trigger with a generic one
DROP TRIGGER IF EXISTS trg_grc_evidence_missing ON public.grc_control_evidence;
DROP FUNCTION IF EXISTS fn_grc_evidence_missing() CASCADE;

CREATE OR REPLACE FUNCTION fn_grc_evidence_missing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.entity_id IS NULL THEN
    NEW.status := 'missing';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_grc_evidence_missing
  BEFORE UPDATE ON public.grc_control_evidence
  FOR EACH ROW
  WHEN (OLD.entity_id IS NOT NULL AND NEW.entity_id IS NULL)
  EXECUTE FUNCTION fn_grc_evidence_missing();

-- 4. Drop old submission-specific indexes
DROP INDEX IF EXISTS idx_grc_control_evidence_submission;
DROP INDEX IF EXISTS idx_grc_control_evidence_unique_link;

-- 5. Create new indexes on entity columns
CREATE INDEX IF NOT EXISTS idx_grc_evidence_entity
  ON public.grc_control_evidence(company_id, entity_type, entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grc_evidence_unique_entity
  ON public.grc_control_evidence(company_id, control_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- 6. Drop the old submission_id column
ALTER TABLE public.grc_control_evidence
  DROP COLUMN IF EXISTS submission_id;
