/*
  Watchdog Background Agent — Database Schema

  1. Create `watchdog_alerts` table to track flagged documents
  2. Create `notifications` table (if not exists) for the notification bell
  3. Expand `content_submissions.status` CHECK to include 'reverification_required'
*/

-- ── 1. watchdog_alerts ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watchdog_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id      uuid NOT NULL REFERENCES content_submissions(id) ON DELETE CASCADE,
  regulation_id   uuid REFERENCES regulations(id) ON DELETE SET NULL,
  trigger_type    text NOT NULL CHECK (trigger_type IN ('new_regulation', 'daily_brief')),
  matched_phrases jsonb DEFAULT '[]'::jsonb,
  status          text DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  resolved_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE watchdog_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view watchdog alerts"
  ON watchdog_alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert watchdog alerts"
  ON watchdog_alerts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update watchdog alerts"
  ON watchdog_alerts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_watchdog_alerts_content_id ON watchdog_alerts(content_id);
CREATE INDEX IF NOT EXISTS idx_watchdog_alerts_status ON watchdog_alerts(status);
CREATE INDEX IF NOT EXISTS idx_watchdog_alerts_created_at ON watchdog_alerts(created_at DESC);

-- ── 2. notifications (if not exists) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type          text,
  content_id    uuid,
  message       text,
  read_at       timestamptz,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies (use IF NOT EXISTS pattern via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can view own notifications'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Authenticated can insert notifications'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated can insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users can update own notifications'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid())';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ── 3. Expand content_submissions.status constraint ─────────────────────

ALTER TABLE content_submissions
  DROP CONSTRAINT IF EXISTS content_submissions_status_check;

ALTER TABLE content_submissions
  ADD CONSTRAINT content_submissions_status_check
  CHECK (status IN ('pending', 'approved', 'flagged', 'critical', 'reverification_required'));
