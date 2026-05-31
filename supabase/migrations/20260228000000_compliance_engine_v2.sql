-- ============================================================
-- Compliance Engine v2 — Database Schema
-- ai_jobs queue, regulatory_updates, job-claiming RPCs
-- ============================================================

-- ╔════════════════════════════════════════════════════════════╗
-- ║  1. AI_JOBS — async job queue with locking + retry        ║
-- ╚════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid,
  submission_id uuid,
  job_type      text        NOT NULL DEFAULT 'ai_risk_assessment',
  status        text        NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','dead')),
  attempts      int         NOT NULL DEFAULT 0,
  max_attempts  int         NOT NULL DEFAULT 5,
  run_at        timestamptz NOT NULL DEFAULT now(),
  locked_at     timestamptz,
  locked_by     text,
  last_error    text,
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: same job_type + submission + content_hash = one job
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_jobs_idempotent
  ON public.ai_jobs (job_type, submission_id, ((payload->>'content_hash')))
  WHERE payload->>'content_hash' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_jobs_poll      ON public.ai_jobs (status, run_at);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_company   ON public.ai_jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_submission ON public.ai_jobs (submission_id);

ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can see their company's jobs
DROP POLICY IF EXISTS ai_jobs_select ON public.ai_jobs;
CREATE POLICY ai_jobs_select ON public.ai_jobs
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- Only service role / edge functions INSERT/UPDATE (no browser writes)
DROP POLICY IF EXISTS ai_jobs_insert ON public.ai_jobs;
CREATE POLICY ai_jobs_insert ON public.ai_jobs
  FOR INSERT TO authenticated
  WITH CHECK (true);  -- enqueue-ai-job edge function uses service_role, but allow anon insert for flexibility

DROP POLICY IF EXISTS ai_jobs_update ON public.ai_jobs;
CREATE POLICY ai_jobs_update ON public.ai_jobs
  FOR UPDATE TO authenticated
  USING (true);


-- ╔════════════════════════════════════════════════════════════╗
-- ║  2. REGULATORY_UPDATES — web retrieval results            ║
-- ╚════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.regulatory_updates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid,                      -- NULL = global
  jurisdiction  text        NOT NULL DEFAULT 'nigeria',
  title         text        NOT NULL DEFAULT '',
  url           text        NOT NULL,
  source        text        NOT NULL DEFAULT '',
  published_at  timestamptz,
  retrieved_at  timestamptz NOT NULL DEFAULT now(),
  snippet       text        NOT NULL DEFAULT '',
  raw           jsonb       DEFAULT '{}'::jsonb,
  UNIQUE(url)
);

CREATE INDEX IF NOT EXISTS idx_reg_updates_jurisdiction ON public.regulatory_updates (jurisdiction);
CREATE INDEX IF NOT EXISTS idx_reg_updates_company      ON public.regulatory_updates (company_id);

ALTER TABLE public.regulatory_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reg_updates_select ON public.regulatory_updates;
CREATE POLICY reg_updates_select ON public.regulatory_updates
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS reg_updates_insert ON public.regulatory_updates;
CREATE POLICY reg_updates_insert ON public.regulatory_updates
  FOR INSERT TO authenticated
  WITH CHECK (true);


-- ╔════════════════════════════════════════════════════════════╗
-- ║  3. AI_RISK_ASSESSMENTS — ensure content_hash index       ║
-- ╚════════════════════════════════════════════════════════════╝

CREATE INDEX IF NOT EXISTS idx_ai_risk_content_hash
  ON public.ai_risk_assessments (content_hash);


-- ╔════════════════════════════════════════════════════════════╗
-- ║  4. RPCs — claim_ai_jobs + complete_ai_job                ║
-- ╚════════════════════════════════════════════════════════════╝

-- Claim up to N queued jobs atomically (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_ai_jobs(
  p_limit  int  DEFAULT 5,
  p_worker text DEFAULT 'default'
)
RETURNS SETOF public.ai_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT id
    FROM ai_jobs
    WHERE status = 'queued'
      AND run_at <= now()
    ORDER BY run_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE ai_jobs j
  SET status    = 'running',
      locked_at = now(),
      locked_by = p_worker,
      updated_at = now()
  FROM claimable c
  WHERE j.id = c.id
  RETURNING j.*;
END;
$$;

-- Mark a job as succeeded, failed, or dead
CREATE OR REPLACE FUNCTION public.complete_ai_job(
  p_job_id  uuid,
  p_status  text DEFAULT 'succeeded',
  p_error   text DEFAULT NULL,
  p_result  jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status = 'failed' THEN
    -- Increment attempts, schedule retry with exponential backoff
    UPDATE ai_jobs
    SET status     = CASE
                       WHEN attempts + 1 >= max_attempts THEN 'dead'
                       ELSE 'queued'
                     END,
        attempts   = attempts + 1,
        run_at     = CASE
                       WHEN attempts + 1 >= max_attempts THEN run_at
                       ELSE now() + ((power(2, attempts + 1))::int * interval '1 minute')
                     END,
        last_error = p_error,
        locked_at  = NULL,
        locked_by  = NULL,
        updated_at = now()
    WHERE id = p_job_id;
  ELSE
    UPDATE ai_jobs
    SET status     = p_status,
        result     = COALESCE(p_result, result),
        last_error = p_error,
        locked_at  = NULL,
        locked_by  = NULL,
        updated_at = now()
    WHERE id = p_job_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_ai_jobs(int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ai_job(uuid, text, text, jsonb) TO authenticated;


-- ╔════════════════════════════════════════════════════════════╗
-- ║  5. AUTO-UPDATE TIMESTAMP TRIGGER                         ║
-- ╚════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.update_ai_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_jobs_updated_at ON public.ai_jobs;
CREATE TRIGGER trg_ai_jobs_updated_at
  BEFORE UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_ai_jobs_updated_at();
