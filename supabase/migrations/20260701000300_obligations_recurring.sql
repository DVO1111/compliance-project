-- Obligations Tracker — recurring support
-- Adds recurrence metadata so completing a recurring obligation can auto-generate
-- the next cycle's record.

ALTER TABLE public.regulatory_obligations
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;

ALTER TABLE public.regulatory_obligations
  ADD COLUMN IF NOT EXISTS frequency text
    CHECK (frequency IS NULL OR frequency IN ('weekly','monthly','quarterly','biannual','annual'));

-- Optional: track the due date each cycle targets (nullable; existing rows unaffected).
ALTER TABLE public.regulatory_obligations
  ADD COLUMN IF NOT EXISTS due_date date;
