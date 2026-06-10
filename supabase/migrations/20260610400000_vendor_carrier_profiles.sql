-- B2: Vendor Management – carrier-specific fields
-- Adds logistics carrier categories and a carrier profile table

-- 1. Expand vendor category CHECK constraint (explicit schema; drop by name lookup to survive auto-naming)
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT constraint_name INTO v_constraint
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name   = 'vendors'
    AND constraint_type = 'CHECK'
    AND constraint_name ILIKE '%category%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.vendors DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_category_check
  CHECK (category IN ('cloud','payment','marketing','legal','logistics_carrier','customs_broker','last_mile'));

-- 2. Carrier profile table (mirrors vendor_risk_profiles pattern)
CREATE TABLE IF NOT EXISTS public.vendor_carrier_profiles (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id                uuid NOT NULL UNIQUE REFERENCES public.vendors(id) ON DELETE CASCADE,
  shipping_modes           text[]  DEFAULT '{}',          -- air, road, sea, last_mile
  route_coverage           jsonb   DEFAULT '{}',          -- {uk_to_ng: true, ng_to_uk: true, …}
  last_mile_areas          text[]  DEFAULT '{}',          -- Lagos, Abuja, Port Harcourt …
  on_time_delivery_rate    numeric(5,2),                  -- percentage 0–100
  damage_rate              numeric(5,2),                  -- percentage 0–100
  carrier_licence_type     text,                          -- NCS_agent, NCAA_approved, etc.
  insurance_coverage_gbp   numeric(14,2),
  insurance_expiry         date,
  anti_bribery_ack         boolean NOT NULL DEFAULT false,
  due_diligence_completed  boolean NOT NULL DEFAULT false,
  last_due_diligence_date  date,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Row-level security
ALTER TABLE public.vendor_carrier_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carrier_profiles_company_read" ON public.vendor_carrier_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_carrier_profiles.vendor_id
        AND v.company_id = (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    )
  );

CREATE POLICY "carrier_profiles_company_write" ON public.vendor_carrier_profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_carrier_profiles.vendor_id
        AND v.company_id = (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
    )
  );

-- Index for FK lookups
CREATE INDEX IF NOT EXISTS idx_vendor_carrier_profiles_vendor_id ON public.vendor_carrier_profiles(vendor_id);
