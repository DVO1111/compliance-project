-- Fix RLS policies on the regulations table to allow any authenticated user to insert/update.
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor).

-- Drop the restrictive admin-only policies
DROP POLICY IF EXISTS "Admins can insert regulations" ON regulations;
DROP POLICY IF EXISTS "Admins can update regulations" ON regulations;

-- Create new policies that allow any authenticated user to insert and update
CREATE POLICY "Authenticated users can insert regulations"
  ON regulations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update regulations"
  ON regulations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
