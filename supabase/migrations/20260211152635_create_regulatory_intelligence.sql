/*
  # Create Regulatory Intelligence Table

  1. New Tables
    - `regulatory_circulars`
      - `id` (uuid, primary key)
      - `source` (text) - Regulatory body: NAFDAC, FDA, WHO
      - `circular_number` (text) - Official circular reference number
      - `title` (text) - Circular title
      - `summary` (text) - 2-sentence AI-generated summary
      - `product_categories` (text[]) - Applicable categories: Drugs, Medical Devices, Cosmetics
      - `severity` (text) - Impact level: high, medium, low
      - `published_date` (timestamptz) - Date the circular was published
      - `is_active` (boolean) - Whether the circular is still in effect
      - `created_at` (timestamptz) - Record creation timestamp

  2. Security
    - Enable RLS on `regulatory_circulars` table
    - Add SELECT policy for authenticated users to read circulars
    - Circulars are read-only reference data accessible to all authenticated users
*/

CREATE TABLE IF NOT EXISTS regulatory_circulars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  circular_number text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  product_categories text[] NOT NULL DEFAULT '{}',
  severity text NOT NULL DEFAULT 'medium',
  published_date timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE regulatory_circulars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read regulatory circulars"
  ON regulatory_circulars
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);
