-- Migration to fix RLS error on regulatory_feed_items
-- Created: 2026-03-04

-- 1. Enable Row Level Security
ALTER TABLE public.regulatory_feed_items ENABLE ROW LEVEL SECURITY;

-- 2. Create policy to allow authenticated users to read items
-- This follows the pattern of other reference feeds in the project
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'regulatory_feed_items' 
          AND policyname = 'Allow authenticated users to read regulatory feed items'
    ) THEN
        CREATE POLICY "Allow authenticated users to read regulatory feed items"
        ON public.regulatory_feed_items
        FOR SELECT
        TO authenticated
        USING (auth.uid() IS NOT NULL);
    END IF;
END
$$;

-- 3. (Optional) If this table is populated via edge functions, 
-- ensure they can still insert/update. Most edge functions in this project
-- use service_role, but some might need explicit policies.
-- Adding a broad insert policy for authenticated users if needed, 
-- or keeping it restricted depending on the crawler logic.
-- Based on compliance_engine_v2.sql, we usually allow authenticated insert for flexibility.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'regulatory_feed_items' 
          AND policyname = 'Allow authenticated users to insert regulatory feed items'
    ) THEN
        CREATE POLICY "Allow authenticated users to insert regulatory feed items"
        ON public.regulatory_feed_items
        FOR INSERT
        TO authenticated
        WITH CHECK (true);
    END IF;
END
$$;
