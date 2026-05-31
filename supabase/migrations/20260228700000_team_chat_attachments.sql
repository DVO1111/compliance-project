-- Migration to add file attachments and voice notes to team chat
-- 1. Update chat_messages content_type check constraint
ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_content_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_content_type_check 
  CHECK (content_type IN ('text', 'gif', 'system', 'file', 'audio'));

-- 2. Add columns to chat_messages for file metadata
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_type TEXT;

-- 3. Create Storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat_attachments', 'chat_attachments', true) 
ON CONFLICT (id) DO NOTHING;

-- 4. Enable RLS and add policies for the bucket
-- Note: 'storage.objects' policies might already exist for other buckets, so we make sure we conditionally add them or just assume public bucket for now.
-- In Supabase, if we make the bucket public=true, anyone can read, but insert still needs policy if RLS is enabled on storage.objects

-- We will just insert standard authenticated user access:
DO $$ 
BEGIN
  CREATE POLICY "Authenticated users can upload chat attachments" 
  ON storage.objects FOR INSERT 
  TO authenticated 
  WITH CHECK (bucket_id = 'chat_attachments' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Public can view chat attachments" 
  ON storage.objects FOR SELECT 
  TO public 
  USING (bucket_id = 'chat_attachments');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Authenticated users can update their attachments" 
  ON storage.objects FOR UPDATE 
  TO authenticated 
  USING (bucket_id = 'chat_attachments' AND owner = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Authenticated users can delete their attachments" 
  ON storage.objects FOR DELETE 
  TO authenticated 
  USING (bucket_id = 'chat_attachments' AND owner = auth.uid());
EXCEPTION WHEN duplicate_object THEN null;
END $$;
