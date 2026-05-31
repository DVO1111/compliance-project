-- ============================================================================
-- Feature #5: Proactive AI Risk Intelligence & Predictive Compliance Scoring
-- ============================================================================
-- Tables:
--   1. ai_risk_assessments        - cached Gemini-powered deep analyses
--   2. violation_trends            - aggregated violation counts for trend charts
--   3. regulation_impact_reports   - "What will break?" reports
--   4. compliance_benchmarks       - anonymized benchmark stats per company
-- Column additions:
--   content_submissions.ai_risk_score, content_submissions.ai_risk_summary
-- ============================================================================

-- ── 1. AI Risk Assessments ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_risk_assessments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id   uuid NOT NULL REFERENCES content_submissions(id) ON DELETE CASCADE,
    company_id      uuid REFERENCES companies(id) ON DELETE CASCADE,

    -- AI analysis results
    ai_risk_score       integer NOT NULL DEFAULT 0,          -- 0-100
    overall_sentiment   text NOT NULL DEFAULT 'neutral',     -- positive/neutral/negative
    intent_violations   jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{type, description, severity, phrase, regulation_ref}]
    subtle_claims       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- implied cures, superlatives etc.
    recommendations     jsonb NOT NULL DEFAULT '[]'::jsonb,  -- suggested fixes
    summary             text NOT NULL DEFAULT '',
    model_version       text NOT NULL DEFAULT 'gemini-2.0-flash',

    -- Cache management
    content_hash        text,                                 -- hash of content_text for cache invalidation
    expires_at          timestamptz,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_risk_submission ON ai_risk_assessments(submission_id);
CREATE INDEX idx_ai_risk_company    ON ai_risk_assessments(company_id);
CREATE INDEX idx_ai_risk_score      ON ai_risk_assessments(ai_risk_score);

-- ── 2. Violation Trends ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS violation_trends (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    period_start    date NOT NULL,                           -- first day of the month
    period_end      date NOT NULL,                           -- last day of the month
    category        text NOT NULL DEFAULT 'general',         -- violation category (e.g. 'forbidden_claims', 'missing_disclaimer')
    violation_count integer NOT NULL DEFAULT 0,
    severity_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {low:N, medium:N, high:N, critical:N}
    top_phrases     jsonb NOT NULL DEFAULT '[]'::jsonb,      -- top 5 flagged phrases
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE(company_id, period_start, category)
);

CREATE INDEX idx_violation_trends_company ON violation_trends(company_id, period_start DESC);

-- ── 3. Regulation Impact Reports ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS regulation_impact_reports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    regulation_id   uuid,                                    -- which regulation triggered this
    regulation_title text NOT NULL DEFAULT '',

    -- Report content
    affected_count      integer NOT NULL DEFAULT 0,
    affected_items      jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{submission_id, title, severity, reason}]
    summary_narrative   text NOT NULL DEFAULT '',             -- Gemini-generated "What will break" narrative
    risk_distribution   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {high:N, medium:N, low:N}
    status              text NOT NULL DEFAULT 'generated',    -- generated / reviewed / dismissed

    generated_by    uuid,                                    -- user who triggered it, nullable for auto
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_impact_reports_company ON regulation_impact_reports(company_id, created_at DESC);
CREATE INDEX idx_impact_reports_reg     ON regulation_impact_reports(regulation_id);

-- ── 4. Compliance Benchmarks ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS compliance_benchmarks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,

    -- Aggregate stats (anonymized — no content stored)
    total_submissions   integer NOT NULL DEFAULT 0,
    compliant_count     integer NOT NULL DEFAULT 0,
    avg_risk_score      numeric(5,2) NOT NULL DEFAULT 0,
    category_scores     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {pharma: 85, marketing: 72, ...}
    industry_type       text,                                 -- from company profile
    percentile_rank     numeric(5,2),                         -- calculated percentile vs. all tenants

    last_calculated     timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_benchmarks_industry ON compliance_benchmarks(industry_type);
CREATE INDEX idx_benchmarks_rank     ON compliance_benchmarks(percentile_rank DESC);

-- ── Column additions to content_submissions ─────────────────────────────────

ALTER TABLE content_submissions
    ADD COLUMN IF NOT EXISTS ai_risk_score   integer,
    ADD COLUMN IF NOT EXISTS ai_risk_summary text;

-- ── RLS policies ────────────────────────────────────────────────────────────

ALTER TABLE ai_risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE violation_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulation_impact_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_benchmarks ENABLE ROW LEVEL SECURITY;

-- ai_risk_assessments: company-scoped
CREATE POLICY "ai_risk_assessments_company_scope"
    ON ai_risk_assessments FOR ALL
    USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

-- violation_trends: company-scoped
CREATE POLICY "violation_trends_company_scope"
    ON violation_trends FOR ALL
    USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

-- regulation_impact_reports: company-scoped
CREATE POLICY "impact_reports_company_scope"
    ON regulation_impact_reports FOR ALL
    USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

-- compliance_benchmarks: own company for write, all for read (anonymized)
CREATE POLICY "benchmarks_own_company_write"
    ON compliance_benchmarks FOR ALL
    USING (
        company_id IN (
            SELECT company_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "benchmarks_read_all"
    ON compliance_benchmarks FOR SELECT
    USING (true);
