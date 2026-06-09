-- ============================================================
-- A2: Contraband Rejection Workflow
-- A3: Customer / Sender Blacklist and Flagging
--
-- Provides a structured intake-to-rejection workflow for courier
-- companies, plus persistent flagging of repeat-offender senders.
-- Both tables are company-scoped with RLS.
-- ============================================================

-- ── A2: Contraband Rejection Log ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.contraband_rejection_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid        NOT NULL,
  shipment_ref      text        NOT NULL,
  rejection_date    timestamptz NOT NULL DEFAULT now(),
  items_found       text[]      NOT NULL DEFAULT '{}',
  rejection_reason  text        NOT NULL,
  description       text,
  reporter_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name     text,
  customer_email    text,
  customer_phone    text,
  customer_flagged  boolean     NOT NULL DEFAULT false,
  status            text        NOT NULL DEFAULT 'rejected'
    CHECK (status IN ('pending', 'rejected', 'escalated')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crl_company
  ON public.contraband_rejection_log (company_id);

CREATE INDEX IF NOT EXISTS idx_crl_company_date
  ON public.contraband_rejection_log (company_id, rejection_date DESC);

CREATE INDEX IF NOT EXISTS idx_crl_shipment_ref
  ON public.contraband_rejection_log (company_id, shipment_ref);

ALTER TABLE public.contraband_rejection_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members manage contraband rejections"
  ON public.contraband_rejection_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = contraband_rejection_log.company_id
    )
  );

-- ── A3: Customer / Sender Blacklist ───────────────────────────

CREATE TABLE IF NOT EXISTS public.customer_flags (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL,
  customer_name        text        NOT NULL,
  identifier_type      text        NOT NULL
    CHECK (identifier_type IN ('email', 'phone', 'name', 'id_number', 'other')),
  identifier_value     text        NOT NULL,
  flag_type            text        NOT NULL DEFAULT 'contraband'
    CHECK (flag_type IN ('contraband', 'fraud', 'repeat_offender', 'other')),
  flag_reason          text        NOT NULL,
  flagged_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  related_rejection_id uuid        REFERENCES public.contraband_rejection_log(id) ON DELETE SET NULL,
  status               text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cleared', 'escalated')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, identifier_type, identifier_value)
);

CREATE INDEX IF NOT EXISTS idx_cf_company
  ON public.customer_flags (company_id);

CREATE INDEX IF NOT EXISTS idx_cf_company_status
  ON public.customer_flags (company_id, status);

CREATE INDEX IF NOT EXISTS idx_cf_identifier
  ON public.customer_flags (company_id, identifier_type, identifier_value);

ALTER TABLE public.customer_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members manage customer flags"
  ON public.customer_flags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = customer_flags.company_id
    )
  );
