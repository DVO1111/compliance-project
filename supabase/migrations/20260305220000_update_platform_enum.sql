-- Update check constraint on content_submissions.platform to include 'automation'
ALTER TABLE public.content_submissions 
DROP CONSTRAINT IF EXISTS content_submissions_platform_check;

ALTER TABLE public.content_submissions 
ADD CONSTRAINT content_submissions_platform_check 
CHECK (platform IN ('instagram', 'x', 'website', 'linkedin', 'print', 'radio', 'automation'));

-- Backfill existing automation evidence
UPDATE public.content_submissions 
SET platform = 'automation' 
WHERE title LIKE '[AUTO] %' AND platform = 'website';
