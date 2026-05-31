-- ============================================================
-- Migration: Content Calendar with Smart Reminders
-- Tables: calendar_events, calendar_reminders
-- ============================================================

-- ── calendar_events ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid NOT NULL,
  submission_id             uuid NOT NULL,
  event_type                text NOT NULL DEFAULT 'marketing_publish'
    CHECK (event_type IN ('marketing_publish', 'legal_review')),
  title                     text NOT NULL DEFAULT '',
  scheduled_at              timestamptz NOT NULL DEFAULT now(),
  is_auto_dated             boolean NOT NULL DEFAULT false,
  needs_schedule_confirmation boolean NOT NULL DEFAULT false,
  legal_planned_at          timestamptz,
  legal_acknowledged        boolean NOT NULL DEFAULT false,
  status                    text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'overdue')),
  created_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_calendar_events_company
  ON public.calendar_events (company_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_submission
  ON public.calendar_events (submission_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type
  ON public.calendar_events (company_id, event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_scheduled
  ON public.calendar_events (company_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status
  ON public.calendar_events (company_id, status);

-- ── calendar_reminders ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calendar_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  reminder_type   text NOT NULL
    CHECK (reminder_type IN ('24h', '5h', 'legal_followup', 'legal_unattended')),
  sent_at         timestamptz NOT NULL DEFAULT now(),
  recipient_id    uuid NOT NULL,
  message         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_reminders_event
  ON public.calendar_reminders (event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_recipient
  ON public.calendar_reminders (recipient_id);

-- Prevent duplicate reminders of the same type for the same event/recipient
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_reminders_unique
  ON public.calendar_reminders (event_id, reminder_type, recipient_id);

-- ── Row-Level Security ──────────────────────────────────────
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_reminders ENABLE ROW LEVEL SECURITY;

-- calendar_events: company-scoped via profiles table
CREATE POLICY calendar_events_select ON public.calendar_events
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY calendar_events_insert ON public.calendar_events
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY calendar_events_update ON public.calendar_events
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- calendar_reminders: accessible if the event is accessible
CREATE POLICY calendar_reminders_select ON public.calendar_reminders
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM public.calendar_events WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY calendar_reminders_insert ON public.calendar_reminders
  FOR INSERT WITH CHECK (
    event_id IN (
      SELECT id FROM public.calendar_events WHERE company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- ── Auto-update timestamp trigger ───────────────────────────
CREATE OR REPLACE FUNCTION public.update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_calendar_events_updated_at();
