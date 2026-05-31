/*
  # Add Jurisdiction Support to Compliance System

  1. Modified Tables
    - `compliance_reports`
      - Add `jurisdiction` column (text, default 'nigeria') to track which regulatory jurisdiction was used for analysis
    - `content_submissions`
      - Add `jurisdiction` column (text, default 'nigeria') to track target market jurisdiction

  2. Notes
    - Default value is 'nigeria' to maintain backward compatibility with existing data
    - Supported values: 'nigeria', 'usa', 'europe', 'pan_african', 'all'
    - No data migration needed as existing records are all Nigeria-based
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compliance_reports' AND column_name = 'jurisdiction'
  ) THEN
    ALTER TABLE compliance_reports ADD COLUMN jurisdiction text DEFAULT 'nigeria' NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'jurisdiction'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN jurisdiction text DEFAULT 'nigeria' NOT NULL;
  END IF;
END $$;
