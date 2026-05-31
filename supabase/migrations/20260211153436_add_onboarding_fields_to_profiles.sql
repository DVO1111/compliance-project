/*
  # Add Onboarding Fields to Profiles

  1. Modified Tables
    - `profiles`
      - `industry_type` (text) - Company industry, e.g. Pharmaceuticals, Biotech, Cosmetics
      - `primary_markets` (text[]) - Selected markets: Nigeria, USA, Europe
      - `product_categories` (text[]) - Product focus: Drugs, Medical Devices, Food, Cosmetics
      - `department` (text) - User department: marketing, legal_compliance, executive
      - `onboarding_completed` (boolean) - Whether the user has finished onboarding

  2. Important Notes
    - All new columns are nullable or have defaults so existing users are unaffected
    - `onboarding_completed` defaults to false so existing users see the wizard on next login
    - Uses safe IF NOT EXISTS checks on every column addition
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'industry_type'
  ) THEN
    ALTER TABLE profiles ADD COLUMN industry_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'primary_markets'
  ) THEN
    ALTER TABLE profiles ADD COLUMN primary_markets text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'product_categories'
  ) THEN
    ALTER TABLE profiles ADD COLUMN product_categories text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'department'
  ) THEN
    ALTER TABLE profiles ADD COLUMN department text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
  END IF;
END $$;
