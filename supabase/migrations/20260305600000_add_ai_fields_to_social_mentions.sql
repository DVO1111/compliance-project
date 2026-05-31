-- Add AI Analysis and Sentiment fields to social_mentions
ALTER TABLE social_mentions 
ADD COLUMN IF NOT EXISTS sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
ADD COLUMN IF NOT EXISTS ai_analysis TEXT,
ADD COLUMN IF NOT EXISTS ai_recommendation TEXT;

-- Update RLS just in case (though it should inherit from table)
-- No changes needed to RLS as it applies to all columns by default
