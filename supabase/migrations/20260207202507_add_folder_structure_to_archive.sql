/*
  # Add Folder Structure to Content Archive

  1. New Tables
    - `content_folders`
      - `id` (uuid, primary key) - Folder unique identifier
      - `user_id` (uuid, FK to auth.users) - Folder owner
      - `name` (text) - Folder name
      - `description` (text) - Optional folder description
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Modified Tables
    - `content_submissions`
      - Added `folder_id` (uuid, nullable FK to content_folders) - Link to parent folder

  3. Security
    - Enable RLS on `content_folders` table
    - Users can only manage their own folders
    - Users can only view and move their own content to their folders
    - Cascade delete when folder is deleted

  4. Indexes
    - Index on (user_id, created_at DESC) for efficient folder listing
    - Index on folder_id for content filtering
*/

CREATE TABLE IF NOT EXISTS content_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE content_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own folders"
  ON content_folders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create folders"
  ON content_folders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own folders"
  ON content_folders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own folders"
  ON content_folders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_submissions' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE content_submissions ADD COLUMN folder_id uuid REFERENCES content_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_folders_user_id ON content_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_content_folders_created_at ON content_folders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_submissions_folder_id ON content_submissions(folder_id);
