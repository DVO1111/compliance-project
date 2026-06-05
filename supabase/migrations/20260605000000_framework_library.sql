-- ============================================================
-- Framework Library — Pre-encoded Regulatory Framework Catalogue
-- ============================================================
-- Stores regulatory frameworks, sections, and controls as data
-- rather than hard-coded TypeScript. Enables adding new regulators
-- without code deploys and cross-mapping controls across frameworks.

-- ── Top-level frameworks ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regulatory_frameworks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text        NOT NULL UNIQUE,          -- 'nafdac', 'fda', 'ema', 'ama', 'who'
  name          text        NOT NULL,
  short_name    text        NOT NULL,
  jurisdiction  text        NOT NULL,                 -- 'nigeria'|'usa'|'europe'|'pan_african'|'who'|'global'
  description   text,
  regulatory_body text      NOT NULL,
  version       text,
  is_active     boolean     NOT NULL DEFAULT true,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Sections / chapters within a framework ────────────────────
CREATE TABLE IF NOT EXISTS public.framework_sections (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id  uuid        NOT NULL REFERENCES public.regulatory_frameworks(id) ON DELETE CASCADE,
  section_number text,
  title         text        NOT NULL,
  description   text,
  sort_order    integer     NOT NULL DEFAULT 0
);

-- ── Individual controls / rules within a framework ────────────
CREATE TABLE IF NOT EXISTS public.framework_controls (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id       uuid        NOT NULL REFERENCES public.regulatory_frameworks(id) ON DELETE CASCADE,
  section_id         uuid        REFERENCES public.framework_sections(id) ON DELETE SET NULL,
  control_code       text        NOT NULL,            -- 'FC-001', 'WHO-003', 'AMA-001'
  title              text        NOT NULL,
  description        text        NOT NULL,
  control_type       text        NOT NULL
    CHECK (control_type IN ('pattern_rule','caveat_rule','policy_control')),
  severity           text        NOT NULL DEFAULT 'Yellow'
    CHECK (severity IN ('Red','Yellow','Info')),
  regulation_cited   text        NOT NULL,
  category           text,                            -- 'product_violation'|'advertising_violation'|...
  jurisdiction       text,

  -- For pattern_rule controls: the regex pattern
  pattern_source     text,                            -- regex .source (no delimiters or flags)
  pattern_flags      text        NOT NULL DEFAULT 'gi',

  -- Suggestion template — {matched} is replaced at runtime with the matched text
  suggestion_template text       NOT NULL,

  -- For caveat_rule controls: trigger + required-phrase arrays stored as JSON
  -- Each element: {"source": "...", "flags": "i"}
  trigger_patterns   jsonb,
  required_phrases   jsonb,
  platforms          jsonb,                           -- null = all platforms
  audiences          jsonb,                           -- null = all audiences

  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (framework_id, control_code)
);

CREATE INDEX IF NOT EXISTS framework_controls_framework_idx
  ON public.framework_controls (framework_id);
CREATE INDEX IF NOT EXISTS framework_controls_type_idx
  ON public.framework_controls (control_type);

-- ── Cross-mappings: a control satisfying another framework's requirement ──
CREATE TABLE IF NOT EXISTS public.control_cross_mappings (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_control_id   uuid        NOT NULL REFERENCES public.framework_controls(id) ON DELETE CASCADE,
  target_control_id   uuid        NOT NULL REFERENCES public.framework_controls(id) ON DELETE CASCADE,
  mapping_type        text        NOT NULL
    CHECK (mapping_type IN ('equivalent','partial','supersedes')),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_control_id, target_control_id)
);

-- ── Workspace-level framework selection ──────────────────────
-- Which frameworks a company has enabled for their workspace.
CREATE TABLE IF NOT EXISTS public.workspace_frameworks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  framework_id  uuid        NOT NULL REFERENCES public.regulatory_frameworks(id) ON DELETE CASCADE,
  enabled_at    timestamptz NOT NULL DEFAULT now(),
  enabled_by    uuid        REFERENCES auth.users(id),
  UNIQUE (company_id, framework_id)
);

CREATE INDEX IF NOT EXISTS workspace_frameworks_company_idx
  ON public.workspace_frameworks (company_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.regulatory_frameworks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.framework_sections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.framework_controls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_cross_mappings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_frameworks    ENABLE ROW LEVEL SECURITY;

-- Framework catalogue is read-only for all authenticated users
-- (write access is platform-admin only via service role)
CREATE POLICY "Authenticated users can read frameworks"
  ON public.regulatory_frameworks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read framework sections"
  ON public.framework_sections FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read framework controls"
  ON public.framework_controls FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read cross-mappings"
  ON public.control_cross_mappings FOR SELECT
  TO authenticated USING (true);

-- Workspace frameworks: company-scoped read; company-admin write
CREATE POLICY "Users can read their company workspace frameworks"
  ON public.workspace_frameworks FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Company admins can manage workspace frameworks"
  ON public.workspace_frameworks FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );
