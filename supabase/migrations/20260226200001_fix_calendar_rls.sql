-- ============================================================
-- FIX: Calendar RLS policies were using raw_user_meta_data
-- instead of the profiles table. Drop and recreate them.
-- Run this in your Supabase SQL editor if you already ran the
-- original migration.
-- ============================================================

-- Drop old policies
DROP POLICY IF EXISTS calendar_events_select ON public.calendar_events;
DROP POLICY IF EXISTS calendar_events_insert ON public.calendar_events;
DROP POLICY IF EXISTS calendar_events_update ON public.calendar_events;
DROP POLICY IF EXISTS calendar_reminders_select ON public.calendar_reminders;
DROP POLICY IF EXISTS calendar_reminders_insert ON public.calendar_reminders;

-- Recreate with correct profiles-based lookup
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
