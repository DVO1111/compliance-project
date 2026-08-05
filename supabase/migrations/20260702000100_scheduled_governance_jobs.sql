-- Scheduled Governance Jobs (pg_cron)
--
-- Owner: engineering (100%). Runs the recurring compliance sweeps that the app
-- has logic for but nothing was invoking on a schedule — chiefly escalating
-- overdue regulatory obligations into CAPAs (mirrors
-- obligationService.escalateOverdueObligations, but server-side & deterministic).
--
-- PREREQUISITE: the `pg_cron` extension must be enabled on the project. On
-- Supabase this requires a role with the right to CREATE EXTENSION (dashboard:
-- Database → Extensions → pg_cron). It is already used by
-- 20260301000000_calendar_deadline_reminders.sql, so it should be present.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Sweep: overdue obligations → CAPA ────────────────────────────────────────
-- SECURITY DEFINER so the cron session (no JWT) can read/write across companies.
-- Idempotent: one open CAPA per overdue obligation (deduped by title).
CREATE OR REPLACE FUNCTION public.sweep_overdue_obligations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ob            record;
  created_count integer := 0;
  v_capa_number text;
BEGIN
  FOR ob IN
    SELECT o.id, o.company_id, o.title, o.description, o.jurisdiction, o.category, o.due_date
    FROM regulatory_obligations o
    WHERE o.status = 'identified'
      AND o.due_date IS NOT NULL
      AND o.due_date < current_date
  LOOP
    -- Dedup against an existing open CAPA for the same obligation.
    IF EXISTS (
      SELECT 1 FROM capa_records c
      WHERE c.company_id = ob.company_id
        AND c.title = 'Overdue Obligation: ' || ob.title
        AND c.status <> 'closed'
    ) THEN
      CONTINUE;
    END IF;

    v_capa_number := 'CAPA-' || to_char(now(), 'YYYY') || '-' ||
                     lpad(((floor(random() * 9999) + 1)::int)::text, 4, '0');

    INSERT INTO capa_records (
      company_id, capa_number, title, description,
      source, capa_type, priority, status, due_date, created_by
    ) VALUES (
      ob.company_id,
      v_capa_number,
      'Overdue Obligation: ' || ob.title,
      'Regulatory obligation "' || ob.title || '" (' ||
        coalesce(ob.jurisdiction, '—') || ' / ' || coalesce(ob.category, '—') ||
        ') was due on ' || ob.due_date ||
        ' and remains in ''identified'' status. Immediate action required to implement or formally acknowledge this obligation.',
      'regulatory_action', 'corrective', 'high', 'open', ob.due_date, NULL
    );

    created_count := created_count + 1;
  END LOOP;

  RETURN created_count;
END;
$$;

-- Restrict who can call it directly (cron runs as the function owner regardless).
REVOKE ALL ON FUNCTION public.sweep_overdue_obligations() FROM PUBLIC;

-- ── Schedule: daily at 02:00 UTC ─────────────────────────────────────────────
-- Unschedule first so re-running the migration is idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('sweep-overdue-obligations');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job did not exist yet
END $$;

SELECT cron.schedule(
  'sweep-overdue-obligations',
  '0 2 * * *',
  $$ SELECT public.sweep_overdue_obligations(); $$
);
