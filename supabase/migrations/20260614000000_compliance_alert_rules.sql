-- Compliance Alerting Engine — alert rule configuration and firing log
-- Idempotent: all CREATE TABLE / ALTER TABLE statements guarded with IF NOT EXISTS / IF EXISTS

DO $$ BEGIN

  -- ── compliance_alert_rules ─────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'compliance_alert_rules'
  ) THEN
    CREATE TABLE public.compliance_alert_rules (
      id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id        uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      trigger_type      text        NOT NULL
                                    CHECK (trigger_type IN (
                                      'capa_overdue',
                                      'licence_expiring',
                                      'obligation_overdue',
                                      'control_non_compliant',
                                      'deviation_raised'
                                    )),
      threshold_days    int         NOT NULL DEFAULT 7,
      escalation_days   int         NOT NULL DEFAULT 3,
      notify_owner      boolean     NOT NULL DEFAULT true,
      notify_admins     boolean     NOT NULL DEFAULT true,
      notify_email      boolean     NOT NULL DEFAULT true,
      notify_in_app     boolean     NOT NULL DEFAULT true,
      is_active         boolean     NOT NULL DEFAULT true,
      created_by        uuid        REFERENCES auth.users(id),
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),

      UNIQUE (company_id, trigger_type)
    );

    ALTER TABLE public.compliance_alert_rules ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "compliance_alert_rules_select"
      ON public.compliance_alert_rules FOR SELECT
      USING (
        company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
      );

    CREATE POLICY "compliance_alert_rules_modify"
      ON public.compliance_alert_rules FOR ALL
      USING (
        company_id IN (
          SELECT company_id FROM public.profiles
          WHERE id = auth.uid() AND role IN ('Admin', 'Compliance', 'Executive')
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM public.profiles
          WHERE id = auth.uid() AND role IN ('Admin', 'Compliance', 'Executive')
        )
      );

    CREATE TRIGGER compliance_alert_rules_updated_at
      BEFORE UPDATE ON public.compliance_alert_rules
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;

  -- ── compliance_alert_log ───────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'compliance_alert_log'
  ) THEN
    CREATE TABLE public.compliance_alert_log (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      rule_id       uuid        REFERENCES public.compliance_alert_rules(id) ON DELETE SET NULL,
      entity_type   text        NOT NULL,  -- capa | licence | obligation | control | deviation
      entity_id     uuid,                  -- the triggering record id (nullable for bulk scans)
      alert_type    text        NOT NULL,  -- mirrors trigger_type
      message       text        NOT NULL,
      fired_at      timestamptz NOT NULL DEFAULT now(),
      fired_date    date        NOT NULL DEFAULT CURRENT_DATE,
      resolved_at   timestamptz,
      metadata      jsonb       DEFAULT '{}',

      UNIQUE (company_id, entity_id, alert_type, fired_date)
    );

    ALTER TABLE public.compliance_alert_log ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "compliance_alert_log_select"
      ON public.compliance_alert_log FOR SELECT
      USING (
        company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
      );

    CREATE POLICY "compliance_alert_log_insert"
      ON public.compliance_alert_log FOR INSERT
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
      );

    CREATE INDEX idx_compliance_alert_log_company
      ON public.compliance_alert_log (company_id, fired_at DESC);

    CREATE INDEX idx_compliance_alert_log_entity
      ON public.compliance_alert_log (entity_id, alert_type, fired_date);
  END IF;

END $$;
