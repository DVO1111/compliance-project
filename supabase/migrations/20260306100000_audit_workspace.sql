-- Sprint 5: Audit Workspace
-- Tables: audit_sessions, audit_session_participants, audit_requests,
--         audit_request_items, audit_request_evidence
-- Session-scoped RLS for external auditors

-- ══════════════════════════════════════════════════════════════
-- 1. Tables
-- ══════════════════════════════════════════════════════════════

-- ─── audit_sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  name        text NOT NULL,
  audit_type  text NOT NULL DEFAULT 'internal'
              CHECK (audit_type IN ('soc2','iso27001','hipaa','internal')),
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','active','closed')),
  start_date  date,
  end_date    date,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_sessions_company
  ON public.audit_sessions(company_id);

-- ─── audit_session_participants ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_session_participants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL,
  audit_session_id uuid NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL,
  role             text NOT NULL DEFAULT 'member'
                   CHECK (role IN ('auditor','admin','member')),
  invited_email    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(audit_session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_asp_session
  ON public.audit_session_participants(audit_session_id);
CREATE INDEX IF NOT EXISTS idx_asp_user
  ON public.audit_session_participants(user_id);

-- ─── audit_requests (Evidence Requests) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL,
  audit_session_id uuid NOT NULL REFERENCES public.audit_sessions(id) ON DELETE CASCADE,
  requested_by     uuid,
  assigned_to      uuid,
  title            text NOT NULL,
  description      text,
  status           text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','in_progress','fulfilled','closed')),
  due_at           timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  fulfilled_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_areq_session
  ON public.audit_requests(audit_session_id);
CREATE INDEX IF NOT EXISTS idx_areq_company
  ON public.audit_requests(company_id);

-- ─── audit_request_items (link requests to controls/policies/vendors) ───────
CREATE TABLE IF NOT EXISTS public.audit_request_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL,
  audit_request_id  uuid NOT NULL REFERENCES public.audit_requests(id) ON DELETE CASCADE,
  control_id        uuid,
  policy_version_id uuid,
  vendor_id         uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ari_request
  ON public.audit_request_items(audit_request_id);

-- ─── audit_request_evidence (fulfillment linking to Archive) ────────────────
CREATE TABLE IF NOT EXISTS public.audit_request_evidence (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL,
  audit_request_id uuid NOT NULL REFERENCES public.audit_requests(id) ON DELETE CASCADE,
  submission_id    uuid NOT NULL,
  linked_by        uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(audit_request_id, submission_id)
);

CREATE INDEX IF NOT EXISTS idx_are_request
  ON public.audit_request_evidence(audit_request_id);
CREATE INDEX IF NOT EXISTS idx_are_submission
  ON public.audit_request_evidence(submission_id);


-- ══════════════════════════════════════════════════════════════
-- 2. Row Level Security
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.audit_sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_session_participants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_requests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_request_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_request_evidence      ENABLE ROW LEVEL SECURITY;

-- ─── Helper: is this user a participant of a given session? ─────────────────
-- (used in policies below)

-- ─── audit_sessions RLS ─────────────────────────────────────────────────────

-- Company members (non-auditors) can view all company sessions
CREATE POLICY as_company_select ON public.audit_sessions FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- Auditors can view only sessions they participate in
CREATE POLICY as_auditor_select ON public.audit_sessions FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT audit_session_id FROM public.audit_session_participants
      WHERE user_id = auth.uid()
    )
  );

-- Company admins can manage sessions
CREATE POLICY as_company_manage ON public.audit_sessions FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  );

-- ─── audit_session_participants RLS ─────────────────────────────────────────

CREATE POLICY asp_company_select ON public.audit_session_participants FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY asp_auditor_select ON public.audit_session_participants FOR SELECT
  TO authenticated
  USING (
    audit_session_id IN (
      SELECT audit_session_id FROM public.audit_session_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY asp_company_manage ON public.audit_session_participants FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  );

-- ─── audit_requests RLS ─────────────────────────────────────────────────────

-- Company members can view all company requests
CREATE POLICY areq_company_select ON public.audit_requests FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- Auditors can view requests for their sessions
CREATE POLICY areq_auditor_select ON public.audit_requests FOR SELECT
  TO authenticated
  USING (
    audit_session_id IN (
      SELECT audit_session_id FROM public.audit_session_participants
      WHERE user_id = auth.uid()
    )
  );

-- Auditors can create requests in their sessions
CREATE POLICY areq_auditor_insert ON public.audit_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    audit_session_id IN (
      SELECT audit_session_id FROM public.audit_session_participants
      WHERE user_id = auth.uid()
    )
  );

-- Company admins can manage requests
CREATE POLICY areq_company_manage ON public.audit_requests FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  );

-- ─── audit_request_items RLS ────────────────────────────────────────────────

CREATE POLICY ari_company_select ON public.audit_request_items FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY ari_auditor_select ON public.audit_request_items FOR SELECT
  TO authenticated
  USING (
    audit_request_id IN (
      SELECT ar.id FROM public.audit_requests ar
      JOIN public.audit_session_participants asp ON asp.audit_session_id = ar.audit_session_id
      WHERE asp.user_id = auth.uid()
    )
  );

CREATE POLICY ari_company_manage ON public.audit_request_items FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  );

-- ─── audit_request_evidence RLS ─────────────────────────────────────────────

CREATE POLICY are_company_select ON public.audit_request_evidence FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY are_auditor_select ON public.audit_request_evidence FOR SELECT
  TO authenticated
  USING (
    audit_request_id IN (
      SELECT ar.id FROM public.audit_requests ar
      JOIN public.audit_session_participants asp ON asp.audit_session_id = ar.audit_session_id
      WHERE asp.user_id = auth.uid()
    )
  );

CREATE POLICY are_company_manage ON public.audit_request_evidence FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'compliance_officer', 'compliance', 'executive')
    )
  );
