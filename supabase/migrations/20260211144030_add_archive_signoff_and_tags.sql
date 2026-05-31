/*
  # Add Archive File Explorer and Legal Sign-off Features

  1. New Tables
    - `document_tags`
      - `id` (uuid, primary key) - Tag unique identifier
      - `content_id` (uuid, FK to content_submissions) - Linked document
      - `user_id` (uuid, FK to auth.users) - Tag creator
      - `tag_name` (text) - Tag display name
      - `tag_type` (text) - Either 'campaign' or 'client'
      - `created_at` (timestamptz) - Creation timestamp
    - `legal_reviews`
      - `id` (uuid, primary key) - Review unique identifier
      - `content_id` (uuid, FK to content_submissions) - Reviewed document
      - `reviewer_id` (uuid, FK to profiles) - Legal reviewer
      - `status` (text) - Review status: pending, approved, rejected
      - `comments` (text, nullable) - Reviewer comments
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Modified Tables
    - `content_submissions`
      - Added `signoff_status` (text) - Workflow state: draft, analyzed, awaiting_legal, signed_off
      - Added `is_locked` (boolean) - Whether document is locked for legal review
      - Added `locked_at` (timestamptz) - When document was locked
      - Added `locked_by` (uuid) - Who locked the document
    - `content_folders`
      - Added `parent_folder_id` (uuid, nullable self-ref) - For nested folder hierarchy

  3. Security
    - Enable RLS on `document_tags` with ownership-based policies
    - Enable RLS on `legal_reviews` with role-based policies
    - Compliance officers and admins can view all content awaiting legal review
    - Compliance officers and admins can manage legal reviews
    - Content owners can view legal reviews on their own documents

  4. Indexes
    - Index on document_tags(content_id) for fast tag lookups
    - Index on document_tags(user_id, tag_name) for tag filtering
    - Index on legal_reviews(content_id) for review lookups
    - Index on content_submissions(signoff_status) for filtering
    - Index on content_folders(parent_folder_id) for tree traversal
*/

-- Add signoff columns to content_submissions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'signoff_status'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN signoff_status text DEFAULT 'draft'
      CHECK (signoff_status IN ('draft', 'analyzed', 'awaiting_legal', 'signed_off'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN is_locked boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'locked_at'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN locked_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'locked_by'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add parent_folder_id to content_folders for nested hierarchy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_folders' AND column_name = 'parent_folder_id'
  ) THEN
    ALTER TABLE content_folders ADD COLUMN parent_folder_id uuid REFERENCES content_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create document_tags table
CREATE TABLE IF NOT EXISTS document_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES content_submissions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_name text NOT NULL,
  tag_type text NOT NULL DEFAULT 'campaign' CHECK (tag_type IN ('campaign', 'client')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(content_id, tag_name)
);

ALTER TABLE document_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tags on own documents"
  ON document_tags FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create tags on own documents"
  ON document_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM content_submissions
      WHERE content_submissions.id = document_tags.content_id
      AND content_submissions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own tags"
  ON document_tags FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create legal_reviews table
CREATE TABLE IF NOT EXISTS legal_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES content_submissions(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comments text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE legal_reviews ENABLE ROW LEVEL SECURITY;

-- Content owners can view reviews on their documents
CREATE POLICY "Content owners can view reviews on own docs"
  ON legal_reviews FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM content_submissions
      WHERE content_submissions.id = legal_reviews.content_id
      AND content_submissions.user_id = auth.uid()
    )
  );

-- Compliance officers and admins can view all reviews
CREATE POLICY "Reviewers can view all legal reviews"
  ON legal_reviews FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'compliance_officer')
    )
  );

-- Content owners can request legal review (insert pending review)
CREATE POLICY "Content owners can request legal review"
  ON legal_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM content_submissions
      WHERE content_submissions.id = legal_reviews.content_id
      AND content_submissions.user_id = auth.uid()
    )
  );

-- Compliance officers and admins can update reviews (approve/reject)
CREATE POLICY "Reviewers can update legal reviews"
  ON legal_reviews FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'compliance_officer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'compliance_officer')
    )
  );

-- Allow compliance officers and admins to view content awaiting legal review
CREATE POLICY "Reviewers can view content awaiting legal review"
  ON content_submissions FOR SELECT
  TO authenticated
  USING (
    signoff_status = 'awaiting_legal'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'compliance_officer')
    )
  );

-- Allow compliance officers to view compliance reports for content under review
CREATE POLICY "Reviewers can view reports for content under review"
  ON compliance_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM content_submissions
      WHERE content_submissions.id = compliance_reports.content_id
      AND content_submissions.signoff_status = 'awaiting_legal'
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'compliance_officer')
      )
    )
  );

-- Allow reviewers to update signoff_status on content they are reviewing
CREATE POLICY "Reviewers can update signoff status"
  ON content_submissions FOR UPDATE
  TO authenticated
  USING (
    signoff_status = 'awaiting_legal'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'compliance_officer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'compliance_officer')
    )
  );

-- Allow reviewers to view profiles for display purposes
CREATE POLICY "Reviewers can view submitter profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'compliance_officer')
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_document_tags_content_id ON document_tags(content_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_user_tag ON document_tags(user_id, tag_name);
CREATE INDEX IF NOT EXISTS idx_legal_reviews_content_id ON legal_reviews(content_id);
CREATE INDEX IF NOT EXISTS idx_legal_reviews_status ON legal_reviews(status);
CREATE INDEX IF NOT EXISTS idx_content_submissions_signoff ON content_submissions(signoff_status);
CREATE INDEX IF NOT EXISTS idx_content_folders_parent ON content_folders(parent_folder_id);
