/*
  # Add structured issues array to compliance_reports

  1. Modified Tables
    - `compliance_reports`
      - `issues` (jsonb, default '[]') - Array of structured compliance issue objects,
        each containing severity (Red/Yellow), issue text, regulation_cited, and suggestion

  2. Notes
    - Each issue object follows the format:
      { severity: "Red"|"Yellow", issue: string, regulation_cited: string, suggestion: string }
    - Red severity = critical violation requiring immediate correction
    - Yellow severity = warning that should be addressed before publication
    - Existing columns (flagged_phrases, violated_regulations, suggested_rewrites) are preserved
      for backward compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compliance_reports' AND column_name = 'issues'
  ) THEN
    ALTER TABLE compliance_reports ADD COLUMN issues jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;
