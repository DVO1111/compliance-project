-- Add per-level risk counts to company_risk_posture for richer dashboard display
ALTER TABLE public.company_risk_posture
  ADD COLUMN IF NOT EXISTS critical_risks_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_risks_count     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medium_risks_count   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_risks_count      int NOT NULL DEFAULT 0;
