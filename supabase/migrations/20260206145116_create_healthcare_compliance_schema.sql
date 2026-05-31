/*
  # Healthcare Compliance Dashboard Schema

  ## Overview
  Creates the complete database schema for the Criateur Healthcare Compliance Dashboard,
  a RegTech platform for pharmaceutical and healthcare marketing compliance.

  ## New Tables
  
  ### 1. profiles
  - `id` (uuid, FK to auth.users) - User identifier
  - `email` (text) - User email
  - `full_name` (text) - User's full name
  - `organization` (text) - Company/organization name
  - `role` (text) - User role (admin, compliance_officer, content_creator)
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. regulations
  - `id` (uuid, PK) - Regulation unique identifier
  - `title` (text) - Regulation title
  - `source` (text) - Regulatory body (NAFDAC, MOH, etc.)
  - `category` (text) - Category (pharma, medical_devices, clinical_trials)
  - `content` (text) - Full regulation text
  - `source_url` (text) - Original source URL
  - `version` (text) - Version identifier
  - `effective_date` (date) - When regulation becomes effective
  - `last_crawled` (timestamptz) - Last crawler update
  - `is_active` (boolean) - Whether regulation is current
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 3. content_submissions
  - `id` (uuid, PK) - Content unique identifier
  - `user_id` (uuid, FK to auth.users) - Submitter
  - `title` (text) - Content title
  - `content_text` (text) - Extracted text content
  - `file_name` (text) - Original filename
  - `file_type` (text) - File extension (.docx, .pdf, .txt)
  - `platform` (text) - Target platform (instagram, x, website, linkedin, print)
  - `content_topic` (text) - Topic description
  - `target_audience` (text) - Audience (healthcare_professionals, patients)
  - `status` (text) - Compliance status (pending, approved, flagged, critical)
  - `priority` (text) - Priority level (urgent, scheduled, low)
  - `scheduled_date` (date) - Publication date
  - `created_at` (timestamptz) - Submission timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 4. compliance_reports
  - `id` (uuid, PK) - Report unique identifier
  - `content_id` (uuid, FK to content_submissions) - Related content
  - `regulation_version` (text) - Regulation version used
  - `overall_risk` (text) - Risk level (low, medium, high, critical)
  - `flagged_phrases` (jsonb) - Array of flagged content
  - `violated_regulations` (jsonb) - Array of violations
  - `suggested_rewrites` (jsonb) - Array of suggestions
  - `strictness_level` (text) - Platform-based strictness
  - `analysis_timestamp` (timestamptz) - When analysis was performed
  - `created_at` (timestamptz) - Creation timestamp

  ### 5. audit_logs
  - `id` (uuid, PK) - Log unique identifier
  - `user_id` (uuid, FK to auth.users) - User performing action
  - `action` (text) - Action type (upload, approve, flag, export)
  - `entity_type` (text) - Entity affected (content, regulation, report)
  - `entity_id` (uuid) - Related entity ID
  - `metadata` (jsonb) - Additional context
  - `created_at` (timestamptz) - Action timestamp

  ### 6. regulation_updates
  - `id` (uuid, PK) - Update unique identifier
  - `regulation_id` (uuid, FK to regulations) - Related regulation
  - `change_summary` (text) - AI-generated summary of changes
  - `previous_version` (text) - Previous version identifier
  - `new_version` (text) - New version identifier
  - `detected_at` (timestamptz) - When change was detected
  - `acknowledged_by` (uuid, FK to auth.users) - User who acknowledged
  - `acknowledged_at` (timestamptz) - Acknowledgment timestamp
  - `created_at` (timestamptz) - Creation timestamp

  ## Security
  - RLS enabled on all tables
  - Policies for authenticated users based on ownership and role
  - Audit trail for all critical operations
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  organization text,
  role text DEFAULT 'content_creator' CHECK (role IN ('admin', 'compliance_officer', 'content_creator')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create regulations table
CREATE TABLE IF NOT EXISTS regulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source text NOT NULL,
  category text NOT NULL CHECK (category IN ('pharma', 'medical_devices', 'clinical_trials', 'marketing', 'general')),
  content text NOT NULL,
  source_url text,
  version text NOT NULL,
  effective_date date,
  last_crawled timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE regulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view regulations"
  ON regulations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert regulations"
  ON regulations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update regulations"
  ON regulations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create content_submissions table
CREATE TABLE IF NOT EXISTS content_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content_text text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('.docx', '.pdf', '.txt')),
  platform text NOT NULL CHECK (platform IN ('instagram', 'x', 'website', 'linkedin', 'print', 'radio')),
  content_topic text NOT NULL,
  target_audience text NOT NULL CHECK (target_audience IN ('healthcare_professionals', 'patients', 'general_public')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'flagged', 'critical')),
  priority text DEFAULT 'low' CHECK (priority IN ('urgent', 'scheduled', 'low')),
  scheduled_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE content_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own content submissions"
  ON content_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own content submissions"
  ON content_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own content submissions"
  ON content_submissions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own content submissions"
  ON content_submissions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create compliance_reports table
CREATE TABLE IF NOT EXISTS compliance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES content_submissions(id) ON DELETE CASCADE,
  regulation_version text NOT NULL,
  overall_risk text NOT NULL CHECK (overall_risk IN ('low', 'medium', 'high', 'critical')),
  flagged_phrases jsonb DEFAULT '[]'::jsonb,
  violated_regulations jsonb DEFAULT '[]'::jsonb,
  suggested_rewrites jsonb DEFAULT '[]'::jsonb,
  strictness_level text NOT NULL,
  analysis_timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE compliance_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reports for own content"
  ON compliance_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM content_submissions
      WHERE content_submissions.id = compliance_reports.content_id
      AND content_submissions.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert compliance reports"
  ON compliance_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM content_submissions
      WHERE content_submissions.id = compliance_reports.content_id
      AND content_submissions.user_id = auth.uid()
    )
  );

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and compliance officers can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'compliance_officer')
    )
  );

CREATE POLICY "Authenticated users can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create regulation_updates table
CREATE TABLE IF NOT EXISTS regulation_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulation_id uuid NOT NULL REFERENCES regulations(id) ON DELETE CASCADE,
  change_summary text NOT NULL,
  previous_version text NOT NULL,
  new_version text NOT NULL,
  detected_at timestamptz DEFAULT now(),
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE regulation_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view regulation updates"
  ON regulation_updates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can acknowledge updates"
  ON regulation_updates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (auth.uid() = acknowledged_by);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_content_submissions_user_id ON content_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_content_submissions_status ON content_submissions(status);
CREATE INDEX IF NOT EXISTS idx_content_submissions_created_at ON content_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_reports_content_id ON compliance_reports(content_id);
CREATE INDEX IF NOT EXISTS idx_regulations_category ON regulations(category);
CREATE INDEX IF NOT EXISTS idx_regulations_is_active ON regulations(is_active);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Insert sample regulations for testing
INSERT INTO regulations (title, source, category, content, source_url, version, effective_date, is_active) VALUES
('NAFDAC Guidelines on Pharmaceutical Advertising', 'NAFDAC', 'pharma', 'Pharmaceutical products must not claim to cure chronic or viral diseases. All promotional materials must include safety disclaimers. Claims must be substantiated by clinical evidence.', 'https://www.nafdac.gov.ng/guidelines', '2025.1', '2025-01-01', true),
('Medical Device Marketing Regulations', 'NAFDAC', 'medical_devices', 'Medical devices must not make unsubstantiated claims. All marketing materials must include proper usage instructions and contraindications.', 'https://www.nafdac.gov.ng/medical-devices', '2024.3', '2024-06-01', true),
('Clinical Trial Communication Standards', 'Ministry of Health', 'clinical_trials', 'Clinical trial results must be presented with statistical significance clearly stated. Patient recruitment materials must be approved by ethics committee.', 'https://www.health.gov.ng/clinical-trials', '2024.2', '2024-03-15', true)
ON CONFLICT DO NOTHING;