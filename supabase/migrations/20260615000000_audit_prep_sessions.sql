-- AI-Powered Audit Preparation — evidence package sessions and items
-- Idempotent: all DDL guarded with IF NOT EXISTS

DO $$ BEGIN

  -- ── audit_prep_sessions ────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_prep_sessions'
  ) THEN
    CREATE TABLE public.audit_prep_sessions (
      id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      name            text        NOT NULL,
      audit_type      text        NOT NULL DEFAULT 'internal'
                                  CHECK (audit_type IN (
                                    'gmp','iso','fda','nafdac','son','who','ecju','internal','custom'
                                  )),
      scheduled_date  date,
      inspector_name  text,
      inspector_org   text,
      scope_notes     text,
      status          text        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','assembling','ready','exported')),
      assembled_at    timestamptz,
      ai_summary      text,
      evidence_counts jsonb       NOT NULL DEFAULT '{}',
      created_by      uuid        REFERENCES auth.users(id),
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE public.audit_prep_sessions ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "audit_prep_sessions_select"
      ON public.audit_prep_sessions FOR SELECT
      USING (
        company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
      );

    CREATE POLICY "audit_prep_sessions_modify"
      ON public.audit_prep_sessions FOR ALL
      USING (
        company_id IN (
          SELECT company_id FROM public.profiles
          WHERE id = auth.uid() AND role IN ('Admin','Compliance','Executive','Quality')
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM public.profiles
          WHERE id = auth.uid() AND role IN ('Admin','Compliance','Executive','Quality')
        )
      );

    CREATE INDEX idx_audit_prep_sessions_company
      ON public.audit_prep_sessions (company_id, created_at DESC);

    CREATE TRIGGER audit_prep_sessions_updated_at
      BEFORE UPDATE ON public.audit_prep_sessions
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;

  -- ── audit_prep_items ───────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_prep_items'
  ) THEN
    CREATE TABLE public.audit_prep_items (
      id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id    uuid        NOT NULL REFERENCES public.audit_prep_sessions(id) ON DELETE CASCADE,
      company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      item_type     text        NOT NULL
                                CHECK (item_type IN (
                                  'batch_record','capa','control','certificate',
                                  'sop','policy','obligation','risk','change_control'
                                )),
      source_table  text        NOT NULL,
      source_id     uuid,
      title         text        NOT NULL,
      description   text,
      status        text,
      item_date     date,
      relevance_tag text,
      metadata      jsonb       NOT NULL DEFAULT '{}',
      created_at    timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE public.audit_prep_items ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "audit_prep_items_select"
      ON public.audit_prep_items FOR SELECT
      USING (
        company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
      );

    CREATE POLICY "audit_prep_items_insert"
      ON public.audit_prep_items FOR INSERT
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
      );

    CREATE POLICY "audit_prep_items_delete"
      ON public.audit_prep_items FOR DELETE
      USING (
        company_id IN (
          SELECT company_id FROM public.profiles
          WHERE id = auth.uid() AND role IN ('Admin','Compliance','Executive','Quality')
        )
      );

    CREATE INDEX idx_audit_prep_items_session
      ON public.audit_prep_items (session_id, item_type);

    CREATE INDEX idx_audit_prep_items_company
      ON public.audit_prep_items (company_id, created_at DESC);
  END IF;

END $$;
