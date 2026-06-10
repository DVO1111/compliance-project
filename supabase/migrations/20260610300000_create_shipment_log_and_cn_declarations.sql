-- ============================================================
-- A4: Shipment Event Log tables
-- A5: CN22/CN23 Declaration Logger table
-- ============================================================

-- ── shipments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shipments (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL,
  reference            text        NOT NULL,
  description          text,
  origin_country       text        NOT NULL DEFAULT 'GB',
  destination_country  text        NOT NULL DEFAULT 'NG',
  sender_name          text,
  recipient_name       text,
  service_type         text        NOT NULL DEFAULT 'Air Freight',
  status               text        NOT NULL DEFAULT 'created'
    CHECK (status IN (
      'created','collected','in_transit','customs_hold','cleared',
      'out_for_delivery','delivered','returned','exception'
    )),
  weight_kg            numeric(10,3),
  declared_value_gbp   numeric(10,2),
  created_by           uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reference)
);

-- ── shipment_events ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shipment_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL,
  shipment_id  uuid        NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  event_type   text        NOT NULL,
  location     text,
  notes        text,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── cn_declarations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cn_declarations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL,
  shipment_id          uuid        REFERENCES public.shipments(id) ON DELETE SET NULL,
  shipment_ref         text        NOT NULL,
  declaration_type     text        NOT NULL CHECK (declaration_type IN ('CN22', 'CN23')),
  sender_name          text        NOT NULL,
  sender_address       text,
  recipient_name       text        NOT NULL,
  recipient_address    text,
  contents_description text        NOT NULL,
  reason_for_export    text        NOT NULL
    CHECK (reason_for_export IN (
      'gift','sale','commercial_sample','documents','returned_goods','other'
    )),
  items                jsonb       NOT NULL DEFAULT '[]',
  total_value_gbp      numeric(10,2) NOT NULL DEFAULT 0,
  total_weight_kg      numeric(10,3) NOT NULL DEFAULT 0,
  is_flagged           boolean     NOT NULL DEFAULT false,
  flag_reason          text,
  created_by           uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_shipments_company_id
  ON public.shipments(company_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status
  ON public.shipments(company_id, status);
CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment_id
  ON public.shipment_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_events_company_id
  ON public.shipment_events(company_id);
CREATE INDEX IF NOT EXISTS idx_cn_declarations_company_id
  ON public.cn_declarations(company_id);
CREATE INDEX IF NOT EXISTS idx_cn_declarations_flagged
  ON public.cn_declarations(company_id, is_flagged);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.shipments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cn_declarations  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_iso_shipments" ON public.shipments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = shipments.company_id
    )
  );

CREATE POLICY "company_iso_shipment_events" ON public.shipment_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = shipment_events.company_id
    )
  );

CREATE POLICY "company_iso_cn_declarations" ON public.cn_declarations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = cn_declarations.company_id
    )
  );
