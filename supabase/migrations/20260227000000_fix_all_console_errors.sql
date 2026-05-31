-- ============================================================
-- COMPREHENSIVE FIX: All Console 404/400/403 Errors
-- Run this ENTIRE script in your Supabase SQL Editor.
-- All statements are idempotent — safe to re-run.
-- ============================================================


-- ╔════════════════════════════════════════════════════════════╗
-- ║  0. PREREQUISITE — add missing columns first              ║
-- ║  These must exist before any RPCs or tables reference them║
-- ╚════════════════════════════════════════════════════════════╝

DO $$
BEGIN
  -- profiles.company_id (needed by almost everything)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN company_id uuid;
  END IF;

  -- content_submissions.company_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN company_id uuid;
  END IF;

  -- content_submissions.signoff_status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'signoff_status'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN signoff_status text DEFAULT 'draft';
  END IF;

  -- content_submissions.jurisdiction
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'jurisdiction'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN jurisdiction text DEFAULT 'nigeria';
  END IF;

  -- content_submissions.submitted_for_legal_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'submitted_for_legal_at'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN submitted_for_legal_at timestamptz;
  END IF;

  -- content_submissions.legal_decided_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'legal_decided_at'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN legal_decided_at timestamptz;
  END IF;

  -- content_submissions.legal_decided_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'legal_decided_by'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN legal_decided_by uuid;
  END IF;

  -- content_submissions.published_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'published_at'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN published_at timestamptz;
  END IF;

  -- content_submissions.published_by
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'published_by'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN published_by uuid;
  END IF;

  -- content_submissions.department
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'department'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN department text;
  END IF;

  -- content_submissions.current_version_number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'current_version_number'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN current_version_number integer DEFAULT 1;
  END IF;

  -- content_submissions.ai_risk_score
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'ai_risk_score'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN ai_risk_score integer;
  END IF;

  -- content_submissions.ai_risk_summary
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'ai_risk_summary'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN ai_risk_summary text;
  END IF;

  -- compliance_reports.issues
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compliance_reports' AND column_name = 'issues'
  ) THEN
    ALTER TABLE compliance_reports ADD COLUMN issues jsonb DEFAULT '[]'::jsonb;
  END IF;

  -- compliance_reports.jurisdiction
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compliance_reports' AND column_name = 'jurisdiction'
  ) THEN
    ALTER TABLE compliance_reports ADD COLUMN jurisdiction text DEFAULT 'nigeria';
  END IF;
END $$;

-- Indexes on new columns
CREATE INDEX IF NOT EXISTS idx_cs_company_id ON content_submissions(company_id);
CREATE INDEX IF NOT EXISTS idx_cs_submitted_for_legal ON content_submissions(submitted_for_legal_at);
CREATE INDEX IF NOT EXISTS idx_cs_department ON content_submissions(department);
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);


-- ╔════════════════════════════════════════════════════════════╗
-- ║  1. NOTIFICATIONS TABLE + RLS  (fixes 403)               ║
-- ╚════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type          text,
  content_id    uuid,
  message       text,
  read_at       timestamptz,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can view own notifications'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Authenticated can insert notifications'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated can insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can update own notifications'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid())';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);


-- ╔════════════════════════════════════════════════════════════╗
-- ║  2. AUDIT_LOGS — add missing columns  (fixes 400)        ║
-- ╚════════════════════════════════════════════════════════════╝

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS integrity_hash text,
  ADD COLUMN IF NOT EXISTS previous_hash text DEFAULT 'GENESIS',
  ADD COLUMN IF NOT EXISTS evidence_snapshot jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS sequence_number bigint;

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_seq
  ON audit_logs (company_id, sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_integrity_hash
  ON audit_logs (integrity_hash);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs' AND policyname = 'Audit logs are immutable — no updates'
  ) THEN
    CREATE POLICY "Audit logs are immutable — no updates"
      ON audit_logs FOR UPDATE TO authenticated
      USING (false) WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs' AND policyname = 'Audit logs are immutable — no deletes'
  ) THEN
    CREATE POLICY "Audit logs are immutable — no deletes"
      ON audit_logs FOR DELETE TO authenticated
      USING (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs' AND policyname = 'Company members can view company audit logs'
  ) THEN
    CREATE POLICY "Company members can view company audit logs"
      ON audit_logs FOR SELECT TO authenticated
      USING (
        company_id IS NULL
        OR company_id IN (
          SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
        )
      );
  END IF;
END $$;

-- Audit retention policies
CREATE TABLE IF NOT EXISTS audit_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'default',
  retention_years integer NOT NULL DEFAULT 7,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (company_id, jurisdiction)
);

ALTER TABLE audit_retention_policies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'audit_retention_policies'
      AND policyname = 'Company members can view retention policies'
  ) THEN
    CREATE POLICY "Company members can view retention policies"
      ON audit_retention_policies FOR SELECT TO authenticated
      USING (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION get_next_audit_sequence(p_company_id uuid)
RETURNS bigint LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  FROM audit_logs WHERE company_id = p_company_id;
$$;

CREATE OR REPLACE FUNCTION verify_audit_chain(p_company_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  rec record;
  expected_prev text := 'GENESIS';
  chain_valid boolean := true;
  broken_id uuid := null;
  total_checked integer := 0;
BEGIN
  FOR rec IN
    SELECT id, integrity_hash, previous_hash
    FROM audit_logs
    WHERE company_id = p_company_id AND integrity_hash IS NOT NULL
    ORDER BY sequence_number ASC
  LOOP
    total_checked := total_checked + 1;
    IF rec.previous_hash IS DISTINCT FROM expected_prev THEN
      chain_valid := false;
      broken_id := rec.id;
      EXIT;
    END IF;
    expected_prev := rec.integrity_hash;
  END LOOP;
  RETURN json_build_object('valid', chain_valid, 'total_checked', total_checked, 'broken_at', broken_id);
END;
$$;


-- ╔════════════════════════════════════════════════════════════╗
-- ║  3. CUSTOM_ROLES TABLE  (fixes 404)                       ║
-- ╚════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS custom_roles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL,
  name        text        NOT NULL,
  description text        DEFAULT '',
  is_system   boolean     NOT NULL DEFAULT false,
  permissions jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_company_role_name UNIQUE (company_id, name)
);

ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'custom_roles' AND policyname = 'Company members can view roles') THEN
    CREATE POLICY "Company members can view roles" ON custom_roles FOR SELECT TO authenticated
      USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'custom_roles' AND policyname = 'Admins can create roles') THEN
    CREATE POLICY "Admins can create roles" ON custom_roles FOR INSERT TO authenticated
      WITH CHECK (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid() AND lower(p.role) IN ('admin', 'executive', 'exec', 'owner')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'custom_roles' AND policyname = 'Admins can update roles') THEN
    CREATE POLICY "Admins can update roles" ON custom_roles FOR UPDATE TO authenticated
      USING (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid() AND lower(p.role) IN ('admin', 'executive', 'exec', 'owner')))
      WITH CHECK (company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid() AND lower(p.role) IN ('admin', 'executive', 'exec', 'owner')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'custom_roles' AND policyname = 'Admins can delete custom roles') THEN
    CREATE POLICY "Admins can delete custom roles" ON custom_roles FOR DELETE TO authenticated
      USING (is_system = false AND company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid() AND lower(p.role) IN ('admin', 'executive', 'exec', 'owner')));
  END IF;
END $$;

-- Add custom_role_id to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'custom_role_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN custom_role_id uuid;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION ensure_system_roles(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO custom_roles (company_id, name, description, is_system, permissions) VALUES
    (p_company_id, 'Marketing', 'Content creators and campaign managers', true,
     '{"canViewMembers":true,"canInvite":false,"canRevokeInvite":false,"canViewLegalReview":false,"canUpload":true,"canViewArchive":true,"canViewTraining":true,"canViewLicenseVault":false,"canViewAuditTrail":false,"canManageRoles":false}'::jsonb)
  ON CONFLICT (company_id, name) DO NOTHING;

  INSERT INTO custom_roles (company_id, name, description, is_system, permissions) VALUES
    (p_company_id, 'Compliance', 'Legal and regulatory compliance officers', true,
     '{"canViewMembers":true,"canInvite":false,"canRevokeInvite":false,"canViewLegalReview":true,"canUpload":false,"canViewArchive":false,"canViewTraining":false,"canViewLicenseVault":false,"canViewAuditTrail":true,"canManageRoles":false}'::jsonb)
  ON CONFLICT (company_id, name) DO NOTHING;

  INSERT INTO custom_roles (company_id, name, description, is_system, permissions) VALUES
    (p_company_id, 'Executive', 'Company administrators with full visibility', true,
     '{"canViewMembers":true,"canInvite":true,"canRevokeInvite":true,"canViewLegalReview":true,"canUpload":false,"canViewArchive":true,"canViewTraining":false,"canViewLicenseVault":true,"canViewAuditTrail":true,"canManageRoles":true}'::jsonb)
  ON CONFLICT (company_id, name) DO NOTHING;
END;
$$;


-- ╔════════════════════════════════════════════════════════════╗
-- ║  4. AI RISK ASSESSMENTS TABLE  (fixes 404)               ║
-- ║  NOTE: No FK to "companies" — that table doesn't exist    ║
-- ╚════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS ai_risk_assessments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id   uuid NOT NULL REFERENCES content_submissions(id) ON DELETE CASCADE,
    company_id      uuid,                -- plain uuid, no FK to non-existent companies table
    ai_risk_score       integer NOT NULL DEFAULT 0,
    overall_sentiment   text NOT NULL DEFAULT 'neutral',
    intent_violations   jsonb NOT NULL DEFAULT '[]'::jsonb,
    subtle_claims       jsonb NOT NULL DEFAULT '[]'::jsonb,
    recommendations     jsonb NOT NULL DEFAULT '[]'::jsonb,
    summary             text NOT NULL DEFAULT '',
    model_version       text NOT NULL DEFAULT 'gemini-2.0-flash',
    content_hash        text,
    expires_at          timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_risk_submission ON ai_risk_assessments(submission_id);
CREATE INDEX IF NOT EXISTS idx_ai_risk_company    ON ai_risk_assessments(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_risk_score      ON ai_risk_assessments(ai_risk_score);

ALTER TABLE ai_risk_assessments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_risk_assessments' AND policyname = 'ai_risk_assessments_company_scope') THEN
    CREATE POLICY "ai_risk_assessments_company_scope"
      ON ai_risk_assessments FOR ALL
      USING (company_id IS NULL OR company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;


-- ╔════════════════════════════════════════════════════════════╗
-- ║  5. CONTENT_VERSIONS + create_content_version RPC         ║
-- ╚════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS content_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid NOT NULL,
  version_number  integer NOT NULL DEFAULT 1,
  content_text    text NOT NULL DEFAULT '',
  corrected_text  text DEFAULT '',
  snapshot_by     uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_cv_submission ON content_versions(submission_id);

ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cv_select_company ON content_versions;
CREATE POLICY cv_select_company ON content_versions
  FOR SELECT USING (
    submission_id IN (
      SELECT id FROM content_submissions
      WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS cv_insert_company ON content_versions;
CREATE POLICY cv_insert_company ON content_versions
  FOR INSERT WITH CHECK (snapshot_by = auth.uid());

-- RPC: create_content_version (fixes the "ambiguous column" error)
CREATE OR REPLACE FUNCTION create_content_version(
  p_content_id uuid,
  p_content_text text,
  p_note text DEFAULT '',
  p_company_id uuid DEFAULT NULL    -- accepted but not required (for future scoping)
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_version integer;
  v_new_id uuid;
BEGIN
  SELECT COALESCE(MAX(cv.version_number), 0) + 1
  INTO v_next_version
  FROM content_versions cv
  WHERE cv.submission_id = p_content_id;

  INSERT INTO content_versions (submission_id, version_number, content_text, corrected_text, snapshot_by)
  VALUES (p_content_id, v_next_version, p_content_text, p_note, auth.uid())
  RETURNING id INTO v_new_id;

  UPDATE content_submissions
  SET current_version_number = v_next_version
  WHERE id = p_content_id;

  RETURN json_build_object('id', v_new_id, 'version_number', v_next_version);
END;
$$;


-- ╔════════════════════════════════════════════════════════════╗
-- ║  6. DASHBOARD RPCs  (fixes 404)                           ║
-- ╚════════════════════════════════════════════════════════════╝

-- 6a. get_my_content_stats
CREATE OR REPLACE FUNCTION get_my_content_stats(p_company_id uuid, p_user_id uuid)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total_all_time',      (SELECT count(*) FROM content_submissions WHERE company_id = p_company_id AND user_id = p_user_id),
    'total_this_month',    (SELECT count(*) FROM content_submissions WHERE company_id = p_company_id AND user_id = p_user_id AND created_at >= date_trunc('month', current_date)),
    'approved',            (SELECT count(*) FROM content_submissions WHERE company_id = p_company_id AND user_id = p_user_id AND signoff_status IN ('signed_off', 'published')),
    'rejected',            (SELECT count(*) FROM content_submissions WHERE company_id = p_company_id AND user_id = p_user_id AND signoff_status IN ('rejected', 'amend_requested')),
    'published',           (SELECT count(*) FROM content_submissions WHERE company_id = p_company_id AND user_id = p_user_id AND signoff_status = 'published'),
    'approval_rate',       COALESCE((SELECT count(*) FILTER (WHERE signoff_status IN ('signed_off','published'))::numeric / NULLIF(count(*) FILTER (WHERE signoff_status NOT IN ('draft','analyzed')), 0) FROM content_submissions WHERE company_id = p_company_id AND user_id = p_user_id), 0),
    'rework_rate',         COALESCE((SELECT count(*) FILTER (WHERE signoff_status IN ('rejected','amend_requested'))::numeric / NULLIF(count(*), 0) FROM content_submissions WHERE company_id = p_company_id AND user_id = p_user_id), 0),
    'avg_time_to_approval_hours', (SELECT EXTRACT(EPOCH FROM avg(legal_decided_at - submitted_for_legal_at)) / 3600.0 FROM content_submissions WHERE company_id = p_company_id AND user_id = p_user_id AND legal_decided_at IS NOT NULL AND submitted_for_legal_at IS NOT NULL AND signoff_status IN ('signed_off','published')),
    'platforms',           COALESCE((SELECT json_agg(row_to_json(t)) FROM (SELECT platform, count(*) AS count FROM content_submissions WHERE company_id = p_company_id AND user_id = p_user_id GROUP BY platform ORDER BY count(*) DESC) t), '[]'::json)
  );
$$;

-- 6b. get_top_risk_causes
CREATE OR REPLACE FUNCTION get_top_risk_causes(
  p_company_id uuid, p_user_id uuid DEFAULT NULL,
  p_jurisdiction text DEFAULT NULL, p_limit int DEFAULT 10
)
RETURNS TABLE(cause text, severity text, occurrences bigint, category text)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    issue_obj->>'issue' AS cause,
    issue_obj->>'severity' AS severity,
    count(*) AS occurrences,
    COALESCE(issue_obj->>'category', 'general') AS category
  FROM compliance_reports cr
  JOIN content_submissions cs ON cs.id = cr.content_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(cr.issues) = 'array' THEN cr.issues ELSE '[]'::jsonb END
  ) AS issue_obj
  WHERE cs.company_id = p_company_id
    AND (p_user_id IS NULL OR cs.user_id = p_user_id)
    AND (p_jurisdiction IS NULL OR cs.jurisdiction = p_jurisdiction)
  GROUP BY issue_obj->>'issue', issue_obj->>'severity', COALESCE(issue_obj->>'category', 'general')
  ORDER BY count(*) DESC
  LIMIT GREATEST(p_limit, 1);
$$;

-- 6c. get_jurisdiction_comparison
CREATE OR REPLACE FUNCTION get_jurisdiction_comparison(p_company_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS TABLE(
  jurisdiction text, total_submissions bigint, approved bigint, rejected bigint,
  approval_rate numeric, avg_risk_score numeric, flagged bigint, critical bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    cs.jurisdiction,
    count(*) AS total_submissions,
    count(*) FILTER (WHERE cs.signoff_status IN ('signed_off', 'published')) AS approved,
    count(*) FILTER (WHERE cs.signoff_status IN ('rejected', 'amend_requested')) AS rejected,
    COALESCE(count(*) FILTER (WHERE cs.signoff_status IN ('signed_off','published'))::numeric / NULLIF(count(*) FILTER (WHERE cs.signoff_status NOT IN ('draft','analyzed')), 0), 0) AS approval_rate,
    avg(CASE WHEN cr.overall_risk = 'low' THEN 1 WHEN cr.overall_risk = 'medium' THEN 2 WHEN cr.overall_risk = 'high' THEN 3 WHEN cr.overall_risk = 'critical' THEN 4 ELSE NULL END) AS avg_risk_score,
    count(*) FILTER (WHERE cs.status = 'flagged') AS flagged,
    count(*) FILTER (WHERE cs.status = 'critical') AS critical
  FROM content_submissions cs
  LEFT JOIN LATERAL (
    SELECT cr2.overall_risk FROM compliance_reports cr2 WHERE cr2.content_id = cs.id ORDER BY cr2.created_at DESC LIMIT 1
  ) cr ON TRUE
  WHERE cs.company_id = p_company_id AND (p_user_id IS NULL OR cs.user_id = p_user_id)
  GROUP BY cs.jurisdiction
  ORDER BY count(*) DESC;
$$;


-- ╔════════════════════════════════════════════════════════════╗
-- ║  7. CALENDAR EVENTS + RLS                                 ║
-- ╚════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid NOT NULL,
  submission_id             uuid NOT NULL,
  event_type                text NOT NULL DEFAULT 'marketing_publish'
    CHECK (event_type IN ('marketing_publish', 'legal_review')),
  title                     text NOT NULL DEFAULT '',
  scheduled_at              timestamptz NOT NULL DEFAULT now(),
  is_auto_dated             boolean NOT NULL DEFAULT false,
  needs_schedule_confirmation boolean NOT NULL DEFAULT false,
  legal_planned_at          timestamptz,
  legal_acknowledged        boolean NOT NULL DEFAULT false,
  status                    text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'overdue')),
  created_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_company    ON public.calendar_events (company_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_submission ON public.calendar_events (submission_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type       ON public.calendar_events (company_id, event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_scheduled  ON public.calendar_events (company_id, scheduled_at);

CREATE TABLE IF NOT EXISTS public.calendar_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  reminder_type   text NOT NULL CHECK (reminder_type IN ('24h', '5h', 'legal_followup', 'legal_unattended')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  recipient_id    uuid NOT NULL,
  message         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_reminders_event ON public.calendar_reminders (event_id);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_events_select ON public.calendar_events;
DROP POLICY IF EXISTS calendar_events_insert ON public.calendar_events;
DROP POLICY IF EXISTS calendar_events_update ON public.calendar_events;
DROP POLICY IF EXISTS calendar_reminders_select ON public.calendar_reminders;
DROP POLICY IF EXISTS calendar_reminders_insert ON public.calendar_reminders;

CREATE POLICY calendar_events_select ON public.calendar_events
  FOR SELECT USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY calendar_events_insert ON public.calendar_events
  FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY calendar_events_update ON public.calendar_events
  FOR UPDATE USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY calendar_reminders_select ON public.calendar_reminders
  FOR SELECT USING (event_id IN (SELECT id FROM public.calendar_events WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));
CREATE POLICY calendar_reminders_insert ON public.calendar_reminders
  FOR INSERT WITH CHECK (event_id IN (SELECT id FROM public.calendar_events WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));

CREATE OR REPLACE FUNCTION public.update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_calendar_events_updated_at();


-- ╔════════════════════════════════════════════════════════════╗
-- ║  DONE ✅                                                  ║
-- ╚════════════════════════════════════════════════════════════╝
