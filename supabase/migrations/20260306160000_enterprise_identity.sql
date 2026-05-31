-- ============================================================
-- Phase 5 Sprint 2: Enterprise Identity Management & SSO
-- Tables: identity_providers, identity_sessions, identity_role_mappings
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. identity_providers — SSO / IdP configuration per company
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.identity_providers (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_type text        NOT NULL CHECK (provider_type IN ('saml','oidc','google','azure','okta')),
  name          text        NOT NULL,
  domain        text,
  metadata      jsonb       DEFAULT '{}'::jsonb,
  enabled       boolean     DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_providers_company  ON public.identity_providers(company_id);
CREATE INDEX IF NOT EXISTS idx_identity_providers_domain   ON public.identity_providers(domain);

ALTER TABLE public.identity_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY identity_providers_select ON public.identity_providers
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY identity_providers_insert ON public.identity_providers
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY identity_providers_update ON public.identity_providers
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY identity_providers_delete ON public.identity_providers
  FOR DELETE USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );


-- ──────────────────────────────────────────────────────────────
-- 2. identity_sessions — enterprise login session tracking
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.identity_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES public.profiles(id),
  company_id    uuid        REFERENCES public.companies(id),
  provider_id   uuid        REFERENCES public.identity_providers(id),
  login_method  text,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_sessions_company ON public.identity_sessions(company_id);

ALTER TABLE public.identity_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY identity_sessions_select ON public.identity_sessions
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY identity_sessions_insert ON public.identity_sessions
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );


-- ──────────────────────────────────────────────────────────────
-- 3. identity_role_mappings — SSO group → platform role map
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.identity_role_mappings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid        NOT NULL REFERENCES public.identity_providers(id) ON DELETE CASCADE,
  external_group  text        NOT NULL,
  role            text,
  custom_role_id  uuid        REFERENCES public.custom_roles(id),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.identity_role_mappings ENABLE ROW LEVEL SECURITY;

-- RLS scoped through provider → company
CREATE POLICY identity_role_mappings_select ON public.identity_role_mappings
  FOR SELECT USING (
    provider_id IN (
      SELECT id FROM public.identity_providers
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY identity_role_mappings_insert ON public.identity_role_mappings
  FOR INSERT WITH CHECK (
    provider_id IN (
      SELECT id FROM public.identity_providers
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY identity_role_mappings_update ON public.identity_role_mappings
  FOR UPDATE USING (
    provider_id IN (
      SELECT id FROM public.identity_providers
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY identity_role_mappings_delete ON public.identity_role_mappings
  FOR DELETE USING (
    provider_id IN (
      SELECT id FROM public.identity_providers
      WHERE company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );
