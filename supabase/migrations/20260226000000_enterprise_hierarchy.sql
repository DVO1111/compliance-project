-- ============================================================
-- Enterprise Hierarchy Migration
-- organizations → business_units → brands
-- Run via: Supabase SQL Editor or supabase db push
-- ============================================================

-- ── 1. organizations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  logo_url    text,
  domain      text,                -- e.g. "pfizer.com" for SSO matching
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Ensure profiles has organization links before creating org-level policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;
END$$;

-- Members of any company under this org can read the org row
CREATE POLICY "Org members can view their organization"
  ON organizations FOR SELECT
  USING (
    id IN (
      SELECT p.organization_id FROM profiles p
      WHERE p.id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

CREATE POLICY "Org admins can update their organization"
  ON organizations FOR UPDATE
  USING (
    id IN (
      SELECT p.organization_id FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND (p.role = 'admin' OR p.role = 'executive')
    )
  );


-- ── 2. business_units ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_units (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id      uuid,            -- links to the existing company this BU maps to
  name            text NOT NULL,
  slug            text NOT NULL,
  description     text DEFAULT '',
  region          text,            -- e.g. "EMEA", "APAC", "LATAM"
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

ALTER TABLE business_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view business units"
  ON business_units FOR SELECT
  USING (
    organization_id IN (
      SELECT p.organization_id FROM profiles p
      WHERE p.id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

CREATE POLICY "Org admins can manage business units"
  ON business_units FOR ALL
  USING (
    organization_id IN (
      SELECT p.organization_id FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND (p.role = 'admin' OR p.role = 'executive')
    )
  );


-- ── 3. brands ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id uuid NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  slug             text NOT NULL,
  logo_url         text,
  jurisdictions    text[] NOT NULL DEFAULT '{}',   -- e.g. {"NG","GH","KE"}
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_unit_id, slug)
);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view brands"
  ON brands FOR SELECT
  USING (
    organization_id IN (
      SELECT p.organization_id FROM profiles p
      WHERE p.id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

CREATE POLICY "Org admins can manage brands"
  ON brands FOR ALL
  USING (
    organization_id IN (
      SELECT p.organization_id FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND (p.role = 'admin' OR p.role = 'executive')
    )
  );


-- ── 4. org_regulation_libraries ──────────────────────────────
-- Regulations owned at the org level, inherited by all descendants
CREATE TABLE IF NOT EXISTS org_regulation_libraries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  regulation_id   uuid NOT NULL,   -- FK to regulations table
  added_by        uuid REFERENCES auth.users(id),
  notes           text DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, regulation_id)
);

ALTER TABLE org_regulation_libraries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view shared regulations"
  ON org_regulation_libraries FOR SELECT
  USING (
    organization_id IN (
      SELECT p.organization_id FROM profiles p
      WHERE p.id = auth.uid() AND p.organization_id IS NOT NULL
    )
  );

CREATE POLICY "Org admins can manage shared regulations"
  ON org_regulation_libraries FOR ALL
  USING (
    organization_id IN (
      SELECT p.organization_id FROM profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id IS NOT NULL
        AND (p.role = 'admin' OR p.role = 'executive')
    )
  );


-- ── 5. business_unit_seats ───────────────────────────────────
CREATE TABLE IF NOT EXISTS business_unit_seats (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id uuid NOT NULL UNIQUE REFERENCES business_units(id) ON DELETE CASCADE,
  allocated_seats  integer NOT NULL DEFAULT 0,
  used_seats       integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE business_unit_seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view seat allocations"
  ON business_unit_seats FOR SELECT
  USING (
    business_unit_id IN (
      SELECT bu.id FROM business_units bu
      JOIN profiles p ON p.organization_id = bu.organization_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage seat allocations"
  ON business_unit_seats FOR ALL
  USING (
    business_unit_id IN (
      SELECT bu.id FROM business_units bu
      JOIN profiles p ON p.organization_id = bu.organization_id
      WHERE p.id = auth.uid()
        AND (p.role = 'admin' OR p.role = 'executive')
    )
  );


-- ── 6. Column additions to profiles ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN organization_id uuid REFERENCES organizations(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'business_unit_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN business_unit_id uuid REFERENCES business_units(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'brand_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN brand_id uuid REFERENCES brands(id);
  END IF;
END$$;


-- ── 7. Column addition to content_submissions ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'brand_id'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN brand_id uuid REFERENCES brands(id);
  END IF;
END$$;


-- ── 8. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_business_units_org
  ON business_units(organization_id);

CREATE INDEX IF NOT EXISTS idx_brands_bu
  ON brands(business_unit_id);

CREATE INDEX IF NOT EXISTS idx_brands_org
  ON brands(organization_id);

CREATE INDEX IF NOT EXISTS idx_profiles_org
  ON profiles(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_brand
  ON profiles(brand_id) WHERE brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_brand
  ON content_submissions(brand_id) WHERE brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_reg_lib_org
  ON org_regulation_libraries(organization_id);

-- Done ✅
