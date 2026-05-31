-- Add '2h_deadline' to the reminder_type CHECK constraint on calendar_reminders

-- 1. Drop the existing constraint
ALTER TABLE public.calendar_reminders DROP CONSTRAINT IF EXISTS calendar_reminders_reminder_type_check;

-- 2. Add the new constraint with '2h_deadline' included
ALTER TABLE public.calendar_reminders ADD CONSTRAINT calendar_reminders_reminder_type_check 
  CHECK (reminder_type IN ('24h', '5h', 'legal_followup', 'legal_unattended', '2h_deadline'));

-- 3. Enable pg_net to make HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 4. Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 5. Schedule the deadline-alerts edge function to run every 15 minutes
-- NOTE: In production, URL relies on environment variables or specific project ref.
-- We use localhost or the project URL depending on the environment.
-- Since this is migration logic that runs everywhere, the function needs a robust URI.
-- For local dev & prod, calling the Edge Function from Postgres can be tricky,
-- but standard Supabase practice is to call the API Gateway.
SELECT cron.schedule(
  'invoke-deadline-alerts',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
        url:='http://kong:8000/functions/v1/deadline-alerts',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.secret', true) || '"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);
