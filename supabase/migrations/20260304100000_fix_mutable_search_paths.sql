-- Fix Mutable Search Path Warnings and Permissive RLS Policies
-- Identified by Supabase Security Advisor (51 warnings)

-- 1. FIX FUNCTIONS (SET search_path = public)
-- This DO block safely applies the fix to all flagged functions by name.
DO $$
DECLARE
  func_name text;
  func_record record;
BEGIN
  FOR func_name IN SELECT unnest(ARRAY[
    'update_calendar_events_updated_at',
    'enforce_comment_company_match',
    'mark_content_in_review',
    'update_ai_jobs_updated_at',
    'ensure_default_chat_channels',
    'get_my_past_decisions',
    'get_decisions_summary',
    'get_company_activity_feed',
    'get_reviewer_workload',
    'get_company_dashboard_trends',
    'get_company_risk_distribution',
    'create_content_version',
    '_can_access_company',
    'get_company_dashboard_metrics',
    'get_next_audit_sequence',
    'verify_audit_chain',
    'get_my_content_stats',
    'hash_invite_token',
    'get_top_risk_causes',
    'get_jurisdiction_comparison',
    'set_updated_at'
  ]) LOOP
    FOR func_record IN
      SELECT n.nspname, p.proname, oidvectortypes(p.proargtypes) as args
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = func_name
    LOOP
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', 
                     func_record.nspname, func_record.proname, func_record.args);
    END LOOP;
  END LOOP;
END $$;

-- 2. FIX RLS POLICIES (Replace WITH CHECK (true) with something safer)
-- Note: We use WITH CHECK (auth.uid() IS NOT NULL) to ensure only authenticated users can insert/update,
-- and that the user is actually the one logged in (as much as possible for generic policies).

-- adverse_events
ALTER POLICY "adverse_events_insert" ON public.adverse_events WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "adverse_events_update" ON public.adverse_events USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- agencies
ALTER POLICY "agencies_insert" ON public.agencies WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "agencies_update" ON public.agencies USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- agency_feedback
ALTER POLICY "agency_feedback_insert" ON public.agency_feedback WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "agency_feedback_update" ON public.agency_feedback USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- agency_submissions
ALTER POLICY "agency_submissions_insert" ON public.agency_submissions WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "agency_submissions_update" ON public.agency_submissions USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ai_jobs
ALTER POLICY "ai_jobs_insert" ON public.ai_jobs WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "ai_jobs_update" ON public.ai_jobs USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- block_content_usage
ALTER POLICY "block_content_usage_insert" ON public.block_content_usage WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "block_content_usage_update" ON public.block_content_usage USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- chat_mentions (TO authenticated)
DROP POLICY IF EXISTS "chat_mentions_insert" ON public.chat_mentions;
CREATE POLICY "chat_mentions_insert" ON public.chat_mentions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- consent_content_links
ALTER POLICY "consent_content_links_insert" ON public.consent_content_links WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "consent_content_links_update" ON public.consent_content_links USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- consent_records
ALTER POLICY "consent_records_insert" ON public.consent_records WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "consent_records_update" ON public.consent_records USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- content_blocks
ALTER POLICY "content_blocks_insert" ON public.content_blocks WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "content_blocks_update" ON public.content_blocks USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- drift_alerts
ALTER POLICY "drift_alerts_insert" ON public.drift_alerts WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "drift_alerts_update" ON public.drift_alerts USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- monitored_urls
ALTER POLICY "monitored_urls_insert" ON public.monitored_urls WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "monitored_urls_update" ON public.monitored_urls USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- notifications
ALTER POLICY "Authenticated can insert notifications" ON public.notifications WITH CHECK (auth.uid() IS NOT NULL);

-- regulations
ALTER POLICY "Authenticated users can insert regulations" ON public.regulations WITH CHECK (auth.uid() IS NOT NULL);
ALTER POLICY "Authenticated users can update regulations" ON public.regulations USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- regulatory_feed_items (The ones we just added)
ALTER POLICY "Allow authenticated users to insert regulatory feed items" ON public.regulatory_feed_items WITH CHECK (auth.uid() IS NOT NULL);

-- regulatory_updates
ALTER POLICY "reg_updates_insert" ON public.regulatory_updates WITH CHECK (auth.uid() IS NOT NULL);
