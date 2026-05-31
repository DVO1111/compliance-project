/*
  LMS Lite — Training Log Schema

  Stores daily quiz responses so they can be printed as an audit-ready
  training log during regulatory inspections.
*/

-- ── training_responses ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id      uuid,
  question_id     text NOT NULL,          -- references hardcoded question bank
  selected_answer int  NOT NULL,          -- 0-based option index
  is_correct      boolean NOT NULL,
  answered_at     timestamptz DEFAULT now()
);

ALTER TABLE training_responses ENABLE ROW LEVEL SECURITY;

-- Users can view their own responses
CREATE POLICY "Users can view own training responses"
  ON training_responses FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Company-mates can view each other's for audit reports
CREATE POLICY "Company mates can view training responses"
  ON training_responses FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can insert their own responses
CREATE POLICY "Users can insert own training responses"
  ON training_responses FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_training_responses_user_id ON training_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_training_responses_company_id ON training_responses(company_id);
CREATE INDEX IF NOT EXISTS idx_training_responses_answered_at ON training_responses(answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_responses_question_id ON training_responses(question_id);
