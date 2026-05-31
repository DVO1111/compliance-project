-- Backfill script to update existing automation evidence platform
-- RUN THIS IN SUPABASE SQL EDITOR

UPDATE public.content_submissions
SET platform = 'automation'
WHERE title LIKE '[AUTO] %'
  AND platform = 'website';

-- Verify update
-- SELECT id, title, platform FROM public.content_submissions WHERE title LIKE '[AUTO] %';
