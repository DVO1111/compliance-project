-- Add project/branch and regulatory body access fields to company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS project_name text;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS regulatory_body_access text;
