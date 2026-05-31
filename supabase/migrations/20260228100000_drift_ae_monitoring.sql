-- Migration: Drift & Adverse Event Monitoring
-- Tables for omnichannel content drift detection and adverse event sentinel

-- Monitored Channels
CREATE TABLE IF NOT EXISTS public.monitored_channels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  channel_name text NOT NULL,
  channel_type text NOT NULL CHECK (channel_type IN ('website','instagram','linkedin','x','facebook','email','print','landing_page')),
  url text,
  approved_content_hash text,
  approved_content_snapshot text,
  last_checked_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.monitored_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monitored_channels_company_access" ON public.monitored_channels;
CREATE POLICY "monitored_channels_company_access"
  ON public.monitored_channels FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Drift Alerts
CREATE TABLE IF NOT EXISTS public.drift_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.monitored_channels(id) ON DELETE CASCADE,
  drift_type text NOT NULL DEFAULT 'content_change' CHECK (drift_type IN ('content_change','disclaimer_removed','link_broken','element_missing')),
  approved_hash text,
  current_hash text,
  diff_summary text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  detected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drift_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drift_alerts_company_access" ON public.drift_alerts;
CREATE POLICY "drift_alerts_company_access"
  ON public.drift_alerts FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Adverse Events
CREATE TABLE IF NOT EXISTS public.adverse_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  channel_id uuid REFERENCES public.monitored_channels(id) ON DELETE SET NULL,
  source_text text NOT NULL,
  detected_phrase text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected','quarantined','reported','dismissed')),
  reporter_notes text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.adverse_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "adverse_events_company_access" ON public.adverse_events;
CREATE POLICY "adverse_events_company_access"
  ON public.adverse_events FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
