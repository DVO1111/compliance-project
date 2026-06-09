-- ============================================================
-- Fix: contraband_rejection_log and customer_flags used
-- auth.users(id) as FK target for reporter_id / flagged_by.
-- PostgREST cannot expose auth.users; change to public.profiles
-- so embedded resource joins work (profiles.id = auth.uid()).
-- ============================================================

-- ── contraband_rejection_log.reporter_id ─────────────────────
ALTER TABLE public.contraband_rejection_log
  DROP CONSTRAINT IF EXISTS contraband_rejection_log_reporter_id_fkey;

ALTER TABLE public.contraband_rejection_log
  ADD CONSTRAINT contraband_rejection_log_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ── customer_flags.flagged_by ─────────────────────────────────
ALTER TABLE public.customer_flags
  DROP CONSTRAINT IF EXISTS customer_flags_flagged_by_fkey;

ALTER TABLE public.customer_flags
  ADD CONSTRAINT customer_flags_flagged_by_fkey
  FOREIGN KEY (flagged_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
