-- Expands regulatory intelligence to support circulars/guidelines/advisories/enforcement/news
-- Safe to run multiple times.

-- Add jurisdiction to regulations (if you decide to store jurisdiction per regulation)
ALTER TABLE public.regulations
ADD COLUMN IF NOT EXISTS jurisdiction text DEFAULT 'all';

-- Expand regulatory_circulars with intelligence fields
ALTER TABLE public.regulatory_circulars
ADD COLUMN IF NOT EXISTS jurisdiction text DEFAULT 'all',
ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'circular',
ADD COLUMN IF NOT EXISTS topics text[],
ADD COLUMN IF NOT EXISTS source_url text,
ADD COLUMN IF NOT EXISTS effective_date date;

-- Index for fast filtering by jurisdiction
CREATE INDEX IF NOT EXISTS idx_reg_circulars_jurisdiction
  ON public.regulatory_circulars (jurisdiction);

CREATE INDEX IF NOT EXISTS idx_regulations_jurisdiction
  ON public.regulations (jurisdiction);
