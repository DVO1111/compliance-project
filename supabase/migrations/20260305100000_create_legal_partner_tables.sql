-- Create legal_partner_profiles table
CREATE TABLE IF NOT EXISTS legal_partner_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_type text NOT NULL CHECK (partner_type IN ('individual', 'firm')),
  firm_name text,
  jurisdictions text[] NOT NULL DEFAULT '{}',
  specialties text[] NOT NULL DEFAULT '{}',
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  hourly_rate numeric NOT NULL DEFAULT 0,
  bio text,
  contact_email text,
  onboarded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE legal_partner_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own partner profile"
  ON legal_partner_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own partner profile"
  ON legal_partner_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own partner profile"
  ON legal_partner_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Also create marketplace_requests and marketplace_connections if missing
CREATE TABLE IF NOT EXISTS marketplace_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  legal_partner_id uuid NOT NULL REFERENCES legal_partner_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  message text,
  partner_reply text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view marketplace requests"
  ON marketplace_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert marketplace requests"
  ON marketplace_requests FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE IF NOT EXISTS marketplace_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  legal_partner_id uuid NOT NULL REFERENCES legal_partner_profiles(id) ON DELETE CASCADE,
  auto_assign_frequency text NOT NULL DEFAULT 'none' CHECK (auto_assign_frequency IN ('monthly', 'on_demand', 'none')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view marketplace connections"
  ON marketplace_connections FOR SELECT TO authenticated USING (true);
