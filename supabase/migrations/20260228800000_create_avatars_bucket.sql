-- Create the 'avatars' storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to avatars
CREATE POLICY "Avatar images are publicly accessible."
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars');

-- Allow authenticated users to upload their own avatars
CREATE POLICY "Users can upload their own avatars."
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'avatars' AND 
        auth.role() = 'authenticated'
    );

-- Allow authenticated users to update their own avatars
CREATE POLICY "Users can update their own avatars."
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'avatars' AND 
        auth.role() = 'authenticated'
    );

-- Allow authenticated users to delete their own avatars
CREATE POLICY "Users can delete their own avatars."
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'avatars' AND 
        auth.role() = 'authenticated'
    );
