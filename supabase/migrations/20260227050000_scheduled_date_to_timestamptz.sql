-- Migration: Change content_submissions.scheduled_date from 'date' to 'timestamptz'
-- This is required so that scheduled publishing times (not just dates) are preserved.
-- Previously, the column was 'date' type which stripped all time info on insert,
-- causing every event to show midnight UTC (1:00 AM WAT) regardless of user's chosen time.

ALTER TABLE content_submissions
  ALTER COLUMN scheduled_date TYPE timestamptz
  USING scheduled_date::timestamptz;

-- Add a comment explaining the column
COMMENT ON COLUMN content_submissions.scheduled_date IS 'Full scheduled publish datetime (with timezone). Originally was date-only, migrated to timestamptz to preserve marketing user scheduling times.';
