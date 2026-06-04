-- Decouple review_assignments from content_submissions.
-- Add entity_type + entity_id so the collaborative review workflow
-- (multi-reviewer, quorum, SLA, vote tracking) can operate on any entity:
-- content submissions, batch records, change controls, SOP versions.
-- submission_id is kept for backwards compatibility — it is no longer written to.
--
-- Self-contained: CREATE TABLE IF NOT EXISTS covers fresh databases;
-- ALTER TABLE ADD COLUMN IF NOT EXISTS covers existing databases.

-- ── review_assignments ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.review_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL,
  submission_id    uuid,
  entity_type      text NOT NULL DEFAULT 'content_submission',
  entity_id        uuid,
  reviewer_ids     uuid[] NOT NULL DEFAULT '{}',
  quorum           integer NOT NULL DEFAULT 1,
  sla_hours        integer NOT NULL DEFAULT 48,
  deadline_at      timestamptz,
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','resolved','expired','cancelled')),
  resolved_at      timestamptz,
  resolved_outcome text CHECK (resolved_outcome IN ('approved','rejected','amend_requested')),
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Add new columns for existing installations (no-op on fresh ones above)
ALTER TABLE public.review_assignments
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'content_submission',
  ADD COLUMN IF NOT EXISTS entity_id   uuid;

-- Make submission_id nullable for existing installations
ALTER TABLE public.review_assignments
  ALTER COLUMN submission_id DROP NOT NULL;

-- Backfill entity_id from submission_id for existing rows
UPDATE public.review_assignments
SET entity_id = submission_id
WHERE submission_id IS NOT NULL
  AND entity_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ra_submission ON public.review_assignments(submission_id);
CREATE INDEX IF NOT EXISTS idx_ra_company    ON public.review_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_ra_status     ON public.review_assignments(status);
CREATE INDEX IF NOT EXISTS idx_ra_entity     ON public.review_assignments(entity_type, entity_id);

-- RLS (idempotent)
ALTER TABLE public.review_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ra_select_company ON public.review_assignments;
CREATE POLICY ra_select_company ON public.review_assignments
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS ra_insert_company ON public.review_assignments;
CREATE POLICY ra_insert_company ON public.review_assignments
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS ra_update_company ON public.review_assignments;
CREATE POLICY ra_update_company ON public.review_assignments
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );


-- ── anchored_annotations ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.anchored_annotations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL,
  submission_id    uuid,
  entity_type      text NOT NULL DEFAULT 'content_submission',
  entity_id        uuid,
  author_id        uuid NOT NULL,
  anchor_paragraph integer NOT NULL DEFAULT 0,
  anchor_start     integer NOT NULL DEFAULT 0,
  anchor_end       integer NOT NULL DEFAULT 0,
  anchor_text      text DEFAULT '',
  body             text NOT NULL,
  parent_id        uuid REFERENCES public.anchored_annotations(id) ON DELETE CASCADE,
  is_resolved      boolean NOT NULL DEFAULT false,
  resolved_by      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Add new columns for existing installations
ALTER TABLE public.anchored_annotations
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'content_submission',
  ADD COLUMN IF NOT EXISTS entity_id   uuid;

-- Make submission_id nullable for existing installations
ALTER TABLE public.anchored_annotations
  ALTER COLUMN submission_id DROP NOT NULL;

UPDATE public.anchored_annotations
SET entity_id = submission_id
WHERE submission_id IS NOT NULL
  AND entity_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_aa_submission ON public.anchored_annotations(submission_id);
CREATE INDEX IF NOT EXISTS idx_aa_parent     ON public.anchored_annotations(parent_id);
CREATE INDEX IF NOT EXISTS idx_aa_entity     ON public.anchored_annotations(entity_type, entity_id);

ALTER TABLE public.anchored_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aa_select_company ON public.anchored_annotations;
CREATE POLICY aa_select_company ON public.anchored_annotations
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS aa_insert_company ON public.anchored_annotations;
CREATE POLICY aa_insert_company ON public.anchored_annotations
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );
